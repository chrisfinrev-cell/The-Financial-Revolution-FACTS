// Proprietary – Financial Revolution – All Rights Reserved
/**
 * FACTS Compliance Disclaimer + Onboarding Tour Controller
 *
 * Runs on /app after authentication. Checks the user's compliance status via API
 * and triggers the appropriate flows:
 *   1. Disclaimer modal (timed acknowledgment) — fires on first login + TOS updates
 *   2. Onboarding tour — fires after disclaimer, for users who haven't toured yet
 *
 * © 2024–2026 Financial Revolution. All rights reserved. FACTS™ is a proprietary system.
 */
(function () {
  'use strict';

  // Only activate on the /app page
  if (!window.location.pathname.match(/^\/app(\/|$)/)) return;

  var COUNTDOWN_SECONDS = 5;

  // ─── CSS Injection ──────────────────────────────────────────────────────────
  var css = `
/* ── FACTS Compliance Disclaimer Modal ── */
#facts-compliance-overlay {
  position: fixed; inset: 0;
  z-index: 100000;
  background: rgba(5, 8, 20, 0.92);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  display: flex; align-items: center; justify-content: center;
  padding: 16px;
  font-family: 'DM Sans', Inter, system-ui, sans-serif;
  opacity: 0;
  transition: opacity 0.3s ease;
}
#facts-compliance-overlay.visible { opacity: 1; }

#facts-compliance-card {
  background: #111827;
  border: 1px solid rgba(245, 158, 11, 0.35);
  border-radius: 20px;
  padding: 40px 36px;
  max-width: 520px;
  width: 100%;
  box-shadow: 0 0 60px rgba(245, 158, 11, 0.12), 0 24px 64px rgba(0,0,0,0.6);
  position: relative;
  animation: facts-card-in 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) both;
}

@keyframes facts-card-in {
  from { opacity: 0; transform: scale(0.9) translateY(20px); }
  to   { opacity: 1; transform: scale(1) translateY(0); }
}

#facts-compliance-card .cd-badge {
  display: inline-flex; align-items: center; gap: 6px;
  background: rgba(245, 158, 11, 0.12);
  border: 1px solid rgba(245, 158, 11, 0.3);
  border-radius: 20px;
  padding: 5px 14px;
  font-size: 0.72rem;
  font-weight: 600;
  color: #f59e0b;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  margin-bottom: 20px;
}

#facts-compliance-card .cd-title {
  font-family: 'Space Grotesk', 'DM Sans', system-ui, sans-serif;
  font-size: 1.5rem;
  font-weight: 700;
  color: #f1f5f9;
  margin-bottom: 8px;
  line-height: 1.25;
}

#facts-compliance-card .cd-subtitle {
  font-size: 0.85rem;
  color: #64748b;
  margin-bottom: 24px;
}

#facts-compliance-card .cd-divider {
  height: 1px;
  background: rgba(30, 41, 59, 0.8);
  margin-bottom: 24px;
}

#facts-compliance-card .cd-body {
  background: rgba(10, 15, 26, 0.6);
  border: 1px solid #1e293b;
  border-radius: 12px;
  padding: 20px;
  margin-bottom: 24px;
}

#facts-compliance-card .cd-body p {
  font-size: 0.92rem;
  color: #cbd5e1;
  line-height: 1.65;
  margin: 0;
}

#facts-compliance-card .cd-countdown {
  text-align: center;
  font-size: 0.8rem;
  color: #64748b;
  margin-bottom: 16px;
  min-height: 22px;
  transition: color 0.3s;
}

#facts-compliance-card .cd-countdown.ready {
  color: #10b981;
  font-weight: 600;
}

#facts-comply-btn {
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

#facts-comply-btn:disabled {
  background: #1a2332;
  color: #4b5563;
  cursor: not-allowed;
  box-shadow: none;
}

#facts-comply-btn:not(:disabled) {
  background: linear-gradient(135deg, #10b981 0%, #059669 100%);
  color: #fff;
  box-shadow: 0 4px 20px rgba(16, 185, 129, 0.35);
}

#facts-comply-btn:not(:disabled):hover {
  transform: translateY(-1px);
  box-shadow: 0 6px 28px rgba(16, 185, 129, 0.45);
}

#facts-comply-btn:not(:disabled):active {
  transform: translateY(0);
}

#facts-comply-btn .btn-progress {
  position: absolute; left: 0; top: 0; height: 100%;
  background: rgba(255,255,255,0.12);
  transition: width 1s linear;
}

#facts-compliance-card .cd-legal-note {
  text-align: center;
  font-size: 0.72rem;
  color: #374151;
  margin-top: 14px;
  line-height: 1.5;
}

@media (max-width: 520px) {
  #facts-compliance-card {
    padding: 28px 20px;
    border-radius: 16px;
  }
  #facts-compliance-card .cd-title { font-size: 1.25rem; }
}
`;

  function injectStyles() {
    if (document.getElementById('facts-compliance-styles')) return;
    var style = document.createElement('style');
    style.id = 'facts-compliance-styles';
    style.textContent = css;
    document.head.appendChild(style);
  }

  // ─── Build Modal DOM ────────────────────────────────────────────────────────
  function buildModal() {
    var overlay = document.createElement('div');
    overlay.id = 'facts-compliance-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'cd-title-el');
    overlay.setAttribute('aria-describedby', 'cd-body-el');

    overlay.innerHTML = `
      <div id="facts-compliance-card">
        <div class="cd-badge">⚠️ Required Disclosure</div>
        <h2 class="cd-title" id="cd-title-el">Before You Continue</h2>
        <p class="cd-subtitle">Please read and acknowledge the following disclosure.</p>
        <div class="cd-divider"></div>
        <div class="cd-body" id="cd-body-el">
          <p>
            <strong style="color:#f1f5f9;">FACTS is a strictly educational platform — not a licensed financial advisor, bank, RIA, broker-dealer, lender, or credit repair organization.</strong>
            All projections, allocations, scores, comparisons, and calculations are educational estimates based on the data you provide.
            They do not constitute financial, investment, tax, legal, lending, insurance, or credit-repair advice.
            Results may vary and are not guaranteed. FACTS is non-custodial and does not hold or move user funds.
            <br><br>
            Consult a <strong style="color:#f1f5f9;">licensed professional</strong> for
            personalized guidance before making significant financial, credit, lending, tax, or legal decisions.
          </p>
        </div>
        <div class="cd-countdown" id="cd-countdown-el" aria-live="polite">
          Please read the above — you can acknowledge in <strong id="cd-count-num">5</strong> seconds
        </div>
        <button id="facts-comply-btn" disabled aria-disabled="true">
          <span class="btn-progress" id="cd-btn-progress" style="width:0%"></span>
          <span id="cd-btn-label" style="position:relative;z-index:1;">I Understand &amp; Agree</span>
        </button>
        <p class="cd-legal-note">
          By clicking above, you confirm you have read and understood this disclosure.<br>
          <a href="/terms-of-service" target="_blank" style="color:#64748b;text-decoration:underline;">View Full Terms of Service</a>
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

    // Trap focus
    var btn = document.getElementById('facts-comply-btn');
    var countdownEl = document.getElementById('cd-countdown-el');
    var countNum = document.getElementById('cd-count-num');
    var progressBar = document.getElementById('cd-btn-progress');
    var btnLabel = document.getElementById('cd-btn-label');

    // Slight delay for animation
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        overlay.classList.add('visible');
      });
    });

    // Focus trap — keep focus inside the modal
    overlay.addEventListener('keydown', function (e) {
      if (e.key === 'Tab') {
        // Only one focusable element (the button), so just prevent tab from leaving
        e.preventDefault();
      }
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
        // Enable the button
        btn.disabled = false;
        btn.setAttribute('aria-disabled', 'false');
        countdownEl.className = 'cd-countdown ready';
        countdownEl.innerHTML = '✓ You may now acknowledge';
        progressBar.style.width = '0%'; // remove progress overlay from button
        btn.focus();
      }
    }

    setTimeout(tick, 50);

    // Acknowledge button
    btn.addEventListener('click', function () {
      if (btn.disabled) return;
      btn.disabled = true;
      btnLabel.textContent = 'Saving…';

      fetch('/api/user/tos-acknowledge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      })
        .then(function (r) { return r.json(); })
        .then(function () {
          // Dismiss with fade out
          overlay.style.transition = 'opacity 0.3s ease';
          overlay.style.opacity = '0';
          setTimeout(function () {
            document.body.style.overflow = '';
            if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
            if (typeof onComplete === 'function') onComplete();
          }, 320);
        })
        .catch(function () {
          // Fail silently — don't block the user
          document.body.style.overflow = '';
          if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
          if (typeof onComplete === 'function') onComplete();
        });
    });
  }

  // ─── Main Entry ─────────────────────────────────────────────────────────────
  function run() {
    fetch('/api/user/compliance-status')
      .then(function (r) {
        if (!r.ok) throw new Error('Not authenticated');
        return r.json();
      })
      .then(function (data) {
        if (data.needs_disclaimer) {
          showDisclaimer(function () {
            // After disclaimer, start tour if needed
            if (data.needs_tour && window.factsStartOnboardingTour) {
              setTimeout(window.factsStartOnboardingTour, 600);
            }
          });
        } else if (data.needs_tour && window.factsStartOnboardingTour) {
          // No disclaimer needed, but tour hasn't been seen
          setTimeout(window.factsStartOnboardingTour, 1000);
        }
      })
      .catch(function () {
        // Not logged in or network error — do nothing
      });
  }

  // Run after DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run);
  } else {
    // Small delay to let the app page initialize first
    setTimeout(run, 800);
  }
}());
