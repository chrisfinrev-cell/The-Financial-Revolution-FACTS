/**
 * Twilio Verify Service
 *
 * Provides real SMS OTP via Twilio Verify API with graceful fallback.
 * When TWILIO env vars are missing, the service logs a warning and
 * all methods return stub results that allow the flow to proceed
 * (for development/testing without Twilio credentials).
 */

let twilioClient = null;
let serviceSid = null;

const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_VERIFY_SERVICE_ID = process.env.TWILIO_VERIFY_SERVICE_ID;

const isConfigured = !!(TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN && TWILIO_VERIFY_SERVICE_ID);

if (isConfigured) {
  try {
    const twilio = require('twilio');
    twilioClient = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
    serviceSid = TWILIO_VERIFY_SERVICE_ID;
    console.log('[Twilio] Twilio Verify client initialized. Service SID:', serviceSid);
  } catch (err) {
    console.error('[Twilio] Failed to initialize Twilio client:', err.message);
    console.warn('[Twilio] SMS verification will be stubbed until package is installed or credentials are set.');
    twilioClient = null;
  }
} else {
  console.warn('[Twilio] TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, or TWILIO_VERIFY_SERVICE_ID not set.');
  console.warn('[Twilio] SMS verification is stubbed — any 6-digit code will pass. DO NOT use in production.');
}

/**
 * Send an SMS verification code to a phone number via Twilio Verify.
 * @param {string} phone - E.164 formatted phone number (e.g. +12025551234)
 * @returns {Promise<{success: boolean, error?: string}>}
 */
async function sendVerification(phone) {
  if (!isConfigured || !twilioClient) {
    console.warn('[Twilio] Stub: would send SMS verification to', phone);
    return { success: true, stub: true };
  }

  try {
    const verification = await twilioClient.verify.v2
      .services(serviceSid)
      .verifications.create({
        to: phone,
        channel: 'sms'
      });
    console.log('[Twilio] Verification sent. Status:', verification.status, 'to:', phone);
    return { success: true, status: verification.status };
  } catch (err) {
    // Twilio returns specific error codes for invalid phone numbers
    const twilioCode = err.code || err.status;
    if (twilioCode === 21609 || err.message?.includes('not a valid phone number')) {
      return { success: false, error: 'Invalid phone number. Please enter a valid mobile number with country code (e.g. +12025551234).' };
    }
    console.error('[Twilio] Failed to send verification to', phone, ':', err.message);
    return { success: false, error: 'Failed to send verification code. Please try again.' };
  }
}

/**
 * Check a verification code against a phone number via Twilio Verify.
 * @param {string} phone - E.164 formatted phone number
 * @param {string} code - 6-digit code entered by user
 * @returns {Promise<{success: boolean, error?: string}>}
 */
async function checkVerification(phone, code) {
  if (!isConfigured || !twilioClient) {
    console.warn('[Twilio] Stub: would verify code', code, 'for', phone);
    // In stub mode, accept any 6-digit code for development
    return { success: code && code.length === 6, stub: true };
  }

  try {
    const check = await twilioClient.verify.v2
      .services(serviceSid)
      .verificationChecks.create({
        to: phone,
        code: code
      });
    console.log('[Twilio] Verification check result:', check.status, 'for:', phone);
    if (check.status === 'approved') {
      return { success: true, status: 'approved' };
    } else if (check.status === 'canceled' || check.status === 'expired') {
      return { success: false, error: 'Verification code expired. Request a new one.' };
    } else {
      return { success: false, error: 'Incorrect verification code.' };
    }
  } catch (err) {
    const twilioCode = err.code || err.status;
    // 20404 = verification not found / expired, 60203 = too many attempts (Twilio rate limit)
    if (twilioCode === 20404 || twilioCode === 60203) {
      return { success: false, error: 'Code expired or too many attempts. Request a new code.' };
    }
    console.error('[Twilio] Verification check failed for', phone, ':', err.message);
    return { success: false, error: 'Verification failed. Please try again.' };
  }
}

module.exports = {
  isConfigured,
  sendVerification,
  checkVerification
};