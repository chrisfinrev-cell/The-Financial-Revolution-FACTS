'use strict';

const fs = require('fs');
const path = require('path');

function replaceAll(s, pairs) {
  for (const [a, b] of pairs) {
    if (!s.includes(a)) {
      console.warn('  miss:', JSON.stringify(a).slice(0, 80));
    }
    s = s.split(a).join(b);
  }
  return s;
}

function patchJuniorParent() {
  const p = path.join(__dirname, '..', 'public', 'junior-parent.html');
  let s = fs.readFileSync(p, 'utf8');
  s = replaceAll(s, [
    ['+ Add Kid Profile', '+ Add Child Profile'],
    ['+ Add Kid', '+ Add Child'],
    ['Create kid profiles', 'Create child profiles'],
    ['Select Kid', 'Select Child'],
    ['— choose kid —', '— choose child —'],
    ["Kid's Name", "Child's Name"],
    ['send this to your kid', 'send this to your child'],
    ['Select a kid first', 'Select a child first'],
    ['for your kids to discover', 'for your children to discover'],
    ['.kid-card', '.child-card'],
    ['kid-card', 'child-card'],
    ['no-kids', 'no-children'],
    ['kids-grid', 'children-grid'],
    ['mission-kid-select', 'mission-child-select'],
    ['add-kid-modal', 'add-child-modal'],
    ['new-kid-name', 'new-child-name'],
    ['kid-detail-modal', 'child-detail-modal'],
    ['openAddKid', 'openAddChild'],
    ['closeAddKid', 'closeAddChild'],
    ['createKid', 'createChild'],
    ['openKidDetail', 'openChildDetail'],
    ['closeKidDetail', 'closeChildDetail'],
    ['deleteKidConfirm', 'deleteChildConfirm'],
    ['selectedKidId', 'selectedChildId'],
    ['kdDetailKid', 'kdDetailChild'],
    ['renderKidSelects', 'renderChildSelects'],
    ['familyData = data.kids', 'familyData = data.children || data.kids'],
    ['${escHtml(m.kid_name)}', '${escHtml(m.child_name || m.kid_name)}'],
    ['kid_id', 'child_id']
  ]);
  // Comment cleanup
  s = s.replace(/\/\* Kid card \*\//g, '/* Child card */');
  s = s.replace(/\/\/ ── Kid Profile CRUD/g, '// ── Child Profile CRUD');
  fs.writeFileSync(p, s);
  console.log('updated junior-parent.html');
}

function patchJuniorCommand() {
  const p = path.join(__dirname, '..', 'public', 'junior-command.html');
  let s = fs.readFileSync(p, 'utf8');
  s = replaceAll(s, [
    [
      "const KID_ID  = params.get('kid') || params.get('kid_id');",
      "const CHILD_ID = params.get('child') || params.get('child_id') || params.get('kid') || params.get('kid_id');"
    ],
    ['let kidData   = null;', 'let childData = null;'],
    [
      'const res  = await fetch(`/api/junior/kid-dashboard?kid_id=${KID_ID}&code=${encodeURIComponent(CODE)}`);',
      'const res  = await fetch(`/api/junior/child-dashboard?child_id=${CHILD_ID}&code=${encodeURIComponent(CODE)}`);'
    ],
    ['kidData    = allData.kid;', 'childData  = allData.child || allData.kid;'],
    ['prevLevel  = kidData.level;', 'prevLevel  = childData.level;'],
    ['const k = kidData;', 'const k = childData;'],
    ['kid_id: KID_ID', 'child_id: CHILD_ID'],
    ['kidData.level', 'childData.level'],
    [
      'const res  = await fetch(`/api/junior/vault-entry/${entryId}?kid_id=${KID_ID}&code=${encodeURIComponent(CODE)}`);',
      'const res  = await fetch(`/api/junior/vault-entry/${entryId}?child_id=${CHILD_ID}&code=${encodeURIComponent(CODE)}`);'
    ]
  ]);
  // Guard missing id
  if (!s.includes('CHILD_ID')) {
    console.warn('junior-command: CHILD_ID not injected');
  }
  fs.writeFileSync(p, s);
  console.log('updated junior-command.html');
}

function patchAppHtml() {
  const p = path.join(__dirname, '..', 'public', 'app.html');
  let s = fs.readFileSync(p, 'utf8');
  s = replaceAll(s, [
    ["track your kids' progress", "track your children's progress"],
    ['Teach kids financial literacy', 'Teach children financial literacy']
  ]);
  fs.writeFileSync(p, s);
  console.log('updated app.html');
}

function patchPresentation() {
  const p = path.join(__dirname, '..', 'public', 'presentation-user-guide.html');
  if (!fs.existsSync(p)) return;
  let s = fs.readFileSync(p, 'utf8');
  s = s.split('house purchase, kids.').join('house purchase, children.');
  fs.writeFileSync(p, s);
  console.log('updated presentation-user-guide.html');
}

function patchServerJunior() {
  const p = path.join(__dirname, '..', 'server.js');
  let s = fs.readFileSync(p, 'utf8');
  const start = s.indexOf('//  JUNIOR REVOLUTIONARIES');
  if (start < 0) throw new Error('junior block not found');
  // Find a reasonable end — next major section after junior routes.
  // We'll patch with targeted replaces across the junior area only by using unique strings.

  s = replaceAll(s, [
    [
      '//  JUNIOR REVOLUTIONARIES — Kid Command Console, Missions & Family Panel',
      '//  JUNIOR REVOLUTIONARIES — Child Command Console, Missions & Family Panel'
    ],
    [
      "`${appUrl}/junior-command?kid=${r.rows[0].id}&code=${code}`",
      "`${appUrl}/junior-command?child=${r.rows[0].id}&code=${code}`"
    ],
    [
      '`${appUrl}/junior-command?kid=${k.id}&code=${k.access_code}`',
      '`${appUrl}/junior-command?child=${k.id}&code=${k.access_code}`'
    ],
    ["res.json({ kids: result });", "res.json({ children: result, kids: result });"],
    ['jp.name AS kid_name', 'jp.name AS child_name, jp.name AS kid_name'],
    [
      "const { kid_id, title, description, xp_reward = 50, mission_type = 'real_world' } = req.body;\n    if (!kid_id || !title?.trim()) return res.status(400).json({ error: 'kid_id and title required' });\n    const kid = (await pool.query('SELECT id FROM junior_profiles WHERE id = $1 AND parent_user_id = $2', [kid_id, req.userId])).rows[0];\n    if (!kid) return res.status(404).json({ error: 'Kid profile not found' });",
      "const child_id = req.body.child_id || req.body.kid_id;\n    const { title, description, xp_reward = 50, mission_type = 'real_world' } = req.body;\n    if (!child_id || !title?.trim()) return res.status(400).json({ error: 'child_id and title required' });\n    const child = (await pool.query('SELECT id FROM junior_profiles WHERE id = $1 AND parent_user_id = $2', [child_id, req.userId])).rows[0];\n    if (!child) return res.status(404).json({ error: 'Child profile not found' });"
    ],
    [
      "[kid_id, req.userId, title.trim(), description || null, parseInt(xp_reward) || 50, mission_type]",
      "[child_id, req.userId, title.trim(), description || null, parseInt(xp_reward) || 50, mission_type]"
    ],
    ['// GET /api/junior/profiles — list parent\'s kids', '// GET /api/junior/profiles — list parent\'s children'],
    ['// POST /api/junior/profiles — create kid profile', '// POST /api/junior/profiles — create child profile'],
    ['// PUT /api/junior/profiles/:id — update kid profile', '// PUT /api/junior/profiles/:id — update child profile'],
    ['// DELETE /api/junior/profiles/:id — delete kid profile', '// DELETE /api/junior/profiles/:id — delete child profile'],
    ['// POST /api/junior/missions — assign mission to kid', '// POST /api/junior/missions — assign mission to child'],
    ['// GET /api/junior/vault-entry/:id — kid reads unlocked vault entry', '// GET /api/junior/vault-entry/:id — child reads unlocked vault entry'],
    ['// POST /api/junior/missions/:id/request-confirm — kid requests parent confirmation', '// POST /api/junior/missions/:id/request-confirm — child requests parent confirmation']
  ]);

  // kid-dashboard handler: accept child_id and dual response
  s = s.replace(
    `// GET /api/junior/kid-dashboard
app.get('/api/junior/kid-dashboard', async (req, res) => {
  try {
    const { kid_id, code } = req.query;
    if (!kid_id || !code) return res.status(400).json({ error: 'kid_id and code required' });
    const kidRow = (await pool.query('SELECT * FROM junior_profiles WHERE id = $1 AND access_code = $2', [kid_id, code])).rows[0];
    if (!kidRow) return res.status(403).json({ error: 'Invalid access' });
    const lv     = calcJrLevel(kidRow.xp);
    if (lv !== kidRow.level) {
      await pool.query('UPDATE junior_profiles SET level = $1 WHERE id = $2', [lv, kid_id]);
      kidRow.level = lv;
    }
    const missions  = (await pool.query("SELECT * FROM apprentice_missions WHERE kid_id = $1 ORDER BY created_at DESC", [kid_id])).rows;
    const badges    = (await pool.query('SELECT * FROM junior_badges WHERE kid_id = $1 ORDER BY earned_at ASC', [kid_id])).rows;`,
    `// GET /api/junior/child-dashboard (alias: /kid-dashboard)
async function juniorChildDashboard(req, res) {
  try {
    const child_id = req.query.child_id || req.query.kid_id || req.query.child || req.query.kid;
    const { code } = req.query;
    if (!child_id || !code) return res.status(400).json({ error: 'child_id and code required' });
    const kidRow = (await pool.query('SELECT * FROM junior_profiles WHERE id = $1 AND access_code = $2', [child_id, code])).rows[0];
    if (!kidRow) return res.status(403).json({ error: 'Invalid access' });
    const lv     = calcJrLevel(kidRow.xp);
    if (lv !== kidRow.level) {
      await pool.query('UPDATE junior_profiles SET level = $1 WHERE id = $2', [lv, child_id]);
      kidRow.level = lv;
    }
    const missions  = (await pool.query("SELECT * FROM apprentice_missions WHERE kid_id = $1 ORDER BY created_at DESC", [child_id])).rows;
    const badges    = (await pool.query('SELECT * FROM junior_badges WHERE kid_id = $1 ORDER BY earned_at ASC', [child_id])).rows;`
  );

  s = s.replace(
    `      kid: { ...kidRow, level: lv, level_name: JR_LEVEL_NAMES[lv], level_emoji: JR_LEVEL_EMOJIS[lv], fortress_name: JR_FORTRESS_NAMES[lv], next_xp: xpToNextLevel(kidRow.xp, lv) },`,
    `      child: { ...kidRow, level: lv, level_name: JR_LEVEL_NAMES[lv], level_emoji: JR_LEVEL_EMOJIS[lv], fortress_name: JR_FORTRESS_NAMES[lv], next_xp: xpToNextLevel(kidRow.xp, lv) },
      kid: { ...kidRow, level: lv, level_name: JR_LEVEL_NAMES[lv], level_emoji: JR_LEVEL_EMOJIS[lv], fortress_name: JR_FORTRESS_NAMES[lv], next_xp: xpToNextLevel(kidRow.xp, lv) },`
  );

  s = s.replace(
    `    console.error('[Junior] GET kid-dashboard:', err.message);
    res.status(500).json({ error: 'Failed to load dashboard' });
  }
});`,
    `    console.error('[Junior] GET child-dashboard:', err.message);
    res.status(500).json({ error: 'Failed to load dashboard' });
  }
}
app.get('/api/junior/child-dashboard', juniorChildDashboard);
app.get('/api/junior/kid-dashboard', juniorChildDashboard);`
  );

  // vault-entry + request-confirm accept child_id
  s = s.replace(
    `    const { kid_id, code } = req.query;
    const kidRow = (await pool.query('SELECT * FROM junior_profiles WHERE id = $1 AND access_code = $2', [kid_id, code])).rows[0];
    if (!kidRow) return res.status(403).json({ error: 'Invalid access' });
    const lv = calcJrLevel(kidRow.xp);`,
    `    const child_id = req.query.child_id || req.query.kid_id || req.query.child || req.query.kid;
    const { code } = req.query;
    const kidRow = (await pool.query('SELECT * FROM junior_profiles WHERE id = $1 AND access_code = $2', [child_id, code])).rows[0];
    if (!kidRow) return res.status(403).json({ error: 'Invalid access' });
    const lv = calcJrLevel(kidRow.xp);`
  );

  s = s.replace(
    `    const { kid_id, code } = req.body;
    if (!kid_id || !code) return res.status(400).json({ error: 'kid_id and code required' });
    const kidRow = (await pool.query('SELECT * FROM junior_profiles WHERE id = $1 AND access_code = $2', [kid_id, code])).rows[0];
    if (!kidRow) return res.status(403).json({ error: 'Invalid access' });
    const mission = (await pool.query(
      "SELECT * FROM apprentice_missions WHERE id = $1 AND kid_id = $2 AND status = 'active'",
      [req.params.id, kid_id]
    )).rows[0];`,
    `    const child_id = req.body.child_id || req.body.kid_id;
    const { code } = req.body;
    if (!child_id || !code) return res.status(400).json({ error: 'child_id and code required' });
    const kidRow = (await pool.query('SELECT * FROM junior_profiles WHERE id = $1 AND access_code = $2', [child_id, code])).rows[0];
    if (!kidRow) return res.status(403).json({ error: 'Invalid access' });
    const mission = (await pool.query(
      "SELECT * FROM apprentice_missions WHERE id = $1 AND kid_id = $2 AND status = 'active'",
      [req.params.id, child_id]
    )).rows[0];`
  );

  fs.writeFileSync(p, s);
  console.log('updated server.js junior routes');
}

patchJuniorParent();
patchJuniorCommand();
patchAppHtml();
patchPresentation();
patchServerJunior();
console.log('done');
