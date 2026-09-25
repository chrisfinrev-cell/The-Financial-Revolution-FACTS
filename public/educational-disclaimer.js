// Proprietary – Financial Revolution – All Rights Reserved
/**
 * Educational Disclaimer Controller
 *
 * Fires on every /app login when the recurrence timer has elapsed (default 30 days),
 * when the user has never seen it, or when a platform update has bumped the version.
 *
 * Recurrence interval: user-configurable 30–180 days (default 30) via Settings → Disclaimer.
 * Deploy trigger: bumping EDUCATIONAL_DISCLAIMER_VERSION env var forces immediate re-show.
 *
 * © 2024–2026 Financial Revolution. All rights reserved. FACTS™ is a proprietary system.
 */
(function () {
  'use strict';

  // Only activate on the /app page
  if (!window.location.pathname.match(/^\/app(\/|$)/)) return;

  var COUNTDOWN_SECONDS = 5;

  // ─── CSS ────────────────────────────────────────────────────────────────────
  var css = `
/* ── Educational Disclaimer Modal ── */
#edu-disclaimer-overlay {
  position: fixed; inset: 0;
  z-index: 100001;
  background: rgba(5, 8, 20, 0.94);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  display: flex; align-items: center; justify-content: center;
  padding: 16px;
  font-family: 'DM Sans', Inter, system-ui, sans-serif;
  opacity: 0;
  transition: opacity 0.35s ease;
}
#edu-disclaimer-overlay.visible { opacity: 1; }

#edu-disclaimer-card {
  background: #0d1117;
  border: 1px solid rgba(99, 179, 237, 0.30);
  border-radius: 20px;
  padding: 40px 36px;
  max-width: 540px;
  width: 100%;
  box-shadow: 0 0 70px rgba(99, 179, 237, 0.08), 0 28px 72px rgba(0,0,0,0.65);
  position: relative;
  animation: edu-card-in 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) both;
}

@keyframes edu-card-in {
  from { opacity: 0; transform: scale(0.88) translateY(24px); }
  to   { opacity: 1; transform: scale(1) translateY(0); }
}

#edu-disclaimer-card .edu-badge {
  display: inline-flex; align-items: center; gap: 7px;
  background: rgba(99, 179, 237, 0.10);
  border: 1px solid rgba(99, 179, 237, 0.28);
  border-radius: 20px;
  padding: 5px 14px;
  font-size: 0.72rem;
  font-weight: 600;
  color: #63b3ed;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  margin-bottom: 20px;
}

#edu-disclaimer-card .edu-title {
  font-family: 'Space Grotesk', 'DM Sans', system-ui, sans-serif;
  font-size: 1.45rem;
  font-weight: 700;
  color: #f1f5f9;
  margin-bottom: 6px;
  line-height: 1.25;
}

#edu-disclaimer-card .edu-subtitle {
  font-size: 0.85rem;
  color: #64748b;
  margin-bottom: 22px;
}

#edu-disclaimer-card .edu-divider {
  height: 1px;
  background: rgba(30, 41, 59, 0.8);
  margin-bottom: 22px;
}

#edu-disclaimer-card .edu-body {
  background: rgba(10, 15, 26, 0.55);
  border: 1px solid #1e293b;
  border-radius: 12px;
  padding: 20px;
  margin-bottom: 22px;
}

#edu-disclaimer-card .edu-body p {
  font-size: 0.91rem;
  color: #cbd5e1;
  line-height: 1.68;
  margin: 0 0 12px;
}
#edu-disclaimer-card .edu-body p:last-child { margin-bottom: 0; }

#edu-disclaimer-card .edu-points {
  list-style: none;
  padding: 0; margin: 0 0 0 0;
}
#edu-disclaimer-card .edu-points li {
  display: flex; align-items: flex-start; gap: 10px;
  font-size: 0.87rem;
  color: #94a3b8;
  line-height: 1.55;
  margin-bottom: 8px;
}
#edu-disclaimer-card .edu-points li:last-child { margin-bottom: 0; }
#edu-disclaimer-card .edu-points li::before {
  content: '◆';
  font-size: 0.45rem;
  color: #63b3ed;
  flex-shrink: 0;
  margin-top: 5px;
}

#edu-disclaimer-card .edu-countdown {
  text-align: center;
  font-size: 0.8rem;
  color: #64748b;
  margin-bottom: 14px;
  min-height: 22px;
  transition: color 0.3s;
}
#edu-disclaimer-card .edu-countdown.ready {
  color: #10b981;
  font-weight: 600;
}

#edu-dismiss-btn {
  display: block;
  width: 100%;
  padding: 14px 24px;
  border-radius: 12px;
  border: none;
  cursor: pointer;
  font-family: 'Space Grotesk', 'DM Sans', system-ui, sans-serif;
  font-size: 1rem;
  font-weight: 600;
  letter-spacing: 0.01em;
  transition: all 0.2s ease;
  position: relative;
  overflow: hidden;
}

#edu-dismiss-btn:disabled {
  background: #151f2e;
  color: #3d4f66;
  cursor: not-allowed;
  box-shadow: none;
}

#edu-dismiss-btn:not(:disabled) {
  background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%);
  color: #fff;
  box-shadow: 0 4px 22px rgba(59, 130, 246, 0.35);
}

#edu-dismiss-btn:not(:disabled):hover {
  transform: translateY(-1px);
  box-shadow: 0 6px 30px rgba(59, 130, 246, 0.45);
}

#edu-dismiss-btn:not(:disabled):active { transform: translateY(0); }

#edu-dismiss-btn .edu-btn-progress {
  position: absolute; left: 0; top: 0; height: 100%;
  background: rgba(255,255,255,0.10);
  transition: width 1s linear;
}

#edu-disclaimer-card .edu-legal-note {
  text-align: center;
  font-size: 0.72rem;
  color: #374151;
  margin-top: 14px;
  line-height: 1.5;
}

@media (max-width: 520px) {
  #edu-disclaimer-card {
    padding: 28px 20px;
    border-radius: 16px;
  }
  #edu-disclaimer-card .edu-title { font-size: 1.2rem; }
}
`;

  function injectStyles() {
    if (document.getElementById('edu-disclaimer-styles')) return;
    var style = document.createElement('style');
    style.id = 'edu-disclaimer-styles';
    style.textContent = css;
    document.head.appendChild(style);
  }

  // ─── Build Modal DOM ────────────────────────────────────────────────────────
  function buildModal() {
    var overlay = document.createElement('div');
    overlay.id = 'edu-disclaimer-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'edu-title-el');
    overlay.setAttribute('aria-describedby', 'edu-body-el');

    overlay.innerHTML = `
      <div id="edu-disclaimer-card">
        <div class="edu-badge">📚 Educational Disclosure</div>
        <h2 class="edu-title" id="edu-title-el">Platform Educational Notice</h2>
        <p class="edu-subtitle">Required periodic reminder — please read before continuing.</p>
        <div class="edu-divider"></div>
        <div class="edu-body" id="edu-body-el">
          <p>
            <strong style="color:#f1f5f9;">FACTS is a strictly educational
            and informational platform.</strong>
            It is not a licensed financial advisor, bank, lender, broker-dealer, registered investment advisor (RIA), credit repair organization, or fiduciary.
          </p>
          <ul class="edu-points">
            <li>All FACTS projections, scores, comparisons, and calculations are educational estimates — not guaranteed outcomes.</li>
            <li>Nothing on this platform constitutes financial, legal, tax, lending, insurance, investment, or credit-repair advice.</li>
            <li>FACTS is non-custodial — we do not hold, move, or manage any user funds.</li>
            <li>All bank and brokerage connections are read-only for informational purposes only.</li>
            <li>All financial decisions are made solely by you, the user, at your own discretion and risk.</li>
            <li>Consult a licensed professional before making significant financial, credit, lending, tax, or legal decisions.</li>
          </ul>
        </div>
        <div class="edu-countdown" id="edu-countdown-el" aria-live="polite">
          Please read the above — you can continue in <strong id="edu-count-num">5</strong> seconds
        </div>
        <button id="edu-dismiss-btn" disabled aria-disabled="true">
          <span class="edu-btn-progress" id="edu-btn-progress" style="width:0%"></span>
          <span id="edu-btn-label" style="position:relative;z-index:1;">I Understand — Continue to FACTS</span>
        </button>
        <p class="edu-legal-note">
          This notice appears periodically per platform policy.<br>
          <a href="/terms-of-service" target="_blank" style="color:#64748b;text-decoration:underline;">View Full Terms of Service</a>
          &nbsp;·&nbsp;
          <a href="/settings" target="_blank" style="color:#64748b;text-decoration:underline;">Adjust reminder frequency</a>
        </p>
      </div>
    `;
    return overlay;
  }

  // ─── Show Disclaimer ────────────────────────────────────────────────────────
  function showDisclaimer(onComplete) {
    injectStyles();
    var overlay = buildModal();
    document.body.appendChild(overlay);
    document.body.style.overflow = 'hidden';

    var btn         = document.getElementById('edu-dismiss-btn');
    var countdownEl = document.getElementById('edu-countdown-el');
    var countNum    = document.getElementById('edu-count-num');
    var progressBar = document.getElementById('edu-btn-progress');
    var btnLabel    = document.getElementById('edu-btn-label');

    // Fade-in
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        overlay.classList.add('visible');
      });
    });

    // Keep focus inside modal
    overlay.addEventListener('keydown', function (e) {
      if (e.key === 'Tab') e.preventDefault();
    });

    // Countdown timer
    var remaining = COUNTDOWN_SECONDS;
    var startTime = Date.now();

    function tick() {
      var elapsed = (Date.now() - startTime) / 1000;
      remaining = Math.max(0, COUNTDOWN_SECONDS - elapsed);
      var pct = ((COUNTDOWN_SECONDS - remaining) / COUNTDOWN_SECONDS) * 100;
      progressBar.style.width = pct + '%';

      if (remaining > 0) {
        countNum.textContent = Math.ceil(remaining);
        setTimeout(tick, 50);
      } else {
        btn.disabled = false;
        btn.setAttribute('aria-disabled', 'false');
        countdownEl.className = 'edu-countdown ready';
        countdownEl.innerHTML = '✓ You may now continue';
        progressBar.style.width = '0%';
        btn.focus();
      }
    }

    setTimeout(tick, 50);

    // Dismiss button
    btn.addEventListener('click', function () {
      if (btn.disabled) return;
      btn.disabled = true;
      btnLabel.textContent = 'Saving…';

      fetch('/api/user/educational-disclaimer-acknowledge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      })
        .then(function (r) { return r.json(); })
        .then(function () {
          overlay.style.transition = 'opacity 0.3s ease';
          overlay.style.opacity = '0';
          setTimeout(function () {
            document.body.style.overflow = '';
            if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
            if (typeof onComplete === 'function') onComplete();
          }, 320);
        })
        .catch(function () {
          // Fail open — don't block the user
          document.body.style.overflow = '';
          if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
          if (typeof onComplete === 'function') onComplete();
        });
    });
  }

  // ─── Main Entry ─────────────────────────────────────────────────────────────
  function run() {
    fetch('/api/user/educational-disclaimer-status')
      .then(function (r) {
        if (!r.ok) throw new Error('Not authenticated');
        return r.json();
      })
      .then(function (data) {
        if (data.needs_disclaimer) {
          showDisclaimer();
        }
      })
      .catch(function () {
        // Not logged in or network error — do nothing
      });
  }

  // Run after DOM is ready, with a slight delay to let the main app initialise
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      setTimeout(run, 1200);
    });
  } else {
    setTimeout(run, 1200);
  }
}());
