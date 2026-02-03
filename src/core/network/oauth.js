/**
 * OAuth2 authentication module for Google Sheets API
 * Implements OAuth2 Implicit Flow for Firefox extensions
 * (Matches the behavior of commit 87ccae0)
 */

import { OAUTH_CONFIG, TOKEN_REFRESH_MARGIN_MS } from '../../shared/constants.js';
import { Storage } from '../storage/storage.js';

// Generate random string for state
function generateRandomString(length) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return Array.from(array, byte => chars[byte % chars.length]).join('');
}

// Start the OAuth flow (Implicit Flow)
async function startAuthFlow() {
  try {
    const state = generateRandomString(32);
    
    // Store state for later validation
    await browser.storage.local.set({ _oauthState: state });

    const params = new URLSearchParams({
      client_id: OAUTH_CONFIG.clientId,
      redirect_uri: browser.identity.getRedirectURL(),
      response_type: 'token', // Implicit flow returns token directly in fragment
      scope: OAUTH_CONFIG.scopes.join(' '),
      state: state
    });

    const authUrl = `${OAUTH_CONFIG.authEndpoint}?${params.toString()}`;

    // Launch the auth flow
    const redirectUrl = await browser.identity.launchWebAuthFlow({
      url: authUrl,
      interactive: true
    });

    // Token is in URL fragment (after #), not query params
    const url = new URL(redirectUrl);
    const hashParams = new URLSearchParams(url.hash.substring(1));

    const accessToken = hashParams.get('access_token');
    const expiresIn = hashParams.get('expires_in');
    const returnedState = hashParams.get('state');
    const error = hashParams.get('error');

    if (error) {
      throw new Error(`Authorization error: ${error}`);
    }

    // Validate state
    const { _oauthState } = await browser.storage.local.get(['_oauthState']);
    if (returnedState !== _oauthState) {
      throw new Error('State mismatch - possible CSRF attack');
    }

    if (!accessToken) {
      throw new Error('No access token received');
    }

    // Calculate expiration time
    const expiresAt = Date.now() + (parseInt(expiresIn, 10) * 1000);

    // Get user email
    let userEmail = null;
    try {
      const response = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      });
      if (response.ok) {
        const userInfo = await response.json();
        userEmail = userInfo?.email || null;
      }
    } catch (e) {
      console.warn('Could not fetch user email:', e);
    }

    // Store tokens
    await Storage.updateAuth({
      accessToken: accessToken,
      refreshToken: null, // Implicit flow doesn't provide refresh tokens
      tokenExpiresAt: expiresAt,
      userEmail: userEmail
    });

    // Clean up temporary storage
    await browser.storage.local.remove(['_oauthState']);

    return {
      success: true,
      userEmail: userEmail
    };

  } catch (error) {
    console.error('OAuth flow failed:', error);
    // Clean up on error
    await browser.storage.local.remove(['_oauthState']);
    throw error;
  }
}

// Get a valid access token
async function getValidAccessToken() {
  const auth = await Storage.getAuth();

  if (!auth.accessToken) {
    throw new Error('Not authenticated');
  }

  // Check if token is expired (5 min margin)
  const isExpired = !auth.tokenExpiresAt ||
    (Date.now() > auth.tokenExpiresAt - TOKEN_REFRESH_MARGIN_MS);

  if (isExpired) {
    // Implicit Flow doesn't provide refresh tokens
    // User needs to re-authenticate
    await Storage.clearAuth();
    throw new Error('Session expired. Please reconnect your Google account.');
  }

  return auth.accessToken;
}

// Revoke tokens and clear auth
async function logout() {
  const auth = await Storage.getAuth();

  // Revoke the token if we have one
  if (auth.accessToken) {
    try {
      await fetch(`${OAUTH_CONFIG.revokeEndpoint}?token=${auth.accessToken}`, {
        method: 'POST'
      });
    } catch (e) {
      console.warn('Token revocation failed:', e);
    }
  }

  // Clear local auth data
  await Storage.clearAuth();

  return { success: true };
}

// Check authentication status
async function getAuthStatus() {
  const auth = await Storage.getAuth();
  const isAuthenticated = await Storage.isAuthenticated();

  return {
    isAuthenticated,
    userEmail: auth.userEmail,
    tokenExpiresAt: auth.tokenExpiresAt
  };
}

// Export OAuth module
export const OAuth = {
  startAuthFlow,
  getValidAccessToken,
  logout,
  getAuthStatus
};

export default OAuth;