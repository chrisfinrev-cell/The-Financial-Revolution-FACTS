/**
 * FACTS — Report Issue Widget
 *
 * Injects a fixed "Report Issue" button (bottom-left) on every page.
 * Opens a modal with: Subject, Description, optional Screenshot, auto-filled Page URL.
 * Submissions go to POST /api/support/tickets (requireAuth).
 */

(function () {
  'use strict';

  var WIDGET_ID = 'facts-report-issue-widget';

  // Don't inject on the landing page — button overlaps hero text ("Stop budgeting.")
  var path = window.location.pathname.replace(/\/$/, '');
  if (path === '' || path === '/index' || path === '/') return;

  // Don't inject twice
  if (document.getElementById(WIDGET_ID)) return;

  // ─── Styles ──────────────────────────────────────────────────────────────────
  var style = document.createElement('style');
  style.textContent = [
    '#facts-report-btn {',
    '  position: fixed;',
    '  bottom: 24px;',
    '  left: 20px;',
    '  z-index: 9000;',
    '  display: flex;',
    '  align-items: center;',
    '  gap: 6px;',
    '  background: #1a1b23;',
    '  border: 1px solid #3f3f46;',
    '  color: #a1a1aa;',
    '  font-size: 12px;',
    '  font-weight: 500;',
    '  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;',
    '  padding: 6px 12px;',
    '  border-radius: 20px;',
    '  cursor: pointer;',
    '  transition: all .2s;',
    '  box-shadow: 0 2px 8px rgba(0,0,0,.4);',
    '}',
    /* WHY: button overlaps hero text on small screens — hide under 768px */
    '@media (max-width: 768px) {',
    '  #facts-report-btn { display: none !important; }',
    '}',
    '#facts-report-btn:hover { border-color: #ef4444; color: #ef4444; }',
    '#facts-report-overlay {',
    '  position: fixed; inset: 0;',
    '  background: rgba(0,0,0,.75);',
    '  z-index: 9500;',
    '  display: none;',
    '  align-items: center;',
    '  justify-content: center;',
    '}',
    '#facts-report-overlay.visible { display: flex; }',
    '#facts-report-modal {',
    '  background: #1a1b23;',
    '  border: 1px solid #3f3f46;',
    '  border-radius: 16px;',
    '  padding: 24px;',
    '  max-width: 520px;',
    '  width: 92%;',
    '  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;',
    '}',
    '#facts-report-modal h3 {',
    '  font-size: 17px; font-weight: 700;',
    '  color: #fff; margin: 0 0 4px;',
    '}',
    '#facts-report-modal p.sub {',
    '  font-size: 12px; color: #52525b; margin: 0 0 20px;',
    '}',
    '#facts-report-modal label {',
    '  display: block; font-size: 12px;',
    '  color: #71717a; font-weight: 500;',
    '  margin-bottom: 5px;',
    '}',
    '#facts-report-modal input,',
    '#facts-report-modal textarea,',
    '#facts-report-modal select {',
    '  width: 100%; background: #27272a;',
    '  border: 1px solid #3f3f46; color: #e4e4e7;',
    '  padding: 9px 12px; border-radius: 8px;',
    '  font-size: 13px; outline: none;',
    '  box-sizing: border-box; margin-bottom: 14px;',
    '}',
    '#facts-report-modal input:focus,',
    '#facts-report-modal textarea:focus { border-color: #ef4444; }',
    '#facts-report-modal textarea { resize: vertical; min-height: 100px; }',
    '#facts-report-modal .modal-actions {',
    '  display: flex; gap: 8px;',
    '  justify-content: flex-end; margin-top: 8px;',
    '}',
    '#facts-report-modal .btn-cancel {',
    '  background: transparent; border: 1px solid #3f3f46;',
    '  color: #a1a1aa; padding: 8px 16px;',
    '  border-radius: 8px; font-size: 13px;',
    '  cursor: pointer;',
    '}',
    '#facts-report-modal .btn-submit {',
    '  background: #ef4444; border: none;',
    '  color: #fff; padding: 8px 20px;',
    '  border-radius: 8px; font-size: 13px;',
    '  font-weight: 600; cursor: pointer;',
    '  transition: background .15s;',
    '}',
    '#facts-report-modal .btn-submit:hover { background: #dc2626; }',
    '#facts-report-modal .btn-submit:disabled { opacity: .5; cursor: not-allowed; }',
    '#facts-report-status {',
    '  font-size: 13px; text-align: center;',
    '  margin-top: 8px; display: none;',
    '}',
    '#facts-report-status.success { color: #10b981; }',
    '#facts-report-status.error { color: #ef4444; }',
    '#facts-screenshot-label {',
    '  font-size: 12px; color: #52525b;',
    '  display: block; margin-bottom: 14px;',
    '  cursor: pointer; text-decoration: underline;',
    '}',
    '#facts-screenshot-label:hover { color: #a1a1aa; }',
    '#facts-screenshot-preview {',
    '  max-width: 100%; border-radius: 8px;',
    '  border: 1px solid #3f3f46; margin-bottom: 14px;',
    '  display: none;',
    '}'
  ].join('\n');
  document.head.appendChild(style);

  // ─── Button ──────────────────────────────────────────────────────────────────
  var btn = document.createElement('button');
  btn.id = 'facts-report-btn';
  btn.setAttribute('aria-label', 'Report Issue');
  btn.innerHTML = '⚑ Report Issue';
  document.body.appendChild(btn);

  // ─── Modal ───────────────────────────────────────────────────────────────────
  var overlay = document.createElement('div');
  overlay.id = 'facts-report-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.innerHTML = [
    '<div id="facts-report-modal">',
    '  <h3>Report an Issue</h3>',
    '  <p class="sub">We\'ll look into this. No personal financial data is shared.</p>',
    '  <label for="facts-report-subject">Subject *</label>',
    '  <input id="facts-report-subject" type="text" placeholder="Brief description of the issue" maxlength="255" />',
    '  <label for="facts-report-desc">Description *</label>',
    '  <textarea id="facts-report-desc" placeholder="What happened? What did you expect?" maxlength="5000"></textarea>',
    '  <label id="facts-screenshot-label" for="facts-screenshot-file">',
    '    📎 Attach screenshot (optional, images only, max 5 MB)',
    '  </label>',
    '  <input id="facts-screenshot-file" type="file" accept="image/*" style="display:none;" />',
    '  <img id="facts-screenshot-preview" alt="Screenshot preview" />',
    '  <div class="modal-actions">',
    '    <button class="btn-cancel" id="facts-report-cancel">Cancel</button>',
    '    <button class="btn-submit" id="facts-report-submit">Submit</button>',
    '  </div>',
    '  <div id="facts-report-status"></div>',
    '</div>'
  ].join('');
  document.body.appendChild(overlay);

  // ─── Logic ───────────────────────────────────────────────────────────────────
  var fileInput = document.getElementById('facts-screenshot-file');
  var preview = document.getElementById('facts-screenshot-preview');

  fileInput.addEventListener('change', function () {
    var file = this.files[0];
    if (!file) { preview.style.display = 'none'; return; }
    var reader = new FileReader();
    reader.onload = function (e) {
      preview.src = e.target.result;
      preview.style.display = 'block';
    };
    reader.readAsDataURL(file);
  });

  btn.addEventListener('click', function () {
    // Reset
    document.getElementById('facts-report-subject').value = '';
    document.getElementById('facts-report-desc').value = '';
    fileInput.value = '';
    preview.src = '';
    preview.style.display = 'none';
    setStatus('', '');
    overlay.classList.add('visible');
    document.getElementById('facts-report-subject').focus();
  });

  document.getElementById('facts-report-cancel').addEventListener('click', closeModal);

  overlay.addEventListener('click', function (e) {
    if (e.target === overlay) closeModal();
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closeModal();
  });

  function closeModal() {
    overlay.classList.remove('visible');
  }

  function setStatus(msg, type) {
    var el = document.getElementById('facts-report-status');
    el.textContent = msg;
    el.className = msg ? type : '';
    el.style.display = msg ? 'block' : 'none';
  }

  document.getElementById('facts-report-submit').addEventListener('click', async function () {
    var subject = document.getElementById('facts-report-subject').value.trim();
    var desc = document.getElementById('facts-report-desc').value.trim();
    var file = fileInput.files[0] || null;

    if (!subject) { setStatus('Subject is required', 'error'); return; }
    if (!desc) { setStatus('Description is required', 'error'); return; }

    var submitBtn = document.getElementById('facts-report-submit');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Submitting…';
    setStatus('', '');

    try {
      var formData = new FormData();
      formData.append('subject', subject);
      formData.append('description', desc);
      formData.append('page_url', window.location.href);
      if (file) formData.append('screenshot', file);

      var res = await fetch('/api/support/tickets', {
        method: 'POST',
        body: formData
        // Note: Do NOT set Content-Type — browser sets it with correct boundary for FormData
      });

      var data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Submission failed');

      setStatus('✓ Report submitted! Thank you — we\'ll look into it.', 'success');
      submitBtn.style.display = 'none';
      setTimeout(closeModal, 2500);
    } catch (err) {
      setStatus('Error: ' + err.message, 'error');
      submitBtn.disabled = false;
      submitBtn.textContent = 'Submit';
    }
  });

  // Reset submit button on modal close
  var origClose = closeModal;
  closeModal = function () {
    var submitBtn = document.getElementById('facts-report-submit');
    submitBtn.disabled = false;
    submitBtn.style.display = '';
    submitBtn.textContent = 'Submit';
    origClose();
  };

}());
