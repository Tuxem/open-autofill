/**
 * Minimal browser API polyfill for Chrome compatibility.
 *
 * Firefox exposes `browser.*` (Promise-based).
 * Chrome MV3 exposes `chrome.*` (also Promise-based since MV3).
 * This shim maps `browser` → `chrome` so the rest of the codebase
 * can use `browser.*` everywhere.
 *
 * Safe to load in any context (content script, service worker, options page).
 * On Firefox this is a no-op.
 */
(function () {
  'use strict';

  if (typeof globalThis.browser === 'undefined') {
    globalThis.browser = globalThis.chrome;
  }
})();
