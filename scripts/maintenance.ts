import { loadEnvironment } from '@sdj/config';
import { pg, databaseTLS, Maintenance } from '@sdj/infrastructure';
import { setTimeout as delay } from 'node:timers/promises';
async function main(): Promise<void> {
  loadEnvironment();
  const url = process.env['DATABASE_URL_MAINTENANCE'];
  if (!url || !new URL(url).username.startsWith('sdj_maintenance.'))
    throw new Error('MAINTENANCE_ROLE_REQUIRED');
  const pool = new pg.Pool({
    connectionString: url,
    ssl: databaseTLS(),
    max: 1,
    connectionTimeoutMillis: 10000,
  });
  const controller = new AbortController();
  for (const signal of ['SIGINT', 'SIGTERM'] as const)
    process.once(signal, () => controller.abort());
  try {
    do {
      const result = await new Maintenance(pool).run();
      process.stdout.write(JSON.stringify({ maintenance: result }) + '\n');
      if (!process.argv.includes('--watch')) break;
      await delay(3600000, undefined, { signal: controller.signal }).catch(() => {});
    } while (!controller.signal.aborted);
  } finally {
    await pool.end();
  }
}
main().catch(() => {
  process.stderr.write('MAINTENANCE_FAILED\n');
  process.exitCode = 1;
});
