/**
 * OAuth2 authentication module for Google Sheets API
 * Implements OAuth2 with PKCE for Firefox extensions
 */

import { OAUTH_CONFIG, TOKEN_REFRESH_MARGIN_MS } from '../constants.js';
import { Storage } from '../lib/storage.js';

// Generate random string for PKCE
function generateRandomString(length) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return Array.from(array, byte => chars[byte % chars.length]).join('');
}

// Generate code verifier for PKCE
function generateCodeVerifier() {
  return generateRandomString(64);
}

// Generate code challenge from verifier (SHA-256)
async function generateCodeChallenge(verifier) {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const digest = await crypto.subtle.digest('SHA-256', data);
  const base64 = btoa(String.fromCharCode(...new Uint8Array(digest)));
  // Convert to base64url
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// Build the authorization URL
async function buildAuthUrl() {
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = await generateCodeChallenge(codeVerifier);
  const state = generateRandomString(32);

  // Store verifier and state for later validation
  await browser.storage.local.set({
    _oauthState: state,
    _codeVerifier: codeVerifier
  });

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

  return `${OAUTH_CONFIG.authEndpoint}?${params.toString()}`;
}

// Extract authorization code from redirect URL
function extractAuthCode(redirectUrl) {
  const url = new URL(redirectUrl);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const error = url.searchParams.get('error');

  if (error) {
    throw new Error(`Authorization error: ${error}`);
  }

  return { code, state };
}

// Exchange authorization code for tokens
async function exchangeCodeForTokens(code, codeVerifier) {
  const params = new URLSearchParams({
    client_id: OAUTH_CONFIG.clientId,
    code: code,
    code_verifier: codeVerifier,
    grant_type: 'authorization_code',
    redirect_uri: browser.identity.getRedirectURL()
  });

  const response = await fetch(OAUTH_CONFIG.tokenEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: params.toString()
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`Token exchange failed: ${error.error_description || error.error}`);
  }

  return response.json();
}

// Refresh access token using refresh token
async function refreshAccessToken(refreshToken) {
  const params = new URLSearchParams({
    client_id: OAUTH_CONFIG.clientId,
    refresh_token: refreshToken,
    grant_type: 'refresh_token'
  });

  const response = await fetch(OAUTH_CONFIG.tokenEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: params.toString()
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`Token refresh failed: ${error.error_description || error.error}`);
  }

  return response.json();
}

// Get user info to display email
async function getUserInfo(accessToken) {
  const response = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: {
      'Authorization': `Bearer ${accessToken}`
    }
  });

  if (!response.ok) {
    console.warn('Failed to fetch user info');
    return null;
  }

  return response.json();
}

// Start the OAuth flow
async function startAuthFlow() {
  try {
    const authUrl = await buildAuthUrl();

    // Launch the auth flow
    const redirectUrl = await browser.identity.launchWebAuthFlow({
      url: authUrl,
      interactive: true
    });

    // Extract the code
    const { code, state } = extractAuthCode(redirectUrl);

    // Validate state
    const { _oauthState, _codeVerifier } = await browser.storage.local.get(['_oauthState', '_codeVerifier']);

    if (state !== _oauthState) {
      throw new Error('State mismatch - possible CSRF attack');
    }

    // Exchange code for tokens
    const tokenData = await exchangeCodeForTokens(code, _codeVerifier);

    // Calculate expiration time
    const expiresAt = Date.now() + (tokenData.expires_in * 1000);

    // Get user email
    let userEmail = null;
    try {
      const userInfo = await getUserInfo(tokenData.access_token);
      userEmail = userInfo?.email || null;
    } catch (e) {
      console.warn('Could not fetch user email:', e);
    }

    // Store tokens
    await Storage.updateAuth({
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token,
      tokenExpiresAt: expiresAt,
      userEmail: userEmail
    });

    // Clean up temporary storage
    await browser.storage.local.remove(['_oauthState', '_codeVerifier']);

    return {
      success: true,
      userEmail: userEmail
    };

  } catch (error) {
    console.error('OAuth flow failed:', error);
    // Clean up on error
    await browser.storage.local.remove(['_oauthState', '_codeVerifier']);
    throw error;
  }
}

// Get a valid access token (refreshing if necessary)
async function getValidAccessToken() {
  const auth = await Storage.getAuth();

  if (!auth.accessToken) {
    throw new Error('Not authenticated');
  }

  // Check if token needs refresh (5 min margin)
  const needsRefresh = !auth.tokenExpiresAt ||
    (Date.now() > auth.tokenExpiresAt - TOKEN_REFRESH_MARGIN_MS);

  if (needsRefresh) {
    if (!auth.refreshToken) {
      throw new Error('No refresh token available');
    }

    try {
      const tokenData = await refreshAccessToken(auth.refreshToken);
      const expiresAt = Date.now() + (tokenData.expires_in * 1000);

      await Storage.updateAuth({
        accessToken: tokenData.access_token,
        tokenExpiresAt: expiresAt,
        // Refresh token might be rotated
        refreshToken: tokenData.refresh_token || auth.refreshToken
      });

      return tokenData.access_token;

    } catch (error) {
      console.error('Token refresh failed:', error);
      // Clear auth on refresh failure
      await Storage.clearAuth();
      throw new Error('Session expired. Please re-authenticate.');
    }
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
