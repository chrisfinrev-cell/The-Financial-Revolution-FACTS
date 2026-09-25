const fs = require('fs');
const html = fs.readFileSync('./public/app.html', 'utf8');
const scriptRegex = /<script[^>]*>([\s\S]*?)<\/script>/gi;
let match;
let errors = [];
let idx = 0;
while ((match = scriptRegex.exec(html)) !== null) {
  idx++;
  const code = match[1];
  if (!code.trim()) continue;
  try {
    new Function(code);
  } catch(e) {
    const startPos = match.index;
    const lineNum = html.substring(0, startPos).split('\n').length;
    errors.push('Script block #' + idx + ' (near HTML line ' + lineNum + '): ' + e.message);
  }
}
if (errors.length) {
  console.log('SYNTAX ERRORS FOUND:');
  errors.forEach(e => console.log('  - ' + e));
  process.exit(1);
} else {
  console.log('All ' + idx + ' script blocks parse OK');
}
