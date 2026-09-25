/**
 * Year-End Close Job
 *
 * Run this on January 1 at midnight (or trigger manually for testing).
 * For each user who has financial data, creates a year_end_snapshot capturing
 * all account balances as of December 31 of the prior year.
 *
 * Also handles:
 *   - Grace period: snapshot is NOT locked until Jan 31
 *   - Auto-lock: After Jan 31, locks all prior-year snapshots
 *
 * Usage:
 *   node jobs/year-end-close.js              # Closes prior year (default)
 *   node jobs/year-end-close.js --year=2024  # Close a specific year
 *   node jobs/year-end-close.js --lock-only  # Only lock snapshots past grace period
 *   node jobs/year-end-close.js --dry-run    # Preview without saving
 */

require('dotenv').config();
const { Pool } = require('pg');

if (!process.env.DATABASE_URL) {
  console.error('ERROR: DATABASE_URL environment variable is required');
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('localhost') ? false : { rejectUnauthorized: false }
});

const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const isLockOnly = args.includes('--lock-only');
const yearArg = args.find(a => a.startsWith('--year='));
const targetYear = yearArg ? parseInt(yearArg.split('=')[1]) : new Date().getFullYear() - 1;

async function buildBalanceSnapshot(client, userId, year) {
  const yearStart = `${year}-01-01`;
  const yearEnd = `${year}-12-31`;

  // Bank accounts — current balances
  const bankRes = await client.query(
    `SELECT id, name, current_balance, is_archived
     FROM bank_accounts
     WHERE user_id = $1 AND (is_archived = FALSE OR is_archived IS NULL)`,
    [userId]
  );

  // Debts — current balances
  const debtRes = await client.query(
    `SELECT id, name, balance, interest_rate
     FROM debts
     WHERE user_id = $1`,
    [userId]
  );

  // Gift cards — current balances
  let giftCardRes = { rows: [] };
  try {
    giftCardRes = await client.query(
      `SELECT id, name, current_balance
       FROM gift_cards
       WHERE user_id = $1 AND (is_archived = FALSE OR is_archived IS NULL)`,
      [userId]
    );
  } catch (e) { /* table may not exist yet */ }

  // Net worth entries
  let nwRes = { rows: [] };
  try {
    nwRes = await client.query(
      `SELECT id, name, type, value
       FROM net_worth_entries
       WHERE user_id = $1`,
      [userId]
    );
  } catch (e) { /* table may not exist yet */ }

  // Transaction summary for the year
  const txRes = await client.query(
    `SELECT
       type,
       SUM(amount) as total
     FROM transactions
     WHERE user_id = $1
       AND transaction_date >= $2
       AND transaction_date <= $3
     GROUP BY type`,
    [userId, yearStart, yearEnd]
  );
  const txSummary = { income: 0, expense: 0, net: 0 };
  txRes.rows.forEach(r => {
    if (r.type === 'income') txSummary.income = parseFloat(r.total || 0);
    if (r.type === 'expense') txSummary.expense = parseFloat(r.total || 0);
  });
  txSummary.net = txSummary.income - txSummary.expense;

  // Portfolio annual records for this year
  let portfolioRes = { rows: [] };
  try {
    portfolioRes = await client.query(
      `SELECT account_type, ending_value, deposits, withdrawals
       FROM portfolio_annual_records
       WHERE user_id = $1 AND year = $2`,
      [userId, year]
    );
  } catch (e) { /* table may not exist */ }

  // Crypto snapshot closest to year end
  let cryptoRes = { rows: [] };
  try {
    cryptoRes = await client.query(
      `SELECT total_value_usd, snapshot_date
       FROM crypto_portfolio_snapshots
       WHERE user_id = $1
         AND snapshot_date <= $2
       ORDER BY snapshot_date DESC
       LIMIT 1`,
      [userId, yearEnd]
    );
  } catch (e) { /* table may not exist */ }

  return {
    year,
    snapshot_date: yearEnd,
    bank_accounts: bankRes.rows.map(r => ({
      id: r.id,
      name: r.name,
      balance: parseFloat(r.current_balance || 0)
    })),
    debts: debtRes.rows.map(r => ({
      id: r.id,
      name: r.name,
      balance: parseFloat(r.balance || 0),
      interest_rate: parseFloat(r.interest_rate || 0)
    })),
    gift_cards: giftCardRes.rows.map(r => ({
      id: r.id,
      name: r.name,
      balance: parseFloat(r.current_balance || 0)
    })),
    net_worth_entries: nwRes.rows.map(r => ({
      id: r.id,
      name: r.name,
      type: r.type,
      value: parseFloat(r.value || 0)
    })),
    transactions_summary: txSummary,
    portfolio: portfolioRes.rows.map(r => ({
      account_type: r.account_type,
      ending_value: parseFloat(r.ending_value || 0),
      deposits: parseFloat(r.deposits || 0),
      withdrawals: parseFloat(r.withdrawals || 0)
    })),
    crypto: cryptoRes.rows.length > 0 ? {
      total_value_usd: parseFloat(cryptoRes.rows[0].total_value_usd || 0),
      as_of_date: cryptoRes.rows[0].snapshot_date
    } : null
  };
}

