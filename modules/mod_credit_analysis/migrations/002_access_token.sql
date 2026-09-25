-- Unguessable retrieve token so sequential analysis IDs are not public.
ALTER TABLE credit_analyses ADD COLUMN IF NOT EXISTS access_token TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS credit_analyses_access_token_uidx
  ON credit_analyses (access_token)
  WHERE access_token IS NOT NULL;
