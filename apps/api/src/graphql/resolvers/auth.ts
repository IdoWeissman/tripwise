import { z } from 'zod';
import { hashPassword, verifyPassword } from '../../auth/passwords.js';
import { AUTH_COOKIE, sessionCookieOptions, signSession } from '../../auth/tokens.js';
import type { Context } from '../context.js';
import { badInput } from '../errors.js';
import type { Resolvers } from '../__generated__/resolvers-types.js';

const SignUp = z.object({
  email: z.string().trim().toLowerCase().email(),
  name: z.string().trim().min(1).max(60),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

function startSession(ctx: Context, userId: string) {
  const token = signSession(userId, ctx.env.JWT_SECRET);
  ctx.res?.cookie(AUTH_COOKIE, token, sessionCookieOptions(ctx.env.NODE_ENV === 'production'));
}

export const authResolvers: Resolvers = {
  Query: {
    me: (_p, _a, ctx) => (ctx.viewerId ? ctx.loaders.userById.load(ctx.viewerId) : null),
  },
  Mutation: {
    signUp: async (_p, { input }, ctx) => {
      const parsed = SignUp.safeParse(input);
      if (!parsed.success) throw badInput(parsed.error.issues[0]?.message ?? 'Invalid input');
      const { email, name, password } = parsed.data;

      const existing = await ctx.db.user.findUnique({ where: { email } });
      if (existing) throw badInput('An account with this email already exists.');

      const user = await ctx.db.user.create({
        data: { email, name, passwordHash: await hashPassword(password) },
      });
      startSession(ctx, user.id);
      return { user };
    },

    signIn: async (_p, { input }, ctx) => {
      const user = await ctx.db.user.findUnique({
        where: { email: input.email.trim().toLowerCase() },
      });
      if (!user || !(await verifyPassword(input.password, user.passwordHash))) {
        throw badInput('Email or password is incorrect.');
      }
      startSession(ctx, user.id);
      return { user };
    },

    signOut: (_p, _a, ctx) => {
      ctx.res?.clearCookie(AUTH_COOKIE, { path: '/' });
      return true;
    },
  },
};
