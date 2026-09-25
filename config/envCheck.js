'use strict';

/**
 * Strict, fail-closed auth environment assertions.
 * Refuse to boot unless NODE_ENV, SESSION_SECRET, DATABASE_URL,
 * and Twilio Verify credentials are present and valid.
 */

const ALLOWED_NODE_ENV = new Set(['development', 'test', 'production']);

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

function validateAuthEnvironment(env) {
  const e = env || process.env;
  const errors = [];

  const nodeEnv = String(e.NODE_ENV || '').trim().toLowerCase();
  if (isBlank(e.NODE_ENV)) {
    errors.push('NODE_ENV is required (development | test | production).');
  } else if (!ALLOWED_NODE_ENV.has(nodeEnv)) {
    errors.push('NODE_ENV must be development, test, or production.');
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

  return true;
}

module.exports = {
  validateAuthEnvironment
};
