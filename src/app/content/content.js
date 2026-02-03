/**
 * Content script entry point for Open Autofill
 * Coordinates all content script modules
 */

(function() {
  'use strict';

  // Track initialization
  let isInitialized = false;

  // Initialize the content script
  function init() {
    if (isInitialized) return;
    isInitialized = true;

    console.log('Open Autofill: Initializing content script');

    // Initialize UI components
    window.OpenAutofillFloatingBar.init();
    window.OpenAutofillSaveDialog.init();

    // Start mutation watcher for SPA support
    window.OpenAutofillMutationWatcher.start((event) => {
      console.log('Open Autofill: DOM change detected', event);
    });

    // Set up message listener
    browser.runtime.onMessage.addListener(handleMessage);

    console.log('Open Autofill: Content script ready');
  }

  // Handle messages from background script
  function handleMessage(message, sender, sendResponse) {
    const { type, ...data } = message;

    switch (type) {
      case 'SHOW_FLOATING_BAR':
        window.OpenAutofillFloatingBar.show();
        sendResponse({ success: true });
        break;

      case 'HIDE_FLOATING_BAR':
        window.OpenAutofillFloatingBar.hide();
        sendResponse({ success: true });
        break;

      case 'FILL_FORM':
        handleFillForm(data).then(sendResponse);
        return true; // Async response

      case 'CONTEXT_MENU_SAVE_FORM':
        handleSaveForm().then(sendResponse);
        return true;

      case 'CONTEXT_MENU_SAVE_FIELD':
        handleSaveField(data).then(sendResponse);
        return true;

      case 'SYNC_COMPLETE':
        handleSyncComplete(data);
        sendResponse({ success: true });
        break;

      default:
        console.warn('Open Autofill: Unknown message type', type);
        sendResponse({ error: 'Unknown message type' });
    }

    return false;
  }

  // Handle fill form message
  async function handleFillForm(data) {
    try {
      const result = await window.OpenAutofillFormFiller.fillWithProfile(
        data.profileId,
        window.location.href
      );

      // Show result in floating bar if visible
      if (window.OpenAutofillFloatingBar.isVisible) {
        if (result.success) {
          const count = result.results?.filled?.length || 0;
          window.OpenAutofillFloatingBar.showStatus(
            `Filled ${count} field${count !== 1 ? 's' : ''}`,
            'success'
          );
        } else {
          window.OpenAutofillFloatingBar.showStatus(result.message, 'error');
        }
      }

      return result;

    } catch (error) {
      console.error('Open Autofill: Fill error', error);
      return { success: false, error: error.message };
    }
  }

  // Handle save form context menu
  async function handleSaveForm() {
    try {
      // Show the save dialog with all form fields
      window.OpenAutofillSaveDialog.show();
      return { success: true };
    } catch (error) {
      console.error('Open Autofill: Save form error', error);
      return { success: false, error: error.message };
    }
  }

  // Handle save field context menu
  async function handleSaveField(data) {
    try {
      // Find the element that was right-clicked
      // Note: targetElementId is not reliably available, so we use the focused element
      // or show the dialog for all fields
      const focusedField = window.OpenAutofillFieldExtractor.extractFocusedField();

      if (focusedField) {
        // Find the actual element
        const element = window.OpenAutofillFormDetector.findField(focusedField.name);
        window.OpenAutofillSaveDialog.show(element);
      } else {
        // Fallback to showing all fields
        window.OpenAutofillSaveDialog.show();
      }

      return { success: true };
    } catch (error) {
      console.error('Open Autofill: Save field error', error);
      return { success: false, error: error.message };
    }
  }

  // Handle sync complete notification
  function handleSyncComplete(data) {
    if (window.OpenAutofillFloatingBar.isVisible) {
      if (data.success) {
        window.OpenAutofillFloatingBar.loadProfiles();
        window.OpenAutofillFloatingBar.showStatus('Synced', 'success');
      } else {
        window.OpenAutofillFloatingBar.showStatus('Sync failed', 'error');
      }
    }
  }

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Also initialize on visibilitychange (for SPAs that might load late)
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && !isInitialized) {
      init();
    }
  });

})();
