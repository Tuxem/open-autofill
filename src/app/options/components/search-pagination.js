/**
 * Search and pagination component
 * Handles filtering and paginating profiles/rules
 */

import { getCurrentTab } from '../options.js';
import * as ProfilesView from './profiles-view.js';
import * as RulesView from './rules-view.js';

// Pagination constants
export const ITEMS_PER_PAGE = 10;

// State
export let searchQuery = '';
export let profilesPage = 1;
export let rulesPage = 1;

/**
 * Reset pagination state
 */
export function resetPagination() {
  profilesPage = 1;
  rulesPage = 1;
  searchQuery = '';
}

/**
 * Set search query
 */
export function setSearchQuery(query) {
  searchQuery = query;
}

/**
 * Set profiles page
 */
export function setProfilesPage(page) {
  profilesPage = page;
}

/**
 * Set rules page
 */
export function setRulesPage(page) {
  rulesPage = page;
}

/**
 * Handle search input
 */
export function handleSearch(event) {
  searchQuery = event.target.value.toLowerCase().trim();
  profilesPage = 1;
  rulesPage = 1;

  if (getCurrentTab() === 'profiles') {
    ProfilesView.renderProfiles(ProfilesView.getCachedProfiles());
  } else {
    RulesView.renderRules(RulesView.getCachedRules());
  }
}

/**
 * Filter profiles by search query
 */
export function filterProfiles(profiles) {
  if (!searchQuery) return profiles;
  return profiles.filter(p =>
    (p.name && p.name.toLowerCase().includes(searchQuery)) ||
    (p.site && p.site.toLowerCase().includes(searchQuery)) ||
    (p.hotkey && p.hotkey.toLowerCase().includes(searchQuery))
  );
}

/**
 * Filter rules by search query
 */
export function filterRules(rules) {
  if (!searchQuery) return rules;
  return rules.filter(r =>
    (r.name && r.name.toLowerCase().includes(searchQuery)) ||
    (r.value && r.value.toLowerCase().includes(searchQuery)) ||
    (r.type && r.type.toLowerCase().includes(searchQuery)) ||
    (r.site && r.site.toLowerCase().includes(searchQuery))
  );
}

/**
 * Paginate items
 */
export function paginate(items, page) {
  const start = (page - 1) * ITEMS_PER_PAGE;
  return items.slice(start, start + ITEMS_PER_PAGE);
}

/**
 * Update pagination UI
 */
export function updatePagination(type, filteredCount, totalCount) {
  const pagination = document.getElementById(`${type}-pagination`);
  const pageInfo = document.getElementById(`${type}-page-info`);
  const prevBtn = document.getElementById(`${type}-prev`);
  const nextBtn = document.getElementById(`${type}-next`);
  const resultsCount = document.getElementById('search-results-count');

  const page = type === 'profiles' ? profilesPage : rulesPage;
  const totalPages = Math.ceil(filteredCount / ITEMS_PER_PAGE);

  if (filteredCount === 0) {
    pagination.classList.add('hidden');
    resultsCount.textContent = searchQuery ? 'No results' : '';
    return;
  }

  if (totalPages > 1) {
    pagination.classList.remove('hidden');
    pagination.classList.add('flex');
    const start = (page - 1) * ITEMS_PER_PAGE + 1;
    const end = Math.min(page * ITEMS_PER_PAGE, filteredCount);
    pageInfo.textContent = `${start}-${end} of ${filteredCount}`;
    prevBtn.disabled = page <= 1;
    nextBtn.disabled = page >= totalPages;
  } else {
    pagination.classList.add('hidden');
  }

  // Update results count
  if (searchQuery) {
    resultsCount.textContent = `${filteredCount} result${filteredCount !== 1 ? 's' : ''}`;
  } else {
    resultsCount.textContent = '';
  }
}

/**
 * Handle profiles previous page
 */
export function handleProfilesPrev() {
  if (profilesPage > 1) {
    profilesPage--;
    ProfilesView.renderProfiles(ProfilesView.getCachedProfiles());
  }
}

/**
 * Handle profiles next page
 */
export function handleProfilesNext() {
  const filtered = filterProfiles(ProfilesView.getCachedProfiles());
  if (profilesPage < Math.ceil(filtered.length / ITEMS_PER_PAGE)) {
    profilesPage++;
    ProfilesView.renderProfiles(ProfilesView.getCachedProfiles());
  }
}

/**
 * Handle rules previous page
 */
export function handleRulesPrev() {
  if (rulesPage > 1) {
    rulesPage--;
    RulesView.renderRules(RulesView.getCachedRules());
  }
}

/**
 * Handle rules next page
 */
export function handleRulesNext() {
  const filtered = filterRules(RulesView.getCachedRules());
  if (rulesPage < Math.ceil(filtered.length / ITEMS_PER_PAGE)) {
    rulesPage++;
    RulesView.renderRules(RulesView.getCachedRules());
  }
}

/**
 * Setup event listeners for search and pagination
 */
export function setupSearchPaginationListeners() {
  document.getElementById('search-input').addEventListener('input', handleSearch);
  document.getElementById('profiles-prev').addEventListener('click', handleProfilesPrev);
  document.getElementById('profiles-next').addEventListener('click', handleProfilesNext);
  document.getElementById('rules-prev').addEventListener('click', handleRulesPrev);
  document.getElementById('rules-next').addEventListener('click', handleRulesNext);
}

export default {
  ITEMS_PER_PAGE,
  searchQuery,
  profilesPage,
  rulesPage,
  resetPagination,
  setSearchQuery,
  setProfilesPage,
  setRulesPage,
  handleSearch,
  filterProfiles,
  filterRules,
  paginate,
  updatePagination,
  handleProfilesPrev,
  handleProfilesNext,
  handleRulesPrev,
  handleRulesNext,
  setupSearchPaginationListeners
};
