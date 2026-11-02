'use strict';

/**
 * Sync forensic credit audit liabilities into the FACTS Bucket 2 ledger (`debts`).
 *
 * Product sketch table: bucket_debt_obligations
 * Production: debts (+ view bucket_debt_obligations)
 *   - user_id INTEGER → users(id)
 *   - audit_item_id → audit_items(id)
 *
 * Educational import only — does not invent APRs or payments when unknown.
 */

async function ensureBucketDebtSchema(pool) {
  if (!pool) return;

  await pool.query(`
    CREATE TABLE IF NOT EXISTS debts (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name VARCHAR(255) NOT NULL,
      balance NUMERIC(12, 2) NOT NULL DEFAULT 0,
      interest_rate NUMERIC(8, 4) NOT NULL DEFAULT 0,
      minimum_payment NUMERIC(12, 2) NOT NULL DEFAULT 0,
      current_payment NUMERIC(12, 2),
      notes TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    ALTER TABLE debts
      ADD COLUMN IF NOT EXISTS audit_item_id INTEGER
  `);
  // Prefer FK to physical audit_items (sketch); ignore if already constrained
  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'debts_audit_item_id_fkey') THEN
        ALTER TABLE debts
          ADD CONSTRAINT debts_audit_item_id_fkey
          FOREIGN KEY (audit_item_id) REFERENCES audit_items(id) ON DELETE SET NULL;
      END IF;
    END $$;
  `).catch(() => {});
  await pool.query(`
    ALTER TABLE debts
      ADD COLUMN IF NOT EXISTS status VARCHAR(50) NOT NULL DEFAULT 'active'
  `);
  await pool.query(`
    ALTER TABLE debts
      ADD COLUMN IF NOT EXISTS source VARCHAR(64) DEFAULT 'manual'
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_debts_user_id ON debts (user_id)
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_debts_audit_item_id ON debts (audit_item_id)
  `);
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_debts_user_audit_item_unique
      ON debts (user_id, audit_item_id)
      WHERE audit_item_id IS NOT NULL
  `);

  await pool.query(`
    CREATE OR REPLACE VIEW bucket_debt_obligations AS
    SELECT
      id,
      user_id,
      audit_item_id,
      name AS creditor_name,
      balance,
      COALESCE(current_payment, minimum_payment) AS monthly_payment,
      COALESCE(status, 'active') AS status,
      created_at,
      updated_at,
      source,
      interest_rate,
      notes
    FROM debts
  `);
}

function debtNameFromItem(item) {
  const base = String(item.account || item.creditor || item.label || 'Credit liability').slice(0, 200);
  const t = item.item_type || item.type;
  const type = t && t !== 'negative' ? ` (${t})` : '';
  return (base + type).slice(0, 255);
}

/**
 * Upsert Bucket 2 rows from debt-type audit items (preferred) and analysis fallbacks.
 */
