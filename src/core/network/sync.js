/**
 * Google Sheets synchronization module
 * Handles bi-directional sync between local storage and Google Sheets
 */

import { SHEETS_API, SHEET_HEADERS, SYNC_RETRY } from '../../shared/constants.js';
import { Storage } from '../storage/storage.js';
import { OAuth } from './oauth.js';

// Make an authenticated request to Google Sheets API
async function sheetsRequest(endpoint, options = {}) {
  const accessToken = await OAuth.getValidAccessToken();

  const response = await fetch(`${SHEETS_API.baseUrl}${endpoint}`, {
    ...options,
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...options.headers
    }
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: { message: 'Unknown error' } }));
    throw new Error(`Sheets API error: ${error.error?.message || response.statusText}`);
  }

  return response.json();
}

// Get sheet data (all rows)
async function getSheetData(sheetId, tabName) {
  const range = encodeURIComponent(`${tabName}!A:Z`);
  const data = await sheetsRequest(`/${sheetId}/values/${range}`);
  return data.values || [];
}

// Get sheet metadata to find row count
async function getSheetMetadata(sheetId) {
  const data = await sheetsRequest(`/${sheetId}?fields=sheets(properties(title,sheetId,gridProperties))`);
  return data.sheets || [];
}

// Parse sheet rows into objects based on headers
function parseSheetRows(rows, expectedHeaders) {
  if (!rows || rows.length < 1) return [];

  const headers = rows[0];
  const items = [];

  // Validate headers match expected
  const headerMap = {};
  for (let i = 0; i < headers.length; i++) {
    headerMap[headers[i]] = i;
  }

  // Parse each data row
  for (let rowIndex = 1; rowIndex < rows.length; rowIndex++) {
    const row = rows[rowIndex];
    if (!row || row.length === 0 || !row[0]) continue; // Skip empty rows

    const item = { _rowNumber: rowIndex + 1 }; // 1-indexed for Sheets API

    for (const header of expectedHeaders) {
      const colIndex = headerMap[header];
      item[header] = colIndex !== undefined ? (row[colIndex] || '') : '';
    }

    items.push(item);
  }

  return items;
}

// Convert profile object from sheet format to local format
function sheetProfileToLocal(sheetProfile) {
  return {
    id: sheetProfile.ID,
    name: sheetProfile.Name || '',
    hotkey: sheetProfile.Hotkey || null,
    site: sheetProfile.Site || null,
    syncedAt: Date.now()
  };
}

// Convert local profile to sheet format
function localProfileToSheet(profile) {
  return [
    profile.id,
    profile.name || '',
    profile.hotkey || '',
    profile.site || ''
  ];
}

// Convert rule object from sheet format to local format
function sheetRuleToLocal(sheetRule) {
  return {
    id: sheetRule.ID,
    type: sheetRule.Type || 'Text',
    name: sheetRule.Name || '',
    value: sheetRule.Value || '',
    site: sheetRule.Site || null,
    mode: sheetRule.Mode || 'Overwrite',
    profileId: sheetRule['Profile ID'] || ''
  };
}

// Convert local rule to sheet format
function localRuleToSheet(rule) {
  return [
    rule.id,
    rule.type || 'Text',
    rule.name || '',
    rule.value || '',
    rule.site || '',
    rule.mode || 'Overwrite',
    rule.profileId || ''
  ];
}

// Update a single row in a sheet
async function updateSheetRow(sheetId, tabName, rowNumber, values) {
  const range = encodeURIComponent(`${tabName}!A${rowNumber}:Z${rowNumber}`);
  await sheetsRequest(`/${sheetId}/values/${range}?valueInputOption=USER_ENTERED`, {
    method: 'PUT',
    body: JSON.stringify({
      range: `${tabName}!A${rowNumber}`,
      majorDimension: 'ROWS',
      values: [values]
    })
  });
}

// Append a new row to a sheet
async function appendSheetRow(sheetId, tabName, values) {
  const range = encodeURIComponent(`${tabName}!A:Z`);
  const result = await sheetsRequest(`/${sheetId}/values/${range}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`, {
    method: 'POST',
    body: JSON.stringify({
      majorDimension: 'ROWS',
      values: [values]
    })
  });

  // Extract the row number from the updated range
  const updatedRange = result.updates?.updatedRange || '';
  const match = updatedRange.match(/!A(\d+)/);
  return match ? parseInt(match[1], 10) : null;
}

