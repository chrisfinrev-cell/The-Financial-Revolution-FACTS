'use strict';

const fs = require('fs');
const path = require('path');

// Directories to scan (FACTS layout)
const dirsToScan = [
  './public',
  './views',
  './src',
  './routes',
  './controllers',
  './modules',
  './lib'
];

const rootFiles = ['./server.js'];

function walkDir(dir, callback) {
  if (!fs.existsSync(dir)) return;
  fs.readdirSync(dir).forEach((file) => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      if (file === 'node_modules' || file === '.git') return;
      walkDir(filePath, callback);
    } else if (stat.isFile() && /\.(js|html|ejs|hbs|jsx|tsx|css)$/.test(file)) {
      callback(filePath);
    }
  });
}

function refactorFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  const original = content;

  // 1. Button texts & UI labels
  content = content.replace(/\+ Add Kid/g, '+ Add Child');
  content = content.replace(/Add Kid Profile/g, 'Add Child Profile');
  content = content.replace(/kid profiles/g, 'child profiles');
  content = content.replace(/Kid Profiles/g, 'Child Profiles');
  content = content.replace(/Create kid profiles/g, 'Create child profiles');
  content = content.replace(/Select Kid\b/g, 'Select Child');
  content = content.replace(/— choose kid —/g, '— choose child —');
  content = content.replace(/Kid's Name/g, "Child's Name");
  content = content.replace(/Select a kid first/g, 'Select a child first');
  content = content.replace(/your kids'/g, "your children's");
  content = content.replace(/Teach kids /g, 'Teach children ');
  content = content.replace(/for your kids /g, 'for your children ');
  content = content.replace(/house purchase, kids\./g, 'house purchase, children.');

  // 2. URL query parameters (e.g. kid=2 -> child=2)
  // Do NOT rewrite kid_id= (word boundary before = fails on underscore — safe)
  content = content.replace(/\bkid=/g, 'child=');

  if (content !== original) {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`[Updated]: ${filePath}`);
  }
}

dirsToScan.forEach((dir) => walkDir(dir, refactorFile));
rootFiles.forEach((f) => {
  if (fs.existsSync(f)) refactorFile(f);
});
console.log('Refactoring complete!');
