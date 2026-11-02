/**
 * Beta Feedback Widget (vanilla port of BetaFeedbackWidget)
 * Floating control → POST /api/feedback
 */
(function () {
  'use strict';

  if (window.__FACTS_BETA_FEEDBACK_MOUNTED) return;
  window.__FACTS_BETA_FEEDBACK_MOUNTED = true;

  var STYLE_ID = 'facts-beta-feedback-styles';
  var ROOT_ID = 'facts-beta-feedback-root';

  function ensureSessionId() {
    try {
      var existing = sessionStorage.getItem('beta_session_id');
      if (existing) return existing;
      var id = 'beta_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
      sessionStorage.setItem('beta_session_id', id);
      return id;
    } catch (_) {
      return 'session_anonymous';
    }
  }

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var css = document.createElement('style');
    css.id = STYLE_ID;
    css.textContent = [
      '#' + ROOT_ID + '{position:fixed;bottom:16px;right:16px;z-index:9998;font-family:DM Sans,system-ui,sans-serif;}',
      '#' + ROOT_ID + ' .bfw-btn{background:#4f46e5;color:#fff;border:none;border-radius:999px;padding:10px 16px;',
      'font-size:13px;font-weight:600;cursor:pointer;box-shadow:0 10px 25px rgba(0,0,0,.35);}',
      '#' + ROOT_ID + ' .bfw-btn:hover{background:#4338ca;}',
      '#' + ROOT_ID + ' .bfw-panel{width:320px;max-width:calc(100vw - 32px);background:#0f172a;border:1px solid #1e293b;',
      'border-radius:12px;padding:14px;box-shadow:0 20px 40px rgba(0,0,0,.45);color:#e2e8f0;}',
      '#' + ROOT_ID + ' .bfw-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;}',
      '#' + ROOT_ID + ' .bfw-head h3{margin:0;font-size:13px;font-weight:700;color:#f1f5f9;}',
      '#' + ROOT_ID + ' .bfw-close{background:none;border:none;color:#94a3b8;cursor:pointer;font-size:14px;}',
      '#' + ROOT_ID + ' .bfw-close:hover{color:#e2e8f0;}',
      '#' + ROOT_ID + ' label{display:block;font-size:11px;font-weight:600;color:#94a3b8;margin-bottom:4px;}',
      '#' + ROOT_ID + ' select,#' + ROOT_ID + ' textarea{width:100%;font-size:12px;padding:8px;border-radius:8px;',
      'border:1px solid #334155;background:#1e293b;color:#e2e8f0;box-sizing:border-box;}',
      '#' + ROOT_ID + ' textarea{resize:vertical;min-height:72px;}',
      '#' + ROOT_ID + ' .bfw-field{margin-bottom:10px;}',
      '#' + ROOT_ID + ' .bfw-submit{width:100%;background:#4f46e5;color:#fff;border:none;border-radius:8px;',
      'padding:9px 12px;font-size:12px;font-weight:700;cursor:pointer;}',
      '#' + ROOT_ID + ' .bfw-submit:hover{background:#4338ca;}',
      '#' + ROOT_ID + ' .bfw-submit:disabled{opacity:.5;cursor:default;}',
      '#' + ROOT_ID + ' .bfw-success{color:#34d399;font-size:12px;font-weight:600;text-align:center;padding:18px 8px;}',
      '#' + ROOT_ID + ' .bfw-error{color:#f87171;font-size:11px;margin-top:6px;}'
    ].join('');
    document.head.appendChild(css);
  }

  function mount() {
    if (document.getElementById(ROOT_ID)) return;
    injectStyles();
    ensureSessionId();

    var root = document.createElement('div');
    root.id = ROOT_ID;
    root.innerHTML = '<button type="button" class="bfw-btn" id="bfwOpenBtn" aria-label="Open beta feedback">Beta Feedback</button>';
    document.body.appendChild(root);

    var openBtn = document.getElementById('bfwOpenBtn');
    openBtn.addEventListener('click', function () {
      openPanel(root);
    });
  }

  function openPanel(root) {
    root.innerHTML =
      '<div class="bfw-panel" role="dialog" aria-label="Report Beta Issue">' +
      '  <div class="bfw-head">' +
      '    <h3>Report Beta Issue</h3>' +
      '    <button type="button" class="bfw-close" id="bfwCloseBtn" aria-label="Close">✕</button>' +
      '  </div>' +
      '  <div id="bfwBody">' +
      '    <form id="bfwForm">' +
      '      <div class="bfw-field">' +
      '        <label for="bfwType">Feedback Type</label>' +
      '        <select id="bfwType">' +
      '          <option value="BUG">Bug Report</option>' +
      '          <option value="UI_ISSUE">UI / Visual Issue</option>' +
      '          <option value="FEATURE_SUGGESTION">Feature Suggestion</option>' +
      '          <option value="GENERAL">General Feedback</option>' +
      '        </select>' +
      '      </div>' +
      '      <div class="bfw-field">' +
      '        <label for="bfwDesc">Description</label>' +
      '        <textarea id="bfwDesc" rows="3" required placeholder="Describe what you experienced..."></textarea>' +
      '      </div>' +
      '      <button type="submit" class="bfw-submit" id="bfwSubmit">Submit Feedback</button>' +
      '      <div class="bfw-error" id="bfwError" hidden></div>' +
      '    </form>' +
      '  </div>' +
      '</div>';

    document.getElementById('bfwCloseBtn').addEventListener('click', function () {
      resetLauncher(root);
    });
    document.getElementById('bfwForm').addEventListener('submit', function (e) {
      e.preventDefault();
      submitFeedback(root);
    });
  }

  function resetLauncher(root) {
    root.innerHTML = '<button type="button" class="bfw-btn" id="bfwOpenBtn" aria-label="Open beta feedback">Beta Feedback</button>';
    document.getElementById('bfwOpenBtn').addEventListener('click', function () {
      openPanel(root);
    });
  }

  async function submitFeedback(root) {
    var typeEl = document.getElementById('bfwType');
    var descEl = document.getElementById('bfwDesc');
    var submitBtn = document.getElementById('bfwSubmit');
    var errEl = document.getElementById('bfwError');
    var description = (descEl && descEl.value || '').trim();
    if (!description) return;

    errEl.hidden = true;
    submitBtn.disabled = true;
    submitBtn.textContent = 'Submitting...';

    try {
      var response = await fetch('/api/feedback', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          feedback_type: typeEl.value,
          page_url: window.location.href,
          description: description,
          session_id: ensureSessionId(),
          user_agent: navigator.userAgent
        })
      });
      var data = await response.json().catch(function () { return {}; });
      if (!response.ok) throw new Error(data.error || 'Failed to submit feedback');

      document.getElementById('bfwBody').innerHTML =
        '<p class="bfw-success">Thank you! Your feedback has been recorded.</p>';
      setTimeout(function () { resetLauncher(root); }, 2000);
    } catch (err) {
      errEl.hidden = false;
      errEl.textContent = err.message || 'Network error submitting feedback.';
      submitBtn.disabled = false;
      submitBtn.textContent = 'Submit Feedback';
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount);
  } else {
    mount();
  }
})();
