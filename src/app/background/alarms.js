/**
 * Alarms module for scheduling sync operations
 */

import { Storage } from '../../core/storage/storage.js';
import { Sync } from '../../core/network/sync.js';

const SYNC_ALARM_NAME = 'open-autofill-sync';

// Initialize the sync alarm based on settings
async function initSyncAlarm() {
  const settings = await Storage.getSettings();
  await setSyncInterval(settings.syncIntervalMinutes);
}

// Set the sync interval (in minutes)
async function setSyncInterval(minutes) {
  // Clear existing alarm
  await browser.alarms.clear(SYNC_ALARM_NAME);

  if (minutes > 0) {
    // Create new alarm
    await browser.alarms.create(SYNC_ALARM_NAME, {
      periodInMinutes: minutes,
      // First trigger after 1 minute to avoid immediate sync on startup
      delayInMinutes: 1
    });

    console.log(`Sync alarm set for every ${minutes} minutes`);
  } else {
    console.log('Sync alarm disabled');
  }
}

// Handle alarm events
async function handleAlarm(alarm) {
  if (alarm.name === SYNC_ALARM_NAME) {
    console.log('Sync alarm triggered');
    await performScheduledSync();
  }
}

// Perform a scheduled sync
async function performScheduledSync() {
  try {
    // Check if we're authenticated
    const isAuth = await Storage.isAuthenticated();
    if (!isAuth) {
      console.log('Skipping scheduled sync: not authenticated');
      return;
    }

    // Check if a sheet is configured
    const settings = await Storage.getSettings();
    if (!settings.sheetId) {
      console.log('Skipping scheduled sync: no sheet configured');
      return;
    }

    // Perform sync
    const result = await Sync.fullSync();
    console.log('Scheduled sync completed:', result);

    // Notify any open tabs about the sync
    notifySyncComplete(result);

  } catch (error) {
    console.error('Scheduled sync failed:', error);
    notifySyncError(error);
  }
}

// Notify content scripts that sync is complete
function notifySyncComplete(result) {
  browser.tabs.query({}).then(tabs => {
    for (const tab of tabs) {
      browser.tabs.sendMessage(tab.id, {
        type: 'SYNC_COMPLETE',
        success: true,
        result
      }).catch(() => {
        // Tab might not have content script, ignore
      });
    }
  });
}

// Notify content scripts about sync error
function notifySyncError(error) {
  browser.tabs.query({}).then(tabs => {
    for (const tab of tabs) {
      browser.tabs.sendMessage(tab.id, {
        type: 'SYNC_COMPLETE',
        success: false,
        error: error.message
      }).catch(() => {
        // Tab might not have content script, ignore
      });
    }
  });
}

// Get current alarm status
async function getAlarmStatus() {
  const alarm = await browser.alarms.get(SYNC_ALARM_NAME);
  return {
    exists: !!alarm,
    scheduledTime: alarm ? alarm.scheduledTime : null,
    periodInMinutes: alarm ? alarm.periodInMinutes : null
  };
}

// Export Alarms module
export const Alarms = {
  init: initSyncAlarm,
  setSyncInterval,
  handleAlarm,
  performScheduledSync,
  getAlarmStatus,
  SYNC_ALARM_NAME
};

export default Alarms;
