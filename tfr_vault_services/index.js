/**
 * Lending Desk Module (tfr_vault_services)
 * EDUCATIONAL / NON-CUSTODIAL placeholder shell.
 *
 * Active lending simulation logic lives in modules/mod_lending_desk.
 * This root module remains a dormant health endpoint only — no fund movement,
 * no P2P matching, no interest pools, no loan origination.
 */

const express = require('express');
const { asyncRoute } = require('../module-error-boundary');
const { educationalMetaMiddleware } = require('../modules/shared/edu-compliance');

const router = express.Router();
router.use(educationalMetaMiddleware);
router.get('/health', asyncRoute(async (req, res) => {
  res.json({
    status: 'ok',
    version: '1.0.0',
    simulation_only: true,
    custodial: false,
    note: 'Educational vault shell only — no lending origination or fund custody.',
  });
}));

module.exports = {
  metadata: {
    name: 'Lending Desk',
    version: '1.0.0',
    requiredCoreVersion: '1.0.0',
    defaultEnabled: false
  },

  routes: router,

  healthCheck: async (pool) => ({
    module: 'tfr_vault_services',
    status: 'ok',
    version: '1.0.0',
    timestamp: new Date().toISOString()
  })
};
