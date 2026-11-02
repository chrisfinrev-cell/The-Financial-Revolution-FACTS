'use strict';

/**
 * Link Bucket 2 debt ledger (`debts`) to forensic credit audit items.
 * Exposes sketch name `bucket_debt_obligations` as a view.
 */
module.exports = {
  name: 'debts_audit_item_link',
  up: async (client) => {
    await client.query(`
      ALTER TABLE debts
        ADD COLUMN IF NOT EXISTS audit_item_id INTEGER REFERENCES credit_audit_items(id) ON DELETE SET NULL
    `);
    await client.query(`
      ALTER TABLE debts
        ADD COLUMN IF NOT EXISTS status VARCHAR(50) NOT NULL DEFAULT 'active'
    `);
    await client.query(`
      ALTER TABLE debts
        ADD COLUMN IF NOT EXISTS source VARCHAR(64) DEFAULT 'manual'
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_debts_audit_item_id ON debts (audit_item_id)
    `);
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_debts_user_audit_item_unique
        ON debts (user_id, audit_item_id)
        WHERE audit_item_id IS NOT NULL
    `);
    await client.query(`
      CREATE OR REPLACE VIEW bucket_debt_obligations AS
      SELECT
        id,
        user_id,
        audit_item_id,
        name AS creditor_name,
        balance,
        COALESCE(current_payment, minimum_payment) AS monthly_payment,
        COALESCE(status, 'active') AS status,
        created_at,
        updated_at,
        source,
        interest_rate,
        notes
      FROM debts
    `);
  }
};
