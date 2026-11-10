import type { ApolloServer } from '@apollo/server';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import express, { Router, type Request, type Response } from 'express';
import { rateLimit } from 'express-rate-limit';
import { readBearer, verifyApiToken } from '../auth/apiTokens.js';
import type { Env } from '../config.js';
import type { Db } from '../db.js';
import type { Context } from '../graphql/context.js';
import { graphqlAs } from '../graphql/run.js';
import type { Storage } from '../storage.js';
import { registerTools } from './tools.js';

const INSTRUCTIONS = `Tripwise is a group trip planner. Start with list_trips to find the trip, then read with get_trip, get_itinerary, list_bookings, get_booking, list_proposals and get_expenses.
Times are local wall-clock times at the destination. Money is a decimal string in the trip's currency.
Writes act as the signed-in user and respect their trip role (viewers can only read). Nothing can be deleted through this server.
Before saving an imported confirmation (import_booking_text with save: true), show the user what was found.`;

function rpcError(res: Response, status: number, message: string) {
  res.status(status).json({ jsonrpc: '2.0', error: { code: -32000, message }, id: null });
}

/**
 * Model Context Protocol endpoint for AI assistants (Claude, Cursor, …), at POST /mcp.
 * Stateless Streamable HTTP: every request carries `Authorization: Bearer tw_pat_…`,
 * gets a fresh server bound to that user, and runs tools through the GraphQL schema.
 */
export function mcpRouter(opts: {
  env: Env;
  db: Db;
  storage: Storage;
  apollo: ApolloServer<Context>;
  version: string;
}): Router {
  const { env, db, storage, apollo } = opts;
  const router = Router();

  router.use(
    '/mcp',
    rateLimit({ windowMs: 60_000, limit: 120, standardHeaders: 'draft-8', legacyHeaders: false }),
  );

  router.post('/mcp', express.json({ limit: '1mb' }), async (req: Request, res: Response) => {
    const token = readBearer(req.headers.authorization);
    const viewerId = token ? await verifyApiToken(db, token) : null;
    if (!viewerId) {
      res.setHeader(
        'WWW-Authenticate',
        'Bearer realm="tripwise", error="invalid_token", error_description="Create a token in Tripwise under AI assistants"',
      );
      rpcError(res, 401, 'Missing, invalid or revoked Tripwise access token.');
      return;
    }

    const gql = graphqlAs({ apollo, db, env, storage, viewerId, auth: 'token' });

    const server = new McpServer(
      { name: 'tripwise', title: 'Tripwise', version: opts.version },
      { instructions: INSTRUCTIONS },
    );
    registerTools(server, gql, viewerId);
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    res.on('close', () => {
      void transport.close();
      void server.close();
    });
    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (err) {
      console.error('MCP request failed', err);
      if (!res.headersSent) rpcError(res, 500, 'Internal server error');
    }
  });

  // Stateless server: no server-initiated stream (GET) and no sessions to end (DELETE).
  router.all('/mcp', (_req, res) => {
    res.setHeader('Allow', 'POST');
    rpcError(res, 405, 'Method not allowed. Send MCP requests with POST.');
  });

  return router;
}
