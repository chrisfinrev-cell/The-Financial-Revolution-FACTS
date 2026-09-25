/**
 * FACTS Service Worker
 * Provides offline support, caching, and push notifications
 */

const CACHE_VERSION = 'v8';
const APP_SHELL_CACHE = `facts-shell-${CACHE_VERSION}`;
const DYNAMIC_CACHE = `facts-dynamic-${CACHE_VERSION}`;
const OFFLINE_URL = '/offline.html';

// App shell — core files to pre-cache on install
// Icons are NOT pre-cached here to avoid stale icon poisoning.
// They're served network-first so Chrome always gets the latest.
const APP_SHELL_URLS = [
  '/offline.html'
];

// ── Install: pre-cache the app shell ─────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(APP_SHELL_CACHE).then((cache) => {
      console.log('[SW] Pre-caching app shell');
      // Use individual adds so one failure doesn't block all
      return Promise.allSettled(
        APP_SHELL_URLS.map(url => cache.add(url).catch(err => {
          console.warn('[SW] Failed to pre-cache:', url, err.message);
        }))
      );
    }).then(() => self.skipWaiting())
  );
});

// ── Activate: clean up old caches + enable navigation preload ────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      // Purge stale caches from older versions
      caches.keys().then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter(name => name.startsWith('facts-') && name !== APP_SHELL_CACHE && name !== DYNAMIC_CACHE)
            .map(name => {
              console.log('[SW] Deleting old cache:', name);
              return caches.delete(name);
            })
        );
      }),
      // Enable navigation preload where supported — lets the browser start the
      // network request while the SW boots, eliminating the cold-start race that
      // causes false-offline on PWA shortcut launches.
      self.registration.navigationPreload && self.registration.navigationPreload.enable()
    ]).then(() => self.clients.claim())
  );
});

// ── Fetch: caching strategy ───────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests and browser extensions
  if (request.method !== 'GET') return;
  if (!url.origin.startsWith('http')) return;

  // API calls: network-first, no offline fallback (return error)
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(request).catch(() => {
        return new Response(
          JSON.stringify({ error: 'You are offline', offline: true }),
          { status: 503, headers: { 'Content-Type': 'application/json' } }
        );
      })
    );
    return;
  }

  // External resources (fonts, CDNs): stale-while-revalidate
  if (url.origin !== self.location.origin) {
    event.respondWith(
      caches.open(DYNAMIC_CACHE).then(async (cache) => {
        const cached = await cache.match(request);
        const fetchPromise = fetch(request).then((response) => {
          if (response.ok) cache.put(request, response.clone());
          return response;
        }).catch(() => cached);
        return cached || fetchPromise;
      })
    );
    return;
  }

  // Navigation requests (HTML pages): network-first with retry for PWA cold-start race.
  // When launching from a home screen shortcut, browsers briefly report offline before the
  // network stack initialises. Navigation preload (where supported) fires the network
  // request while the SW boots, sidestepping the race entirely. A single retry with delay
  // covers browsers that don't support preload.
  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      // Prefer navigation preload response (already in-flight before SW woke up)
      try {
        const preloaded = event.preloadResponse && await event.preloadResponse;
        if (preloaded) return preloaded;
      } catch (_) { /* preload not available or failed — fall through */ }

      try {
        return await fetch(request);
      } catch (_) {
        // First fetch failed — wait 1.5s and retry once before showing offline page.
        await new Promise(r => setTimeout(r, 1500));
        try {
          return await fetch(request);
        } catch (_) {
          const offline = await caches.match(OFFLINE_URL);
          return offline || new Response('<h1>Offline</h1>', {
            headers: { 'Content-Type': 'text/html' }
          });
        }
      }
    })());
    return;
  }

  // PWA icons: network-first to prevent stale icon poisoning
  // (stale cached icons with wrong dimensions block Chrome's beforeinstallprompt)
  if (url.pathname.startsWith('/icons/')) {
    event.respondWith(
      fetch(request).then(response => {
        if (response.ok) {
          caches.open(APP_SHELL_CACHE).then(cache => cache.put(request, response.clone()));
        }
        return response;
      }).catch(() => caches.match(request))
    );
    return;
  }

  // Other static assets (images, fonts): cache-first
  if (url.pathname.match(/\.(png|jpg|jpeg|svg|gif|webp|woff2?)$/)) {
    event.respondWith(
      caches.match(request).then(cached => {
        if (cached) return cached;
        return fetch(request).then(response => {
          if (response.ok) {
            caches.open(APP_SHELL_CACHE).then(cache => cache.put(request, response.clone()));
          }
          return response;
        });
      })
    );
    return;
  }

  // Everything else: network-first
  event.respondWith(
    fetch(request).catch(() => caches.match(request))
  );
});

// ── Push Notifications ────────────────────────────────────────────────────────
self.addEventListener('push', (event) => {
  let data = {
    title: 'FACTS',
    body: 'You have a new notification',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    tag: 'facts-notification',
    url: '/app'
  };

  try {
    if (event.data) {
      const payload = event.data.json();
      data = { ...data, ...payload };
    }
  } catch (e) {
    if (event.data) data.body = event.data.text();
  }

  const options = {
    body: data.body,
    icon: data.icon || '/icons/icon-192.png',
    badge: data.badge || '/icons/icon-192.png',
    tag: data.tag || 'facts-notification',
    data: { url: data.url || '/app' },
    requireInteraction: false,
    actions: data.actions || [],
    vibrate: [100, 50, 100]
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

// ── Notification Click ────────────────────────────────────────────────────────
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const targetUrl = (event.notification.data && event.notification.data.url) || '/app';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      // Focus existing window if open
      for (const client of windowClients) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.navigate(targetUrl);
          return client.focus();
        }
      }
      // Open new window
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});

// ── Push Subscription Change ──────────────────────────────────────────────────
self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(
    self.registration.pushManager.subscribe({
      userVisibleOnly: true
    }).then((subscription) => {
      return fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscription }),
        credentials: 'same-origin'
      });
    })
  );
});

// ── Message handler ───────────────────────────────────────────────────────────
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
