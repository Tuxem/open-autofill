/**
 * Background service worker for Open Autofill
 * Orchestrates OAuth, sync, alarms, and messaging
 */

// Note: In Firefox MV3, background scripts run as modules
// Import paths are relative to the extension root

import {
  MESSAGE_TYPES,
  SHEETS_API,
  SHEET_HEADERS,
  SYNC_RETRY,
  OAUTH_CONFIG,
  TOKEN_REFRESH_MARGIN_MS,
  DEFAULT_SETTINGS,
  DEFAULT_SYNC_STATE,
  DEFAULT_AUTH,
  STORAGE_VERSION,
  CONTEXT_MENU_IDS
} from '../constants.js';

// ============== STORAGE MODULE ==============

const Storage = {
  async init() {
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
    return this.getAll();
  },

  async getAll() {
    return browser.storage.local.get(null);
  },

  async getProfiles() {
    const { profiles } = await browser.storage.local.get('profiles');
    return profiles || {};
  },

  async getProfile(profileId) {
    const profiles = await this.getProfiles();
    return profiles[profileId] || null;
  },

  async saveProfile(profile) {
    const profiles = await this.getProfiles();
    profiles[profile.id] = { ...profile, syncedAt: profile.syncedAt || null };
    await browser.storage.local.set({ profiles });
    return profiles[profile.id];
  },

  async deleteProfile(profileId) {
    const profiles = await this.getProfiles();
    delete profiles[profileId];
    await browser.storage.local.set({ profiles });
    const rules = await this.getRules();
    const updatedRules = {};
    for (const [id, rule] of Object.entries(rules)) {
      if (rule.profileId !== profileId) {
        updatedRules[id] = rule;
      }
    }
    await browser.storage.local.set({ rules: updatedRules });
  },

  async getProfilesForSite(siteUrl) {
    const profiles = await this.getProfiles();
    return Object.values(profiles).filter(profile =>
      !profile.site || urlMatchesPattern(siteUrl, profile.site)
    );
  },

  async getRules() {
    const { rules } = await browser.storage.local.get('rules');
    return rules || {};
  },

  async getRule(ruleId) {
    const rules = await this.getRules();
    return rules[ruleId] || null;
  },

  async saveRule(rule) {
    const rules = await this.getRules();
    rules[rule.id] = { ...rule };
    await browser.storage.local.set({ rules });
    return rules[rule.id];
  },

  async deleteRule(ruleId) {
    const rules = await this.getRules();
    delete rules[ruleId];
    await browser.storage.local.set({ rules });
  },

  async getRulesForProfile(profileId) {
    const rules = await this.getRules();
    return Object.values(rules).filter(rule => rule.profileId === profileId);
  },

  async setProfiles(profiles) {
    await browser.storage.local.set({ profiles });
  },

  async setRules(rules) {
    await browser.storage.local.set({ rules });
  },

  async getSettings() {
    const { settings } = await browser.storage.local.get('settings');
    return { ...DEFAULT_SETTINGS, ...settings };
  },

  async updateSettings(updates) {
    const settings = await this.getSettings();
    const newSettings = { ...settings, ...updates };
    await browser.storage.local.set({ settings: newSettings });
    return newSettings;
  },

  async getSyncState() {
    const { syncState } = await browser.storage.local.get('syncState');
    return { ...DEFAULT_SYNC_STATE, ...syncState };
  },

  async updateSyncState(updates) {
    const syncState = await this.getSyncState();
    const newSyncState = { ...syncState, ...updates };
    await browser.storage.local.set({ syncState: newSyncState });
    return newSyncState;
  },

  async addPendingWrite(write) {
    const syncState = await this.getSyncState();
    syncState.pendingWrites.push({ ...write, createdAt: Date.now(), retryCount: 0 });
    await browser.storage.local.set({ syncState });
    return syncState;
  },

  async removePendingWrite(writeId) {
    const syncState = await this.getSyncState();
    syncState.pendingWrites = syncState.pendingWrites.filter(w => w.id !== writeId);
    await browser.storage.local.set({ syncState });
    return syncState;
  },

  async updatePendingWriteRetry(writeId) {
    const syncState = await this.getSyncState();
    const write = syncState.pendingWrites.find(w => w.id === writeId);
    if (write) {
      write.retryCount++;
      write.lastRetryAt = Date.now();
    }
    await browser.storage.local.set({ syncState });
    return syncState;
  },

  async getAuth() {
    const { auth } = await browser.storage.local.get('auth');
    return { ...DEFAULT_AUTH, ...auth };
  },

  async updateAuth(updates) {
    const auth = await this.getAuth();
    const newAuth = { ...auth, ...updates };
    await browser.storage.local.set({ auth: newAuth });
    return newAuth;
  },

  async clearAuth() {
    await browser.storage.local.set({ auth: { ...DEFAULT_AUTH } });
  },

  async isAuthenticated() {
    const auth = await this.getAuth();
    return !!(auth.accessToken && auth.tokenExpiresAt && auth.tokenExpiresAt > Date.now());
  },

  async exportData() {
    const data = await this.getAll();
    const { auth, ...exportable } = data;
    return exportable;
  },

  async importData(data) {
    if (!data.profiles || !data.rules) {
      throw new Error('Invalid data format');
    }
    const auth = await this.getAuth();
    await browser.storage.local.set({ ...data, auth, version: STORAGE_VERSION });
    return this.getAll();
  }
};

