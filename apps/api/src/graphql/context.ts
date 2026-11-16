import type { Request, Response } from 'express';
import type { Env } from '../config.js';
import type { Db } from '../db.js';
import type { Storage } from '../storage.js';
import { createResetLimiter, type ResetLimiter } from '../auth/resetLimiter.js';
import type { Mailer } from '../mail/mailer.js';
import { createLoaders, type Loaders } from './loaders.js';
import type { PlacesClient } from '../places/google.js';
import { placesFromEnv } from '../places/service.js';

export interface Context {
  db: Db;
  env: Env;
  storage: Storage;
  viewerId: string | null;
  /** How the viewer signed in: browser cookie, or an AI assistant's personal access token (MCP). */
  auth: 'session' | 'token';
  loaders: Loaders;
  /** Outgoing email, or null when SMTP isn't configured. */
  mailer: Mailer | null;
  /** Reset emails per address per hour — one per app, shared across requests. */
  resetLimiter: ResetLimiter;
  /** Google Places, or null when GOOGLE_PLACES_API_KEY isn't set. */
  places: PlacesClient | null;
  /** Present for HTTP operations; absent over WebSocket. */
  req?: Request;
  res?: Response;
}

/** For contexts built without one (AI assistant / MCP runs never send reset emails). */
const fallbackLimiter = createResetLimiter();

export function buildContext(
  base: {
    db: Db;
    env: Env;
    storage: Storage;
    viewerId: string | null;
    auth?: Context['auth'];
    mailer?: Mailer | null;
    resetLimiter?: ResetLimiter;
    places?: PlacesClient | null;
  },
  http?: { req: Request; res: Response },
): Context {
  return {
    auth: 'session',
    mailer: null,
    resetLimiter: fallbackLimiter,
    places: placesFromEnv(base.env),
    ...base,
    ...http,
    loaders: createLoaders(base.db, base.viewerId),
  };
}
