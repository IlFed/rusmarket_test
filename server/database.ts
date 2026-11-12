import { PGlite } from '@electric-sql/pglite';
import postgres from 'postgres';
import { mkdir } from 'node:fs/promises';

export interface Database {
  query<T extends Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
  close(): Promise<void>;
}

export async function createDatabase(
  location = process.env.DATABASE_URL || process.env.DATA_DIR || './data/postgres',
): Promise<Database> {
  let db: Database;
  if (location.startsWith('postgres')) {
    const client = postgres(location, { max: 5, connect_timeout: 10, idle_timeout: 20 });
    db = {
      query: async <T extends Record<string, unknown>>(sql: string, params: unknown[] = []) => {
        // Keep serialized JSON as text: postgres.js otherwise serializes it again
        // when PostgreSQL infers a JSONB parameter, unlike PGlite's binding behavior.
        const values = params.map((value) =>
          typeof value === 'string' ? client.typed(value, 25) : value,
        );
        return (await client.unsafe(
          sql,
          values as Parameters<typeof client.unsafe>[1],
        )) as unknown as T[];
      },
      close: () => client.end({ timeout: 5 }),
    };
  } else {
    if (location !== 'memory://') await mkdir(location, { recursive: true });
    const client = new PGlite(location === 'memory://' ? undefined : location);
    db = {
      query: async <T extends Record<string, unknown>>(sql: string, params: unknown[] = []) =>
        (await client.query<T>(sql, params)).rows,
      close: () => client.close(),
    };
  }
  await db.query(`CREATE TABLE IF NOT EXISTS schedules (
    id TEXT PRIMARY KEY,
    revision INTEGER NOT NULL DEFAULT 0,
    shifts JSONB NOT NULL DEFAULT '[]'::jsonb,
    published_shifts JSONB,
    published_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`);
  await db.query("INSERT INTO schedules (id) VALUES ('main') ON CONFLICT DO NOTHING");
  return db;
}
