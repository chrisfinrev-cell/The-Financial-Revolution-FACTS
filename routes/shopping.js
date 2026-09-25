'use strict';
// routes/shopping.js — Shopping Calculator API routes
// Mounted at /api/mod_shopping via module-loader
// Owns: store discovery, product search, price DB, trip optimizer, sweep routing

const express = require('express');
const { getStoresNearby } = require('../db/shopping_stores');
const { searchProducts, getCommunityPrices, getAllProductPrices, insertPrice } = require('../db/shopping_products');
const asyncRoute = fn => (req, res, next) => { Promise.resolve(fn(req, res, next)).catch(next); };

const router = express.Router();

// ── Health ─────────────────────────────────────────────────────────────────
router.get('/health', asyncRoute(async (req, res) => {
  res.json({ status: 'ok', module: 'shopping_routes', ts: new Date().toISOString() });
}));

// ── GET /api/mod_shopping/stores/nearby ───────────────────────────────────
// Returns stores within radius, sorted by distance. Free tier: max 3 stores.
router.get('/stores/nearby', asyncRoute(async (req, res) => {
  const { lat, lng, radius = 5 } = req.query;
  if (!lat || !lng) return res.status(400).json({ error: 'lat and lng required' });

  const latN = parseFloat(lat), lngN = parseFloat(lng), radiusN = parseFloat(radius);
  const stores = await getStoresNearby(latN, lngN, radiusN);

  // Free tier: cap at 3 stores
  const user = await getUser(req);
  const freeTier = !isFactsUser(user);
  const result = freeTier ? stores.slice(0, 3) : stores;

  res.json({
    stores: result.map(s => ({
      id: s.id, name: s.name, category: s.category,
      address: s.address, distance: Math.round(s.distance * 10) / 10,
      price_count: s.price_count,
    })),
    count: result.length,
    capped: freeTier,
  });
}));

// ── GET /api/mod_shopping/products ────────────────────────────────────────
// Full-text product search with community average price
router.get('/products', asyncRoute(async (req, res) => {
  const { q, limit = 20 } = req.query;
  if (!q || q.length < 2) return res.json({ products: [] });

  const products = await searchProducts(q, Math.min(parseInt(limit) || 20, 50));
  res.json({ products });
}));

// ── GET /api/mod_shopping/prices/community ────────────────────────────────
// Community prices for a product within radius
router.get('/prices/community', asyncRoute(async (req, res) => {
  const { product_id, lat, lng, radius = 5 } = req.query;
  if (!product_id) return res.status(400).json({ error: 'product_id required' });
  if (!lat || !lng) return res.status(400).json({ error: 'lat and lng required' });

  const result = await getCommunityPrices(
    parseInt(product_id),
    parseFloat(lat),
    parseFloat(lng),
    parseFloat(radius)
  );

  res.json({
    prices: result.prices.map(p => ({
      store_id: p.store_id, store_name: p.store_name,
      category: p.category, distance: Math.round(p.distance * 10) / 10,
      price: parseFloat(p.price), unit: p.unit || '',
      upc: p.upc || '', created_at: p.created_at,
    })),
    neighborhood_avg: result.neighborhood_avg ? parseFloat(result.neighborhood_avg.toFixed(2)) : null,
  });
}));

// ── GET /api/mod_shopping/prices ─────────────────────────────────────────
// Price history for a product at a specific store (includes created_at)
router.get('/prices', asyncRoute(async (req, res) => {
  const { product_id, store_id } = req.query;
  if (!product_id) return res.status(400).json({ error: 'product_id required' });

  const prices = await getAllProductPrices(parseInt(product_id));
  res.json({ prices });
}));

// ── POST /api/mod_shopping/prices ─────────────────────────────────────────
// Contribute a price. created_at is set server-side, never null.
router.post('/prices', asyncRoute(async (req, res) => {
  const { user_id, session_key } = await authOrSession(req);
  const { store_id, product_id, price, unit, upc, contribution_type, purchased_at } = req.body;

  if (!price || !store_id) return res.status(400).json({ error: 'store_id and price required' });

  const entry = await insertPrice({
    store_id, product_id: product_id ? parseInt(product_id) : null,
    user_id, session_key,
    price: parseFloat(price),
    unit, upc,
    contribution_type: contribution_type || 'manual',
    purchased_at,
  });

  res.json({ price: entry, created_at: entry.created_at });
}));

// Export router and auth helpers so the module index can use them
module.exports = { router, helpers: { getUser, authOrSession, isFactsUser, bucketDisplayName } };