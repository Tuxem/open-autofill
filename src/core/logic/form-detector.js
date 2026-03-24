/**
 * Form field detection module
 * Finds and identifies form fields in the document
 */

(function() {
  'use strict';

  const FormDetector = {
    // Selectors for different input types
    selectors: {
      text: 'input[type="text"], input[type="email"], input[type="tel"], input[type="url"], input[type="search"], input[type="password"], input[type="number"], input[type="date"], input[type="datetime-local"], input[type="time"], input[type="month"], input[type="week"], input:not([type]), textarea',
      select: 'select',
      checkbox: 'input[type="checkbox"]',
      radio: 'input[type="radio"]',
      all: 'input, textarea, select'
    },

    // Find a field by its identifier (id, name, or CSS selector)
    findField(identifier) {
      if (!identifier) return null;

      // Try by ID first
      let element = document.getElementById(identifier);
      if (element) return element;

      // Try by name attribute
      element = document.querySelector(`[name="${CSS.escape(identifier)}"]`);
      if (element) return element;

      // Try as CSS selector
      try {
        element = document.querySelector(identifier);
        if (element) return element;
      } catch (e) {
        // Invalid selector, ignore
      }

      // Try partial matches (id contains, name contains)
      element = document.querySelector(`[id*="${CSS.escape(identifier)}"]`);
      if (element) return element;

      element = document.querySelector(`[name*="${CSS.escape(identifier)}"]`);
      if (element) return element;

      return null;
    },

    // Find all form fields on the page
    findAllFields() {
      const elements = document.querySelectorAll(this.selectors.all);
      return Array.from(elements).filter(el => this.isVisibleAndEnabled(el));
    },

    // Find fields within a specific form or container
    findFieldsInContainer(container) {
      const elements = container.querySelectorAll(this.selectors.all);
      return Array.from(elements).filter(el => this.isVisibleAndEnabled(el));
    },

    // Find the form containing an element
    findParentForm(element) {
      return element.closest('form');
    },

    // Find all forms on the page
    findAllForms() {
      return Array.from(document.querySelectorAll('form'));
    },

    // Check if element is visible and enabled
    isVisibleAndEnabled(element) {
      if (!element) return false;

      // Check if disabled
      if (element.disabled) return false;

      // Check if hidden by type
      if (element.type === 'hidden') return false;

      // Check computed style
      const style = window.getComputedStyle(element);
      if (style.display === 'none' || style.visibility === 'hidden') {
        return false;
      }

      // Check if has dimensions
      const rect = element.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) {
        // CSS-styled radio/checkbox: the native input may be hidden while the
        // associated label provides the visible, interactive UI. Accept if the
        // label is present and visible.
        const inputType = (element.type || '').toLowerCase();
        if ((inputType === 'radio' || inputType === 'checkbox') && element.id) {
          const label = document.querySelector(`label[for="${CSS.escape(element.id)}"]`);
          if (label) {
            const labelRect = label.getBoundingClientRect();
            if (labelRect.width > 0 && labelRect.height > 0) {
              const labelStyle = window.getComputedStyle(label);
              if (labelStyle.display !== 'none' && labelStyle.visibility !== 'hidden') {
                return true;
              }
            }
          }
        }
        return false;
      }

      return true;
    },

    // Determine the type category of a field
    getFieldType(element) {
      const tagName = element.tagName.toLowerCase();

      if (tagName === 'select') {
        return 'Select';
      }

      if (tagName === 'textarea') {
        return 'Text';
      }

      if (tagName === 'input') {
        const type = (element.type || 'text').toLowerCase();

        switch (type) {
          case 'checkbox':
            return 'Checkbox';
          case 'radio':
            return 'Radio';
          case 'hidden':
            return 'Hidden';
          case 'submit':
          case 'button':
          case 'reset':
          case 'image':
            return 'Button';
          case 'file':
            return 'File';
          default:
            return 'Text';
        }
      }

      return 'Unknown';
    },

    // Get the identifier for a field (what to use in rules)
    getFieldIdentifier(element) {
      // Prefer ID
      if (element.id) {
        return element.id;
      }

      // Then name
      if (element.name) {
        return element.name;
      }

      // Generate a CSS selector path
      return this.generateSelector(element);
    },

    // Generate a unique CSS selector for an element
    generateSelector(element) {
      const path = [];
      let current = element;

      while (current && current !== document.body) {
        let selector = current.tagName.toLowerCase();

        if (current.id) {
          selector = `#${CSS.escape(current.id)}`;
          path.unshift(selector);
          break;
        }

        if (current.className && typeof current.className === 'string') {
          const classes = current.className.trim().split(/\s+/)
            .filter(c => c && !c.match(/^(ng-|v-|react-)/)) // Skip framework classes
            .slice(0, 2) // Limit to first 2 classes
            .map(c => `.${CSS.escape(c)}`)
            .join('');
          if (classes) {
            selector += classes;
          }
        }

        // Add nth-child if needed for uniqueness
        const parent = current.parentElement;
        if (parent) {
          const siblings = Array.from(parent.children).filter(
            child => child.tagName === current.tagName
          );
          if (siblings.length > 1) {
            const index = siblings.indexOf(current) + 1;
            selector += `:nth-of-type(${index})`;
          }
        }

        path.unshift(selector);
        current = current.parentElement;
      }

      return path.join(' > ');
    },

    // Get human-readable label for a field
    getFieldLabel(element) {
      // Check for associated label element
      if (element.id) {
        const label = document.querySelector(`label[for="${CSS.escape(element.id)}"]`);
        if (label) {
          return label.textContent.trim();
        }
      }

      // Check for parent label
      const parentLabel = element.closest('label');
      if (parentLabel) {
        // Get text content excluding the input itself
        const clone = parentLabel.cloneNode(true);
        const inputs = clone.querySelectorAll('input, select, textarea');
        inputs.forEach(input => input.remove());
        const text = clone.textContent.trim();
        if (text) return text;
      }

      // Check for aria-label
      if (element.getAttribute('aria-label')) {
        return element.getAttribute('aria-label');
      }

      // Check for placeholder
      if (element.placeholder) {
        return element.placeholder;
      }

      // Check for title
      if (element.title) {
        return element.title;
      }

      // Fallback to name or id
      return element.name || element.id || 'Unnamed field';
    },

    // Extract field info for saving
    extractFieldInfo(element) {
      return {
        identifier: this.getFieldIdentifier(element),
        type: this.getFieldType(element),
        label: this.getFieldLabel(element),
        value: this.getFieldValue(element),
        element: element
      };
    },

    // Get the current value of a field
    getFieldValue(element) {
      const type = this.getFieldType(element);

      switch (type) {
        case 'Checkbox':
          return element.checked ? 'true' : 'false';
        case 'Radio':
          // For radio, return value if checked, otherwise empty
          return element.checked ? element.value : '';
        case 'Select':
          return element.value;
        case 'Text':
        default:
          return element.value || '';
      }
    },

    // Find all fields that match a specific type
    findFieldsByType(type) {
      let selector;
      switch (type) {
        case 'Text':
          selector = this.selectors.text;
          break;
        case 'Select':
          selector = this.selectors.select;
          break;
        case 'Checkbox':
          selector = this.selectors.checkbox;
          break;
        case 'Radio':
          selector = this.selectors.radio;
          break;
        default:
          selector = this.selectors.all;
      }

      return Array.from(document.querySelectorAll(selector))
        .filter(el => this.isVisibleAndEnabled(el));
    },

    // Find radio buttons in the same group
    findRadioGroup(element) {
      if (element.type !== 'radio' || !element.name) {
        return [element];
      }

      return Array.from(document.querySelectorAll(
        `input[type="radio"][name="${CSS.escape(element.name)}"]`
      ));
    }
  };

  // Export to window for content scripts
  window.OpenAutofillFormDetector = FormDetector;
})();
