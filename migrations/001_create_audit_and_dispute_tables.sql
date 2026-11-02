-- Begin Transaction
BEGIN;

-- Prerequisites (idempotent) so FKs succeed on a fresh DB
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255),
    name VARCHAR(255),
    password_hash VARCHAR(255),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_documents (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    category VARCHAR(64) NOT NULL DEFAULT 'other',
    file_name TEXT NOT NULL DEFAULT 'unknown',
    file_mime_type VARCHAR(128),
    file_size_bytes INTEGER,
    file_data BYTEA,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS credit_analyses (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    ip_address VARCHAR(64),
    status VARCHAR(32) DEFAULT 'processing',
    analysis JSONB,
    raw_text TEXT,
    access_token VARCHAR(128),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Drop sketch-name views if a prior deploy created them (safe no-op when already tables)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'generated_dispute_letters' AND c.relkind = 'v'
  ) THEN
    EXECUTE 'DROP VIEW generated_dispute_letters CASCADE';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'audit_items' AND c.relkind = 'v'
  ) THEN
    EXECUTE 'DROP VIEW audit_items CASCADE';
  END IF;
END $$;

-- 1. Create audit_items table
CREATE TABLE IF NOT EXISTS audit_items (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    document_id INTEGER REFERENCES user_documents(id) ON DELETE CASCADE,
    account VARCHAR(255) NOT NULL DEFAULT '',
    bureau VARCHAR(50) NOT NULL DEFAULT '', -- e.g., 'Equifax', 'Experian', 'TransUnion'
    type VARCHAR(50) NOT NULL,              -- e.g., 'collection', 'address', 'inquiry'
    details TEXT,
    resolved BOOLEAN DEFAULT FALSE,
    resolved_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    -- App linkage columns (Action Center + Bucket 2)
    analysis_id INTEGER REFERENCES credit_analyses(id) ON DELETE CASCADE,
    item_key VARCHAR(64),
    label TEXT,
    creditor TEXT,
    amount NUMERIC(12, 2),
    letter_type VARCHAR(32),
    meta JSONB NOT NULL DEFAULT '{}'::jsonb
);

-- 2. Create generated_dispute_letters table
CREATE TABLE IF NOT EXISTS generated_dispute_letters (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    audit_item_id INTEGER REFERENCES audit_items(id) ON DELETE CASCADE,
    bureau VARCHAR(50) NOT NULL DEFAULT '',
    letter_content TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    analysis_id INTEGER REFERENCES credit_analyses(id) ON DELETE SET NULL
);

-- 3. Create Performance Indexes (with IF NOT EXISTS guard)
CREATE INDEX IF NOT EXISTS idx_audit_items_user_id ON audit_items(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_items_document_id ON audit_items(document_id);
CREATE INDEX IF NOT EXISTS idx_audit_items_analysis_id ON audit_items(analysis_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_audit_items_analysis_item_key
  ON audit_items (analysis_id, item_key)
  WHERE analysis_id IS NOT NULL AND item_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_generated_letters_user_id ON generated_dispute_letters(user_id);
CREATE INDEX IF NOT EXISTS idx_generated_letters_item_id ON generated_dispute_letters(audit_item_id);

-- Commit Transaction
COMMIT;
