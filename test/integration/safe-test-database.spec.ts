import { describe, expect, it } from 'vitest';
import {
  assertSafeIntegrationDatabaseUrl,
  requireIntegrationDatabaseUrl,
} from './safe-test-database.js';

describe('assertSafeIntegrationDatabaseUrl', () => {
  it('accepts a localhost livingspace_test URL', () => {
    expect(
      assertSafeIntegrationDatabaseUrl(
        'postgresql://postgres:postgres@localhost:5434/livingspace_test',
      ),
    ).toContain('livingspace_test');
  });

  it('rejects non-localhost and production-like names', () => {
    expect(() =>
      assertSafeIntegrationDatabaseUrl(
        'postgresql://postgres:postgres@db.example:5432/livingspace_test',
      ),
    ).toThrow(/localhost/);

    expect(() =>
      assertSafeIntegrationDatabaseUrl(
        'postgresql://postgres:postgres@localhost:5434/livingspace_dev',
      ),
    ).toThrow(/livingspace_test/);

    expect(() =>
      assertSafeIntegrationDatabaseUrl(
        'postgresql://postgres:postgres@localhost:5434/livingspace_test_prod',
      ),
    ).toThrow(/unsafe/);
  });

  it('fails instead of skipping when DATABASE_URL_TEST is missing', () => {
    const previous = process.env.DATABASE_URL_TEST;
    delete process.env.DATABASE_URL_TEST;
    try {
      expect(() => requireIntegrationDatabaseUrl()).toThrow(
        /DATABASE_URL_TEST is required/,
      );
    } finally {
      if (previous === undefined) delete process.env.DATABASE_URL_TEST;
      else process.env.DATABASE_URL_TEST = previous;
    }
  });
});
