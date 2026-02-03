/**
 * Context menu module for Open Autofill
 * Creates right-click menu items for saving form data
 */

import { CONTEXT_MENU_IDS, MESSAGE_TYPES } from '../../shared/constants.js';

// Initialize context menus
async function init() {
  // Remove existing menus first
  await browser.contextMenus.removeAll();

  // Create "Save form" menu item (always visible)
  browser.contextMenus.create({
    id: CONTEXT_MENU_IDS.SAVE_FORM,
    title: 'Save entire form to Open Autofill',
    contexts: ['page', 'frame', 'editable']
  });

  // Create "Save this field" menu item (visible on form fields)
  browser.contextMenus.create({
    id: CONTEXT_MENU_IDS.SAVE_FIELD,
    title: 'Save this field to Open Autofill',
    contexts: ['editable']
  });

  console.log('Context menus initialized');
}

// Handle context menu clicks
browser.contextMenus.onClicked.addListener(async (info, tab) => {
  try {
    switch (info.menuItemId) {
      case CONTEXT_MENU_IDS.SAVE_FORM:
        await handleSaveForm(tab);
        break;

      case CONTEXT_MENU_IDS.SAVE_FIELD:
        await handleSaveField(tab, info);
        break;
    }
  } catch (error) {
    console.error('Context menu handler error:', error);
  }
});

// Handle "Save entire form" action
async function handleSaveForm(tab) {
  // Send message to content script to extract form data
  await browser.tabs.sendMessage(tab.id, {
    type: 'CONTEXT_MENU_SAVE_FORM'
  });
}

// Handle "Save this field" action
async function handleSaveField(tab, info) {
  // Send message to content script to save the clicked field
  await browser.tabs.sendMessage(tab.id, {
    type: 'CONTEXT_MENU_SAVE_FIELD',
    targetElementId: info.targetElementId
  });
}

// Export ContextMenu module
export const ContextMenu = {
  init
};

export default ContextMenu;
