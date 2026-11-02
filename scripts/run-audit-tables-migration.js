'use strict';

/**
 * One-off runner for migrations/001_create_audit_and_dispute_tables.sql
 *
 * Usage:
 *   node scripts/run-audit-tables-migration.js
 *
 * Requires DATABASE_URL. Deploy path also covers this via migrate.js
 * (migrations/20261031090000_audit_items_physical_tables.js) and boot self-heal.
 */

const fs = require('fs');
const path = require('path');
const { pool } = require('../db/pool');

async function runMigration() {
  if (!process.env.DATABASE_URL) {
    console.error('Migration failed: DATABASE_URL is not set.');
    process.exitCode = 1;
    return;
  }

  try {
    const filePath = path.join(__dirname, '..', 'migrations', '001_create_audit_and_dispute_tables.sql');
    const sql = fs.readFileSync(filePath, 'utf8');

    await pool.query(sql);
    console.log('Audit tables migration executed successfully.');
  } catch (err) {
    console.error('Migration failed:', err.message);
    process.exitCode = 1;
  } finally {
    await pool.end().catch(() => {});
  }
}

runMigration();
