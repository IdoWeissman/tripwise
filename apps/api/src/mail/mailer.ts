import nodemailer from 'nodemailer';
import type { Env } from '../config.js';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

/** Sends one email. The SMTP one is real; tests pass a fake. */
export interface Mailer {
  send(message: MailMessage): Promise<void>;
}

/** SMTP mailer from SMTP_URL / MAIL_FROM, or null when email isn't configured. */
export function createSmtpMailer(env: Env): Mailer | null {
  if (!env.SMTP_URL) return null;
  const transport = nodemailer.createTransport(env.SMTP_URL);
  return {
    async send(message) {
      await transport.sendMail({ from: env.MAIL_FROM, ...message });
    },
  };
}
