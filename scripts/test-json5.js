// Test if Node.js supports JSON5
const JSON5 = require('json5');
const fs = require('fs');
const content = fs.readFileSync('package.json', 'utf8');
console.log('Content first 30:', JSON.stringify(content.substring(0,30)));
try {
  const pkg = JSON5.parse(content);
  console.log('JSON5 parse OK\! twilio:', pkg.dependencies && pkg.dependencies.twilio);
} catch(e) {
  console.error('JSON5 parse failed:', e.message);
}
