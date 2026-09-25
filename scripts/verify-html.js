const fs = require('fs');
const h = fs.readFileSync('public/facts-funnel.html', 'utf8');
const need = ['<html', '</html>', '<body', '</body>'];
const missing = need.filter(t => !h.includes(t));
if (missing.length) {
    console.error('FAIL: missing tags: ' + missing.join(', '));
    process.exit(1);
}
console.log('PASS: HTML structure valid');
// Also check no getBoundingClientRect left
if (h.includes('getBoundingClientRect')) {
    console.error('FAIL: getBoundingClientRect still present');
    process.exit(1);
}
console.log('PASS: no getBoundingClientRect');
// Check no alignHeaderCalculatorText
if (h.includes('alignHeaderCalculatorText')) {
    console.error('FAIL: alignHeaderCalculatorText still present');
    process.exit(1);
}
console.log('PASS: no JS alignment function');