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

let currentTab = 'profiles';

function switchTab(tabName) {
  currentTab = tabName;

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
  searchQuery = '';
  profilesPage = 1;
  rulesPage = 1;

  // Re-render with reset state
  if (tabName === 'profiles') {
    renderProfiles(cachedProfiles);
  } else {
    renderRules(cachedRules);
  }
}

// ============== SEARCH & PAGINATION ==============

const ITEMS_PER_PAGE = 10;
let searchQuery = '';
let profilesPage = 1;
let rulesPage = 1;

function handleSearch(event) {
  searchQuery = event.target.value.toLowerCase().trim();
  profilesPage = 1;
  rulesPage = 1;

  if (currentTab === 'profiles') {
    renderProfiles(cachedProfiles);
  } else {
    renderRules(cachedRules);
  }
}

function filterProfiles(profiles) {
  if (!searchQuery) return profiles;
  return profiles.filter(p =>
    (p.name && p.name.toLowerCase().includes(searchQuery)) ||
    (p.site && p.site.toLowerCase().includes(searchQuery)) ||
    (p.hotkey && p.hotkey.toLowerCase().includes(searchQuery))
  );
}

function filterRules(rules) {
  if (!searchQuery) return rules;
  return rules.filter(r =>
    (r.name && r.name.toLowerCase().includes(searchQuery)) ||
    (r.value && r.value.toLowerCase().includes(searchQuery)) ||
    (r.type && r.type.toLowerCase().includes(searchQuery)) ||
    (r.site && r.site.toLowerCase().includes(searchQuery))
  );
}

function paginate(items, page) {
  const start = (page - 1) * ITEMS_PER_PAGE;
  return items.slice(start, start + ITEMS_PER_PAGE);
}

function updatePagination(type, filteredCount, totalCount) {
  const pagination = document.getElementById(`${type}-pagination`);
  const pageInfo = document.getElementById(`${type}-page-info`);
  const prevBtn = document.getElementById(`${type}-prev`);
  const nextBtn = document.getElementById(`${type}-next`);
  const resultsCount = document.getElementById('search-results-count');

  const page = type === 'profiles' ? profilesPage : rulesPage;
  const totalPages = Math.ceil(filteredCount / ITEMS_PER_PAGE);

  if (filteredCount === 0) {
    pagination.classList.add('hidden');
    resultsCount.textContent = searchQuery ? 'No results' : '';
    return;
  }

  if (totalPages > 1) {
    pagination.classList.remove('hidden');
    pagination.classList.add('flex');
    const start = (page - 1) * ITEMS_PER_PAGE + 1;
    const end = Math.min(page * ITEMS_PER_PAGE, filteredCount);
    pageInfo.textContent = `${start}-${end} of ${filteredCount}`;
    prevBtn.disabled = page <= 1;
    nextBtn.disabled = page >= totalPages;
  } else {
    pagination.classList.add('hidden');
  }

  // Update results count
  if (searchQuery) {
    resultsCount.textContent = `${filteredCount} result${filteredCount !== 1 ? 's' : ''}`;
  } else {
    resultsCount.textContent = '';
  }
}

function handleProfilesPrev() {
  if (profilesPage > 1) {
    profilesPage--;
    renderProfiles(cachedProfiles);
  }
}

function handleProfilesNext() {
  const filtered = filterProfiles(cachedProfiles);
  if (profilesPage < Math.ceil(filtered.length / ITEMS_PER_PAGE)) {
    profilesPage++;
    renderProfiles(cachedProfiles);
  }
}

function handleRulesPrev() {
  if (rulesPage > 1) {
    rulesPage--;
    renderRules(cachedRules);
  }
}

function handleRulesNext() {
  const filtered = filterRules(cachedRules);
  if (rulesPage < Math.ceil(filtered.length / ITEMS_PER_PAGE)) {
    rulesPage++;
    renderRules(cachedRules);
  }
}

// ============== PROFILES ==============

let cachedProfiles = [];

