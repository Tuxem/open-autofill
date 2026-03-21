/**
 * Floating bar UI component
 * Horizontal bar for profile selection and form filling
 */

(function() {
  'use strict';

  const FloatingBar = {
    container: null,
    shadowRoot: null,
    isVisible: false,
    profiles: [],
    selectedProfileId: null,
    filterText: '',

    // CSS styles (will be injected)
    styles: `
      :host {
        all: initial;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
        font-size: 14px;
        line-height: 1.4;
      }

      .floating-bar {
        position: fixed;
        top: 10px;
        right: 10px;
        z-index: 2147483647;
        background: #ffffff;
        border: 1px solid #e0e0e0;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        padding: 8px 12px;
        display: flex;
        align-items: flex-start;
        gap: 10px;
        min-width: 280px;
        max-width: 400px;
      }

      .floating-bar.hidden { display: none; }

      .floating-bar__logo {
        width: 24px;
        height: 24px;
        flex-shrink: 0;
      }

      .floating-bar__logo svg {
        width: 100%;
        height: 100%;
      }

      .floating-bar__profile-selector {
        flex: 1;
        display: flex;
        flex-direction: column;
        gap: 4px;
      }

      .floating-bar__search {
        width: 100%;
        padding: 6px 10px;
        border: 1px solid #ddd;
        border-radius: 4px;
        font-size: 13px;
        outline: none;
        box-sizing: border-box;
        transition: border-color 0.2s;
      }

      .floating-bar__search:focus { border-color: #4a90d9; }
      .floating-bar__search::placeholder { color: #999; }

      .floating-bar__select {
        width: 100%;
        padding: 4px;
        border: 1px solid #ddd;
        border-radius: 4px;
        font-size: 13px;
        background: white;
        cursor: pointer;
        outline: none;
        box-sizing: border-box;
      }

      .floating-bar__select:focus { border-color: #4a90d9; }

      .floating-bar__select option {
        padding: 5px 8px;
        border-radius: 3px;
        cursor: pointer;
      }

      .floating-bar__select option:checked {
        background: #4a90d9;
        color: white;
      }

      .floating-bar__btn {
        padding: 6px 12px;
        border: none;
        border-radius: 4px;
        font-size: 13px;
        font-weight: 500;
        cursor: pointer;
        transition: background-color 0.2s, transform 0.1s;
        white-space: nowrap;
      }

      .floating-bar__btn:active { transform: scale(0.98); }

      .floating-bar__btn--save {
        background: #5cb85c;
        color: white;
      }

      .floating-bar__btn--save:hover { background: #4cae4c; }

      .floating-bar__btn--close {
        background: transparent;
        color: #666;
        padding: 6px 8px;
        font-size: 18px;
        line-height: 1;
      }

      .floating-bar__btn--close:hover {
        color: #333;
        background: #f0f0f0;
      }

      .floating-bar__status {
        font-size: 12px;
        color: #666;
        padding: 4px 8px;
        background: #f5f5f5;
        border-radius: 4px;
      }

      .floating-bar__status--success {
        background: #dff0d8;
        color: #3c763d;
      }

      .floating-bar__status--error {
        background: #f2dede;
        color: #a94442;
      }

      @keyframes slideIn {
        from { opacity: 0; transform: translateY(-10px); }
        to { opacity: 1; transform: translateY(0); }
      }

      .floating-bar:not(.hidden) {
        animation: slideIn 0.2s ease-out;
      }

      @media (prefers-color-scheme: dark) {
        .floating-bar {
          background: #2d2d2d;
          border-color: #444;
          color: #e0e0e0;
        }

        .floating-bar__search,
        .floating-bar__select {
          background: #3d3d3d;
          border-color: #555;
          color: #e0e0e0;
        }

        .floating-bar__select option:checked {
          background: #3a7bc8;
          color: white;
        }

        .floating-bar__btn--close {
          color: #aaa;
        }

        .floating-bar__btn--close:hover {
          color: #fff;
          background: #444;
        }

        .floating-bar__status {
          background: #3d3d3d;
          color: #aaa;
        }
      }
    `,

    // Initialize and create the floating bar
    init() {
      if (this.container) {
        return; // Already initialized
      }

      // Create container with Shadow DOM
      this.container = document.createElement('div');
      this.container.id = 'open-autofill-floating-bar';
      this.shadowRoot = this.container.attachShadow({ mode: 'open' });

      // Inject styles
      const styleEl = document.createElement('style');
      styleEl.textContent = this.styles;
      this.shadowRoot.appendChild(styleEl);

      // Create the bar
      this.render();

      // Append to document
      document.body.appendChild(this.container);

      // Set up keyboard listener for hotkeys
      this.setupHotkeyListener();
    },

    // Render the floating bar HTML
    render() {
      const bar = document.createElement('div');
      bar.className = 'floating-bar hidden';
      bar.innerHTML = `
        <div class="floating-bar__logo">
          <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="3" y="4" width="18" height="16" rx="2" stroke="#4a90d9" stroke-width="2"/>
            <path d="M7 9h10M7 13h6" stroke="#4a90d9" stroke-width="2" stroke-linecap="round"/>
          </svg>
        </div>
        <div class="floating-bar__profile-selector">
          <input type="text" class="floating-bar__search" placeholder="Search profiles..." />
          <select class="floating-bar__select" size="4"></select>
        </div>
        <button class="floating-bar__btn floating-bar__btn--save">Save</button>
        <span class="floating-bar__status" style="display:none;"></span>
        <button class="floating-bar__btn floating-bar__btn--close">&times;</button>
      `;

      // Attach event listeners
      const searchInput = bar.querySelector('.floating-bar__search');
      const select = bar.querySelector('.floating-bar__select');
      const saveBtn = bar.querySelector('.floating-bar__btn--save');
      const closeBtn = bar.querySelector('.floating-bar__btn--close');

      searchInput.addEventListener('input', (e) => this.handleSearch(e.target.value));
      select.addEventListener('change', (e) => this.handleProfileSelect(e.target.value));
      saveBtn.addEventListener('click', () => this.handleSave());
      closeBtn.addEventListener('click', () => this.hide());

      this.shadowRoot.appendChild(bar);
    },

    // Show the floating bar
    async show() {
      if (!this.container) {
        this.init();
      }

      // Update visibility immediately
      const bar = this.shadowRoot.querySelector('.floating-bar');
      bar.classList.remove('hidden');
      this.isVisible = true;

      // Load profiles (async)
      this.loadProfiles();

      // Focus the search input
      const searchInput = this.shadowRoot.querySelector('.floating-bar__search');
      setTimeout(() => searchInput.focus(), 100);
    },

    // Hide the floating bar
    hide() {
      if (!this.container) return;

      const bar = this.shadowRoot.querySelector('.floating-bar');
      bar.classList.add('hidden');
      this.isVisible = false;
      this.clearStatus();
    },

    // Toggle visibility
    toggle() {
      if (this.isVisible) {
        this.hide();
      } else {
        this.show();
      }
    },

    // Load profiles from background
    async loadProfiles() {
      try {
        const response = await browser.runtime.sendMessage({
          type: 'GET_PROFILES',
          siteUrl: window.location.href
        });

        this.profiles = response.profiles || [];
        this.updateProfileDropdown();

      } catch (error) {
        console.error('Failed to load profiles:', error);
        this.showStatus('Failed to load profiles', 'error');
      }
    },

    // Update the profile dropdown
    updateProfileDropdown() {
      const select = this.shadowRoot.querySelector('.floating-bar__select');
      const filterLower = this.filterText.toLowerCase();

      // Filter profiles
      const filteredProfiles = this.profiles.filter(profile =>
        !filterLower || profile.name.toLowerCase().includes(filterLower)
      );

      // Build options HTML
      let html = '';
      for (const profile of filteredProfiles) {
        const hotkey = profile.hotkey ? ` (${profile.hotkey})` : '';
        html += `<option value="${profile.id}">${this.escapeHtml(profile.name)}${hotkey}</option>`;
      }

      select.innerHTML = html || '<option value="" disabled>No profiles found</option>';

      // Restore selection if still valid
      if (this.selectedProfileId) {
        const option = select.querySelector(`option[value="${this.selectedProfileId}"]`);
        if (option) {
          select.value = this.selectedProfileId;
        } else {
          this.selectedProfileId = null;
        }
      }
    },

    // Handle search/filter input
    handleSearch(value) {
      this.filterText = value;
      this.updateProfileDropdown();
    },

    // Handle profile selection — auto-fill immediately
    handleProfileSelect(profileId) {
      this.selectedProfileId = profileId || null;
      if (this.selectedProfileId) {
        this.handleFill();
      }
    },

    // Handle fill button click
    async handleFill() {
      if (!this.selectedProfileId) return;

      this.showStatus('Filling...', 'default');

      try {
        const result = await window.OpenAutofillFormFiller.fillWithProfile(
          this.selectedProfileId,
          window.location.href
        );

        if (result.success) {
          const count = result.results?.filled?.length || 0;
          this.showStatus(`Filled ${count} field${count !== 1 ? 's' : ''}`, 'success');
        } else {
          this.showStatus(result.message || 'Fill failed', 'error');
        }

      } catch (error) {
        console.error('Fill error:', error);
        this.showStatus('Fill failed', 'error');
      }
    },

    // Handle save button click
    async handleSave() {
      // Show save dialog
      if (window.OpenAutofillSaveDialog) {
        window.OpenAutofillSaveDialog.show();
      }
    },

    // Show status message
    showStatus(message, type = 'default') {
      const status = this.shadowRoot.querySelector('.floating-bar__status');
      status.textContent = message;
      status.className = 'floating-bar__status';

      if (type === 'success') {
        status.classList.add('floating-bar__status--success');
      } else if (type === 'error') {
        status.classList.add('floating-bar__status--error');
      }

      status.style.display = 'block';

      // Auto-hide success/error after 3 seconds
      if (type !== 'default') {
        setTimeout(() => this.clearStatus(), 3000);
      }
    },

    // Clear status message
    clearStatus() {
      const status = this.shadowRoot.querySelector('.floating-bar__status');
      status.style.display = 'none';
      status.textContent = '';
    },

    // Set up hotkey listener
    setupHotkeyListener() {
      document.addEventListener('keydown', (e) => {
        // Don't trigger if typing in an input
        if (e.target.matches('input, textarea, select')) {
          return;
        }

        // Check each profile's hotkey
        for (const profile of this.profiles) {
          if (profile.hotkey && this.matchesHotkey(e, profile.hotkey)) {
            e.preventDefault();
            this.selectedProfileId = profile.id;
            this.handleFill();
            return;
          }
        }
      });
    },

    // Check if keyboard event matches a hotkey string
    matchesHotkey(event, hotkeyStr) {
      if (!hotkeyStr) return false;

      const parts = hotkeyStr.split('+').map(p => p.trim().toLowerCase());
      let ctrl = false, alt = false, shift = false, meta = false, key = null;

      for (const part of parts) {
        switch (part) {
          case 'ctrl':
          case 'control':
            ctrl = true;
            break;
          case 'alt':
            alt = true;
            break;
          case 'shift':
            shift = true;
            break;
          case 'meta':
          case 'cmd':
          case 'command':
            meta = true;
            break;
          default:
            key = part;
        }
      }

      return (
        event.ctrlKey === ctrl &&
        event.altKey === alt &&
        event.shiftKey === shift &&
        event.metaKey === meta &&
        event.key.toLowerCase() === key
      );
    },

    // Escape HTML to prevent XSS
    escapeHtml(str) {
      const div = document.createElement('div');
      div.textContent = str;
      return div.innerHTML;
    },

    // Destroy the floating bar
    destroy() {
      if (this.container) {
        this.container.remove();
        this.container = null;
        this.shadowRoot = null;
        this.isVisible = false;
      }
    }
  };

  // Export to window for content scripts
  window.OpenAutofillFloatingBar = FloatingBar;
})();
