-- Beta feedback (FACTS: user_id INTEGER → users(id))
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS beta_feedback (
    feedback_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    session_id VARCHAR(100),
    feedback_type VARCHAR(50) NOT NULL CHECK (feedback_type IN ('BUG', 'UI_ISSUE', 'FEATURE_SUGGESTION', 'GENERAL')),
    page_url VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    user_agent TEXT,
    resolved_status BOOLEAN NOT NULL DEFAULT FALSE,
    submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_beta_feedback_status
  ON beta_feedback (resolved_status, submitted_at DESC);
