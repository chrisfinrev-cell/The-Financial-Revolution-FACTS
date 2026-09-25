#!/usr/bin/env node

/**
 * ensure-pwa-icons.js
 *
 * Ensures PWA icon files exist at public/icons/ BEFORE the server starts.
 * Runs during the build step to eliminate race conditions.
 *
 * Strategy:
 *   1. Try to download the FACTS logo from R2 CDN
 *   2. If download fails, generate valid 192x192 PNG fallbacks
 *   3. Save as icon-192.png, icon-512.png, icon-maskable.png
 *
 * Design:
 *   - Uses only Node.js built-in modules (no external deps)
 *   - Idempotent: skips files that already exist with valid PNG signature
 *   - Always exits 0 (build must not break)
 *   - Fallback generates 192x192 icons (Chrome minimum is 144x144 for beforeinstallprompt)
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const zlib = require('zlib');

const ICONS_DIR = path.join(__dirname, '..', 'public', 'icons');
const CDN_URL = 'https://pub-629428d185ca4960a0a73c850d32294b.r2.dev/company_7135/images/9a698eb7-b165-4edc-88d7-14a89d580a65.png';
const DOWNLOAD_TIMEOUT_MS = 15000;
const MAX_REDIRECTS = 5;

const ICON_FILES = ['icon-192.png', 'icon-512.png', 'icon-maskable.png'];

// ── PNG generation utilities ─────────────────────────────────────────────────

/**
 * CRC32 lookup table + computation (required by PNG chunks)
 */
const CRC_TABLE = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
  }
  CRC_TABLE[n] = c;
}

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = CRC_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/**
 * Create a PNG chunk: length(4) + type(4) + data + crc32(4)
 */
function pngChunk(type, data) {
  const typeBytes = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crcInput = Buffer.concat([typeBytes, data]);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(crcInput), 0);
  return Buffer.concat([len, typeBytes, data, crcBuf]);
}

/**
 * Read actual width and height from a PNG buffer's IHDR chunk.
 */
function readPngDimensions(buf) {
  if (!isValidPng(buf) || buf.length < 24) return null;
  return {
    width: buf.readUInt32BE(16),
    height: buf.readUInt32BE(20)
  };
}

/**
 * Generate a valid RGBA PNG at exact WxH with green "F" on dark background.
 * Uses Node's built-in zlib for DEFLATE compression.
 * If isMaskable=true, centers the "F" in a 60% safe zone.
 */
function generateFallbackPng(W, H, isMaskable) {
  const BG = [0x0a, 0x0f, 0x1a, 0xff]; // dark navy matching theme
  const FG = [0x10, 0xb9, 0x81, 0xff]; // emerald matching brand

  // Maskable icons need content within 80% center (20% padding each side)
  const pad = isMaskable ? Math.floor(W * 0.2) : 0;
  const areaW = W - pad * 2;
  const areaH = H - pad * 2;

  // F letter proportional to available area
  const letterL = pad + Math.floor(areaW * 0.28);
  const letterR = pad + Math.floor(areaW * 0.72);
  const letterT = pad + Math.floor(areaH * 0.15);
  const letterB = pad + Math.floor(areaH * 0.85);
  const stemW = Math.floor(areaW * 0.14);
  const barH = Math.floor(areaH * 0.11);
  const midR = pad + Math.floor(areaW * 0.64);
  const midT = letterT + Math.floor((letterB - letterT) * 0.38);

  const rowLen = 1 + W * 4;
  const rawData = Buffer.alloc(rowLen * H);

  for (let y = 0; y < H; y++) {
    const offset = y * rowLen;
    rawData[offset] = 0; // filter: None
    for (let x = 0; x < W; x++) {
      const px = offset + 1 + x * 4;
      let c = BG;
      // Stem
      if (y >= letterT && y < letterB && x >= letterL && x < letterL + stemW) c = FG;
      // Top bar
      if (y >= letterT && y < letterT + barH && x >= letterL && x < letterR) c = FG;
      // Middle bar
      if (y >= midT && y < midT + barH && x >= letterL && x < midR) c = FG;

      rawData[px] = c[0]; rawData[px + 1] = c[1];
      rawData[px + 2] = c[2]; rawData[px + 3] = c[3];
    }
  }

  const compressed = zlib.deflateSync(rawData, { level: 9 });
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0);
  ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;

  return Buffer.concat([
    signature,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', compressed),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

// ── Download utility ─────────────────────────────────────────────────────────

function downloadUrl(url, redirectCount) {
  if (redirectCount === undefined) redirectCount = 0;

  return new Promise((resolve, reject) => {
    if (redirectCount > MAX_REDIRECTS) {
      return reject(new Error('Too many redirects'));
    }

    const transport = new URL(url).protocol === 'https:' ? https : http;

    const req = transport.get(url, { timeout: DOWNLOAD_TIMEOUT_MS }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        const redirectUrl = new URL(res.headers.location, url).href;
        console.log('  Redirect ' + res.statusCode + ' -> ' + redirectUrl);
        res.resume();
        resolve(downloadUrl(redirectUrl, redirectCount + 1));
        return;
      }

      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error('HTTP ' + res.statusCode));
      }

      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Timed out after ' + DOWNLOAD_TIMEOUT_MS + 'ms'));
    });
    req.on('error', reject);
  });
}

