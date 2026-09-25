'use strict';

/**
 * Production Twilio Verify auth routes.
 * Mounted at /api/auth. Never accepts a stub OTP.
 */

const express = require('express');
const twilio = require('twilio');
const bcrypt = require('bcrypt');
const { pool } = require('../db/pool');

const E164 = /^\+[1-9]\d{6,14}$/;
const OTP = /^\d{6}$/;

function requireAuth(req, res, next) {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  req.userId = req.session.userId;
  next();
}

function normalizePhone(value) {
  if (value == null) return '';
  const trimmed = String(value).trim();
  return trimmed;
}

function getVerifyClient() {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const serviceSid = process.env.TWILIO_VERIFY_SERVICE_ID;
  if (!accountSid || !authToken || !serviceSid) {
    return null;
  }
  return {
    client: twilio(accountSid, authToken),
    serviceSid
  };
}

async function startVerification(phone) {
  const tw = getVerifyClient();
  if (!tw) {
    const err = new Error('SMS verification is not configured');
    err.status = 503;
    throw err;
  }
  try {
    const verification = await tw.client.verify.v2
      .services(tw.serviceSid)
      .verifications.create({ to: phone, channel: 'sms' });
    return { success: true, status: verification.status };
  } catch (err) {
    const code = err.code || err.status;
    if (code === 21609 || /not a valid phone number/i.test(err.message || '')) {
      const invalid = new Error('Invalid phone number. Use E.164, e.g. +12025551234');
      invalid.status = 400;
      throw invalid;
    }
    console.error('[auth] Twilio Verify start failed:', err.message);
    const failed = new Error('Failed to send verification code. Please try again.');
    failed.status = 502;
    throw failed;
  }
}

async function checkVerification(phone, code) {
  const tw = getVerifyClient();
  if (!tw) {
    const err = new Error('SMS verification is not configured');
    err.status = 503;
    throw err;
  }
  try {
    const check = await tw.client.verify.v2
      .services(tw.serviceSid)
      .verificationChecks.create({ to: phone, code });
    if (check.status === 'approved') {
      return { success: true, status: 'approved' };
    }
    if (check.status === 'canceled' || check.status === 'expired') {
      const expired = new Error('Verification code expired. Request a new one.');
      expired.status = 400;
      throw expired;
    }
    const incorrect = new Error('Incorrect verification code.');
    incorrect.status = 401;
    throw incorrect;
  } catch (err) {
    if (err.status) throw err;
    const codeNum = err.code || err.status;
    if (codeNum === 20404 || codeNum === 60203) {
      const limited = new Error('Code expired or too many attempts. Request a new code.');
      limited.status = 429;
      throw limited;
    }
    console.error('[auth] Twilio Verify check failed:', err.message);
    const failed = new Error('Verification failed. Please try again.');
    failed.status = 502;
    throw failed;
  }
}

