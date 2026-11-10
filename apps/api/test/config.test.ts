import { describe, expect, it } from 'vitest';
import { loadEnv } from '../src/config.js';

const base = {
  DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
  JWT_SECRET: 'x'.repeat(32),
};

describe('loadEnv', () => {
  it('treats empty variables as unset (CI and hosts often export KEY="")', () => {
    // claude-code-action exports ANTHROPIC_API_KEY="" when it authenticates with an OAuth token.
    const env = loadEnv({ ...base, ANTHROPIC_API_KEY: '', SMTP_URL: '  ', S3_ENDPOINT: '' });
    expect(env.ANTHROPIC_API_KEY).toBeUndefined();
    expect(env.SMTP_URL).toBeUndefined();
    expect(env.S3_ENDPOINT).toBeUndefined();
  });

  it('falls back to Neon AWS_* variables when the S3_* ones are empty', () => {
    const env = loadEnv({
      ...base,
      S3_ENDPOINT: '',
      AWS_ENDPOINT_URL_S3: 'https://storage.example.test',
    });
    expect(env.S3_ENDPOINT).toBe('https://storage.example.test');
  });

  it('still rejects missing required settings', () => {
    expect(() => loadEnv({ DATABASE_URL: '', JWT_SECRET: base.JWT_SECRET })).toThrow(
      /Invalid environment/,
    );
  });
});
