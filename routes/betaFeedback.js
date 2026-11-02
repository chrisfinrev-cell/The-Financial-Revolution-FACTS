'use strict';

/**
 * Beta feedback / bug-report API.
 *
 * Mounts:
 *   app.use('/api/feedback', router)  → POST /api/feedback
 *   app.use('/api/beta', router)      → POST /api/beta/feedback (legacy)
 *
 * Persists to beta_feedback with user metadata. Table is ensured on first use.
 */

const express = require('express');
const router = express.Router();
const { pool } = require('../db/pool');

const ALLOWED_CATEGORIES = new Set([
  'bug',
  'feedback',
  'feature',
  'other',
  'question',
  'ui',
  'performance',
  'general',
  'ui_issue',
  'feature_suggestion'
]);

const FEEDBACK_TYPES = new Set(['BUG', 'UI_ISSUE', 'FEATURE_SUGGESTION', 'GENERAL']);

function getDb(req) {
  return (req && req.app && req.app.get('db')) || pool;
}

async function ensureFeedbackTable(db) {
  await db.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto`).catch(() => {});
  await db.query(`
    CREATE TABLE IF NOT EXISTS beta_feedback (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      category VARCHAR(64) NOT NULL DEFAULT 'bug',
      message TEXT NOT NULL DEFAULT '',
      page_url TEXT,
      user_agent TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      status VARCHAR(32) NOT NULL DEFAULT 'open'
    )
  `);
  await db.query(`ALTER TABLE beta_feedback ADD COLUMN IF NOT EXISTS status VARCHAR(32) NOT NULL DEFAULT 'open'`);
  await db.query(`ALTER TABLE beta_feedback ADD COLUMN IF NOT EXISTS feedback_id UUID DEFAULT gen_random_uuid()`);
  await db.query(`ALTER TABLE beta_feedback ADD COLUMN IF NOT EXISTS session_id VARCHAR(100)`);
  await db.query(`ALTER TABLE beta_feedback ADD COLUMN IF NOT EXISTS feedback_type VARCHAR(50)`);
  await db.query(`ALTER TABLE beta_feedback ADD COLUMN IF NOT EXISTS description TEXT`);
  await db.query(`ALTER TABLE beta_feedback ADD COLUMN IF NOT EXISTS resolved_status BOOLEAN NOT NULL DEFAULT FALSE`);
  await db.query(`ALTER TABLE beta_feedback ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ DEFAULT NOW()`);
  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_beta_feedback_status
      ON beta_feedback (resolved_status, submitted_at DESC)
  `).catch(() => {});
  await db.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_beta_feedback_feedback_id
      ON beta_feedback (feedback_id)
  `).catch(() => {});
}

function pickMessage(body) {
  const raw = (body && (body.message || body.description || body.feedback || body.bug || body.text)) || '';
  return String(raw).trim();
}

function pickCategory(body) {
  const raw = String((body && (body.category || body.type || body.kind || body.feedback_type || body.feedbackType)) || 'feedback')
    .trim()
    .toLowerCase()
    .slice(0, 64);
  if (!raw) return 'feedback';
  if (ALLOWED_CATEGORIES.has(raw)) return raw;
  // Allow free-form short labels from the client (e.g. "billing")
  return raw.replace(/[^a-z0-9_\- ]/gi, '').slice(0, 64) || 'feedback';
}

function toFeedbackType(categoryOrType) {
  const raw = String(categoryOrType || '').trim().toUpperCase().replace(/\s+/g, '_');
  if (FEEDBACK_TYPES.has(raw)) return raw;
  const lower = String(categoryOrType || '').trim().toLowerCase();
  if (lower === 'bug') return 'BUG';
  if (lower === 'ui' || lower === 'ui_issue') return 'UI_ISSUE';
  if (lower === 'feature' || lower === 'feature_suggestion') return 'FEATURE_SUGGESTION';
  return 'GENERAL';
}

function pickPageUrl(body) {
  const raw = (body && (body.pageUrl || body.page_url || body.url || body.path)) || '';
  return String(raw).trim().slice(0, 255);
}

async function createFeedback(req, res) {
  const body = req.body || {};
  const message = pickMessage(body);
  const category = pickCategory(body);
  const feedbackType = toFeedbackType(body.feedback_type || body.feedbackType || category);
  const pageUrl = pickPageUrl(body) || String(req.headers.referer || '/').slice(0, 255);
  const sessionId = String(
    body.session_id || body.sessionId || (req.session && req.sessionID) || 'session_anonymous'
  ).slice(0, 100);
  const userId = (req.session && req.session.userId) || null;

  if (!message || message.length < 5) {
    return res.status(400).json({
      error: 'Feedback message is required (min 5 characters).'
    });
  }

  try {
    const db = getDb(req);
    await ensureFeedbackTable(db);

    const userAgent = String(
      body.user_agent || body.userAgent || req.headers['user-agent'] || ''
    ).slice(0, 1000);
    const result = await db.query(
      `INSERT INTO beta_feedback (
         user_id, category, message, description, page_url, user_agent, status,
         feedback_type, session_id, resolved_status, submitted_at, feedback_id
       )
       VALUES ($1, $2, $3, $3, $4, $5, 'open', $6, $7, FALSE, NOW(), gen_random_uuid())
       RETURNING id, feedback_id, category, feedback_type, page_url, status,
                 resolved_status, created_at, submitted_at`,
      [
        userId,
        category,
        message.slice(0, 8000),
        pageUrl || '/',
        userAgent || null,
        feedbackType,
        sessionId
      ]
    );

    const row = result.rows[0];
    console.log(
      `[feedback] user=${userId || 'anon'} id=${row.id} type=${row.feedback_type}` +
      ` page=${row.page_url || '(none)'} email=${(req.session && req.session.email) || ''}`
    );

    return res.status(201).json({
      success: true,
      id: row.id,
      feedbackId: row.feedback_id,
      category: row.category,
      feedbackType: row.feedback_type,
      status: row.status,
      resolvedStatus: row.resolved_status,
      createdAt: row.created_at,
      submittedAt: row.submitted_at
    });
  } catch (err) {
    console.error('[feedback] create failed:', err.message);
    return res.status(500).json({ error: 'Failed to record feedback.' });
  }
}

async function listFeedback(db, opts) {
  const options = opts || {};
  const limit = Math.min(Math.max(parseInt(options.limit, 10) || 100, 1), 500);
  const status = options.status ? String(options.status).trim().toLowerCase() : null;

  await ensureFeedbackTable(db);

  const params = [];
  let where = '';
  if (status && status !== 'all') {
    params.push(status);
    where = `WHERE COALESCE(bf.status, 'open') = $${params.length}`;
  }
  params.push(limit);

  const result = await db.query(
    `SELECT
       bf.id,
       bf.feedback_id,
       bf.user_id,
       bf.session_id,
       bf.category,
       bf.feedback_type,
       bf.message,
       COALESCE(bf.description, bf.message) AS description,
       bf.page_url,
       bf.user_agent,
       bf.status,
       bf.resolved_status,
       bf.created_at,
       COALESCE(bf.submitted_at, bf.created_at) AS submitted_at,
       u.email AS user_email,
       u.name AS user_name,
       COALESCE(u.is_beta_tester, FALSE) AS is_beta_tester
     FROM beta_feedback bf
     LEFT JOIN users u ON bf.user_id = u.id
     ${where}
     ORDER BY COALESCE(bf.submitted_at, bf.created_at) DESC
     LIMIT $${params.length}`,
    params
  );
  return result.rows;
}

// Canonical: POST /api/feedback
router.post('/', createFeedback);
// Legacy: POST /api/beta/feedback
router.post('/feedback', createFeedback);

module.exports = router;
module.exports.ensureFeedbackTable = ensureFeedbackTable;
module.exports.listFeedback = listFeedback;
module.exports.createFeedback = createFeedback;
