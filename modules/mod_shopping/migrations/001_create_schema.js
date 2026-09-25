'use strict';
// Migration: creates mod_shopping schema + tables
// Stores: GPS-discovered stores with community price data
// Shopping lists: user product lists (free tier cap = 10)
// List items: individual items with price entries
// Price submissions: community price data per store/product
// Sweep history: tracks bucket sweep operations

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.createSchema('mod_shopping');

  // Stores discovered via GPS or manual entry
  pgm.createTable('mod_shopping.stores', {
    id: 'id',
    name: { type: 'varchar(255)', notNull: true },
    address: { type: 'varchar(500)' },
    lat: { type: 'decimal(10,7)' },
    lng: { type: 'decimal(10,7)' },
    category: { type: 'varchar(50)', notNull: true }, // gas_station, convenience, grocery, big_box, warehouse, local_indie
    chain: { type: 'varchar(100)' }, // brand name if chain
    price_count: { type: 'integer', default: 0 }, // community price submissions
    avg_price_cents: { type: 'integer' }, // average price in cents
    created_at: { type: 'timestamp', notNull: true, default: pgm.func('now()') },
  });
  pgm.createIndex('mod_shopping.stores', ['lat', 'lng']);

  // User shopping lists
  pgm.createTable('mod_shopping.shopping_lists', {
    id: 'id',
    user_id: { type: 'integer', references: 'users(id)', onDelete: 'CASCADE' },
    name: { type: 'varchar(255)', default: 'My List' },
    store_id: { type: 'integer', references: 'mod_shopping.stores(id)' },
    session_key: { type: 'varchar(100)' }, // anonymous session key
    status: { type: 'varchar(20)', default: 'active' }, // active, shopping, completed
    total_cents: { type: 'integer', default: 0 },
    item_count: { type: 'integer', default: 0 },
    created_at: { type: 'timestamp', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamp', notNull: true, default: pgm.func('now()') },
  });
  pgm.createIndex('mod_shopping.shopping_lists', ['user_id']);
  pgm.createIndex('mod_shopping.shopping_lists', ['session_key']);

  // Items within a shopping list
  pgm.createTable('mod_shopping.list_items', {
    id: 'id',
    list_id: { type: 'integer', notNull: true, references: 'mod_shopping.shopping_lists(id)', onDelete: 'CASCADE' },
    name: { type: 'varchar(255)', notNull: true },
    brand: { type: 'varchar(100)' },
    upc: { type: 'varchar(20)' },
    category: { type: 'varchar(50)' }, // produce, dairy, meat, bakery, frozen, pantry, beverages, household, personal
    quantity: { type: 'integer', default: 1 },
    checked: { type: 'boolean', default: false },
    entered_price_cents: { type: 'integer' }, // price user paid
    confirmed: { type: 'boolean', default: false },
    created_at: { type: 'timestamp', notNull: true, default: pgm.func('now()') },
  });
  pgm.createIndex('mod_shopping.list_items', ['list_id']);

  // Community price submissions (for store averages)
  pgm.createTable('mod_shopping.price_submissions', {
    id: 'id',
    store_id: { type: 'integer', notNull: true, references: 'mod_shopping.stores(id)' },
    user_id: { type: 'integer', references: 'users(id)' },
    session_key: { type: 'varchar(100)' },
    product_name: { type: 'varchar(255)', notNull: true },
    brand: { type: 'varchar(100)' },
    price_cents: { type: 'integer', notNull: true },
    source: { type: 'varchar(20)', default: 'manual' }, // manual, receipt_scan
    created_at: { type: 'timestamp', notNull: true, default: pgm.func('now()') },
  });
  pgm.createIndex('mod_shopping.price_submissions', ['store_id']);
  pgm.createIndex('mod_shopping.price_submissions', ['product_name']);

  // Sweep history for bucket CTAs
  pgm.createTable('mod_shopping.sweep_history', {
    id: 'id',
    user_id: { type: 'integer', references: 'users(id)' },
    session_key: { type: 'varchar(100)' },
    bucket: { type: 'varchar(50)', notNull: true }, // necessities, velocity, reserve, lifestyle, growth, legacy
    amount_cents: { type: 'integer', notNull: true },
    trip_savings_cents: { type: 'integer' }, // how much they saved vs average
    store_id: { type: 'integer', references: 'mod_shopping.stores(id)' },
    created_at: { type: 'timestamp', notNull: true, default: pgm.func('now()') },
  });
  pgm.createIndex('mod_shopping.sweep_history', ['user_id']);

  // Receipt scan history
  pgm.createTable('mod_shopping.receipt_scans', {
    id: 'id',
    user_id: { type: 'integer', references: 'users(id)' },
    session_key: { type: 'varchar(100)' },
    store_id: { type: 'integer', references: 'mod_shopping.stores(id)' },
    r2_key: { type: 'varchar(500)' }, // R2 file path for receipt image
    total_cents: { type: 'integer' },
    item_count: { type: 'integer' },
    created_at: { type: 'timestamp', notNull: true, default: pgm.func('now()') },
  });
};

exports.down = (pgm) => {
  pgm.dropSchema('mod_shopping', { ifExists: true, cascade: true });
};