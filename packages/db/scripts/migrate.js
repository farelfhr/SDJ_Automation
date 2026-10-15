/**
 * Migration runner
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';

const { Pool } = pg;

const __dirname = dirname(fileURLToPath(import.meta.url));

async function runMigrations() {
  const databaseUrl = process.env['DATABASE_URL'] ?? 'postgresql://postgres:postgres@localhost:5432/sdj_assistant';

  const pool = new Pool({ connectionString: databaseUrl });

  try {
    console.log('Running migrations...');

    // Create migrations tracking table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS _migrations (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL UNIQUE,
        executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    // Get list of migration files
    const migrationFiles = [
      '001_initial_schema.sql',
    ];

    for (const file of migrationFiles) {
      // Check if already executed
      const result = await pool.query(
        'SELECT 1 FROM _migrations WHERE name = $1',
        [file]
      );

      if (result.rows.length > 0) {
        console.log(`  Skipping ${file} (already executed)`);
        continue;
      }

      // Execute migration
      console.log(`  Running ${file}...`);
      const sql = readFileSync(join(__dirname, file), 'utf8');
      await pool.query(sql);
      await pool.query('INSERT INTO _migrations (name) VALUES ($1)', [file]);
      console.log(`  ✓ ${file} completed`);
    }

    console.log('Migrations completed successfully!');
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runMigrations();
