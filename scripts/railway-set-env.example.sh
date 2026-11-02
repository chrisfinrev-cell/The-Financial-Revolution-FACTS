#!/usr/bin/env bash
# Execute in your terminal using Railway CLI
# Replace placeholders with real production values first.
# Prefer Railway Dashboard for secrets — never commit real credentials.

set -euo pipefail

railway variables set NODE_ENV=production
railway variables set CORS_ORIGIN=https://financialrevolution.net
railway variables set DATABASE_URL="postgresql://user:password@host:port/dbname?sslmode=require"
railway variables set JWT_SECRET="your-64-character-cryptographically-secure-secret"
railway variables set SESSION_SECRET="your-secure-session-secret"

# Also required by FACTS boot (envCheck):
# railway variables set TWILIO_ACCOUNT_SID="..."
# railway variables set TWILIO_AUTH_TOKEN="..."
# railway variables set TWILIO_VERIFY_SERVICE_ID="..."
