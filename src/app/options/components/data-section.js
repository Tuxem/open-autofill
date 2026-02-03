/**
 * Data section component
 * Handles import/export functionality
 */

import { showToast } from './toast.js';
import * as SettingsSection from './settings-section.js';
import { sendMessage } from '../options.js';

/**
 * Handle export button click
 */
export async function handleExport() {
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

/**
 * Handle import button click - trigger file input
 */
export function handleImportClick() {
  document.getElementById('import-file').click();
}

/**
 * Handle file selection for import
 */
export async function handleImport(event) {
  const file = event.target.files[0];
  if (!file) return;

  try {
    const text = await file.text();
    const data = JSON.parse(text);

    await sendMessage('IMPORT_DATA', { data });

    showToast('Data imported successfully', 'success');
    await SettingsSection.loadSettings();
    await SettingsSection.loadStats();

  } catch (error) {
    console.error('Import failed:', error);
    showToast('Import failed: ' + error.message, 'error');
  }

  // Reset the file input
  event.target.value = '';
}

/**
 * Setup event listeners for data section
 */
export function setupDataListeners() {
  document.getElementById('btn-export').addEventListener('click', handleExport);
  document.getElementById('btn-import').addEventListener('click', handleImportClick);
  document.getElementById('import-file').addEventListener('change', handleImport);
}

export default {
  handleExport,
  handleImportClick,
  handleImport,
  setupDataListeners
};
