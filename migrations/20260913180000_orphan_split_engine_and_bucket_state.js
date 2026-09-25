/**
 * 10-tier orphan split engine + default 6-bucket allocation seed.
 */
module.exports = {
  name: 'orphan_split_engine_and_bucket_state',
  up: async (client) => {
    await client.query(`
      ALTER TABLE affiliates
        ADD COLUMN IF NOT EXISTS orphans_assigned_count INTEGER NOT NULL DEFAULT 0
    `).catch(() => {});

    await client.query(`
      ALTER TABLE users
        ADD COLUMN IF NOT EXISTS referred_by_affiliate_id INTEGER
    `).catch(() => {});

    await client.query(`
      CREATE TABLE IF NOT EXISTS orphan_assignment_events (
        id SERIAL PRIMARY KEY,
        affiliate_id INTEGER NOT NULL,
        new_user_id INTEGER NOT NULL,
        assigned_to_id INTEGER NOT NULL,
        tier_level SMALLINT NOT NULL,
        destination VARCHAR(16) NOT NULL,
        split_label VARCHAR(16),
        next_index INTEGER,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS orphan_assignment_events_affiliate_idx
        ON orphan_assignment_events (affiliate_id, created_at DESC)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS orphan_assignment_events_user_idx
        ON orphan_assignment_events (new_user_id)
    `);
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS orphan_assignment_events_new_user_uniq
        ON orphan_assignment_events (new_user_id)
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS user_bucket_state (
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        bucket_slug TEXT NOT NULL,
        target_pct NUMERIC(5,2) NOT NULL DEFAULT 0,
        deposited_cents INTEGER NOT NULL DEFAULT 0,
        spent_cents INTEGER NOT NULL DEFAULT 0,
        remaining_cents INTEGER NOT NULL DEFAULT 0,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (user_id, bucket_slug)
      )
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS user_bucket_state_user_idx
        ON user_bucket_state (user_id)
    `);
  }
};
