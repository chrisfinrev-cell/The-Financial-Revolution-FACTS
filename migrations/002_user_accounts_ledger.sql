-- Master User Ledger Accounts + Transaction Ledger
-- FACTS: user_id INTEGER → users(id); buckets NEC/VEL/RES/GRO/LIF/LEG (+ HUB)

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Master User Ledger Accounts
CREATE TABLE IF NOT EXISTS user_accounts (
    account_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    account_name VARCHAR(100) NOT NULL,
    account_type VARCHAR(50) NOT NULL, -- 'INCOME_HUB', 'SPOKE_ACCOUNT'
    bucket_category VARCHAR(10) CHECK (bucket_category IN ('NEC', 'VEL', 'RES', 'GRO', 'LIF', 'LEG', 'HUB')),
    current_balance NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Transaction Ledger with Percentage Allocation Tracking
CREATE TABLE IF NOT EXISTS ledger_transactions (
    transaction_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    source_account_id UUID REFERENCES user_accounts(account_id),
    destination_account_id UUID REFERENCES user_accounts(account_id),
    amount NUMERIC(12, 2) NOT NULL,
    allocation_bucket VARCHAR(10) CHECK (allocation_bucket IN ('NEC', 'VEL', 'RES', 'GRO', 'LIF', 'LEG')),
    transaction_type VARCHAR(50) NOT NULL, -- 'INCOME_INGRESS', 'FRIDAY_SWEEP', 'MANUAL_ADJUSTMENT'
    status VARCHAR(20) NOT NULL DEFAULT 'COMPLETED',
    metadata JSONB DEFAULT '{}'::jsonb,
    transaction_timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexing for high-speed balance and audit queries
CREATE INDEX IF NOT EXISTS idx_ledger_user_timestamp ON ledger_transactions(user_id, transaction_timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_accounts_user_bucket ON user_accounts(user_id, bucket_category);
