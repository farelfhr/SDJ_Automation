/**
 * Migration rollback script
 */

import pg from 'pg';

const { Pool } = pg;

async function rollback() {
  const databaseUrl = process.env['DATABASE_URL'] ?? 'postgresql://postgres:postgres@localhost:5432/sdj_assistant';

  const pool = new Pool({ connectionString: databaseUrl });

  try {
    console.log('Rolling back last migration...');

    // Get last migration
    const result = await pool.query(
      'SELECT name FROM _migrations ORDER BY executed_at DESC LIMIT 1'
    );

    if (result.rows.length === 0) {
      console.log('No migrations to rollback');
      return;
    }

    const lastMigration = result.rows[0].name;
    console.log(`Rolling back: ${lastMigration}`);

    // Note: In production, you'd have rollback SQL files
    // For now, this is a placeholder
    console.log('Rollback not implemented - would need rollback SQL file');

  } catch (error) {
    console.error('Rollback failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

rollback();