// ============== OAUTH MODULE ==============

function generateRandomString(length) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return Array.from(array, byte => chars[byte % chars.length]).join('');
}

async function generateCodeChallenge(verifier) {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const digest = await crypto.subtle.digest('SHA-256', data);
  const base64 = btoa(String.fromCharCode(...new Uint8Array(digest)));
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

const OAuth = {
  async startAuthFlow() {
    try {
      const codeVerifier = generateRandomString(64);
      const codeChallenge = await generateCodeChallenge(codeVerifier);
      const state = generateRandomString(32);

      await browser.storage.local.set({ _oauthState: state, _codeVerifier: codeVerifier });

      const params = new URLSearchParams({
        client_id: OAUTH_CONFIG.clientId,
        redirect_uri: browser.identity.getRedirectURL(),
        response_type: 'code',
        scope: OAUTH_CONFIG.scopes.join(' '),
        state: state,
        code_challenge: codeChallenge,
        code_challenge_method: 'S256',
        access_type: 'offline',
        prompt: 'consent'
      });

      const authUrl = `${OAUTH_CONFIG.authEndpoint}?${params.toString()}`;
      const redirectUrl = await browser.identity.launchWebAuthFlow({ url: authUrl, interactive: true });

      const url = new URL(redirectUrl);
      const code = url.searchParams.get('code');
      const returnedState = url.searchParams.get('state');
      const error = url.searchParams.get('error');

      if (error) throw new Error(`Authorization error: ${error}`);

      const { _oauthState, _codeVerifier } = await browser.storage.local.get(['_oauthState', '_codeVerifier']);
      if (returnedState !== _oauthState) throw new Error('State mismatch');

      const tokenParams = new URLSearchParams({
        client_id: OAUTH_CONFIG.clientId,
        code: code,
        code_verifier: _codeVerifier,
        grant_type: 'authorization_code',
        redirect_uri: browser.identity.getRedirectURL()
      });

      const tokenResponse = await fetch(OAUTH_CONFIG.tokenEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: tokenParams.toString()
      });

      if (!tokenResponse.ok) {
        const err = await tokenResponse.json();
        throw new Error(`Token exchange failed: ${err.error_description || err.error}`);
      }

      const tokenData = await tokenResponse.json();
      const expiresAt = Date.now() + (tokenData.expires_in * 1000);

      let userEmail = null;
      try {
        const userResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
          headers: { 'Authorization': `Bearer ${tokenData.access_token}` }
        });
        if (userResponse.ok) {
          const userInfo = await userResponse.json();
          userEmail = userInfo.email;
        }
      } catch (e) { /* ignore */ }

      await Storage.updateAuth({
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token,
        tokenExpiresAt: expiresAt,
        userEmail: userEmail
      });

      await browser.storage.local.remove(['_oauthState', '_codeVerifier']);
      return { success: true, userEmail };

    } catch (error) {
      console.error('OAuth flow failed:', error);
      await browser.storage.local.remove(['_oauthState', '_codeVerifier']);
      throw error;
    }
  },

  async getValidAccessToken() {
    const auth = await Storage.getAuth();
    if (!auth.accessToken) throw new Error('Not authenticated');

    const needsRefresh = !auth.tokenExpiresAt || (Date.now() > auth.tokenExpiresAt - TOKEN_REFRESH_MARGIN_MS);

    if (needsRefresh) {
      if (!auth.refreshToken) throw new Error('No refresh token');

      const params = new URLSearchParams({
        client_id: OAUTH_CONFIG.clientId,
        refresh_token: auth.refreshToken,
        grant_type: 'refresh_token'
      });

      const response = await fetch(OAUTH_CONFIG.tokenEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString()
      });

      if (!response.ok) {
        await Storage.clearAuth();
        throw new Error('Session expired');
      }

      const tokenData = await response.json();
      await Storage.updateAuth({
        accessToken: tokenData.access_token,
        tokenExpiresAt: Date.now() + (tokenData.expires_in * 1000),
        refreshToken: tokenData.refresh_token || auth.refreshToken
      });

      return tokenData.access_token;
    }

    return auth.accessToken;
  },

  async logout() {
    const auth = await Storage.getAuth();
    if (auth.accessToken) {
      try {
        await fetch(`${OAUTH_CONFIG.revokeEndpoint}?token=${auth.accessToken}`, { method: 'POST' });
      } catch (e) { /* ignore */ }
    }
    await Storage.clearAuth();
    return { success: true };
  },

  async getAuthStatus() {
    const auth = await Storage.getAuth();
    const isAuthenticated = await Storage.isAuthenticated();
    return { isAuthenticated, userEmail: auth.userEmail, tokenExpiresAt: auth.tokenExpiresAt };
  }
};

