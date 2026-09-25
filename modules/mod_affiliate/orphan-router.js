/**
 * 10-Tier Orphan User Split Engine
 *
 * When a new FACTS user registers with an affiliate ref, this decides whether
 * the placement stays with the affiliate or routes to COMPANY_ROOT based on
 * how many orphans that affiliate has already been assigned.
 *
 * Split is company:field. Cycle size = company slots + field slots.
 * Within a cycle, the last slot (pos % cycleSize === 0) goes to company.
 *
 * Pure helpers are exported for tests. routeOrphanUser is the registration hook.
 */

'use strict';

const ORPHAN_TIERS = [
  { level: 1, min: 1,     max: 50,     company: 1, field: 0,  cycleSize: 1,  label: '1:0' },
  { level: 2, min: 51,    max: 200,    company: 1, field: 1,  cycleSize: 2,  label: '1:1' },
  { level: 3, min: 201,   max: 500,    company: 1, field: 2,  cycleSize: 3,  label: '1:2' },
  { level: 4, min: 501,   max: 1000,   company: 1, field: 3,  cycleSize: 4,  label: '1:3' },
  { level: 5, min: 1001,  max: 1750,   company: 1, field: 4,  cycleSize: 5,  label: '1:4' },
  { level: 6, min: 1751,  max: 2800,   company: 1, field: 5,  cycleSize: 6,  label: '1:5' },
  { level: 7, min: 2801,  max: 5550,   company: 1, field: 10, cycleSize: 11, label: '1:10' },
  { level: 8, min: 5551,  max: 10800,  company: 1, field: 20, cycleSize: 21, label: '1:20' },
  { level: 9, min: 10801, max: 19550,  company: 1, field: 35, cycleSize: 36, label: '1:35' },
  { level: 10, min: 19551, max: Infinity, company: 1, field: 50, cycleSize: 51, label: '1:50' }
];

function getTierForCount(nextIndex) {
  const n = Math.max(1, parseInt(nextIndex, 10) || 1);
  return ORPHAN_TIERS.find(t => n >= t.min && n <= t.max) || ORPHAN_TIERS[ORPHAN_TIERS.length - 1];
}

/**
 * @param {number} nextIndex 1-based cumulative assignment number for this affiliate
 * @returns {boolean} true when this slot is the company keep
 */
function assignsToCompany(nextIndex) {
  const tier = getTierForCount(nextIndex);
  const posInTier = nextIndex - tier.min + 1;
  if (tier.cycleSize <= 1) return true;
  return posInTier % tier.cycleSize === 0;
}

function decidePlacement(nextIndex, affiliateId, companyRootId) {
  const tier = getTierForCount(nextIndex);
  const toCompany = assignsToCompany(nextIndex);
  return {
    tierLevel: tier.level,
    splitLabel: tier.label,
    cycleSize: tier.cycleSize,
    nextIndex,
    assignedToId: toCompany ? companyRootId : affiliateId,
    destination: toCompany ? 'company' : 'affiliate'
  };
}

async function resolveCompanyRootId(client) {
  const envId = parseInt(process.env.COMPANY_ROOT_ID, 10);
  if (Number.isInteger(envId) && envId > 0) return envId;

  const master = await client.query(
    `SELECT id FROM affiliates WHERE is_master_node = true ORDER BY id ASC LIMIT 1`
  ).catch(() => ({ rows: [] }));
  if (master.rows[0]) return master.rows[0].id;

  const first = await client.query(
    `SELECT id FROM affiliates ORDER BY id ASC LIMIT 1`
  ).catch(() => ({ rows: [] }));
  return first.rows[0] ? first.rows[0].id : null;
}

async function resolveAffiliateId(client, { affiliateId, refCode }) {
  if (affiliateId) {
    const check = await client.query('SELECT id FROM affiliates WHERE id = $1', [affiliateId]);
    if (check.rows[0]) return check.rows[0].id;
  }
  if (!refCode) return null;
  const code = String(refCode).trim();
  if (!code) return null;

  const byAffCode = await client.query(
    `SELECT id FROM affiliates WHERE referral_code = $1 LIMIT 1`,
    [code]
  ).catch(() => ({ rows: [] }));
  if (byAffCode.rows[0]) return byAffCode.rows[0].id;

  const byUserCode = await client.query(
    `SELECT a.id
       FROM affiliates a
       JOIN users u ON u.id = a.user_id
      WHERE u.referral_code = $1
      LIMIT 1`,
    [code]
  ).catch(() => ({ rows: [] }));
  return byUserCode.rows[0] ? byUserCode.rows[0].id : null;
}

/**
 * Registration handler. Never throws to the caller — logs and returns null on failure.
 *
 * @param {import('pg').Pool|import('pg').PoolClient} pool
 * @param {{ newUserId: number, affiliateId?: number, refCode?: string }} args
 */
