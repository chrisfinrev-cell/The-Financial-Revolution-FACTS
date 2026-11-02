/**
 * User Preferences
 * Cross-device inactivity timeout and related profile preferences.
 *
 * Canonical DB column: users.inactivity_timeout (minutes)
 * Legacy mirror:       users.timeout_minutes (kept in sync)
 *
 * Public routes via mountRoot:
 *   GET  /api/user/preferences → { inactivityTimeout }
 *   POST /api/user/preferences → { inactivityTimeout }
 */

'use strict';

const express = require('express');
const { pool } = require('../../db/pool');
const { asyncRoute } = require('../../module-error-boundary');
const { requireAuth } = require('../../routes/auth');

const VALID_TIMEOUTS = [5, 10, 15, 30, 60];
const DEFAULT_TIMEOUT = 15;

function normalizeTimeout(value) {
  const n = parseInt(value, 10);
  if (!VALID_TIMEOUTS.includes(n)) return null;
  return n;
}

async function readTimeoutMinutes(userId) {
  const result = await pool.query(
    `SELECT
       COALESCE(inactivity_timeout, timeout_minutes, $2) AS inactivity_timeout
     FROM users
     WHERE id = $1`,
    [userId, DEFAULT_TIMEOUT]
  );
  if (!result.rows[0]) return null;
  return parseInt(result.rows[0].inactivity_timeout, 10) || DEFAULT_TIMEOUT;
}

async function writeTimeoutMinutes(userId, minutes) {
  await pool.query(
    `UPDATE users
        SET inactivity_timeout = $1,
            timeout_minutes = $1,
            updated_at = NOW()
      WHERE id = $2`,
    [minutes, userId]
  );
}

const router = express.Router();

router.get('/health', asyncRoute(async function (req, res) {
  let columnReady = false;
  try {
    const r = await pool.query(
      `SELECT EXISTS (
         SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'users'
            AND column_name = 'inactivity_timeout'
       ) AS ok`
    );
    columnReady = !!(r.rows[0] && r.rows[0].ok);
  } catch (_) { /* ignore */ }
  res.json({
    status: 'ok',
    inactivity_timeout_column: columnReady,
    valid_timeouts: VALID_TIMEOUTS,
    default_timeout: DEFAULT_TIMEOUT
  });
}));

router.get(
  '/preferences',
  requireAuth,
  asyncRoute(async function (req, res) {
    const inactivityTimeout = await readTimeoutMinutes(req.userId);
    if (inactivityTimeout == null) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json({ inactivityTimeout: inactivityTimeout });
  })
);

router.post(
  '/preferences',
  requireAuth,
  asyncRoute(async function (req, res) {
    const body = req.body || {};
    const raw =
      body.inactivityTimeout != null
        ? body.inactivityTimeout
        : body.inactivity_timeout != null
          ? body.inactivity_timeout
          : body.timeout_minutes;
    const inactivityTimeout = normalizeTimeout(raw);
    if (inactivityTimeout == null) {
      return res.status(400).json({
        error:
          'Invalid inactivityTimeout. Must be one of: ' + VALID_TIMEOUTS.join(', ')
      });
    }
    await writeTimeoutMinutes(req.userId, inactivityTimeout);
    res.json({ success: true, inactivityTimeout: inactivityTimeout });
  })
);

function mountRoot(app) {
  // Mount at /api/user so paths are /api/user/preferences
  app.use('/api/user', router);
}

module.exports = {
  metadata: {
    name: 'User Preferences',
    version: '1.0.0',
    requiredCoreVersion: '1.0.0',
    defaultEnabled: true
  },
  routes: router,
  mountRoot: mountRoot,
  healthCheck: async function (dbPool) {
    const p = dbPool || pool;
    let columnReady = false;
    try {
      const r = await p.query(
        `SELECT EXISTS (
           SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = 'users'
              AND column_name = 'inactivity_timeout'
         ) AS ok`
      );
      columnReady = !!(r.rows[0] && r.rows[0].ok);
    } catch (_) { /* ignore */ }
    return {
      module: 'mod_user_prefs',
      status: columnReady ? 'ok' : 'degraded',
      inactivity_timeout_column: columnReady,
      timestamp: new Date().toISOString()
    };
  }
};
