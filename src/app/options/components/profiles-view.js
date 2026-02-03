/**
 * Profiles view component
 * Handles profile list, creation, editing, and deletion
 */

import { showToast } from './toast.js';
import { hideModal, escapeHtml } from './modal-manager.js';
import * as SearchPagination from './search-pagination.js';
import * as RulesView from './rules-view.js';
import * as SettingsSection from './settings-section.js';
import { sendMessage } from '../options.js';

// State
let cachedProfiles = [];
let inlineRules = [];
let deletedRuleIds = [];

/**
 * Get cached profiles
 */
export function getCachedProfiles() {
  return cachedProfiles;
}

/**
 * Load profiles from the background script
 */
export async function loadProfiles() {
  try {
    const response = await sendMessage('GET_PROFILES');
    cachedProfiles = response.profiles || [];
    renderProfiles(cachedProfiles);
    return cachedProfiles;
  } catch (error) {
    console.error('Failed to load profiles:', error);
    showToast('Failed to load profiles: ' + error.message, 'error');
    return [];
  }
}

/**
 * Render profiles list
 */
export function renderProfiles(profiles) {
  const emptyState = document.getElementById('profiles-empty');
  const table = document.getElementById('profiles-table');
  const tbody = document.getElementById('profiles-tbody');

  // Filter and paginate
  const filtered = SearchPagination.filterProfiles(profiles);
  const paginated = SearchPagination.paginate(filtered, SearchPagination.profilesPage);

  // Update pagination
  SearchPagination.updatePagination('profiles', filtered.length, profiles.length);

  if (profiles.length === 0) {
    emptyState.classList.remove('hidden');
    emptyState.querySelector('p').textContent = 'No profiles yet. Create your first profile to start auto-filling forms.';
    table.classList.add('hidden');
    return;
  }

  if (filtered.length === 0) {
    emptyState.classList.remove('hidden');
    emptyState.querySelector('p').textContent = 'No profiles match your search.';
    table.classList.add('hidden');
    return;
  }

  emptyState.classList.add('hidden');
  table.classList.remove('hidden');

  tbody.innerHTML = paginated.map(profile => `
    <tr data-id="${profile.id}">
      <td>${escapeHtml(profile.name)}</td>
      <td class="max-w-[200px] truncate">${profile.site ? escapeHtml(profile.site) : '<span class="text-gray-400 italic">(all sites)</span>'}</td>
      <td>${profile.hotkey ? escapeHtml(profile.hotkey) : '<span class="text-gray-400 italic">-</span>'}</td>
      <td class="flex gap-2">
        <button class="btn-icon-only btn-edit" title="Edit" data-action="edit-profile" data-id="${profile.id}">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
          </svg>
        </button>
        <button class="btn-icon-only btn-delete" title="Delete" data-action="delete-profile" data-id="${profile.id}">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="3 6 5 6 21 6"/>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
          </svg>
        </button>
      </td>
    </tr>
  `).join('');
}

/**
 * Show the profile modal for creating/editing
 */
export function showProfileModal(profile = null) {
  const modal = document.getElementById('modal-profile');
  const overlay = document.getElementById('modal-overlay');
  const title = document.getElementById('modal-profile-title');
  const rulesSection = document.getElementById('profile-rules-section');

  // Reset inline rules tracking
  inlineRules = [];
  deletedRuleIds = [];

  // Set form values
  document.getElementById('profile-id').value = profile?.id || '';
  document.getElementById('profile-name').value = profile?.name || '';
  document.getElementById('profile-site').value = profile?.site || '';
  document.getElementById('profile-hotkey').value = profile?.hotkey || '';

  // Update title
  title.textContent = profile ? 'Edit Profile' : 'Add Profile';

  // Show/hide rules section based on edit mode
  if (profile) {
    rulesSection.classList.remove('hidden');
    // Load rules for this profile
    inlineRules = RulesView.getCachedRules().filter(r => r.profileId === profile.id).map(r => ({ ...r }));
    renderInlineRules();
  } else {
    rulesSection.classList.add('hidden');
  }

  // Show modal
  overlay.classList.remove('hidden');
  modal.classList.remove('hidden');
  document.getElementById('modal-rule').classList.add('hidden');

  // Focus first field
  document.getElementById('profile-name').focus();
}

/**
 * Render inline rules table in profile modal
 */
export function renderInlineRules() {
  const emptyState = document.getElementById('profile-rules-empty');
  const table = document.getElementById('profile-rules-table');
  const tbody = document.getElementById('profile-rules-tbody');

  if (inlineRules.length === 0) {
    emptyState.classList.remove('hidden');
    table.classList.add('hidden');
    return;
  }

  emptyState.classList.add('hidden');
  table.classList.remove('hidden');

  tbody.innerHTML = inlineRules.map((rule, index) => `
    <tr data-index="${index}">
      <td>
        <input type="text" class="form-input text-sm py-1.5" value="${escapeHtml(rule.name)}"
               data-field="name" placeholder="Field name" required>
      </td>
      <td>
        <input type="text" class="form-input text-sm py-1.5" value="${escapeHtml(rule.value)}"
               data-field="value" placeholder="Value">
      </td>
      <td>
        <select class="form-select text-sm py-1.5" data-field="type">
          <option value="Text" ${rule.type === 'Text' ? 'selected' : ''}>Text</option>
          <option value="Select" ${rule.type === 'Select' ? 'selected' : ''}>Select</option>
          <option value="Checkbox" ${rule.type === 'Checkbox' ? 'selected' : ''}>Checkbox</option>
          <option value="Radio" ${rule.type === 'Radio' ? 'selected' : ''}>Radio</option>
        </select>
      </td>
      <td>
        <select class="form-select text-sm py-1.5" data-field="mode">
          <option value="Overwrite" ${rule.mode === 'Overwrite' ? 'selected' : ''}>Overwrite</option>
          <option value="Append" ${rule.mode === 'Append' ? 'selected' : ''}>Append</option>
          <option value="Skip if filled" ${rule.mode === 'Skip if filled' ? 'selected' : ''}>Skip if filled</option>
        </select>
      </td>
      <td>
        <button type="button" class="btn-icon-only btn-delete" title="Delete rule" data-action="delete-inline-rule" data-index="${index}">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="3 6 5 6 21 6"/>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
          </svg>
        </button>
      </td>
    </tr>
  `).join('');

  // Add change listeners to update inlineRules
  tbody.querySelectorAll('input, select').forEach(el => {
    el.addEventListener('change', handleInlineRuleChange);
    el.addEventListener('input', handleInlineRuleChange);
  });
}

