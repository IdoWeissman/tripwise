import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * Loads optional env files before anything reads process.env. Never overrides variables that are
 * already set, so precedence is: real environment (Render, CI) > repo-root .env.local (written by
 * `neon deploy`) > apps/api/.env (local Docker setup). Missing files are skipped — unlike
 * `node --env-file-if-exists`, which crashes `node --watch` when the file doesn't exist.
 * Works from both src/ (tsx) and dist/ (compiled): each is one level below apps/api.
 */
for (const rel of ['../../../.env.local', '../.env']) {
  const path = fileURLToPath(new URL(rel, import.meta.url));
  if (existsSync(path)) process.loadEnvFile(path);
}
