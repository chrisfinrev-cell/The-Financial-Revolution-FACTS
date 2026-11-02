'use strict';

/**
 * mod_ledger — Master user accounts + allocation transaction ledger
 *
 * Educational / bookkeeping layer for FACTS hub→spoke allocation tracking.
 * Does not move bank funds.
 *
 * Routes (mounted at /api/mod_ledger when enabled):
 *   GET /health
 *   GET /accounts — list active ledger accounts for session user
 */

const express = require('express');
const { pool } = require('../../db/pool');
const { asyncRoute } = require('../../module-error-boundary');
const { ensureLedgerSchema, BUCKETS, ACCOUNT_BUCKETS } = require('./schema');

const router = express.Router();

function resolveUserId(req) {
  if (req.session?.userId) return Number(req.session.userId) || null;

  const authHeader = String(req.headers.authorization || '');
  if (!authHeader.startsWith('Bearer ') || !process.env.JWT_SECRET) return null;
  try {
    const jwt = require('jsonwebtoken');
    const decoded = jwt.verify(authHeader.slice(7).trim(), process.env.JWT_SECRET);
    return Number(decoded.userId || decoded.id || decoded.sub) || null;
  } catch (_) {
    return null;
  }
}

router.get('/health', asyncRoute(async (_req, res) => {
  await ensureLedgerSchema(pool);
  const { rows } = await pool.query(
    `SELECT
       to_regclass('public.user_accounts') AS user_accounts,
       to_regclass('public.ledger_transactions') AS ledger_transactions`
  );
  return res.json({
    status: 'ok',
    module: 'mod_ledger',
    tables: rows[0],
    buckets: BUCKETS,
    account_buckets: ACCOUNT_BUCKETS
  });
}));

router.get('/accounts', asyncRoute(async (req, res) => {
  const userId = resolveUserId(req);
  if (!userId) return res.status(401).json({ error: 'Authentication required.' });
  await ensureLedgerSchema(pool);
  const { rows } = await pool.query(
    `SELECT account_id, account_name, account_type, bucket_category,
            current_balance, is_active, created_timestamp
     FROM user_accounts
     WHERE user_id = $1 AND is_active = TRUE
     ORDER BY
       CASE bucket_category
         WHEN 'HUB' THEN 0
         WHEN 'NEC' THEN 1
         WHEN 'VEL' THEN 2
         WHEN 'RES' THEN 3
         WHEN 'LIF' THEN 4
         WHEN 'GRO' THEN 5
         WHEN 'LEG' THEN 6
         ELSE 7
       END,
       account_name`,
    [userId]
  );
  return res.json({ accounts: rows });
}));

async function healthCheck() {
  try {
    await ensureLedgerSchema(pool);
    await pool.query('SELECT 1 FROM user_accounts LIMIT 1');
    return { status: 'healthy' };
  } catch (err) {
    return { status: 'unhealthy', error: err.message };
  }
}

module.exports = {
  metadata: {
    name: 'FACTS Ledger',
    version: '1.0.0',
    defaultEnabled: true
  },
  routes: router,
  healthCheck,
  ensureLedgerSchema,
  BUCKETS,
  ACCOUNT_BUCKETS
};
