import { readdir, readFile } from 'node:fs/promises';
import { loadEnvironment } from '@sdj/config';
import { pg, databaseTLS } from '@sdj/infrastructure';
async function main(): Promise<void> {
  loadEnvironment();
  const url = process.env['DATABASE_URL_MIGRATOR'];
  if (!url) throw new Error('MIGRATOR_REQUIRED');
  if (new URL(url).port === '6543') throw new Error('SESSION_POOLER_REQUIRED');
  const client = new pg.Client({
    connectionString: url,
    ssl: databaseTLS(),
    connectionTimeoutMillis: 10000,
  });
  await client.connect();
  try {
    await client.query("SELECT pg_advisory_lock(hashtextextended('sdj:migrations',0))");
    const remote = await client.query<{ version: string }>(
      'SELECT version FROM supabase_migrations.schema_migrations ORDER BY version'
    );
    const applied = new Set(remote.rows.map((row) => row.version));
    const files = (await readdir('supabase/migrations'))
      .filter((f) => /^\d{14}_.+\.sql$/.test(f))
      .sort();
    for (const file of files) {
      const version = file.slice(0, 14);
      process.stdout.write(`${applied.has(version) ? 'applied' : 'pending'} ${file}\n`);
      if (applied.has(version) || process.argv.includes('--status')) continue;
      await client.query('BEGIN');
      try {
        const sql = await readFile('supabase/migrations/' + file, 'utf8');
        await client.query(sql);
        await client.query(
          'INSERT INTO supabase_migrations.schema_migrations(version,name,statements) VALUES($1,$2,$3)',
          [version, file.slice(15, -4), [sql]]
        );
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    }
  } finally {
    await client.end();
  }
}
main().catch(() => {
  process.stderr.write(
    'MIGRATION_FAILED: isi DATABASE_URL_MIGRATOR di .env utama dan periksa izin/history migrasi; credential tidak dicetak.\n'
  );
  process.exitCode = 1;
});