/**
 * Handle inline rule field change
 */
function handleInlineRuleChange(event) {
  const row = event.target.closest('tr');
  const index = parseInt(row.dataset.index, 10);
  const field = event.target.dataset.field;
  const value = event.target.value;

  if (inlineRules[index]) {
    inlineRules[index][field] = value;
  }
}

/**
 * Add a new inline rule
 */
export function addInlineRule() {
  const profileId = document.getElementById('profile-id').value;
  inlineRules.push({
    id: null, // New rule, will be created on save
    name: '',
    value: '',
    type: 'Text',
    mode: 'Overwrite',
    site: null,
    profileId: profileId
  });
  renderInlineRules();

  // Focus the new row's first input
  const tbody = document.getElementById('profile-rules-tbody');
  const lastRow = tbody.lastElementChild;
  if (lastRow) {
    const firstInput = lastRow.querySelector('input');
    if (firstInput) firstInput.focus();
  }
}

/**
 * Delete an inline rule
 */
export function deleteInlineRule(index) {
  const rule = inlineRules[index];
  if (rule && rule.id) {
    // Mark existing rule for deletion
    deletedRuleIds.push(rule.id);
  }
  inlineRules.splice(index, 1);
  renderInlineRules();
}

/**
 * Handle save profile form submission
 */
export async function handleSaveProfile(event) {
  event.preventDefault();

  const id = document.getElementById('profile-id').value;
  const name = document.getElementById('profile-name').value.trim();
  const site = document.getElementById('profile-site').value.trim() || null;
  const hotkey = document.getElementById('profile-hotkey').value.trim() || null;

  if (!name) {
    showToast('Profile name is required', 'error');
    return;
  }

  // Validate inline rules (if editing)
  if (id && inlineRules.length > 0) {
    for (const rule of inlineRules) {
      if (!rule.name.trim()) {
        showToast('All rules must have a field name', 'error');
        return;
      }
    }
  }

  try {
    // Save profile
    const messageType = id ? 'UPDATE_PROFILE' : 'CREATE_PROFILE';
    const data = { name, site, hotkey };
    if (id) data.id = id;

    const result = await sendMessage(messageType, data);

    if (!result.success) {
      throw new Error(result.error || 'Failed to save profile');
    }

    // Save rules (only when editing existing profile)
    if (id) {
      // Delete removed rules
      for (const ruleId of deletedRuleIds) {
        try {
          await sendMessage('DELETE_RULE', { id: ruleId });
        } catch (e) {
          console.warn('Failed to delete rule:', e);
        }
      }

      // Create or update rules
      for (const rule of inlineRules) {
        const ruleData = {
          name: rule.name.trim(),
          value: rule.value,
          type: rule.type,
          mode: rule.mode,
          site: rule.site,
          profileId: id
        };

        if (rule.id) {
          // Update existing rule
          ruleData.id = rule.id;
          await sendMessage('UPDATE_RULE', ruleData);
        } else {
          // Create new rule
          await sendMessage('CREATE_RULE', ruleData);
        }
      }
    }

    showToast(id ? 'Profile and rules saved' : 'Profile created', 'success');
    hideModal();
    await loadProfiles();
    await RulesView.loadAllRules();
    await SettingsSection.loadStats();

  } catch (error) {
    console.error('Failed to save profile:', error);
    showToast('Failed to save: ' + error.message, 'error');
  }
}

/**
 * Handle delete profile
 */
export async function handleDeleteProfile(profileId) {
  const profile = cachedProfiles.find(p => p.id === profileId);
  if (!profile) return;

  if (!confirm(`Are you sure you want to delete "${profile.name}"?\n\nThis will also delete all rules associated with this profile.`)) {
    return;
  }

  try {
    const result = await sendMessage('DELETE_PROFILE', { id: profileId });

    if (result.success) {
      showToast('Profile deleted', 'success');
      await loadProfiles();
      await RulesView.loadAllRules();
      await SettingsSection.loadStats();
    } else {
      throw new Error(result.error || 'Failed to delete profile');
    }
  } catch (error) {
    console.error('Failed to delete profile:', error);
    showToast('Failed to delete profile: ' + error.message, 'error');
  }
}

/**
 * Setup event listeners for profiles view
 */
export function setupProfilesListeners() {
  document.getElementById('btn-add-profile').addEventListener('click', () => showProfileModal());
  document.getElementById('btn-save-profile').addEventListener('click', handleSaveProfile);
  document.getElementById('btn-cancel-profile').addEventListener('click', hideModal);
  document.getElementById('btn-add-rule-inline').addEventListener('click', addInlineRule);
}

export default {
  getCachedProfiles,
  loadProfiles,
  renderProfiles,
  showProfileModal,
  renderInlineRules,
  addInlineRule,
  deleteInlineRule,
  handleSaveProfile,
  handleDeleteProfile,
  setupProfilesListeners
};
