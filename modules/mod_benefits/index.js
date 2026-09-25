/**
 * Benefits Hub Module
 * Employee benefits and perks
 */

const express = require('express');
const { asyncRoute } = require('../../module-error-boundary');

module.exports = {
  metadata: {
    name: 'Benefits Hub',
    version: '1.0.0',
    requiredCoreVersion: '1.0.0',
    defaultEnabled: false
  },

  routes: express.Router()
    .get('/health', asyncRoute(async (req, res) => {
      res.json({ status: 'ok', version: '1.0.0' });
    })),

  healthCheck: async (pool) => ({
    module: 'mod_benefits',
    status: 'ok',
    version: '1.0.0',
    timestamp: new Date().toISOString()
  })
};