async function syncAuditLiabilitiesToBucket2(pool, { userId, analysisId, analysis = null }) {
  if (!pool || !userId) return { mapped: 0, linked: 0 };
  try {
    const { ensureActionItemsSchema } = require('./actionItems');
    await ensureActionItemsSchema(pool);
  } catch (_) { /* table may already exist */ }
  await ensureBucketDebtSchema(pool);

  let mapped = 0;
  let linked = 0;
  const seenNames = new Set();

  if (analysisId) {
    const { rows: items } = await pool.query(
      `SELECT id, creditor, label, account, amount, type AS item_type, details, resolved, bureau, meta
       FROM audit_items
       WHERE analysis_id = $1
         AND user_id = $2
         AND type IN ('negative', 'collection', 'charge_off', 'judgment', 'repossession')
         AND amount IS NOT NULL
         AND amount > 0`,
      [analysisId, userId]
    );

    for (const item of items) {
      const name = debtNameFromItem(item);
      const balance = Number(item.amount);
      if (!Number.isFinite(balance) || balance <= 0) continue;
      const status = item.resolved ? 'resolved' : 'active';
      const notes =
        `Imported from forensic credit audit item #${item.id}` +
        (item.bureau ? ` · ${item.bureau}` : '') +
        (item.details ? ` — ${String(item.details).slice(0, 180)}` : '');

      try {
        const byLink = await pool.query(
          `SELECT id FROM debts WHERE user_id = $1 AND audit_item_id = $2 LIMIT 1`,
          [userId, item.id]
        );
        if (byLink.rows[0]) {
          await pool.query(
            `UPDATE debts
             SET name = $2, balance = $3, status = $4, notes = $5,
                 source = 'credit_audit', updated_at = NOW()
             WHERE id = $1`,
            [byLink.rows[0].id, name, balance, status, notes]
          );
          linked += 1;
        } else {
          const byName = await pool.query(
            `SELECT id, audit_item_id FROM debts
             WHERE user_id = $1 AND LOWER(name) = LOWER($2)
             LIMIT 1`,
            [userId, name]
          );
          if (byName.rows[0]) {
            await pool.query(
              `UPDATE debts
               SET balance = $2, status = $3, notes = COALESCE(notes, $4),
                   audit_item_id = COALESCE(audit_item_id, $5),
                   source = COALESCE(NULLIF(source, 'manual'), 'credit_audit'),
                   updated_at = NOW()
               WHERE id = $1`,
              [byName.rows[0].id, balance, status, notes, item.id]
            );
            if (!byName.rows[0].audit_item_id) linked += 1;
          } else {
            await pool.query(
              `INSERT INTO debts
                 (user_id, name, balance, interest_rate, minimum_payment, notes, audit_item_id, status, source)
               VALUES ($1, $2, $3, 0, 0, $4, $5, $6, 'credit_audit')`,
              [userId, name, balance, notes, item.id, status]
            );
            linked += 1;
          }
        }
        seenNames.add(name.toLowerCase());
        mapped += 1;
      } catch (err) {
        console.warn('[bucketDebtSync] audit item map skip:', err.message);
      }
    }
  }

  // Fallback: analysis JSON accounts / negatives not yet represented as audit rows
  if (analysis && typeof analysis === 'object') {
    const candidates = [];
    for (const item of analysis.negative_items || []) {
      const amount = Number(item.amount);
      if (!item.creditor || !Number.isFinite(amount) || amount <= 0) continue;
      candidates.push({
        name: String(item.creditor).slice(0, 200) + (item.type ? ` (${item.type})` : ''),
        balance: amount,
        notes: 'Imported from credit report forensic scan (educational)'
      });
    }
    for (const acct of analysis.accounts || []) {
      const balance = Number(acct.balance);
      if (!acct.creditor || !Number.isFinite(balance) || balance <= 0) continue;
      if (acct.account_type && !['revolving', 'installment', 'other'].includes(acct.account_type)) continue;
      candidates.push({
        name: String(acct.creditor).slice(0, 220),
        balance,
        notes: 'Imported revolving/installment balance from credit report scan (educational)'
      });
    }

    for (const row of candidates.slice(0, 40)) {
      if (seenNames.has(row.name.toLowerCase())) continue;
      try {
        const existing = await pool.query(
          `SELECT id FROM debts WHERE user_id = $1 AND LOWER(name) = LOWER($2) LIMIT 1`,
          [userId, row.name]
        );
        if (existing.rows[0]) {
          await pool.query(
            `UPDATE debts
             SET balance = $2, notes = COALESCE(notes, $3),
                 source = COALESCE(NULLIF(source, 'manual'), 'credit_audit'),
                 updated_at = NOW()
             WHERE id = $1`,
            [existing.rows[0].id, row.balance, row.notes]
          );
        } else {
          await pool.query(
            `INSERT INTO debts (user_id, name, balance, interest_rate, minimum_payment, notes, status, source)
             VALUES ($1, $2, $3, 0, 0, $4, 'active', 'credit_audit')`,
            [userId, row.name, row.balance, row.notes]
          );
        }
        seenNames.add(row.name.toLowerCase());
        mapped += 1;
      } catch (err) {
        console.warn('[bucketDebtSync] analysis map skip:', err.message);
      }
    }
  }

  return { mapped, linked };
}

/** When an audit checklist item is struck through, mirror status onto linked Bucket 2 debt. */
async function syncDebtStatusFromAuditItem(pool, { auditItemId, resolved }) {
  if (!pool || !auditItemId) return null;
  await ensureBucketDebtSchema(pool);
  const status = resolved ? 'resolved' : 'active';
  const { rows } = await pool.query(
    `UPDATE debts
     SET status = $2, updated_at = NOW()
     WHERE audit_item_id = $1
     RETURNING id, status, balance, name`,
    [auditItemId, status]
  );
  return rows[0] || null;
}

