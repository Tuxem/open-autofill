/**
 * Verbose fill trace, off by default.
 *
 * Turned on from the options page (Data Management > Verbose console logs).
 * Every step of a fill is printed to the page's web console as one plain-text
 * line prefixed with [OA]: which element each rule found, its state before and
 * after the fill, the requests the page sends, the form controls it removes or
 * adds, and what the refill guard does. The page is then watched for a few
 * seconds and the whole trace is printed again as a single message, so it can
 * be copied in one go.
 */

(function() {
  'use strict';

  const WATCH_MS = 15000;
  const POLL_MS = 100;
  const MAX_LINES = 2000;
  const CONTROLS = 'input, select, textarea';
  const ZONES = '.t-zone, [data-container-type="zone"]';
  const OWN_HOSTS = ['open-autofill-floating-bar', 'open-autofill-save-dialog'];

  const quote = (value, max = 80) => {
    const text = String(value ?? '');
    return JSON.stringify(text.length > max ? text.slice(0, max) + '…' : text);
  };

  const DebugTrace = {
    enabled: false,
    t0: 0,
    lines: [],
    own: false,
    pending: null,
    session: null,

    init() {
      const apply = (settings) => {
        this.enabled = !!(settings && settings.debugLogging);
      };
      try {
        browser.storage.local.get('settings').then(({ settings }) => {
          apply(settings);
          if (this.enabled) this.logPageLoad();
        }).catch(() => {});
        browser.storage.onChanged.addListener((changes, area) => {
          if (area === 'local' && changes.settings) apply(changes.settings.newValue);
        });
      } catch (e) {
        // No extension APIs (unit tests): stays off
      }
    },

    // Which page this is and how it was reached: a page that reloads itself
    // after a fill shows up as a new page load right after the trace
    logPageLoad() {
      const navigation = performance.getEntriesByType && performance.getEntriesByType('navigation')[0];
      console.log(`[OA] verbose logs on (turn off in the extension options). Page loaded: ${this.shortUrl(location.href)} ` +
                  `nav=${navigation ? navigation.type : '?'} referrer=${document.referrer ? this.shortUrl(document.referrer) : '-'}`);
    },

    log(message) {
      if (!this.enabled) return;
      if (this.lines.length === MAX_LINES) {
        console.log('[OA] trace too long, further lines dropped');
        this.lines.push('(trace too long, further lines dropped)');
      }
      if (this.lines.length > MAX_LINES) return;
      const elapsed = this.t0 ? `+${Math.round(performance.now() - this.t0)}ms ` : '';
      const line = `${elapsed}${message}`;
      this.lines.push(line);
      console.log(`[OA] ${line}`);
    },

    // ============== DESCRIBING THE PAGE ==============

    describe(element) {
      if (!element || !element.tagName) return 'null';
      // Attributes, not properties: a form's .id or .name returns the input
      // of that name when it has one
      const tag = element.tagName.toLowerCase();
      const id = element.getAttribute('id');
      const name = element.getAttribute('name');
      let text = tag;
      if (tag === 'input') text += `[type=${element.type}]`;
      if (id) text += `#${id}`;
      if (name && name !== id) text += `[name=${name}]`;
      const zone = element.closest && element.closest(ZONES);
      if (zone) text += ` zone=#${zone.getAttribute('id') || '?'}`;
      return text;
    },

    // Attributes that may carry the page's behaviour (onchange, data-*...)
    attributes(element, skip = ['id', 'name', 'class', 'style', 'value', 'type']) {
      return Array.from(element.attributes)
        .filter(attr => !skip.includes(attr.name))
        .map(attr => `${attr.name}=${quote(attr.value, 60)}`)
        .join(' ');
    },

    // Nearest ancestor with an id, to tell where the page re-rendered
    container(node) {
      let current = node;
      while (current && current.nodeType === 1) {
        const id = current.getAttribute('id');
        if (id) return `${current.tagName.toLowerCase()}#${id}`;
        current = current.parentElement;
      }
      return node && node.tagName ? node.tagName.toLowerCase() : '?';
    },

    state(element) {
      if (!element) return 'none';
      const detector = window.OpenAutofillFormDetector;
      const bits = [];
      switch (detector.getFieldType(element)) {
        case 'Checkbox':
        case 'Radio':
          bits.push(`checked=${element.checked}`);
          break;
        case 'Select': {
          const selected = element.selectedOptions && element.selectedOptions[0];
          bits.push(`value=${quote(element.value)} text=${quote(selected ? selected.text : '')} options=${element.options.length}`);
          break;
        }
        default:
          bits.push(`value=${quote(element.value)}`);
      }
      if (!element.isConnected) {
        bits.push('DETACHED');
      } else {
        if (element.disabled) bits.push('disabled');
        if (element.readOnly) bits.push('readonly');
        if (!detector.isVisibleAndEnabled(element)) bits.push('hidden');
      }
      return bits.join(' ');
    },

    // How findField reached the element (mirrors its strategy order)
    matchedBy(element, identifier) {
      if (element.id === identifier) return 'id';
      if (element.name === identifier) return 'name';
      try {
        if (element.matches(identifier)) return 'css selector';
      } catch (e) {
        // Not a selector
      }
      if ((element.id || '').includes(identifier)) return 'id contains';
      return 'name contains';
    },

    // Controls whose id or name contains the identifier, ignoring case
    similarControls(identifier) {
      const wanted = identifier.toLowerCase();
      return Array.from(document.querySelectorAll(CONTROLS))
        .filter(el => (el.id || '').toLowerCase().includes(wanted) ||
                      (el.name || '').toLowerCase().includes(wanted))
        .slice(0, 8);
    },

    listOptions(select) {
      const options = Array.from(select.options).slice(0, 40)
        .map(o => o.value === o.text ? quote(o.text, 40) : `${quote(o.text, 40)}=${quote(o.value, 20)}`);
      const more = select.options.length > 40 ? ` … (${select.options.length} in all)` : '';
      return options.join(' | ') + more;
    },

    listRadioGroup(radio) {
      const detector = window.OpenAutofillFormDetector;
      return detector.findRadioGroup(radio)
        .map(r => `#${r.id || '?'} value=${quote(r.value, 30)} label=${quote(detector.getFieldLabel(r), 40)} checked=${r.checked}`)
        .join(' | ');
    },

    // ============== FILL HOOKS (called by FormFiller) ==============

    fillStart(profileId, siteUrl, rules, pass = 1) {
      if (!this.enabled) return;
      this.stopWatch('new fill');
      this.t0 = performance.now();
      this.lines = [];

      let page = siteUrl;
      try {
        const url = new URL(siteUrl);
        page = url.origin + url.pathname; // the query may hold session state
      } catch (e) {
        // Keep it verbatim
      }
      const controls = Array.from(document.querySelectorAll(CONTROLS));
      const visible = controls.filter(el => window.OpenAutofillFormDetector.isVisibleAndEnabled(el));
      const zones = Array.from(document.querySelectorAll(ZONES)).map(z => `#${z.id || '?'}`);

      this.log(`fill start: profile ${profileId} on ${page}` +
               (pass > 1 ? ` (pass ${pass}: the page reloaded after the previous fill)` : ''));
      this.log(`page: frame=${window.top === window ? 'top' : 'sub'} iframes=${document.querySelectorAll('iframe, frame').length} ` +
               `forms=${document.forms.length} controls=${controls.length} (${visible.length} visible) ` +
               `zones=${zones.length ? zones.join(',') : 'none'} ua=${navigator.userAgent.match(/(Firefox|Chrome)\/[\d.]+/)?.[0] || '?'}`);
      for (const form of Array.from(document.forms).slice(0, 5)) {
        const extra = this.attributes(form, ['id', 'name', 'class', 'style', 'action', 'method']);
        this.log(`form: ${this.describe(form)} method=${form.getAttribute('method') || 'get'} ` +
                 `action=${this.shortUrl(form.getAttribute('action') || '')}${extra ? ' ' + extra : ''}`);
      }
      this.log(`${rules.length} rule(s) for this page:`);
      for (const rule of rules) {
        this.log(`  rule ${rule.id} name=${quote(rule.name)} type=${rule.type || '-'} mode=${rule.mode || 'Overwrite'} ` +
                 `site=${rule.site || '-'} value=${quote(rule.value)}`);
      }
    },

    lookup(rule, element) {
      if (!this.enabled) return;
      const tag = `${rule.id} ${rule.name}`;
      if (!element) {
        const similar = this.similarControls(rule.name);
        this.log(`${tag}: NOT FOUND` + (similar.length
          ? `; controls with a similar id/name: ${similar.map(el => this.describe(el)).join(', ')}`
          : '; no control has a similar id or name'));
        return;
      }

      const escaped = CSS.escape(rule.name);
      const count = selector => document.querySelectorAll(selector).length;
      this.log(`${tag}: found ${this.describe(element)} via ${this.matchedBy(element, rule.name)} ` +
               `(elements with id=${count(`[id="${escaped}"]`)} name=${count(`[name="${escaped}"]`)} ` +
               `id contains=${count(`[id*="${escaped}"]`)} name contains=${count(`[name*="${escaped}"]`)})`);

      const attributes = this.attributes(element);
      if (attributes) this.log(`${tag}: attributes: ${attributes}`);

      const type = window.OpenAutofillFormDetector.getFieldType(element);
      if (type === 'Radio') this.log(`${tag}: radio group: ${this.listRadioGroup(element)}`);
      if (type === 'Select' && !window.OpenAutofillEventDispatcher.findOption(element, String(rule.value ?? ''))) {
        this.log(`${tag}: no option matches ${quote(rule.value)}; options: ${this.listOptions(element)}`);
      }
    },

    skipped(rule, reason, element) {
      if (!this.enabled) return;
      this.log(`${rule.id} ${rule.name}: skipped (${reason}) ${element ? this.state(element) : ''}`);
    },

    beforeFill(element) {
      this.own = true;
      if (!this.enabled) return;
      this.pending = this.state(element);
    },

    afterFill(element, rule, filled, label = 'fill') {
      this.own = false;
      if (!this.enabled) return;
      this.log(`${rule.id} ${rule.name}: ${label} ${filled ? 'done' : 'returned false'}: ${this.pending} → ${this.state(element)}`);
      // The watch reports what the page changes, not what the guard just did
      const track = this.session && this.session.tracks.get(rule);
      if (track) {
        track.node = element;
        track.state = this.state(element);
        if (label === 'refill') track.refills++;
      }
    },

    fillError(rule, error) {
      this.own = false;
      this.log(`${rule.id} ${rule.name}: ERROR ${error && error.message}`);
    },

    // ============== WATCHING THE PAGE AFTER A FILL ==============

    watch(rules) {
      if (!this.enabled) return;
      const detector = window.OpenAutofillFormDetector;
      const session = { tracks: new Map(), cleanups: [] };
      this.session = session;

      for (const rule of rules) {
        const node = detector.findField(rule.name);
        session.tracks.set(rule, { node, state: node ? this.state(node) : null, replaced: 0, changes: 0, refills: 0 });
      }
      this.log(`watching the page for ${WATCH_MS / 1000}s`);

      // Fields replaced, emptied or changed by the page
      session.poll = () => {
        for (const [rule, track] of session.tracks) {
          const tag = `${rule.id} ${rule.name}`;
          const node = detector.findField(rule.name);
          if (node !== track.node) {
            if (!node) {
              this.log(`${tag}: field GONE (was ${track.node && track.node.isConnected ? 'still in the page' : 'removed'})`);
            } else if (!track.node) {
              this.log(`${tag}: field appeared: ${this.describe(node)} ${this.state(node)}`);
            } else {
              this.log(`${tag}: field REPLACED by the page: old ${track.node.isConnected ? 'still in the page' : 'removed'} ` +
                       `(${this.state(track.node)}), new ${this.describe(node)} ${this.state(node)}`);
            }
            track.node = node;
            track.state = node ? this.state(node) : null;
            track.replaced++;
          } else if (node) {
            const state = this.state(node);
            if (state !== track.state) {
              this.log(`${tag}: changed: ${track.state} → ${state}`);
              track.state = state;
              track.changes++;
            }
          }
        }
      };
      const poll = setInterval(session.poll, POLL_MS);
      session.cleanups.push(() => clearInterval(poll));

      // Requests sent by the page (ajax zone updates, lookups)
      try {
        const observer = new PerformanceObserver(list => {
          for (const entry of list.getEntries()) {
            if (!['xmlhttprequest', 'fetch', 'beacon'].includes(entry.initiatorType)) continue;
            const status = entry.responseStatus ? ` status=${entry.responseStatus}` : '';
            this.log(`net: ${entry.initiatorType} ${this.shortUrl(entry.name)} sent at +${Math.round(entry.startTime - this.t0)}ms, ` +
                     `took ${Math.round(entry.duration)}ms${status}`);
          }
        });
        observer.observe({ type: 'resource' });
        session.cleanups.push(() => observer.disconnect());
      } catch (e) {
        this.log(`net: requests not traced (${e.message})`);
      }

      // Form controls the page removes or adds (zone re-render)
      const mutations = new MutationObserver(records => {
        const byContainer = new Map();
        const collect = (nodes, key, record) => {
          for (const node of nodes) {
            if (node.nodeType !== 1 || OWN_HOSTS.includes(node.id)) continue;
            const controls = node.matches(CONTROLS) ? [node] : Array.from(node.querySelectorAll(CONTROLS));
            if (controls.length === 0) continue;
            const where = this.container(record.target);
            if (!byContainer.has(where)) byContainer.set(where, { removed: [], added: [] });
            byContainer.get(where)[key].push(...controls);
          }
        };
        for (const record of records) {
          collect(record.removedNodes, 'removed', record);
          collect(record.addedNodes, 'added', record);
        }
        for (const [where, { removed, added }] of byContainer) {
          const names = list => {
            const shown = list.filter(el => el.type !== 'hidden').map(el => el.id || el.name || el.tagName.toLowerCase());
            const hidden = list.length - shown.length;
            return shown.slice(0, 12).join(',') + (shown.length > 12 ? ',…' : '') + (hidden ? ` +${hidden} hidden` : '');
          };
          this.log(`dom: page removed ${removed.length} / added ${added.length} form control(s) in ${where}` +
                   (removed.length ? ` removed=[${names(removed)}]` : '') +
                   (added.length ? ` added=[${names(added)}]` : ''));
        }
      });
      mutations.observe(document.documentElement, { childList: true, subtree: true });
      session.cleanups.push(() => mutations.disconnect());

      // Events the page fires itself, form submit/reset, page unload
      const onEvent = (event) => {
        const target = event.target;
        if (event.type === 'pagehide' || event.type === 'beforeunload') {
          this.log(`page is UNLOADING (${event.type}: navigation or reload, focus on ${this.describe(document.activeElement)}); ` +
                   'filled values are lost with it');
          this.stopWatch('page unload');
          return;
        }
        if (event.type === 'submit' || event.type === 'reset') {
          this.log(`form ${event.type.toUpperCase()}: ${this.describe(target)} action=${this.shortUrl(target.getAttribute('action') || '')}`);
          return;
        }
        if (this.own || !target || !target.matches || !target.matches(CONTROLS)) return;
        this.log(`event from the ${event.isTrusted ? 'user' : 'page'}: ${event.type} on ${this.describe(target)} ${this.state(target)}`);
      };
      const documentEvents = ['change', 'input', 'submit', 'reset'];
      const windowEvents = ['pagehide', 'beforeunload'];
      documentEvents.forEach(type => document.addEventListener(type, onEvent, true));
      windowEvents.forEach(type => window.addEventListener(type, onEvent, true));
      session.cleanups.push(() => {
        documentEvents.forEach(type => document.removeEventListener(type, onEvent, true));
        windowEvents.forEach(type => window.removeEventListener(type, onEvent, true));
      });

      const timeout = setTimeout(() => this.stopWatch('end of watch'), WATCH_MS);
      session.cleanups.push(() => clearTimeout(timeout));
    },

    // Log what the page changed since the last poll, now: the guard calls this
    // before refilling, so a wiped field shows up before its refill
    sync() {
      if (this.session) this.session.poll();
    },

    stopWatch(reason) {
      const session = this.session;
      if (!session) return;
      this.session = null;
      session.cleanups.forEach(cleanup => cleanup());

      const filler = window.OpenAutofillFormFiller;
      const detector = window.OpenAutofillFormDetector;
      this.log(`watch stopped (${reason}); final state:`);
      for (const [rule, track] of session.tracks) {
        const node = detector.findField(rule.name);
        let verdict = 'NOT FOUND';
        if (node) {
          try {
            verdict = filler.needsFill(node, rule) ? `WRONG, wanted ${quote(rule.value)}` : 'OK';
          } catch (e) {
            verdict = `? (${e.message})`;
          }
        }
        this.log(`  ${rule.id} ${rule.name}: ${verdict} ${node ? this.state(node) : ''} ` +
                 `(replaced ${track.replaced}x, changed ${track.changes}x, refilled ${track.refills}x)`);
      }
      this.printReport();
    },

    printReport() {
      if (!this.enabled || this.lines.length === 0) return;
      console.log('[OA] ===== Open Autofill trace: right-click this message > Copy message =====\n' +
                  this.lines.join('\n'));
    },

    shortUrl(raw) {
      try {
        const url = new URL(raw, location.href);
        const base = url.origin === location.origin ? url.pathname : url.host + url.pathname;
        const query = url.search.length > 80 ? url.search.slice(0, 80) + '…' : url.search;
        return base + query;
      } catch (e) {
        return String(raw).slice(0, 120);
      }
    }
  };

  DebugTrace.init();

  // Export to window for content scripts
  window.OpenAutofillDebugTrace = DebugTrace;
})();
