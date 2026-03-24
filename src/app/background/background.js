/**
 * Background service worker for Open Autofill
 * Orchestrates OAuth, sync, alarms, and messaging
 */

import '../../shared/browser-polyfill.js';

import {
  MESSAGE_TYPES,
  CONTEXT_MENU_IDS
} from '../../shared/constants.js';

import { Storage } from '../../core/storage/storage.js';
import { OAuth } from '../../core/network/oauth.js';
import { Sync } from '../../core/network/sync.js';
import { Alarms } from './alarms.js';
import { ContextMenu } from './context-menu.js';

// ============== HELPER FUNCTIONS ==============

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

// ============== LIFECYCLE EVENTS ==============

// Re-authenticate if the user had Google Sheets configured but is no longer authenticated,
// then trigger a full sync.
async function checkAuthAndSync() {
  try {
    const settings = await Storage.getSettings();
    if (!settings.sheetId) return; // Sheets sync not configured, nothing to do

    const isAuthenticated = await Storage.isAuthenticated();
    if (!isAuthenticated) {
      console.log('Open Autofill: session expired, re-opening auth flow');
      try {
        await OAuth.startAuthFlow();
        console.log('Open Autofill: re-authenticated successfully');
      } catch (error) {
        console.warn('Open Autofill: re-auth failed:', error);
        return; // Do not attempt sync if auth failed
      }
    }

    await Sync.fullSync();
    console.log('Open Autofill: startup sync complete');
  } catch (error) {
    console.warn('Open Autofill: startup sync failed:', error);
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

// Handle browser action click (show floating bar in active tab)
browser.action.onClicked.addListener(async (tab) => {
  if (!tab.id) return;

  // 1. Re-auth if session expired, then sync — wait if we need to show the bar after
  await checkAuthAndSync();

  try {
    // 2. Try to send message to show the bar
    await browser.tabs.sendMessage(tab.id, {
      type: MESSAGE_TYPES.SHOW_FLOATING_BAR
    });
  } catch (error) {
    // 3. If "Receiving end does not exist", it means content script is not injected.
    // This happens if the extension was reloaded and the page was not refreshed.
    if (error.message.includes('Could not establish connection') || error.message.includes('Receiving end does not exist')) {
      console.log('Content script missing, attempting to inject into tab:', tab.id);
      
      try {
        // Manually inject the content scripts defined in manifest.json
        const manifest = browser.runtime.getManifest();
        const scripts = manifest.content_scripts[0].js;
        
        await browser.scripting.executeScript({
          target: { tabId: tab.id },
          files: scripts
        });

        // Try sending the message again after a short delay
        setTimeout(async () => {
          try {
            await browser.tabs.sendMessage(tab.id, {
              type: MESSAGE_TYPES.SHOW_FLOATING_BAR
            });
          } catch (retryError) {
            console.error('Failed to show floating bar after injection:', retryError);
          }
        }, 100);

      } catch (injectError) {
        console.warn('Could not inject content script (expected on restricted pages like chrome://):', injectError);
      }
    } else {
      console.warn('Could not send message to tab:', tab.id, error);
    }
  }
});

// ============== MESSAGE HANDLER ==============

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

      // Load existing rules to avoid duplicates
      const existingRules = await Storage.getRulesForProfile(profile.id);

      // Create or update rules for each field
      const rules = [];
      for (const field of data.fields) {
        // Check if a rule with the same name already exists for this profile
        let rule = existingRules.find(r => r.name === field.name);

        if (rule) {
          // Update existing rule
          rule.value = field.value;
          rule.type = field.type || rule.type;
        } else {
          // Create new rule
          rule = {
            id: generateRuleId(),
            type: field.type || 'Text',
            name: field.name,
            value: field.value,
            site: data.siteUrl || null,
            mode: 'Overwrite',
            profileId: profile.id
          };
        }
        await Storage.saveRule(rule);
        rules.push(rule);
      }

      // Respond immediately — sync happens in the background (fire-and-forget)
      // This avoids blocking the message port on slow/failed network calls,
      // which would prevent the save dialog from closing in the content script.
      (async () => {
        for (const rule of rules) {
          try {
            await Sync.pushRule(rule);
          } catch (e) {
            console.warn('Failed to push rule to sheets:', e);
            await Sync.queueWrite('rule', rule.id);
          }
        }
        try {
          await Sync.pushProfile(profile);
        } catch (e) {
          console.warn('Failed to push profile to sheets:', e);
          await Sync.queueWrite('profile', profile.id);
        }
      })();

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

    // ============== PROFILE CRUD ==============

    case MESSAGE_TYPES.CREATE_PROFILE: {
      const profile = {
        id: generateProfileId(),
        name: data.name || 'New Profile',
        hotkey: data.hotkey || null,
        site: data.site || null,
        syncedAt: null
      };

      await Storage.saveProfile(profile);

      // Sync to Google Sheets if configured
      try {
        const settings = await Storage.getSettings();
        if (settings.sheetId) {
          await Sync.pushProfile(profile);
        }
      } catch (e) {
        console.warn('Failed to sync new profile:', e);
        await Sync.queueWrite('profile', profile.id);
      }

      return { success: true, profile };
    }

    case MESSAGE_TYPES.UPDATE_PROFILE: {
      const existingProfile = await Storage.getProfile(data.id);
      if (!existingProfile) {
        throw new Error('Profile not found');
      }

      const updatedProfile = {
        ...existingProfile,
        name: data.name !== undefined ? data.name : existingProfile.name,
        hotkey: data.hotkey !== undefined ? data.hotkey : existingProfile.hotkey,
        site: data.site !== undefined ? data.site : existingProfile.site
      };

      await Storage.saveProfile(updatedProfile);

      // Sync to Google Sheets
      try {
        const settings = await Storage.getSettings();
        if (settings.sheetId) {
          await Sync.pushProfile(updatedProfile);
        }
      } catch (e) {
        console.warn('Failed to sync updated profile:', e);
        await Sync.queueWrite('profile', updatedProfile.id);
      }

      return { success: true, profile: updatedProfile };
    }

    case MESSAGE_TYPES.DELETE_PROFILE: {
      const profile = await Storage.getProfile(data.id);
      if (!profile) {
        throw new Error('Profile not found');
      }

      // Delete profile and its associated rules
      await Storage.deleteProfile(data.id);

      return { success: true };
    }

    // ============== RULE CRUD ==============

    case MESSAGE_TYPES.GET_ALL_RULES: {
      const rules = await Storage.getRules();
      return { rules: Object.values(rules) };
    }

    case MESSAGE_TYPES.CREATE_RULE: {
      const rule = {
        id: generateRuleId(),
        type: data.type || 'Text',
        name: data.name || '',
        value: data.value || '',
        site: data.site || null,
        mode: data.mode || 'Overwrite',
        profileId: data.profileId
      };

      if (!rule.profileId) {
        throw new Error('Profile ID is required');
      }

      // Verify profile exists
      const profile = await Storage.getProfile(rule.profileId);
      if (!profile) {
        throw new Error('Profile not found');
      }

      await Storage.saveRule(rule);

      // Sync to Google Sheets
      try {
        const settings = await Storage.getSettings();
        if (settings.sheetId) {
          await Sync.pushRule(rule);
        }
      } catch (e) {
        console.warn('Failed to sync new rule:', e);
        await Sync.queueWrite('rule', rule.id);
      }

      return { success: true, rule };
    }

    case MESSAGE_TYPES.UPDATE_RULE: {
      const existingRule = await Storage.getRule(data.id);
      if (!existingRule) {
        throw new Error('Rule not found');
      }

      const updatedRule = {
        ...existingRule,
        type: data.type !== undefined ? data.type : existingRule.type,
        name: data.name !== undefined ? data.name : existingRule.name,
        value: data.value !== undefined ? data.value : existingRule.value,
        site: data.site !== undefined ? data.site : existingRule.site,
        mode: data.mode !== undefined ? data.mode : existingRule.mode,
        profileId: data.profileId !== undefined ? data.profileId : existingRule.profileId
      };

      // Verify profile exists if changed
      if (data.profileId && data.profileId !== existingRule.profileId) {
        const profile = await Storage.getProfile(data.profileId);
        if (!profile) {
          throw new Error('Profile not found');
        }
      }

      await Storage.saveRule(updatedRule);

      // Sync to Google Sheets
      try {
        const settings = await Storage.getSettings();
        if (settings.sheetId) {
          await Sync.pushRule(updatedRule);
        }
      } catch (e) {
        console.warn('Failed to sync updated rule:', e);
        await Sync.queueWrite('rule', updatedRule.id);
      }

      return { success: true, rule: updatedRule };
    }

    case MESSAGE_TYPES.DELETE_RULE: {
      const rule = await Storage.getRule(data.id);
      if (!rule) {
        throw new Error('Rule not found');
      }

      await Storage.deleteRule(data.id);

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

// Log redirect URI for OAuth configuration
const redirectUri = browser.identity.getRedirectURL();
console.log('Extension Redirect URI:', redirectUri);

console.log('Open Autofill background script loaded');
