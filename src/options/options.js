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
    toast.remove();
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
      emailEl.textContent = status.userEmail || 'Connected';
    } else {
      disconnectedEl.classList.remove('hidden');
      connectedEl.classList.add('hidden');
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
}

async function init() {
  setupEventListeners();
  await loadAuthStatus();
  await loadSettings();
  await loadStats();
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', init);
