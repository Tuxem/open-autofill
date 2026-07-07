/**
 * Settings section component
 * Handles Google Sheet and sync settings
 */

import { showToast } from './toast.js';
import { sendMessage, formatDate } from '../options.js';

/**
 * Load and display current settings
 */
export async function loadSettings() {
  try {
    const { settings, syncState } = await sendMessage('GET_SETTINGS');

    document.getElementById('sheet-id').value = extractSheetId(settings.sheetId);
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

/**
 * Load and display statistics
 */
export async function loadStats() {
  try {
    const profilesResponse = await sendMessage('GET_PROFILES');
    document.getElementById('stat-profiles').textContent = profilesResponse.profiles?.length || 0;

    // Count rules
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

// Accept either a bare sheet ID or a Google Sheets/Drive URL and return the ID.
// Handles: docs.google.com/spreadsheets/d/<id>/..., docs.google.com/spreadsheets/u/0/d/<id>/...,
// drive.google.com/open?id=<id>, drive.google.com/file/d/<id>/..., bare ID.
function extractSheetId(raw) {
  const trimmed = (raw || '').trim();
  if (!trimmed) return '';

  const patterns = [
    /\/spreadsheets\/(?:u\/\d+\/)?d\/([a-zA-Z0-9-_]+)/,
    /\/file\/d\/([a-zA-Z0-9-_]+)/,
    /[?&]id=([a-zA-Z0-9-_]+)/
  ];
  for (const pattern of patterns) {
    const match = trimmed.match(pattern);
    if (match) return match[1];
  }
  return trimmed;
}

export async function handleSaveSheetSettings() {
  const btn = document.getElementById('btn-save-sheet');
  const originalText = btn ? btn.textContent : null;
  try {
    const sheetIdInput = document.getElementById('sheet-id');
    const sheetId = extractSheetId(sheetIdInput.value);
    sheetIdInput.value = sheetId;
    const profilesTabName = document.getElementById('profiles-tab').value.trim();
    const rulesTabName = document.getElementById('rules-tab').value.trim();

    await sendMessage('UPDATE_SETTINGS', {
      settings: {
        sheetId,
        profilesTabName: profilesTabName || 'Profiles',
        rulesTabName: rulesTabName || 'Rules'
      }
    });

    showToast('Sheet settings saved', 'success');

    // Attempt a recovery sync: import existing sheet data, or create the
    // spreadsheet/tabs and push local data up if they don't exist yet.
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Syncing...';
    }

    const result = await sendMessage('SETUP_SYNC');

    if (result && result.success) {
      if (result.action === 'created-spreadsheet') {
        showToast(`New Google Sheet created — uploaded ${result.profilesCount} profiles, ${result.rulesCount} rules`, 'success');
      } else if (result.action === 'created-tabs') {
        showToast(`Created tab(s) ${result.createdTabs.join(', ')} — uploaded ${result.profilesCount} profiles, ${result.rulesCount} rules`, 'success');
      } else {
        showToast(`Sheet found — imported ${result.profilesCount} profiles, ${result.rulesCount} rules`, 'success');
      }
    }

    // Sheet ID may have changed (new spreadsheet) and data may have been imported
    await loadSettings();
    await loadStats();

  } catch (error) {
    console.error('Failed to setup sheet:', error);
    showToast('Failed to setup sheet: ' + error.message, 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = originalText || 'Save Sheet Settings';
    }
  }
}

/**
 * Handle saving sync settings
 */
export async function handleSaveSyncSettings() {
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

/**
 * Handle manual sync button
 */
export async function handleSyncNow() {
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

/**
 * Setup event listeners for settings section
 */
export function setupSettingsListeners() {
  document.getElementById('btn-save-sheet').addEventListener('click', handleSaveSheetSettings);
  document.getElementById('btn-save-sync').addEventListener('click', handleSaveSyncSettings);
  document.getElementById('btn-sync-now').addEventListener('click', handleSyncNow);

  const sheetIdInput = document.getElementById('sheet-id');
  const normalizeSheetIdField = () => {
    const extracted = extractSheetId(sheetIdInput.value);
    if (extracted !== sheetIdInput.value) sheetIdInput.value = extracted;
  };
  sheetIdInput.addEventListener('paste', () => setTimeout(normalizeSheetIdField, 0));
  sheetIdInput.addEventListener('blur', normalizeSheetIdField);
}

export default {
  loadSettings,
  loadStats,
  handleSaveSheetSettings,
  handleSaveSyncSettings,
  handleSyncNow,
  setupSettingsListeners
};
