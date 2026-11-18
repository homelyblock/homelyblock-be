import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import {
  describeIntegrationDatabase,
  requireIntegrationDatabaseUrl,
} from '../test/integration/safe-test-database.ts';

function databaseUrlFromEnvFile(path: string): string | null {
  if (!existsSync(path)) return null;
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const separator = trimmed.indexOf('=');
    if (separator < 1) continue;
    const key = trimmed.slice(0, separator).trim();
    if (key !== 'DATABASE_URL_TEST') continue;
    let value = trimmed.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    return value.trim() || null;
  }
  return null;
}

if (!process.env.DATABASE_URL_TEST?.trim()) {
  const fromFile = databaseUrlFromEnvFile('.env');
  if (fromFile) process.env.DATABASE_URL_TEST = fromFile;
}

let databaseUrl: string;
try {
  databaseUrl = requireIntegrationDatabaseUrl();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
}

console.log(
  `Integration database selected: ${describeIntegrationDatabase(databaseUrl)}`,
);

const child = spawnSync(
  process.execPath,
  [
    './node_modules/vitest/vitest.mjs',
    'run',
    '--config',
    './vitest.config.integration.ts',
  ],
  { stdio: 'inherit', env: process.env },
);

process.exit(child.status ?? 1);
