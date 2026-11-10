import type { ApolloServer } from '@apollo/server';
import type { Env } from '../config.js';
import type { Db } from '../db.js';
import { ToolError, type RunGraphQL } from '../mcp/tools.js';
import type { Storage } from '../storage.js';
import { buildContext, type Context } from './context.js';

/** Error codes a user can act on; anything else is an internal error and stays hidden. */
const USER_CODES = new Set(['BAD_USER_INPUT', 'FORBIDDEN', 'NOT_FOUND', 'UNAUTHENTICATED']);

/**
 * Runs GraphQL operations in-process as one user (used by the MCP server and the trip assistant),
 * so they go through the same resolvers, role checks and live-update events as the web app.
 */
export function graphqlAs(opts: {
  apollo: ApolloServer<Context>;
  db: Db;
  env: Env;
  storage: Storage;
  viewerId: string;
  auth: Context['auth'];
}): RunGraphQL {
  const { apollo, ...base } = opts;
  return async (query, variables) => {
    // A fresh context per operation keeps DataLoader caches from serving data a write just changed.
    const contextValue = buildContext(base);
    const response = await apollo.executeOperation({ query, variables }, { contextValue });
    if (response.body.kind !== 'single') throw new Error('Unexpected incremental response');
    const { data, errors } = response.body.singleResult;
    if (errors?.length) {
      const usable = errors.find((e) => USER_CODES.has(String(e.extensions?.code)));
      if (usable) throw new ToolError(usable.message);
      if (data == null) throw new Error(errors[0]?.message ?? 'GraphQL error');
    }
    return data as never;
  };
}