// ============== SYNC MODULE ==============

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

function parseSheetRows(rows, expectedHeaders) {
  if (!rows || rows.length < 1) return [];
  const headers = rows[0];
  const items = [];
  const headerMap = {};
  for (let i = 0; i < headers.length; i++) {
    headerMap[headers[i]] = i;
  }
  for (let rowIndex = 1; rowIndex < rows.length; rowIndex++) {
    const row = rows[rowIndex];
    if (!row || row.length === 0 || !row[0]) continue;
    const item = { _rowNumber: rowIndex + 1 };
    for (const header of expectedHeaders) {
      const colIndex = headerMap[header];
      item[header] = colIndex !== undefined ? (row[colIndex] || '') : '';
    }
    items.push(item);
  }
  return items;
}

const Sync = {
  async pullFromSheets() {
    const settings = await Storage.getSettings();
    if (!settings.sheetId) throw new Error('No Google Sheet configured');

    const profilesRange = encodeURIComponent(`${settings.profilesTabName}!A:Z`);
    const rulesRange = encodeURIComponent(`${settings.rulesTabName}!A:Z`);

    const [profilesData, rulesData] = await Promise.all([
      sheetsRequest(`/${settings.sheetId}/values/${profilesRange}`),
      sheetsRequest(`/${settings.sheetId}/values/${rulesRange}`)
    ]);

    const sheetProfiles = parseSheetRows(profilesData.values || [], SHEET_HEADERS.profiles);
    const sheetRules = parseSheetRows(rulesData.values || [], SHEET_HEADERS.rules);

    const newProfiles = {};
    const profileRowMapping = {};
    for (const sp of sheetProfiles) {
      if (!sp.ID) continue;
      newProfiles[sp.ID] = {
        id: sp.ID,
        name: sp.Name || '',
        hotkey: sp.Hotkey || null,
        site: sp.Site || null,
        syncedAt: Date.now()
      };
      profileRowMapping[sp.ID] = sp._rowNumber;
    }

    const newRules = {};
    const ruleRowMapping = {};
    for (const sr of sheetRules) {
      if (!sr.ID) continue;
      newRules[sr.ID] = {
        id: sr.ID,
        type: sr.Type || 'Text',
        name: sr.Name || '',
        value: sr.Value || '',
        site: sr.Site || null,
        mode: sr.Mode || 'Overwrite',
        profileId: sr['Profile ID'] || ''
      };
      ruleRowMapping[sr.ID] = sr._rowNumber;
    }

    await Storage.setProfiles(newProfiles);
    await Storage.setRules(newRules);
    await Storage.updateSyncState({
      profileRowMapping,
      ruleRowMapping,
      lastSyncAt: Date.now(),
      lastSyncStatus: 'success',
      lastSyncError: null
    });

    return { profilesCount: Object.keys(newProfiles).length, rulesCount: Object.keys(newRules).length };
  },

  async pushProfile(profile) {
    const settings = await Storage.getSettings();
    const syncState = await Storage.getSyncState();
    if (!settings.sheetId) throw new Error('No Google Sheet configured');

    const values = [profile.id, profile.name || '', profile.hotkey || '', profile.site || ''];
    const existingRow = syncState.profileRowMapping[profile.id];

    if (existingRow) {
      const range = encodeURIComponent(`${settings.profilesTabName}!A${existingRow}:Z${existingRow}`);
      await sheetsRequest(`/${settings.sheetId}/values/${range}?valueInputOption=USER_ENTERED`, {
        method: 'PUT',
        body: JSON.stringify({ range: `${settings.profilesTabName}!A${existingRow}`, majorDimension: 'ROWS', values: [values] })
      });
    } else {
      const range = encodeURIComponent(`${settings.profilesTabName}!A:Z`);
      const result = await sheetsRequest(`/${settings.sheetId}/values/${range}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`, {
        method: 'POST',
        body: JSON.stringify({ majorDimension: 'ROWS', values: [values] })
      });
      const match = (result.updates?.updatedRange || '').match(/!A(\d+)/);
      if (match) {
        syncState.profileRowMapping[profile.id] = parseInt(match[1], 10);
        await Storage.updateSyncState({ profileRowMapping: syncState.profileRowMapping });
      }
    }

    profile.syncedAt = Date.now();
    await Storage.saveProfile(profile);
    return profile;
  },

  async pushRule(rule) {
    const settings = await Storage.getSettings();
    const syncState = await Storage.getSyncState();
    if (!settings.sheetId) throw new Error('No Google Sheet configured');

    const values = [rule.id, rule.type || 'Text', rule.name || '', rule.value || '', rule.site || '', rule.mode || 'Overwrite', rule.profileId || ''];
    const existingRow = syncState.ruleRowMapping[rule.id];

    if (existingRow) {
      const range = encodeURIComponent(`${settings.rulesTabName}!A${existingRow}:Z${existingRow}`);
      await sheetsRequest(`/${settings.sheetId}/values/${range}?valueInputOption=USER_ENTERED`, {
        method: 'PUT',
        body: JSON.stringify({ range: `${settings.rulesTabName}!A${existingRow}`, majorDimension: 'ROWS', values: [values] })
      });
    } else {
      const range = encodeURIComponent(`${settings.rulesTabName}!A:Z`);
      const result = await sheetsRequest(`/${settings.sheetId}/values/${range}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`, {
        method: 'POST',
        body: JSON.stringify({ majorDimension: 'ROWS', values: [values] })
      });
      const match = (result.updates?.updatedRange || '').match(/!A(\d+)/);
      if (match) {
        syncState.ruleRowMapping[rule.id] = parseInt(match[1], 10);
        await Storage.updateSyncState({ ruleRowMapping: syncState.ruleRowMapping });
      }
    }

    return rule;
  },

  async fullSync() {
    const settings = await Storage.getSettings();
    if (!settings.sheetId) {
      await Storage.updateSyncState({ lastSyncStatus: 'error', lastSyncError: 'No Google Sheet configured' });
      throw new Error('No Google Sheet configured');
    }

    try {
      const isAuth = await Storage.isAuthenticated();
      if (!isAuth) throw new Error('Not authenticated');

      const pullResult = await this.pullFromSheets();

      await Storage.updateSyncState({ lastSyncAt: Date.now(), lastSyncStatus: 'success', lastSyncError: null });
      return { success: true, ...pullResult };

    } catch (error) {
      console.error('Sync failed:', error);
      await Storage.updateSyncState({ lastSyncAt: Date.now(), lastSyncStatus: 'error', lastSyncError: error.message });
      throw error;
    }
  },

  async queueWrite(type, id, action = 'upsert') {
    const writeId = `${type}_${id}_${Date.now()}`;
    await Storage.addPendingWrite({ id: writeId, type, itemId: id, action });
  }
};