// Delete a row from a sheet (by clearing it - actual deletion requires different API)
async function clearSheetRow(sheetId, tabName, rowNumber) {
  const range = encodeURIComponent(`${tabName}!A${rowNumber}:Z${rowNumber}`);
  await sheetsRequest(`/${sheetId}/values/${range}:clear`, {
    method: 'POST'
  });
}

// Pull data from Google Sheets to local storage
async function pullFromSheets() {
  const settings = await Storage.getSettings();

  if (!settings.sheetId) {
    throw new Error('No Google Sheet configured');
  }

  const sheetId = settings.sheetId;
  const profilesTabName = settings.profilesTabName;
  const rulesTabName = settings.rulesTabName;

  // Fetch both sheets
  const [profilesRows, rulesRows] = await Promise.all([
    getSheetData(sheetId, profilesTabName),
    getSheetData(sheetId, rulesTabName)
  ]);

  // Parse sheet data
  const sheetProfiles = parseSheetRows(profilesRows, SHEET_HEADERS.profiles);
  const sheetRules = parseSheetRows(rulesRows, SHEET_HEADERS.rules);

  // Get current local data
  const localProfiles = await Storage.getProfiles();
  const localRules = await Storage.getRules();

  // Build new profiles map and row mapping
  const newProfiles = {};
  const profileRowMapping = {};

  for (const sheetProfile of sheetProfiles) {
    const profileId = sheetProfile.ID;
    if (!profileId) continue;

    newProfiles[profileId] = sheetProfileToLocal(sheetProfile);
    profileRowMapping[profileId] = sheetProfile._rowNumber;
  }

  // Build new rules map and row mapping
  const newRules = {};
  const ruleRowMapping = {};

  for (const sheetRule of sheetRules) {
    const ruleId = sheetRule.ID;
    if (!ruleId) continue;

    newRules[ruleId] = sheetRuleToLocal(sheetRule);
    ruleRowMapping[ruleId] = sheetRule._rowNumber;
  }

  // Update local storage
  await Storage.setProfiles(newProfiles);
  await Storage.setRules(newRules);

  // Update sync state with row mappings
  await Storage.updateSyncState({
    profileRowMapping,
    ruleRowMapping,
    lastSyncAt: Date.now(),
    lastSyncStatus: 'success',
    lastSyncError: null
  });

  return {
    profilesCount: Object.keys(newProfiles).length,
    rulesCount: Object.keys(newRules).length
  };
}

// Push a profile to Google Sheets
async function pushProfile(profile) {
  const settings = await Storage.getSettings();
  const syncState = await Storage.getSyncState();

  if (!settings.sheetId) {
    throw new Error('No Google Sheet configured');
  }

  const sheetId = settings.sheetId;
  const tabName = settings.profilesTabName;
  const values = localProfileToSheet(profile);

  // Check if profile already exists in sheet
  const existingRow = syncState.profileRowMapping[profile.id];

  if (existingRow) {
    // Update existing row
    await updateSheetRow(sheetId, tabName, existingRow, values);
  } else {
    // Append new row
    const newRow = await appendSheetRow(sheetId, tabName, values);
    if (newRow) {
      syncState.profileRowMapping[profile.id] = newRow;
      await Storage.updateSyncState({
        profileRowMapping: syncState.profileRowMapping
      });
    }
  }

  // Update local profile with sync timestamp
  profile.syncedAt = Date.now();
  await Storage.saveProfile(profile);

  return profile;
}

// Push a rule to Google Sheets
async function pushRule(rule) {
  const settings = await Storage.getSettings();
  const syncState = await Storage.getSyncState();

  if (!settings.sheetId) {
    throw new Error('No Google Sheet configured');
  }

  const sheetId = settings.sheetId;
  const tabName = settings.rulesTabName;
  const values = localRuleToSheet(rule);

  // Check if rule already exists in sheet
  const existingRow = syncState.ruleRowMapping[rule.id];

  if (existingRow) {
    // Update existing row
    await updateSheetRow(sheetId, tabName, existingRow, values);
  } else {
    // Append new row
    const newRow = await appendSheetRow(sheetId, tabName, values);
    if (newRow) {
      syncState.ruleRowMapping[rule.id] = newRow;
      await Storage.updateSyncState({
        ruleRowMapping: syncState.ruleRowMapping
      });
    }
  }

  return rule;
}