function createAuthRouter() {
  const router = express.Router();

  router.post('/send-otp', async (req, res) => {
    try {
      if (!getVerifyClient()) {
        return res.status(503).json({ error: 'SMS verification is not configured' });
      }
      const phone = normalizePhone(req.body && req.body.phone);
      if (!E164.test(phone)) {
        return res.status(400).json({ error: 'Phone number must be in E.164 format, e.g. +12025551234' });
      }
      const result = await startVerification(phone);
      if (req.session) {
        req.session.pendingVerifyPhone = phone;
      }
      res.json({ success: true, status: result.status });
    } catch (err) {
      res.status(err.status || 500).json({ error: err.message || 'Failed to send verification code' });
    }
  });

  router.post('/verify-otp', async (req, res) => {
    try {
      if (!getVerifyClient()) {
        return res.status(503).json({ error: 'SMS verification is not configured' });
      }
      const phone = normalizePhone((req.body && req.body.phone) || (req.session && req.session.pendingVerifyPhone));
      const code = String((req.body && req.body.code) || '').trim();
      if (!E164.test(phone)) {
        return res.status(400).json({ error: 'Phone number must be in E.164 format, e.g. +12025551234' });
      }
      if (!OTP.test(code)) {
        return res.status(400).json({ error: 'Please enter a valid 6-digit code.' });
      }
      await checkVerification(phone, code);
      if (req.session) {
        req.session.verifiedPhone = phone;
        delete req.session.pendingVerifyPhone;
      }
      res.json({ success: true, status: 'approved', phone });
    } catch (err) {
      res.status(err.status || 500).json({ error: err.message || 'Verification failed' });
    }
  });

  router.post('/verify/start', async (req, res) => {
    try {
      const phone = normalizePhone(req.body && req.body.phone);
      if (!E164.test(phone)) {
        return res.status(400).json({ error: 'Phone number must be in E.164 format, e.g. +12025551234' });
      }
      const result = await startVerification(phone);
      if (req.session) {
        req.session.pendingVerifyPhone = phone;
      }
      res.json({ success: true, status: result.status });
    } catch (err) {
      res.status(err.status || 500).json({ error: err.message || 'Failed to start verification' });
    }
  });

  router.post('/verify/check', async (req, res) => {
    try {
      const phone = normalizePhone((req.body && req.body.phone) || (req.session && req.session.pendingVerifyPhone));
      const code = String((req.body && req.body.code) || '').trim();
      if (!E164.test(phone)) {
        return res.status(400).json({ error: 'Phone number must be in E.164 format, e.g. +12025551234' });
      }
      if (!OTP.test(code)) {
        return res.status(400).json({ error: 'Please enter a valid 6-digit code.' });
      }
      await checkVerification(phone, code);
      if (req.session) {
        req.session.verifiedPhone = phone;
        delete req.session.pendingVerifyPhone;
      }
      res.json({ success: true, status: 'approved', phone });
    } catch (err) {
      res.status(err.status || 500).json({ error: err.message || 'Verification failed' });
    }
  });

  router.post('/phone/send', requireAuth, async (req, res) => {
    try {
      const phone = normalizePhone(req.body && req.body.phone);
      if (!E164.test(phone)) {
        return res.status(400).json({ error: 'Phone number must be in E.164 format, e.g. +12025551234' });
      }
      const result = await startVerification(phone);
      req.session.pendingVerifyPhone = phone;
      res.json({ success: true, status: result.status });
    } catch (err) {
      res.status(err.status || 500).json({ error: err.message || 'Failed to send verification code' });
    }
  });

  router.post('/phone/verify', requireAuth, async (req, res) => {
    try {
      if (!pool) {
        return res.status(503).json({ error: 'Service temporarily unavailable. Please try again in a moment.' });
      }
      const phone = normalizePhone((req.body && req.body.phone) || req.session.pendingVerifyPhone);
      const code = String((req.body && req.body.code) || '').trim();
      if (!E164.test(phone)) {
        return res.status(400).json({ error: 'Phone number must be in E.164 format, e.g. +12025551234' });
      }
      if (!OTP.test(code)) {
        return res.status(400).json({ error: 'Please enter a valid 6-digit code.' });
      }
      await checkVerification(phone, code);
      await pool.query(
        `UPDATE users
            SET verification_method = 'sms',
                verified_phone = $1,
                phone_verified_at = NOW(),
                updated_at = NOW()
          WHERE id = $2`,
        [phone, req.userId]
      );
      delete req.session.pendingVerifyPhone;
      req.session.verifiedPhone = phone;
      res.json({ success: true, method: 'sms', phone });
    } catch (err) {
      res.status(err.status || 500).json({ error: err.message || 'Failed to verify phone' });
    }
  });

  router.get('/2fa/status', requireAuth, async (req, res) => {
    try {
      if (!pool) {
        return res.status(503).json({ error: 'Service temporarily unavailable. Please try again in a moment.' });
      }
      const result = await pool.query(
        'SELECT two_factor_enabled FROM users WHERE id = $1',
        [req.userId]
      );
      if (!result.rows.length) return res.status(404).json({ error: 'User not found' });
      res.json({ success: true, enabled: result.rows[0].two_factor_enabled });
    } catch (err) {
      console.error('GET /api/auth/2fa/status error:', err.message);
      res.status(500).json({ error: 'Failed to fetch 2FA status' });
    }
  });

  router.post('/2fa/enable', requireAuth, async (req, res) => {
    try {
      if (!pool) {
        return res.status(503).json({ error: 'Service temporarily unavailable. Please try again in a moment.' });
      }
      const { password } = req.body || {};
      if (!password) return res.status(400).json({ error: 'Password required to enable 2FA' });

      const result = await pool.query(
        'SELECT password_hash, email FROM users WHERE id = $1',
        [req.userId]
      );
      if (!result.rows.length) return res.status(404).json({ error: 'User not found' });
      if (!result.rows[0].password_hash) return res.status(400).json({ error: 'No password set on this account' });

      const match = await bcrypt.compare(password, result.rows[0].password_hash);
      if (!match) return res.status(401).json({ error: 'Incorrect password' });

      await pool.query(
        'UPDATE users SET two_factor_enabled = TRUE, updated_at = NOW() WHERE id = $1',
        [req.userId]
      );
      res.json({ success: true, message: 'Two-factor authentication enabled.' });
    } catch (err) {
      console.error('POST /api/auth/2fa/enable error:', err.message);
      res.status(500).json({ error: 'Failed to enable 2FA' });
    }
  });

  router.post('/2fa/disable', requireAuth, async (req, res) => {
    try {
      if (!pool) {
        return res.status(503).json({ error: 'Service temporarily unavailable. Please try again in a moment.' });
      }
      const { password } = req.body || {};
      if (!password) return res.status(400).json({ error: 'Password required to disable 2FA' });

      const result = await pool.query('SELECT password_hash FROM users WHERE id = $1', [req.userId]);
      if (!result.rows.length) return res.status(404).json({ error: 'User not found' });

      const match = await bcrypt.compare(password, result.rows[0].password_hash);
      if (!match) return res.status(401).json({ error: 'Incorrect password' });

      await pool.query(
        'UPDATE users SET two_factor_enabled = FALSE, updated_at = NOW() WHERE id = $1',
        [req.userId]
      );
      res.json({ success: true, message: 'Two-factor authentication disabled.' });
    } catch (err) {
      console.error('POST /api/auth/2fa/disable error:', err.message);
      res.status(500).json({ error: 'Failed to disable 2FA' });
    }
  });

  return router;
}

module.exports = {
  createAuthRouter,
  requireAuth,
  startVerification,
  checkVerification
};
