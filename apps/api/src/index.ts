import { createApp } from './app.js';
import { loadEnv } from './config.js';
import { createDb } from './db.js';

const env = loadEnv();
const db = createDb(env.DATABASE_URL);
const { httpServer, stop } = await createApp(env, db);

httpServer.listen(env.PORT, () => {
  console.log(`🚀 Tripwise API ready at http://localhost:${env.PORT}/graphql`);
});

const shutdown = async (signal: string) => {
  console.log(`${signal} received, shutting down…`);
  await stop();
  await db.$disconnect();
  process.exit(0);
};
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