// ============== ALARMS MODULE ==============

const SYNC_ALARM_NAME = 'open-autofill-sync';

const Alarms = {
  async init() {
    const settings = await Storage.getSettings();
    await this.setSyncInterval(settings.syncIntervalMinutes);
  },

  async setSyncInterval(minutes) {
    await browser.alarms.clear(SYNC_ALARM_NAME);
    if (minutes > 0) {
      await browser.alarms.create(SYNC_ALARM_NAME, { periodInMinutes: minutes, delayInMinutes: 1 });
      console.log(`Sync alarm set for every ${minutes} minutes`);
    }
  },

  async handleAlarm(alarm) {
    if (alarm.name === SYNC_ALARM_NAME) {
      console.log('Sync alarm triggered');
      try {
        const isAuth = await Storage.isAuthenticated();
        if (!isAuth) return;
        const settings = await Storage.getSettings();
        if (!settings.sheetId) return;
        await Sync.fullSync();
      } catch (error) {
        console.error('Scheduled sync failed:', error);
      }
    }
  },

  async getAlarmStatus() {
    const alarm = await browser.alarms.get(SYNC_ALARM_NAME);
    return { exists: !!alarm, scheduledTime: alarm?.scheduledTime, periodInMinutes: alarm?.periodInMinutes };
  }
};

