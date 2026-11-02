'use strict';

/**
 * Resource Center catalog — guides, templates, diagrams for /resource-center.
 */
module.exports = {
  name: 'resource_center_items',
  up: async (client) => {
    await client.query(`
      CREATE TABLE IF NOT EXISTS resource_center_items (
        id              SERIAL PRIMARY KEY,
        title           TEXT NOT NULL,
        description     TEXT,
        category        TEXT NOT NULL,
        resource_type   TEXT NOT NULL DEFAULT 'pdf',
        file_url        TEXT,
        file_data       BYTEA,
        file_name       TEXT,
        file_size_bytes INTEGER DEFAULT 0,
        file_mime_type  TEXT,
        thumbnail_emoji TEXT DEFAULT '📄',
        is_pro_only     BOOLEAN NOT NULL DEFAULT true,
        is_active       BOOLEAN NOT NULL DEFAULT true,
        sort_order      INTEGER NOT NULL DEFAULT 0,
        download_count  INTEGER NOT NULL DEFAULT 0,
        created_by      INTEGER REFERENCES users(id) ON DELETE SET NULL,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_resource_center_items_active
        ON resource_center_items (is_active, sort_order, created_at DESC)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_resource_center_items_category
        ON resource_center_items (category)
        WHERE is_active = true
    `);
  },

  down: async (client) => {
    await client.query(`DROP TABLE IF EXISTS resource_center_items`);
  }
};
