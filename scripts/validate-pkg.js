const fs = require('fs');
try {
  const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  console.log('VALID JSON');
  console.log('twilio:', pkg.dependencies && pkg.dependencies.twilio ? pkg.dependencies.twilio : 'NOT FOUND');
  console.log('All deps:', Object.keys(pkg.dependencies || {}).join(', '));
} catch(e) {
  console.error('JSON ERROR:', e.message);
  process.exit(1);
}