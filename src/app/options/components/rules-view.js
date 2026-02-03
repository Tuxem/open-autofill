/**
 * Rules view component
 * Handles rule list, creation, editing, and deletion
 */

import { showToast } from './toast.js';
import { hideModal, escapeHtml } from './modal-manager.js';
import * as SearchPagination from './search-pagination.js';
import * as ProfilesView from './profiles-view.js';
import * as SettingsSection from './settings-section.js';
import { sendMessage } from '../options.js';

// State
let cachedRules = [];
let profileComboboxOpen = false;

/**
 * Get cached rules
 */
export function getCachedRules() {
  return cachedRules;
}

/**
 * Load all rules from the background script
 */
export async function loadAllRules() {
  try {
    const response = await sendMessage('GET_ALL_RULES');
    cachedRules = response.rules || [];
    renderRules(cachedRules);
    return cachedRules;
  } catch (error) {
    console.error('Failed to load rules:', error);
    showToast('Failed to load rules: ' + error.message, 'error');
    return [];
  }
}

/**
 * Render rules list grouped by profile
 */
export function renderRules(rules) {
  const emptyState = document.getElementById('rules-empty');
  const groupedContainer = document.getElementById('rules-grouped');

  // Filter and paginate
  const filtered = SearchPagination.filterRules(rules);
  const paginated = SearchPagination.paginate(filtered, SearchPagination.rulesPage);

  // Update pagination
  SearchPagination.updatePagination('rules', filtered.length, rules.length);

  if (rules.length === 0) {
    emptyState.classList.remove('hidden');
    emptyState.querySelector('p').textContent = 'No rules yet. Rules define how form fields are filled for each profile.';
    groupedContainer.innerHTML = '';
    return;
  }

  if (filtered.length === 0) {
    emptyState.classList.remove('hidden');
    emptyState.querySelector('p').textContent = 'No rules match your search.';
    groupedContainer.innerHTML = '';
    return;
  }

  emptyState.classList.add('hidden');

  // Group paginated rules by profile
  const rulesByProfile = {};
  for (const rule of paginated) {
    const profileId = rule.profileId || 'unknown';
    if (!rulesByProfile[profileId]) {
      rulesByProfile[profileId] = [];
    }
    rulesByProfile[profileId].push(rule);
  }

  // Create profile name map
  const profileNames = {};
  for (const profile of ProfilesView.getCachedProfiles()) {
    profileNames[profile.id] = profile.name;
  }

  // Render grouped rules
  groupedContainer.innerHTML = Object.entries(rulesByProfile).map(([profileId, profileRules]) => `
    <div>
      <div class="rules-group-header">Profile: ${escapeHtml(profileNames[profileId] || 'Unknown')}</div>
      <table class="data-table border border-gray-200 border-t-0 rounded-b dark:border-gray-700">
        <thead>
          <tr>
            <th>Field</th>
            <th>Value</th>
            <th>Type</th>
            <th>Mode</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          ${profileRules.map(rule => `
            <tr data-id="${rule.id}">
              <td>${escapeHtml(rule.name)}</td>
              <td class="max-w-[200px] truncate">${escapeHtml(rule.value)}</td>
              <td>${escapeHtml(rule.type || 'Text')}</td>
              <td>${escapeHtml(rule.mode || 'Overwrite')}</td>
              <td class="flex gap-2">
                <button class="btn-icon-only btn-edit" title="Edit" data-action="edit-rule" data-id="${rule.id}">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                  </svg>
                </button>
                <button class="btn-icon-only btn-delete" title="Delete" data-action="delete-rule" data-id="${rule.id}">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="3 6 5 6 21 6"/>
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                  </svg>
                </button>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `).join('');
}

// ============== PROFILE COMBOBOX ==============

/**
 * Render profile dropdown options
 */
function renderProfileDropdown(filter = '') {
  const dropdown = document.getElementById('profile-dropdown');
  const filterLower = filter.toLowerCase();
  const profiles = ProfilesView.getCachedProfiles();

  const filtered = profiles.filter(p =>
    p.name.toLowerCase().includes(filterLower)
  );

  if (filtered.length === 0) {
    dropdown.innerHTML = '<div class="px-3 py-2 text-gray-500 dark:text-gray-400 text-sm">No profiles found</div>';
  } else {
    dropdown.innerHTML = filtered.map(profile => `
      <div class="combobox-option" tabindex="-1"
           data-profile-id="${profile.id}"
           data-profile-name="${escapeHtml(profile.name)}">
        <div class="font-medium text-gray-800 dark:text-gray-200">${escapeHtml(profile.name)}</div>
        ${profile.site ? `<div class="text-xs text-gray-500 dark:text-gray-400">${escapeHtml(profile.site)}</div>` : ''}
      </div>
    `).join('');
  }
}

/**
 * Open profile combobox dropdown
 */
function openProfileCombobox() {
  const dropdown = document.getElementById('profile-dropdown');
  const searchInput = document.getElementById('rule-profile-search');

  renderProfileDropdown(searchInput.value);
  dropdown.classList.remove('hidden');
  profileComboboxOpen = true;
}

/**
 * Close profile combobox dropdown
 */
function closeProfileCombobox() {
  const dropdown = document.getElementById('profile-dropdown');
  dropdown.classList.add('hidden');
  profileComboboxOpen = false;
}

/**
 * Select a profile from the combobox
 */
function selectProfile(profileId, profileName) {
  document.getElementById('rule-profile').value = profileId;
  document.getElementById('rule-profile-search').value = profileName;
  closeProfileCombobox();
}

/**
 * Handle profile search input
 */
function handleProfileSearchInput(event) {
  const value = event.target.value;
  renderProfileDropdown(value);

  // Clear selection if user types something different
  const hiddenInput = document.getElementById('rule-profile');
  const profiles = ProfilesView.getCachedProfiles();
  const currentProfile = profiles.find(p => p.id === hiddenInput.value);
  if (currentProfile && currentProfile.name !== value) {
    hiddenInput.value = '';
  }

  if (!profileComboboxOpen) {
    openProfileCombobox();
  }
}

/**
 * Handle profile dropdown click
 */
function handleProfileDropdownClick(event) {
  const option = event.target.closest('[data-profile-id]');
  if (option) {
    selectProfile(option.dataset.profileId, option.dataset.profileName);
  }
}

/**
 * Setup profile combobox listeners
 */
export function setupProfileCombobox() {
  const searchInput = document.getElementById('rule-profile-search');
  const dropdown = document.getElementById('profile-dropdown');
  const combobox = document.getElementById('profile-combobox');

  // Open on focus
  searchInput.addEventListener('focus', openProfileCombobox);

  // Filter on input
  searchInput.addEventListener('input', handleProfileSearchInput);

  // Select on click
  dropdown.addEventListener('click', handleProfileDropdownClick);

  // Close on click outside
  document.addEventListener('click', (e) => {
    if (!combobox.contains(e.target) && profileComboboxOpen) {
      closeProfileCombobox();
    }
  });

  // Keyboard navigation
  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeProfileCombobox();
    } else if (e.key === 'ArrowDown' && profileComboboxOpen) {
      e.preventDefault();
      const firstOption = dropdown.querySelector('[data-profile-id]');
      if (firstOption) firstOption.focus();
    }
  });

  dropdown.addEventListener('keydown', (e) => {
    const current = document.activeElement;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const next = current.nextElementSibling;
      if (next && next.dataset.profileId) next.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const prev = current.previousElementSibling;
      if (prev && prev.dataset.profileId) {
        prev.focus();
      } else {
        searchInput.focus();
      }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (current.dataset.profileId) {
        selectProfile(current.dataset.profileId, current.dataset.profileName);
      }
    } else if (e.key === 'Escape') {
      closeProfileCombobox();
      searchInput.focus();
    }
  });

  // Make dropdown options focusable
  dropdown.addEventListener('mouseover', (e) => {
    const option = e.target.closest('[data-profile-id]');
    if (option) option.setAttribute('tabindex', '0');
  });
}

// ============== RULE MODAL ==============

/**
 * Show the rule modal for creating/editing
 */
export function showRuleModal(rule = null) {
  const modal = document.getElementById('modal-rule');
  const overlay = document.getElementById('modal-overlay');
  const title = document.getElementById('modal-rule-title');
  const profiles = ProfilesView.getCachedProfiles();

  // Set form values
  document.getElementById('rule-id').value = rule?.id || '';
  document.getElementById('rule-profile').value = rule?.profileId || '';
  document.getElementById('rule-name').value = rule?.name || '';
  document.getElementById('rule-type').value = rule?.type || 'Text';
  document.getElementById('rule-value').value = rule?.value || '';
  document.getElementById('rule-site').value = rule?.site || '';
  document.getElementById('rule-mode').value = rule?.mode || 'Overwrite';

  // Set profile search input value
  const searchInput = document.getElementById('rule-profile-search');
  if (rule?.profileId) {
    const profile = profiles.find(p => p.id === rule.profileId);
    searchInput.value = profile ? profile.name : '';
  } else {
    searchInput.value = '';
  }

  // Update title
  title.textContent = rule ? 'Edit Rule' : 'Add Rule';

  // Show modal
  overlay.classList.remove('hidden');
  modal.classList.remove('hidden');
  document.getElementById('modal-profile').classList.add('hidden');

  // Focus search field
  searchInput.focus();
}

/**
 * Handle save rule form submission
 */
export async function handleSaveRule(event) {
  event.preventDefault();

  const id = document.getElementById('rule-id').value;
  const profileId = document.getElementById('rule-profile').value;
  const name = document.getElementById('rule-name').value.trim();
  const type = document.getElementById('rule-type').value;
  const value = document.getElementById('rule-value').value;
  const site = document.getElementById('rule-site').value.trim() || null;
  const mode = document.getElementById('rule-mode').value;

  if (!profileId) {
    showToast('Please select a profile', 'error');
    return;
  }

  if (!name) {
    showToast('Field name is required', 'error');
    return;
  }

  try {
    const messageType = id ? 'UPDATE_RULE' : 'CREATE_RULE';
    const data = { profileId, name, type, value, site, mode };
    if (id) data.id = id;

    const result = await sendMessage(messageType, data);

    if (result.success) {
      showToast(id ? 'Rule updated' : 'Rule created', 'success');
      hideModal();
      await loadAllRules();
      await SettingsSection.loadStats();
    } else {
      throw new Error(result.error || 'Failed to save rule');
    }
  } catch (error) {
    console.error('Failed to save rule:', error);
    showToast('Failed to save rule: ' + error.message, 'error');
  }
}

/**
 * Handle delete rule
 */
export async function handleDeleteRule(ruleId) {
  const rule = cachedRules.find(r => r.id === ruleId);
  if (!rule) return;

  if (!confirm(`Are you sure you want to delete this rule for field "${rule.name}"?`)) {
    return;
  }

  try {
    const result = await sendMessage('DELETE_RULE', { id: ruleId });

    if (result.success) {
      showToast('Rule deleted', 'success');
      await loadAllRules();
      await SettingsSection.loadStats();
    } else {
      throw new Error(result.error || 'Failed to delete rule');
    }
  } catch (error) {
    console.error('Failed to delete rule:', error);
    showToast('Failed to delete rule: ' + error.message, 'error');
  }
}

/**
 * Setup event listeners for rules view
 */
export function setupRulesListeners() {
  document.getElementById('btn-add-rule').addEventListener('click', () => showRuleModal());
  document.getElementById('btn-save-rule').addEventListener('click', handleSaveRule);
  document.getElementById('btn-cancel-rule').addEventListener('click', hideModal);
  setupProfileCombobox();
}

export default {
  getCachedRules,
  loadAllRules,
  renderRules,
  showRuleModal,
  handleSaveRule,
  handleDeleteRule,
  setupProfileCombobox,
  setupRulesListeners
};