// ============== CONTEXT MENU MODULE ==============

const ContextMenu = {
  async init() {
    await browser.contextMenus.removeAll();
    browser.contextMenus.create({
      id: CONTEXT_MENU_IDS.SAVE_FORM,
      title: 'Save entire form to Open Autofill',
      contexts: ['page', 'frame', 'editable']
    });
    browser.contextMenus.create({
      id: CONTEXT_MENU_IDS.SAVE_FIELD,
      title: 'Save this field to Open Autofill',
      contexts: ['editable']
    });
    console.log('Context menus initialized');
  }
};

// ============== HELPER FUNCTIONS ==============

function urlMatchesPattern(url, pattern) {
  if (!pattern) return true;
  try {
    const current = new URL(url);
    const patternUrl = pattern.includes('://') ? new URL(pattern) : new URL('https://' + pattern);
    const currentHost = current.hostname.toLowerCase();
    const patternHost = patternUrl.hostname.toLowerCase();
    if (currentHost !== patternHost && !currentHost.endsWith('.' + patternHost)) return false;
    if (patternUrl.pathname && patternUrl.pathname !== '/') {
      if (!current.pathname.startsWith(patternUrl.pathname)) return false;
    }
    return true;
  } catch (e) {
    return url.includes(pattern);
  }
}

// Initialize extension on install/update
browser.runtime.onInstalled.addListener(async (details) => {
  console.log('Open Autofill installed/updated:', details.reason);

  // Initialize storage
  await Storage.init();

  // Initialize context menus
  await ContextMenu.init();

  // Initialize sync alarm
  await Alarms.init();

  // If this is a fresh install, open options page
  if (details.reason === 'install') {
    browser.runtime.openOptionsPage();
  }
});

// Initialize on browser startup
browser.runtime.onStartup.addListener(async () => {
  console.log('Open Autofill starting up');

  // Ensure storage is initialized
  await Storage.init();

  // Initialize alarms
  await Alarms.init();
});

