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

/**
 * Handle saving Google Sheet settings
 */
export async function handleSaveSheetSettings() {
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
}

export default {
  loadSettings,
  loadStats,
  handleSaveSheetSettings,
  handleSaveSyncSettings,
  handleSyncNow,
  setupSettingsListeners
};
