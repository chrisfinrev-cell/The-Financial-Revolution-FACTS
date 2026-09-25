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
      /* Desktop Install Guide Overlay */
      '#pwa-desktop-guide {',
      '  position: fixed; inset: 0; z-index: 100000;',
      '  background: rgba(0,0,0,0.85); backdrop-filter: blur(8px);',
      '  display: flex; align-items: center; justify-content: center;',
      '  padding: 24px; animation: pwa-fade-in 0.2s ease;',
      '}',
      '#pwa-desktop-guide .pwa-desktop-card {',
      '  background: #1a2332; border-radius: 16px;',
      '  padding: 28px 24px 24px; max-width: 420px; width: 100%;',
      '  border: 1px solid rgba(245,158,11,0.2);',
      '  text-align: center;',
      '  font-family: -apple-system,"DM Sans","Segoe UI",system-ui,sans-serif;',
      '}',
      '#pwa-desktop-guide h3 {',
      '  font-size: 1.2rem; font-weight: 700; color: #f1f5f9;',
      '  margin-bottom: 8px;',
      '}',
      '#pwa-desktop-guide p {',
      '  font-size: 0.88rem; color: #94a3b8; line-height: 1.5;',
      '  margin-bottom: 20px;',
      '}',
      '#pwa-desktop-guide .pwa-desktop-steps {',
      '  list-style: none; text-align: left; margin-bottom: 20px; padding: 0;',
      '}',
      '#pwa-desktop-guide .pwa-desktop-steps li {',
      '  display: flex; align-items: center; gap: 12px;',
      '  padding: 10px 12px; border-radius: 10px;',
      '  background: rgba(255,255,255,0.04);',
      '  font-size: 0.88rem; color: #f1f5f9; margin-bottom: 8px;',
      '}',
      '#pwa-desktop-guide .pwa-desktop-steps li .step-num {',
      '  width: 24px; height: 24px; border-radius: 50%;',
      '  background: #10b981; color: #000; font-weight: 700;',
      '  font-size: 0.75rem; display: flex; align-items: center;',
      '  justify-content: center; flex-shrink: 0;',
      '}',
      '#pwa-desktop-guide .pwa-desktop-steps li .step-icon {',
      '  font-size: 1.2rem; flex-shrink: 0;',
      '}',
      '#pwa-close-desktop {',
      '  background: rgba(255,255,255,0.08); color: #94a3b8;',
      '  border: 1px solid rgba(255,255,255,0.1); cursor: pointer;',
      '  padding: 11px 28px; border-radius: 10px; font-size: 0.9rem;',
      '  font-family: inherit; font-weight: 500; width: 100%;',
      '}',
      '#pwa-close-desktop:hover { background: rgba(255,255,255,0.12); }',
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

  // Update all install buttons across the page (header + banner)
  function updateInstallButtons(visible) {
    // Update header install button if it exists
    var headerBtn = document.getElementById('pwa-header-install-btn');
    if (headerBtn) {
      headerBtn.style.display = visible ? 'inline-flex' : 'none';
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
  function triggerInstall() {
    console.log('[PWA] triggerInstall called. iOS:', isIOS(), 'deferredPrompt:', !!deferredPrompt, 'consumed:', promptConsumed);

    // iOS: always show the manual guide
    if (isIOS()) {
      showIOSGuide();
      hideBanner(false);
      return;
    }

    // Android/Desktop: try the native prompt first
    if (deferredPrompt && !promptConsumed) {
      promptConsumed = true;
      try {
        deferredPrompt.prompt();
        deferredPrompt.userChoice.then(function (result) {
          console.log('[PWA] User choice:', result.outcome);
          if (result.outcome === 'accepted') {
            console.log('[PWA] User accepted install');
            hideBanner(true);
            updateInstallButtons(false);
            showToast('FACTS installed! Check your apps.');
          } else {
            console.log('[PWA] User dismissed install prompt');
            // Prompt was dismissed — show fallback instructions
            showToast('You can install later from the browser menu.');
          }
          deferredPrompt = null;
        }).catch(function (err) {
          console.warn('[PWA] userChoice error:', err);
          deferredPrompt = null;
          showDesktopGuide();
        });
      } catch (err) {
        console.warn('[PWA] prompt() error:', err);
        deferredPrompt = null;
        // Prompt failed — show manual instructions
        showDesktopGuide();
      }
      return;
    }

    // Fallback: prompt not available (already consumed, never fired, or unsupported browser)
    if (isAndroid()) {
      // Android without beforeinstallprompt — show visual guide
      showAndroidGuide();
    } else if (isChromium()) {
      // Desktop Chrome/Edge — show visual guide
      showDesktopGuide();
    } else {
      // Firefox, Safari desktop, etc.
      showDesktopGuide();
    }
    hideBanner(false);
  }

  // ── iOS Install Guide ─────────────────────────────────────────────────────────
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
      '<p>Install FACTS as an app for full-screen mode, faster access, and home screen icon.</p>',
      '<ol class="pwa-ios-steps">',
      '  <li>',
      '    <span class="step-num">1</span>',
      '    <span class="step-icon">\u2B06</span>',
      '    <span>Tap the <strong>Share</strong> button at the bottom of Safari</span>',
      '  </li>',
      '  <li>',
      '    <span class="step-num">2</span>',
      '    <span class="step-icon">\u2795</span>',
      '    <span>Scroll down and tap <strong>"Add to Home Screen"</strong></span>',
      '  </li>',
      '  <li>',
      '    <span class="step-num">3</span>',
      '    <span class="step-icon">\u2705</span>',
      '    <span>Tap <strong>"Add"</strong> in the top-right corner</span>',
      '  </li>',
      '</ol>',
      '<button id="pwa-close-ios">Got it</button>',
    ].join('');

    overlay.appendChild(card);
    document.body.appendChild(overlay);

    card.querySelector('#pwa-close-ios').addEventListener('click', hideIOSGuide);
  }

  function hideIOSGuide() {
    var overlay = document.getElementById('pwa-ios-guide');
    if (overlay) overlay.parentNode.removeChild(overlay);
  }

  // ── Android Install Guide (fallback when native prompt unavailable) ─────────
  function showAndroidGuide() {
    if (document.getElementById('pwa-android-guide')) return;

    var overlay = document.createElement('div');
    overlay.id = 'pwa-android-guide';
    overlay.style.cssText = [
      'position:fixed;inset:0;z-index:100000;',
      'background:rgba(0,0,0,0.85);backdrop-filter:blur(8px);',
      'display:flex;align-items:center;justify-content:center;',
      'padding:24px;animation:pwa-fade-in 0.2s ease;',
    ].join('');
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) hideAndroidGuide();
    });

    var card = document.createElement('div');
    card.style.cssText = [
      'background:#1a2332;border-radius:16px;',
      'padding:28px 24px 24px;max-width:400px;width:100%;',
      'border:1px solid rgba(245,158,11,0.2);text-align:center;',
      'font-family:-apple-system,"DM Sans","Segoe UI",system-ui,sans-serif;',
    ].join('');

    card.innerHTML = [
      '<h3 style="font-size:1.2rem;font-weight:700;color:#f1f5f9;margin:0 0 8px;">Install FACTS on Android</h3>',
      '<p style="font-size:0.88rem;color:#94a3b8;line-height:1.5;margin:0 0 20px;">Get a home screen icon, full-screen app experience, and offline access.</p>',
      '<ol style="list-style:none;text-align:left;margin:0 0 20px;padding:0;">',
      '  <li style="display:flex;align-items:center;gap:12px;padding:10px 12px;border-radius:10px;background:rgba(255,255,255,0.04);font-size:0.88rem;color:#f1f5f9;margin-bottom:8px;">',
      '    <span style="width:24px;height:24px;border-radius:50%;background:#10b981;color:#000;font-weight:700;font-size:0.75rem;display:flex;align-items:center;justify-content:center;flex-shrink:0;">1</span>',
      '    <span>Tap the <strong>three-dot menu</strong> (\u22EE) in the top-right of Chrome</span>',
      '  </li>',
      '  <li style="display:flex;align-items:center;gap:12px;padding:10px 12px;border-radius:10px;background:rgba(255,255,255,0.04);font-size:0.88rem;color:#f1f5f9;margin-bottom:8px;">',
      '    <span style="width:24px;height:24px;border-radius:50%;background:#10b981;color:#000;font-weight:700;font-size:0.75rem;display:flex;align-items:center;justify-content:center;flex-shrink:0;">2</span>',
      '    <span>Tap <strong>"Add to Home screen"</strong> or <strong>"Install app"</strong></span>',
      '  </li>',
      '  <li style="display:flex;align-items:center;gap:12px;padding:10px 12px;border-radius:10px;background:rgba(255,255,255,0.04);font-size:0.88rem;color:#f1f5f9;margin-bottom:8px;">',
      '    <span style="width:24px;height:24px;border-radius:50%;background:#10b981;color:#000;font-weight:700;font-size:0.75rem;display:flex;align-items:center;justify-content:center;flex-shrink:0;">3</span>',
      '    <span>Tap <strong>"Install"</strong> to confirm</span>',
      '  </li>',
      '</ol>',
      '<button id="pwa-close-android" style="background:rgba(255,255,255,0.08);color:#94a3b8;border:1px solid rgba(255,255,255,0.1);cursor:pointer;padding:11px 28px;border-radius:10px;font-size:0.9rem;font-family:inherit;font-weight:500;width:100%;">Got it</button>',
    ].join('');

    overlay.appendChild(card);
    document.body.appendChild(overlay);
    card.querySelector('#pwa-close-android').addEventListener('click', hideAndroidGuide);
  }

  function hideAndroidGuide() {
    var overlay = document.getElementById('pwa-android-guide');
    if (overlay) overlay.parentNode.removeChild(overlay);
  }

  // ── Desktop Install Guide (fallback when native prompt unavailable) ─────────
  function showDesktopGuide() {
    if (document.getElementById('pwa-desktop-guide')) return;

    var overlay = document.createElement('div');
    overlay.id = 'pwa-desktop-guide';
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) hideDesktopGuide();
    });

    var card = document.createElement('div');
    card.className = 'pwa-desktop-card';

    // Detect browser for specific instructions
    var isEdge = /edg/i.test(navigator.userAgent);
    var browserName = isEdge ? 'Edge' : 'Chrome';
    var menuIcon = isEdge ? '\u22EF' : '\u22EE';
    var menuDesc = isEdge ? 'the three-dot menu (<strong>\u22EF</strong>) in the top-right' : 'the three-dot menu (<strong>\u22EE</strong>) in the top-right';

    card.innerHTML = [
      '<h3>Install FACTS as an App</h3>',
      '<p>Get a desktop app icon, full-screen experience, and quick access.</p>',
      '<ol class="pwa-desktop-steps">',
      '  <li>',
      '    <span class="step-num">1</span>',
      '    <span class="step-icon">' + menuIcon + '</span>',
      '    <span>Click ' + menuDesc + ' corner of ' + browserName + '</span>',
      '  </li>',
      '  <li>',
      '    <span class="step-num">2</span>',
      '    <span class="step-icon">\uD83D\uDCE5</span>',
      '    <span>Click <strong>"Install FACTS"</strong> or <strong>"Install app"</strong></span>',
      '  </li>',
      '  <li>',
      '    <span class="step-num">3</span>',
      '    <span class="step-icon">\u2705</span>',
      '    <span>Click <strong>"Install"</strong> in the confirmation dialog</span>',
      '  </li>',
      '</ol>',
      '<p style="font-size:0.8rem;color:#64748b;margin-bottom:16px;">',
      '  Look for the <strong>install icon</strong> (\uD83D\uDCE5) in the address bar too!',
      '</p>',
      '<button id="pwa-close-desktop">Got it</button>',
    ].join('');

    overlay.appendChild(card);
    document.body.appendChild(overlay);

    card.querySelector('#pwa-close-desktop').addEventListener('click', hideDesktopGuide);
  }

  function hideDesktopGuide() {
    var overlay = document.getElementById('pwa-desktop-guide');
    if (overlay) overlay.parentNode.removeChild(overlay);
  }

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

    // Capture Android/Desktop install prompt (single authoritative listener)
    window.addEventListener('beforeinstallprompt', function (e) {
      e.preventDefault();
      deferredPrompt = e;
      promptConsumed = false;
      console.log('[PWA] beforeinstallprompt fired — native install available');

      // Show the header install button immediately
      updateInstallButtons(true);

      // On mobile: also show the bottom banner after delay
      // On desktop: header button is enough (no duplicate UI)
      if (isMobile() && shouldShowBanner()) {
        setTimeout(showBanner, BANNER_DELAY_MS);
      } else if (!isMobile() && shouldShowBanner()) {
        // On desktop, show banner only if there's no header button
        var headerBtn = document.getElementById('pwa-header-install-btn');
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

    // Track install success
    window.addEventListener('appinstalled', function () {
      console.log('[PWA] App installed successfully!');
      hideBanner(true);
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
