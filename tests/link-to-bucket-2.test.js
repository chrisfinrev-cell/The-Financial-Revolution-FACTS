'use strict';

/**
 * API tests for Bucket 2 link endpoint.
 * Isolates Express route logic with a mocked pg pool (no live DB).
 */

const request = require('supertest');
const express = require('express');

jest.mock('../db/pool', () => ({
  pool: {
    query: jest.fn(),
    on: jest.fn(),
    end: jest.fn()
  }
}));

const { pool } = require('../db/pool');
const { routes } = require('../modules/mod_credit_analysis');

function buildApp() {
  const app = express();
  app.use(express.json());
  // Session auth used by FACTS (sketch used verifyToken / req.user)
  app.use((req, _res, next) => {
    req.session = { userId: 1 };
    next();
  });
  app.use('/api/mod_credit_analysis', routes);
  return app;
}

describe('POST /api/mod_credit_analysis/audit-items/link-to-bucket-2', () => {
  const app = buildApp();

  beforeEach(() => {
    jest.clearAllMocks();
    pool.query.mockImplementation(async (sql) => {
      // Default: schema ensure / unrelated lookups succeed with empty rows
      const s = String(sql);
      if (/INSERT INTO debts/i.test(s)) {
        return {
          rows: [{
            id: 42,
            name: 'Chase Collection',
            balance: 1250.5,
            minimum_payment: 50,
            current_payment: 50,
            status: 'active',
            audit_item_id: 10,
            created_at: new Date().toISOString()
          }]
        };
      }
      return { rows: [] };
    });
  });

  test('should return 400 if auditItemId is missing', async () => {
    const response = await request(app)
      .post('/api/mod_credit_analysis/audit-items/link-to-bucket-2')
      .send({ balance: 500.0 });

    expect(response.status).toBe(400);
    expect(response.body).toHaveProperty('error', 'Missing audit item reference.');
  });

  test('should return 404 if audit item does not exist or unauthorized', async () => {
    pool.query.mockImplementation(async () => ({ rows: [] }));

    const response = await request(app)
      .post('/api/mod_credit_analysis/audit-items/link-to-bucket-2')
      .send({ auditItemId: 999 });

    expect(response.status).toBe(404);
    expect(response.body).toHaveProperty('error', 'Audit item not found or unauthorized.');
  });

  test('should successfully link debt item to Bucket 2 ledger', async () => {
    pool.query.mockImplementation(async (sql) => {
      const s = String(sql);

      // authorizeAuditItem join
      if (/FROM\s+audit_items\s+i/i.test(s) && /JOIN\s+credit_analyses/i.test(s)) {
        return {
          rows: [{
            id: 10,
            user_id: 1,
            analysis_id: 7,
            account: 'Chase Collection',
            type: 'collection',
            bureau: 'Experian',
            label: 'Chase Collection',
            creditor: 'Chase Collection',
            amount: 1250.5,
            resolved: false,
            analysis_user_id: 1,
            access_token: 'test-token',
            user_name: 'Test User'
          }]
        };
      }

      // linkAuditItemToBucket2 ownership SELECT
      if (/FROM\s+audit_items/i.test(s) && /user_id\s*=\s*\$2/i.test(s)) {
        return {
          rows: [{
            id: 10,
            user_id: 1,
            analysis_id: 7,
            account: 'Chase Collection',
            type: 'collection',
            bureau: 'Experian',
            label: 'Chase Collection',
            creditor: 'Chase Collection',
            amount: 1250.5,
            resolved: false
          }]
        };
      }

      // No existing debt by audit_item_id
      if (/FROM\s+debts/i.test(s) && /audit_item_id/i.test(s) && /SELECT\s+id/i.test(s)) {
        return { rows: [] };
      }

      // No name match
      if (/FROM\s+debts/i.test(s) && /LOWER\(name\)/i.test(s)) {
        return { rows: [] };
      }

      if (/INSERT INTO debts/i.test(s)) {
        return {
          rows: [{
            id: 42,
            name: 'Chase Collection',
            balance: 1250.5,
            minimum_payment: 50,
            current_payment: 50,
            status: 'active',
            audit_item_id: 10,
            created_at: new Date().toISOString()
          }]
        };
      }

      // DDL / ensure schema
      return { rows: [] };
    });

    const response = await request(app)
      .post('/api/mod_credit_analysis/audit-items/link-to-bucket-2')
      .send({
        auditItemId: 10,
        balance: 1250.5,
        monthlyPayment: 50.0
      });

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
    expect(response.body.bucketDebtId).toBe(42);
    expect(response.body.message).toContain('successfully linked');
  });
});
