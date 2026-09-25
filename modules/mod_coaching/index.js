/**
 * mod_coaching — Client readiness intake & rubric (educational).
 *
 * Does NOT replace mod_ai_coach (AI chat). This module scores intake fit.
 *
 * Routes (mounted at /api/mod_coaching):
 *   GET  /health
 *   POST /readiness   — score rubric; persist when authenticated
 *   GET  /readiness   — recent scores for current user
 */

'use strict';

const express = require('express');
const { asyncRoute } = require('../../module-error-boundary');
const { pool } = require('../../db/pool');
const { withManualExecutionNotice } = require('../shared/edu-compliance');

function clamp(value, max) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(max, Math.round(n));
}

function calculateClientReadinessScore(scores) {
  const input = scores || {};
  const parts = {
    pain_point_clarity: clamp(input.pain_point_clarity ?? input.pain_point_clarity_score, 25),
    systems_orientation: clamp(input.systems_orientation ?? input.systems_orientation_score, 20),
    accountability: clamp(input.accountability ?? input.accountability_score, 25),
    implementation_speed: clamp(input.implementation_speed ?? input.implementation_speed_score, 15),
    value_alignment: clamp(input.value_alignment ?? input.value_alignment_score, 15)
  };

  const totalScore =
    parts.pain_point_clarity +
    parts.systems_orientation +
    parts.accountability +
    parts.implementation_speed +
    parts.value_alignment;

  const tier = totalScore >= 80 ? 'PRIME_CANDIDATE' : (totalScore >= 55 ? 'MODERATE_FIT' : 'LOW_FIT');

  return withManualExecutionNotice({
    status: 'evaluated',
    scores: parts,
    total_score: totalScore,
    qualification_tier: tier
  });
}

const router = express.Router();

router.get('/health', asyncRoute(async (req, res) => {
  res.json({ status: 'ok', module: 'mod_coaching', version: '1.0.0' });
}));

router.post('/readiness', asyncRoute(async (req, res) => {
  const result = calculateClientReadinessScore(req.body || {});
  const userId = req.session?.userId || null;

  if (userId) {
    const inserted = await pool.query(
      `INSERT INTO mod_coaching.client_readiness_scores (
         user_id,
         pain_point_clarity_score,
         systems_orientation_score,
         accountability_score,
         implementation_speed_score,
         value_alignment_score,
         qualification_tier
       ) VALUES ($1,$2,$3,$4,$5,$6,$7)
       RETURNING id, total_score, created_at`,
      [
        userId,
        result.scores.pain_point_clarity,
        result.scores.systems_orientation,
        result.scores.accountability,
        result.scores.implementation_speed,
        result.scores.value_alignment,
        result.qualification_tier
      ]
    );
    result.saved_id = inserted.rows[0].id;
    result.stored_total_score = inserted.rows[0].total_score;
  }

  res.json(result);
}));

router.get('/readiness', asyncRoute(async (req, res) => {
  if (!req.session?.userId) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  const { rows } = await pool.query(
    `SELECT id, pain_point_clarity_score, systems_orientation_score,
            accountability_score, implementation_speed_score, value_alignment_score,
            total_score, qualification_tier, created_at
       FROM mod_coaching.client_readiness_scores
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT 20`,
    [req.session.userId]
  );
  res.json(withManualExecutionNotice({ scores: rows }));
}));

module.exports = {
  metadata: {
    name: 'Coaching Intake',
    version: '1.0.0',
    requiredCoreVersion: '1.0.0',
    defaultEnabled: true
  },
  routes: router,
  healthCheck: async () => ({
    module: 'mod_coaching',
    status: 'ok',
    version: '1.0.0',
    timestamp: new Date().toISOString()
  }),
  calculateClientReadinessScore
};
