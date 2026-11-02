'use strict';

const { pool } = require('../db/pool');

async function describe(name) {
  console.log('\n=== ' + name + ' ===');
  const kind = await pool.query(
    `SELECT c.relkind,
            CASE c.relkind
              WHEN 'r' THEN 'table'
              WHEN 'v' THEN 'view'
              WHEN 'm' THEN 'materialized view'
              ELSE c.relkind::text
            END AS kind
     FROM pg_class c
     JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname = $1`,
    [name]
  );
  if (!kind.rows[0]) {
    console.log('MISSING');
    return;
  }
  console.log('Type:', kind.rows[0].kind);

  const cols = await pool.query(
    `SELECT
       a.attname AS column_name,
       pg_catalog.format_type(a.atttypid, a.atttypmod) AS data_type,
       a.attnotnull AS not_null,
       pg_get_expr(ad.adbin, ad.adrelid) AS column_default
     FROM pg_attribute a
     JOIN pg_class c ON c.oid = a.attrelid
     JOIN pg_namespace n ON n.oid = c.relnamespace
     LEFT JOIN pg_attrdef ad ON ad.adrelid = a.attrelid AND ad.adnum = a.attnum
     WHERE n.nspname = 'public'
       AND c.relname = $1
       AND a.attnum > 0
       AND NOT a.attisdropped
     ORDER BY a.attnum`,
    [name]
  );
  console.log('Columns:');
  for (const c of cols.rows) {
    console.log(
      '  ' + c.column_name.padEnd(22) +
      c.data_type.padEnd(28) +
      (c.not_null ? 'NOT NULL  ' : 'nullable  ') +
      (c.column_default ? 'default ' + c.column_default : '')
    );
  }

  if (kind.rows[0].relkind === 'r') {
    const fks = await pool.query(
      `SELECT
         con.conname AS constraint_name,
         att.attname AS column_name,
         nf.nspname || '.' || cf.relname AS foreign_table,
         attf.attname AS foreign_column
       FROM pg_constraint con
       JOIN pg_class c ON c.oid = con.conrelid
       JOIN pg_namespace n ON n.oid = c.relnamespace
       JOIN LATERAL unnest(con.conkey) WITH ORDINALITY AS cols(attnum, ord) ON true
       JOIN pg_attribute att ON att.attrelid = c.oid AND att.attnum = cols.attnum
       JOIN pg_class cf ON cf.oid = con.confrelid
       JOIN pg_namespace nf ON nf.oid = cf.relnamespace
       JOIN LATERAL unnest(con.confkey) WITH ORDINALITY AS fcols(attnum, ord) ON fcols.ord = cols.ord
       JOIN pg_attribute attf ON attf.attrelid = cf.oid AND attf.attnum = fcols.attnum
       WHERE con.contype = 'f'
         AND n.nspname = 'public'
         AND c.relname = $1
       ORDER BY con.conname, cols.ord`,
      [name]
    );
    if (fks.rows.length) {
      console.log('Foreign keys:');
      for (const f of fks.rows) {
        console.log(
          '  ' + f.column_name + ' → ' + f.foreign_table + '(' + f.foreign_column + ')  [' + f.constraint_name + ']'
        );
      }
    }

    const idx = await pool.query(
      `SELECT indexname, indexdef
       FROM pg_indexes
       WHERE schemaname = 'public' AND tablename = $1
       ORDER BY indexname`,
      [name]
    );
    if (idx.rows.length) {
      console.log('Indexes:');
      for (const i of idx.rows) console.log('  ' + i.indexdef);
    }
  }

  if (kind.rows[0].relkind === 'v') {
    const def = await pool.query('SELECT pg_get_viewdef($1::regclass, true) AS def', [name]);
    console.log('View definition:\n' + (def.rows[0] && def.rows[0].def));
  }
}

(async () => {
  for (const t of ['audit_items', 'generated_dispute_letters', 'bucket_debt_obligations']) {
    await describe(t);
  }
  await pool.end();
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
