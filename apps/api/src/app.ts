import { existsSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { resolve } from 'node:path';
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
import { createResetLimiter } from './auth/resetLimiter.js';
import { resolveSession, sessionFromRequest } from './auth/session.js';
import { createSmtpMailer, type Mailer } from './mail/mailer.js';
import { placesFromEnv } from './places/service.js';
import { routesFromEnv } from './planning/service.js';
import { AUTH_COOKIE, readCookie } from './auth/tokens.js';
import type { Env } from './config.js';
import type { Db } from './db.js';
import { calendarRouter } from './bookings/calendar.js';
import { uploadRouter } from './bookings/upload.js';
import { createStorage, type Storage } from './storage.js';
import { buildContext, type Context } from './graphql/context.js';
import { schema } from './graphql/schema.js';
import { mcpRouter } from './mcp/server.js';
import { assistantRouter } from './assistant/route.js';

export interface App {
  app: Express;
  httpServer: Server;
  stop: () => Promise<void>;
}

export async function createApp(
  env: Env,
  db: Db,
  storage: Storage = createStorage(env),
  /** Test seam: replaces fetch for outgoing calls (Claude, Voyage, Google Places and Routes). */
  options: {
    fetch?: typeof fetch;
    /** Test seam: replaces the SMTP mailer (null = email not configured). */
    mailer?: Mailer | null;
  } = {},
): Promise<App> {
  const app = express();
  const httpServer = createServer(app);
  const isProd = env.NODE_ENV === 'production';
  const services = {
    db,
    env,
    storage,
    mailer: options.mailer !== undefined ? options.mailer : createSmtpMailer(env),
    resetLimiter: createResetLimiter(),
    places: placesFromEnv(env, options.fetch),
    routes: routesFromEnv(env, options.fetch),
  };

  // --- WebSocket transport for subscriptions (graphql-ws) ---
  const wsServer = new WebSocketServer({ server: httpServer, path: '/graphql' });
  const wsCleanup = useServer(
    {
      schema,
      context: async (ctx) => {
        const token = readCookie(ctx.extra.request.headers.cookie, AUTH_COOKIE);
        return buildContext({
          ...services,
          viewerId: await resolveSession(token, env.JWT_SECRET, db),
        });
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
  // Behind Render's (or any) proxy: correct client IPs for rate limiting.
  app.set('trust proxy', 1);
  // Apollo Sandbox needs inline scripts in development; production allows same-origin WebSockets.
  app.use(
    helmet({
      contentSecurityPolicy: isProd
        ? {
            directives: {
              // The trip map loads the Maps JavaScript API and its tiles, fonts and photos.
              scriptSrc: ["'self'", 'https://maps.googleapis.com', 'https://maps.gstatic.com'],
              styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
              fontSrc: ["'self'", 'https://fonts.gstatic.com'],
              imgSrc: [
                "'self'",
                'data:',
                'blob:',
                'https://maps.googleapis.com',
                'https://maps.gstatic.com',
                'https://*.googleusercontent.com',
                'https://*.ggpht.com',
              ],
              connectSrc: [
                "'self'",
                'wss:',
                'https://maps.googleapis.com',
                'https://places.googleapis.com',
              ],
              workerSrc: ["'self'", 'blob:'],
              upgradeInsecureRequests: [],
            },
          }
        : false,
    }),
  );
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.use(calendarRouter(env, db));
  app.use(
    '/api',
    cors<cors.CorsRequest>({ origin: env.WEB_ORIGIN, credentials: true }),
    rateLimit({ windowMs: 60_000, limit: 60, standardHeaders: 'draft-8', legacyHeaders: false }),
    cookieParser(),
  );
  app.use(uploadRouter(env, db, storage));
  app.use(assistantRouter({ env, db, storage, apollo, fetch: options.fetch }));

  // AI assistants (MCP): bearer-token auth, no cookies, no CORS (clients aren't browsers).
  app.use(mcpRouter({ env, db, storage, apollo, version: '0.1.0' }));

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
            ...services,
            viewerId: await sessionFromRequest(req, env.JWT_SECRET, db),
          },
          { req, res },
        ),
    }),
  );

  // Single-origin deploys: serve the built web app (cookies and WebSockets stay same-site).
  if (env.WEB_DIST) {
    const dist = resolve(process.cwd(), env.WEB_DIST);
    if (!existsSync(resolve(dist, 'index.html')))
      throw new Error(`WEB_DIST has no index.html: ${dist}`);
    app.use('/assets', express.static(resolve(dist, 'assets'), { immutable: true, maxAge: '1y' }));
    app.use(express.static(dist, { index: false }));
    // Client-side routes (/trips/…, /join/…) fall back to the app shell.
    app.get(/^(?!\/(graphql|api|health|mcp)).*/, (_req, res) => {
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(resolve(dist, 'index.html'));
    });
  }

  return {
    app,
    httpServer,
    stop: async () => {
      await apollo.stop();
    },
  };
}
