'use strict';

/**
 * Align beta_feedback with product sketch columns while preserving
 * existing SERIAL id / category / message / status API fields.
 *
 * Sketch adaptation: users.user_id UUID → users(id) INTEGER
 */
module.exports = {
  name: 'beta_feedback_sketch_columns',
  up: async (client) => {
    await client.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto`);

    await client.query(`
      CREATE TABLE IF NOT EXISTS beta_feedback (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        category VARCHAR(64) NOT NULL DEFAULT 'bug',
        message TEXT NOT NULL DEFAULT '',
        page_url TEXT,
        user_agent TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        status VARCHAR(32) NOT NULL DEFAULT 'open'
      )
    `);

    await client.query(`
      ALTER TABLE beta_feedback
        ADD COLUMN IF NOT EXISTS feedback_id UUID DEFAULT gen_random_uuid()
    `);
    await client.query(`
      ALTER TABLE beta_feedback
        ADD COLUMN IF NOT EXISTS session_id VARCHAR(100)
    `);
    await client.query(`
      ALTER TABLE beta_feedback
        ADD COLUMN IF NOT EXISTS feedback_type VARCHAR(50)
    `);
    await client.query(`
      ALTER TABLE beta_feedback
        ADD COLUMN IF NOT EXISTS description TEXT
    `);
    await client.query(`
      ALTER TABLE beta_feedback
        ADD COLUMN IF NOT EXISTS resolved_status BOOLEAN NOT NULL DEFAULT FALSE
    `);
    await client.query(`
      ALTER TABLE beta_feedback
        ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ DEFAULT NOW()
    `);

    // Backfill sketch columns from legacy fields
    await client.query(`
      UPDATE beta_feedback
      SET feedback_id = COALESCE(feedback_id, gen_random_uuid()),
          description = COALESCE(NULLIF(description, ''), message),
          submitted_at = COALESCE(submitted_at, created_at, NOW()),
          resolved_status = CASE
            WHEN COALESCE(status, 'open') IN ('resolved', 'closed', 'done') THEN TRUE
            ELSE COALESCE(resolved_status, FALSE)
          END,
          feedback_type = COALESCE(
            feedback_type,
            CASE LOWER(COALESCE(category, 'general'))
              WHEN 'bug' THEN 'BUG'
              WHEN 'ui' THEN 'UI_ISSUE'
              WHEN 'feature' THEN 'FEATURE_SUGGESTION'
              ELSE 'GENERAL'
            END
          )
    `);

    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_beta_feedback_feedback_id
        ON beta_feedback (feedback_id)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_beta_feedback_status
        ON beta_feedback (resolved_status, submitted_at DESC)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_beta_feedback_status_legacy
        ON beta_feedback (status, created_at DESC)
    `);
  }
};
