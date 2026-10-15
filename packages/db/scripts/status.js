/**
 * Migration status script
 */

import pg from 'pg';

const { Pool } = pg;

async function status() {
  const databaseUrl = process.env['DATABASE_URL'] ?? 'postgresql://postgres:postgres@localhost:5432/sdj_assistant';

  const pool = new Pool({ connectionString: databaseUrl });

  try {
    // Check if migrations table exists
    const tableExists = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name = '_migrations'
      )
    `);

    if (!tableExists.rows[0].exists) {
      console.log('No migrations have been run yet');
      return;
    }

    // Get all migrations
    const result = await pool.query(
      'SELECT name, executed_at FROM _migrations ORDER BY executed_at'
    );

    console.log('Migrations status:');
    console.log('==================');

    for (const row of result.rows) {
      console.log(`✓ ${row.name} - ${row.executed_at}`);
    }

    console.log(`\nTotal: ${result.rows.length} migrations executed`);

  } catch (error) {
    console.error('Status check failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

status();
