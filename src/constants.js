/**
 * Constants for Open Autofill extension
 */

// Google OAuth2 configuration
// NOTE: Replace these with your actual Google Cloud Console credentials
export const OAUTH_CONFIG = {
  clientId: '1058799799273-ctv4k99li40ni994ku5fdmv7q2hrrsaf.apps.googleusercontent.com',
  // No clientSecret needed - using PKCE flow for public clients
  authEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
  tokenEndpoint: 'https://oauth2.googleapis.com/token',
  revokeEndpoint: 'https://oauth2.googleapis.com/revoke',
  scopes: ['https://www.googleapis.com/auth/spreadsheets']
};

// Google Sheets API
export const SHEETS_API = {
  baseUrl: 'https://sheets.googleapis.com/v4/spreadsheets'
};

// Default settings
export const DEFAULT_SETTINGS = {
  syncIntervalMinutes: 10,
  sheetId: null,
  profilesTabName: 'Profiles',
  rulesTabName: 'Rules'
};

// Default sync state
export const DEFAULT_SYNC_STATE = {
  lastSyncAt: null,
  lastSyncStatus: null,
  lastSyncError: null,
  pendingWrites: [],
  profileRowMapping: {},
  ruleRowMapping: {}
};

// Default auth state
export const DEFAULT_AUTH = {
  accessToken: null,
  refreshToken: null,
  tokenExpiresAt: null,
  userEmail: null
};

// Storage schema version
export const STORAGE_VERSION = 1;

// Sheet headers (exact column names)
export const SHEET_HEADERS = {
  profiles: ['ID', 'Name', 'Hotkey', 'Site'],
  rules: ['ID', 'Type', 'Name', 'Value', 'Site', 'Mode', 'Profile ID']
};

// Supported field types
export const FIELD_TYPES = {
  TEXT: 'Text',
  SELECT: 'Select',
  CHECKBOX: 'Checkbox',
  RADIO: 'Radio'
};

// Fill modes
export const FILL_MODES = {
  OVERWRITE: 'Overwrite',
  APPEND: 'Append',
  SKIP_FILLED: 'Skip if filled'
};

// Sync retry configuration
export const SYNC_RETRY = {
  maxRetries: 5,
  baseDelayMs: 1000,
  maxDelayMs: 16000
};

// Token refresh margin (refresh 5 minutes before expiry)
export const TOKEN_REFRESH_MARGIN_MS = 5 * 60 * 1000;

// MutationObserver debounce delay
export const MUTATION_DEBOUNCE_MS = 100;

// Message types for inter-script communication
export const MESSAGE_TYPES = {
  // Background -> Content
  FILL_FORM: 'FILL_FORM',
  SHOW_FLOATING_BAR: 'SHOW_FLOATING_BAR',
  HIDE_FLOATING_BAR: 'HIDE_FLOATING_BAR',
  SYNC_COMPLETE: 'SYNC_COMPLETE',

  // Content -> Background
  GET_PROFILES: 'GET_PROFILES',
  GET_RULES_FOR_PROFILE: 'GET_RULES_FOR_PROFILE',
  SAVE_FORM_DATA: 'SAVE_FORM_DATA',
  SAVE_FIELD_DATA: 'SAVE_FIELD_DATA',
  TRIGGER_SYNC: 'TRIGGER_SYNC',
  GET_AUTH_STATUS: 'GET_AUTH_STATUS',

  // Options -> Background
  START_AUTH: 'START_AUTH',
  LOGOUT: 'LOGOUT',
  UPDATE_SETTINGS: 'UPDATE_SETTINGS',
  GET_SETTINGS: 'GET_SETTINGS',
  FORCE_SYNC: 'FORCE_SYNC',
  EXPORT_DATA: 'EXPORT_DATA',
  IMPORT_DATA: 'IMPORT_DATA',

  // Profile CRUD
  CREATE_PROFILE: 'CREATE_PROFILE',
  UPDATE_PROFILE: 'UPDATE_PROFILE',
  DELETE_PROFILE: 'DELETE_PROFILE',

  // Rule CRUD
  CREATE_RULE: 'CREATE_RULE',
  UPDATE_RULE: 'UPDATE_RULE',
  DELETE_RULE: 'DELETE_RULE',
  GET_ALL_RULES: 'GET_ALL_RULES'
};

// Context menu IDs
export const CONTEXT_MENU_IDS = {
  SAVE_FORM: 'open-autofill-save-form',
  SAVE_FIELD: 'open-autofill-save-field'
};
