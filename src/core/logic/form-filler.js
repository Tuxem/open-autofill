/**
 * Form filling engine
 * Applies rules to fill form fields
 */

(function() {
  'use strict';

  const FormFiller = {
    // Fill all matching fields based on rules
    fillFields(rules, options = {}) {
      const { siteUrl = window.location.href, resume = false } = options;
      const trace = window.OpenAutofillDebugTrace;
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
            trace?.skipped(rule, `site ${rule.site} does not match`);
            results.skipped.push({ rule, reason: 'site_mismatch' });
            continue;
          }

          // Find the field
          const element = window.OpenAutofillFormDetector.findField(rule.name);
          trace?.lookup(rule, element);

          if (!element) {
            results.notFound.push({ rule, reason: 'element_not_found' });
            continue;
          }

          // Check if element is visible and enabled
          if (!window.OpenAutofillFormDetector.isVisibleAndEnabled(element)) {
            trace?.skipped(rule, 'hidden or disabled', element);
            results.skipped.push({ rule, reason: 'element_hidden_or_disabled' });
            continue;
          }

          // After the page reloaded itself, only fix what the reload lost:
          // Append would add the value a second time
          if (resume && ((rule.mode || 'Overwrite') === 'Append' || !this.needsFill(element, rule))) {
            trace?.skipped(rule, 'already filled after the reload', element);
            results.skipped.push({ rule, reason: 'already_filled' });
            continue;
          }

          // Fill based on type
          trace?.beforeFill(element);
          const filled = this.fillField(element, rule);
          trace?.afterFill(element, rule, filled);

          if (filled) {
            results.filled.push({ rule, element });
          } else {
            results.skipped.push({ rule, reason: 'fill_returned_false' });
          }

        } catch (error) {
          trace?.fillError(rule, error);
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

    // Fill a single field.
    // The element decides how it is filled, not rule.type: a type typed by hand
    // in the sheet ("Checkbox/Radio") fell back to text filling and wrote the
    // value into the radio's value attribute, and a "Text" rule on a <select>
    // set its value to a label no option has, leaving the select blank.
    fillField(element, rule) {
      const fieldType = window.OpenAutofillFormDetector.getFieldType(element);
      const mode = rule.mode || 'Overwrite';
      const value = String(rule.value ?? '');
      const dispatcher = window.OpenAutofillEventDispatcher;

      switch (fieldType) {
        case 'Select':
          return dispatcher.fillSelect(element, value, mode);

        case 'Checkbox':
          return dispatcher.fillCheckbox(element, value, mode);

        case 'Radio':
          return this.fillRadioGroup(element, value, mode, rule.name);

        default:
          return dispatcher.fillTextInput(element, value, mode);
      }
    },

    // Fill a radio button group. Two rule shapes:
    // - the rule names the group (saved from a page): value is the option to
    //   pick, matched on the radio's value, then on its label;
    // - the rule names one radio by its id (written by hand): a truthy value
    //   (1, true, VRAI...) selects that radio.
    fillRadioGroup(element, value, mode, identifier) {
      const target = this.resolveRadioTarget(element, value, identifier);
      if (!target) return false;
      return window.OpenAutofillEventDispatcher.fillRadio(target, target.value, mode);
    },

    // The radio a rule selects, or null
    resolveRadioTarget(element, value, identifier) {
      const dispatcher = window.OpenAutofillEventDispatcher;
      const detector = window.OpenAutofillFormDetector;

      if (identifier && element.id === identifier && element.name !== identifier) {
        return dispatcher.isTruthy(value) ? element : null;
      }

      const radios = detector.findRadioGroup(element);
      const wanted = value.trim().toLowerCase();
      return radios.find(r => r.value === value)
        || radios.find(r => r.value.trim().toLowerCase() === wanted)
        || radios.find(r => detector.getFieldLabel(r).trim().toLowerCase() === wanted)
        || null;
    },

    // Whether filling the element with the rule would change anything.
    // Text compares letters and digits only, so the page reformatting a value
    // (539 048 0259, 134,20, SAVARIAUD) does not count as a change.
    needsFill(element, rule) {
      const dispatcher = window.OpenAutofillEventDispatcher;
      const value = String(rule.value ?? '');

      switch (window.OpenAutofillFormDetector.getFieldType(element)) {
        case 'Select': {
          const option = dispatcher.findOption(element, value);
          return !!option && element.value !== option.value;
        }
        case 'Checkbox':
          return element.checked !== dispatcher.isTruthy(value);
        case 'Radio': {
          const target = this.resolveRadioTarget(element, value, rule.name);
          return !!target && !target.checked;
        }
        default: {
          const canon = s => String(s ?? '').replace(/[^\p{L}\p{N}]/gu, '').toLowerCase();
          return canon(element.value) !== canon(dispatcher.normalizeDateValue(element, value));
        }
      }
    },

    // Pages that re-render part of the form after a change (Tapestry or JSF
    // zones, ajax lookups) replace the filled fields with fresh, empty ones a
    // moment later. For a few seconds after a fill, put back what the page
    // wiped and fill fields that only appear then. Stops at the first real user
    // input so it never fights the user, and refills a field a bounded number of
    // times so it cannot loop with the page.
    GUARD_MS: 8000,
    GUARD_INTERVAL_MS: 250,
    MAX_REFILLS_PER_RULE: 3,
    activeGuard: null,

    guardFilledValues(rules, onRefill) {
      this.stopGuard('restarted');

      const detector = window.OpenAutofillFormDetector;
      const trace = window.OpenAutofillDebugTrace;
      // Append would add the value again; Skip if filled must not be forced
      const guarded = rules.filter(rule => (rule.mode || 'Overwrite') === 'Overwrite');
      if (guarded.length === 0) return;

      const refills = new Map();
      const check = () => {
        trace?.sync();
        let count = 0;
        for (const rule of guarded) {
          if ((refills.get(rule) || 0) >= this.MAX_REFILLS_PER_RULE) continue;
          try {
            const element = detector.findField(rule.name);
            if (!element || !detector.isVisibleAndEnabled(element) || !this.needsFill(element, rule)) continue;
            trace?.beforeFill(element);
            const filled = this.fillField(element, rule);
            trace?.afterFill(element, rule, filled, 'refill');
            if (filled) {
              refills.set(rule, (refills.get(rule) || 0) + 1);
              count++;
            }
          } catch (error) {
            trace?.fillError(rule, error);
            console.error('Error refilling field:', rule.name, error);
          }
        }
        if (count > 0) {
          console.log(`Open Autofill: refilled ${count} field${count !== 1 ? 's' : ''} after the page updated`);
          if (onRefill) onRefill(count);
        }
      };

      // Only real user input stops the guard: focus() and the events the filler
      // dispatches itself are not keydown/mousedown/touchstart with isTrusted
      const userEvents = ['keydown', 'mousedown', 'touchstart'];
      const stopOnUserInput = (event) => {
        if (event.isTrusted) this.stopGuard(`user ${event.type}`);
      };

      const interval = setInterval(check, this.GUARD_INTERVAL_MS);
      const timeout = setTimeout(() => this.stopGuard(`${this.GUARD_MS / 1000}s elapsed`), this.GUARD_MS);
      userEvents.forEach(type => document.addEventListener(type, stopOnUserInput, true));

      this.activeGuard = () => {
        clearInterval(interval);
        clearTimeout(timeout);
        userEvents.forEach(type => document.removeEventListener(type, stopOnUserInput, true));
      };
      trace?.log(`guard: keeping ${guarded.length} Overwrite rule(s) filled for ${this.GUARD_MS / 1000}s`);
    },

    stopGuard(reason = 'stopped') {
      if (this.activeGuard) {
        this.activeGuard();
        this.activeGuard = null;
        window.OpenAutofillDebugTrace?.log(`guard: stopped (${reason})`);
      }
    },

    // Some pages reload themselves when a field changes (GUSO), which empties
    // the form the moment it was filled. After a fill, the background is asked
    // to fill again on the next page load of this tab, if it comes within
    // RESUME_WINDOW_MS (enforced by the background) and the user has not typed
    // or clicked since. At most MAX_FILL_PASSES fills in a row, so a field
    // whose change always reloads the page cannot loop.
    // The page's sessionStorage only holds a hint that a resume may be pending,
    // so other page loads do not wake the background; the background alone
    // decides, so a page setting the hint itself gains nothing.
    MAX_FILL_PASSES: 3,
    RESUME_WINDOW_MS: 30000,
    RESUME_HINT_KEY: 'openAutofill.resumePending',
    cancelResume: null,

    armResume(profileId, pass) {
      this.disarmResume();
      if (pass >= this.MAX_FILL_PASSES) return;

      const trace = window.OpenAutofillDebugTrace;
      browser.runtime.sendMessage({ type: 'ARM_FILL_RESUME', profileId, pass: pass + 1 })
        .catch(() => {});
      try {
        sessionStorage.setItem(this.RESUME_HINT_KEY, String(Date.now()));
      } catch (e) {
        // Storage blocked: no resume on this site
      }
      trace?.log(`resume: if the page reloads within ${this.RESUME_WINDOW_MS / 1000}s, the fill runs again (pass ${pass + 1}/${this.MAX_FILL_PASSES})`);

      const userEvents = ['keydown', 'mousedown', 'touchstart'];
      const onUserInput = (event) => {
        if (!event.isTrusted) return;
        this.disarmResume();
        browser.runtime.sendMessage({ type: 'DISARM_FILL_RESUME' }).catch(() => {});
        trace?.log(`resume: cancelled (user ${event.type})`);
      };
      userEvents.forEach(type => document.addEventListener(type, onUserInput, true));
      const timeout = setTimeout(() => this.disarmResume(), this.RESUME_WINDOW_MS);

      this.cancelResume = () => {
        clearTimeout(timeout);
        userEvents.forEach(type => document.removeEventListener(type, onUserInput, true));
      };
    },

    disarmResume() {
      if (this.cancelResume) {
        this.cancelResume();
        this.cancelResume = null;
      }
      this.takeResumeHint();
    },

    // Remove the hint; true if it was set recently enough to ask the background
    takeResumeHint() {
      try {
        const armedAt = Number(sessionStorage.getItem(this.RESUME_HINT_KEY));
        if (!armedAt) return false;
        sessionStorage.removeItem(this.RESUME_HINT_KEY);
        return Date.now() - armedAt < this.RESUME_WINDOW_MS;
      } catch (e) {
        return false;
      }
    },

    // Fill entire form with profile rules
    // options.onRefill(count) is called when fields are filled again after
    // the page wiped or added them (see guardFilledValues)
    // options.pass > 1 marks a fill resumed after the page reloaded itself
    async fillWithProfile(profileId, siteUrl = window.location.href, options = {}) {
      this.stopGuard('new fill');
      this.disarmResume();
      const pass = options.pass || 1;
      const trace = window.OpenAutofillDebugTrace;
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
        trace?.fillStart(profileId, siteUrl, rules, pass);

        if (rules.length === 0) {
          console.log('Open Autofill: no rules for profile', profileId, 'on', siteUrl);
          return {
            success: true,
            message: 'No rules for this profile on this page',
            results: { filled: [], skipped: [], notFound: [], errors: [] }
          };
        }

        // Fill the fields, then keep them filled while the page settles
        const results = this.fillFields(rules, { siteUrl, resume: pass > 1 });
        const applicable = rules.filter(rule => !rule.site || this.urlMatches(siteUrl, rule.site));
        this.guardFilledValues(applicable, options.onRefill);
        trace?.watch(applicable);
        this.armResume(profileId, pass);

        return {
          success: true,
          message: this.summarize(results),
          results
        };

      } catch (error) {
        trace?.log(`fill failed: ${error.message}`);
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
