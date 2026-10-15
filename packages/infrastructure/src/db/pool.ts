/**
 * Database Pool
 *
 * PostgreSQL connection pool management.
 */

import pg from 'pg';

const { Pool } = pg;

let pool: pg.Pool | null = null;

/**
 * Create or get the database pool
 */
export function getPool(): pg.Pool {
  if (!pool) {
    const databaseUrl = process.env['DATABASE_URL'] ?? 'postgresql://postgres:postgres@localhost:5432/sdj_assistant';
    const poolSize = parseInt(process.env['DATABASE_POOL_SIZE'] ?? '10', 10);
    const idleTimeoutMs = parseInt(process.env['DATABASE_IDLE_TIMEOUT_MS'] ?? '30000', 10);

    pool = new Pool({
      connectionString: databaseUrl,
      max: poolSize,
      idleTimeoutMillis: idleTimeoutMs,
      allowExitOnIdle: false,
    });

    pool.on('error', (err) => {
      console.error('Unexpected database pool error:', err);
    });
  }
  return pool;
}

/**
 * Close the database pool
 */
export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

/**
 * Execute a query
 */
export async function query<T extends pg.QueryResultRow>(
  text: string,
  params?: unknown[]
): Promise<pg.QueryResult<T>> {
  const pool = getPool();
  const start = Date.now();
  const result = await pool.query<T>(text, params);
  const duration = Date.now() - start;

  if (process.env['LOG_LEVEL'] === 'debug') {
    console.log('Query executed:', { text, duration, rows: result.rowCount });
  }

  return result;
}

/**
 * Get a client from the pool for transactions
 */
export async function getClient(): Promise<pg.PoolClient> {
  const pool = getPool();
  return pool.connect();
}

/**
 * Execute a transaction
 */
export async function transaction<T>(
  fn: (client: pg.PoolClient) => Promise<T>
): Promise<T> {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Health check for database
 */
export async function checkDatabaseHealth(): Promise<{
  status: 'ok' | 'error';
  latencyMs?: number;
  message?: string;
}> {
  const start = Date.now();
  try {
    const pool = getPool();
    await pool.query('SELECT 1');
    return {
      status: 'ok',
      latencyMs: Date.now() - start,
    };
  } catch (error) {
    return {
      status: 'error',
      latencyMs: Date.now() - start,
      message: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

export { Pool };
export type { PoolClient, QueryResult, QueryResultRow } from 'pg';
