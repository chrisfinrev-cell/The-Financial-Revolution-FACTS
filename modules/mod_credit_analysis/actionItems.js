'use strict';

/**
 * Credit audit action items: strike-through progress + educational letter drafts.
 * CROA-safe: templates are for user literacy/self-use only. FACTS never sends
 * letters to bureaus or furnishers on the user's behalf.
 *
 * Physical tables (product sketch):
 *   audit_items, generated_dispute_letters
 */

const crypto = require('crypto');

async function ensureActionItemsSchema(pool) {
  // Drop sketch-name *views* only (error if we DROP VIEW on a real table)
  await pool.query(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relname = 'generated_dispute_letters' AND c.relkind = 'v'
      ) THEN
        EXECUTE 'DROP VIEW generated_dispute_letters CASCADE';
      END IF;
      IF EXISTS (
        SELECT 1 FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relname = 'audit_items' AND c.relkind = 'v'
      ) THEN
        EXECUTE 'DROP VIEW audit_items CASCADE';
      END IF;
    END $$;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS audit_items (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      document_id INTEGER REFERENCES user_documents(id) ON DELETE CASCADE,
      account VARCHAR(255) NOT NULL DEFAULT '',
      bureau VARCHAR(50) NOT NULL DEFAULT '',
      type VARCHAR(50) NOT NULL,
      details TEXT,
      resolved BOOLEAN DEFAULT FALSE,
      resolved_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      analysis_id INTEGER REFERENCES credit_analyses(id) ON DELETE CASCADE,
      item_key VARCHAR(64),
      label TEXT,
      creditor TEXT,
      amount NUMERIC(12,2),
      letter_type VARCHAR(32),
      meta JSONB NOT NULL DEFAULT '{}'::jsonb
    )
  `);

  await pool.query(`
    ALTER TABLE audit_items ADD COLUMN IF NOT EXISTS analysis_id INTEGER REFERENCES credit_analyses(id) ON DELETE CASCADE
  `).catch(() => {});
  await pool.query(`ALTER TABLE audit_items ADD COLUMN IF NOT EXISTS item_key VARCHAR(64)`).catch(() => {});
  await pool.query(`ALTER TABLE audit_items ADD COLUMN IF NOT EXISTS label TEXT`).catch(() => {});
  await pool.query(`ALTER TABLE audit_items ADD COLUMN IF NOT EXISTS creditor TEXT`).catch(() => {});
  await pool.query(`ALTER TABLE audit_items ADD COLUMN IF NOT EXISTS amount NUMERIC(12,2)`).catch(() => {});
  await pool.query(`ALTER TABLE audit_items ADD COLUMN IF NOT EXISTS letter_type VARCHAR(32)`).catch(() => {});
  await pool.query(`ALTER TABLE audit_items ADD COLUMN IF NOT EXISTS meta JSONB NOT NULL DEFAULT '{}'::jsonb`).catch(() => {});

  await pool.query(`
    CREATE TABLE IF NOT EXISTS generated_dispute_letters (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      audit_item_id INTEGER REFERENCES audit_items(id) ON DELETE CASCADE,
      bureau VARCHAR(50) NOT NULL DEFAULT '',
      letter_content TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      analysis_id INTEGER REFERENCES credit_analyses(id) ON DELETE SET NULL
    )
  `);
  await pool.query(`
    ALTER TABLE generated_dispute_letters
      ADD COLUMN IF NOT EXISTS analysis_id INTEGER REFERENCES credit_analyses(id) ON DELETE SET NULL
  `).catch(() => {});

  await pool.query(`CREATE INDEX IF NOT EXISTS idx_audit_items_user_id ON audit_items(user_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_audit_items_document_id ON audit_items(document_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_audit_items_analysis_id ON audit_items(analysis_id)`);
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_audit_items_analysis_item_key
      ON audit_items (analysis_id, item_key)
      WHERE analysis_id IS NOT NULL AND item_key IS NOT NULL
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_generated_letters_user_id ON generated_dispute_letters(user_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_generated_letters_item_id ON generated_dispute_letters(audit_item_id)`);

  // One-time best-effort copy from legacy tables (no-op if absent / already migrated)
  try {
    const { rows } = await pool.query(`SELECT to_regclass('public.credit_audit_items') AS reg`);
    if (rows[0] && rows[0].reg) {
      const kind = await pool.query(`
        SELECT c.relkind FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relname = 'credit_audit_items'
      `);
      if (kind.rows[0] && kind.rows[0].relkind === 'r') {
        await pool.query(`
          INSERT INTO audit_items (
            id, user_id, document_id, account, bureau, type, details,
            resolved, resolved_at, created_at, updated_at,
            analysis_id, item_key, label, creditor, amount, letter_type, meta
          )
          SELECT
            id, user_id, document_id,
            COALESCE(NULLIF(creditor, ''), NULLIF(label, ''), 'Audit item'),
            COALESCE(bureau, ''),
            COALESCE(item_type, 'negative'),
            details, resolved, resolved_at, created_at, updated_at,
            analysis_id, item_key, label, creditor, amount, letter_type, meta
          FROM credit_audit_items cai
          WHERE NOT EXISTS (SELECT 1 FROM audit_items ai WHERE ai.id = cai.id)
        `);
      }
    }
  } catch (migrateErr) {
    console.warn('[actionItems] legacy migrate note:', migrateErr.message);
  }
}

function itemKey(parts) {
  return crypto.createHash('sha1').update(parts.filter(Boolean).join('|')).digest('hex').slice(0, 24);
}

function flattenAnalysisToItems(analysis) {
  const items = [];
  if (!analysis || typeof analysis !== 'object') return items;

  (analysis.address_vulnerabilities || []).forEach((a, idx) => {
    items.push({
      item_key: itemKey(['address', a.address, idx]),
      item_type: 'address',
      label: `Address review: ${a.address || 'Unknown address'}`,
      details: a.forensic_strategy || a.status || 'Stale/duplicate address observation',
      bureau: null,
      creditor: null,
      amount: null,
      letter_type: 'address',
      meta: { address: a.address || null, status: a.status || null, anchored_items: a.anchored_items || [] }
    });
  });

  (analysis.negative_items || []).forEach((n, idx) => {
    const amt = n.amount != null ? Number(n.amount) : null;
    const rawType = String(n.type || n.item_type || 'negative').toLowerCase().replace(/\s+/g, '_');
    const itemType = ['collection', 'charge_off', 'chargeoff', 'judgment', 'repossession'].includes(rawType)
      ? (rawType === 'chargeoff' ? 'charge_off' : rawType)
      : 'negative';
    items.push({
      item_key: itemKey(['negative', n.creditor, n.type, n.amount, idx]),
      item_type: itemType,
      label: `${n.creditor || 'Creditor'}${n.type ? ` (${n.type})` : ''}${amt != null ? ` — $${amt.toLocaleString()}` : ''}`,
      details: [n.recommended_action || n.educational_topic, n.anchor_address ? `Linked address: ${n.anchor_address}` : null]
        .filter(Boolean).join(' · ') || 'Negative item educational review',
      bureau: n.bureau || null,
      creditor: n.creditor || null,
      amount: Number.isFinite(amt) ? amt : null,
      letter_type: 'negative',
      meta: n
    });
  });

  (analysis.hard_inquiries || []).forEach((i, idx) => {
    items.push({
      item_key: itemKey(['inquiry', i.creditor, i.date, idx]),
      item_type: 'inquiry',
      label: `Hard inquiry: ${i.creditor || 'Unknown'}${i.date ? ` (${i.date})` : ''}`,
      details: i.flagged
        ? `Flagged for review · drops off ${i.drop_off_date || '—'}`
        : `Drops off ${i.drop_off_date || '—'}`,
      bureau: i.bureau || null,
      creditor: i.creditor || null,
      amount: null,
      letter_type: 'inquiry',
      meta: i
    });
  });

  (analysis.action_summary || []).forEach((text, idx) => {
    const t = String(text || '').trim();
    if (!t) return;
    items.push({
      item_key: itemKey(['action', t, idx]),
      item_type: 'action',
      label: t,
      details: 'Prioritized educational follow-through step',
      bureau: null,
      creditor: null,
      amount: null,
      letter_type: 'general',
      meta: { action_index: idx }
    });
  });

  return items;
}

async function seedActionItems(pool, { analysisId, userId, analysis, documentId = null }) {
  await ensureActionItemsSchema(pool);
  if (!userId) return 0;
  const items = flattenAnalysisToItems(analysis);
  for (const item of items) {
    const account = String(item.creditor || item.label || 'Audit item').slice(0, 255);
    const bureau = String(item.bureau || '').slice(0, 50);
    const existing = await pool.query(
      `SELECT id FROM audit_items WHERE analysis_id = $1 AND item_key = $2 LIMIT 1`,
      [analysisId, item.item_key]
    );
    if (existing.rows[0]) {
      await pool.query(
        `UPDATE audit_items
         SET document_id = COALESCE(document_id, $2),
             updated_at = NOW()
         WHERE id = $1`,
        [existing.rows[0].id, documentId || null]
      );
    } else {
      await pool.query(
        `INSERT INTO audit_items
           (analysis_id, user_id, document_id, item_key, type, account, label, details,
            bureau, creditor, amount, letter_type, meta)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb)`,
        [
          analysisId,
          userId,
          documentId || null,
          item.item_key,
          item.item_type,
          account,
          item.label,
          item.details,
          bureau,
          item.creditor,
          item.amount,
          item.letter_type,
          JSON.stringify(item.meta || {})
        ]
      );
    }
  }
  return items.length;
}

async function listActionItems(pool, analysisId) {
  await ensureActionItemsSchema(pool);
  const { rows } = await pool.query(
    `SELECT id, analysis_id, document_id, item_key,
            type, type AS item_type, account, label, details, bureau, creditor, amount,
            resolved, resolved_at, letter_type, meta, created_at, updated_at
     FROM audit_items
     WHERE analysis_id = $1
     ORDER BY
       CASE type
         WHEN 'collection' THEN 1
         WHEN 'charge_off' THEN 1
         WHEN 'judgment' THEN 1
         WHEN 'repossession' THEN 1
         WHEN 'negative' THEN 2
         WHEN 'address' THEN 3
         WHEN 'inquiry' THEN 4
         ELSE 5
       END,
       id ASC`,
    [analysisId]
  );
  return rows;
}

async function setItemResolved(pool, { itemId, userId, resolved }) {
  const { rows } = await pool.query(
    `UPDATE audit_items
     SET resolved = $2,
         resolved_at = CASE WHEN $2 THEN NOW() ELSE NULL END,
         updated_at = NOW()
     WHERE id = $1
       AND (user_id IS NULL OR user_id = $3 OR $3 IS NULL)
     RETURNING *, type AS item_type`,
    [itemId, !!resolved, userId || null]
  );
  const updated = rows[0] || null;
  if (updated) {
    try {
      const { syncDebtStatusFromAuditItem } = require('./bucketDebtSync');
      await syncDebtStatusFromAuditItem(pool, {
        auditItemId: updated.id,
        resolved: !!resolved
      });
    } catch (syncErr) {
      console.warn('[actionItems] bucket debt status sync:', syncErr.message);
    }
  }
  return updated;
}

async function saveAuditLetter(pool, {
  userId,
  auditItemId,
  analysisId,
  bureau,
  letterContent
}) {
  await ensureActionItemsSchema(pool);
  const content = String(letterContent || '').trim();
  if (!content) {
    const err = new Error('Missing letter content.');
    err.status = 400;
    throw err;
  }
  if (!userId) {
    const err = new Error('Authentication required to archive letters.');
    err.status = 401;
    throw err;
  }
  const { rows } = await pool.query(
    `INSERT INTO generated_dispute_letters (user_id, audit_item_id, analysis_id, bureau, letter_content)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, user_id, audit_item_id, analysis_id, bureau, created_at`,
    [
      userId,
      auditItemId || null,
      analysisId || null,
      bureau ? String(bureau).slice(0, 50) : '',
      content
    ]
  );
  return rows[0];
}

async function listAuditLetters(pool, userId, { limit = 50 } = {}) {
  await ensureActionItemsSchema(pool);
  const { rows } = await pool.query(
    `SELECT id, audit_item_id, analysis_id, bureau, created_at,
            LEFT(letter_content, 160) AS preview
     FROM generated_dispute_letters
     WHERE user_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [userId, Math.min(100, Math.max(1, limit))]
  );
  return rows;
}

function buildEducationalLetter(item, userName) {
  const name = userName || '[Your Full Legal Name]';
  const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const bureau = item.bureau || '[Equifax / Experian / TransUnion]';
  const account = item.account || item.creditor || item.label || '[Account / Item]';
  const amount = item.amount != null ? `$${Number(item.amount).toLocaleString()}` : null;
  const type = item.letter_type || item.item_type || item.type || 'general';

  const header =
`${today}

${bureau} Consumer Relations
[Bureau dispute address from your credit report]

Re: Educational self-advocacy letter regarding: ${account}
${amount ? `Reported amount (if applicable): ${amount}\n` : ''}
Dear ${bureau} Consumer Relations,

My name is ${name}. I am writing on my own behalf to request that you investigate the accuracy and completeness of the following information on my consumer credit file.`;

  let body;
  if (type === 'address') {
    body = `
I request a reinvestigation of the following address information, which appears outdated or inaccurate on my file:

${item.label || account}
${item.details ? `\nNotes: ${item.details}` : ''}

Please verify this information with the furnisher(s) and update or delete any information that cannot be verified as accurate and complete, consistent with the Fair Credit Reporting Act (including 15 U.S.C. § 1681i).`;
  } else if (type === 'inquiry') {
    body = `
I request a reinvestigation of the following hard inquiry appearing on my file:

${item.label || account}
${item.details ? `\nNotes: ${item.details}` : ''}

Please verify that this inquiry was authorized and properly reported. If it cannot be verified, please update or delete it consistent with the Fair Credit Reporting Act.`;
  } else if (type === 'negative' || type === 'collection' || type === 'charge_off') {
    body = `
I request a reinvestigation of the following tradeline / negative item:

${item.label || account}
${item.details ? `\nNotes: ${item.details}` : ''}

Please verify the accuracy and completeness of this reporting with the furnisher. If any portion cannot be verified, please update or delete the unverified information consistent with the Fair Credit Reporting Act (including 15 U.S.C. § 1681i).`;
  } else {
    body = `
I request a reinvestigation related to the following educational follow-through item from my credit file review:

${item.label || account}
${item.details ? `\nNotes: ${item.details}` : ''}

Please verify any related information and correct anything that cannot be verified as accurate and complete under the Fair Credit Reporting Act.`;
  }

  const footer = `

Please send written results of your reinvestigation to my address of record.

Sincerely,

${name}
[Your current mailing address]
[Your phone / email]

---
EDUCATIONAL TEMPLATE ONLY — Generated by FACTS for consumer literacy.
FACTS is not a credit repair organization, does not contact credit bureaus or furnishers for you,
does not guarantee deletion/score changes, and does not provide legal advice.
Review with a licensed professional before sending. You are solely responsible for any letter you send.`;

  return header + body + footer;
}

module.exports = {
  ensureActionItemsSchema,
  flattenAnalysisToItems,
  seedActionItems,
  listActionItems,
  setItemResolved,
  buildEducationalLetter,
  saveAuditLetter,
  listAuditLetters
};
