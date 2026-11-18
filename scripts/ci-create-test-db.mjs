/**
 * Creates livingspace_test for CI / local verify when it does not exist.
 * Uses DATABASE_URL (dev) as the admin connection. Never targets production names.
 */
import { existsSync, readFileSync } from 'node:fs';
import pg from 'pg';

if (!process.env.DATABASE_URL && existsSync('.env')) {
  for (const line of readFileSync('.env', 'utf8').split('\n')) {
    const match = line.match(/^DATABASE_URL=(.*)$/);
    if (match) {
      process.env.DATABASE_URL = match[1].trim().replace(/^['"]|['"]$/g, '');
    }
  }
}

const sourceUrl = process.env.DATABASE_URL;
if (!sourceUrl) {
  console.error('DATABASE_URL is required');
  process.exit(1);
}

const parsed = new URL(sourceUrl);
const host = parsed.hostname;
if (host !== 'localhost' && host !== '127.0.0.1') {
  console.error('Refusing to create test DB on non-localhost host');
  process.exit(1);
}

const client = new pg.Client({ connectionString: sourceUrl });
await client.connect();
try {
  const existing = await client.query(
    `SELECT 1 FROM pg_database WHERE datname = 'livingspace_test'`,
  );
  if (existing.rowCount === 0) {
    await client.query('CREATE DATABASE livingspace_test');
    console.log('Created database livingspace_test');
  } else {
    console.log('Database livingspace_test already exists');
  }
} finally {
  await client.end();
}
