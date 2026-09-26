-- 1. Master Beta Codes Table
CREATE TABLE IF NOT EXISTS beta_codes (
    id SERIAL PRIMARY KEY,
    code VARCHAR(50) UNIQUE NOT NULL,
    max_uses INT DEFAULT 5,
    uses_count INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Seed Initial Master Access Code for Corsair
INSERT INTO beta_codes (code, max_uses) 
VALUES ('CORSAIR-FACTS-2026', 5)
ON CONFLICT (code) DO NOTHING;

-- 3. Update Users Table for Beta Invites, Lineage & NDA Tracking
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS referral_code VARCHAR(20) UNIQUE,
ADD COLUMN IF NOT EXISTS referrer_id INT REFERENCES users(id),
ADD COLUMN IF NOT EXISTS is_beta_tester BOOLEAN DEFAULT TRUE,
ADD COLUMN IF NOT EXISTS monthly_invites_remaining INT DEFAULT 5,
ADD COLUMN IF NOT EXISTS lifetime_invites_issued INT DEFAULT 5,
ADD COLUMN IF NOT EXISTS last_invite_reset_at TIMESTAMPTZ DEFAULT NOW(),
ADD COLUMN IF NOT EXISTS nda_accepted_at TIMESTAMPTZ DEFAULT NULL,
ADD COLUMN IF NOT EXISTS nda_version VARCHAR(20) DEFAULT '1.0';

-- 4. House Matrix Setup for Post-Beta Affiliate Genealogy
CREATE TABLE IF NOT EXISTS affiliate_houses (
    id SERIAL PRIMARY KEY,
    user_id INT REFERENCES users(id) ON DELETE CASCADE,
    house_number INT NOT NULL,
    status VARCHAR(20) DEFAULT 'active',
    positions_filled INT DEFAULT 0,
    is_completed BOOLEAN DEFAULT FALSE,
    opened_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ DEFAULT NULL,
    UNIQUE(user_id, house_number)
);