// Handle alarm events
browser.alarms.onAlarm.addListener((alarm) => {
  Alarms.handleAlarm(alarm);
});

// Handle context menu clicks
browser.contextMenus.onClicked.addListener(async (info, tab) => {
  try {
    if (info.menuItemId === CONTEXT_MENU_IDS.SAVE_FORM) {
      await browser.tabs.sendMessage(tab.id, { type: 'CONTEXT_MENU_SAVE_FORM' });
    } else if (info.menuItemId === CONTEXT_MENU_IDS.SAVE_FIELD) {
      await browser.tabs.sendMessage(tab.id, { type: 'CONTEXT_MENU_SAVE_FIELD' });
    }
  } catch (error) {
    console.error('Context menu handler error:', error);
  }
});

// Handle browser action click (show floating bar in active tab)
browser.action.onClicked.addListener(async (tab) => {
  try {
    await browser.tabs.sendMessage(tab.id, {
      type: MESSAGE_TYPES.SHOW_FLOATING_BAR
    });
  } catch (error) {
    console.error('Failed to show floating bar:', error);
  }
});

// Message handler for communication with content scripts and options page
browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message, sender)
    .then(sendResponse)
    .catch(error => {
      console.error('Message handler error:', error);
      sendResponse({ error: error.message });
    });

  // Return true to indicate async response
  return true;
});

