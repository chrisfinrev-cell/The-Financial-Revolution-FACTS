'use strict';

/**
 * Rename affiliate program "Future Generations" → "Freedom Engine".
 * Junior Revolutionaries / family command pages are intentionally excluded.
 *
 * Usage: node scripts/rename-future-gen-to-freedom-engine.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

/** Full URL + brand sweep (HTML / client JS / emails) */
const UI_FILES = [
  'public/freedom-engine.html',
  'public/freedom-engine-dashboard.html',
  'public/affiliate-dashboard.html',
  'public/affiliate-heartbeat.html',
  'public/discovery-scan.html',
  'public/sovereign-oath.html',
  'public/sovereign-dashboard.html',
  'public/succession-sign.html',
  'public/settings.html',
  'public/admin.html',
  'public/app.html',
  'public/presentation-investor.html',
  'public/tfr/programs.html',
  'public/tfr/catalog.js',
  'public/facts-nav.js',
  'public/nav-bar.js',
  'jobs/affiliate-jobs.js',
  'jobs/heartbeat-compliance.js',
];

/** Brand copy only — do not rename JS identifiers / router exports */
const COPY_ONLY_FILES = [
  'routes/admin.js',
  'routes/adminDashboard.js',
  'lib/relationshipTags.js',
  'modules/mod_gamification/index.js',
  'lib/privateCache.js',
];

const URL_AND_BRAND = [
  [/\/future-generations\/dashboard/g, '/freedom-engine/dashboard'],
  [/\/future-generations\/sovereign/g, '/freedom-engine/sovereign'],
  [/\/api\/future-generations/g, '/api/freedom-engine'],
  [/\/future-generations\.html/g, '/freedom-engine.html'],
  [/href=["']\/future-generations["']/g, 'href="/freedom-engine"'],
  [/href=["']\/future-generations\//g, 'href="/freedom-engine/'],
  [/window\.location\.href\s*=\s*['"]\/future-generations/g, "window.location.href = '/freedom-engine"],
  [/location\.href\s*=\s*['"]\/future-generations/g, "location.href = '/freedom-engine"],
  [/['"]\/future-generations['"]/g, "'/freedom-engine'"],
  [/future-generations-dashboard\.html/g, 'freedom-engine-dashboard.html'],
  [/future-generations\.html/g, 'freedom-engine.html'],
  [/tab-future-generations/g, 'tab-freedom-engine'],
  [/data-tab=["']future-generations["']/g, 'data-tab="freedom-engine"'],
  [/switchTab\(['"]future-generations['"]\)/g, "switchTab('freedom-engine')"],
  [/id=["']tab-future-generations["']/g, 'id="tab-freedom-engine"'],
  [/loadFutureGenerations/g, 'loadFreedomEngine'],
];

const BRAND_COPY = [
  [/Future Generations Program/g, 'The Freedom Engine'],
  [/Future Generations Family Legacy Program/g, 'The Freedom Engine Family Legacy Program'],
  [/Future Generations \(Affiliate\)/g, 'The Freedom Engine (Affiliate)'],
  [/FG Affiliate Dashboard/g, 'Freedom Engine Dashboard'],
  [/FG Command Center/g, 'Freedom Engine Command Center'],
  [/Welcome to Future Generations/g, 'Welcome to The Freedom Engine'],
  [/join Future Generations/g, 'join The Freedom Engine'],
  [/Join Future Generations/g, 'Join The Freedom Engine'],
  [/Already a member of Future Generations/g, 'Already a member of The Freedom Engine'],
  [/already a Future Generations member/g, 'already a Freedom Engine member'],
  [/in Future Generations/g, 'in The Freedom Engine'],
  [/to Future Generations/g, 'to The Freedom Engine'],
  [/of Future Generations/g, 'of The Freedom Engine'],
  [/for Future Generations/g, 'for The Freedom Engine'],
  [/a Future Generations/g, 'a Freedom Engine'],
  [/the Future Generations/g, 'The Freedom Engine'],
  [/The Future Generations/g, 'The Freedom Engine'],
  [/Future Generations/g, 'The Freedom Engine'],
  [/Future Gen\b/g, 'Freedom Engine'],
  [/🌿 Generations/g, '⚙️ Freedom Engine'],
  [/🌿 Future Gen/g, '⚙️ Freedom Engine'],
  [/👥 Future Generations/g, '⚙️ Freedom Engine'],
  [/⚜️ Future Generations/g, '⚙️ Freedom Engine'],
];

function apply(rel, rules) {
  const full = path.join(ROOT, rel);
  if (!fs.existsSync(full)) {
    console.warn('skip missing:', rel);
    return { changed: false, hits: 0 };
  }
  let src = fs.readFileSync(full, 'utf8');
  const before = src;
  let hits = 0;
  for (const [re, to] of rules) {
    const m = src.match(re);
    if (m) {
      hits += m.length;
      src = src.replace(re, to);
    }
  }
  if (src !== before) {
    fs.writeFileSync(full, src, 'utf8');
    console.log('updated', rel, `(~${hits})`);
    return { changed: true, hits };
  }
  console.log('unchanged', rel);
  return { changed: false, hits: 0 };
}

let changedFiles = 0;
let totalHits = 0;

for (const f of UI_FILES) {
  const r = apply(f, [...URL_AND_BRAND, ...BRAND_COPY]);
  if (r.changed) changedFiles += 1;
  totalHits += r.hits;
}

for (const f of COPY_ONLY_FILES) {
  const r = apply(f, BRAND_COPY);
  if (r.changed) changedFiles += 1;
  totalHits += r.hits;
}

// Legacy landing pages → soft redirect HTML so old bookmarks still work
const redirectHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="refresh" content="0;url=/freedom-engine">
  <link rel="canonical" href="/freedom-engine">
  <title>Redirecting to The Freedom Engine…</title>
  <script>location.replace('/freedom-engine' + location.search + location.hash);</script>
</head>
<body style="background:#0d1117;color:#9ca3af;font-family:system-ui;padding:40px;text-align:center;">
  <p>The affiliate program is now <strong style="color:#e8c96a;">The Freedom Engine</strong>.</p>
  <p><a href="/freedom-engine" style="color:#c9a227;">Continue →</a></p>
</body>
</html>
`;

fs.writeFileSync(path.join(ROOT, 'public/future-generations.html'), redirectHtml, 'utf8');
fs.writeFileSync(
  path.join(ROOT, 'public/future-generations-dashboard.html'),
  redirectHtml.replace(/\/freedom-engine/g, '/freedom-engine/dashboard'),
  'utf8'
);
console.log('wrote legacy redirects for /future-generations*');

console.log(`\nDone. ${changedFiles} files, ~${totalHits} replacements.`);