async function loadProfiles() {
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

function renderProfiles(profiles) {
  const emptyState = document.getElementById('profiles-empty');
  const table = document.getElementById('profiles-table');
  const tbody = document.getElementById('profiles-tbody');

  // Filter and paginate
  const filtered = filterProfiles(profiles);
  const paginated = paginate(filtered, profilesPage);

  // Update pagination
  updatePagination('profiles', filtered.length, profiles.length);

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

// Track inline rules for the profile modal
let inlineRules = [];
let deletedRuleIds = [];

function showProfileModal(profile = null) {
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
    inlineRules = cachedRules.filter(r => r.profileId === profile.id).map(r => ({ ...r }));
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

function renderInlineRules() {
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

function handleInlineRuleChange(event) {
  const row = event.target.closest('tr');
  const index = parseInt(row.dataset.index, 10);
  const field = event.target.dataset.field;
  const value = event.target.value;

  if (inlineRules[index]) {
    inlineRules[index][field] = value;
  }
}

function addInlineRule() {
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

function deleteInlineRule(index) {
  const rule = inlineRules[index];
  if (rule && rule.id) {
    // Mark existing rule for deletion
    deletedRuleIds.push(rule.id);
  }
  inlineRules.splice(index, 1);
  renderInlineRules();
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
    await loadAllRules();
    await loadStats();

  } catch (error) {
    console.error('Failed to save profile:', error);
    showToast('Failed to save: ' + error.message, 'error');
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

  // Filter and paginate
  const filtered = filterRules(rules);
  const paginated = paginate(filtered, rulesPage);

  // Update pagination
  updatePagination('rules', filtered.length, rules.length);

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

// ============== PROFILE COMBOBOX ==============

let profileComboboxOpen = false;

function renderProfileDropdown(filter = '') {
  const dropdown = document.getElementById('profile-dropdown');
  const filterLower = filter.toLowerCase();

  const filtered = cachedProfiles.filter(p =>
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

function openProfileCombobox() {
  const dropdown = document.getElementById('profile-dropdown');
  const searchInput = document.getElementById('rule-profile-search');

  renderProfileDropdown(searchInput.value);
  dropdown.classList.remove('hidden');
  profileComboboxOpen = true;
}

function closeProfileCombobox() {
  const dropdown = document.getElementById('profile-dropdown');
  dropdown.classList.add('hidden');
  profileComboboxOpen = false;
}

function selectProfile(profileId, profileName) {
  document.getElementById('rule-profile').value = profileId;
  document.getElementById('rule-profile-search').value = profileName;
  closeProfileCombobox();
}

function handleProfileSearchInput(event) {
  const value = event.target.value;
  renderProfileDropdown(value);

  // Clear selection if user types something different
  const hiddenInput = document.getElementById('rule-profile');
  const currentProfile = cachedProfiles.find(p => p.id === hiddenInput.value);
  if (currentProfile && currentProfile.name !== value) {
    hiddenInput.value = '';
  }

  if (!profileComboboxOpen) {
    openProfileCombobox();
  }
}

function handleProfileDropdownClick(event) {
  const option = event.target.closest('[data-profile-id]');
  if (option) {
    selectProfile(option.dataset.profileId, option.dataset.profileName);
  }
}

function setupProfileCombobox() {
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

function showRuleModal(rule = null) {
  const modal = document.getElementById('modal-rule');
  const overlay = document.getElementById('modal-overlay');
  const title = document.getElementById('modal-rule-title');

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
    const profile = cachedProfiles.find(p => p.id === rule.profileId);
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

  // Search
  document.getElementById('search-input').addEventListener('input', handleSearch);

  // Pagination
  document.getElementById('profiles-prev').addEventListener('click', handleProfilesPrev);
  document.getElementById('profiles-next').addEventListener('click', handleProfilesNext);
  document.getElementById('rules-prev').addEventListener('click', handleRulesPrev);
  document.getElementById('rules-next').addEventListener('click', handleRulesNext);

  // Profile management
  document.getElementById('btn-add-profile').addEventListener('click', () => showProfileModal());
  document.getElementById('btn-save-profile').addEventListener('click', handleSaveProfile);
  document.getElementById('btn-cancel-profile').addEventListener('click', hideModal);

  // Inline rules management (in profile modal)
  document.getElementById('btn-add-rule-inline').addEventListener('click', addInlineRule);

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
    const index = btn.dataset.index;

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
      case 'delete-inline-rule':
        deleteInlineRule(parseInt(index, 10));
        break;
    }
  });
}

async function init() {
  setupEventListeners();
  setupProfileCombobox();
  await loadAuthStatus();
  await loadSettings();
  await loadProfiles();
  await loadAllRules();
  await loadStats();
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', init);
