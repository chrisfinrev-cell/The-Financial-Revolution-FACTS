'use strict';

module.exports = {
  name: 'user_profiles_nda_ledgers',
  up: async (client) => {
    await client.query(`
      CREATE TABLE IF NOT EXISTS user_profiles (
        user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        display_name VARCHAR(255),
        timezone VARCHAR(64) DEFAULT 'America/Los_Angeles',
        household_role VARCHAR(32),
        phone VARCHAR(32),
        avatar_url TEXT,
        day_zero_snapshot JSONB,
        preferences JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS nda_acceptances (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        nda_version VARCHAR(64) NOT NULL,
        accepted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        ip_address VARCHAR(64),
        UNIQUE (user_id, nda_version)
      )
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS nda_acceptances_user_idx ON nda_acceptances (user_id)
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS ledgers (
        id BIGSERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        bucket_slug TEXT NOT NULL,
        entry_type VARCHAR(32) NOT NULL,
        amount_cents INTEGER NOT NULL,
        balance_after_cents INTEGER,
        transaction_id INTEGER,
        memo TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS ledgers_user_bucket_idx
        ON ledgers (user_id, bucket_slug, created_at DESC)
    `);

    await client.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.tables
          WHERE table_schema = 'public' AND table_name = 'transactions'
        ) AND NOT EXISTS (
          SELECT 1 FROM information_schema.table_constraints
          WHERE constraint_name = 'ledgers_transaction_id_fkey'
        ) THEN
          ALTER TABLE ledgers
            ADD CONSTRAINT ledgers_transaction_id_fkey
            FOREIGN KEY (transaction_id) REFERENCES transactions(id) ON DELETE SET NULL;
        END IF;
      END $$;
    `);
  }
};
