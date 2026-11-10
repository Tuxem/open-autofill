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

      this.logResults(results);
      return results;
    },

    // Log a per-rule report so a fill that "does nothing" can be diagnosed
    logResults(results) {
      const describe = (element) => {
        if (!element) return '';
        const tag = element.tagName.toLowerCase();
        const type = element.type ? `[type=${element.type}]` : '';
        const id = element.id ? `#${element.id}` : '';
        return `${tag}${type}${id}`;
      };
      const row = (rule, outcome, element) => ({
        field: rule.name,
        type: rule.type || '',
        site: rule.site || '',
        outcome,
        element: describe(element)
      });

      const rows = [
        ...results.filled.map(({ rule, element }) => row(rule, 'filled', element)),
        ...results.skipped.map(({ rule, reason }) => row(rule, reason)),
        ...results.notFound.map(({ rule }) => row(rule, 'not_found')),
        ...results.errors.map(({ rule, error }) => row(rule, `error: ${error}`))
      ];

      console.groupCollapsed(`Open Autofill: filled ${results.filled.length}/${rows.length} rules`);
      console.table(rows);
      console.groupEnd();
    },

    // Human-readable outcome of a fill, shown in the floating bar
    summarize(results) {
      const count = results.filled.length;
      let message = `Filled ${count} field${count !== 1 ? 's' : ''}`;

      const details = [];
      const hidden = results.skipped.filter(s => s.reason === 'element_hidden_or_disabled').length;
      const otherSkipped = results.skipped.length - hidden;
      if (results.notFound.length) details.push(`${results.notFound.length} not found`);
      if (hidden) details.push(`${hidden} hidden`);
      if (otherSkipped) details.push(`${otherSkipped} skipped`);
      if (results.errors.length) details.push(`${results.errors.length} errors`);

      if (details.length) message += ` (${details.join(', ')})`;
      return message;
    },

    // Fill a single field
    fillField(element, rule) {
      const rawType = rule.type || window.OpenAutofillFormDetector.getFieldType(element);
      const fieldType = rawType.charAt(0).toUpperCase() + rawType.slice(1).toLowerCase();
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
          console.log('Open Autofill: no rules for profile', profileId, 'on', siteUrl);
          return {
            success: true,
            message: 'No rules for this profile on this page',
            results: { filled: [], skipped: [], notFound: [], errors: [] }
          };
        }

        // Fill the fields
        const results = this.fillFields(rules, { siteUrl });

        return {
          success: true,
          message: this.summarize(results),
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

    // URL matching helper: host only, path ignored.
    // Keep in sync with urlMatchesPattern in core/storage/storage.js.
    urlMatches(currentUrl, pattern) {
      if (!pattern) return true;

      try {
        const currentHost = new URL(currentUrl).hostname.toLowerCase();
        const patternUrl = pattern.includes('://') ? new URL(pattern) : new URL('https://' + pattern);
        const patternHost = patternUrl.hostname.toLowerCase();

        // Hostless pattern (file: page): only that exact page, never every site
        if (!patternHost) return currentUrl.startsWith(pattern);

        return currentHost === patternHost || currentHost.endsWith('.' + patternHost);
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
