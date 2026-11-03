import { createServer, type Server } from 'node:http';
import { ApolloServer } from '@apollo/server';
import { ApolloServerPluginDrainHttpServer } from '@apollo/server/plugin/drainHttpServer';
import { expressMiddleware } from '@as-integrations/express5';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { type Express } from 'express';
import { rateLimit } from 'express-rate-limit';
import helmet from 'helmet';
import { useServer } from 'graphql-ws/use/ws';
import { WebSocketServer } from 'ws';
import { AUTH_COOKIE, readCookie, verifySession } from './auth/tokens.js';
import type { Env } from './config.js';
import type { Db } from './db.js';
import { buildContext, type Context } from './graphql/context.js';
import { schema } from './graphql/schema.js';

export interface App {
  app: Express;
  httpServer: Server;
  stop: () => Promise<void>;
}

export async function createApp(env: Env, db: Db): Promise<App> {
  const app = express();
  const httpServer = createServer(app);
  const isProd = env.NODE_ENV === 'production';

  // --- WebSocket transport for subscriptions (graphql-ws) ---
  const wsServer = new WebSocketServer({ server: httpServer, path: '/graphql' });
  const wsCleanup = useServer(
    {
      schema,
      context: (ctx) => {
        const token = readCookie(ctx.extra.request.headers.cookie, AUTH_COOKIE);
        return buildContext({ db, env, viewerId: verifySession(token, env.JWT_SECRET) });
      },
    },
    wsServer,
  );

  // --- Apollo Server over HTTP ---
  const apollo = new ApolloServer<Context>({
    schema,
    introspection: !isProd,
    plugins: [
      ApolloServerPluginDrainHttpServer({ httpServer }),
      {
        async serverWillStart() {
          return {
            async drainServer() {
              await wsCleanup.dispose();
            },
          };
        },
      },
    ],
  });
  await apollo.start();

  // Apollo Sandbox needs inline scripts in development.
  app.use(helmet({ contentSecurityPolicy: isProd ? undefined : false }));
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.use(
    '/graphql',
    cors<cors.CorsRequest>({ origin: env.WEB_ORIGIN, credentials: true }),
    rateLimit({ windowMs: 60_000, limit: 300, standardHeaders: 'draft-8', legacyHeaders: false }),
    express.json({ limit: '1mb' }),
    cookieParser(),
    expressMiddleware(apollo, {
      context: async ({ req, res }) =>
        buildContext(
          {
            db,
            env,
            viewerId: verifySession(
              req.cookies?.[AUTH_COOKIE] as string | undefined,
              env.JWT_SECRET,
            ),
          },
          { req, res },
        ),
    }),
  );

  return {
    app,
    httpServer,
    stop: async () => {
      await apollo.stop();
    },
  };
}
