/**
 * Phase Zero — Time Asset Widget
 * Injected into /app for users currently in the 168-Hour Audit.
 * Auto-removes itself if user is not in audit mode.
 */
(function() {
  'use strict';

  var DAILY_MESSAGES = [
    '', // day 0 placeholder
    'The foundation is poured.',
    'Consistency is a currency.',
    'Halfway to verification.',
    'The protocol is working.',
    'Two days remain.',
    'Tomorrow you graduate.',
    'Final entry. Make it count.'
  ];

  var BUCKET_COLORS = {
    necessities: '#60a5fa',
    velocity:    '#f87171',
    reserve:     '#34d399',
    lifestyle:   '#a78bfa',
    growth:      '#fbbf24',
    legacy:      '#fb923c'
  };

  function init() {
    fetch('/api/audit/status', { credentials: 'include' })
      .then(function(r) { return r.json(); })
      .then(function(data) {
        if (!data || !data.audit_status) return;

        if (data.audit_status === 'completed') {
          // Show brief completed badge, then remove
          renderCompletedBadge();
          return;
        }

        if (data.audit_status === 'locked') {
          renderLockoutBanner(data);
          return;
        }

        if (data.audit_status === 'in_progress' || data.audit_status === 'failed') {
          renderAuditWidget(data);
          return;
        }
        // not_started or phase zero not done — no widget needed
      })
      .catch(function() {});
  }

  function getOrCreateContainer() {
    var existing = document.getElementById('pz-audit-widget');
    if (existing) return existing;

    var container = document.createElement('div');
    container.id = 'pz-audit-widget';
    container.style.cssText = [
      'position:fixed',
      'bottom:80px',
      'right:16px',
      'width:300px',
      'background:#111118',
      'border:1px solid #2a2a3a',
      'border-radius:4px',
      'z-index:9000',
      'font-family:"Rajdhani",sans-serif',
      'overflow:hidden',
      'box-shadow:0 4px 24px rgba(0,0,0,0.5)'
    ].join(';');

    // Top accent line
    var topLine = document.createElement('div');
    topLine.style.cssText = 'height:2px;background:linear-gradient(90deg,transparent,#39d353,transparent)';
    container.appendChild(topLine);

    document.body.appendChild(container);
    return container;
  }

  // Compute real-time remaining hours/minutes from audit_start_date
  function calcRemaining(data) {
    var totalMs = 7 * 24 * 60 * 60 * 1000; // 168 hours in ms
    if (data.audit_start_date) {
      var elapsed = Date.now() - new Date(data.audit_start_date).getTime();
      var remainMs = Math.max(0, totalMs - elapsed);
      var remainHrs = Math.floor(remainMs / (60 * 60 * 1000));
      var remainMins = Math.floor((remainMs % (60 * 60 * 1000)) / (60 * 1000));
      return { hours: remainHrs, minutes: remainMins, totalMs: remainMs };
    }
    // Fallback if no start date
    var day = parseInt(data.audit_day_count) || 0;
    return { hours: Math.max(0, (7 - day) * 24), minutes: 0, totalMs: Math.max(0, (7 - day) * 24) * 60 * 60 * 1000 };
  }

  var _auditRefreshTimer = null;
  var _lastAuditData = null;

  function renderAuditWidget(data) {
    _lastAuditData = data;
    var container = getOrCreateContainer();
    var day = parseInt(data.audit_day_count) || 0;
    var rem = calcRemaining(data);
    var hoursRemaining = rem.hours;
    var minutesRemaining = rem.minutes;
    var pct = Math.min(100, (day / 7) * 100);
    var todayLogged = data.today_logged || false;
    var msg = day >= 1 && day <= 7 ? DAILY_MESSAGES[day] : '';
    var isLocked = data.audit_status === 'locked';

    // Format time display
    var timeDisplay = hoursRemaining + 'h ' + minutesRemaining + 'm remaining';

    var html = [
      '<div style="padding:14px 16px">',

        // Header row
        '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">',
          '<div style="display:flex;align-items:center;gap:8px">',
            '<span style="font-size:14px;letter-spacing:0.15em;text-transform:uppercase;color:#39d353;font-family:\'Share Tech Mono\',monospace">TIME ASSET</span>',
          '</div>',
          '<button onclick="document.getElementById(\'pz-audit-widget\').style.display=\'none\'" ',
            'style="background:none;border:none;color:#7a7a9a;cursor:pointer;font-size:16px;padding:0;line-height:1">×</button>',
        '</div>',

        // Day counter
        '<div style="text-align:center;padding:8px 0">',
          '<div style="font-family:\'Share Tech Mono\',monospace;font-size:28px;color:#e8e8f0;line-height:1">',
            'Day ', day, ' <span style="color:#7a7a9a;font-size:16px">of 7</span>',
          '</div>',
          '<div id="pz-audit-time-display" style="font-size:13px;color:#7a7a9a;margin-top:4px">',
            timeDisplay,
          '</div>',
        '</div>',

        // Progress bar
        '<div style="height:6px;background:#1e1e2e;border-radius:3px;margin:12px 0;overflow:hidden">',
          '<div style="height:100%;width:', pct.toFixed(1), '%;background:linear-gradient(90deg,#39d353,#4ade80);',
            'border-radius:3px;transition:width 0.6s;box-shadow:0 0 6px rgba(57,211,83,0.5)"></div>',
        '</div>',

        // Day checkmarks
        '<div style="display:flex;gap:4px;margin-bottom:12px">',
    ].join('');

    for (var i = 1; i <= 7; i++) {
      var filled = i <= day;
      var current = i === day + 1;
      html += '<div style="flex:1;height:4px;border-radius:2px;background:' +
        (filled ? '#39d353' : (current ? 'rgba(57,211,83,0.3)' : '#1e1e2e')) + '"></div>';
    }

    html += '</div>';

    // Today status
    html += '<div style="background:#0a0a0f;border:1px solid ' + (todayLogged ? 'rgba(57,211,83,0.3)' : 'rgba(251,191,36,0.3)') + ';' +
      'border-radius:3px;padding:8px 12px;margin-bottom:10px;font-size:13px">' +
      (todayLogged
        ? '<span style="color:#39d353">✅ Today\'s entry: Logged</span>'
        : '<span style="color:#fbbf24">⚠️ Pending — log a transaction before midnight</span>') +
      '</div>';

    // Motivational message
    if (msg) {
      html += '<div style="font-size:13px;color:#7a7a9a;font-style:italic;text-align:center;margin-bottom:8px">"' + msg + '"</div>';
    }

    html += '</div>'; // close padding div

    container.innerHTML = '<div style="height:2px;background:linear-gradient(90deg,transparent,#39d353,transparent)"></div>' + html;
    container.style.display = '';

    // Start live countdown refresh (update display every 30 seconds)
    if (_auditRefreshTimer) clearInterval(_auditRefreshTimer);
    _auditRefreshTimer = setInterval(function() {
      if (!_lastAuditData) return;
      var el = document.getElementById('pz-audit-time-display');
      if (!el) { clearInterval(_auditRefreshTimer); return; }
      var r = calcRemaining(_lastAuditData);
      el.textContent = r.hours + 'h ' + r.minutes + 'm remaining';
    }, 30000); // Update every 30 seconds
  }

  function renderLockoutBanner(data) {
    var container = getOrCreateContainer();
    var until = data.audit_lockout_until ? new Date(data.audit_lockout_until) : null;
    var attempts = parseInt(data.audit_attempts) || 1;
    var unlockStr = until ? until.toLocaleDateString('en-US', { month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' }) : 'Soon';

    var msg;
    if (attempts === 1) {
      msg = 'Your audit has been reset. You missed a day. The protocol requires consistency. Begin again when ready.';
    } else if (attempts === 2) {
      msg = '48-hour cooldown active. Prepare yourself and return.';
    } else {
      msg = 'The architecture rewards discipline. Take this week to prepare, then return.';
    }

    container.innerHTML = [
      '<div style="height:2px;background:linear-gradient(90deg,transparent,#ff4444,transparent)"></div>',
      '<div style="padding:14px 16px">',
        '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">',
          '<span style="font-size:12px;letter-spacing:0.15em;text-transform:uppercase;color:#ff4444;font-family:\'Share Tech Mono\',monospace">AUDIT LOCKED</span>',
        '</div>',
        '<div style="font-size:13px;color:#b0b0c8;line-height:1.5;margin-bottom:10px">', msg, '</div>',
        '<div style="font-family:\'Share Tech Mono\',monospace;font-size:11px;color:#7a7a9a">',
          'Unlocks: ', unlockStr,
        '</div>',
      '</div>'
    ].join('');
    container.style.borderColor = 'rgba(255,68,68,0.4)';
    container.style.display = '';
  }

  function renderCompletedBadge() {
    var container = getOrCreateContainer();
    container.innerHTML = [
      '<div style="height:2px;background:linear-gradient(90deg,transparent,#d4af37,transparent)"></div>',
      '<div style="padding:14px 16px;text-align:center">',
        '<div style="font-size:28px;margin-bottom:6px">🎖️</div>',
        '<div style="font-size:14px;letter-spacing:0.1em;color:#d4af37;text-transform:uppercase;font-weight:700">VERIFIED</div>',
        '<div style="font-size:12px;color:#7a7a9a;margin-top:4px">168-Hour Audit Complete</div>',
      '</div>'
    ].join('');
    container.style.borderColor = 'rgba(212,175,55,0.4)';
    container.style.display = '';
    // Auto-hide after 8 seconds
    setTimeout(function() { container.style.display = 'none'; }, 8000);
  }

  // Load fonts if not already loaded
  if (!document.querySelector('link[href*="Share+Tech+Mono"]')) {
    var link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/css2?family=Share+Tech+Mono&family=Rajdhani:wght@400;600;700&display=swap';
    document.head.appendChild(link);
  }

  // Initialize after DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    // Small delay to let app initialize first
    setTimeout(init, 1500);
  }
})();
