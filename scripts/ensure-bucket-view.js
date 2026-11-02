'use strict';
const { pool } = require('../db/pool');
const { ensureBucketDebtSchema } = require('../modules/mod_credit_analysis/bucketDebtSync');

(async () => {
  await ensureBucketDebtSchema(pool);
  console.log('ensureBucketDebtSchema done');
  await pool.end();
})().catch(async (err) => {
  console.error(err);
  await pool.end().catch(() => {});
  process.exit(1);
});