/**
 * Manually link / update one audit item into Bucket 2.
 * Sketch writes to bucket_debt_obligations; production upserts `debts`
 * (bucket_debt_obligations is a compatibility view).
 */
async function linkAuditItemToBucket2(pool, {
  userId,
  auditItemId,
  balance,
  monthlyPayment
}) {
  if (!pool || !userId || !auditItemId) {
    const err = new Error('Missing audit item reference.');
    err.status = 400;
    throw err;
  }

  try {
    const { ensureActionItemsSchema } = require('./actionItems');
    await ensureActionItemsSchema(pool);
  } catch (_) { /* ok */ }
  await ensureBucketDebtSchema(pool);

  const itemResult = await pool.query(
    `SELECT id, user_id, analysis_id, account, bureau, type, details,
            resolved, label, creditor, amount
     FROM audit_items
     WHERE id = $1 AND user_id = $2`,
    [auditItemId, userId]
  );
  if (itemResult.rows.length === 0) {
    const err = new Error('Audit item not found or unauthorized.');
    err.status = 404;
    throw err;
  }
  const item = itemResult.rows[0];

  const creditorName = String(item.account || item.creditor || item.label || 'Credit liability').slice(0, 255);
  const balRaw = balance != null && balance !== '' ? Number(balance) : Number(item.amount);
  const bal = Number.isFinite(balRaw) && balRaw >= 0 ? balRaw : 0;
  const payRaw = monthlyPayment != null && monthlyPayment !== '' ? Number(monthlyPayment) : 0;
  const monthly = Number.isFinite(payRaw) && payRaw >= 0 ? payRaw : 0;
  const status = item.resolved ? 'resolved' : 'active';
  const notes =
    `Linked to Bucket 2 from forensic audit item #${item.id}` +
    (item.bureau ? ` · ${item.bureau}` : '');

  const existing = await pool.query(
    `SELECT id FROM debts WHERE user_id = $1 AND audit_item_id = $2 LIMIT 1`,
    [userId, auditItemId]
  );

  let debt;
  if (existing.rows[0]) {
    const { rows: updated } = await pool.query(
      `UPDATE debts
       SET name = $2,
           balance = $3,
           minimum_payment = $4,
           current_payment = $4,
           status = $5,
           notes = $6,
           source = 'credit_audit',
           updated_at = NOW()
       WHERE id = $1
       RETURNING id, name, balance, minimum_payment, current_payment, status, audit_item_id, created_at`,
      [existing.rows[0].id, creditorName, bal, monthly, status, notes]
    );
    debt = updated[0];
  } else {
    const byName = await pool.query(
      `SELECT id FROM debts
       WHERE user_id = $1 AND LOWER(name) = LOWER($2) AND audit_item_id IS NULL
       LIMIT 1`,
      [userId, creditorName]
    );
    if (byName.rows[0]) {
      const { rows: updated } = await pool.query(
        `UPDATE debts
         SET name = $2,
             balance = $3,
             minimum_payment = $4,
             current_payment = $4,
             audit_item_id = $5,
             status = $6,
             notes = COALESCE(notes, $7),
             source = 'credit_audit',
             updated_at = NOW()
         WHERE id = $1
         RETURNING id, name, balance, minimum_payment, current_payment, status, audit_item_id, created_at`,
        [byName.rows[0].id, creditorName, bal, monthly, auditItemId, status, notes]
      );
      debt = updated[0];
    } else {
      // Equivalent to sketch INSERT INTO bucket_debt_obligations (...)
      const { rows: inserted } = await pool.query(
        `INSERT INTO debts
           (user_id, name, balance, interest_rate, minimum_payment, current_payment,
            notes, audit_item_id, status, source)
         VALUES ($1, $2, $3, 0, $4, $4, $5, $6, $7, 'credit_audit')
         RETURNING id, name, balance, minimum_payment, current_payment, status, audit_item_id, created_at`,
        [userId, creditorName, bal, monthly, notes, auditItemId, status]
      );
      debt = inserted[0];
    }
  }

  return {
    bucketDebtId: debt.id,
    creditor_name: debt.name,
    balance: debt.balance,
    monthly_payment: debt.current_payment || debt.minimum_payment,
    status: debt.status,
    audit_item_id: debt.audit_item_id
  };
}

module.exports = {
  ensureBucketDebtSchema,
  syncAuditLiabilitiesToBucket2,
  syncDebtStatusFromAuditItem,
  linkAuditItemToBucket2
};
