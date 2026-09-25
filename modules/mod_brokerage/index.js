/**
 * Brokerage Tracker Module — EDUCATIONAL / READ-ONLY
 *
 * Manual portfolio notes and asset tracking for literacy only.
 * Schema: mod_brokerage
 *
 * REGULATORY POSTURE:
 *   - No trade execution, order placement, or rebalancing hooks.
 *   - No Plaid investments product / brokerage trading APIs.
 *   - Stub routes return empty educational shells until UI-backed CRUD is added.
 *
 * Tables:
 * - mod_brokerage.assets
 * - mod_brokerage.transactions
 * - mod_brokerage.discipline
 */

const express = require('express');
const { asyncRoute } = require('../../module-error-boundary');
const { educationalMetaMiddleware } = require('../shared/edu-compliance');

const router = express.Router();
router.use(educationalMetaMiddleware);

router.get('/health', asyncRoute(async (req, res) => {
  res.json({
    status: 'ok',
    version: '1.0.0',
    lastMigration: 'TBD',
    trade_execution: false,
    read_only_tracking: true,
  });
}));

router.get('/assets', asyncRoute(async (req, res) => {
  res.json({ assets: [], educational_only: true, trade_execution: false });
}));

router.post('/assets', asyncRoute(async (req, res) => {
  // Manual educational note create (stub) — never places a market order
  res.status(201).json({ id: 1, educational_only: true, trade_execution: false });
}));

module.exports = {
  metadata: {
    name: 'Brokerage Tracker',
    version: '1.0.0',
    requiredCoreVersion: '1.0.0',
    defaultEnabled: true
  },

  routes: router,

  healthCheck: async (pool) => {
    try {
      const result = await pool.query(
        `SELECT EXISTS(
          SELECT 1 FROM information_schema.schemata
          WHERE schema_name = 'mod_brokerage'
        )`
      );

      return {
        module: 'mod_brokerage',
        status: result.rows[0].exists ? 'ok' : 'schema_missing',
        version: '1.0.0',
        timestamp: new Date().toISOString()
      };
    } catch (err) {
      return {
        module: 'mod_brokerage',
        status: 'error',
        error: err.message,
        timestamp: new Date().toISOString()
      };
    }
  }
};
