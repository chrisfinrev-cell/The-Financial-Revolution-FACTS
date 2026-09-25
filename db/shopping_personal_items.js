'use strict';
// db/shopping_personal_items.js — Personal item recall for the Shopping Calculator
// Owns: user_personal_items reads/writes. Does NOT own: shopping_lists, prices.

const pool = require('./index');

async function getPersonalItems(userId, sessionKey) {
  const where = userId ? 'user_id = $1' : 'session_key = $1';
  const param = userId || sessionKey;
  const r = await pool.query(
    `SELECT id, item_name, category, last_used_at, use_count, created_at
     FROM mod_shopping.user_personal_items
     WHERE ${where}
     ORDER BY use_count DESC, last_used_at DESC NULLS LAST
     LIMIT 50`,
    [param]
  );
  return r.rows;
}

async function upsertPersonalItem(userId, sessionKey, itemName, category) {
  const where = userId ? 'user_id = $1' : 'session_key = $1';
  const param = userId || sessionKey;
  const r = await pool.query(
    `INSERT INTO mod_shopping.user_personal_items(user_id, session_key, item_name, category, last_used_at, use_count)
     VALUES ($1, $2, $3, $4, now(), 1)
     ON CONFLICT ${userId ? '(user_id, item_name) WHERE user_id IS NOT NULL' : '(session_key, item_name) WHERE user_id IS NULL'}
     DO UPDATE SET last_used_at = now(), use_count = mod_shopping.user_personal_items.use_count + 1, category = COALESCE(NULLIF($4, ''), mod_shopping.user_personal_items.category)
     RETURNING *`,
    [userId, sessionKey, itemName, category || '']
  );
  return r.rows[0];
}

async function deletePersonalItem(id, userId, sessionKey) {
  const where = userId ? 'id = $1 AND user_id = $2' : 'id = $1 AND session_key = $2';
  const params = userId ? [id, userId] : [id, sessionKey];
  const r = await pool.query(
    `DELETE FROM mod_shopping.user_personal_items WHERE ${where} RETURNING id`,
    params
  );
  return r.rows[0];
}

module.exports = { getPersonalItems, upsertPersonalItem, deletePersonalItem };