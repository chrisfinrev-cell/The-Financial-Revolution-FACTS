/**
 * Financial Revolution — Analytics Tracker
 *
 * Lightweight client-side event tracker. Queues events and flushes in batches
 * to /api/mod_analytics/events (authenticated) or /api/mod_analytics/events/public.
 *
 * Usage:
 *   window.FACTS.track('feature_usage', { feature: 'allocations', action: 'created' });
 *   window.FACTS.track('page_view', { page: 'dashboard' });
 *
 * Auto-tracked:
 *   - Page views on load
 *   - Session heartbeat every 60s
 */

(function () {
  'use strict';

  // ── Config ────────────────────────────────────────────────────────────────
  var BATCH_SIZE     = 20;
  var FLUSH_INTERVAL = 5000;   // ms — flush queue every 5s
  var HEARTBEAT_MS   = 60000;  // ms — session heartbeat every 60s

  // ── State ──────────────────────────────────────────────────────────────────
  var _queue    = [];
  var _isAuthed = false; // set by checkAuthState()
  var _sessionStart = Date.now();

  // ── Auth detection ─────────────────────────────────────────────────────────
  function checkAuthState() {
    // Presence of a user-specific element indicates logged-in state.
    // Falls back to a cookie hint (/api call) for pre-render detection.
    _isAuthed = (
      document.querySelector('[data-user-id]') !== null ||
      document.cookie.indexOf('connect.sid') !== -1
    );
  }

  // ── Queue a single event ──────────────────────────────────────────────────
  function track(eventType, metadata) {
    if (!eventType || typeof eventType !== 'string') return;
    _queue.push({
      event_type: eventType,
      metadata: metadata || {},
      timestamp: new Date().toISOString()
    });
    if (_queue.length >= BATCH_SIZE) {
      flush();
    }
  }

  // ── Flush queue to server ─────────────────────────────────────────────────
  function flush() {
    if (_queue.length === 0) return;

    var events = _queue.splice(0, BATCH_SIZE);
    var endpoint = _isAuthed
      ? '/api/mod_analytics/events'
      : '/api/mod_analytics/events/public';

    // Use sendBeacon for page-unload flushes (if available); else fetch
    if (typeof navigator.sendBeacon === 'function' && !document.hasFocus()) {
      navigator.sendBeacon(
        endpoint,
        new Blob([JSON.stringify({ events: events })], { type: 'application/json' })
      );
    } else {
      fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ events: events }),
        credentials: 'include'
      }).catch(function () {
        // Silent — don't let analytics break the app
      });
    }
  }

  // ── Page view tracking ────────────────────────────────────────────────────
  function trackPageView() {
    var page = window.location.pathname.replace(/\.html$/, '') || '/';
    track('page_view', {
      page: page,
      referrer: document.referrer || null,
      title: document.title || null
    });
  }

  // ── Session heartbeat ─────────────────────────────────────────────────────
  function startHeartbeat() {
    setInterval(function () {
      var sessionAge = Math.round((Date.now() - _sessionStart) / 1000);
      track('session_heartbeat', { session_age_seconds: sessionAge });
    }, HEARTBEAT_MS);
  }

  // ── Periodic flush ────────────────────────────────────────────────────────
  function startAutoFlush() {
    setInterval(flush, FLUSH_INTERVAL);
  }

  // ── Flush on page hide / unload ───────────────────────────────────────────
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') flush();
  });
  window.addEventListener('pagehide', flush);

  // ── Expose public API ─────────────────────────────────────────────────────
  window.FACTS = window.FACTS || {};
  window.FACTS.track = track;
  window.FACTS.flush = flush;

  // ── Init on DOM ready ─────────────────────────────────────────────────────
  function init() {
    checkAuthState();
    trackPageView();
    startHeartbeat();
    startAutoFlush();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

}());
