/**
 * Save dialog component
 * Dialog for saving form data to a profile
 */

(function() {
  'use strict';

  const SaveDialog = {
    container: null,
    shadowRoot: null,
    isVisible: false,
    extractedFields: [],
    existingProfiles: [],

    styles: `
      :host {
        all: initial;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
        font-size: 14px;
        line-height: 1.4;
      }

      .save-dialog-overlay {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.5);
        z-index: 2147483646;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .save-dialog-overlay.hidden {
        display: none;
      }

      .save-dialog {
        background: #fff;
        border-radius: 8px;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
        width: 90%;
        max-width: 500px;
        max-height: 80vh;
        display: flex;
        flex-direction: column;
        overflow: hidden;
      }

      .save-dialog__header {
        padding: 16px 20px;
        border-bottom: 1px solid #eee;
        display: flex;
        align-items: center;
        justify-content: space-between;
      }

      .save-dialog__title {
        font-size: 18px;
        font-weight: 600;
        color: #333;
        margin: 0;
      }

      .save-dialog__close {
        background: none;
        border: none;
        font-size: 24px;
        color: #999;
        cursor: pointer;
        padding: 0;
        line-height: 1;
      }

      .save-dialog__close:hover {
        color: #333;
      }

      .save-dialog__body {
        padding: 20px;
        overflow-y: auto;
        flex: 1;
      }

      .save-dialog__section {
        margin-bottom: 20px;
      }

      .save-dialog__section:last-child {
        margin-bottom: 0;
      }

      .save-dialog__label {
        display: block;
        font-weight: 500;
        color: #555;
        margin-bottom: 8px;
      }

      .save-dialog__input,
      .save-dialog__select {
        width: 100%;
        padding: 10px 12px;
        border: 1px solid #ddd;
        border-radius: 4px;
        font-size: 14px;
        box-sizing: border-box;
      }

      .save-dialog__input:focus,
      .save-dialog__select:focus {
        outline: none;
        border-color: #4a90d9;
      }

      .save-dialog__radio-group {
        display: flex;
        gap: 20px;
        margin-bottom: 12px;
      }

      .save-dialog__radio-label {
        display: flex;
        align-items: center;
        gap: 6px;
        cursor: pointer;
      }

      .save-dialog__fields-list {
        max-height: 200px;
        overflow-y: auto;
        border: 1px solid #eee;
        border-radius: 4px;
      }

      .save-dialog__field-item {
        display: flex;
        align-items: center;
        padding: 10px 12px;
        border-bottom: 1px solid #eee;
      }

      .save-dialog__field-item:last-child {
        border-bottom: none;
      }

      .save-dialog__field-checkbox {
        margin-right: 10px;
      }

      .save-dialog__field-info {
        flex: 1;
        min-width: 0;
      }

      .save-dialog__field-name {
        font-weight: 500;
        color: #333;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .save-dialog__field-value {
        font-size: 12px;
        color: #888;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .save-dialog__field-type {
        font-size: 11px;
        color: #fff;
        background: #888;
        padding: 2px 6px;
        border-radius: 3px;
        margin-left: 8px;
      }

      .save-dialog__footer {
        padding: 16px 20px;
        border-top: 1px solid #eee;
        display: flex;
        justify-content: flex-end;
        gap: 10px;
      }

      .save-dialog__btn {
        padding: 10px 20px;
        border: none;
        border-radius: 4px;
        font-size: 14px;
        font-weight: 500;
        cursor: pointer;
        transition: background-color 0.2s;
      }

      .save-dialog__btn--cancel {
        background: #f0f0f0;
        color: #333;
      }

      .save-dialog__btn--cancel:hover {
        background: #e0e0e0;
      }

      .save-dialog__btn--save {
        background: #5cb85c;
        color: white;
      }

      .save-dialog__btn--save:hover {
        background: #4cae4c;
      }

      .save-dialog__btn--save:disabled {
        background: #ccc;
        cursor: not-allowed;
      }

      .save-dialog__empty {
        padding: 20px;
        text-align: center;
        color: #999;
      }

      @media (prefers-color-scheme: dark) {
        .save-dialog {
          background: #2d2d2d;
          color: #e0e0e0;
        }

        .save-dialog__header {
          border-color: #444;
        }

        .save-dialog__title {
          color: #e0e0e0;
        }

        .save-dialog__input,
        .save-dialog__select {
          background: #3d3d3d;
          border-color: #555;
          color: #e0e0e0;
        }

        .save-dialog__fields-list {
          border-color: #444;
        }

        .save-dialog__field-item {
          border-color: #444;
        }

        .save-dialog__field-name {
          color: #e0e0e0;
        }

        .save-dialog__footer {
          border-color: #444;
        }

        .save-dialog__btn--cancel {
          background: #444;
          color: #e0e0e0;
        }

        .save-dialog__btn--cancel:hover {
          background: #555;
        }
      }
    `,

    // Initialize the dialog
    init() {
      if (this.container) return;

      this.container = document.createElement('div');
      this.container.id = 'open-autofill-save-dialog';
      this.shadowRoot = this.container.attachShadow({ mode: 'closed' });

      const styleEl = document.createElement('style');
      styleEl.textContent = this.styles;
      this.shadowRoot.appendChild(styleEl);

      this.render();
      document.body.appendChild(this.container);
    },

    // Render the dialog HTML
    render() {
      const overlay = document.createElement('div');
      overlay.className = 'save-dialog-overlay hidden';
      overlay.innerHTML = `
        <div class="save-dialog">
          <div class="save-dialog__header">
            <h2 class="save-dialog__title">Save Form Data</h2>
            <button class="save-dialog__close">&times;</button>
          </div>
          <div class="save-dialog__body">
            <div class="save-dialog__section">
              <div class="save-dialog__radio-group">
                <label class="save-dialog__radio-label">
                  <input type="radio" name="save-mode" value="new" checked />
                  New profile
                </label>
                <label class="save-dialog__radio-label">
                  <input type="radio" name="save-mode" value="existing" />
                  Existing profile
                </label>
              </div>

              <div id="new-profile-section">
                <label class="save-dialog__label">Profile name</label>
                <input type="text" class="save-dialog__input" id="profile-name-input" placeholder="Enter profile name..." />
              </div>

              <div id="existing-profile-section" style="display:none;">
                <label class="save-dialog__label">Select profile</label>
                <select class="save-dialog__select" id="profile-select">
                  <option value="">Select...</option>
                </select>
              </div>
            </div>

            <div class="save-dialog__section">
              <label class="save-dialog__label">Fields to save</label>
              <div class="save-dialog__fields-list" id="fields-list">
                <div class="save-dialog__empty">No fields found</div>
              </div>
            </div>
          </div>
          <div class="save-dialog__footer">
            <button class="save-dialog__btn save-dialog__btn--cancel">Cancel</button>
            <button class="save-dialog__btn save-dialog__btn--save">Save</button>
          </div>
        </div>
      `;

      // Event listeners
      overlay.querySelector('.save-dialog__close').addEventListener('click', () => this.hide());
      overlay.querySelector('.save-dialog__btn--cancel').addEventListener('click', () => this.hide());
      overlay.querySelector('.save-dialog__btn--save').addEventListener('click', () => this.handleSave());

      // Click outside to close
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) this.hide();
      });

      // Radio button toggle
      const radios = overlay.querySelectorAll('input[name="save-mode"]');
      radios.forEach(radio => {
        radio.addEventListener('change', (e) => this.handleModeChange(e.target.value));
      });

      this.shadowRoot.appendChild(overlay);
    },

    // Show the dialog
    async show(targetElement = null) {
      if (!this.container) this.init();

      // Extract fields
      const extractor = window.OpenAutofillFieldExtractor;
      if (targetElement) {
        const field = extractor.extractSingleField(targetElement);
        this.extractedFields = field ? [field] : [];
      } else {
        this.extractedFields = extractor.getAllUniqueFields().filter(f => f.value);
      }

      // Load existing profiles
      await this.loadProfiles();

      // Update UI
      this.updateFieldsList();
      this.updateProfileSelect();

      // Show overlay
      const overlay = this.shadowRoot.querySelector('.save-dialog-overlay');
      overlay.classList.remove('hidden');
      this.isVisible = true;

      // Focus the profile name input
      const nameInput = this.shadowRoot.querySelector('#profile-name-input');
      setTimeout(() => nameInput.focus(), 100);
    },

    // Hide the dialog
    hide() {
      if (!this.container) return;

      const overlay = this.shadowRoot.querySelector('.save-dialog-overlay');
      overlay.classList.add('hidden');
      this.isVisible = false;
    },

    // Load existing profiles
    async loadProfiles() {
      try {
        const response = await browser.runtime.sendMessage({
          type: 'GET_PROFILES'
        });
        this.existingProfiles = response.profiles || [];
      } catch (error) {
        console.error('Failed to load profiles:', error);
        this.existingProfiles = [];
      }
    },

    // Handle save mode change
    handleModeChange(mode) {
      const newSection = this.shadowRoot.querySelector('#new-profile-section');
      const existingSection = this.shadowRoot.querySelector('#existing-profile-section');

      if (mode === 'new') {
        newSection.style.display = 'block';
        existingSection.style.display = 'none';
      } else {
        newSection.style.display = 'none';
        existingSection.style.display = 'block';
      }
    },

    // Update the fields list
    updateFieldsList() {
      const listEl = this.shadowRoot.querySelector('#fields-list');

      if (this.extractedFields.length === 0) {
        listEl.innerHTML = '<div class="save-dialog__empty">No fields with values found</div>';
        return;
      }

      let html = '';
      for (let i = 0; i < this.extractedFields.length; i++) {
        const field = this.extractedFields[i];
        const displayValue = field.value.length > 30
          ? field.value.substring(0, 30) + '...'
          : field.value;

        html += `
          <div class="save-dialog__field-item">
            <input type="checkbox" class="save-dialog__field-checkbox" data-index="${i}" checked />
            <div class="save-dialog__field-info">
              <div class="save-dialog__field-name">${this.escapeHtml(field.label || field.name)}</div>
              <div class="save-dialog__field-value">${this.escapeHtml(displayValue)}</div>
            </div>
            <span class="save-dialog__field-type">${field.type}</span>
          </div>
        `;
      }

      listEl.innerHTML = html;
    },

    // Update profile select dropdown
    updateProfileSelect() {
      const select = this.shadowRoot.querySelector('#profile-select');
      let html = '<option value="">Select...</option>';

      for (const profile of this.existingProfiles) {
        html += `<option value="${profile.id}">${this.escapeHtml(profile.name)}</option>`;
      }

      select.innerHTML = html;
    },

    // Handle save button click
    async handleSave() {
      const mode = this.shadowRoot.querySelector('input[name="save-mode"]:checked').value;

      // Get selected fields
      const checkboxes = this.shadowRoot.querySelectorAll('.save-dialog__field-checkbox:checked');
      const selectedFields = Array.from(checkboxes).map(cb => {
        const index = parseInt(cb.dataset.index, 10);
        return this.extractedFields[index];
      });

      if (selectedFields.length === 0) {
        alert('Please select at least one field to save');
        return;
      }

      let profileId = null;
      let profileName = null;

      if (mode === 'new') {
        profileName = this.shadowRoot.querySelector('#profile-name-input').value.trim();
        if (!profileName) {
          alert('Please enter a profile name');
          return;
        }
      } else {
        profileId = this.shadowRoot.querySelector('#profile-select').value;
        if (!profileId) {
          alert('Please select a profile');
          return;
        }
      }

      try {
        const response = await browser.runtime.sendMessage({
          type: 'SAVE_FORM_DATA',
          profileId,
          profileName,
          fields: selectedFields,
          siteUrl: window.location.href
        });

        if (response.error) {
          throw new Error(response.error);
        }

        // Success - hide dialog and show notification
        this.hide();

        // Show success in floating bar if visible
        if (window.OpenAutofillFloatingBar?.isVisible) {
          window.OpenAutofillFloatingBar.showStatus(
            `Saved ${selectedFields.length} field${selectedFields.length !== 1 ? 's' : ''}`,
            'success'
          );
          // Reload profiles
          window.OpenAutofillFloatingBar.loadProfiles();
        }

      } catch (error) {
        console.error('Save failed:', error);
        alert('Failed to save: ' + error.message);
      }
    },

    // Escape HTML
    escapeHtml(str) {
      const div = document.createElement('div');
      div.textContent = str;
      return div.innerHTML;
    },

    // Destroy the dialog
    destroy() {
      if (this.container) {
        this.container.remove();
        this.container = null;
        this.shadowRoot = null;
        this.isVisible = false;
      }
    }
  };

  // Export to window
  window.OpenAutofillSaveDialog = SaveDialog;
})();
