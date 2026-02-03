/**
 * Messaging utilities for communication between scripts
 */

// Send message to background script
function sendToBackground(type, data = {}) {
  return browser.runtime.sendMessage({ type, ...data });
}

// Send message to a specific tab's content script
function sendToTab(tabId, type, data = {}) {
  return browser.tabs.sendMessage(tabId, { type, ...data });
}

// Send message to all tabs
async function broadcastToTabs(type, data = {}) {
  const tabs = await browser.tabs.query({});
  const promises = tabs.map(tab =>
    browser.tabs.sendMessage(tab.id, { type, ...data }).catch(() => {
      // Tab might not have content script, ignore
    })
  );
  return Promise.all(promises);
}

// Create a message listener with type routing
function createMessageRouter(handlers) {
  return (message, sender, sendResponse) => {
    const { type, ...data } = message;
    const handler = handlers[type];

    if (handler) {
      const result = handler(data, sender);

      if (result instanceof Promise) {
        result
          .then(sendResponse)
          .catch(error => {
            console.error(`Handler error for ${type}:`, error);
            sendResponse({ error: error.message });
          });
        return true; // Async response
      }

      sendResponse(result);
      return false;
    }

    // Unknown message type
    console.warn('Unknown message type:', type);
    return false;
  };
}

// Export for content scripts (non-module context)
if (typeof window !== 'undefined') {
  window.OpenAutofillMessaging = {
    sendToBackground,
    createMessageRouter
  };
}

// Export for ES modules
if (typeof globalThis !== 'undefined') {
  globalThis.Messaging = {
    sendToBackground,
    sendToTab,
    broadcastToTabs,
    createMessageRouter
  };
}
