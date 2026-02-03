/**
 * Storage abstraction layer for Open Autofill
 * Provides CRUD operations for profiles, rules, settings, syncState, and auth
 */

import {
  STORAGE_VERSION,
  DEFAULT_SETTINGS,
  DEFAULT_SYNC_STATE,
  DEFAULT_AUTH
} from '../../shared/constants.js';

// Initialize storage with default values if empty
async function initStorage() {
  const data = await browser.storage.local.get(null);

  if (!data.version) {
    await browser.storage.local.set({
      version: STORAGE_VERSION,
      profiles: {},
      rules: {},
      settings: { ...DEFAULT_SETTINGS },
      syncState: { ...DEFAULT_SYNC_STATE },
      auth: { ...DEFAULT_AUTH }
    });
  }

  return getAll();
}

// Get all storage data
async function getAll() {
  return browser.storage.local.get(null);
}

// ============== PROFILES ==============

async function getProfiles() {
  const { profiles } = await browser.storage.local.get('profiles');
  return profiles || {};
}

async function getProfile(profileId) {
  const profiles = await getProfiles();
  return profiles[profileId] || null;
}

async function saveProfile(profile) {
  const profiles = await getProfiles();
  profiles[profile.id] = {
    ...profile,
    syncedAt: profile.syncedAt || null
  };
  await browser.storage.local.set({ profiles });
  return profiles[profile.id];
}

async function deleteProfile(profileId) {
  const profiles = await getProfiles();
  delete profiles[profileId];
  await browser.storage.local.set({ profiles });

  // Also delete associated rules
  const rules = await getRules();
  const updatedRules = {};
  for (const [id, rule] of Object.entries(rules)) {
    if (rule.profileId !== profileId) {
      updatedRules[id] = rule;
    }
  }
  await browser.storage.local.set({ rules: updatedRules });
}

async function getProfilesForSite(siteUrl) {
  const profiles = await getProfiles();
  return Object.values(profiles).filter(profile =>
    !profile.site || urlMatchesPattern(siteUrl, profile.site)
  );
}

// ============== RULES ==============

async function getRules() {
  const { rules } = await browser.storage.local.get('rules');
  return rules || {};
}

async function getRule(ruleId) {
  const rules = await getRules();
  return rules[ruleId] || null;
}

async function saveRule(rule) {
  const rules = await getRules();
  rules[rule.id] = { ...rule };
  await browser.storage.local.set({ rules });
  return rules[rule.id];
}

async function deleteRule(ruleId) {
  const rules = await getRules();
  delete rules[ruleId];
  await browser.storage.local.set({ rules });
}

async function getRulesForProfile(profileId) {
  const rules = await getRules();
  return Object.values(rules).filter(rule => rule.profileId === profileId);
}

async function getRulesForSite(siteUrl) {
  const rules = await getRules();
  return Object.values(rules).filter(rule =>
    !rule.site || urlMatchesPattern(siteUrl, rule.site)
  );
}

// ============== SETTINGS ==============

async function getSettings() {
  const { settings } = await browser.storage.local.get('settings');
  return { ...DEFAULT_SETTINGS, ...settings };
}

async function updateSettings(updates) {
  const settings = await getSettings();
  const newSettings = { ...settings, ...updates };
  await browser.storage.local.set({ settings: newSettings });
  return newSettings;
}

// ============== SYNC STATE ==============

async function getSyncState() {
  const { syncState } = await browser.storage.local.get('syncState');
  return { ...DEFAULT_SYNC_STATE, ...syncState };
}

async function updateSyncState(updates) {
  const syncState = await getSyncState();
  const newSyncState = { ...syncState, ...updates };
  await browser.storage.local.set({ syncState: newSyncState });
  return newSyncState;
}

async function addPendingWrite(write) {
  const syncState = await getSyncState();
  syncState.pendingWrites.push({
    ...write,
    createdAt: Date.now(),
    retryCount: 0
  });
  await browser.storage.local.set({ syncState });
  return syncState;
}

async function removePendingWrite(writeId) {
  const syncState = await getSyncState();
  syncState.pendingWrites = syncState.pendingWrites.filter(w => w.id !== writeId);
  await browser.storage.local.set({ syncState });
  return syncState;
}

async function updatePendingWriteRetry(writeId) {
  const syncState = await getSyncState();
  const write = syncState.pendingWrites.find(w => w.id === writeId);
  if (write) {
    write.retryCount++;
    write.lastRetryAt = Date.now();
  }
  await browser.storage.local.set({ syncState });
  return syncState;
}

// ============== AUTH ==============

async function getAuth() {
  const { auth } = await browser.storage.local.get('auth');
  return { ...DEFAULT_AUTH, ...auth };
}

async function updateAuth(updates) {
  const auth = await getAuth();
  const newAuth = { ...auth, ...updates };
  await browser.storage.local.set({ auth: newAuth });
  return newAuth;
}

async function clearAuth() {
  await browser.storage.local.set({ auth: { ...DEFAULT_AUTH } });
}

async function isAuthenticated() {
  const auth = await getAuth();
  return !!(auth.accessToken && auth.tokenExpiresAt && auth.tokenExpiresAt > Date.now());
}

// ============== BULK OPERATIONS ==============

async function setProfiles(profiles) {
  await browser.storage.local.set({ profiles });
}

async function setRules(rules) {
  await browser.storage.local.set({ rules });
}

async function clearAllData() {
  await browser.storage.local.clear();
  await initStorage();
}

// ============== IMPORT/EXPORT ==============

async function exportData() {
  const data = await getAll();
  // Remove sensitive auth data
  const { auth, ...exportable } = data;
  return exportable;
}

async function importData(data) {
  // Validate structure
  if (!data.profiles || !data.rules) {
    throw new Error('Invalid data format: missing profiles or rules');
  }

  // Preserve auth and merge with imported data
  const auth = await getAuth();
  await browser.storage.local.set({
    ...data,
    auth,
    version: STORAGE_VERSION
  });

  return getAll();
}

// ============== HELPERS ==============

function urlMatchesPattern(url, pattern) {
  if (!pattern) return true;

  try {
    const currentUrl = new URL(url);
    const patternUrl = pattern.includes('://') ? new URL(pattern) : new URL('https://' + pattern);

    const currentHost = currentUrl.hostname.toLowerCase();
    const patternHost = patternUrl.hostname.toLowerCase();

    if (currentHost !== patternHost && !currentHost.endsWith('.' + patternHost)) {
      return false;
    }

    if (patternUrl.pathname && patternUrl.pathname !== '/') {
      if (!currentUrl.pathname.startsWith(patternUrl.pathname)) {
        return false;
      }
    }

    return true;
  } catch (e) {
    return url.includes(pattern);
  }
}

// Export the storage API
export const Storage = {
  // Initialization
  init: initStorage,
  getAll,

  // Profiles
  getProfiles,
  getProfile,
  saveProfile,
  deleteProfile,
  getProfilesForSite,
  setProfiles,

  // Rules
  getRules,
  getRule,
  saveRule,
  deleteRule,
  getRulesForProfile,
  getRulesForSite,
  setRules,

  // Settings
  getSettings,
  updateSettings,

  // Sync State
  getSyncState,
  updateSyncState,
  addPendingWrite,
  removePendingWrite,
  updatePendingWriteRetry,

  // Auth
  getAuth,
  updateAuth,
  clearAuth,
  isAuthenticated,

  // Bulk operations
  clearAllData,
  exportData,
  importData
};

export default Storage;