/**
 * Check if a buffer starts with the PNG signature.
 */
function isValidPng(buf) {
  if (!buf || buf.length < 8) return false;
  return buf[0] === 137 && buf[1] === 80 && buf[2] === 78 && buf[3] === 71 &&
         buf[4] === 13  && buf[5] === 10 && buf[6] === 26 && buf[7] === 10;
}

/**
 * Check if an existing file is a valid PNG with non-zero size.
 */
function isExistingValidIcon(filePath) {
  try {
    if (!fs.existsSync(filePath)) return false;
    const stat = fs.statSync(filePath);
    if (stat.size < 68) return false; // minimum valid PNG is ~68 bytes
    const header = Buffer.alloc(8);
    const fd = fs.openSync(filePath, 'r');
    fs.readSync(fd, header, 0, 8, 0);
    fs.closeSync(fd);
    return isValidPng(header);
  } catch {
    return false;
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────

// Required icon sizes for Chrome PWA installability:
//   manifest declares icon-192.png as 192x192, icon-512.png as 512x512
//   Actual PNG dimensions MUST match or exceed declared sizes.
const ICON_SPECS = {
  'icon-192.png':     { minW: 192, minH: 192, maskable: false },
  'icon-512.png':     { minW: 512, minH: 512, maskable: false },
  'icon-maskable.png':{ minW: 512, minH: 512, maskable: true },
};

async function main() {
  console.log('[ensure-pwa-icons] Starting PWA icon setup...');

  // Step 1: Ensure directory exists
  if (!fs.existsSync(ICONS_DIR)) {
    fs.mkdirSync(ICONS_DIR, { recursive: true });
    console.log('[ensure-pwa-icons] Created: ' + ICONS_DIR);
  }

  // Step 2: Check which files need fixes vs enhancement
  //   Icons are committed to git with correct dimensions (fallback "F" logo).
  //   This script:
  //     a) Fixes any icons with wrong dimensions (critical — prevents install)
  //     b) Enhances small fallback icons with CDN brand logo (cosmetic improvement)
  const filesToFix = [];     // Wrong dimensions — MUST fix
  const filesToEnhance = []; // Correct but small (fallback "F") — try CDN enhancement
  const ENHANCEMENT_THRESHOLD = 10000; // Icons under 10KB are likely fallbacks

  for (const filename of ICON_FILES) {
    const filePath = path.join(ICONS_DIR, filename);
    const spec = ICON_SPECS[filename];
    if (isExistingValidIcon(filePath)) {
      const buf = fs.readFileSync(filePath);
      const dims = readPngDimensions(buf);
      if (dims && dims.width >= spec.minW && dims.height >= spec.minH) {
        if (buf.length < ENHANCEMENT_THRESHOLD) {
          console.log('[ensure-pwa-icons] FALLBACK: ' + filename + ' (' + dims.width + 'x' + dims.height + ', ' + buf.length + ' bytes — will try CDN)');
          filesToEnhance.push(filename);
        } else {
          console.log('[ensure-pwa-icons] OK: ' + filename + ' (' + dims.width + 'x' + dims.height + ', ' + buf.length + ' bytes)');
        }
      } else {
        console.log('[ensure-pwa-icons] WRONG SIZE: ' + filename + ' (' + (dims ? dims.width + 'x' + dims.height : 'unknown') + ', need >=' + spec.minW + 'x' + spec.minH + ')');
        filesToFix.push(filename);
      }
    } else {
      console.log('[ensure-pwa-icons] MISSING: ' + filename);
      filesToFix.push(filename);
    }
  }

  if (filesToFix.length === 0 && filesToEnhance.length === 0) {
    console.log('[ensure-pwa-icons] All icons present with correct dimensions and brand logo.');
    return;
  }

  // Step 3: Try CDN download (for both fixes and enhancements)
  let cdnImage = null;
  if (filesToFix.length > 0 || filesToEnhance.length > 0) {
    try {
      console.log('[ensure-pwa-icons] Downloading brand logo from CDN...');
      const data = await downloadUrl(CDN_URL);
      if (isValidPng(data)) {
        const dims = readPngDimensions(data);
        if (!dims) {
          console.log('[ensure-pwa-icons] CDN image: could not read dimensions');
        } else if (dims.width < 512 || dims.height < 512) {
          console.log('[ensure-pwa-icons] CDN image too small: ' + dims.width + 'x' + dims.height + ' (need >=512x512)');
        } else {
          // PWA icons MUST be square (or nearly square). Non-square images cause
          // Chrome to distort the icon or reject it for beforeinstallprompt.
          const aspectRatio = Math.min(dims.width, dims.height) / Math.max(dims.width, dims.height);
          if (aspectRatio < 0.9) {
            console.log('[ensure-pwa-icons] CDN image is NOT SQUARE: ' + dims.width + 'x' + dims.height +
              ' (aspect ratio ' + aspectRatio.toFixed(2) + ', need >=0.9). Skipping — PWA icons must be square.');
          } else {
            cdnImage = data;
            console.log('[ensure-pwa-icons] CDN image: ' + dims.width + 'x' + dims.height + ' (' + data.length + ' bytes) — square, usable');
          }
        }
      } else {
        console.log('[ensure-pwa-icons] CDN data is not a valid PNG');
      }
    } catch (err) {
      console.log('[ensure-pwa-icons] CDN download failed: ' + err.message);
    }
  }

  // Step 4a: Fix broken icons (wrong dimensions or missing) — CRITICAL for installability
  for (const filename of filesToFix) {
    const filePath = path.join(ICONS_DIR, filename);
    const spec = ICON_SPECS[filename];
    let iconData;

    if (cdnImage) {
      iconData = cdnImage;
      console.log('[ensure-pwa-icons] Using CDN image for: ' + filename);
    } else {
      iconData = generateFallbackPng(spec.minW, spec.minH, spec.maskable);
      const dims = readPngDimensions(iconData);
      console.log('[ensure-pwa-icons] Generated: ' + filename + ' (' + dims.width + 'x' + dims.height + ')');
    }

    try {
      fs.writeFileSync(filePath, iconData);
      console.log('[ensure-pwa-icons] Fixed: ' + filename);
    } catch (err) {
      console.error('[ensure-pwa-icons] ERROR writing ' + filename + ': ' + err.message);
    }
  }

  // Step 4b: Enhance fallback icons with CDN brand logo (cosmetic, non-critical)
  if (cdnImage && filesToEnhance.length > 0) {
    for (const filename of filesToEnhance) {
      const filePath = path.join(ICONS_DIR, filename);
      try {
        fs.writeFileSync(filePath, cdnImage);
        console.log('[ensure-pwa-icons] Enhanced with brand logo: ' + filename);
      } catch (err) {
        console.error('[ensure-pwa-icons] ERROR enhancing ' + filename + ': ' + err.message);
      }
    }
  } else if (filesToEnhance.length > 0) {
    console.log('[ensure-pwa-icons] CDN unavailable — keeping fallback icons (correct dimensions, install will work)');
  }

  console.log('[ensure-pwa-icons] Done.');
}

main().catch((err) => {
  console.error('[ensure-pwa-icons] Unexpected error:', err.message);
  process.exit(0); // never break the build
});
