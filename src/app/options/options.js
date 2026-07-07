/**
 * Options page orchestrator for Open Autofill
 * Main entry point that initializes and coordinates all components
 */

// Import components
import * as AuthSection from './components/auth-section.js';
import * as SettingsSection from './components/settings-section.js';
import * as ProfilesView from './components/profiles-view.js';
import * as RulesView from './components/rules-view.js';
import * as DataSection from './components/data-section.js';
import * as ModalManager from './components/modal-manager.js';
import * as SearchPagination from './components/search-pagination.js';

// ============== SHARED STATE ==============

let currentTab = 'profiles';

/**
 * Get current tab
 */
export function getCurrentTab() {
  return currentTab;
}

/**
 * Set current tab
 */
export function setCurrentTab(tab) {
  currentTab = tab;
}

// ============== MESSAGE HELPER ==============

/**
 * Send message to background script
 * @param {string} type - Message type
 * @param {object} data - Additional data to send
 * @returns {Promise} - Response from background
 */
export function sendMessage(type, data = {}) {
  return browser.runtime.sendMessage({ type, ...data });
}

// ============== UTILITY FUNCTIONS ==============

/**
 * Format timestamp for display
 * @param {number} timestamp - Unix timestamp
 * @returns {string} - Formatted date string
 */
export function formatDate(timestamp) {
  if (!timestamp) return 'Never';
  return new Date(timestamp).toLocaleString();
}

// ============== INITIALIZATION ==============

/**
 * Initialize all components and load data
 */
async function init() {
  console.log('Initializing Open Autofill options page...');

  const version = browser.runtime.getManifest().version;
  document.getElementById('header-version').textContent = `v${version}`;
  document.getElementById('about-version').textContent = version;

  // Setup event listeners for all components
  ModalManager.setupModalListeners();
  AuthSection.setupAuthListeners();
  SettingsSection.setupSettingsListeners();
  ProfilesView.setupProfilesListeners();
  RulesView.setupRulesListeners();
  DataSection.setupDataListeners();
  SearchPagination.setupSearchPaginationListeners();

  // Load initial data
  await AuthSection.loadAuthStatus();
  await SettingsSection.loadSettings();
  await ProfilesView.loadProfiles();
  await RulesView.loadAllRules();
  await SettingsSection.loadStats();

  console.log('Open Autofill options page initialized');
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', init);

// Export for components that need access
export default {
  getCurrentTab,
  setCurrentTab,
  sendMessage,
  formatDate
};
