// --- CROSS-DEVICE INACTIVITY MANAGER WITH 60S WARNING ---
// Session-cookie auth (FACTS). GET /api/user/preferences → { inactivityTimeout }.
// While the warning modal is open, activity is ignored — user must click Stay Logged In.

(function () {
  if (window.__FACTS_INACTIVITY_MANAGED) return;
  window.__FACTS_INACTIVITY_MANAGED = true;

  var idleTimer = null;
  var warningTimer = null;
  var countdownInterval = null;
  var heartbeatInterval = null;
  var timeoutMinutes = 30; // Default fallback
  var lastActivityTimestamp = Date.now();
  var WARNING_TIME_MS = 60000;
  var HEARTBEAT_INTERVAL_MS = 30000;
  var activityEvents = [
    'mousedown',
    'mousemove',
    'keypress',
    'keydown',
    'scroll',
    'touchstart',
    'click'
  ];
  var listenersBound = false;
  var sessionArmed = false;
  var armInFlight = null;

  function applyPreferencePayload(data) {
    if (!data) return false;
    if (data.inactivityTimeout != null) {
      timeoutMinutes = parseInt(data.inactivityTimeout, 10) || timeoutMinutes;
      return true;
    }
    if (data.inactivity_timeout != null) {
      timeoutMinutes = parseInt(data.inactivity_timeout, 10) || timeoutMinutes;
      return true;
    }
    if (data.timeout_minutes != null) {
      timeoutMinutes = parseInt(data.timeout_minutes, 10) || timeoutMinutes;
      return true;
    }
    return true;
  }

  function fetchUserTimeoutPreference() {
    return fetch('/api/user/preferences', { credentials: 'same-origin' })
      .then(function (response) {
        if (response.ok) return response.json().then(applyPreferencePayload);
        if (response.status === 401) return null;
        return fetch('/api/user/timeout-preference', { credentials: 'same-origin' }).then(
          function (legacy) {
            if (!legacy.ok) {
              if (legacy.status === 401) return null;
              throw new Error('timeout preference ' + legacy.status);
            }
            return legacy.json().then(applyPreferencePayload);
          }
        );
      })
      .catch(function () {
        console.warn(
          'Failed to load timeout preference, using default:',
          timeoutMinutes
        );
        return true;
      });
  }

  function logoutUser() {
    stopAllTimers();
    if (typeof window.factsLogout === 'function') {
      window.factsLogout('/login.html?reason=idle');
      return;
    }
    try {
      localStorage.removeItem('token');
      localStorage.removeItem('_facts_last_activity');
    } catch (e) { /* ignore */ }
    try {
      sessionStorage.clear();
    } catch (e) { /* ignore */ }
    fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' }).catch(
      function () { /* ignore */ }
    );
    window.location.href = '/login.html?reason=idle';
  }

  function stopAllTimers() {
    clearTimeout(idleTimer);
    clearTimeout(warningTimer);
    clearInterval(countdownInterval);
    clearInterval(heartbeatInterval);
    idleTimer = warningTimer = countdownInterval = heartbeatInterval = null;
  }

  function getWarningModal() {
    return (
      document.getElementById('inactivity-modal') ||
      document.getElementById('logout-warning-modal')
    );
  }

  function isWarningVisible() {
    var modal = getWarningModal();
    return !!(modal && modal.style.display === 'flex');
  }

  function updateCountdownDisplay(seconds) {
    var display =
      document.getElementById('idle-countdown') ||
      document.getElementById('logout-countdown');
    if (display) display.textContent = String(seconds);
  }

  function showWarningModal() {
    var modal = getWarningModal();
    if (!modal) {
      logoutUser();
      return;
    }
    modal.style.display = 'flex';
    var secondsLeft = 60;
    updateCountdownDisplay(secondsLeft);
    clearInterval(countdownInterval);
    countdownInterval = setInterval(function () {
      secondsLeft -= 1;
      updateCountdownDisplay(secondsLeft);
      if (secondsLeft <= 0) {
        clearInterval(countdownInterval);
        countdownInterval = null;
        logoutUser();
      }
    }, 1000);
  }

  function hideWarningModal() {
    var primary = document.getElementById('inactivity-modal');
    var legacy = document.getElementById('logout-warning-modal');
    if (primary) primary.style.display = 'none';
    if (legacy) legacy.style.display = 'none';
    clearInterval(countdownInterval);
    countdownInterval = null;
  }

  function resetTimers() {
    clearTimeout(idleTimer);
    clearTimeout(warningTimer);
    hideWarningModal();

    lastActivityTimestamp = Date.now();
    try {
      localStorage.setItem('_facts_last_activity', String(lastActivityTimestamp));
    } catch (e) { /* ignore */ }

    var totalMs = timeoutMinutes * 60 * 1000;
    var warningMs = Math.max(totalMs - WARNING_TIME_MS, 0);

    // If timeout is under 1 minute, skip warning and hard-logout at timeout
    if (warningMs === 0) {
      idleTimer = setTimeout(logoutUser, totalMs);
      return;
    }

    warningTimer = setTimeout(showWarningModal, warningMs);
    idleTimer = setTimeout(logoutUser, totalMs);
  }

  function checkElapsedInactivity() {
    if (isWarningVisible()) return;

    var effectiveTimestamp = lastActivityTimestamp;
    try {
      var stored = parseInt(localStorage.getItem('_facts_last_activity'), 10);
      if (stored && stored > 0 && stored < effectiveTimestamp) {
        effectiveTimestamp = stored;
      }
    } catch (e) { /* ignore */ }

    var elapsedMs = Date.now() - effectiveTimestamp;
    var totalMs = timeoutMinutes * 60 * 1000;
    var warningMs = Math.max(totalMs - WARNING_TIME_MS, 0);

    if (elapsedMs >= totalMs) {
      logoutUser();
    } else if (getWarningModal() && warningMs > 0 && elapsedMs >= warningMs) {
      showWarningModal();
    }
  }

  function handleUserActivity() {
    // Force the Stay Logged In button while the warning is open
    if (isWarningVisible()) return;

    lastActivityTimestamp = Date.now();
    try {
      localStorage.setItem('_facts_last_activity', String(lastActivityTimestamp));
    } catch (e) { /* ignore */ }
    resetTimers();
  }

  function initListeners() {
    activityEvents.forEach(function (event) {
      window.addEventListener(event, handleUserActivity, { passive: true });
    });
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible') checkElapsedInactivity();
    });
    window.addEventListener('focus', checkElapsedInactivity);
    window.addEventListener('pageshow', checkElapsedInactivity);
    heartbeatInterval = setInterval(checkElapsedInactivity, HEARTBEAT_INTERVAL_MS);

    var stayBtn = document.getElementById('stay-logged-in-btn');
    if (stayBtn && !stayBtn.__factsIdleBound) {
      stayBtn.__factsIdleBound = true;
      stayBtn.addEventListener('click', function () {
        resetTimers();
      });
    }
  }

  function stayLoggedIn() {
    resetTimers();
  }

  function ensureArmed() {
    if (sessionArmed) {
      resetTimers();
      return Promise.resolve(true);
    }
    if (armInFlight) return armInFlight;
    armInFlight = fetch('/api/auth/me', { credentials: 'same-origin' })
      .then(function (r) {
        return r.ok ? fetchUserTimeoutPreference() : Promise.resolve(false);
      })
      .then(function (ok) {
        armInFlight = null;
        if (!ok) return false;
        sessionArmed = true;
        if (!listenersBound) {
          initListeners();
          listenersBound = true;
        }
        resetTimers();
        return true;
      })
      .catch(function () {
        armInFlight = null;
        return false;
      });
    return armInFlight;
  }

  window.FactsInactivityLogout = {
    reset: resetTimers,
    stayLoggedIn: stayLoggedIn,
    logoutNow: logoutUser,
    ensureArmed: ensureArmed,
    getTimeoutMinutes: function () {
      return timeoutMinutes;
    },
    setTimeoutMinutes: function (mins) {
      timeoutMinutes = parseInt(mins, 10) || timeoutMinutes;
      if (sessionArmed) resetTimers();
    }
  };

  document.addEventListener('click', function (e) {
    var t = e.target;
    if (!t) return;
    if (
      t.id === 'stay-logged-in-btn' ||
      (t.closest && t.closest('#stay-logged-in-btn')) ||
      t.id === 'logout-stay-btn' ||
      (t.closest && t.closest('#logout-stay-btn'))
    ) {
      stayLoggedIn();
    }
    if (t.id === 'logout-now-btn' || (t.closest && t.closest('#logout-now-btn'))) {
      logoutUser();
    }
  });

  function start() {
    ensureArmed();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
