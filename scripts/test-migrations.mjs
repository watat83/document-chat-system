import { PGlite } from '@electric-sql/pglite';
import { readdir, readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const db = new PGlite();
try {
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated;`);
  const migrations = (await readdir('prisma/migrations', { withFileTypes: true }))
    .filter(entry => entry.isDirectory()).map(entry => entry.name).sort();
  for (const migration of migrations) {
    const sql = await readFile(`prisma/migrations/${migration}/migration.sql`, 'utf8');
    await db.transaction(tx => tx.exec(sql));
  }
  const { rows: unsafe } = await db.query(`SELECT relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND relkind='r' AND (NOT relrowsecurity OR
      has_table_privilege('anon',c.oid,'SELECT') OR has_table_privilege('authenticated',c.oid,'SELECT'))`);
  assert.deepEqual(unsafe, [], 'All application tables must be private');
  for (const role of ['anon', 'authenticated']) {
    await db.exec(`SET ROLE ${role}`);
    await assert.rejects(db.query('SELECT * FROM public.documents LIMIT 1'), error => error.code === '42501');
    await db.exec('RESET ROLE');
  }
  await db.query('SELECT "processingStartedAt" FROM billing_events LIMIT 1');
  await db.query('SELECT "acknowledgedAt" FROM security_incidents LIMIT 1');
  await db.query('SELECT revision FROM conversations LIMIT 1');
  await db.query('SELECT filters FROM saved_searches LIMIT 1');
  for (let i = 1; i <= 10; i++) {
    const { rows } = await db.query(`INSERT INTO rate_limit_counters (key, count, "resetAt")
      VALUES ('migration-test', 1, now() + interval '1 minute')
      ON CONFLICT (key) DO UPDATE SET count=rate_limit_counters.count+1 RETURNING count`);
    assert.equal(rows[0].count, i);
  }
  console.log(`Passed ${migrations.length} migrations, server access, browser-role isolation, and atomic counters.`);
} finally { await db.close(); }
