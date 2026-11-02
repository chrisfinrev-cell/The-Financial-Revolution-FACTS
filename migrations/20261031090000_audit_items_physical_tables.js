'use strict';

/**
 * Promote product-sketch tables to physical storage:
 *   audit_items, generated_dispute_letters
 * Migrates data from legacy credit_audit_* tables when present.
 */
module.exports = {
  name: 'audit_items_physical_tables',
  up: async (client) => {
    await client.query('BEGIN');
    try {
      await client.query(`DROP VIEW IF EXISTS generated_dispute_letters CASCADE`);
      await client.query(`DROP VIEW IF EXISTS audit_items CASCADE`);

      await client.query(`
        CREATE TABLE IF NOT EXISTS audit_items (
          id SERIAL PRIMARY KEY,
          user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
          document_id INTEGER REFERENCES user_documents(id) ON DELETE CASCADE,
          account VARCHAR(255) NOT NULL DEFAULT '',
          bureau VARCHAR(50) NOT NULL DEFAULT '',
          type VARCHAR(50) NOT NULL,
          details TEXT,
          resolved BOOLEAN DEFAULT FALSE,
          resolved_at TIMESTAMPTZ,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW(),
          analysis_id INTEGER REFERENCES credit_analyses(id) ON DELETE CASCADE,
          item_key VARCHAR(64),
          label TEXT,
          creditor TEXT,
          amount NUMERIC(12,2),
          letter_type VARCHAR(32),
          meta JSONB NOT NULL DEFAULT '{}'::jsonb
        )
      `);

      await client.query(`
        CREATE TABLE IF NOT EXISTS generated_dispute_letters (
          id SERIAL PRIMARY KEY,
          user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          audit_item_id INTEGER REFERENCES audit_items(id) ON DELETE CASCADE,
          bureau VARCHAR(50) NOT NULL DEFAULT '',
          letter_content TEXT NOT NULL,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          analysis_id INTEGER REFERENCES credit_analyses(id) ON DELETE SET NULL
        )
      `);

      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_audit_items_user_id ON audit_items(user_id)
      `);
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_audit_items_document_id ON audit_items(document_id)
      `);
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_audit_items_analysis_id ON audit_items(analysis_id)
      `);
      await client.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_audit_items_analysis_item_key
          ON audit_items (analysis_id, item_key)
          WHERE analysis_id IS NOT NULL AND item_key IS NOT NULL
      `);
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_generated_letters_user_id
          ON generated_dispute_letters(user_id)
      `);
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_generated_letters_item_id
          ON generated_dispute_letters(audit_item_id)
      `);

      // Copy legacy rows (preserve ids when possible)
      const legacy = await client.query(`
        SELECT to_regclass('public.credit_audit_items') AS reg
      `);
      if (legacy.rows[0] && legacy.rows[0].reg) {
        await client.query(`
          INSERT INTO audit_items (
            id, user_id, document_id, account, bureau, type, details,
            resolved, resolved_at, created_at, updated_at,
            analysis_id, item_key, label, creditor, amount, letter_type, meta
          )
          SELECT
            id, user_id, document_id,
            COALESCE(NULLIF(creditor, ''), NULLIF(label, ''), 'Audit item'),
            COALESCE(bureau, ''),
            COALESCE(item_type, 'negative'),
            details, resolved, resolved_at, created_at, updated_at,
            analysis_id, item_key, label, creditor, amount, letter_type, meta
          FROM credit_audit_items
          ON CONFLICT (id) DO NOTHING
        `);
        await client.query(`
          SELECT setval(
            pg_get_serial_sequence('audit_items', 'id'),
            GREATEST((SELECT COALESCE(MAX(id), 1) FROM audit_items), 1),
            true
          )
        `);
      }

      const legacyLetters = await client.query(`
        SELECT to_regclass('public.credit_audit_letters') AS reg
      `);
      if (legacyLetters.rows[0] && legacyLetters.rows[0].reg) {
        await client.query(`
          INSERT INTO generated_dispute_letters (
            id, user_id, audit_item_id, bureau, letter_content, created_at, analysis_id
          )
          SELECT
            id,
            COALESCE(user_id, 0),
            audit_item_id,
            COALESCE(bureau, ''),
            letter_content,
            created_at,
            analysis_id
          FROM credit_audit_letters
          WHERE user_id IS NOT NULL
          ON CONFLICT (id) DO NOTHING
        `).catch(async () => {
          await client.query(`
            INSERT INTO generated_dispute_letters (
              user_id, audit_item_id, bureau, letter_content, created_at, analysis_id
            )
            SELECT user_id, audit_item_id, COALESCE(bureau, ''), letter_content, created_at, analysis_id
            FROM credit_audit_letters
            WHERE user_id IS NOT NULL
          `);
        });
      }

      // Point debts.audit_item_id at audit_items when possible
      await client.query(`
        ALTER TABLE debts DROP CONSTRAINT IF EXISTS debts_audit_item_id_fkey
      `).catch(() => {});
      await client.query(`
        ALTER TABLE debts
          ADD COLUMN IF NOT EXISTS audit_item_id INTEGER
      `);
      await client.query(`
        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM pg_constraint WHERE conname = 'debts_audit_item_id_fkey'
          ) THEN
            ALTER TABLE debts
              ADD CONSTRAINT debts_audit_item_id_fkey
              FOREIGN KEY (audit_item_id) REFERENCES audit_items(id) ON DELETE SET NULL;
          END IF;
        END $$;
      `);

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    }
  }
};