// Main message handler
async function handleMessage(message, sender) {
  const { type, ...data } = message;

  switch (type) {
    // ============== AUTH ==============

    case MESSAGE_TYPES.START_AUTH:
      return OAuth.startAuthFlow();

    case MESSAGE_TYPES.LOGOUT:
      return OAuth.logout();

    case MESSAGE_TYPES.GET_AUTH_STATUS:
      return OAuth.getAuthStatus();

    // ============== PROFILES ==============

    case MESSAGE_TYPES.GET_PROFILES: {
      const profiles = await Storage.getProfiles();
      // If site URL provided, filter profiles
      if (data.siteUrl) {
        const filtered = await Storage.getProfilesForSite(data.siteUrl);
        return { profiles: filtered };
      }
      return { profiles: Object.values(profiles) };
    }

    case MESSAGE_TYPES.GET_RULES_FOR_PROFILE: {
      const rules = await Storage.getRulesForProfile(data.profileId);
      // Optionally filter by site
      if (data.siteUrl) {
        const filtered = rules.filter(rule =>
          !rule.site || urlMatches(data.siteUrl, rule.site)
        );
        return { rules: filtered };
      }
      return { rules };
    }

    // ============== SAVE ==============

    case MESSAGE_TYPES.SAVE_FORM_DATA: {
      // data: { profileId, profileName, fields: [{ name, type, value }], siteUrl }
      let profile;

      if (data.profileId) {
        profile = await Storage.getProfile(data.profileId);
      }

      if (!profile) {
        // Create new profile
        profile = {
          id: generateProfileId(),
          name: data.profileName || 'New Profile',
          hotkey: null,
          site: data.siteUrl || null,
          syncedAt: null
        };
      }

      // Save profile
      await Storage.saveProfile(profile);

      // Create rules for each field
      for (const field of data.fields) {
        const rule = {
          id: generateRuleId(),
          type: field.type || 'Text',
          name: field.name,
          value: field.value,
          site: data.siteUrl || null,
          mode: 'Overwrite',
          profileId: profile.id
        };
        await Storage.saveRule(rule);

        // Queue for sync
        try {
          await Sync.pushRule(rule);
        } catch (e) {
          console.warn('Failed to push rule to sheets:', e);
          await Sync.queueWrite('rule', rule.id);
        }
      }

      // Push profile to sheets
      try {
        await Sync.pushProfile(profile);
      } catch (e) {
        console.warn('Failed to push profile to sheets:', e);
        await Sync.queueWrite('profile', profile.id);
      }

      return { success: true, profile };
    }

    case MESSAGE_TYPES.SAVE_FIELD_DATA: {
      // data: { profileId, field: { name, type, value }, siteUrl }
      const profile = await Storage.getProfile(data.profileId);
      if (!profile) {
        throw new Error('Profile not found');
      }

      // Check if rule already exists for this field
      const existingRules = await Storage.getRulesForProfile(data.profileId);
      let rule = existingRules.find(r => r.name === data.field.name);

      if (rule) {
        // Update existing rule
        rule.value = data.field.value;
        rule.type = data.field.type || rule.type;
      } else {
        // Create new rule
        rule = {
          id: generateRuleId(),
          type: data.field.type || 'Text',
          name: data.field.name,
          value: data.field.value,
          site: data.siteUrl || null,
          mode: 'Overwrite',
          profileId: data.profileId
        };
      }

      await Storage.saveRule(rule);

      // Push to sheets
      try {
        await Sync.pushRule(rule);
      } catch (e) {
        console.warn('Failed to push rule to sheets:', e);
        await Sync.queueWrite('rule', rule.id);
      }

      return { success: true, rule };
    }

    // ============== SYNC ==============

    case MESSAGE_TYPES.TRIGGER_SYNC:
    case MESSAGE_TYPES.FORCE_SYNC:
      return Sync.fullSync();

    // ============== SETTINGS ==============

    case MESSAGE_TYPES.GET_SETTINGS: {
      const settings = await Storage.getSettings();
      const syncState = await Storage.getSyncState();
      const alarmStatus = await Alarms.getAlarmStatus();
      return { settings, syncState, alarmStatus };
    }

    case MESSAGE_TYPES.UPDATE_SETTINGS: {
      const newSettings = await Storage.updateSettings(data.settings);

      // Update alarm if interval changed
      if (data.settings.syncIntervalMinutes !== undefined) {
        await Alarms.setSyncInterval(data.settings.syncIntervalMinutes);
      }

      return { settings: newSettings };
    }

    // ============== IMPORT/EXPORT ==============

    case MESSAGE_TYPES.EXPORT_DATA: {
      const exportData = await Storage.exportData();
      return { data: exportData };
    }

    case MESSAGE_TYPES.IMPORT_DATA: {
      await Storage.importData(data.data);
      return { success: true };
    }

    // ============== FILL ==============

    case MESSAGE_TYPES.FILL_FORM: {
      // Forward to content script
      if (sender.tab) {
        // Message came from content script, this shouldn't happen
        return { error: 'Invalid message origin' };
      }

      // Get the active tab
      const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
      if (tab) {
        return browser.tabs.sendMessage(tab.id, {
          type: MESSAGE_TYPES.FILL_FORM,
          profileId: data.profileId
        });
      }
      return { error: 'No active tab' };
    }

    default:
      console.warn('Unknown message type:', type);
      return { error: `Unknown message type: ${type}` };
  }
}

// Helper functions
function generateProfileId() {
  const timestamp = Date.now().toString(36);
  const randomPart = Math.random().toString(36).substring(2, 8);
  return `p_${timestamp}${randomPart}`;
}

function generateRuleId() {
  const timestamp = Date.now().toString(36);
  const randomPart = Math.random().toString(36).substring(2, 8);
  return `r_${timestamp}${randomPart}`;
}

function urlMatches(currentUrl, pattern) {
  if (!pattern) return true;
  try {
    const current = new URL(currentUrl);
    const patternUrl = pattern.includes('://') ? new URL(pattern) : new URL('https://' + pattern);
    const currentHost = current.hostname.toLowerCase();
    const patternHost = patternUrl.hostname.toLowerCase();
    if (currentHost !== patternHost && !currentHost.endsWith('.' + patternHost)) {
      return false;
    }
    if (patternUrl.pathname && patternUrl.pathname !== '/') {
      if (!current.pathname.startsWith(patternUrl.pathname)) {
        return false;
      }
    }
    return true;
  } catch (e) {
    return currentUrl.includes(pattern);
  }
}

console.log('Open Autofill background script loaded');
