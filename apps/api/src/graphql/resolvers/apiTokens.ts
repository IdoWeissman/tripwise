import { z } from 'zod';
import { generateToken, MAX_TOKENS_PER_USER } from '../../auth/apiTokens.js';
import type { Context } from '../context.js';
import { badInput, forbidden, requireViewer } from '../errors.js';
import type { Resolvers } from '../__generated__/resolvers-types.js';

const Name = z
  .string()
  .trim()
  .min(1, 'Give the token a name.')
  .max(60, 'Keep the name under 60 characters.');

/** Token management needs a real browser sign-in: an assistant can't mint or revoke tokens. */
function requireSession(ctx: Context): string {
  const userId = requireViewer(ctx);
  if (ctx.auth !== 'session') throw forbidden('Manage AI assistant tokens from the Tripwise app.');
  return userId;
}

export const apiTokenResolvers: Resolvers = {
  Query: {
    myApiTokens: (_p, _a, ctx) =>
      ctx.db.apiToken.findMany({
        where: { userId: requireSession(ctx), revokedAt: null },
        orderBy: { createdAt: 'desc' },
      }),
  },
  Mutation: {
    createApiToken: async (_p, { name }, ctx) => {
      const userId = requireSession(ctx);
      const parsed = Name.safeParse(name);
      if (!parsed.success) throw badInput(parsed.error.issues[0]?.message ?? 'Invalid name');
      const active = await ctx.db.apiToken.count({ where: { userId, revokedAt: null } });
      if (active >= MAX_TOKENS_PER_USER)
        throw badInput(`You can have up to ${MAX_TOKENS_PER_USER} tokens. Revoke one first.`);
      const { token, hash, prefix } = generateToken();
      const apiToken = await ctx.db.apiToken.create({
        data: { userId, name: parsed.data, tokenHash: hash, prefix },
      });
      return { token, apiToken };
    },
    revokeApiToken: async (_p, { id }, ctx) => {
      const userId = requireSession(ctx);
      if (!z.uuid().safeParse(id).success) throw badInput('That token does not exist.');
      const { count } = await ctx.db.apiToken.updateMany({
        where: { id, userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      if (count === 0) throw badInput('That token does not exist or is already revoked.');
      return true;
    },
  },
};
