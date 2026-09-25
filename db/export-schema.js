'use strict';

/**
 * Dump public + module schemas from Neon into db/schema.sql
 * Usage: DATABASE_URL=... node db/export-schema.js
 */

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is not set. Committed db/schema.sql was built from app SQL.');
  process.exit(1);
}

const outFile = path.join(__dirname, 'schema.sql');

const SQL = `
SELECT
  n.nspname AS schema_name,
  c.relname AS table_name,
  a.attname AS column_name,
  pg_catalog.format_type(a.atttypid, a.atttypmod) AS data_type,
  a.attnotnull AS not_null,
  pg_get_expr(ad.adbin, ad.adrelid) AS default_expr
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
LEFT JOIN pg_attrdef ad ON ad.adrelid = c.oid AND ad.adnum = a.attnum
WHERE c.relkind = 'r'
  AND n.nspname NOT IN ('pg_catalog', 'information_schema')
ORDER BY n.nspname, c.relname, a.attnum;
`;

const CONSTRAINTS = `
SELECT n.nspname AS schema_name, c.relname AS table_name,
       con.conname, pg_get_constraintdef(con.oid) AS def
FROM pg_constraint con
JOIN pg_class c ON c.oid = con.conrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')
ORDER BY n.nspname, c.relname, con.conname;
`;

const INDEXES = `
SELECT schemaname, tablename, indexname, indexdef
FROM pg_indexes
WHERE schemaname NOT IN ('pg_catalog', 'information_schema')
ORDER BY schemaname, tablename, indexname;
`;

async function main() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL.includes('localhost') ? false : { rejectUnauthorized: false }
  });
  const cols = await pool.query(SQL);
  const cons = await pool.query(CONSTRAINTS);
  const idx = await pool.query(INDEXES);
  await pool.end();

  const tables = new Map();
  for (const row of cols.rows) {
    const key = `${row.schema_name}.${row.table_name}`;
    if (!tables.has(key)) tables.set(key, []);
    tables.get(key).push(row);
  }

  const lines = [
    '-- FACTS Neon schema dump',
    `-- Generated ${new Date().toISOString()}`,
    'BEGIN;',
    ''
  ];

  const schemas = [...new Set(cols.rows.map((r) => r.schema_name))].filter((s) => s !== 'public');
  for (const s of schemas) {
    lines.push(`CREATE SCHEMA IF NOT EXISTS ${s};`);
  }
  lines.push('');

  for (const [key, columns] of tables) {
    const [schema, table] = key.split('.');
    const qn = schema === 'public' ? table : `${schema}.${table}`;
    lines.push(`CREATE TABLE IF NOT EXISTS ${qn} (`);
    lines.push(
      columns
        .map((c, i) => {
          const nulls = c.not_null ? ' NOT NULL' : '';
          const def = c.default_expr ? ` DEFAULT ${c.default_expr}` : '';
          const comma = i < columns.length - 1 ? ',' : '';
          return `  ${c.column_name} ${c.data_type}${nulls}${def}${comma}`;
        })
        .join('\n')
    );
    lines.push(');');
    lines.push('');
  }

  for (const row of cons.rows) {
    const qn = row.schema_name === 'public' ? row.table_name : `${row.schema_name}.${row.table_name}`;
    lines.push(`ALTER TABLE ${qn} ADD CONSTRAINT ${row.conname} ${row.def};`);
  }
  lines.push('');
  for (const row of idx.rows) {
    lines.push(`${row.indexdef};`);
  }
  lines.push('', 'COMMIT;', '');

  fs.writeFileSync(outFile, lines.join('\n'), 'utf8');
  console.log(`Wrote ${outFile} (${tables.size} tables)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
