import type { ApolloServer } from '@apollo/server';
import express, { Router, type Request, type Response } from 'express';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { AUTH_COOKIE, verifySession } from '../auth/tokens.js';
import type { Env } from '../config.js';
import type { Db } from '../db.js';
import type { Context } from '../graphql/context.js';
import { graphqlAs } from '../graphql/run.js';
import { localDate } from '../lib/time.js';
import { defineTools, ToolError } from '../mcp/tools.js';
import type { Storage } from '../storage.js';
import { runAssistant, SUGGEST_TOOLS, type AssistantEvent } from './agent.js';
import { voyageEmbedder, type Embedder } from './embeddings.js';
import { searchTrip, syncTrip } from './search.js';

const Ask = z.object({
  question: z.string().trim().min(1).max(2000),
  history: z
    .array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().max(8000) }))
    .max(20)
    .default([]),
});

const Confirm = z.object({
  tool: z.enum(Object.values(SUGGEST_TOOLS) as [string, ...string[]]),
  args: z.record(z.string(), z.unknown()),
});

const today = () => new Date(new Date().toISOString().slice(0, 10));

/**
 * The in-app trip assistant (cookie session, trip members only):
 *   GET  /api/trips/:tripId/assistant          → { enabled, semantic, remaining, limit }
 *   POST /api/trips/:tripId/assistant/ask      → Server-Sent Events (see AssistantEvent)
 *   POST /api/trips/:tripId/assistant/confirm  → runs a write the user confirmed on a card
 */
export function assistantRouter(opts: {
  env: Env;
  db: Db;
  storage: Storage;
  apollo: ApolloServer<Context>;
  fetch?: typeof fetch;
}): Router {
  const { env, db, storage, apollo } = opts;
  const router = Router();
  const enabled = Boolean(env.ANTHROPIC_API_KEY);
  const embedder: Embedder | null = env.VOYAGE_API_KEY
    ? voyageEmbedder({ apiKey: env.VOYAGE_API_KEY, model: env.VOYAGE_MODEL, fetch: opts.fetch })
    : null;

  /** Signed-in trip member, or an error response. */
  async function member(req: Request, res: Response) {
    const userId = verifySession(req.cookies?.[AUTH_COOKIE] as string | undefined, env.JWT_SECRET);
    if (!userId) {
      res.status(401).json({ error: 'You must be signed in.' });
      return null;
    }
    const tripId = String(req.params.tripId);
    const m = z.uuid().safeParse(tripId).success
      ? await db.tripMember.findUnique({
          where: { tripId_userId: { tripId, userId } },
          include: { user: { select: { name: true } }, trip: true },
        })
      : null;
    if (!m) {
      res.status(404).json({ error: 'Trip not found.' });
      return null;
    }
    return m;
  }

  async function remaining(userId: string) {
    const day = today();
    const [mine, site] = await Promise.all([
      db.assistantUsage.findUnique({ where: { day_userId: { day, userId } } }),
      db.assistantUsage.aggregate({ where: { day }, _sum: { questions: true } }),
    ]);
    return Math.max(
      0,
      Math.min(
        env.ASSISTANT_DAILY_QUESTIONS - (mine?.questions ?? 0),
        env.ASSISTANT_SITE_DAILY_QUESTIONS - (site._sum.questions ?? 0),
      ),
    );
  }

  router.get('/api/trips/:tripId/assistant', async (req, res) => {
    const m = await member(req, res);
    if (!m) return;
    res.json({
      enabled,
      semantic: embedder !== null,
      remaining: enabled ? await remaining(m.userId) : 0,
      limit: env.ASSISTANT_DAILY_QUESTIONS,
    });
  });

  router.post(
    '/api/trips/:tripId/assistant/ask',
    rateLimit({ windowMs: 60_000, limit: 10, standardHeaders: 'draft-8', legacyHeaders: false }),
    express.json({ limit: '256kb' }),
    async (req, res) => {
      const m = await member(req, res);
      if (!m) return;
      if (!enabled) {
        res.status(503).json({ error: 'The assistant is not set up on this server.' });
        return;
      }
      const parsed = Ask.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'Ask a question (up to 2,000 characters).' });
        return;
      }
      if ((await remaining(m.userId)) <= 0) {
        res
          .status(429)
          .json({ error: 'You’ve reached today’s assistant limit. It resets at midnight UTC.' });
        return;
      }
      const day = today();
      await db.assistantUsage.upsert({
        where: { day_userId: { day, userId: m.userId } },
        create: { day, userId: m.userId, questions: 1 },
        update: { questions: { increment: 1 } },
      });

      res.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      });
      const emit = (event: AssistantEvent) => {
        if (!res.writableEnded) res.write(`data: ${JSON.stringify(event)}\n\n`);
      };

      const disconnected = new AbortController();
      res.on('close', () => {
        if (!res.writableEnded) disconnected.abort();
      });

      try {
        emit({ type: 'status', text: 'Reading the trip…' });
        await syncTrip(db, m.tripId, embedder);
        const gql = graphqlAs({ apollo, db, env, storage, viewerId: m.userId, auth: 'session' });
        const usage = await runAssistant({
          apiKey: env.ANTHROPIC_API_KEY!,
          model: env.ASSISTANT_MODEL ?? env.ANTHROPIC_MODEL,
          fetch: opts.fetch,
          trip: {
            id: m.tripId,
            name: m.trip.name,
            timeZone: m.trip.timeZone,
            today: localDate(new Date(), m.trip.timeZone),
            viewerName: m.user.name,
            role: m.role,
          },
          tools: defineTools(gql, m.userId),
          search: (q) => searchTrip(db, m.tripId, q, embedder),
          history: parsed.data.history,
          question: parsed.data.question,
          emit,
          signal: disconnected.signal,
        });
        await db.assistantUsage.update({
          where: { day_userId: { day, userId: m.userId } },
          data: {
            inputTokens: { increment: usage.inputTokens },
            outputTokens: { increment: usage.outputTokens },
          },
        });
        emit({ type: 'done', ...usage });
      } catch (err) {
        if (disconnected.signal.aborted) return;
        console.error('Assistant failed', err);
        emit({ type: 'error', message: 'The assistant ran into a problem. Please try again.' });
      }
      res.end();
    },
  );

  router.post('/api/trips/:tripId/assistant/confirm', express.json(), async (req, res) => {
    const m = await member(req, res);
    if (!m) return;
    const parsed = Confirm.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Unknown action.' });
      return;
    }
    // The same tool the MCP server exposes, run as this user: roles and validation apply.
    const gql = graphqlAs({ apollo, db, env, storage, viewerId: m.userId, auth: 'session' });
    const tool = defineTools(gql, m.userId).find((t) => t.name === parsed.data.tool)!;
    const args = z.object(tool.inputSchema).safeParse({ ...parsed.data.args, tripId: m.tripId });
    if (!args.success) {
      res.status(400).json({ error: args.error.issues[0]?.message ?? 'Invalid details.' });
      return;
    }
    try {
      res.json({ result: await tool.run(args.data as Record<string, unknown>) });
    } catch (err) {
      if (err instanceof ToolError) {
        res.status(400).json({ error: err.message });
        return;
      }
      throw err;
    }
  });

  return router;
}
