import { RESET_LINK_MINUTES } from '../auth/passwordReset.js';
import type { MailMessage } from './mailer.js';

// Email clients ignore stylesheets, so the few Platform colours are inlined here.
const SIGN = '#0b2a6f';
const INK = '#111418';
const MUTED = '#5a6272';

const page = (body: string) => `<!doctype html>
<html><body style="margin:0;padding:24px;background:#f2f4f8;font-family:Arial,Helvetica,sans-serif;color:${INK}">
<table role="presentation" width="100%" style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:12px">
<tr><td style="padding:28px">
<p style="margin:0 0 20px;font-size:18px;font-weight:800;color:${SIGN}">Tripwise</p>
${body}
</td></tr></table></body></html>`;

/** The reset-link email (GLOSSARY: Reset link). */
export function resetLinkEmail(to: string, link: string): MailMessage {
  return {
    to,
    subject: 'Reset your Tripwise password',
    text: [
      'Someone asked to reset the password for your Tripwise account.',
      '',
      `Choose a new password here (the link works for ${RESET_LINK_MINUTES} minutes):`,
      link,
      '',
      "If you didn't ask for this, ignore this email — your password stays the same.",
    ].join('\n'),
    html: page(`
<h1 style="margin:0 0 12px;font-size:22px">Reset your password</h1>
<p style="margin:0 0 24px;font-size:15px;line-height:1.5">Someone asked to reset the password for your Tripwise account. The link works for ${RESET_LINK_MINUTES} minutes.</p>
<p style="margin:0 0 24px"><a href="${link}" style="display:inline-block;padding:14px 22px;border-radius:8px;background:${SIGN};color:#ffffff;font-weight:700;text-decoration:none">Choose a new password</a></p>
<p style="margin:0;font-size:13px;color:${MUTED};line-height:1.5">If you didn't ask for this, ignore this email — your password stays the same.</p>`),
  };
}

/** Sent after a successful reset: the alarm bell if it wasn't them. */
export function passwordChangedEmail(to: string, forgotUrl: string): MailMessage {
  return {
    to,
    subject: 'Your Tripwise password was changed',
    text: [
      'Your Tripwise password was just changed, and every other device was signed out.',
      '',
      `If this wasn't you, reset it again now: ${forgotUrl}`,
    ].join('\n'),
    html: page(`
<h1 style="margin:0 0 12px;font-size:22px">Your password was changed</h1>
<p style="margin:0 0 16px;font-size:15px;line-height:1.5">Your Tripwise password was just changed, and every other device was signed out.</p>
<p style="margin:0;font-size:15px;line-height:1.5">If this wasn't you, <a href="${forgotUrl}" style="color:${SIGN};font-weight:700">reset it again now</a>.</p>`),
  };
}
