import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { missingManagedIntegrityConstraints } from './managed-integrity.js';

describe('managed database integrity', () => {
  it('keeps SQL-managed checks, keys, and society foreign keys in migration history', () => {
    const root = join(process.cwd(), 'prisma/migrations');
    const sql = readdirSync(root)
      .filter((entry) => statSync(join(root, entry)).isDirectory())
      .sort()
      .map((entry) =>
        readFileSync(join(root, entry, 'migration.sql'), 'utf8'),
      );
    expect(missingManagedIntegrityConstraints(sql)).toEqual([]);
  });

  it('reports a constraint that a later migration drops', () => {
    const missing = missingManagedIntegrityConstraints([
      'ALTER TABLE "signup_intents" ADD CONSTRAINT "signup_intents_choice_check" CHECK (true);',
      'ALTER TABLE "signup_intents" DROP CONSTRAINT "signup_intents_choice_check";',
    ]);
    expect(missing).toContain('signup_intents_choice_check');
  });
});