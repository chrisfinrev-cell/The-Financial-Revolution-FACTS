'use strict';

/**
 * Smoke-test mod_ledger health + accounts without booting full server.js.
 *
 * Usage:
 *   node scripts/smoke-mod-ledger.js
 *   PORT=4000 node scripts/smoke-mod-ledger.js   # listen only (manual curl)
 */

const express = require('express');
const jwt = require('jsonwebtoken');
const { pool } = require('../db/pool');
const { routes, ensureLedgerSchema } = require('../modules/mod_ledger');

const PORT = Number(process.env.PORT || 4000);
const JWT_SECRET = process.env.JWT_SECRET || 'smoke-test-jwt-secret-at-least-32-chars-long!!';

async function main() {
  process.env.JWT_SECRET = JWT_SECRET;
  await ensureLedgerSchema(pool);

  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.session = req.session || {};
    next();
  });
  app.use('/api/mod_ledger', routes);

  const server = app.listen(PORT, async () => {
    const base = `http://127.0.0.1:${PORT}`;
    console.log(`[smoke] listening on ${base}`);

    try {
      const healthRes = await fetch(`${base}/api/mod_ledger/health`);
      const healthBody = await healthRes.json();
      console.log('1) GET /api/mod_ledger/health →', healthRes.status, JSON.stringify(healthBody));

      const token = jwt.sign({ userId: 1 }, JWT_SECRET, { expiresIn: '10m' });
      const acctRes = await fetch(`${base}/api/mod_ledger/accounts`, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      const acctBody = await acctRes.json();
      console.log('2) GET /api/mod_ledger/accounts →', acctRes.status, JSON.stringify(acctBody));

      if (healthRes.status !== 200 || acctRes.status !== 200) process.exitCode = 1;
    } catch (err) {
      console.error('[smoke] failed:', err.message);
      process.exitCode = 1;
    } finally {
      server.close();
      await pool.end().catch(() => {});
    }
  });
}

main().catch(async (err) => {
  console.error(err);
  await pool.end().catch(() => {});
  process.exit(1);
});
