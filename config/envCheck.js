'use strict';

/**
 * Strict, fail-closed auth environment assertions.
 * Refuse to boot unless NODE_ENV, SESSION_SECRET, DATABASE_URL,
 * and Twilio Verify credentials are present and valid.
 *
 * Also enforces BETA_MODE financial safety (no live Stripe keys).
 */

const ALLOWED_NODE_ENV = new Set(['development', 'test', 'staging', 'production']);

const WEAK_SECRETS = new Set([
  'fallback-key-change-me',
  'changeme',
  'change-me',
  'secret',
  'session-secret',
  'session_secret',
  'dev',
  'development',
  'password'
]);

function isBlank(value) {
  return value == null || String(value).trim() === '';
}

function isBetaMode(env) {
  return String(env.BETA_MODE || '').toLowerCase() === 'true'
    || String(env.NODE_ENV || '').trim().toLowerCase() === 'staging';
}

/**
 * Prevent beta/staging runs from using live Stripe keys or obvious prod DB URLs.
 */
function validateBetaEnvironment(env) {
  const e = env || process.env;
  if (!isBetaMode(e)) return true;

  const stripeKey = String(e.STRIPE_SECRET_KEY || e.STRIPE_API_KEY || '');
  if (stripeKey.startsWith('sk_live_')) {
    console.error(
      '[envCheck] CRITICAL SAFETY BLOCK: BETA_MODE/staging is enabled but live Stripe keys (sk_live_) were detected. Switch to test keys (sk_test_).'
    );
    process.exit(1);
  }

  const dbUrl = String(e.DATABASE_URL || '').toLowerCase();
  if (
    dbUrl.includes('prod')
    || dbUrl.includes('production')
    || dbUrl.includes('-prod-')
  ) {
    console.warn(
      '[envCheck] WARNING: BETA_MODE/staging appears to use a production-like DATABASE_URL. Confirm an isolated staging Neon database is configured.'
    );
  }

  const plaidEnv = String(e.PLAID_ENV || 'sandbox').toLowerCase();
  if (plaidEnv === 'production') {
    console.error(
      '[envCheck] CRITICAL SAFETY BLOCK: BETA_MODE/staging requires PLAID_ENV=sandbox (or development), not production.'
    );
    process.exit(1);
  }

  return true;
}

function validateAuthEnvironment(env) {
  const e = env || process.env;
  const errors = [];

  const nodeEnv = String(e.NODE_ENV || '').trim().toLowerCase();
  if (isBlank(e.NODE_ENV)) {
    errors.push('NODE_ENV is required (development | test | staging | production).');
  } else if (!ALLOWED_NODE_ENV.has(nodeEnv)) {
    errors.push('NODE_ENV must be development, test, staging, or production.');
  }

  if (isBlank(e.SESSION_SECRET)) {
    errors.push('SESSION_SECRET is required (fail-closed: no random fallback).');
  } else {
    const trimmed = String(e.SESSION_SECRET).trim();
    if (trimmed.length < 32) {
      errors.push('SESSION_SECRET must be at least 32 characters.');
    }
    if (WEAK_SECRETS.has(trimmed) || WEAK_SECRETS.has(trimmed.toLowerCase())) {
      errors.push('SESSION_SECRET is a known insecure default.');
    }
  }

  if (isBlank(e.DATABASE_URL)) {
    errors.push('DATABASE_URL is required.');
  } else if (!/^postgres(ql)?:\/\//i.test(String(e.DATABASE_URL).trim())) {
    errors.push('DATABASE_URL must be a postgres:// or postgresql:// connection string.');
  }

  if (
    isBlank(e.TWILIO_ACCOUNT_SID)
    || isBlank(e.TWILIO_AUTH_TOKEN)
    || isBlank(e.TWILIO_VERIFY_SERVICE_ID)
  ) {
    errors.push(
      'TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_VERIFY_SERVICE_ID are required (OTP stub is disabled).'
    );
  }

  if (errors.length) {
    console.error('[envCheck] Refusing to start — auth environment failed closed:');
    for (const err of errors) {
      console.error('  -', err);
    }
    process.exit(1);
  }

  validateBetaEnvironment(e);
  return true;
}

/**
 * Production-only hardening checks (warn or fail-closed for critical gaps).
 */
function validateProductionSecurity(env) {
  const e = env || process.env;
  const nodeEnv = String(e.NODE_ENV || '').trim().toLowerCase();
  if (nodeEnv !== 'production') return true;

  const warnings = [];
  const errors = [];

  const dbUrl = String(e.DATABASE_URL || '');
  if (dbUrl && !/sslmode=(require|verify-full|verify-ca)/i.test(dbUrl) && !/neon\.tech/i.test(dbUrl)) {
    warnings.push('DATABASE_URL should include sslmode=require (or verify-full) in production.');
  }

  if (isBlank(e.CORS_ORIGIN)) {
    warnings.push(
      'CORS_ORIGIN is unset — falling back to built-in production allowlist. Set CORS_ORIGIN to your frontend domain(s).'
    );
  }

  if (!isBlank(e.JWT_SECRET)) {
    const jwt = String(e.JWT_SECRET).trim();
    if (jwt.length < 64) {
      errors.push('JWT_SECRET must be at least 64 characters in production.');
    }
    if (WEAK_SECRETS.has(jwt) || WEAK_SECRETS.has(jwt.toLowerCase())) {
      errors.push('JWT_SECRET is a known insecure default.');
    }
  } else {
    warnings.push('JWT_SECRET is unset — Bearer JWT routes will fail if used.');
  }

  for (const w of warnings) {
    console.warn('[envCheck]', w);
  }

  if (errors.length) {
    console.error('[envCheck] Refusing to start — production security failed closed:');
    for (const err of errors) {
      console.error('  -', err);
    }
    process.exit(1);
  }

  return true;
}

module.exports = {
  validateAuthEnvironment,
  validateBetaEnvironment,
  validateProductionSecurity
};
