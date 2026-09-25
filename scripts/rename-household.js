const fs = require('fs');
const path = require('path');

const exclusions = ['.git', 'node_modules', '.tmp', 'debug', 'session-env', 'shell-snapshots'];
let fileCount = 0;
let replacementCount = 0;

function walkDir(dir) {
  try {
    const files = fs.readdirSync(dir);
    files.forEach(file => {
      const fullPath = path.join(dir, file);
      const stat = fs.statSync(fullPath);

      if (exclusions.some(ex => fullPath.includes(ex))) return;

      if (stat.isDirectory()) {
        walkDir(fullPath);
      } else {
        processFile(fullPath);
      }
    });
  } catch (e) {
    // skip
  }
}

function processFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const validExts = ['.js', '.jsx', '.ts', '.tsx', '.json', '.html', '.css', '.sql', '.md'];

  if (\!validExts.includes(ext)) return;

  try {
    let content = fs.readFileSync(filePath, 'utf8');
    const original = content;

    // Replace all case variations of "family" with "family"
    content = content.replace(/\bhousehold\b/gi, (match) => {
      if (match === 'family') return 'family';
      if (match === 'family') return 'Family';
      if (match === 'family') return 'FAMILY';
      return match;
    });

    if (content \!== original) {
      fs.writeFileSync(filePath, content, 'utf8');
      const changes = (original.match(/family/gi) || []).length;
      replacementCount += changes;
      fileCount++;
      console.log(`✓ ${filePath} (${changes} replacements)`);
    }
  } catch (e) {
    // skip if can't read/write
  }
}

walkDir('.');
console.log(`\n✅ Updated ${fileCount} files with ${replacementCount} total replacements`);
