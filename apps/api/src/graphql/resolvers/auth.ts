import { z } from 'zod';
import { isDemoAccount } from '../../auth/demo.js';
import { resetLinkAccountId, signResetLink, verifyResetLink } from '../../auth/passwordReset.js';
import { hashPassword, verifyPassword } from '../../auth/passwords.js';
import { AUTH_COOKIE, sessionCookieOptions, signSession } from '../../auth/tokens.js';
import type { Context } from '../context.js';
import { badInput, errorWithCode } from '../errors.js';
import { safeNext } from '../../auth/redirect.js';
import type { Resolvers } from '../__generated__/resolvers-types.js';
import { passwordChangedEmail, resetLinkEmail } from '../../mail/passwordEmails.js';

const NewPassword = z.string().min(8, 'Password must be at least 8 characters');

const SignUp = z.object({
  email: z.string().trim().toLowerCase().email(),
  name: z.string().trim().min(1).max(60),
  password: NewPassword,
});

const spentLink = () =>
  errorWithCode('This link has expired or was already used.', 'INVALID_RESET_LINK');

/** The account a reset link is valid for, or null (expired, used, forged, or the Demo account). */
async function resetLinkAccount(ctx: Context, token: string) {
  const id = resetLinkAccountId(token);
  if (!id) return null;
  const account = await ctx.db.user.findUnique({ where: { id } });
  if (!account || isDemoAccount(account.email)) return null;
  return verifyResetLink(token, account, ctx.env.JWT_SECRET) ? account : null;
}

function startSession(ctx: Context, userId: string) {
  const token = signSession(userId, ctx.env.JWT_SECRET);
  ctx.res?.cookie(AUTH_COOKIE, token, sessionCookieOptions(ctx.env.NODE_ENV === 'production'));
}

export const authResolvers: Resolvers = {
  Query: {
    me: (_p, _a, ctx) => (ctx.viewerId ? ctx.loaders.userById.load(ctx.viewerId) : null),

    passwordResetPreview: async (_p, { token }, ctx) => {
      const account = await resetLinkAccount(ctx, token);
      return account ? { email: account.email } : null;
    },
  },
  Mutation: {
    signUp: async (_p, { input }, ctx) => {
      const parsed = SignUp.safeParse(input);
      if (!parsed.success) throw badInput(parsed.error.issues[0]?.message ?? 'Invalid input');
      const { email, name, password } = parsed.data;

      const existing = await ctx.db.user.findUnique({ where: { email } });
      if (existing)
        throw errorWithCode('An account with this email already exists.', 'ACCOUNT_EXISTS');

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

    // Password reset (GLOSSARY). Unknown emails are named on purpose: sign-up already reveals
    // which emails have accounts, so hiding it here would protect nothing.
    requestPasswordReset: async (_p, { email, next }, ctx) => {
      const address = email.trim().toLowerCase();
      const account = await ctx.db.user.findUnique({ where: { email: address } });
      if (!account) throw errorWithCode('No account found for that email.', 'ACCOUNT_NOT_FOUND');
      // The shared Demo account answers like any other but is never emailed or reset.
      if (isDemoAccount(account.email)) return true;
      if (!ctx.resetLimiter.allows(address)) {
        throw errorWithCode(
          "We've already sent a reset link to this address. Check your inbox and spam folder, or try again in an hour.",
          'RATE_LIMITED',
        );
      }

      // The email rides along so an expired link can still pre-fill "Send a new link"; an in-app
      // `next` (e.g. an invite's join page) brings the person back where they were heading.
      const query = new URLSearchParams({ email: account.email });
      const back = safeNext(next);
      if (back) query.set('next', back);
      const link = `${ctx.env.WEB_ORIGIN}/reset-password/${signResetLink(account, ctx.env.JWT_SECRET)}?${query}`;
      const unavailable = () =>
        errorWithCode(
          "Password reset isn't available right now. Please try again later.",
          'EMAIL_UNAVAILABLE',
        );
      if (!ctx.mailer) {
        if (ctx.env.NODE_ENV === 'production') throw unavailable();
        // Development without SMTP: the link goes to the API log so the flow can still be tried.
        console.info(`[password reset] ${account.email}: ${link}`);
        ctx.resetLimiter.recordSent(address);
        return true;
      }
      try {
        await ctx.mailer.send(resetLinkEmail(account.email, link));
      } catch (err) {
        console.error('[password reset] email failed', err);
        throw unavailable();
      }
      // Only an email that actually went out counts toward the hourly limit.
      ctx.resetLimiter.recordSent(address);
      return true;
    },

    resetPassword: async (_p, { token, password }, ctx) => {
      const parsed = NewPassword.safeParse(password);
      if (!parsed.success) throw badInput(parsed.error.issues[0]?.message ?? 'Invalid password');
      const account = await resetLinkAccount(ctx, token);
      if (!account) throw spentLink();

      // Changing the hash spends the link; the timestamp signs out every older session (ADR 0001).
      // Conditional on the hash the link was checked against, so two simultaneous uses can't both win.
      const changed = await ctx.db.user.updateMany({
        where: { id: account.id, passwordHash: account.passwordHash },
        data: { passwordHash: await hashPassword(parsed.data), passwordChangedAt: new Date() },
      });
      if (changed.count !== 1) throw spentLink();
      const user = await ctx.db.user.findUniqueOrThrow({ where: { id: account.id } });
      startSession(ctx, user.id);
      // Best effort: the reset already happened, a mail hiccup mustn't undo the sign-in.
      await ctx.mailer
        ?.send(passwordChangedEmail(user.email, `${ctx.env.WEB_ORIGIN}/forgot-password`))
        .catch((err: unknown) => console.error('[password reset] notice failed', err));
      return { user };
    },

    signOut: (_p, _a, ctx) => {
      ctx.res?.clearCookie(AUTH_COOKIE, { path: '/' });
      return true;
    },
  },
};
