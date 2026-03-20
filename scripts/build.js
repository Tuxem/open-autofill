#!/usr/bin/env node

/**
 * Build script for Open Autofill — generates browser-specific packages.
 *
 * Usage:
 *   node scripts/build.js              # build both browsers
 *   node scripts/build.js firefox      # build Firefox only
 *   node scripts/build.js chrome       # build Chrome only
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');

// Files and directories to include in the build
const INCLUDE = [
  'src',
  'icons',
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function cleanDir(dir) {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true });
  }
  fs.mkdirSync(dir, { recursive: true });
}

function copyRecursive(src, dest) {
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src)) {
      copyRecursive(path.join(src, entry), path.join(dest, entry));
    }
  } else {
    fs.copyFileSync(src, dest);
  }
}

// ---------------------------------------------------------------------------
// Manifest generators
// ---------------------------------------------------------------------------

function readBaseManifest() {
  return JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf-8'));
}

function buildFirefoxManifest(base) {
  // Firefox uses background.scripts with type: module
  const manifest = { ...base };

  // Ensure polyfill is first content script (no-op on Firefox, but keeps parity)
  manifest.content_scripts = base.content_scripts.map(cs => ({
    ...cs,
    js: ['src/shared/browser-polyfill.js', ...cs.js],
  }));

  return manifest;
}

function buildChromeManifest(base) {
  const manifest = { ...base };

  // Chrome uses service_worker instead of background.scripts
  manifest.background = {
    service_worker: base.background.scripts[0],
    type: 'module',
  };

  // Remove Firefox-specific settings
  delete manifest.browser_specific_settings;

  // Ensure polyfill is first content script
  manifest.content_scripts = base.content_scripts.map(cs => ({
    ...cs,
    js: ['src/shared/browser-polyfill.js', ...cs.js],
  }));

  return manifest;
}

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------

function buildForBrowser(browser) {
  const destDir = path.join(DIST, browser);
  console.log(`Building ${browser} → ${path.relative(ROOT, destDir)}`);

  cleanDir(destDir);

  // Copy source files
  for (const entry of INCLUDE) {
    const src = path.join(ROOT, entry);
    if (fs.existsSync(src)) {
      copyRecursive(src, path.join(destDir, entry));
    }
  }

  // Generate manifest
  const base = readBaseManifest();
  const manifest = browser === 'firefox'
    ? buildFirefoxManifest(base)
    : buildChromeManifest(base);

  fs.writeFileSync(
    path.join(destDir, 'manifest.json'),
    JSON.stringify(manifest, null, 2) + '\n',
  );

  console.log(`  ✓ ${browser} build complete`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const target = process.argv[2]; // "firefox", "chrome", or undefined (both)

if (target && !['firefox', 'chrome'].includes(target)) {
  console.error(`Unknown target: ${target}`);
  console.error('Usage: node scripts/build.js [firefox|chrome]');
  process.exit(1);
}

const targets = target ? [target] : ['firefox', 'chrome'];

for (const t of targets) {
  buildForBrowser(t);
}

console.log('\nDone. Outputs in dist/');
