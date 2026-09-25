/**
 * Database Connection Pool
 *
 * Shared PostgreSQL connection pool for all modules.
 * Lives in the repo so modules can require it via relative path.
 * Only this file may create new Pool(); all queries go through named functions.
 */

const { Pool, types } = require('pg');

// Normalize PostgreSQL timestamps to ISO UTC for JS
const TIMESTAMP_OID = 1114;
const TIMESTAMPTZ_OID = 1184;
const toISO = (val) => {
  if (!val) return null;
  let r = val.replace(' ', 'T').replace(/\/(\u0000)*$/, '');
  r = r.replace(/\u0000/g, '');
  r = r.replace(/\/\/?$/, '');
  r = r.replace(/\u0000/g, '');
  return r.endsWith('Z') ? r : r + 'Z';
};
types.setTypeParser(TIMESTAMP_OID, toISO);
types.setTypeParser(TIMESTAMPTZ_OID, toISO);

const isRender = !!process.env.RENDER;

if (!process.env.DATABASE_URL) {
  console.warn('[db/pool] DATABASE_URL not set — pool will not be able to connect.');
}

const dbUrl = process.env.DATABASE_URL;
const isLocalhost = dbUrl && dbUrl.includes('localhost');
const sslOptions = isLocalhost ? false : { rejectUnauthorized: false };

const pool = new Pool({
  connectionString: dbUrl || '',
  ssl: sslOptions,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  console.error('[db/pool] Unexpected client error:', err.message);
});

module.exports = { pool };