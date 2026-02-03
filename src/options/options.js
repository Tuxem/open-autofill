/**
 * Options page script for Open Autofill
 */

// Send message to background script
function sendMessage(type, data = {}) {
  return browser.runtime.sendMessage({ type, ...data });
}

// Show toast notification
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(20px)';
    setTimeout(() => toast.remove(), 200);
  }, 3000);
}

// Format date for display
function formatDate(timestamp) {
  if (!timestamp) return 'Never';
  return new Date(timestamp).toLocaleString();
}

// ============== AUTH ==============

async function loadAuthStatus() {
  try {
    const status = await sendMessage('GET_AUTH_STATUS');

    const disconnectedEl = document.getElementById('auth-disconnected');
    const connectedEl = document.getElementById('auth-connected');
    const emailEl = document.getElementById('auth-email');

    if (status.isAuthenticated) {
      disconnectedEl.classList.add('hidden');
      connectedEl.classList.remove('hidden');
      connectedEl.classList.add('flex');
      emailEl.textContent = status.userEmail || 'Connected';
    } else {
      disconnectedEl.classList.remove('hidden');
      connectedEl.classList.add('hidden');
      connectedEl.classList.remove('flex');
    }
  } catch (error) {
    console.error('Failed to load auth status:', error);
  }
}

async function handleConnect() {
  try {
    const btn = document.getElementById('btn-connect');
    btn.disabled = true;
    btn.textContent = 'Connecting...';

    const result = await sendMessage('START_AUTH');

    if (result.success) {
      showToast('Successfully connected!', 'success');
      await loadAuthStatus();
    } else {
      throw new Error(result.error || 'Connection failed');
    }
  } catch (error) {
    console.error('Connection failed:', error);
    showToast('Connection failed: ' + error.message, 'error');
  } finally {
    const btn = document.getElementById('btn-connect');
    btn.disabled = false;
    btn.innerHTML = `
      <svg class="btn-icon" viewBox="0 0 24 24">
        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
      </svg>
      Connect with Google
    `;
  }
}

async function handleDisconnect() {
  try {
    await sendMessage('LOGOUT');
    showToast('Disconnected from Google', 'success');
    await loadAuthStatus();
  } catch (error) {
    console.error('Disconnect failed:', error);
    showToast('Disconnect failed: ' + error.message, 'error');
  }
}

// ============== SETTINGS ==============

async function loadSettings() {
  try {
    const { settings, syncState } = await sendMessage('GET_SETTINGS');

    document.getElementById('sheet-id').value = settings.sheetId || '';
    document.getElementById('profiles-tab').value = settings.profilesTabName || 'Profiles';
    document.getElementById('rules-tab').value = settings.rulesTabName || 'Rules';
    document.getElementById('sync-interval').value = settings.syncIntervalMinutes || 10;

    // Sync status
    document.getElementById('last-sync').textContent = formatDate(syncState.lastSyncAt);
    document.getElementById('sync-status-value').textContent = syncState.lastSyncStatus || '-';

    // Stats
    document.getElementById('stat-pending').textContent = syncState.pendingWrites?.length || 0;

  } catch (error) {
    console.error('Failed to load settings:', error);
  }
}

async function loadStats() {
  try {
    const profilesResponse = await sendMessage('GET_PROFILES');
    document.getElementById('stat-profiles').textContent = profilesResponse.profiles?.length || 0;

    // Count rules (we'd need a separate message for this, for now use profiles count)
    // This is a simplified version
    let rulesCount = 0;
    for (const profile of (profilesResponse.profiles || [])) {
      const rulesResponse = await sendMessage('GET_RULES_FOR_PROFILE', { profileId: profile.id });
      rulesCount += rulesResponse.rules?.length || 0;
    }
    document.getElementById('stat-rules').textContent = rulesCount;

  } catch (error) {
    console.error('Failed to load stats:', error);
  }
}

async function handleSaveSheetSettings() {
  try {
    const sheetId = document.getElementById('sheet-id').value.trim();
    const profilesTabName = document.getElementById('profiles-tab').value.trim();
    const rulesTabName = document.getElementById('rules-tab').value.trim();

    await sendMessage('UPDATE_SETTINGS', {
      settings: {
        sheetId,
        profilesTabName,
        rulesTabName
      }
    });

    showToast('Sheet settings saved', 'success');

  } catch (error) {
    console.error('Failed to save settings:', error);
    showToast('Failed to save settings: ' + error.message, 'error');
  }
}

async function handleSaveSyncSettings() {
  try {
    const syncIntervalMinutes = parseInt(document.getElementById('sync-interval').value, 10);

    await sendMessage('UPDATE_SETTINGS', {
      settings: { syncIntervalMinutes }
    });

    showToast('Sync settings saved', 'success');

  } catch (error) {
    console.error('Failed to save sync settings:', error);
    showToast('Failed to save settings: ' + error.message, 'error');
  }
}

