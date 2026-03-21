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

  // In Chrome, 'chrome' is available globally.
  // In a service worker, 'self.chrome' is also available.
  const globalObject = typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : (typeof self !== 'undefined' ? self : {}));

  if (typeof globalObject.browser === 'undefined') {
    if (typeof globalObject.chrome !== 'undefined') {
      globalObject.browser = globalObject.chrome;
    } else if (typeof chrome !== 'undefined') {
      globalObject.browser = chrome;
    }
  }
})();
