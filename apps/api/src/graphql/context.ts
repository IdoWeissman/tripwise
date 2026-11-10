import type { Request, Response } from 'express';
import type { Env } from '../config.js';
import type { Db } from '../db.js';
import type { Storage } from '../storage.js';
import { createLoaders, type Loaders } from './loaders.js';

export interface Context {
  db: Db;
  env: Env;
  storage: Storage;
  viewerId: string | null;
  /** How the viewer signed in: browser cookie, or an AI assistant's personal access token (MCP). */
  auth: 'session' | 'token';
  loaders: Loaders;
  /** Present for HTTP operations; absent over WebSocket. */
  req?: Request;
  res?: Response;
}

export function buildContext(
  base: { db: Db; env: Env; storage: Storage; viewerId: string | null; auth?: Context['auth'] },
  http?: { req: Request; res: Response },
): Context {
  return { auth: 'session', ...base, ...http, loaders: createLoaders(base.db, base.viewerId) };
}