async function handleSyncNow() {
  try {
    const btn = document.getElementById('btn-sync-now');
    btn.disabled = true;
    btn.textContent = 'Syncing...';

    const result = await sendMessage('FORCE_SYNC');

    if (result.success) {
      showToast(`Synced: ${result.profilesCount} profiles, ${result.rulesCount} rules`, 'success');
    } else {
      throw new Error(result.error || 'Sync failed');
    }

    await loadSettings();
    await loadStats();

  } catch (error) {
    console.error('Sync failed:', error);
    showToast('Sync failed: ' + error.message, 'error');
  } finally {
    const btn = document.getElementById('btn-sync-now');
    btn.disabled = false;
    btn.textContent = 'Sync Now';
  }
}

// ============== IMPORT/EXPORT ==============

async function handleExport() {
  try {
    const { data } = await sendMessage('EXPORT_DATA');

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `open-autofill-backup-${new Date().toISOString().split('T')[0]}.json`;
    a.click();

    URL.revokeObjectURL(url);
    showToast('Data exported successfully', 'success');

  } catch (error) {
    console.error('Export failed:', error);
    showToast('Export failed: ' + error.message, 'error');
  }
}

function handleImportClick() {
  document.getElementById('import-file').click();
}

async function handleImport(event) {
  const file = event.target.files[0];
  if (!file) return;

  try {
    const text = await file.text();
    const data = JSON.parse(text);

    await sendMessage('IMPORT_DATA', { data });

    showToast('Data imported successfully', 'success');
    await loadSettings();
    await loadStats();

  } catch (error) {
    console.error('Import failed:', error);
    showToast('Import failed: ' + error.message, 'error');
  }

  // Reset the file input
  event.target.value = '';
}

// ============== TABS ==============

function switchTab(tabName) {
  // Update tab buttons
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tabName);
  });

  // Update tab panels
  document.querySelectorAll('.tab-panel').forEach(panel => {
    const isActive = panel.id === `panel-${tabName}`;
    panel.classList.toggle('hidden', !isActive);
  });
}

// ============== PROFILES ==============

let cachedProfiles = [];

async function loadProfiles() {
  try {
    const response = await sendMessage('GET_PROFILES');
    cachedProfiles = response.profiles || [];
    renderProfiles(cachedProfiles);
    updateProfilesDropdown();
    return cachedProfiles;
  } catch (error) {
    console.error('Failed to load profiles:', error);
    showToast('Failed to load profiles: ' + error.message, 'error');
    return [];
  }
}

