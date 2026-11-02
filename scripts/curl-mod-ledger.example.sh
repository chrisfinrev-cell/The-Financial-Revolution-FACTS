#!/usr/bin/env bash
# 1. Test Ledger Health & Self-Healing Module
curl -X GET http://localhost:4000/api/mod_ledger/health \
  -H "Content-Type: application/json"

# 2. Retrieve User Accounts & Bucket Balances (session cookie OR Bearer JWT)
curl -X GET http://localhost:4000/api/mod_ledger/accounts \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json"
