import './env.js';
import { createApp } from './app.js';
import { startReminderMailer } from './bookings/reminderMailer.js';
import { createStorage } from './storage.js';
import { loadEnv } from './config.js';
import { createDb } from './db.js';

const env = loadEnv();
const db = createDb(env.DATABASE_URL);
const storage = createStorage(env);
try {
  await storage.ensureReady();
} catch (err) {
  console.warn(
    'File storage is not reachable — uploads will fail until it is. Is MinIO running? (pnpm db:up)',
    err instanceof Error ? err.message : err,
  );
}
const { httpServer, stop } = await createApp(env, db, storage);
const stopMailer = startReminderMailer(env, db);

httpServer.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EADDRINUSE') {
    console.error(
      `Port ${env.PORT} is already in use. Stop the other process or change PORT in apps/api/.env.`,
    );
  } else {
    console.error('HTTP server error:', err);
  }
  process.exit(1);
});

httpServer.listen(env.PORT, () => {
  console.log(`🚀 Tripwise API ready at http://localhost:${env.PORT}/graphql`);
});

const shutdown = async (signal: string) => {
  console.log(`${signal} received, shutting down…`);
  stopMailer();
  await stop();
  await db.$disconnect();
  process.exit(0);
};
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