function renderProfiles(profiles) {
  const emptyState = document.getElementById('profiles-empty');
  const table = document.getElementById('profiles-table');
  const tbody = document.getElementById('profiles-tbody');

  if (profiles.length === 0) {
    emptyState.classList.remove('hidden');
    table.classList.add('hidden');
    return;
  }

  emptyState.classList.add('hidden');
  table.classList.remove('hidden');

  tbody.innerHTML = profiles.map(profile => `
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

function showProfileModal(profile = null) {
  const modal = document.getElementById('modal-profile');
  const overlay = document.getElementById('modal-overlay');
  const title = document.getElementById('modal-profile-title');

  // Set form values
  document.getElementById('profile-id').value = profile?.id || '';
  document.getElementById('profile-name').value = profile?.name || '';
  document.getElementById('profile-site').value = profile?.site || '';
  document.getElementById('profile-hotkey').value = profile?.hotkey || '';

  // Update title
  title.textContent = profile ? 'Edit Profile' : 'Add Profile';

  // Show modal
  overlay.classList.remove('hidden');
  modal.classList.remove('hidden');
  document.getElementById('modal-rule').classList.add('hidden');

  // Focus first field
  document.getElementById('profile-name').focus();
}

async function handleSaveProfile(event) {
  event.preventDefault();

  const id = document.getElementById('profile-id').value;
  const name = document.getElementById('profile-name').value.trim();
  const site = document.getElementById('profile-site').value.trim() || null;
  const hotkey = document.getElementById('profile-hotkey').value.trim() || null;

  if (!name) {
    showToast('Profile name is required', 'error');
    return;
  }

  try {
    const messageType = id ? 'UPDATE_PROFILE' : 'CREATE_PROFILE';
    const data = { name, site, hotkey };
    if (id) data.id = id;

    const result = await sendMessage(messageType, data);

    if (result.success) {
      showToast(id ? 'Profile updated' : 'Profile created', 'success');
      hideModal();
      await loadProfiles();
      await loadAllRules();
      await loadStats();
    } else {
      throw new Error(result.error || 'Failed to save profile');
    }
  } catch (error) {
    console.error('Failed to save profile:', error);
    showToast('Failed to save profile: ' + error.message, 'error');
  }
}

async function handleDeleteProfile(profileId) {
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
      await loadAllRules();
      await loadStats();
    } else {
      throw new Error(result.error || 'Failed to delete profile');
    }
  } catch (error) {
    console.error('Failed to delete profile:', error);
    showToast('Failed to delete profile: ' + error.message, 'error');
  }
}

// ============== RULES ==============

let cachedRules = [];

async function loadAllRules() {
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

function renderRules(rules) {
  const emptyState = document.getElementById('rules-empty');
  const groupedContainer = document.getElementById('rules-grouped');

  if (rules.length === 0) {
    emptyState.classList.remove('hidden');
    groupedContainer.innerHTML = '';
    return;
  }

  emptyState.classList.add('hidden');

  // Group rules by profile
  const rulesByProfile = {};
  for (const rule of rules) {
    const profileId = rule.profileId || 'unknown';
    if (!rulesByProfile[profileId]) {
      rulesByProfile[profileId] = [];
    }
    rulesByProfile[profileId].push(rule);
  }

  // Create profile name map
  const profileNames = {};
  for (const profile of cachedProfiles) {
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

function updateProfilesDropdown() {
  const select = document.getElementById('rule-profile');
  const currentValue = select.value;

  // Keep the first option
  select.innerHTML = '<option value="">Select a profile...</option>';

  for (const profile of cachedProfiles) {
    const option = document.createElement('option');
    option.value = profile.id;
    option.textContent = profile.name;
    select.appendChild(option);
  }

  // Restore selection if still valid
  if (currentValue && cachedProfiles.some(p => p.id === currentValue)) {
    select.value = currentValue;
  }
}

function showRuleModal(rule = null) {
  const modal = document.getElementById('modal-rule');
  const overlay = document.getElementById('modal-overlay');
  const title = document.getElementById('modal-rule-title');

  // Update profiles dropdown first
  updateProfilesDropdown();

  // Set form values
  document.getElementById('rule-id').value = rule?.id || '';
  document.getElementById('rule-profile').value = rule?.profileId || '';
  document.getElementById('rule-name').value = rule?.name || '';
  document.getElementById('rule-type').value = rule?.type || 'Text';
  document.getElementById('rule-value').value = rule?.value || '';
  document.getElementById('rule-site').value = rule?.site || '';
  document.getElementById('rule-mode').value = rule?.mode || 'Overwrite';

  // Update title
  title.textContent = rule ? 'Edit Rule' : 'Add Rule';

  // Show modal
  overlay.classList.remove('hidden');
  modal.classList.remove('hidden');
  document.getElementById('modal-profile').classList.add('hidden');

  // Focus first field
  document.getElementById('rule-profile').focus();
}

async function handleSaveRule(event) {
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
      await loadStats();
    } else {
      throw new Error(result.error || 'Failed to save rule');
    }
  } catch (error) {
    console.error('Failed to save rule:', error);
    showToast('Failed to save rule: ' + error.message, 'error');
  }
}

async function handleDeleteRule(ruleId) {
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
      await loadStats();
    } else {
      throw new Error(result.error || 'Failed to delete rule');
    }
  } catch (error) {
    console.error('Failed to delete rule:', error);
    showToast('Failed to delete rule: ' + error.message, 'error');
  }
}

// ============== MODAL HELPERS ==============

function hideModal() {
  document.getElementById('modal-overlay').classList.add('hidden');
  document.getElementById('modal-profile').classList.add('hidden');
  document.getElementById('modal-rule').classList.add('hidden');
}

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ============== INITIALIZATION ==============

function setupEventListeners() {
  // Auth
  document.getElementById('btn-connect').addEventListener('click', handleConnect);
  document.getElementById('btn-disconnect').addEventListener('click', handleDisconnect);

  // Sheet settings
  document.getElementById('btn-save-sheet').addEventListener('click', handleSaveSheetSettings);

  // Sync settings
  document.getElementById('btn-save-sync').addEventListener('click', handleSaveSyncSettings);
  document.getElementById('btn-sync-now').addEventListener('click', handleSyncNow);

  // Import/Export
  document.getElementById('btn-export').addEventListener('click', handleExport);
  document.getElementById('btn-import').addEventListener('click', handleImportClick);
  document.getElementById('import-file').addEventListener('change', handleImport);

  // Tabs
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  // Profile management
  document.getElementById('btn-add-profile').addEventListener('click', () => showProfileModal());
  document.getElementById('btn-save-profile').addEventListener('click', handleSaveProfile);
  document.getElementById('btn-cancel-profile').addEventListener('click', hideModal);

  // Rule management
  document.getElementById('btn-add-rule').addEventListener('click', () => showRuleModal());
  document.getElementById('btn-save-rule').addEventListener('click', handleSaveRule);
  document.getElementById('btn-cancel-rule').addEventListener('click', hideModal);

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

    switch (action) {
      case 'edit-profile': {
        const profile = cachedProfiles.find(p => p.id === id);
        if (profile) showProfileModal(profile);
        break;
      }
      case 'delete-profile':
        handleDeleteProfile(id);
        break;
      case 'edit-rule': {
        const rule = cachedRules.find(r => r.id === id);
        if (rule) showRuleModal(rule);
        break;
      }
      case 'delete-rule':
        handleDeleteRule(id);
        break;
    }
  });
}

async function init() {
  setupEventListeners();
  await loadAuthStatus();
  await loadSettings();
  await loadProfiles();
  await loadAllRules();
  await loadStats();
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', init);
