import type { Request, Response } from 'express';
import type { Env } from '../config.js';
import type { Db } from '../db.js';
import { createLoaders, type Loaders } from './loaders.js';

export interface Context {
  db: Db;
  env: Env;
  viewerId: string | null;
  loaders: Loaders;
  /** Present for HTTP operations; absent over WebSocket. */
  req?: Request;
  res?: Response;
}

export function buildContext(
  base: { db: Db; env: Env; viewerId: string | null },
  http?: { req: Request; res: Response },
): Context {
  return { ...base, ...http, loaders: createLoaders(base.db, base.viewerId) };
}
