/**
 * mod_analytics — Analytics Event Tracking
 *
 * Owns: user engagement events, feature usage metrics, session heartbeats,
 *       affiliate funnel events (commission_earned, points_redeemed, etc.)
 *
 * Does NOT own: user authentication, subscription billing, affiliate commission
 *               calculation — it only records what other modules report.
 *
 * Schema: user_events table (public schema)
 *
 * Routes (mounted at /api/mod_analytics):
 *   GET  /health
 *   POST /events        — batch ingest (authenticated users)
 *   POST /events/public — single event for pre-auth flows (unauthenticated OK)
 *   GET  /summary       — 7/30-day counts by event type (admin only)
 */

'use strict';

const express = require('express');
const { Pool } = require('pg');
const { asyncRoute } = require('../../module-error-boundary');

// ─── Admin allow-list (mirrors mod_gamification) ─────────────────────────────
const ADMIN_EMAILS = ['chris.finrev@gmail.com'];

// ─── DB Pool (lazy-init) ─────────────────────────────────────────────────────
let _pool = null;
function getPool() {
  if (!_pool) _pool = new Pool({ connectionString: process.env.DATABASE_URL });
  return _pool;
}

// ─── Auth helpers ─────────────────────────────────────────────────────────────
function requireAuth(req, res, next) {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  req.userId = req.session.userId;
  next();
}

async function requireAdmin(req, res, next) {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  req.userId = req.session.userId;

  try {
    const pool = getPool();
    const result = await pool.query(
      'SELECT email FROM users WHERE id = $1',
      [req.session.userId]
    );
    const email = (result.rows[0]?.email || '').toLowerCase();
    if (!ADMIN_EMAILS.includes(email)) {
      return res.status(403).json({ error: 'Admin access required' });
    }
    next();
  } catch (err) {
    res.status(500).json({ error: 'Auth check failed' });
  }
}

// ─── Event validation ─────────────────────────────────────────────────────────
// Known event types — unknown types are accepted but logged for review
const KNOWN_EVENT_TYPES = new Set([
  // Page / navigation
  'page_view',
  // Feature usage
  'feature_usage',
  'allocation_created',
  'income_entry_created',
  'spending_entry_created',
  // Onboarding
  'onboarding_tour_completed',
  'onboarding_step_completed',
  // Security
  '2fa_enabled',
  // Session
  'session_heartbeat',
  // Affiliate funnel
  'commission_earned',
  'points_redeemed',
  'withdrawal_requested',
  'referral_signup',
]);

function sanitizeEventType(raw) {
  if (typeof raw !== 'string') return null;
  const cleaned = raw.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_').slice(0, 100);
  return cleaned.length > 0 ? cleaned : null;
}

function sanitizeMetadata(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  // Strip any keys that look like PII
  const safe = {};
  const PII_KEYS = new Set(['password', 'token', 'secret', 'ssn', 'credit_card']);
  for (const [k, v] of Object.entries(raw)) {
    if (!PII_KEYS.has(k.toLowerCase()) && typeof k === 'string' && k.length <= 64) {
      safe[k] = v;
    }
  }
  return safe;
}

// ─── DB helpers ───────────────────────────────────────────────────────────────
async function insertEvents(userId, events) {
  const pool = getPool();
  const now = new Date();

  for (const evt of events) {
    const eventType = sanitizeEventType(evt.event_type);
    if (!eventType) continue;

    const metadata = sanitizeMetadata(evt.metadata || {});
    // Honour client-supplied timestamp if reasonable (within past 5 min, not future)
    let createdAt = now;
    if (evt.timestamp) {
      const ts = new Date(evt.timestamp);
      const diff = now - ts;
      if (!isNaN(ts) && diff >= 0 && diff <= 5 * 60 * 1000) {
        createdAt = ts;
      }
    }

    await pool.query(
      `INSERT INTO user_events (user_id, event_type, metadata, created_at)
       VALUES ($1, $2, $3, $4)`,
      [userId || null, eventType, JSON.stringify(metadata), createdAt]
    );
  }
}

// ─── Rate limiting (in-memory, per IP, resets each minute) ───────────────────
// Lightweight guard — full rate limiter is applied at the /api/ level in server.js
const _rateBuckets = new Map();
const RATE_LIMIT = 60; // events per minute per IP

function checkRateLimit(ip) {
  const now = Date.now();
  const bucket = _rateBuckets.get(ip) || { count: 0, resetAt: now + 60_000 };

  if (now > bucket.resetAt) {
    bucket.count = 0;
    bucket.resetAt = now + 60_000;
  }

  bucket.count += 1;
  _rateBuckets.set(ip, bucket);

  return bucket.count <= RATE_LIMIT;
}

// Clean up stale buckets every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [ip, bucket] of _rateBuckets) {
    if (now > bucket.resetAt + 60_000) _rateBuckets.delete(ip);
  }
}, 5 * 60_000).unref();

// ─── Router ───────────────────────────────────────────────────────────────────
const router = express.Router();

// GET /api/mod_analytics/health
router.get('/health', asyncRoute(async (req, res) => {
  res.json({ status: 'ok', module: 'mod_analytics', version: '1.0.0' });
}));