// Delete a profile from Google Sheets
async function deleteProfileFromSheet(profileId) {
  const settings = await Storage.getSettings();
  const syncState = await Storage.getSyncState();

  if (!settings.sheetId) return;

  const rowNumber = syncState.profileRowMapping[profileId];
  if (rowNumber) {
    await clearSheetRow(settings.sheetId, settings.profilesTabName, rowNumber);
    delete syncState.profileRowMapping[profileId];
    await Storage.updateSyncState({
      profileRowMapping: syncState.profileRowMapping
    });
  }
}

// Delete a rule from Google Sheets
async function deleteRuleFromSheet(ruleId) {
  const settings = await Storage.getSettings();
  const syncState = await Storage.getSyncState();

  if (!settings.sheetId) return;

  const rowNumber = syncState.ruleRowMapping[ruleId];
  if (rowNumber) {
    await clearSheetRow(settings.sheetId, settings.rulesTabName, rowNumber);
    delete syncState.ruleRowMapping[ruleId];
    await Storage.updateSyncState({
      ruleRowMapping: syncState.ruleRowMapping
    });
  }
}

// Process pending writes with retry logic
async function processPendingWrites() {
  const syncState = await Storage.getSyncState();
  const pendingWrites = [...syncState.pendingWrites];

  for (const write of pendingWrites) {
    try {
      if (write.type === 'profile') {
        if (write.action === 'delete') {
          await deleteProfileFromSheet(write.id);
        } else {
          const profile = await Storage.getProfile(write.id);
          if (profile) {
            await pushProfile(profile);
          }
        }
      } else if (write.type === 'rule') {
        if (write.action === 'delete') {
          await deleteRuleFromSheet(write.id);
        } else {
          const rule = await Storage.getRule(write.id);
          if (rule) {
            await pushRule(rule);
          }
        }
      }

      // Remove from pending writes on success
      await Storage.removePendingWrite(write.id);

    } catch (error) {
      console.error(`Failed to process pending write ${write.id}:`, error);

      // Update retry count
      await Storage.updatePendingWriteRetry(write.id);

      // Remove if max retries exceeded
      if (write.retryCount >= SYNC_RETRY.maxRetries) {
        console.error(`Max retries exceeded for write ${write.id}, removing from queue`);
        await Storage.removePendingWrite(write.id);
      }
    }
  }
}

// Full sync (pull then process pending writes)
async function fullSync() {
  const settings = await Storage.getSettings();

  if (!settings.sheetId) {
    await Storage.updateSyncState({
      lastSyncStatus: 'error',
      lastSyncError: 'No Google Sheet configured'
    });
    throw new Error('No Google Sheet configured');
  }

  try {
    // Check authentication
    const isAuth = await Storage.isAuthenticated();
    if (!isAuth) {
      throw new Error('Not authenticated');
    }

    // Pull from sheets (Google wins on conflicts)
    const pullResult = await pullFromSheets();

    // Process any pending writes
    await processPendingWrites();

    await Storage.updateSyncState({
      lastSyncAt: Date.now(),
      lastSyncStatus: 'success',
      lastSyncError: null
    });

    return {
      success: true,
      ...pullResult
    };

  } catch (error) {
    console.error('Sync failed:', error);

    await Storage.updateSyncState({
      lastSyncAt: Date.now(),
      lastSyncStatus: 'error',
      lastSyncError: error.message
    });

    throw error;
  }
}

// Queue a write operation
async function queueWrite(type, id, action = 'upsert') {
  const writeId = `${type}_${id}_${Date.now()}`;
  await Storage.addPendingWrite({
    id: writeId,
    type,
    itemId: id,
    action
  });

  // Try to process immediately
  try {
    await processPendingWrites();
  } catch (e) {
    console.warn('Immediate write failed, will retry:', e);
  }
}

// Export Sync module
export const Sync = {
  pullFromSheets,
  pushProfile,
  pushRule,
  deleteProfileFromSheet,
  deleteRuleFromSheet,
  fullSync,
  processPendingWrites,
  queueWrite,
  // Utility exports for testing
  getSheetData,
  parseSheetRows
};

export default Sync;
