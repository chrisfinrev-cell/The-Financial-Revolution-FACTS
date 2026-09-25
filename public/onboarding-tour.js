// Proprietary – Financial Revolution – All Rights Reserved
/**
 * FACTS Guided Onboarding Tour
 *
 * Step-by-step tooltip walkthrough for first-time users.
 * Highlights key UI areas with a spotlight overlay and positioned tooltips.
 * Stores completion in DB so it only shows once (unless reset).
 *
 * © 2024–2026 Financial Revolution. All rights reserved. FACTS™ is a proprietary system.
 */
(function () {
  'use strict';

  // Only activate on the /app page
  if (!window.location.pathname.match(/^\/app(\/|$)/)) return;

  // ─── Tour Steps ─────────────────────────────────────────────────────────────
  var STEPS = [
    {
      title: '👋 Welcome to FACTS!',
      body: 'You\'ve made the right move. FACTS is your <strong>financial command center</strong> — where every dollar gets a job before you spend it. Let\'s take a quick 60-second tour.',
      target: null,
      tab: null,
      position: 'center'
    },
    {
      title: '📊 Your 6 Allocation Categories',
      body: 'Every dollar you earn gets split across these 6 categories automatically. This is the FACTS method — <strong>allocate first, spend from your bucket</strong>.',
      target: '#alloc-status',
      tab: 'dashboard',
      position: 'auto'
    },
    {
      title: '💵 Log Your Income',
      body: 'When you get paid, enter the amount here. FACTS instantly distributes it across your 6 categories based on your allocation percentages.',
      target: '#txn-amount',
      tab: 'add',
      position: 'auto',
      beforeShow: function () {
        // Switch to income mode if the toggle exists
        var incomeToggle = document.querySelector('[data-type="income"], #income-mode-btn, [onclick*="income"]');
        if (incomeToggle) incomeToggle.click();
      }
    },
    {
      title: '🧾 Pick a Category When You Spend',
      body: 'When you spend money, pick the right category. Your balance updates instantly — no surprises, no overspending.',
      target: '#category-picker',
      tab: 'add',
      position: 'auto'
    },
    {
      title: '📈 Your Financial Dashboard',
      body: 'Your income, expenses, and net balance — all at a glance. Watch your <strong>Financial Freedom Number</strong> grow every time you log a transaction.',
      target: '#dashboard-level-card',
      tab: 'dashboard',
      position: 'auto'
    },
    {
      title: '📋 Transaction History',
      body: 'Every transaction you log lives here. Filter by year, tag by family member, and review your full money story.',
      target: '#all-txns',
      tab: 'transactions',
      position: 'auto'
    },
    {
      title: '🎉 You\'re All Set!',
      body: 'That\'s the FACTS system. Start by <strong>logging your first income</strong> — and watch your allocations come to life. You\'ve got this.',
      target: null,
      tab: null,
      position: 'center'
    }
  ];

  var currentStep = 0;
  var isActive = false;
  var tourOverlay = null;
  var tourTooltip = null;
  var highlightedEl = null;
  var originalZIndex = null;

  // ─── CSS Injection ───────────────────────────────────────────────────────────
  var css = `
/* ── FACTS Onboarding Tour ── */
#facts-tour-overlay {
  position: fixed; inset: 0;
  z-index: 99000;
  pointer-events: none;
  background: rgba(5, 8, 20, 0.55);
  backdrop-filter: blur(1px);
  -webkit-backdrop-filter: blur(1px);
  opacity: 0;
  transition: opacity 0.35s ease;
}
#facts-tour-overlay.visible { opacity: 1; pointer-events: auto; }

/* Spotlight cutout — positioned by JS */
#facts-tour-spotlight {
  position: fixed;
  z-index: 99001;
  pointer-events: none;
  border-radius: 12px;
  box-shadow:
    0 0 0 9999px rgba(5, 8, 20, 0.55),
    0 0 0 3px rgba(16, 185, 129, 0.5),
    0 0 20px 2px rgba(16, 185, 129, 0.25);
  transition: all 0.35s cubic-bezier(0.4, 0, 0.2, 1);
  opacity: 0;
}
#facts-tour-spotlight.visible { opacity: 1; }

/* Tooltip card */
#facts-tour-tooltip {
  position: fixed;
  z-index: 99002;
  background: #111827;
  border: 1px solid rgba(16, 185, 129, 0.3);
  border-radius: 16px;
  padding: 24px 24px 20px;
  width: 320px;
  max-width: calc(100vw - 32px);
  box-shadow: 0 20px 60px rgba(0,0,0,0.55), 0 0 30px rgba(16, 185, 129, 0.08);
  font-family: 'DM Sans', Inter, system-ui, sans-serif;
  opacity: 0;
  transform: translateY(12px);
  transition: opacity 0.3s ease, transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
  pointer-events: auto;
  /* Flex column so content scrolls and nav stays at bottom */
  display: flex;
  flex-direction: column;
  max-height: calc(100vh - 40px); /* Use viewport height so nav never clips below fold */
  overflow: visible; /* Visible so .tour-nav is never clipped */
}
#facts-tour-tooltip.visible {
  opacity: 1;
  transform: translateY(0);
}

/* Scrollable content area — badge + title + body scroll independently */
#facts-tour-tooltip .tour-content {
  flex: 1;
  overflow-y: auto;
  /* Nice scrollbar */
  scrollbar-width: thin;
  scrollbar-color: #1e293b transparent;
}
#facts-tour-tooltip .tour-content::-webkit-scrollbar { width: 4px; }
#facts-tour-tooltip .tour-content::-webkit-scrollbar-track { background: transparent; }
#facts-tour-tooltip .tour-content::-webkit-scrollbar-thumb { background: #1e293b; border-radius: 2px; }

/* Nav buttons always visible at bottom of tooltip */
#facts-tour-tooltip .tour-nav {
  flex-shrink: 0;
  padding-top: 12px;
  border-top: 1px solid rgba(255,255,255,0.06);
  margin-top: 4px;
}

/* Tooltip arrow */
#facts-tour-tooltip::before {
  content: '';
  position: absolute;
  width: 10px; height: 10px;
  background: #111827;
  border-left: 1px solid rgba(16, 185, 129, 0.3);
  border-top: 1px solid rgba(16, 185, 129, 0.3);
  transform: rotate(45deg);
}
#facts-tour-tooltip.arrow-top::before    { top: -6px; left: 20px; }
#facts-tour-tooltip.arrow-bottom::before { bottom: -6px; left: 20px; transform: rotate(225deg); }
#facts-tour-tooltip.arrow-none::before   { display: none; }

.tour-step-badge {
  display: inline-block;
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: #10b981;
  background: rgba(16, 185, 129, 0.1);
  border-radius: 20px;
  padding: 3px 10px;
  margin-bottom: 12px;
}

.tour-title {
  font-family: 'Space Grotesk', 'DM Sans', system-ui, sans-serif;
  font-size: 1.1rem;
  font-weight: 700;
  color: #f1f5f9;
  margin-bottom: 8px;
  line-height: 1.3;
}

.tour-body {
  font-size: 0.88rem;
  color: #cbd5e1;
  line-height: 1.6;
  margin-bottom: 20px;
}

.tour-body strong { color: #e2e8f0; }

.tour-nav {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.tour-progress {
  display: flex; gap: 5px; align-items: center;
  flex: 1;
}

.tour-dot {
  width: 6px; height: 6px;
  border-radius: 50%;
  background: #1e293b;
  transition: all 0.2s ease;
  flex-shrink: 0;
}
.tour-dot.active {
  background: #10b981;
  width: 18px;
  border-radius: 3px;
}
.tour-dot.done { background: #374151; }

.tour-btn-skip {
  background: none; border: none;
  color: #94a3b8;
  font-size: 0.8rem;
  cursor: pointer;
  padding: 6px 2px;
  font-family: inherit;
  transition: color 0.2s;
  flex-shrink: 0;
}
.tour-btn-skip:hover { color: #f1f5f9; }

.tour-btn-back {
  background: #1a2332;
  border: 1px solid #1e293b;
  color: #cbd5e1;
  font-size: 0.85rem;
  font-weight: 500;
  font-family: inherit;
  border-radius: 8px;
  padding: 8px 16px;
  cursor: pointer;
  transition: all 0.2s;
  flex-shrink: 0;
}
.tour-btn-back:hover { background: #1e293b; color: #f1f5f9; }

.tour-btn-next {
  background: linear-gradient(135deg, #10b981 0%, #059669 100%);
  border: none;
  color: #fff;
  font-size: 0.9rem;
  font-weight: 600;
  font-family: 'Space Grotesk', inherit;
  border-radius: 8px;
  padding: 8px 18px;
  cursor: pointer;
  transition: all 0.2s;
  flex-shrink: 0;
  box-shadow: 0 2px 12px rgba(16, 185, 129, 0.3);
}
.tour-btn-next:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 18px rgba(16, 185, 129, 0.4);
}

@media (max-width: 768px) {
  #facts-tour-tooltip {
    width: calc(100vw - 32px);
    left: 16px !important;
    right: 16px !important;
    bottom: 80px !important;
    top: auto !important;
    transform: translateY(20px) !important;
    border-radius: 14px;
    max-height: calc(100vh - 120px);
  }
  #facts-tour-tooltip.visible {
    transform: translateY(0) !important;
  }
  #facts-tour-tooltip::before { display: none !important; }
}
`;

  function injectStyles() {
    if (document.getElementById('facts-tour-styles')) return;
    var style = document.createElement('style');
    style.id = 'facts-tour-styles';
    style.textContent = css;
    document.head.appendChild(style);
  }

  // ─── Tab Switching ───────────────────────────────────────────────────────────
  function switchToTab(tabName) {
    if (!tabName) return;
    var btn = document.querySelector('[data-tab="' + tabName + '"]');
    if (btn && btn.click) {
      btn.click();
    }
  }

  // ─── Element Highlight ────────────────────────────────────────────────────────
  function highlightElement(el) {
    clearHighlight();
    if (!el) return;
    highlightedEl = el;
    originalZIndex = el.style.zIndex;
    el.style.position = el.style.position || 'relative';
    el.style.zIndex = '99001';
  }

  function clearHighlight() {
    if (highlightedEl) {
      highlightedEl.style.zIndex = originalZIndex || '';
      highlightedEl = null;
      originalZIndex = null;
    }
  }

  // ─── Spotlight Positioning ───────────────────────────────────────────────────
  function positionSpotlight(el) {
    var spotlight = document.getElementById('facts-tour-spotlight');
    if (!spotlight) return;
    if (!el) {
      spotlight.classList.remove('visible');
      spotlight.style.display = 'none';
      return;
    }

    var rect = el.getBoundingClientRect();
    var pad = 8;
    spotlight.style.display = 'block';
    spotlight.style.left   = (rect.left - pad) + 'px';
    spotlight.style.top    = (rect.top - pad) + 'px';
    spotlight.style.width  = (rect.width + pad * 2) + 'px';
    spotlight.style.height = (rect.height + pad * 2) + 'px';

    requestAnimationFrame(function () {
      spotlight.classList.add('visible');
    });
  }

  // ─── Tooltip Positioning ─────────────────────────────────────────────────────
  function positionTooltip(el, position) {
    var tooltip = document.getElementById('facts-tour-tooltip');
    if (!tooltip) return;

    var isMobile = window.innerWidth <= 768;
    // Account for mobile tab bar (~68px) so nav buttons aren't clipped
    var bottomClearance = isMobile ? 80 : 40;

    if (isMobile || !el || position === 'center') {
      // Center / mobile: place above mobile tab bar
      tooltip.style.left = '50%';
      tooltip.style.top = '';
      tooltip.style.bottom = bottomClearance + 'px';
      tooltip.style.transform = 'translateX(-50%)';
      tooltip.className = 'arrow-none';
      return;
    }

    var rect = el.getBoundingClientRect();
    var tw = tooltip.offsetWidth || 320;
    var th = tooltip.offsetHeight || 240;
    var pad = 12;
    var vp = { w: window.innerWidth, h: window.innerHeight };

    // Reset transform
    tooltip.style.transform = '';

    // Try to place below the element
    var spaceBelow = vp.h - rect.bottom - pad - bottomClearance;
    var spaceAbove = rect.top - pad;

    var left = Math.max(16, Math.min(rect.left, vp.w - tw - 16));
    tooltip.style.left = left + 'px';
    tooltip.style.right = '';
    tooltip.style.transform = '';

    if (spaceBelow >= th + 20) {
      var topPos = rect.bottom + pad;
      // Clamp so tooltip bottom doesn't exceed viewport minus clearance
      if (topPos + th > vp.h - bottomClearance) {
        topPos = vp.h - bottomClearance - th;
      }
      tooltip.style.top = Math.max(pad, topPos) + 'px';
      tooltip.style.bottom = '';
      tooltip.className = 'arrow-top';
    } else if (spaceAbove >= th + 20) {
      tooltip.style.top = Math.max(pad, rect.top - th - pad) + 'px';
      tooltip.style.bottom = '';
      tooltip.className = 'arrow-bottom';
    } else {
      // Fall back: center above bottom clearance
      tooltip.style.top = '';
      tooltip.style.bottom = bottomClearance + 'px';
      tooltip.style.left = '50%';
      tooltip.style.transform = 'translateX(-50%)';
      tooltip.className = 'arrow-none';
    }
  }

  // ─── Render Step ─────────────────────────────────────────────────────────────
  function renderStep(idx) {
    var step = STEPS[idx];
    var total = STEPS.length;
    var isFirst = idx === 0;
    var isLast = idx === total - 1;

    // Switch tab if needed
    if (step.tab) {
      switchToTab(step.tab);
    }

    // Run any before-show action
    if (typeof step.beforeShow === 'function') {
      try { step.beforeShow(); } catch (e) {}
    }

    // Small delay to let tab transition settle before measuring DOM
    setTimeout(function () {
      var targetEl = step.target ? document.querySelector(step.target) : null;

      // Scroll target into view
      if (targetEl) {
        targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }

      // Update overlay
      var overlay = document.getElementById('facts-tour-overlay');
      if (overlay) {
        overlay.style.pointerEvents = targetEl ? 'auto' : 'none';
      }

      // Another small delay for scroll to complete
      setTimeout(function () {
        highlightElement(targetEl);
        positionSpotlight(targetEl);

        // Build tooltip content
        var tooltip = document.getElementById('facts-tour-tooltip');
        if (!tooltip) return;

        // Progress dots
        var dots = '';
        for (var i = 0; i < total; i++) {
          var cls = i === idx ? 'tour-dot active' : (i < idx ? 'tour-dot done' : 'tour-dot');
          dots += '<div class="' + cls + '"></div>';
        }

        // Navigation buttons
        var backBtn = isFirst ? '' : '<button class="tour-btn-back" id="tour-back-btn" aria-label="Previous step">← Back</button>';
        var nextLabel = isLast ? '🎉 Start Using FACTS' : 'Next →';
        var nextBtn = '<button class="tour-btn-next" id="tour-next-btn" aria-label="' + (isLast ? 'Finish tour' : 'Next step') + '">' + nextLabel + '</button>';

        tooltip.innerHTML = `
          <div class="tour-content">
            <div class="tour-step-badge">Step ${idx + 1} of ${total}</div>
            <div class="tour-title">${step.title}</div>
            <div class="tour-body">${step.body}</div>
          </div>
          <div class="tour-nav">
            <button class="tour-btn-skip" id="tour-skip-btn" aria-label="Skip tour">Skip tour</button>
            <div class="tour-progress">${dots}</div>
            ${backBtn}
            ${nextBtn}
          </div>
        `;

        // Bind navigation
        var skipBtn = document.getElementById('tour-skip-btn');
        var nextBtnEl = document.getElementById('tour-next-btn');
        var backBtnEl = document.getElementById('tour-back-btn');

        if (skipBtn) skipBtn.addEventListener('click', function () { endTour(true); });
        if (nextBtnEl) nextBtnEl.addEventListener('click', function () {
          if (isLast) { endTour(false); } else { goToStep(idx + 1); }
        });
        if (backBtnEl) backBtnEl.addEventListener('click', function () { goToStep(idx - 1); });

        // Keyboard nav
        document.getElementById('facts-tour-tooltip').focus && document.getElementById('facts-tour-tooltip').focus();

        // Position tooltip
        positionTooltip(targetEl, step.position);

        // Show tooltip with animation
        requestAnimationFrame(function () {
          tooltip.classList.add('visible');
        });
      }, targetEl ? 350 : 50);
    }, 80);
  }

  // ─── Navigation ──────────────────────────────────────────────────────────────
  function goToStep(idx) {
    var tooltip = document.getElementById('facts-tour-tooltip');
    var spotlight = document.getElementById('facts-tour-spotlight');

    // Animate out
    if (tooltip) tooltip.classList.remove('visible');
    if (spotlight) spotlight.classList.remove('visible');
    clearHighlight();

    currentStep = idx;
    setTimeout(function () { renderStep(idx); }, 200);
  }

  // ─── End Tour ────────────────────────────────────────────────────────────────
  function endTour(skipped) {
    isActive = false;
    clearHighlight();

    var tooltip = document.getElementById('facts-tour-tooltip');
    var spotlight = document.getElementById('facts-tour-spotlight');
    var overlay = document.getElementById('facts-tour-overlay');

    if (tooltip) tooltip.classList.remove('visible');
    if (spotlight) spotlight.classList.remove('visible');
    if (overlay) overlay.classList.remove('visible');

    setTimeout(function () {
      if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
      if (spotlight && spotlight.parentNode) spotlight.parentNode.removeChild(spotlight);
      if (tooltip && tooltip.parentNode) tooltip.parentNode.removeChild(tooltip);
    }, 400);

    // Switch back to dashboard tab
    switchToTab('dashboard');

    // Record completion in DB
    fetch('/api/user/onboarding-complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ skipped: skipped })
    }).catch(function () {});
  }

  // ─── Initialize Tour DOM ─────────────────────────────────────────────────────
  function initTourDOM() {
    // Overlay
    var overlay = document.createElement('div');
    overlay.id = 'facts-tour-overlay';
    overlay.setAttribute('aria-hidden', 'true');
    document.body.appendChild(overlay);

    // Spotlight
    var spotlight = document.createElement('div');
    spotlight.id = 'facts-tour-spotlight';
    spotlight.setAttribute('aria-hidden', 'true');
    document.body.appendChild(spotlight);

    // Tooltip
    var tooltip = document.createElement('div');
    tooltip.id = 'facts-tour-tooltip';
    tooltip.setAttribute('role', 'dialog');
    tooltip.setAttribute('aria-live', 'polite');
    tooltip.setAttribute('tabindex', '-1');
    document.body.appendChild(tooltip);

    // Tap overlay to dismiss tour (critical for Android usability)
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) endTour(true);
    });

    // Keyboard: ESC to skip
    document.addEventListener('keydown', function (e) {
      if (!isActive) return;
      if (e.key === 'Escape') endTour(true);
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        if (currentStep < STEPS.length - 1) goToStep(currentStep + 1);
        else endTour(false);
      }
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        if (currentStep > 0) goToStep(currentStep - 1);
      }
    });

    // Show overlay with animation
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        overlay.classList.add('visible');
      });
    });
  }

  // ─── Public: Start Tour ──────────────────────────────────────────────────────
  function startTour() {
    if (isActive) return;
    isActive = true;
    currentStep = 0;

    injectStyles();
    initTourDOM();

    // Switch to dashboard tab first
    switchToTab('dashboard');

    setTimeout(function () {
      renderStep(0);
    }, 400);
  }

  // Expose globally for compliance-disclaimer.js to call
  window.factsStartOnboardingTour = startTour;

}());
