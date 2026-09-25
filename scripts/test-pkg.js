const fs = require('fs');
const buf = fs.readFileSync('package.json');
console.log('File size:', buf.length);
console.log('First 20 bytes (hex):', buf.slice(0,20).toString('hex'));
console.log('First 10 chars:', buf.slice(0,10).toString('utf8').replace(/./g, m => m.charCodeAt(0) + ' '));
