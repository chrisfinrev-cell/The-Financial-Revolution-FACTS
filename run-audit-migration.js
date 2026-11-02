'use strict';

const fs = require('fs');
const path = require('path');
const { pool } = require('./db/pool'); // pg pool instance

async function runMigration() {
  try {
    const filePath = path.join(__dirname, 'migrations/001_create_audit_and_dispute_tables.sql');
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
