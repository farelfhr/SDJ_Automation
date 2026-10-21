import { AsyncLocalStorage } from 'node:async_hooks';
import pg from 'pg';
import { readFileSync } from 'node:fs';
import { rootCertificates } from 'node:tls';
import type { ActorContext } from '@sdj/domain';
export class Database {
  readonly app: pg.Pool;
  readonly ingress: pg.Pool;
  readonly scheduler: pg.Pool;
  private readonly pinned = new AsyncLocalStorage<pg.PoolClient>();
  constructor(
    urls: { app: string; ingress: string; scheduler: string },
    options: { ssl?: boolean; allowPrivileged?: boolean } = {}
  ) {
    const pool = (url: string): pg.Pool => {
      const parsed = new URL(url);
      if (
        !options.allowPrivileged &&
        ['postgres', 'service_role'].includes(parsed.username.split('.')[0] ?? '')
      )
        throw new Error('RUNTIME_PRIVILEGED_ROLE_FORBIDDEN');
      if (parsed.port === '6543') throw new Error('SESSION_POOLER_REQUIRED');
      const secure = options.ssl ?? !['localhost', '127.0.0.1', '::1'].includes(parsed.hostname);
      // pg handles sslmode=require by disabling certificate checks. Strip URL TLS options and enforce verification explicitly.
      for (const key of ['sslmode', 'sslcert', 'sslkey', 'sslrootcert'])
        parsed.searchParams.delete(key);
      return new pg.Pool({
        connectionString: parsed.toString(),
        max: 4,
        connectionTimeoutMillis: 8000,
        idleTimeoutMillis: 30000,
        statement_timeout: 10000,
        ssl: secure ? databaseTLS() : false,
      });
    };
    this.app = pool(urls.app);
    this.ingress = pool(urls.ingress);
    this.scheduler = pool(urls.scheduler);
    for (const p of [this.app, this.ingress, this.scheduler])
      p.on('error', () => process.stderr.write('DATABASE_POOL_ERROR\n'));
  }
  async tenant<T>(
    actor: Pick<ActorContext, 'userId'>,
    fn: (client: pg.PoolClient) => Promise<T>
  ): Promise<T> {
    const pinned = this.pinned.getStore(),
      client = pinned ?? (await this.app.connect());
    try {
      await client.query('BEGIN');
      await client.query("SELECT set_config('app.user_id',$1,true)", [actor.userId]);
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      if (!pinned) client.release();
    }
  }
  async lock<T>(id: string, fn: () => Promise<T>): Promise<T | null> {
    const client = await this.app.connect();
    let acquired = false;
    try {
      const result = await client.query<{ locked: boolean }>(
        'SELECT pg_try_advisory_lock(hashtextextended($1,0)) AS locked',
        ['tracker:' + id]
      );
      acquired = result.rows[0]?.locked ?? false;
      if (!acquired) return null;
      return await this.pinned.run(client, fn);
    } finally {
      if (acquired)
        await client
          .query('SELECT pg_advisory_unlock(hashtextextended($1,0))', ['tracker:' + id])
          .catch(() => {});
      client.release();
    }
  }
  async close(): Promise<void> {
    await Promise.all([this.app.end(), this.ingress.end(), this.scheduler.end()]);
  }
}
export type { PoolClient } from 'pg';
export function databaseTLS(): { rejectUnauthorized: true; ca: string[] } {
  const certificate = readFileSync(
    new URL('../../../config/certs/supabase-ca.crt', import.meta.url),
    'utf8'
  );
  return { rejectUnauthorized: true, ca: [...rootCertificates, certificate] };
}
export { pg };
