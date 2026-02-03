/**
 * Event dispatcher for simulating user interactions
 * Handles framework-specific event dispatching (React, Vue, Angular)
 */

(function() {
  'use strict';

  const EventDispatcher = {
    // Dispatch a native event on an element
    dispatchNativeEvent(element, eventType, options = {}) {
      const event = new Event(eventType, {
        bubbles: true,
        cancelable: true,
        ...options
      });
      element.dispatchEvent(event);
    },

    // Dispatch an InputEvent (for modern input handling)
    dispatchInputEvent(element, eventType, inputType = 'insertText', data = null) {
      const event = new InputEvent(eventType, {
        bubbles: true,
        cancelable: true,
        inputType: inputType,
        data: data
      });
      element.dispatchEvent(event);
    },

    // Dispatch keyboard event
    dispatchKeyboardEvent(element, eventType, key = '', options = {}) {
      const event = new KeyboardEvent(eventType, {
        bubbles: true,
        cancelable: true,
        key: key,
        code: key ? `Key${key.toUpperCase()}` : '',
        ...options
      });
      element.dispatchEvent(event);
    },

    // Dispatch mouse event
    dispatchMouseEvent(element, eventType, options = {}) {
      const rect = element.getBoundingClientRect();
      const event = new MouseEvent(eventType, {
        bubbles: true,
        cancelable: true,
        view: window,
        clientX: rect.left + rect.width / 2,
        clientY: rect.top + rect.height / 2,
        ...options
      });
      element.dispatchEvent(event);
    },

    // Dispatch focus event
    dispatchFocusEvent(element, eventType) {
      const event = new FocusEvent(eventType, {
        bubbles: true,
        cancelable: true,
        view: window,
        relatedTarget: null
      });
      element.dispatchEvent(event);
    },

    // Set value using native setter (bypasses framework getters/setters)
    setNativeValue(element, value) {
      // Try to get the native value setter
      const prototype = Object.getPrototypeOf(element);
      const prototypeValueSetter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
      const inputValueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      const textareaValueSetter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;

      // Use the appropriate setter
      if (element.tagName === 'TEXTAREA' && textareaValueSetter) {
        textareaValueSetter.call(element, value);
      } else if (inputValueSetter) {
        inputValueSetter.call(element, value);
      } else if (prototypeValueSetter) {
        prototypeValueSetter.call(element, value);
      } else {
        // Fallback to direct assignment
        element.value = value;
      }
    },

    // Detect framework (React, Vue, Angular)
    detectFramework(element) {
      // React detection
      for (const key of Object.keys(element)) {
        if (key.startsWith('__react') || key.startsWith('_react')) {
          return 'react';
        }
      }

      // Vue 2 detection
      if (element.__vue__) {
        return 'vue2';
      }

      // Vue 3 detection
      if (element.__vueParentComponent) {
        return 'vue3';
      }

      // Angular detection
      for (const key of Object.keys(element)) {
        if (key.startsWith('__ng') || key.startsWith('_ng')) {
          return 'angular';
        }
      }

      return 'native';
    },

    // Full event sequence for filling a text input
    fillTextInput(element, value, mode = 'Overwrite') {
      const framework = this.detectFramework(element);
      let finalValue = value;

      // Handle mode
      if (mode === 'Append') {
        finalValue = (element.value || '') + value;
      } else if (mode === 'Skip if filled' && element.value) {
        return false; // Skip if already has value
      }

      // Focus the element
      element.focus();
      this.dispatchFocusEvent(element, 'focus');
      this.dispatchFocusEvent(element, 'focusin');

      // Select all existing content (for overwrite)
      if (mode === 'Overwrite' && element.value) {
        element.select();
      }

      // Set the value using native setter
      this.setNativeValue(element, finalValue);

      // Dispatch events based on framework
      switch (framework) {
        case 'react':
          this.dispatchReactEvents(element, finalValue);
          break;
        case 'vue2':
        case 'vue3':
          this.dispatchVueEvents(element, finalValue);
          break;
        case 'angular':
          this.dispatchAngularEvents(element, finalValue);
          break;
        default:
          this.dispatchNativeEvents(element, finalValue);
      }

      // Blur to finalize
      this.dispatchFocusEvent(element, 'blur');
      this.dispatchFocusEvent(element, 'focusout');

      return true;
    },

    // React-specific event dispatching
    dispatchReactEvents(element, value) {
      // React uses a synthetic event system
      // The key is to trigger the native input event which React listens to
      this.dispatchInputEvent(element, 'input', 'insertText', value);
      this.dispatchNativeEvent(element, 'change');

      // Also try triggering React's internal handlers
      const reactKey = Object.keys(element).find(key => key.startsWith('__reactProps'));
      if (reactKey && element[reactKey]?.onChange) {
        try {
          element[reactKey].onChange({ target: element, currentTarget: element });
        } catch (e) {
          // Ignore errors from direct handler calls
        }
      }
    },

    // Vue-specific event dispatching
    dispatchVueEvents(element, value) {
      // Vue uses v-model which listens to input events
      this.dispatchInputEvent(element, 'input', 'insertText', value);
      this.dispatchNativeEvent(element, 'change');

      // Trigger Vue's internal update if available
      if (element.__vue__) {
        try {
          element.__vue__.$emit('input', value);
        } catch (e) {
          // Ignore errors
        }
      }
    },

    // Angular-specific event dispatching
    dispatchAngularEvents(element, value) {
      // Angular uses ngModel which listens to input events
      this.dispatchInputEvent(element, 'input', 'insertText', value);
      this.dispatchNativeEvent(element, 'change');

      // Trigger Angular's change detection
      const ngModelKey = Object.keys(element).find(key => key.includes('ngModel'));
      if (ngModelKey) {
        try {
          element.dispatchEvent(new Event('ngModelChange', { bubbles: true }));
        } catch (e) {
          // Ignore errors
        }
      }
    },

    // Native event dispatching
    dispatchNativeEvents(element, value) {
      this.dispatchKeyboardEvent(element, 'keydown');
      this.dispatchKeyboardEvent(element, 'keypress');
      this.dispatchInputEvent(element, 'input', 'insertText', value);
      this.dispatchKeyboardEvent(element, 'keyup');
      this.dispatchNativeEvent(element, 'change');
    },

    // Fill a select element
    fillSelect(element, value, mode = 'Overwrite') {
      if (mode === 'Skip if filled' && element.value) {
        return false;
      }

      // Focus
      element.focus();
      this.dispatchFocusEvent(element, 'focus');

      // Find the option by value or text
      let optionFound = false;
      for (const option of element.options) {
        if (option.value === value || option.text === value || option.textContent.trim() === value) {
          element.value = option.value;
          optionFound = true;
          break;
        }
      }

      if (!optionFound) {
        // Try case-insensitive match
        const lowerValue = value.toLowerCase();
        for (const option of element.options) {
          if (option.value.toLowerCase() === lowerValue ||
              option.text.toLowerCase() === lowerValue ||
              option.textContent.trim().toLowerCase() === lowerValue) {
            element.value = option.value;
            optionFound = true;
            break;
          }
        }
      }

      // Dispatch change events
      this.dispatchInputEvent(element, 'input');
      this.dispatchNativeEvent(element, 'change');

      // Blur
      this.dispatchFocusEvent(element, 'blur');

      return optionFound;
    },

    // Fill a checkbox
    fillCheckbox(element, value, mode = 'Overwrite') {
      const shouldCheck = value === true ||
                         value === 'true' ||
                         value === '1' ||
                         value === 'yes' ||
                         value === 'on' ||
                         value === 'checked';

      if (mode === 'Skip if filled' && element.checked === shouldCheck) {
        return false;
      }

      // Focus
      element.focus();
      this.dispatchFocusEvent(element, 'focus');

      // Click to change state if needed
      if (element.checked !== shouldCheck) {
        this.dispatchMouseEvent(element, 'click');
      }

      // Dispatch change events
      this.dispatchInputEvent(element, 'input');
      this.dispatchNativeEvent(element, 'change');

      // Blur
      this.dispatchFocusEvent(element, 'blur');

      return true;
    },

    // Fill a radio button
    fillRadio(element, value, mode = 'Overwrite') {
      // For radio, value is the value of the radio to select
      if (element.value !== value) {
        return false; // Not the right radio button
      }

      if (mode === 'Skip if filled' && element.checked) {
        return false;
      }

      // Focus
      element.focus();
      this.dispatchFocusEvent(element, 'focus');

      // Click to select
      if (!element.checked) {
        this.dispatchMouseEvent(element, 'click');
      }

      // Dispatch change events
      this.dispatchInputEvent(element, 'input');
      this.dispatchNativeEvent(element, 'change');

      // Blur
      this.dispatchFocusEvent(element, 'blur');

      return true;
    }
  };

  // Export to window for content scripts
  window.OpenAutofillEventDispatcher = EventDispatcher;
})();
