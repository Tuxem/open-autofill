/**
 * MutationObserver for SPA support
 * Watches for dynamic form additions and changes
 */

(function() {
  'use strict';

  const MutationWatcher = {
    observer: null,
    debounceTimeout: null,
    callbacks: [],
    isWatching: false,

    // Debounce delay in ms
    DEBOUNCE_MS: 100,

    // Start watching for DOM changes
    start(callback) {
      if (callback && typeof callback === 'function') {
        this.callbacks.push(callback);
      }

      if (this.isWatching) {
        return;
      }

      this.observer = new MutationObserver((mutations) => {
        this.handleMutations(mutations);
      });

      this.observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['type', 'name', 'id', 'disabled', 'hidden']
      });

      this.isWatching = true;
      console.log('Open Autofill: MutationWatcher started');
    },

    // Stop watching
    stop() {
      if (this.observer) {
        this.observer.disconnect();
        this.observer = null;
      }

      if (this.debounceTimeout) {
        clearTimeout(this.debounceTimeout);
        this.debounceTimeout = null;
      }

      this.isWatching = false;
      console.log('Open Autofill: MutationWatcher stopped');
    },

    // Handle mutations with debouncing
    handleMutations(mutations) {
      // Check if any mutations are relevant (forms or form fields)
      let hasRelevantChanges = false;

      for (const mutation of mutations) {
        if (this.isRelevantMutation(mutation)) {
          hasRelevantChanges = true;
          break;
        }
      }

      if (!hasRelevantChanges) {
        return;
      }

      // Debounce the callback
      if (this.debounceTimeout) {
        clearTimeout(this.debounceTimeout);
      }

      this.debounceTimeout = setTimeout(() => {
        this.notifyCallbacks();
      }, this.DEBOUNCE_MS);
    },

    // Check if a mutation is relevant to forms
    isRelevantMutation(mutation) {
      // Check added nodes
      if (mutation.addedNodes.length > 0) {
        for (const node of mutation.addedNodes) {
          if (this.isFormRelated(node)) {
            return true;
          }
        }
      }

      // Check if mutation target is form-related
      if (mutation.type === 'attributes') {
        if (this.isFormRelated(mutation.target)) {
          return true;
        }
      }

      return false;
    },

    // Check if a node is form-related
    isFormRelated(node) {
      if (!node || node.nodeType !== Node.ELEMENT_NODE) {
        return false;
      }

      const element = node;

      // Direct form elements
      const formTags = ['FORM', 'INPUT', 'SELECT', 'TEXTAREA', 'BUTTON'];
      if (formTags.includes(element.tagName)) {
        return true;
      }

      // Check if contains form elements
      if (element.querySelector) {
        const hasFormElements = element.querySelector('input, select, textarea, form');
        if (hasFormElements) {
          return true;
        }
      }

      return false;
    },

    // Notify all registered callbacks
    notifyCallbacks() {
      const detector = window.OpenAutofillFormDetector;
      const newFields = detector.findAllFields();

      for (const callback of this.callbacks) {
        try {
          callback({
            type: 'dom_change',
            fieldsCount: newFields.length
          });
        } catch (error) {
          console.error('MutationWatcher callback error:', error);
        }
      }
    },

    // Add a callback
    addCallback(callback) {
      if (typeof callback === 'function' && !this.callbacks.includes(callback)) {
        this.callbacks.push(callback);
      }
    },

    // Remove a callback
    removeCallback(callback) {
      const index = this.callbacks.indexOf(callback);
      if (index > -1) {
        this.callbacks.splice(index, 1);
      }
    },

    // Watch for specific element to appear
    waitForElement(selector, timeout = 5000) {
      return new Promise((resolve, reject) => {
        // Check if element already exists
        const existing = document.querySelector(selector);
        if (existing) {
          resolve(existing);
          return;
        }

        const startTime = Date.now();

        const observer = new MutationObserver((mutations, obs) => {
          const element = document.querySelector(selector);
          if (element) {
            obs.disconnect();
            resolve(element);
          } else if (Date.now() - startTime > timeout) {
            obs.disconnect();
            reject(new Error(`Element ${selector} not found within ${timeout}ms`));
          }
        });

        observer.observe(document.body, {
          childList: true,
          subtree: true
        });

        // Timeout safety
        setTimeout(() => {
          observer.disconnect();
          const element = document.querySelector(selector);
          if (element) {
            resolve(element);
          } else {
            reject(new Error(`Element ${selector} not found within ${timeout}ms`));
          }
        }, timeout);
      });
    },

    // Watch for form to be ready (all fields loaded)
    waitForFormReady(formSelector, expectedFieldCount = 1, timeout = 5000) {
      return new Promise((resolve, reject) => {
        const startTime = Date.now();

        const check = () => {
          const form = formSelector
            ? document.querySelector(formSelector)
            : document.querySelector('form');

          if (form) {
            const detector = window.OpenAutofillFormDetector;
            const fields = detector.findFieldsInContainer(form);

            if (fields.length >= expectedFieldCount) {
              resolve({ form, fields });
              return true;
            }
          }

          if (Date.now() - startTime > timeout) {
            reject(new Error('Form not ready within timeout'));
            return true;
          }

          return false;
        };

        // Check immediately
        if (check()) return;

        // Set up observer
        const observer = new MutationObserver(() => {
          if (check()) {
            observer.disconnect();
          }
        });

        observer.observe(document.body, {
          childList: true,
          subtree: true
        });
      });
    }
  };

  // Export to window for content scripts
  window.OpenAutofillMutationWatcher = MutationWatcher;
})();
