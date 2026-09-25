/**
 * mod_plaid Option A — Link token, item exchange, sync pipeline tables
 */
module.exports = {
  name: 'mod_plaid_option_a',
  up: async (client) => {
    await client.query(`CREATE SCHEMA IF NOT EXISTS mod_plaid`);

    await client.query(`
      CREATE TABLE IF NOT EXISTS mod_plaid.user_items (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        session_id VARCHAR(128),
        item_id TEXT NOT NULL UNIQUE,
        access_token_encrypted TEXT NOT NULL,
        institution_id TEXT,
        institution_name TEXT,
        transactions_sync_cursor TEXT,
        status VARCHAR(20) NOT NULL DEFAULT 'active',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS user_items_user_id_idx
        ON mod_plaid.user_items (user_id)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS user_items_status_idx
        ON mod_plaid.user_items (user_id, status)
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS mod_plaid.account_balances (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        user_item_id INTEGER NOT NULL REFERENCES mod_plaid.user_items(id) ON DELETE CASCADE,
        account_id TEXT NOT NULL,
        account_name TEXT,
        official_name TEXT,
        account_type VARCHAR(32),
        account_subtype VARCHAR(32),
        current_balance NUMERIC(14,2),
        available_balance NUMERIC(14,2),
        currency_code VARCHAR(3) DEFAULT 'USD',
        last_synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (user_id, account_id)
      )
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS account_balances_user_item_idx
        ON mod_plaid.account_balances (user_item_id)
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS mod_plaid.synced_transactions (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        user_item_id INTEGER NOT NULL REFERENCES mod_plaid.user_items(id) ON DELETE CASCADE,
        plaid_transaction_id TEXT NOT NULL UNIQUE,
        account_id TEXT NOT NULL,
        amount NUMERIC(12,2) NOT NULL,
        transaction_date DATE NOT NULL,
        name TEXT,
        merchant_name TEXT,
        category JSONB,
        pending BOOLEAN NOT NULL DEFAULT false,
        ledger_entry_id INTEGER,
        core_transaction_id INTEGER,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS synced_transactions_user_id_idx
        ON mod_plaid.synced_transactions (user_id)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS synced_transactions_pending_idx
        ON mod_plaid.synced_transactions (user_id, pending)
    `);
  },
};
