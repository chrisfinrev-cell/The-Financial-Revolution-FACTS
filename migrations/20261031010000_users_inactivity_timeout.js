'use strict';

/**
 * Ensure users table has inactivity timeout preference columns (minutes).
 * inactivity_timeout is the canonical preference; timeout_minutes is kept
 * in sync for legacy /api/user/timeout-preference routes.
 */
module.exports = {
  name: 'users_inactivity_timeout',
  up: async (client) => {
    await client.query(`
      ALTER TABLE users
        ADD COLUMN IF NOT EXISTS timeout_minutes INTEGER DEFAULT 15
    `);
    await client.query(`
      ALTER TABLE users
        ADD COLUMN IF NOT EXISTS inactivity_timeout INTEGER DEFAULT 15
    `);
    await client.query(`
      UPDATE users
         SET timeout_minutes = COALESCE(timeout_minutes, 15),
             inactivity_timeout = COALESCE(inactivity_timeout, timeout_minutes, 15)
       WHERE timeout_minutes IS NULL
          OR inactivity_timeout IS NULL
    `);
  }
};