async function runYearEndClose() {
  const client = await pool.connect();
  try {
    console.log(`[Year-End Close] Starting year-end close for year: ${targetYear}`);
    if (isDryRun) console.log('[Year-End Close] DRY RUN — no data will be saved');

    // Grace period ends Jan 31 of next year
    const gracePeriodEnds = `${targetYear + 1}-01-31`;

    // Get all users who have financial data for this year
    const usersRes = await client.query(
      `SELECT DISTINCT user_id
       FROM transactions
       WHERE EXTRACT(YEAR FROM transaction_date) = $1
       UNION
       SELECT DISTINCT user_id FROM bank_accounts
       UNION
       SELECT DISTINCT user_id FROM debts`,
      [targetYear]
    );

    console.log(`[Year-End Close] Found ${usersRes.rows.length} users with data for ${targetYear}`);

    let created = 0, updated = 0, skipped = 0;

    for (const { user_id } of usersRes.rows) {
      try {
        const snapshot = await buildBalanceSnapshot(client, user_id, targetYear);

        if (isDryRun) {
          console.log(`[Year-End Close] DRY RUN - user ${user_id}:`,
            JSON.stringify({
              bank_accounts: snapshot.bank_accounts.length,
              debts: snapshot.debts.length,
              transactions_summary: snapshot.transactions_summary
            })
          );
          continue;
        }

        // Check if already exists and locked
        const existing = await client.query(
          `SELECT id, is_locked FROM year_end_snapshots WHERE user_id = $1 AND year = $2`,
          [user_id, targetYear]
        );

        if (existing.rows.length > 0 && existing.rows[0].is_locked) {
          console.log(`[Year-End Close] Skipping user ${user_id} — year ${targetYear} already locked`);
          skipped++;
          continue;
        }

        await client.query(
          `INSERT INTO year_end_snapshots (user_id, year, snapshot_date, balance_data, is_locked, grace_period_ends)
           VALUES ($1, $2, $3, $4, FALSE, $5)
           ON CONFLICT (user_id, year) DO UPDATE SET
             balance_data = EXCLUDED.balance_data,
             grace_period_ends = EXCLUDED.grace_period_ends,
             updated_at = NOW()`,
          [user_id, targetYear, `${targetYear}-12-31`, snapshot, gracePeriodEnds]
        );

        if (existing.rows.length > 0) {
          updated++;
        } else {
          created++;
        }
      } catch (err) {
        console.error(`[Year-End Close] Error processing user ${user_id}:`, err.message);
      }
    }

    console.log(`[Year-End Close] Done. Created: ${created}, Updated: ${updated}, Skipped: ${skipped}`);
    return { created, updated, skipped };
  } finally {
    client.release();
  }
}

async function lockExpiredSnapshots() {
  const client = await pool.connect();
  try {
    console.log('[Year-End Close] Locking snapshots past grace period...');

    if (isDryRun) {
      const toLock = await client.query(
        `SELECT user_id, year FROM year_end_snapshots
         WHERE is_locked = FALSE
           AND grace_period_ends < CURRENT_DATE`,
      );
      console.log(`[Year-End Close] DRY RUN — would lock ${toLock.rows.length} snapshots`);
      return toLock.rows.length;
    }

    const result = await client.query(
      `UPDATE year_end_snapshots
       SET is_locked = TRUE, locked_at = NOW(), updated_at = NOW()
       WHERE is_locked = FALSE
         AND grace_period_ends < CURRENT_DATE
       RETURNING user_id, year`
    );

    console.log(`[Year-End Close] Locked ${result.rows.length} snapshots`);
    return result.rows.length;
  } finally {
    client.release();
  }
}

async function deleteOldArchives() {
  // Keep 5 years. Users with data older than 5 years should receive warnings first.
  // This function only deletes data that is 6+ years old AND warnings have been sent/acknowledged.
  const client = await pool.connect();
  try {
    const cutoffYear = new Date().getFullYear() - 5; // e.g. 2026 - 5 = 2021 → delete 2020 and older

    console.log(`[Year-End Close] Checking for archives to delete (year < ${cutoffYear})...`);

    const toDelete = await client.query(
      `SELECT ys.user_id, ys.year
       FROM year_end_snapshots ys
       WHERE ys.year < $1
         AND ys.is_locked = TRUE
         AND EXISTS (
           SELECT 1 FROM archive_warnings aw
           WHERE aw.user_id = ys.user_id
             AND aw.year_to_delete = ys.year
             AND aw.warning_level = 1
         )`,
      [cutoffYear]
    );

    if (toDelete.rows.length === 0) {
      console.log('[Year-End Close] No archives eligible for deletion');
      return 0;
    }

    if (isDryRun) {
      console.log(`[Year-End Close] DRY RUN — would delete ${toDelete.rows.length} archived years`);
      return toDelete.rows.length;
    }

    for (const { user_id, year } of toDelete.rows) {
      // Delete the snapshot
      await client.query(
        `DELETE FROM year_end_snapshots WHERE user_id = $1 AND year = $2`,
        [user_id, year]
      );
      console.log(`[Year-End Close] Deleted archive for user ${user_id}, year ${year}`);
    }

    return toDelete.rows.length;
  } finally {
    client.release();
  }
}

(async () => {
  try {
    if (isLockOnly) {
      await lockExpiredSnapshots();
    } else {
      await runYearEndClose();
      await lockExpiredSnapshots();
      await deleteOldArchives();
    }
    console.log('[Year-End Close] Job complete');
  } catch (err) {
    console.error('[Year-End Close] Fatal error:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
})();
