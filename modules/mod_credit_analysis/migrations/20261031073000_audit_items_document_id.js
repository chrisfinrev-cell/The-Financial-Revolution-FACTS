'use strict';

/**
 * Align credit audit checklist + letter archive with product sketch:
 *   audit_items / generated_dispute_letters
 *
 * FACTS adaptations (vs sketch):
 *   - user_id INTEGER → users(id)  (not UUID)
 *   - document_id → user_documents(id)  (not document_vault)
 *   - Physical tables remain credit_audit_items / credit_audit_letters
 *   - Views expose sketch names for reporting / external tooling
 */
module.exports = {
  name: 'mod_credit_analysis_audit_items_document_id',
  up: async (client) => {
    await client.query(`
      ALTER TABLE credit_audit_items
        ADD COLUMN IF NOT EXISTS document_id INTEGER REFERENCES user_documents(id) ON DELETE CASCADE
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS credit_audit_items_document_idx
        ON credit_audit_items (document_id)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS credit_audit_items_user_idx
        ON credit_audit_items (user_id)
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS credit_audit_letters (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        audit_item_id INTEGER REFERENCES credit_audit_items(id) ON DELETE CASCADE,
        analysis_id INTEGER REFERENCES credit_analyses(id) ON DELETE SET NULL,
        bureau VARCHAR(64),
        letter_content TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS credit_audit_letters_user_idx
        ON credit_audit_letters (user_id, created_at DESC)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS credit_audit_letters_item_idx
        ON credit_audit_letters (audit_item_id)
    `);

    await client.query(`
      CREATE OR REPLACE VIEW audit_items AS
      SELECT
        id,
        user_id,
        document_id,
        COALESCE(creditor, label) AS account,
        COALESCE(bureau, '') AS bureau,
        item_type AS type,
        details,
        resolved,
        resolved_at,
        created_at,
        updated_at,
        analysis_id,
        item_key,
        label,
        creditor,
        amount,
        letter_type,
        meta
      FROM credit_audit_items
    `);
    await client.query(`
      CREATE OR REPLACE VIEW generated_dispute_letters AS
      SELECT
        id,
        user_id,
        audit_item_id,
        COALESCE(bureau, '') AS bureau,
        letter_content,
        created_at,
        analysis_id
      FROM credit_audit_letters
    `);
  }
};
