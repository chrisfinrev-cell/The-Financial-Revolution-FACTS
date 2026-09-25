/**
 * lending — API alias module
 *
 * Mounts at /api/lending and proxies to mod_lending_desk routes.
 * This satisfies the spec requirement: GET /api/lending/scorecard
 *
 * All business logic lives in modules/mod_lending_desk/index.js
 */

'use strict';

// Re-use the lending desk routes directly
const lendingDesk = require('../mod_lending_desk/index');

module.exports = {
  metadata: {
    name: 'Lending API Alias',
    moduleId: 'lending',
    version: '1.0.0',
    requiredCoreVersion: '1.0.0',
    defaultEnabled: false,
    internal: true // alias — no UI; stay off until module-loader honors flags
  },

  // Share the same router instance
  routes: lendingDesk.routes,

  healthCheck: lendingDesk.healthCheck
};
