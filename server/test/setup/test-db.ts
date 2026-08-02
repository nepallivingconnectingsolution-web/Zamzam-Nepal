import { readFileSync, readdirSync } from 'fs';
import path from 'path';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import * as schema from '../../src/database/schema';
import type { Database } from '../../src/database/database.module';

/**
 * Boots a fresh, isolated Postgres-compatible database in-process (no
 * Docker, no network) by replaying every migration in ./drizzle against
 * pglite, then wraps it with the same drizzle schema the app uses.
 *
 * One instance per test file (or per test, for stronger isolation) —
 * pglite is cheap enough to create fresh rather than truncate-between-tests.
 *
 * Cast to `Database` (NodePgDatabase) even though this is technically a
 * PgliteDatabase: both are thin wrappers around the same drizzle
 * query-builder core and every service in this codebase only calls the
 * generic chainable API (select/insert/update/transaction/execute), so the
 * runtime shape is compatible. This is a test-only cast — application code
 * never sees it.
 */
export async function createTestDb(): Promise<{ db: Database; close: () => Promise<void> }> {
  const client = new PGlite();
  const migrationsDir = path.resolve(__dirname, '../../drizzle');
  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  for (const file of files) {
    const sql = readFileSync(path.join(migrationsDir, file), 'utf-8');
    const statements = sql
      .split('--> statement-breakpoint')
      .map((s) => s.trim())
      .filter(Boolean);
    for (const statement of statements) {
      await client.exec(statement);
    }
  }

  const db = drizzle(client, { schema }) as unknown as Database;
  return { db, close: () => client.close() };
}
