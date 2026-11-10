/**
 * The trip assistant end to end against the seeded database: indexing into pgvector, hybrid
 * search, the agent loop over Claude's streaming API, suggestion cards, confirm, and daily caps.
 * Claude and Voyage are replaced by scripted fakes that speak their real wire formats.
 * Run with:  pnpm db:seed && pnpm --filter @tripwise/api test:integration
 */
import 'dotenv/config';
import { createHash } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp, type App } from '../src/app.js';
import { loadEnv } from '../src/config.js';
import { createDb, type Db } from '../src/db.js';
import { MemoryStorage } from '../src/storage.js';

const run = process.env.INTEGRATION === '1';

/** Bag-of-words vectors: texts sharing words are close, like a (very) small embedding model. */
function fakeEmbedding(text: string): number[] {
  const v = new Array<number>(1024).fill(0);
  for (const w of text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []) {
    v[createHash('md5').update(w).digest().readUInt16BE(0) % 1024]! += 1;
  }
  const norm = Math.hypot(...v) || 1;
  return v.map((x) => x / norm);
}

type Block = { type: 'text'; text: string } | { type: 'tool_use'; name: string; input: unknown };

/** A Messages API streaming response, frame by frame. */
function sse(blocks: Block[]): Response {
  const frames: unknown[] = [
    { type: 'message_start', message: { usage: { input_tokens: 100, output_tokens: 1 } } },
  ];
  blocks.forEach((b, index) => {
    if (b.type === 'text') {
      frames.push({
        type: 'content_block_start',
        index,
        content_block: { type: 'text', text: '' },
      });
      for (const piece of b.text.match(/.{1,12}/gs) ?? [])
        frames.push({
          type: 'content_block_delta',
          index,
          delta: { type: 'text_delta', text: piece },
        });
    } else {
      frames.push({
        type: 'content_block_start',
        index,
        content_block: { type: 'tool_use', id: `tu_${index}_${b.name}`, name: b.name, input: {} },
      });
      const json = JSON.stringify(b.input);
      frames.push({
        type: 'content_block_delta',
        index,
        delta: { type: 'input_json_delta', partial_json: json.slice(0, 5) },
      });
      frames.push({
        type: 'content_block_delta',
        index,
        delta: { type: 'input_json_delta', partial_json: json.slice(5) },
      });
    }
    frames.push({ type: 'content_block_stop', index });
  });
  const toolUse = blocks.some((b) => b.type === 'tool_use');
  frames.push({
    type: 'message_delta',
    delta: { stop_reason: toolUse ? 'tool_use' : 'end_turn' },
    usage: { output_tokens: 20 },
  });
  frames.push({ type: 'message_stop' });
  const body = frames.map((f) => `event: x\ndata: ${JSON.stringify(f)}\n\n`).join('');
  return new Response(body, { headers: { 'content-type': 'text/event-stream' } });
}

interface ClaudeRequest {
  tools: { name: string; input_schema: { properties?: Record<string, unknown> } }[];
  messages: { role: string; content: any }[];
}

