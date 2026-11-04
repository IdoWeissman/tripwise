import nodemailer from 'nodemailer';
import type { Env } from '../config.js';
import type { Db } from '../db.js';
import { computeReminders, DEFAULT_PREFS } from './reminders.js';

const MINUTE = 60_000;

/**
 * Emails due reminders once a minute (only when SMTP_URL is set).
 * ReminderLog makes sending idempotent across restarts and multiple instances.
 */
export function startReminderMailer(env: Env, db: Db): () => void {
  if (!env.SMTP_URL) return () => {};
  const transport = nodemailer.createTransport(env.SMTP_URL);

  const tick = async () => {
    const now = new Date();
    const soon = new Date(now.getTime() + 3 * 24 * 60 * MINUTE);
    const trips = await db.trip.findMany({
      where: {
        startDate: { lte: soon },
        endDate: { gte: new Date(now.getTime() - 24 * 60 * MINUTE) },
      },
      include: {
        bookings: { include: { segments: { orderBy: { position: 'asc' } } } },
        reminderPrefs: { where: { email: true }, include: { user: true } },
      },
    });
    for (const trip of trips) {
      for (const pref of trip.reminderPrefs) {
        const due = computeReminders(
          trip.bookings,
          { ...DEFAULT_PREFS, ...pref },
          trip.timeZone,
        ).filter(
          (r) =>
            r.fireAt <= now && r.fireAt.getTime() > now.getTime() - 30 * MINUTE && r.targetAt > now,
        );
        for (const r of due) {
          try {
            await db.reminderLog.create({ data: { userId: pref.userId, key: r.key } });
          } catch {
            continue; // already sent
          }
          await transport.sendMail({
            from: env.MAIL_FROM,
            to: pref.user.email,
            subject: `${r.title} · ${trip.name}`,
            text: `${r.body}\n\nOpen the trip: ${env.WEB_ORIGIN}/trips/${trip.id}\n\nYou can turn these emails off in Calendar & reminders.`,
          });
        }
      }
    }
  };

  const timer = setInterval(
    () => void tick().catch((err) => console.error('Reminder job failed:', err)),
    MINUTE,
  );
  return () => clearInterval(timer);
}
