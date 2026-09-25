/**
 * Process delayed onboarding recovery emails.
 * Called every 5 minutes by polsia.toml cron.
 * Sends Emails 2 & 3 from the 3-part exit capture sequence.
 */
'use strict';

const { Pool } = require('pg');

if (process.env.DATABASE_URL) {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL?.includes('localhost') ? false : { rejectUnauthorized: false },
  });

  processEmails(pool)
    .then(() => pool.end())
    .catch(err => {
      console.error('[cron-delayed-emails] error:', err.message);
      pool.end();
      process.exit(1);
    });
} else {
  console.log('[cron-delayed-emails] DATABASE_URL not set, skipping');
}

async function processEmails(pool) {
  const apiKey = process.env.POLSIA_API_KEY;
  if (!apiKey) {
    console.log('[cron-delayed-emails] POLSIA_API_KEY not set, skipping');
    return;
  }

  const rows = await pool.query(
    `SELECT id, recipient, subject, body_plain
     FROM mod_onboarding.delayed_emails
     WHERE sent = false
       AND send_at <= now()
     ORDER BY send_at ASC
     LIMIT 20`
  );

  if (!rows.rows.length) {
    console.log('[cron-delayed-emails] no emails to send');
    return;
  }

  console.log(`[cron-delayed-emails] processing ${rows.rows.length} emails`);

  for (const row of rows.rows) {
    try {
      const res = await fetch('https://polsia.com/api/proxy/email/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          to: row.recipient,
          subject: row.subject,
          body: row.body_plain,
        }),
      });

      if (res.ok) {
        await pool.query(`UPDATE mod_onboarding.delayed_emails SET sent=true WHERE id=$1`, [row.id]);
        console.log(`[cron-delayed-emails] sent to ${row.recipient}: "${row.subject}"`);
      } else {
        const errBody = await res.text();
        console.error(`[cron-delayed-emails] failed for ${row.recipient}: ${res.status} ${errBody}`);
      }
    } catch (err) {
      console.error(`[cron-delayed-emails] send error for ${row.recipient}:`, err.message);
    }
  }
}