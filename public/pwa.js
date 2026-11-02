// Proprietary – Financial Revolution – All Rights Reserved
/**
 * FACTS PWA — Install prompt, push notification opt-in
 * Include this script on every page that should support PWA install.
 */
(function () {
  'use strict';

  // ── Helpers ─────────────────────────────────────────────────────────────────
  var BANNER_DISMISSED_KEY = 'facts_install_banner_dismissed';
  var BANNER_DISMISSED_AT_KEY = 'facts_install_banner_dismissed_at';
  var PUSH_OPTED_KEY = 'facts_push_opted';
  var BANNER_DELAY_MS = 3000; // show banner after 3s on page
  var BANNER_RE_SHOW_DAYS = 14; // re-show after 14 days if dismissed

  function isIOS() {
    return /iphone|ipad|ipod/i.test(navigator.userAgent) ||
           (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  }

  function isInStandaloneMode() {
    return (window.matchMedia('(display-mode: standalone)').matches) ||
           (window.navigator.standalone === true) ||
           document.referrer.includes('android-app://');
  }

  function isAndroid() {
    return /android/i.test(navigator.userAgent);
  }

  function isMobile() {
    return isIOS() || isAndroid() || /mobile/i.test(navigator.userAgent);
  }

  function isChromium() {
    return /chrome|chromium|crios|edg/i.test(navigator.userAgent) &&
           !/opr|opera/i.test(navigator.userAgent);
  }

  function shouldShowBanner() {
    if (isInStandaloneMode()) return false; // already installed
    var dismissed = localStorage.getItem(BANNER_DISMISSED_KEY);
    if (!dismissed) return true;
    // Re-show after BANNER_RE_SHOW_DAYS
    var dismissedAt = parseInt(localStorage.getItem(BANNER_DISMISSED_AT_KEY) || '0');
    var daysSince = (Date.now() - dismissedAt) / (1000 * 60 * 60 * 24);
    return daysSince >= BANNER_RE_SHOW_DAYS;
  }

  function dismissBanner() {
    localStorage.setItem(BANNER_DISMISSED_KEY, '1');
    localStorage.setItem(BANNER_DISMISSED_AT_KEY, Date.now().toString());
  }

  // ── CSS Injection ────────────────────────────────────────────────────────────
  function injectStyles() {
    if (document.getElementById('pwa-styles')) return;
    var style = document.createElement('style');
    style.id = 'pwa-styles';
    style.textContent = [
      /* Install Banner */
      '#pwa-install-banner {',
      '  position: fixed; bottom: 0; left: 0; right: 0; z-index: 99999;',
      '  background: #111827; border-top: 1px solid rgba(245,158,11,0.25);',
      '  padding: 16px 20px; display: flex; align-items: center; gap: 14px;',
      '  box-shadow: 0 -8px 32px rgba(0,0,0,0.5);',
      '  animation: pwa-slide-up 0.35s cubic-bezier(0.34,1.56,0.64,1);',
      '  font-family: -apple-system,"DM Sans","Segoe UI",system-ui,sans-serif;',
      '}',
      '#pwa-install-banner.pwa-hiding {',
      '  animation: pwa-slide-down 0.25s ease forwards;',
      '}',
      '@keyframes pwa-slide-up {',
      '  from { transform: translateY(100%); opacity: 0; }',
      '  to   { transform: translateY(0);    opacity: 1; }',
      '}',
      '@keyframes pwa-slide-down {',
      '  from { transform: translateY(0);    opacity: 1; }',
      '  to   { transform: translateY(100%); opacity: 0; }',
      '}',
      '#pwa-install-banner .pwa-icon {',
      '  width: 44px; height: 44px; border-radius: 10px;',
      '  object-fit: contain; flex-shrink: 0;',
      '  background: #1a2332; border: 1px solid rgba(245,158,11,0.15);',
      '}',
      '#pwa-install-banner .pwa-icon-fallback {',
      '  width: 44px; height: 44px; border-radius: 10px; flex-shrink: 0;',
      '  background: #0a0f1a; border: 1px solid rgba(16,185,129,0.3);',
      '  display: flex; align-items: center; justify-content: center;',
      '  font-size: 1.1rem; font-weight: 800; color: #10b981;',
      '  font-family: "Space Grotesk","DM Sans",sans-serif;',
      '}',
      '#pwa-install-banner .pwa-text { flex: 1; min-width: 0; }',
      '#pwa-install-banner .pwa-text strong {',
      '  display: block; font-size: 0.9rem; font-weight: 700;',
      '  color: #f1f5f9; line-height: 1.3;',
      '}',
      '#pwa-install-banner .pwa-text span {',
      '  font-size: 0.78rem; color: #94a3b8; line-height: 1.4;',
      '}',
      '#pwa-install-banner .pwa-actions { display: flex; gap: 8px; flex-shrink: 0; }',
      '#pwa-install-btn {',
      '  background: #10b981; color: #000; border: none; cursor: pointer;',
      '  padding: 9px 18px; border-radius: 8px; font-size: 0.85rem;',
      '  font-weight: 700; white-space: nowrap;',
      '  font-family: inherit; transition: all 0.15s ease;',
      '}',
      '#pwa-install-btn:hover { background: #0ea271; transform: translateY(-1px); }',
      '#pwa-dismiss-btn {',
      '  background: rgba(255,255,255,0.06); color: #64748b;',
      '  border: 1px solid rgba(255,255,255,0.1); cursor: pointer;',
      '  padding: 9px 12px; border-radius: 8px; font-size: 0.85rem;',
      '  font-family: inherit; transition: all 0.15s ease; white-space: nowrap;',
      '}',
      '#pwa-dismiss-btn:hover { background: rgba(255,255,255,0.1); color: #94a3b8; }',
      /* Dashboard / onboarding install CTA */
      '.install-btn, #installAppBtn {',
      '  display: none; align-items: center; gap: 6px;',
      '  background: rgba(16,185,129,0.14); border: 1px solid rgba(16,185,129,0.35);',
      '  color: #10b981; cursor: pointer; padding: 8px 14px; border-radius: 999px;',
      '  font-size: 0.82rem; font-weight: 700; font-family: inherit;',
      '  transition: background 0.15s ease, transform 0.15s ease, border-color 0.15s ease;',
      '  white-space: nowrap;',
      '}',
      '.install-btn:hover, #installAppBtn:hover {',
      '  background: rgba(16,185,129,0.22); border-color: rgba(16,185,129,0.5);',
      '  transform: translateY(-1px);',
      '}',
      /* iOS Guide Overlay */
      '#pwa-ios-guide {',
      '  position: fixed; inset: 0; z-index: 100000;',
      '  background: rgba(0,0,0,0.85); backdrop-filter: blur(8px);',
      '  display: flex; align-items: flex-end; justify-content: center;',
      '  padding: 24px 16px 0; animation: pwa-fade-in 0.2s ease;',
      '}',
      '@keyframes pwa-fade-in { from { opacity:0; } to { opacity:1; } }',
      '#pwa-ios-guide .pwa-ios-card {',
      '  background: #1a2332; border-radius: 20px 20px 0 0;',
      '  padding: 28px 24px 40px; max-width: 400px; width: 100%;',
      '  border: 1px solid rgba(245,158,11,0.2); border-bottom: none;',
      '  text-align: center;',
      '  font-family: -apple-system,"DM Sans","Segoe UI",system-ui,sans-serif;',
      '}',
      '#pwa-ios-guide h3 {',
      '  font-size: 1.2rem; font-weight: 700; color: #f1f5f9;',
      '  margin-bottom: 8px;',
      '}',
      '#pwa-ios-guide p {',
      '  font-size: 0.88rem; color: #94a3b8; line-height: 1.5;',
      '  margin-bottom: 24px;',
      '}',
      '#pwa-ios-guide .pwa-ios-steps {',
      '  list-style: none; text-align: left; margin-bottom: 24px;',
      '}',
      '#pwa-ios-guide .pwa-ios-steps li {',
      '  display: flex; align-items: center; gap: 12px;',
      '  padding: 10px 12px; border-radius: 10px;',
      '  background: rgba(255,255,255,0.04);',
      '  font-size: 0.88rem; color: #f1f5f9; margin-bottom: 8px;',
      '}',
      '#pwa-ios-guide .pwa-ios-steps li .step-num {',
      '  width: 24px; height: 24px; border-radius: 50%;',
      '  background: #10b981; color: #000; font-weight: 700;',
      '  font-size: 0.75rem; display: flex; align-items: center;',
      '  justify-content: center; flex-shrink: 0;',
      '}',
      '#pwa-ios-guide .pwa-ios-steps li .step-icon {',
      '  font-size: 1.2rem; flex-shrink: 0;',
      '}',
      '#pwa-close-ios {',
      '  background: rgba(255,255,255,0.08); color: #94a3b8;',
      '  border: 1px solid rgba(255,255,255,0.1); cursor: pointer;',
      '  padding: 11px 28px; border-radius: 10px; font-size: 0.9rem;',
      '  font-family: inherit; font-weight: 500; width: 100%;',
      '}',
      '#pwa-close-ios:hover { background: rgba(255,255,255,0.12); }',
      /* Arrow pointing down for iOS guide */
      '#pwa-ios-guide .pwa-arrow {',
      '  font-size: 2rem; margin-bottom: 12px; animation: pwa-bounce 1s ease-in-out infinite;',
      '}',
      '@keyframes pwa-bounce {',
      '  0%,100% { transform: translateY(0); }',
      '  50% { transform: translateY(6px); }',
      '}',
      /* Dynamic 1-click install card (desktop / Android — no manual 3-step list) */
      '#pwa-install-card {',
      '  position: fixed; inset: 0; z-index: 100000;',
      '  background: rgba(0,0,0,0.85); backdrop-filter: blur(8px);',
      '  display: flex; align-items: center; justify-content: center;',
      '  padding: 24px; animation: pwa-fade-in 0.2s ease;',
      '}',
      '#pwa-install-card .pwa-install-card-inner {',
      '  background: #1a2332; border-radius: 16px;',
      '  padding: 28px 24px 24px; max-width: 400px; width: 100%;',
      '  border: 1px solid rgba(16,185,129,0.28);',
      '  text-align: center;',
      '  font-family: -apple-system,"DM Sans","Segoe UI",system-ui,sans-serif;',
      '}',
      '#pwa-install-card h3 {',
      '  font-size: 1.2rem; font-weight: 700; color: #f1f5f9;',
      '  margin: 0 0 8px;',
      '}',
      '#pwa-install-card p {',
      '  font-size: 0.88rem; color: #94a3b8; line-height: 1.5;',
      '  margin: 0 0 20px;',
      '}',
      '#pwa-install-card-cta {',
      '  background: #10b981; color: #000; border: none; cursor: pointer;',
      '  padding: 12px 20px; border-radius: 10px; font-size: 0.95rem;',
      '  font-family: inherit; font-weight: 700; width: 100%;',
      '  transition: background 0.15s ease, transform 0.15s ease;',
      '}',
      '#pwa-install-card-cta:hover { background: #0ea271; transform: translateY(-1px); }',
      '#pwa-install-card-cta:disabled { opacity: 0.55; cursor: not-allowed; transform: none; }',
      '#pwa-install-card-dismiss {',
      '  margin-top: 10px; background: transparent; color: #64748b;',
      '  border: none; cursor: pointer; padding: 10px; font-size: 0.85rem;',
      '  font-family: inherit; width: 100%;',
      '}',
      '#pwa-install-card-dismiss:hover { color: #94a3b8; }',
      /* Safe area spacing for bottom banner */
      '@supports (padding-bottom: env(safe-area-inset-bottom)) {',
      '  #pwa-install-banner { padding-bottom: calc(16px + env(safe-area-inset-bottom)); }',
      '  #pwa-ios-guide .pwa-ios-card { padding-bottom: calc(40px + env(safe-area-inset-bottom)); }',
      '}',
      /* Push notification opt-in button */
      '#pwa-push-btn {',
      '  display: inline-flex; align-items: center; gap: 8px;',
      '  background: rgba(245,158,11,0.1); color: #f59e0b;',
      '  border: 1px solid rgba(245,158,11,0.3); cursor: pointer;',
      '  padding: 8px 16px; border-radius: 8px; font-size: 0.85rem;',
      '  font-weight: 600; font-family: inherit; transition: all 0.15s ease;',
      '}',
      '#pwa-push-btn:hover { background: rgba(245,158,11,0.18); }',
      '#pwa-push-btn.enabled { color: #10b981; border-color: rgba(16,185,129,0.3); background: rgba(16,185,129,0.1); }',
    ].join('\n');
    document.head.appendChild(style);
  }

  // ── Service Worker Registration ───────────────────────────────────────────────
  function registerSW() {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).then(function (reg) {
      console.log('[PWA] Service worker registered:', reg.scope);

      // Check for updates
      reg.addEventListener('updatefound', function () {
        var newWorker = reg.installing;
        newWorker.addEventListener('statechange', function () {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            console.log('[PWA] New service worker available');
          }
        });
      });
    }).catch(function (err) {
      console.warn('[PWA] SW registration failed:', err.message);
    });
  }

  // ── Install State ──────────────────────────────────────────────────────────
  var deferredPrompt = null; // Android/Desktop install prompt
  var promptConsumed = false; // Track if we already tried prompt()

  // Show/hide custom install CTAs (#installAppBtn + legacy header ids)
  function updateInstallButtons(visible) {
    var ids = ['installAppBtn', 'pwa-header-install-btn', 'fn-pwa-install'];
    for (var i = 0; i < ids.length; i++) {
      var btn = document.getElementById(ids[i]);
      if (!btn || btn.hidden) continue;
      // inline-flex keeps pill CTAs aligned in nav; falls back to block if needed
      btn.style.display = visible ? 'inline-flex' : 'none';
      if (!btn.dataset.pwaBound) {
        btn.dataset.pwaBound = '1';
        btn.addEventListener('click', function (e) {
          e.preventDefault();
          triggerInstall();
        });
      }
    }
  }

  // ── Install Banner ───────────────────────────────────────────────────────────
  function buildBanner() {
    var banner = document.createElement('div');
    banner.id = 'pwa-install-banner';
    banner.setAttribute('role', 'banner');
    banner.setAttribute('aria-label', 'Install FACTS app');

    // Icon
    var iconImg = document.createElement('img');
    iconImg.src = '/icons/icon-192.png';
    iconImg.alt = 'FACTS';
    iconImg.className = 'pwa-icon';
    iconImg.onerror = function () {
      var fallback = document.createElement('div');
      fallback.className = 'pwa-icon-fallback';
      fallback.textContent = 'F';
      banner.replaceChild(fallback, iconImg);
    };

    // Text
    var text = document.createElement('div');
    text.className = 'pwa-text';
    text.innerHTML = '<strong>Install FACTS</strong><span>Add to home screen for the full app experience</span>';

    // Actions
    var actions = document.createElement('div');
    actions.className = 'pwa-actions';

    var installBtn = document.createElement('button');
    installBtn.id = 'pwa-install-btn';
    installBtn.textContent = 'Install';
    installBtn.addEventListener('click', function () { triggerInstall(); });

    var dismissBtn = document.createElement('button');
    dismissBtn.id = 'pwa-dismiss-btn';
    dismissBtn.setAttribute('aria-label', 'Dismiss install banner');
    dismissBtn.textContent = '\u2715';
    dismissBtn.addEventListener('click', function () { hideBanner(true); });

    actions.appendChild(installBtn);
    actions.appendChild(dismissBtn);

    banner.appendChild(iconImg);
    banner.appendChild(text);
    banner.appendChild(actions);
    return banner;
  }

  function showBanner() {
    if (document.getElementById('pwa-install-banner')) return;
    var banner = buildBanner();
    document.body.appendChild(banner);
  }

  function hideBanner(dismiss) {
    var banner = document.getElementById('pwa-install-banner');
    if (!banner) return;
    banner.classList.add('pwa-hiding');
    setTimeout(function () { if (banner.parentNode) banner.parentNode.removeChild(banner); }, 300);
    if (dismiss) dismissBanner();
  }

  // ── Install Trigger ────────────────────────────────────────────────────────
  function runNativePrompt() {
    if (!deferredPrompt || promptConsumed) return false;
    promptConsumed = true;
    var promptEvent = deferredPrompt;
    try {
      promptEvent.prompt();
      promptEvent.userChoice.then(function (result) {
        console.log('User response to the install prompt: ' + result.outcome);
        deferredPrompt = null;
        hideInstallCard();
        updateInstallButtons(false);
        if (result.outcome === 'accepted') {
          hideBanner(true);
          showToast('FACTS installed! Check your apps.');
        } else {
          showToast('You can install later anytime.');
        }
      }).catch(function (err) {
        console.warn('[PWA] userChoice error:', err);
        deferredPrompt = null;
        promptConsumed = false;
        updateInstallButtons(true);
        showToast('Install prompt unavailable right now. Try again in a moment.');
      });
      return true;
    } catch (err) {
      console.warn('[PWA] prompt() error:', err);
      deferredPrompt = null;
      promptConsumed = false;
      return false;
    }
  }

  function triggerInstall() {
    console.log('[PWA] triggerInstall called. iOS:', isIOS(), 'deferredPrompt:', !!deferredPrompt, 'consumed:', promptConsumed);

    // iOS Safari has no beforeinstallprompt — short 2-step Add to Home Screen card only
    if (isIOS()) {
      showIOSGuide();
      hideBanner(false);
      return;
    }

    // Chrome / Edge / Brave / Android Chromium: 1-click native prompt — never show manual steps
    if (runNativePrompt()) {
      hideBanner(false);
      return;
    }

    // Prompt not ready yet — show clean install card with a single primary CTA (no 3-step list)
    showInstallCard();
    hideBanner(false);
  }

  // ── iOS Install Guide (2 steps only) ────────────────────────────────────────
  function showIOSGuide() {
    if (document.getElementById('pwa-ios-guide')) return;

    var overlay = document.createElement('div');
    overlay.id = 'pwa-ios-guide';
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) hideIOSGuide();
    });

    var card = document.createElement('div');
    card.className = 'pwa-ios-card';

    card.innerHTML = [
      '<div class="pwa-arrow">\u2B07</div>',
      '<h3>Add FACTS to Home Screen</h3>',
      '<p>Safari doesn\u2019t support 1-click install. Use these two steps:</p>',
      '<ol class="pwa-ios-steps">',
      '  <li>',
      '    <span class="step-num">1</span>',
      '    <span class="step-icon">\u2B06</span>',
      '    <span>Tap the <strong>Share</strong> button</span>',
      '  </li>',
      '  <li>',
      '    <span class="step-num">2</span>',
      '    <span class="step-icon">\u2795</span>',
      '    <span>Tap <strong>"Add to Home Screen"</strong></span>',
      '  </li>',
      '</ol>',
      '<button id="pwa-close-ios" type="button">Got it</button>',
    ].join('');

    overlay.appendChild(card);
    document.body.appendChild(overlay);

    card.querySelector('#pwa-close-ios').addEventListener('click', hideIOSGuide);
  }

  function hideIOSGuide() {
    var overlay = document.getElementById('pwa-ios-guide');
    if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
  }

  // ── Clean install card (desktop/Android) — single CTA, no manual browser steps ─
  function showInstallCard() {
    if (document.getElementById('pwa-install-card')) return;
    // Remove any leftover legacy overlays if still in the DOM
    ['pwa-desktop-guide', 'pwa-android-guide'].forEach(function (id) {
      var legacy = document.getElementById(id);
      if (legacy && legacy.parentNode) legacy.parentNode.removeChild(legacy);
    });

    var overlay = document.createElement('div');
    overlay.id = 'pwa-install-card';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-label', 'Install FACTS App');
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) hideInstallCard();
    });

    var card = document.createElement('div');
    card.className = 'pwa-install-card-inner';
    card.innerHTML = [
      '<div style="font-size:2rem;margin-bottom:10px;">\uD83D\uDCF1</div>',
      '<h3>Install FACTS App</h3>',
      '<p>One tap installs FACTS to your device for faster access and a full-screen experience.</p>',
      '<button id="pwa-install-card-cta" type="button">Install FACTS App Now</button>',
      '<button id="pwa-install-card-dismiss" type="button">Not now</button>',
    ].join('');

    overlay.appendChild(card);
    document.body.appendChild(overlay);

    card.querySelector('#pwa-install-card-dismiss').addEventListener('click', hideInstallCard);
    card.querySelector('#pwa-install-card-cta').addEventListener('click', function () {
      var cta = card.querySelector('#pwa-install-card-cta');
      if (deferredPrompt && !promptConsumed) {
        cta.disabled = true;
        cta.textContent = 'Opening installer\u2026';
        if (runNativePrompt()) return;
        cta.disabled = false;
        cta.textContent = 'Install FACTS App Now';
      }
      // Waiting for beforeinstallprompt — keep card open and tip the user
      showToast('Installer is preparing\u2026 tap again in a second.');
    });
  }

  function hideInstallCard() {
    var overlay = document.getElementById('pwa-install-card');
    if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
  }

  // Legacy aliases — never show old 3-step / three-dot menus again
  function showAndroidGuide() { showInstallCard(); }
  function showDesktopGuide() { showInstallCard(); }
  function hideDesktopGuide() { hideInstallCard(); }
  function hideAndroidGuide() { hideInstallCard(); }

  // ── Push Notifications ────────────────────────────────────────────────────────
  function isPushSupported() {
    return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  }

  function getPushPermission() {
    return Notification.permission;
  }

  async function subscribeToPush() {
    if (!isPushSupported()) return null;

    try {
      // Get VAPID public key from server
      var res = await fetch('/api/push/vapid-public-key');
      if (!res.ok) throw new Error('VAPID key not available');
      var data = await res.json();
      if (!data.publicKey) throw new Error('No VAPID public key');

      var reg = await navigator.serviceWorker.ready;
      var subscription = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(data.publicKey)
      });

      // Send subscription to server
      await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscription: subscription.toJSON() }),
        credentials: 'same-origin'
      });

      localStorage.setItem(PUSH_OPTED_KEY, 'subscribed');
      return subscription;
    } catch (err) {
      console.warn('[PWA] Push subscription failed:', err.message);
      return null;
    }
  }

  async function requestPushPermission() {
    if (!isPushSupported()) {
      alert('Push notifications are not supported on this device.');
      return;
    }

    var permission = await Notification.requestPermission();
    if (permission === 'granted') {
      var sub = await subscribeToPush();
      if (sub) {
        updatePushButton('subscribed');
        showToast('Notifications enabled!');
      }
    } else if (permission === 'denied') {
      showToast('Notifications blocked. Enable them in your browser settings.');
    }
  }

  async function unsubscribeFromPush() {
    try {
      var reg = await navigator.serviceWorker.ready;
      var sub = await reg.pushManager.getSubscription();
      if (sub) {
        await sub.unsubscribe();
        await fetch('/api/push/unsubscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: sub.endpoint }),
          credentials: 'same-origin'
        });
      }
      localStorage.setItem(PUSH_OPTED_KEY, 'unsubscribed');
      updatePushButton('unsubscribed');
      showToast('Notifications disabled');
    } catch (err) {
      console.warn('[PWA] Unsubscribe failed:', err.message);
    }
  }

  function updatePushButton(state) {
    var btn = document.getElementById('pwa-push-btn');
    if (!btn) return;
    if (state === 'subscribed') {
      btn.textContent = 'Notifications On';
      btn.classList.add('enabled');
      btn.onclick = function () { unsubscribeFromPush(); };
    } else {
      btn.textContent = 'Enable Notifications';
      btn.classList.remove('enabled');
      btn.onclick = function () { requestPushPermission(); };
    }
  }

  // ── Utility: Simple Toast ─────────────────────────────────────────────────────
  function showToast(message) {
    var existing = document.getElementById('pwa-toast');
    if (existing) existing.remove();
    var toast = document.createElement('div');
    toast.id = 'pwa-toast';
    toast.style.cssText = [
      'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);',
      'background:#1a2332;color:#f1f5f9;padding:10px 20px;border-radius:10px;',
      'font-size:0.875rem;font-weight:500;z-index:999999;',
      'border:1px solid rgba(255,255,255,0.1);',
      'box-shadow:0 4px 20px rgba(0,0,0,0.4);',
      'animation:pwa-fade-in 0.2s ease;white-space:nowrap;',
      'font-family:-apple-system,"DM Sans","Segoe UI",system-ui,sans-serif;',
    ].join('');
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(function () {
      toast.style.opacity = '0';
      toast.style.transition = 'opacity 0.3s ease';
      setTimeout(function () { if (toast.parentNode) toast.remove(); }, 300);
    }, 3000);
  }

  // ── VAPID key conversion ──────────────────────────────────────────────────────
  function urlBase64ToUint8Array(base64String) {
    var padding = '='.repeat((4 - base64String.length % 4) % 4);
    var base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    var rawData = window.atob(base64);
    var outputArray = new Uint8Array(rawData.length);
    for (var i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  }

  // ── PWA Install Diagnostic ───────────────────────────────────────────────────
  // Logs diagnostic info to console so install issues can be debugged.
  function logDiagnostic() {
    var info = {
      standalone: isInStandaloneMode(),
      iOS: isIOS(),
      android: isAndroid(),
      chromium: isChromium(),
      mobile: isMobile(),
      hasPrompt: !!deferredPrompt,
      promptConsumed: promptConsumed,
      swSupported: 'serviceWorker' in navigator,
      protocol: window.location.protocol,
      manifestLink: !!document.querySelector('link[rel="manifest"]'),
    };
    console.log('[PWA] Diagnostic:', JSON.stringify(info));

    // Verify icon accessibility AND dimensions
    // Chrome rejects icons where actual dimensions don't match manifest declarations
    var iconChecks = [
      { src: '/icons/icon-192.png', declaredSize: '192x192' },
      { src: '/icons/icon-512.png', declaredSize: '512x512' },
    ];
    iconChecks.forEach(function (check) {
      var img = new Image();
      img.onload = function () {
        var ok = img.naturalWidth >= parseInt(check.declaredSize) && img.naturalHeight >= parseInt(check.declaredSize);
        console.log('[PWA] Icon ' + check.src + ': ' + img.naturalWidth + 'x' + img.naturalHeight +
          ' (declared ' + check.declaredSize + ') ' + (ok ? '✓' : '✗ MISMATCH — this blocks beforeinstallprompt!'));
      };
      img.onerror = function () {
        console.warn('[PWA] Icon ' + check.src + ' FAILED to load — this blocks beforeinstallprompt!');
      };
      img.src = check.src + '?_t=' + Date.now();
    });

    // Also hit the server diagnostic endpoint
    fetch('/api/pwa/diagnostic').then(function(r) { return r.json(); }).then(function(d) {
      console.log('[PWA] Server diagnostic:', JSON.stringify(d));
    }).catch(function() {});
  }

  // ── Init ──────────────────────────────────────────────────────────────────────
  function init() {
    injectStyles();

    // Register service worker
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', registerSW);
    } else {
      registerSW();
    }

    // Log diagnostics after a short delay (after SW registers, before prompt fires)
    setTimeout(logDiagnostic, 2000);

    // Capture Android/Desktop install prompt (prevent Chrome mini-infobar; stash for custom CTA)
    window.addEventListener('beforeinstallprompt', function (e) {
      e.preventDefault();
      deferredPrompt = e;
      promptConsumed = false;
      console.log('[PWA] beforeinstallprompt fired — native install available');

      // Show custom install button (#installAppBtn)
      updateInstallButtons(true);

      // If the install card is already open, enable 1-click native install immediately
      var openCta = document.getElementById('pwa-install-card-cta');
      if (openCta) {
        openCta.disabled = false;
        openCta.textContent = 'Install FACTS App Now';
      }

      // On mobile: also show the bottom banner after delay
      // On desktop: header button is enough (no duplicate UI)
      if (isMobile() && shouldShowBanner()) {
        setTimeout(showBanner, BANNER_DELAY_MS);
      } else if (!isMobile() && shouldShowBanner()) {
        // On desktop, show banner only if there's no header button
        var headerBtn = document.getElementById('installAppBtn') || document.getElementById('pwa-header-install-btn');
        if (!headerBtn) {
          setTimeout(showBanner, BANNER_DELAY_MS);
        }
      }
    });

    // Always show install button when not in standalone mode.
    // On platforms without beforeinstallprompt (iOS, Firefox), the button
    // shows a manual guide. On Chrome/Edge, it shows the native prompt.
    if (!isInStandaloneMode()) {
      function showInstallBtnWhenReady() {
        updateInstallButtons(true);
      }
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', showInstallBtnWhenReady);
      } else {
        showInstallBtnWhenReady();
      }
    }

    // iOS: show install banner on main app pages (iOS never fires beforeinstallprompt)
    if (isIOS() && !isInStandaloneMode()) {
      updateInstallButtons(true);
      if (shouldShowBanner()) {
        var pathname = window.location.pathname.replace(/\.html$/, '');
        if (pathname === '/app' || pathname === '/' || pathname === '/index') {
          setTimeout(showBanner, BANNER_DELAY_MS + 1000);
        }
      }
    }

    // Non-Chromium mobile browsers (DuckDuckGo, Firefox Android, etc.) don't fire
    // beforeinstallprompt. The header install button is already visible for all
    // non-standalone browsers — no auto-popup needed. Auto-showing a fixed banner
    // breaks layout in DuckDuckGo Android (frozen top half, broken initial render).

    // Hide button if already installed / just installed
    window.addEventListener('appinstalled', function () {
      console.log('FACTS was successfully installed.');
      hideBanner(true);
      hideInstallCard();
      hideIOSGuide();
      updateInstallButtons(false);
      deferredPrompt = null;
      showToast('FACTS installed successfully!');
    });

    // Expose public API
    window.FACTS_PWA = {
      showInstallBanner: showBanner,
      hideInstallBanner: hideBanner,
      triggerInstall: triggerInstall,
      showIOSGuide: showIOSGuide,
      showDesktopGuide: showDesktopGuide,
      requestPushPermission: requestPushPermission,
      updatePushButton: updatePushButton,
      isInstalled: isInStandaloneMode,
      isIOS: isIOS,
      isInstallable: function () { return !!deferredPrompt && !promptConsumed; },
      diagnostic: logDiagnostic
    };
  }

  // Run after DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
