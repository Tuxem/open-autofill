/**
 * Form filling engine
 * Applies rules to fill form fields
 */

(function() {
  'use strict';

  const FormFiller = {
    // Fill all matching fields based on rules
    fillFields(rules, options = {}) {
      const { siteUrl = window.location.href } = options;
      const results = {
        filled: [],
        skipped: [],
        notFound: [],
        errors: []
      };

      for (const rule of rules) {
        try {
          // Check site filter
          if (rule.site && !this.urlMatches(siteUrl, rule.site)) {
            results.skipped.push({ rule, reason: 'site_mismatch' });
            continue;
          }

          // Find the field
          const element = window.OpenAutofillFormDetector.findField(rule.name);

          if (!element) {
            results.notFound.push({ rule, reason: 'element_not_found' });
            continue;
          }

          // Check if element is visible and enabled
          if (!window.OpenAutofillFormDetector.isVisibleAndEnabled(element)) {
            results.skipped.push({ rule, reason: 'element_hidden_or_disabled' });
            continue;
          }

          // Fill based on type
          const filled = this.fillField(element, rule);

          if (filled) {
            results.filled.push({ rule, element });
          } else {
            results.skipped.push({ rule, reason: 'fill_returned_false' });
          }

        } catch (error) {
          console.error('Error filling field:', rule.name, error);
          results.errors.push({ rule, error: error.message });
        }
      }

      return results;
    },

    // Fill a single field
    fillField(element, rule) {
      const fieldType = rule.type || window.OpenAutofillFormDetector.getFieldType(element);
      const mode = rule.mode || 'Overwrite';
      const value = rule.value;
      const dispatcher = window.OpenAutofillEventDispatcher;

      switch (fieldType) {
        case 'Text':
          return dispatcher.fillTextInput(element, value, mode);

        case 'Select':
          return dispatcher.fillSelect(element, value, mode);

        case 'Checkbox':
          return dispatcher.fillCheckbox(element, value, mode);

        case 'Radio':
          return this.fillRadioGroup(element, value, mode);

        default:
          // Treat as text by default
          return dispatcher.fillTextInput(element, value, mode);
      }
    },

    // Fill radio button group
    fillRadioGroup(element, value, mode) {
      const dispatcher = window.OpenAutofillEventDispatcher;
      const detector = window.OpenAutofillFormDetector;

      // If element is already a radio, find its group
      let radios;
      if (element.type === 'radio') {
        radios = detector.findRadioGroup(element);
      } else {
        // Treat the value as the radio button value to select
        radios = [element];
      }

      // Find the radio with matching value and select it
      for (const radio of radios) {
        if (radio.value === value) {
          return dispatcher.fillRadio(radio, value, mode);
        }
      }

      // If no exact match, try the first radio with the element
      if (radios.length > 0 && radios[0].value === value) {
        return dispatcher.fillRadio(radios[0], value, mode);
      }

      return false;
    },

    // Fill entire form with profile rules
    async fillWithProfile(profileId, siteUrl = window.location.href) {
      try {
        // Get rules for profile from background
        const response = await browser.runtime.sendMessage({
          type: 'GET_RULES_FOR_PROFILE',
          profileId,
          siteUrl
        });

        if (response.error) {
          throw new Error(response.error);
        }

        const rules = response.rules || [];

        if (rules.length === 0) {
          return {
            success: true,
            message: 'No rules found for this profile',
            results: { filled: [], skipped: [], notFound: [], errors: [] }
          };
        }

        // Fill the fields
        const results = this.fillFields(rules, { siteUrl });

        return {
          success: true,
          message: `Filled ${results.filled.length} fields`,
          results
        };

      } catch (error) {
        console.error('Error filling with profile:', error);
        return {
          success: false,
          message: error.message,
          results: null
        };
      }
    },

    // URL matching helper
    urlMatches(currentUrl, pattern) {
      if (!pattern) return true;

      try {
        const current = new URL(currentUrl);
        const patternUrl = pattern.includes('://') ? new URL(pattern) : new URL('https://' + pattern);

        const currentHost = current.hostname.toLowerCase();
        const patternHost = patternUrl.hostname.toLowerCase();

        if (currentHost !== patternHost && !currentHost.endsWith('.' + patternHost)) {
          return false;
        }

        if (patternUrl.pathname && patternUrl.pathname !== '/') {
          if (!current.pathname.startsWith(patternUrl.pathname)) {
            return false;
          }
        }

        return true;
      } catch (e) {
        return currentUrl.includes(pattern);
      }
    },

    // Preview which fields would be filled (without actually filling)
    previewFill(rules, siteUrl = window.location.href) {
      const results = {
        wouldFill: [],
        wouldSkip: [],
        notFound: []
      };

      for (const rule of rules) {
        // Check site filter
        if (rule.site && !this.urlMatches(siteUrl, rule.site)) {
          results.wouldSkip.push({ rule, reason: 'site_mismatch' });
          continue;
        }

        // Find the field
        const element = window.OpenAutofillFormDetector.findField(rule.name);

        if (!element) {
          results.notFound.push({ rule, reason: 'element_not_found' });
          continue;
        }

        // Check visibility
        if (!window.OpenAutofillFormDetector.isVisibleAndEnabled(element)) {
          results.wouldSkip.push({ rule, reason: 'element_hidden_or_disabled', element });
          continue;
        }

        // Check mode
        if (rule.mode === 'Skip if filled' && element.value) {
          results.wouldSkip.push({ rule, reason: 'already_filled', element });
          continue;
        }

        results.wouldFill.push({
          rule,
          element,
          currentValue: element.value,
          newValue: rule.value
        });
      }

      return results;
    }
  };

  // Export to window for content scripts
  window.OpenAutofillFormFiller = FormFiller;
})();
