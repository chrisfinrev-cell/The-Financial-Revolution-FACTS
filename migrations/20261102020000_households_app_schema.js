'use strict';

/**
 * Align households / members / invites with routes/family.js.
 * Stub schema used owner_user_id; app expects owner_id + status + incubator fields.
 */
module.exports = {
  name: 'households_app_schema',
  up: async (client) => {
    // ── households ──────────────────────────────────────────────────────────
    await client.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'households' AND column_name = 'owner_user_id'
        ) AND NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'households' AND column_name = 'owner_id'
        ) THEN
          ALTER TABLE households RENAME COLUMN owner_user_id TO owner_id;
        END IF;
      END $$;
    `);

    await client.query(`
      ALTER TABLE households
        ADD COLUMN IF NOT EXISTS owner_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        ADD COLUMN IF NOT EXISTS co_admin_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        ADD COLUMN IF NOT EXISTS is_incubator BOOLEAN NOT NULL DEFAULT false,
        ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS cancellation_grace_ends_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    `);

    // Backfill owner_id if both somehow exist
    await client.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'households' AND column_name = 'owner_user_id'
        ) AND EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'households' AND column_name = 'owner_id'
        ) THEN
          UPDATE households SET owner_id = COALESCE(owner_id, owner_user_id)
            WHERE owner_id IS NULL AND owner_user_id IS NOT NULL;
        END IF;
      END $$;
    `);

    // ── household_members ───────────────────────────────────────────────────
    await client.query(`
      ALTER TABLE household_members
        ADD COLUMN IF NOT EXISTS status VARCHAR(32) NOT NULL DEFAULT 'active',
        ADD COLUMN IF NOT EXISTS is_sub_account BOOLEAN NOT NULL DEFAULT false,
        ADD COLUMN IF NOT EXISTS broke_away_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS commission_eligible BOOLEAN NOT NULL DEFAULT false,
        ADD COLUMN IF NOT EXISTS affiliate_id INTEGER
    `);

    // ── household_invites ───────────────────────────────────────────────────
    await client.query(`
      ALTER TABLE household_invites
        ADD COLUMN IF NOT EXISTS invite_code VARCHAR(64),
        ADD COLUMN IF NOT EXISTS created_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        ADD COLUMN IF NOT EXISTS invited_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        ADD COLUMN IF NOT EXISTS email TEXT,
        ADD COLUMN IF NOT EXISTS role VARCHAR(32) DEFAULT 'adult',
        ADD COLUMN IF NOT EXISTS token VARCHAR(128),
        ADD COLUMN IF NOT EXISTS status VARCHAR(32) NOT NULL DEFAULT 'pending',
        ADD COLUMN IF NOT EXISTS uses_count INTEGER NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS accepted_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS declined_at TIMESTAMPTZ
    `);

    // Map legacy invite columns → app names when present
    await client.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema='public' AND table_name='household_invites' AND column_name='code'
        ) THEN
          UPDATE household_invites SET invite_code = COALESCE(invite_code, code)
            WHERE invite_code IS NULL AND code IS NOT NULL;
        END IF;
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema='public' AND table_name='household_invites' AND column_name='created_by'
        ) THEN
          UPDATE household_invites
            SET created_by_user_id = COALESCE(created_by_user_id, created_by),
                invited_by = COALESCE(invited_by, created_by)
            WHERE created_by IS NOT NULL;
        END IF;
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema='public' AND table_name='household_invites' AND column_name='use_count'
        ) THEN
          UPDATE household_invites SET uses_count = COALESCE(NULLIF(uses_count, 0), use_count, 0);
        END IF;
      END $$;
    `);

    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS household_invites_invite_code_uidx
        ON household_invites (invite_code) WHERE invite_code IS NOT NULL
    `);
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS household_invites_token_uidx
        ON household_invites (token) WHERE token IS NOT NULL
    `);

    // ── household_offboarding_records ───────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS household_offboarding_records (
        id SERIAL PRIMARY KEY,
        household_id INTEGER REFERENCES households(id) ON DELETE SET NULL,
        household_name TEXT,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        removal_type VARCHAR(32) NOT NULL,
        removed_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        grace_expires_at TIMESTAMPTZ,
        offboarded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        reintegrated_at TIMESTAMPTZ,
        data_exported_at TIMESTAMPTZ,
        welcome_shown_at TIMESTAMPTZ
      )
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS household_offboarding_user_active_idx
        ON household_offboarding_records (user_id)
        WHERE reintegrated_at IS NULL
    `);
  },

  down: async (client) => {
    // Non-destructive down: leave expanded columns in place.
    await client.query(`DROP TABLE IF EXISTS household_offboarding_records`);
  }
};