async function routeOrphanUser(pool, args) {
  const newUserId = parseInt(args && args.newUserId, 10);
  if (!Number.isInteger(newUserId) || newUserId <= 0) {
    console.error('[routeOrphanUser] missing newUserId');
    return null;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT id FROM users WHERE id = $1 FOR UPDATE', [newUserId]);

    const prior = await client.query(
      `SELECT affiliate_id, new_user_id, assigned_to_id, tier_level, destination, split_label, next_index
         FROM orphan_assignment_events
        WHERE new_user_id = $1
        ORDER BY id ASC
        LIMIT 1`,
      [newUserId]
    ).catch(() => ({ rows: [] }));
    if (prior.rows[0]) {
      await client.query('ROLLBACK');
      const row = prior.rows[0];
      return {
        affiliateId: row.affiliate_id,
        newUserId: row.new_user_id,
        assignedToId: row.assigned_to_id,
        tierLevel: row.tier_level,
        destination: row.destination,
        nextIndex: row.next_index,
        splitLabel: row.split_label,
        replayed: true
      };
    }

    const companyRootId = await resolveCompanyRootId(client);
    if (!companyRootId) {
      console.warn('[routeOrphanUser] COMPANY_ROOT_ID unresolved — skip placement');
      await client.query('ROLLBACK');
      return null;
    }

    const affiliateId = await resolveAffiliateId(client, {
      affiliateId: args.affiliateId,
      refCode: args.refCode
    });

    // No referring affiliate → 100% company (treat as tier-1 company keep)
    if (!affiliateId || affiliateId === companyRootId) {
      const event = {
        affiliateId: companyRootId,
        newUserId,
        assignedToId: companyRootId,
        tierLevel: 1,
        destination: 'company',
        nextIndex: null,
        splitLabel: '1:0'
      };
      await persistAssignment(client, event, { incrementAffiliate: false });
      await client.query('COMMIT');
      console.log('[routeOrphanUser]', JSON.stringify({ ...event, timestamp: new Date().toISOString() }));
      return event;
    }

    const locked = await client.query(
      `SELECT id, COALESCE(orphans_assigned_count, 0)::INTEGER AS orphans_assigned_count
         FROM affiliates
        WHERE id = $1
        FOR UPDATE`,
      [affiliateId]
    );
    if (!locked.rows[0]) {
      await client.query('ROLLBACK');
      return null;
    }

    const nextIndex = locked.rows[0].orphans_assigned_count + 1;
    const placement = decidePlacement(nextIndex, affiliateId, companyRootId);

    await client.query(
      `UPDATE affiliates
          SET orphans_assigned_count = $1,
              updated_at = NOW()
        WHERE id = $2`,
      [nextIndex, affiliateId]
    );

    const event = {
      affiliateId,
      newUserId,
      assignedToId: placement.assignedToId,
      tierLevel: placement.tierLevel,
      destination: placement.destination,
      nextIndex,
      splitLabel: placement.splitLabel
    };

    await persistAssignment(client, event, { incrementAffiliate: false });
    await client.query('COMMIT');

    console.log('[routeOrphanUser]', JSON.stringify({
      ...event,
      cycleSize: placement.cycleSize,
      timestamp: new Date().toISOString()
    }));
    return event;
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (_) { /* ignore */ }
    console.error('[routeOrphanUser] failed:', err.message);
    return null;
  } finally {
    client.release();
  }
}

async function persistAssignment(client, event, _opts) {
  await client.query(
    `INSERT INTO orphan_assignment_events
       (affiliate_id, new_user_id, assigned_to_id, tier_level, destination, split_label, next_index, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
    [
      event.affiliateId,
      event.newUserId,
      event.assignedToId,
      event.tierLevel,
      event.destination,
      event.splitLabel || null,
      event.nextIndex
    ]
  );

  await client.query(
    `UPDATE users SET referred_by_affiliate_id = $1 WHERE id = $2`,
    [event.assignedToId, event.newUserId]
  ).catch(() => {});

  await placeAffiliateChild(client, event);
}

async function placeAffiliateChild(client, event) {
  const user = await client.query(
    `SELECT id, email, referral_code FROM users WHERE id = $1`,
    [event.newUserId]
  ).catch(() => ({ rows: [] }));
  const email = user.rows[0] && user.rows[0].email;
  if (!email) return;

  const existing = await client.query(
    `SELECT id FROM affiliates WHERE user_id = $1 LIMIT 1`,
    [event.newUserId]
  ).catch(() => ({ rows: [] }));

  if (existing.rows[0]) {
    await client.query(
      `UPDATE affiliates
          SET parent_affiliate_id = $1,
              placement_method = 'orphan_split',
              updated_at = NOW()
        WHERE user_id = $2
          AND (parent_affiliate_id IS NULL OR parent_affiliate_id <> $1)`,
      [event.assignedToId, event.newUserId]
    ).catch(() => {});
    return;
  }

  await client.query(
    `INSERT INTO affiliates
       (user_id, email, referral_code, status, parent_affiliate_id, affiliate_level,
        placement_method, is_ghost_slot, created_at, updated_at)
     VALUES ($1, $2, $3, 'active', $4, 1, 'orphan_split', false, NOW(), NOW())`,
    [event.newUserId, email, user.rows[0].referral_code || null, event.assignedToId]
  ).catch((err) => {
    console.warn('[routeOrphanUser] affiliate insert skipped:', err.message);
  });
}

module.exports = {
  ORPHAN_TIERS,
  getTierForCount,
  assignsToCompany,
  decidePlacement,
  resolveCompanyRootId,
  routeOrphanUser
};
