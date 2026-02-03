/**
 * Authentication section component
 * Handles Google account connection/disconnection
 */

import { showToast } from './toast.js';
import { sendMessage } from '../options.js';

/**
 * Load and display the current authentication status
 */
export async function loadAuthStatus() {
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

/**
 * Handle the connect button click
 */
export async function handleConnect() {
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

/**
 * Handle the disconnect button click
 */
export async function handleDisconnect() {
  try {
    await sendMessage('LOGOUT');
    showToast('Disconnected from Google', 'success');
    await loadAuthStatus();
  } catch (error) {
    console.error('Disconnect failed:', error);
    showToast('Disconnect failed: ' + error.message, 'error');
  }
}

/**
 * Setup event listeners for auth section
 */
export function setupAuthListeners() {
  document.getElementById('btn-connect').addEventListener('click', handleConnect);
  document.getElementById('btn-disconnect').addEventListener('click', handleDisconnect);
}

export default {
  loadAuthStatus,
  handleConnect,
  handleDisconnect,
  setupAuthListeners
};
