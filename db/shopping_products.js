'use strict';
// Shopping product catalog + price DB queries
// Owns: product CRUD, price CRUD, community price lookups

const { query } = require('./index');

async function searchProducts(q, limit = 20) {
  const r = await query(
    `SELECT id, name, upc, category, created_at,
            COALESCE((SELECT PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY price)
                      FROM mod_shopping.prices WHERE product_id = p.id), 0)::DECIMAL(8,2) as community_avg_price
     FROM mod_shopping.products p
     WHERE LOWER(name) LIKE LOWER($1)
     ORDER BY name
     LIMIT $2`,
    [`%${q}%`, limit]
  );
  return r.rows;
}

async function getProductById(id) {
  const r = await query(`SELECT * FROM mod_shopping.products WHERE id = $1`, [id]);
  return r.rows[0] || null;
}

async function upsertProduct(data) {
  const { id, name, upc, category } = data;
  const r = await query(
    `INSERT INTO mod_shopping.products(id, name, upc, category, created_at)
     VALUES ($1, $2, $3, $4, NOW())
     ON CONFLICT (id) DO UPDATE SET name=COALESCE($2, name), upc=COALESCE($3, upc), category=COALESCE($4, category)
     RETURNING *`,
    [id, name, upc, category]
  );
  return r.rows[0];
}

async function getPricesForProduct(productId, storeId = null) {
  if (storeId) {
    const r = await query(
      `SELECT p.*, s.name as store_name, s.lat, s.lng
       FROM mod_shopping.prices p
       JOIN mod_shopping.stores s ON s.id = p.store_id
       WHERE p.product_id = $1 AND p.store_id = $2
       ORDER BY p.created_at DESC`,
      [productId, storeId]
    );
    return r.rows;
  }
  const r = await query(
    `SELECT p.*, s.name as store_name, s.lat, s.lng
     FROM mod_shopping.prices p
     JOIN mod_shopping.stores s ON s.id = p.store_id
     WHERE p.product_id = $1
     ORDER BY p.created_at DESC`,
    [productId]
  );
  return r.rows;
}

async function getCommunityPrices(productId, lat, lng, radius = 5) {
  const r = await query(
    `SELECT p.id, p.price, p.unit, p.upc, p.created_at,
            s.id as store_id, s.name as store_name, s.category, s.lat, s.lng,
            p.per_store_avg
     FROM mod_shopping.prices p
     JOIN mod_shopping.stores s ON s.id = p.store_id
     LEFT JOIN LATERAL (
       SELECT PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY price)::DECIMAL(8,2) as per_store_avg
       FROM mod_shopping.prices WHERE product_id = $1 AND store_id = p.store_id
     ) sub ON true
     WHERE p.product_id = $1
     ORDER BY p.created_at DESC`,
    [productId]
  );

  const { calcDistance } = require('./shopping_stores');
  let rows = r.rows.map(row => ({
    ...row,
    distance: calcDistance(lat, lng, parseFloat(row.lat), parseFloat(row.lng)),
  }));
  rows = rows.filter(r => r.distance <= radius);

  // neighborhood average
  const prices = rows.map(r => parseFloat(r.price)).filter(p => p > 0);
  const avg = prices.length ? (prices.reduce((a, b) => a + b, 0) / prices.length) : null;

  return { prices: rows, neighborhood_avg: avg };
}

async function insertPrice(data) {
  const { store_id, product_id, user_id, session_key, price, unit, upc, contribution_type, purchased_at } = data;
  const r = await query(
    `INSERT INTO mod_shopping.prices(store_id, product_id, user_id, session_key, price, unit, upc, contribution_type, purchased_at, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW())
     RETURNING *`,
    [store_id, product_id, user_id, session_key, price, unit || null, upc || null, contribution_type || 'manual', purchased_at || null]
  );
  return r.rows[0];
}

async function getAllProductPrices(productId) {
  const r = await query(
    `SELECT price, store_id, created_at FROM mod_shopping.prices WHERE product_id = $1 ORDER BY created_at DESC`,
    [productId]
  );
  return r.rows;
}

module.exports = { searchProducts, getProductById, upsertProduct, getPricesForProduct, getCommunityPrices, insertPrice, getAllProductPrices };