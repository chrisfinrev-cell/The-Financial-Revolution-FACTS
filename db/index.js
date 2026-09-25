'use strict';
// db/index.js — shared query helper wrapping the pool
// All database access goes through named functions here; no inline pool.query outside db/

const { pool } = require('./pool');

async function query(text, params) {
  const start = Date.now();
  const result = await pool.query(text, params);
  const duration = Date.now() - start;
  if (duration > 500) console.warn(`[db] slow query (${duration}ms): ${text.slice(0, 80)}`);
  return result;
}

module.exports = { pool, query };