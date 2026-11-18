/**
 * Guardrails for PostgreSQL integration tests.
 * Never point these helpers at production.
 */
export function assertSafeIntegrationDatabaseUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) {
    throw new Error('DATABASE_URL_TEST is empty');
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error('DATABASE_URL_TEST must be a valid PostgreSQL URL');
  }

  if (parsed.protocol !== 'postgresql:' && parsed.protocol !== 'postgres:') {
    throw new Error('DATABASE_URL_TEST must use the postgresql protocol');
  }

  const host = parsed.hostname;
  if (host !== 'localhost' && host !== '127.0.0.1') {
    throw new Error(
      'DATABASE_URL_TEST must target localhost/127.0.0.1 for safety',
    );
  }

  const database = parsed.pathname.replace(/^\//, '');
  if (!database.includes('livingspace_test')) {
    throw new Error(
      'DATABASE_URL_TEST database name must include "livingspace_test"',
    );
  }

  const blocked = ['prod', 'production', 'staging'];
  const haystack = `${database} ${trimmed}`.toLowerCase();
  for (const token of blocked) {
    if (haystack.includes(token)) {
      throw new Error(`DATABASE_URL_TEST looks unsafe (contains "${token}")`);
    }
  }

  return trimmed;
}

export function resolveIntegrationDatabaseUrl(): string | null {
  const raw = process.env.DATABASE_URL_TEST?.trim();
  if (!raw) {
    return null;
  }
  return assertSafeIntegrationDatabaseUrl(raw);
}

export const MISSING_INTEGRATION_DATABASE_MESSAGE =
  'DATABASE_URL_TEST is required for integration tests. The suite does not skip when it is missing. Set it in the environment or in livingspace-be/.env to a localhost PostgreSQL URL whose database name includes livingspace_test. Example: postgresql://postgres:postgres@localhost:5434/livingspace_test';

/** Fail the process when the dedicated test database was not selected. */
export function requireIntegrationDatabaseUrl(): string {
  const url = resolveIntegrationDatabaseUrl();
  if (!url) {
    throw new Error(MISSING_INTEGRATION_DATABASE_MESSAGE);
  }
  return url;
}

export function describeIntegrationDatabase(url: string): string {
  const parsed = new URL(url);
  const database = parsed.pathname.replace(/^\//, '');
  return `${database} at ${parsed.hostname}:${parsed.port || '5432'}`;
}
