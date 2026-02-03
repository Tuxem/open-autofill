/**
 * Utility functions for Open Autofill
 */

// Generate a unique ID with prefix
function generateId(prefix = '') {
  const timestamp = Date.now().toString(36);
  const randomPart = Math.random().toString(36).substring(2, 8);
  return prefix ? `${prefix}_${timestamp}${randomPart}` : `${timestamp}${randomPart}`;
}

// Generate a profile ID
function generateProfileId() {
  return generateId('p');
}

// Generate a rule ID
function generateRuleId() {
  return generateId('r');
}

// Check if a URL matches a pattern
function urlMatches(currentUrl, pattern) {
  if (!pattern) return true;

  try {
    // Normalize URLs
    const current = new URL(currentUrl);
    const patternUrl = pattern.includes('://') ? new URL(pattern) : new URL('https://' + pattern);

    // Check hostname match (allow subdomain matching)
    const currentHost = current.hostname.toLowerCase();
    const patternHost = patternUrl.hostname.toLowerCase();

    if (currentHost !== patternHost && !currentHost.endsWith('.' + patternHost)) {
      return false;
    }

    // If pattern has a path, check path prefix match
    if (patternUrl.pathname && patternUrl.pathname !== '/') {
      if (!current.pathname.startsWith(patternUrl.pathname)) {
        return false;
      }
    }

    return true;
  } catch (e) {
    // If URL parsing fails, do simple string matching
    return currentUrl.includes(pattern);
  }
}

// Parse hotkey string (e.g., "Alt + W" -> { alt: true, key: 'w' })
function parseHotkey(hotkeyStr) {
  if (!hotkeyStr) return null;

  const parts = hotkeyStr.split('+').map(p => p.trim().toLowerCase());
  const result = {
    ctrl: false,
    alt: false,
    shift: false,
    meta: false,
    key: null
  };

  for (const part of parts) {
    switch (part) {
      case 'ctrl':
      case 'control':
        result.ctrl = true;
        break;
      case 'alt':
        result.alt = true;
        break;
      case 'shift':
        result.shift = true;
        break;
      case 'meta':
      case 'cmd':
      case 'command':
        result.meta = true;
        break;
      default:
        result.key = part;
    }
  }

  return result.key ? result : null;
}

// Check if keyboard event matches a hotkey
function matchesHotkey(event, hotkey) {
  if (!hotkey) return false;

  const parsed = typeof hotkey === 'string' ? parseHotkey(hotkey) : hotkey;
  if (!parsed) return false;

  return (
    event.ctrlKey === parsed.ctrl &&
    event.altKey === parsed.alt &&
    event.shiftKey === parsed.shift &&
    event.metaKey === parsed.meta &&
    event.key.toLowerCase() === parsed.key
  );
}

// Debounce function
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// Throttle function
function throttle(func, limit) {
  let inThrottle;
  return function executedFunction(...args) {
    if (!inThrottle) {
      func(...args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
}

// Sleep utility
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Calculate exponential backoff delay
function getBackoffDelay(attempt, baseDelay = 1000, maxDelay = 16000) {
  const delay = Math.min(baseDelay * Math.pow(2, attempt), maxDelay);
  // Add jitter (±10%)
  const jitter = delay * 0.1 * (Math.random() * 2 - 1);
  return Math.round(delay + jitter);
}

// Safe JSON parse
function safeJsonParse(str, defaultValue = null) {
  try {
    return JSON.parse(str);
  } catch (e) {
    return defaultValue;
  }
}

// Deep clone object
function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

// Merge objects deeply
function deepMerge(target, source) {
  const result = { ...target };
  for (const key of Object.keys(source)) {
    if (source[key] instanceof Object && key in target) {
      result[key] = deepMerge(target[key], source[key]);
    } else {
      result[key] = source[key];
    }
  }
  return result;
}

// Escape HTML to prevent XSS
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// Format date for display
function formatDate(timestamp) {
  if (!timestamp) return 'Never';
  return new Date(timestamp).toLocaleString();
}

// Export for ES modules (background script)
if (typeof globalThis !== 'undefined' && typeof globalThis.window === 'undefined') {
  globalThis.Utils = {
    generateId,
    generateProfileId,
    generateRuleId,
    urlMatches,
    parseHotkey,
    matchesHotkey,
    debounce,
    throttle,
    sleep,
    getBackoffDelay,
    safeJsonParse,
    deepClone,
    deepMerge,
    escapeHtml,
    formatDate
  };
}

// Make available globally for content scripts
if (typeof window !== 'undefined') {
  window.OpenAutofillUtils = {
    generateId,
    generateProfileId,
    generateRuleId,
    urlMatches,
    parseHotkey,
    matchesHotkey,
    debounce,
    throttle,
    sleep,
    getBackoffDelay,
    safeJsonParse,
    deepClone,
    deepMerge,
    escapeHtml,
    formatDate
  };
}