/**
 * POST /api/mod_analytics/events
 * Accepts: { events: [{ event_type, metadata, timestamp }] }
 * Requires auth. Batches up to 50 events per call.
 */
router.post('/events', requireAuth, asyncRoute(async (req, res) => {
  const ip = req.ip || req.connection?.remoteAddress || 'unknown';
  if (!checkRateLimit(ip)) {
    return res.status(429).json({ error: 'Rate limit exceeded' });
  }

  let events = req.body?.events;
  if (!Array.isArray(events)) {
    // Also accept a single event at top level
    if (req.body?.event_type) events = [req.body];
    else return res.status(400).json({ error: 'events array required' });
  }

  events = events.slice(0, 50); // cap batch size
  await insertEvents(req.userId, events);
  res.json({ success: true, accepted: events.length });
}));

/**
 * POST /api/mod_analytics/events/public
 * For pre-auth events (onboarding start, signup funnel).
 * user_id stored as NULL. No auth required, but rate-limited.
 */
router.post('/events/public', asyncRoute(async (req, res) => {
  const ip = req.ip || req.connection?.remoteAddress || 'unknown';
  if (!checkRateLimit(ip)) {
    return res.status(429).json({ error: 'Rate limit exceeded' });
  }

  let events = req.body?.events;
  if (!Array.isArray(events)) {
    if (req.body?.event_type) events = [req.body];
    else return res.status(400).json({ error: 'events array required' });
  }

  // For public events, optionally attach session userId if available
  const userId = (req.session && req.session.userId) ? req.session.userId : null;

  events = events.slice(0, 10); // tighter cap for unauthenticated
  await insertEvents(userId, events);
  res.json({ success: true, accepted: events.length });
}));

/**
 * GET /api/mod_analytics/summary?days=7
 * Admin-only. Returns event counts by type for the last N days (7 or 30).
 */
router.get('/summary', requireAdmin, asyncRoute(async (req, res) => {
  const days = parseInt(req.query.days, 10);
  const windowDays = [7, 30].includes(days) ? days : 7;

  const pool = getPool();

  // Total events per type
  const byType = await pool.query(
    `SELECT event_type, COUNT(*) as count
     FROM user_events
     WHERE created_at >= NOW() - ($1 || ' days')::INTERVAL
     GROUP BY event_type
     ORDER BY count DESC`,
    [windowDays]
  );

  // Unique active users
  const activeUsers = await pool.query(
    `SELECT COUNT(DISTINCT user_id) as count
     FROM user_events
     WHERE user_id IS NOT NULL
       AND created_at >= NOW() - ($1 || ' days')::INTERVAL`,
    [windowDays]
  );

  // Daily event volume (last N days)
  const daily = await pool.query(
    `SELECT DATE(created_at) as date, COUNT(*) as count
     FROM user_events
     WHERE created_at >= NOW() - ($1 || ' days')::INTERVAL
     GROUP BY DATE(created_at)
     ORDER BY date ASC`,
    [windowDays]
  );

  // Feature usage breakdown
  const featureUsage = await pool.query(
    `SELECT metadata->>'feature' as feature, COUNT(*) as count
     FROM user_events
     WHERE event_type = 'feature_usage'
       AND created_at >= NOW() - ($1 || ' days')::INTERVAL
       AND metadata->>'feature' IS NOT NULL
     GROUP BY metadata->>'feature'
     ORDER BY count DESC
     LIMIT 20`,
    [windowDays]
  );

  // Page view breakdown
  const pageViews = await pool.query(
    `SELECT metadata->>'page' as page, COUNT(*) as count
     FROM user_events
     WHERE event_type = 'page_view'
       AND created_at >= NOW() - ($1 || ' days')::INTERVAL
       AND metadata->>'page' IS NOT NULL
     GROUP BY metadata->>'page'
     ORDER BY count DESC
     LIMIT 20`,
    [windowDays]
  );

  res.json({
    window_days: windowDays,
    generated_at: new Date().toISOString(),
    active_users: parseInt(activeUsers.rows[0]?.count || 0, 10),
    total_events: byType.rows.reduce((sum, r) => sum + parseInt(r.count, 10), 0),
    by_event_type: byType.rows.map(r => ({
      event_type: r.event_type,
      count: parseInt(r.count, 10)
    })),
    daily_volume: daily.rows.map(r => ({
      date: r.date,
      count: parseInt(r.count, 10)
    })),
    top_features: featureUsage.rows.map(r => ({
      feature: r.feature,
      count: parseInt(r.count, 10)
    })),
    top_pages: pageViews.rows.map(r => ({
      page: r.page,
      count: parseInt(r.count, 10)
    }))
  });
}));

// ─── Module export ────────────────────────────────────────────────────────────
module.exports = {
  metadata: {
    name: 'Analytics Event Tracking',
    version: '1.0.0',
    requiredCoreVersion: '1.0.0',
    defaultEnabled: true
  },

  routes: router,

  healthCheck: async (pool) => ({
    module: 'mod_analytics',
    status: 'ok',
    version: '1.0.0',
    timestamp: new Date().toISOString()
  })
};
