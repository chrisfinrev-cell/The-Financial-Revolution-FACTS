'use strict';
// Shopping store queries
// Owns: store CRUD, geo-radius lookup, price stats
// Does NOT own: price_submissions (legacy), receipt scans

const { query } = require('./index');

const CATEGORY_MAP = {
  gas_station: 'gas_station',
  convenience: 'convenience',
  local: 'local',
  grocery: 'grocery',
  bigbox: 'bigbox',
  warehouse: 'warehouse',
};

function calcDistance(lat1, lng1, lat2, lng2) {
  const R = 3959;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function getStoresNearby(lat, lng, radius = 5, category = null) {
  const stores = await query(
    `SELECT id, name, address, lat, lng, category, chain, price_count, avg_price_cents
     FROM mod_shopping.stores ORDER BY id LIMIT 20`
  );

  if (!stores.rows.length) return [];

  let result = stores.rows.map(s => ({
    id: s.id,
    name: s.name,
    address: s.address || '',
    lat: s.lat,
    lng: s.lng,
    category: s.category || 'grocery',
    chain: s.chain || '',
    price_count: s.price_count || 0,
    avg_price_cents: s.avg_price_cents || null,
    distance: calcDistance(lat, lng, parseFloat(s.lat), parseFloat(s.lng)),
  }));

  result = result.filter(s => s.distance <= radius);
  if (category) result = result.filter(s => s.category === category);
  result.sort((a, b) => a.distance - b.distance);
  return result;
}

async function getStoreById(id) {
  const r = await query(
    `SELECT id, name, address, lat, lng, category, chain, price_count, avg_price_cents
     FROM mod_shopping.stores WHERE id = $1`, [id]
  );
  return r.rows[0] || null;
}

async function upsertStore(data) {
  const { id, name, address, lat, lng, category, chain } = data;
  const r = await query(
    `INSERT INTO mod_shopping.stores(id, name, address, lat, lng, category, chain, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,NOW())
     ON CONFLICT (id) DO UPDATE SET name=$2, address=$3, lat=$4, lng=$5, category=$6, chain=$7
     RETURNING *`,
    [id, name, address, lat, lng, category, chain]
  );
  return r.rows[0];
}

module.exports = { getStoresNearby, getStoreById, upsertStore, calcDistance, CATEGORY_MAP };