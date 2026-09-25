/**
 * Dual public sites
 * thefinancialrevolution.net — education library, programs, modules, tools
 * factsmoney.com — FACTS allocation engine
 *
 * Routes mount at /api/mod_sites
 * Host gate mounts at root via mountRoot(app) in module-loader
 */

'use strict';

const path = require('path');
const express = require('express');
const { asyncRoute } = require('../../module-error-boundary');
const catalog = require('../../public/tfr/catalog.js');

const TFR_ROOT = path.join(__dirname, '../../public/tfr');

const DEFAULT_TFR_HOSTS = [
  'thefinancialrevolution.net',
  'www.thefinancialrevolution.net',
  'tfr.localhost'
];

function tfrHosts() {
  const extra = (process.env.TFR_HOSTS || '')
    .split(',')
    .map(function (h) { return h.trim().toLowerCase(); })
    .filter(Boolean);
  return DEFAULT_TFR_HOSTS.concat(extra);
}

function hostnameOf(req) {
  const raw = (req.hostname || req.headers.host || '').toString().toLowerCase();
  return raw.split(':')[0];
}

function isTfrHost(req) {
  return tfrHosts().indexOf(hostnameOf(req)) !== -1;
}

/** Public tools + shared assets that still live in /public (not /public/tfr). */
const SHARED_PREFIXES = [
  '/api/',
  '/facts-funnel',
  '/credit-analysis',
  '/shopping-calculator',
  '/benefits-masterclass',
  '/legal-disclaimer.js',
  '/educational-disclaimer.js',
  '/compliance-disclaimer.js',
  '/analytics-tracker.js',
  '/tfr-host-gate.js',
  '/og-image',
  '/icons/',
  '/manifest'
];

function isSharedPath(p) {
  return SHARED_PREFIXES.some(function (prefix) {
    return p === prefix || p.indexOf(prefix) === 0;
  });
}

const tfrStatic = express.static(TFR_ROOT, {
  index: 'index.html',
  extensions: ['html'],
  fallthrough: true
});

function mountRoot(app) {
  app.use(function tfrHostGate(req, res, next) {
    if (!isTfrHost(req)) return next();
    const p = req.path || '/';
    if (isSharedPath(p)) return next();

    // Pretty paths → files in public/tfr
    if (p === '/' || p === '/index.html') {
      return res.sendFile(path.join(TFR_ROOT, 'index.html'));
    }

    tfrStatic(req, res, function () {
      // Unmatched TFR-host HTML navigations land on the TFR home
      if (req.method === 'GET' && (req.accepts('html') === 'html')) {
        return res.sendFile(path.join(TFR_ROOT, 'index.html'));
      }
      next();
    });
  });
}

const routes = express.Router();

routes.get('/health', asyncRoute(async function (req, res) {
  res.json({
    status: 'ok',
    version: '1.0.0',
    sites: {
      tfr: 'thefinancialrevolution.net',
      facts: 'factsmoney.com'
    }
  });
}));

routes.get('/identity', asyncRoute(async function (req, res) {
  const tfr = isTfrHost(req);
  res.json({
    site: tfr ? 'tfr' : 'facts',
    name: tfr ? 'The Financial Revolution' : 'FACTS',
    domain: tfr ? 'thefinancialrevolution.net' : 'factsmoney.com',
    host: hostnameOf(req)
  });
}));

routes.get('/catalog', asyncRoute(async function (req, res) {
  const type = String(req.query.type || '').toLowerCase();
  if (type && catalog[type]) {
    return res.json({ ok: true, type: type, items: catalog[type] });
  }
  res.json({
    ok: true,
    brand: catalog.brand,
    library: catalog.library,
    programs: catalog.programs,
    modules: catalog.modules,
    tools: catalog.tools
  });
}));

module.exports = {
  metadata: {
    name: 'Public Sites',
    version: '1.0.0',
    requiredCoreVersion: '1.0.0',
    defaultEnabled: true
  },
  routes: routes,
  mountRoot: mountRoot,
  healthCheck: async function () {
    return {
      module: 'mod_sites',
      status: 'ok',
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      tfrRoot: TFR_ROOT
    };
  }
};
