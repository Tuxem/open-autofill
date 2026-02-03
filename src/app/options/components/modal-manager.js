/**
 * Modal manager component
 * Handles modal visibility and tab switching
 */

import * as ProfilesView from './profiles-view.js';
import * as RulesView from './rules-view.js';
import * as SearchPagination from './search-pagination.js';
import { setCurrentTab } from '../options.js';

/**
 * Hide all modals
 */
export function hideModal() {
  document.getElementById('modal-overlay').classList.add('hidden');
  document.getElementById('modal-profile').classList.add('hidden');
  document.getElementById('modal-rule').classList.add('hidden');
}

/**
 * Escape HTML to prevent XSS
 */
export function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Switch between profiles and rules tabs
 */
export function switchTab(tabName) {
  setCurrentTab(tabName);

  // Update tab buttons
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tabName);
  });

  // Update tab panels
  document.querySelectorAll('.tab-panel').forEach(panel => {
    const isActive = panel.id === `panel-${tabName}`;
    panel.classList.toggle('hidden', !isActive);
  });

  // Update search placeholder
  const searchInput = document.getElementById('search-input');
  searchInput.placeholder = tabName === 'profiles' ? 'Search profiles...' : 'Search rules...';

  // Reset search and pagination when switching tabs
  searchInput.value = '';
  SearchPagination.resetPagination();

  // Re-render with reset state
  if (tabName === 'profiles') {
    ProfilesView.renderProfiles(ProfilesView.getCachedProfiles());
  } else {
    RulesView.renderRules(RulesView.getCachedRules());
  }
}

/**
 * Setup modal event listeners
 */
export function setupModalListeners() {
  // Tab switching
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  // Modal close buttons
  document.querySelectorAll('.modal-close').forEach(btn => {
    btn.addEventListener('click', hideModal);
  });

  // Close modal on overlay click
  document.getElementById('modal-overlay').addEventListener('click', (e) => {
    if (e.target.id === 'modal-overlay') {
      hideModal();
    }
  });

  // Close modal on Escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      hideModal();
    }
  });

  // Delegated event handlers for edit/delete buttons
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;

    const action = btn.dataset.action;
    const id = btn.dataset.id;
    const index = btn.dataset.index;

    switch (action) {
      case 'edit-profile': {
        const profile = ProfilesView.getCachedProfiles().find(p => p.id === id);
        if (profile) ProfilesView.showProfileModal(profile);
        break;
      }
      case 'delete-profile':
        ProfilesView.handleDeleteProfile(id);
        break;
      case 'edit-rule': {
        const rule = RulesView.getCachedRules().find(r => r.id === id);
        if (rule) RulesView.showRuleModal(rule);
        break;
      }
      case 'delete-rule':
        RulesView.handleDeleteRule(id);
        break;
      case 'delete-inline-rule':
        ProfilesView.deleteInlineRule(parseInt(index, 10));
        break;
    }
  });
}

export default {
  hideModal,
  escapeHtml,
  switchTab,
  setupModalListeners
};
