import { describe, expect, it } from 'vitest';
import { migrationUrl } from '../prisma.config.js';

const pooled =
  'postgresql://u:p@ep-cool-1-pooler.c-7.eu-central-1.aws.neon.tech/neondb?sslmode=require';

describe('migrationUrl', () => {
  it('prefers DATABASE_URL_UNPOOLED', () => {
    expect(
      migrationUrl({ DATABASE_URL: pooled, DATABASE_URL_UNPOOLED: 'postgresql://direct/db' }),
    ).toBe('postgresql://direct/db');
  });

  it('derives the direct Neon host when the unpooled URL is missing or empty', () => {
    for (const DATABASE_URL_UNPOOLED of [undefined, '', '  ']) {
      expect(migrationUrl({ DATABASE_URL: pooled, DATABASE_URL_UNPOOLED })).toBe(
        'postgresql://u:p@ep-cool-1.c-7.eu-central-1.aws.neon.tech/neondb?sslmode=require',
      );
    }
  });

  it('leaves non-Neon URLs alone', () => {
    expect(migrationUrl({ DATABASE_URL: 'postgresql://t:t@localhost:5432/tripwise' })).toBe(
      'postgresql://t:t@localhost:5432/tripwise',
    );
  });
});