describe.runIf(run)('Trip assistant', () => {
  let db: Db;
  let server: App;
  let tripId = '';
  const requests: ClaudeRequest[] = [];
  const created = { expenses: [] as string[], attachments: [] as string[] };
  let voyageCalls = 0;

  /** Scripted Claude: picks a path from the question, then answers from the tool results. */
  function claude(body: ClaudeRequest): Response {
    requests.push(body);
    const question = String(body.messages.findLast((m) => typeof m.content === 'string')?.content);
    const last = body.messages.at(-1)!;
    const results: string = Array.isArray(last.content)
      ? last.content.map((r: { content: string }) => r.content).join('\n')
      : '';
    if (!results) {
      if (/coffee/i.test(question))
        return sse([
          { type: 'text', text: 'I can add that for you.' },
          {
            type: 'tool_use',
            name: 'suggest_expense',
            input: { description: 'Coffee', amount: '9.00' },
          },
        ]);
      if (/owe/i.test(question))
        return sse([{ type: 'tool_use', name: 'get_expenses', input: {} }]);
      return sse([{ type: 'tool_use', name: 'search_trip', input: { query: question } }]);
    }
    if (/owe/i.test(question)) {
      const data = JSON.parse(results) as { settlements: unknown[] };
      return sse([
        { type: 'text', text: `There are ${data.settlements.length} payments to settle.` },
      ]);
    }
    const cite = /\[(S\d+)\]/.exec(results)?.[1];
    return sse([
      { type: 'text', text: cite ? `Found it [${cite}].` : 'Nothing on the trip says.' },
    ]);
  }

  const fakeFetch: typeof fetch = async (input, init) => {
    const url = String(input);
    const body = JSON.parse(String(init?.body));
    if (url.includes('voyageai.com')) {
      voyageCalls++;
      return Response.json({
        data: (body.input as string[]).map((t, index) => ({ index, embedding: fakeEmbedding(t) })),
        usage: { total_tokens: 10 },
      });
    }
    if (url.includes('anthropic.com')) return claude(body);
    throw new Error(`Unexpected fetch ${url}`);
  };

  const signIn = async (email: string) => {
    const agent = request.agent(server.app);
    await agent.post('/graphql').send({
      query: 'mutation($i: SignInInput!) { signIn(input: $i) { user { id } } }',
      variables: { i: { email, password: 'tripwise-demo' } },
    });
    return agent;
  };

  /** Parses an SSE response body into events. */
  const events = (text: string) =>
    text
      .split('\n\n')
      .filter((f) => f.startsWith('data: '))
      .map((f) => JSON.parse(f.slice(6)) as Record<string, any>);

  const ask = async (agent: ReturnType<typeof request.agent>, question: string) => {
    const res = await agent.post(`/api/trips/${tripId}/assistant/ask`).send({ question });
    return {
      status: res.status,
      events: res.status === 200 ? events(res.text) : [],
      body: res.body,
    };
  };

  beforeAll(async () => {
    const env = loadEnv({
      ...process.env,
      NODE_ENV: 'test',
      ANTHROPIC_API_KEY: 'test-key',
      VOYAGE_API_KEY: 'test-key',
      ASSISTANT_DAILY_QUESTIONS: '5',
    });
    db = createDb(env.DATABASE_URL);
    server = await createApp(env, db, new MemoryStorage(), { fetch: fakeFetch });
    tripId = (await db.trip.findFirstOrThrow({ where: { name: 'Lisbon with the crew' } })).id;
    await db.assistantUsage.deleteMany({});
    await db.tripChunk.deleteMany({ where: { tripId } });
  });

  afterAll(async () => {
    await db.expense.deleteMany({ where: { id: { in: created.expenses } } });
    await db.attachment.deleteMany({ where: { id: { in: created.attachments } } });
    await db.assistantUsage.deleteMany({});
    await server.stop();
    await db.$disconnect();
  });

  it('reports status and protects the endpoints', async () => {
    const owner = await signIn('demo@tripwise.app');
    const status = await owner.get(`/api/trips/${tripId}/assistant`);
    expect(status.body).toEqual({ enabled: true, semantic: true, remaining: 5, limit: 5 });
    expect((await request(server.app).get(`/api/trips/${tripId}/assistant`)).status).toBe(401);
    expect(
      (await owner.get('/api/trips/00000000-0000-4000-8000-000000000000/assistant')).status,
    ).toBe(404);
  });

  it('indexes the trip into pgvector and answers with a cited source', async () => {
    const owner = await signIn('demo@tripwise.app');
    const res = await ask(owner, 'Which flight do we take, TP 1394?');
    expect(res.status).toBe(200);
    const types = res.events.map((e) => e.type);
    expect(types[0]).toBe('status');
    expect(types.at(-1)).toBe('done');

    const source = res.events.find((e) => e.type === 'source');
    expect(source).toMatchObject({
      id: 'S1',
      kind: 'BOOKING',
      path: expect.stringMatching(/^bookings\/[0-9a-f-]{36}$/),
    });
    const text = res.events
      .filter((e) => e.type === 'text')
      .map((e) => e.text)
      .join('');
    expect(text).toBe('Found it [S1].');

    const rows = await db.$queryRaw<{ n: bigint; embedded: bigint }[]>`
      SELECT count(*) AS n, count("embedding") AS embedded FROM "TripChunk" WHERE "tripId" = ${tripId}::uuid`;
    expect(Number(rows[0]!.n)).toBeGreaterThan(20);
    expect(rows[0]!.embedded).toBe(rows[0]!.n);

    // Tools carry no trip id: the server pins the assistant to this trip.
    const first = requests[0]!;
    expect(first.tools.map((t) => t.name)).toEqual(
      expect.arrayContaining(['search_trip', 'get_itinerary', 'suggest_expense']),
    );
    expect(first.tools.some((t) => t.name === 'list_trips' || t.name === 'add_expense')).toBe(
      false,
    );
    expect(first.tools.every((t) => !t.input_schema.properties?.tripId)).toBe(true);
  });

  it('re-embeds only what changed', async () => {
    const owner = await signIn('demo@tripwise.app');
    const before = voyageCalls;
    await ask(owner, 'surf lesson');
    // One call for the query; nothing re-embedded.
    expect(voyageCalls - before).toBe(1);
  });

  it('answers from live tool data', async () => {
    const owner = await signIn('demo@tripwise.app');
    const res = await ask(owner, 'Who owes whom?');
    expect(res.events.find((e) => e.type === 'status' && /expenses/i.test(e.text))).toBeTruthy();
    expect(
      res.events
        .filter((e) => e.type === 'text')
        .map((e) => e.text)
        .join(''),
    ).toMatch(/^There are \d+ payments to settle\.$/);
  });

  it('suggests an expense as a card; only a confirm saves it, with role checks', async () => {
    const owner = await signIn('demo@tripwise.app');
    const count = await db.expense.count({ where: { tripId } });
    const res = await ask(owner, 'Add 9 euros for coffee');
    const card = res.events.find((e) => e.type === 'suggestion');
    expect(card).toMatchObject({
      tool: 'add_expense',
      args: { description: 'Coffee', amount: '9.00' },
    });
    expect(await db.expense.count({ where: { tripId } })).toBe(count);

    const viewer = await signIn('daniel@tripwise.app');
    const denied = await viewer.post(`/api/trips/${tripId}/assistant/confirm`).send(card);
    expect(denied.status).toBe(400);
    expect(denied.body.error).toMatch(/role/i);

    const confirmed = await owner.post(`/api/trips/${tripId}/assistant/confirm`).send(card);
    expect(confirmed.status).toBe(200);
    created.expenses.push(confirmed.body.result.added.id);
    expect(await db.expense.count({ where: { tripId } })).toBe(count + 1);

    const sneaky = await owner
      .post(`/api/trips/${tripId}/assistant/confirm`)
      .send({ tool: 'delete_expense', args: {} });
    expect(sneaky.status).toBe(400);
  });

  it('makes uploaded confirmations searchable', async () => {
    const owner = await signIn('demo@tripwise.app');
    const eml = [
      'From: Invented Tours <hello@tours.example>',
      'Subject: Your tile workshop booking',
      'Content-Type: text/plain; charset=utf-8',
      '',
      'Azulejo painting workshop. Meeting point: blue door at Rua Inventada 12.',
      'Bring an apron. Reference ZX-TEST-77.',
    ].join('\r\n');
    const up = await owner
      .post(`/api/trips/${tripId}/attachments`)
      .attach('file', Buffer.from(eml), 'workshop.eml');
    expect(up.status).toBe(201);
    created.attachments.push(up.body.attachment.id);

    const res = await ask(owner, 'meeting point apron workshop');
    const sources = res.events.filter((e) => e.type === 'source');
    expect(sources.some((s) => s.kind === 'DOCUMENT' && s.title === 'workshop.eml')).toBe(true);
  });

  it('stops at the daily limit', async () => {
    const owner = await signIn('demo@tripwise.app');
    const used =
      (await owner.get(`/api/trips/${tripId}/assistant`)).body.limit -
      (await owner.get(`/api/trips/${tripId}/assistant`)).body.remaining;
    for (let i = used; i < 5; i++) expect((await ask(owner, 'surf')).status).toBe(200);
    const blocked = await ask(owner, 'surf');
    expect(blocked.status).toBe(429);
    const usage = await db.assistantUsage.findMany();
    expect(usage[0]!.inputTokens).toBeGreaterThan(0);
  });
});
