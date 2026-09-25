/**
 * Gross/Net paycheck entries (mod_income) + coaching readiness rubric (mod_coaching).
 *
 * Named separately from core income_transactions (amount + category_id), which
 * legacy_lens and core-api-contract already query.
 */
module.exports = {
  name: 'mod_income_and_coaching',
  up: async (client) => {
    await client.query(`CREATE SCHEMA IF NOT EXISTS mod_income`);
    await client.query(`CREATE SCHEMA IF NOT EXISTS mod_coaching`);

    await client.query(`
      CREATE TABLE IF NOT EXISTS mod_income.paycheck_entries (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        source_name VARCHAR(255) NOT NULL,
        entry_date DATE NOT NULL DEFAULT CURRENT_DATE,
        calculation_mode VARCHAR(8) NOT NULL DEFAULT 'GROSS'
          CHECK (calculation_mode IN ('GROSS', 'NET')),
        gross_amount NUMERIC(12, 2) DEFAULT 0.00,
        net_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
        employer_match NUMERIC(12, 2) DEFAULT 0.00,
        employer_match_target VARCHAR(16) DEFAULT 'GROWTH'
          CHECK (employer_match_target IN (
            'NECESSITIES', 'RESERVE', 'VELOCITY', 'GROWTH', 'LIFESTYLE', 'LEGACY'
          )),
        liquid_take_home NUMERIC(12, 2),
        bucket_allocations JSONB,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS paycheck_entries_user_id_idx
        ON mod_income.paycheck_entries (user_id, entry_date DESC)
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS mod_income.income_deductions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        entry_id UUID NOT NULL REFERENCES mod_income.paycheck_entries(id) ON DELETE CASCADE,
        label VARCHAR(255) NOT NULL,
        amount NUMERIC(12, 2) NOT NULL,
        target_bucket VARCHAR(16) NOT NULL
          CHECK (target_bucket IN (
            'NECESSITIES', 'RESERVE', 'VELOCITY', 'GROWTH', 'LIFESTYLE', 'LEGACY'
          ))
      )
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS income_deductions_entry_id_idx
        ON mod_income.income_deductions (entry_id)
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS mod_coaching.client_readiness_scores (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        pain_point_clarity_score INT NOT NULL DEFAULT 0
          CHECK (pain_point_clarity_score BETWEEN 0 AND 25),
        systems_orientation_score INT NOT NULL DEFAULT 0
          CHECK (systems_orientation_score BETWEEN 0 AND 20),
        accountability_score INT NOT NULL DEFAULT 0
          CHECK (accountability_score BETWEEN 0 AND 25),
        implementation_speed_score INT NOT NULL DEFAULT 0
          CHECK (implementation_speed_score BETWEEN 0 AND 15),
        value_alignment_score INT NOT NULL DEFAULT 0
          CHECK (value_alignment_score BETWEEN 0 AND 15),
        total_score INT GENERATED ALWAYS AS (
          pain_point_clarity_score + systems_orientation_score +
          accountability_score + implementation_speed_score + value_alignment_score
        ) STORED,
        qualification_tier VARCHAR(50),
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS client_readiness_scores_user_id_idx
        ON mod_coaching.client_readiness_scores (user_id, created_at DESC)
    `);
  }
};
