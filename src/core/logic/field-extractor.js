/**
 * Field value extractor
 * Extracts current values from form fields for saving
 */

(function() {
  'use strict';

  const FieldExtractor = {
    // Extract all field values from a form
    extractFormFields(form) {
      const detector = window.OpenAutofillFormDetector;
      const fields = form
        ? detector.findFieldsInContainer(form)
        : detector.findAllFields();

      return this.extractFieldsInfo(fields);
    },

    // Extract info from a list of fields
    extractFieldsInfo(fields) {
      const detector = window.OpenAutofillFormDetector;
      const extracted = [];
      const radioGroups = new Set();

      for (const field of fields) {
        const type = detector.getFieldType(field);

        // Skip buttons and files
        if (type === 'Button' || type === 'File' || type === 'Hidden') {
          continue;
        }

        // Handle radio buttons (only process each group once)
        if (type === 'Radio') {
          if (!field.name || radioGroups.has(field.name)) {
            continue;
          }
          radioGroups.add(field.name);

          // Find the checked radio in the group
          const group = detector.findRadioGroup(field);
          const checked = group.find(r => r.checked);

          extracted.push({
            name: detector.getFieldIdentifier(field),
            type: 'Radio',
            label: detector.getFieldLabel(field),
            value: checked ? checked.value : ''
          });
          continue;
        }

        // Get field info
        const info = detector.extractFieldInfo(field);

        // Skip empty values for non-checkbox fields
        if (!info.value && type !== 'Checkbox') {
          continue;
        }

        extracted.push({
          name: info.identifier,
          type: info.type,
          label: info.label,
          value: info.value
        });
      }

      return extracted;
    },

    // Extract a single field's info
    extractSingleField(element) {
      const detector = window.OpenAutofillFormDetector;

      if (!element) {
        return null;
      }

      const type = detector.getFieldType(element);

      // For radio, get the whole group
      if (type === 'Radio') {
        const group = detector.findRadioGroup(element);
        const checked = group.find(r => r.checked);

        return {
          name: detector.getFieldIdentifier(element),
          type: 'Radio',
          label: detector.getFieldLabel(element),
          value: checked ? checked.value : ''
        };
      }

      const info = detector.extractFieldInfo(element);

      return {
        name: info.identifier,
        type: info.type,
        label: info.label,
        value: info.value
      };
    },

    // Extract field at a specific point (for context menu)
    extractFieldAtPoint(x, y) {
      const element = document.elementFromPoint(x, y);

      if (!element) return null;

      // Check if it's a form field
      const formField = element.closest('input, select, textarea');
      if (formField) {
        return this.extractSingleField(formField);
      }

      return null;
    },

    // Extract the focused field
    extractFocusedField() {
      const activeElement = document.activeElement;

      if (!activeElement) return null;

      const tagName = activeElement.tagName.toLowerCase();
      if (!['input', 'select', 'textarea'].includes(tagName)) {
        return null;
      }

      return this.extractSingleField(activeElement);
    },

    // Find the nearest form to an element
    findNearestForm(element) {
      if (!element) return null;

      // Check if element is inside a form
      const form = element.closest('form');
      if (form) return form;

      // Otherwise, find form fields near the element
      // This handles cases where forms are not properly structured
      const rect = element.getBoundingClientRect();
      const forms = document.querySelectorAll('form');

      for (const form of forms) {
        const formRect = form.getBoundingClientRect();

        // Check if forms overlap or are close
        if (this.rectsOverlap(rect, formRect, 100)) {
          return form;
        }
      }

      return null;
    },

    // Check if two rects overlap (with optional margin)
    rectsOverlap(rect1, rect2, margin = 0) {
      return !(
        rect1.right + margin < rect2.left ||
        rect1.left - margin > rect2.right ||
        rect1.bottom + margin < rect2.top ||
        rect1.top - margin > rect2.bottom
      );
    },

    // Get all unique fields on the page (deduplicated)
    getAllUniqueFields() {
      const detector = window.OpenAutofillFormDetector;
      const allFields = detector.findAllFields();
      const uniqueFields = new Map();

      for (const field of allFields) {
        const identifier = detector.getFieldIdentifier(field);

        // Only keep the first field with each identifier
        if (!uniqueFields.has(identifier)) {
          const info = this.extractSingleField(field);
          if (info) {
            uniqueFields.set(identifier, info);
          }
        }
      }

      return Array.from(uniqueFields.values());
    },

    // Group fields by their parent form
    groupFieldsByForm() {
      const detector = window.OpenAutofillFormDetector;
      const forms = detector.findAllForms();
      const result = [];

      // Process each form
      for (const form of forms) {
        const formFields = this.extractFormFields(form);
        if (formFields.length > 0) {
          result.push({
            form: form,
            formId: form.id || form.name || null,
            action: form.action || null,
            fields: formFields
          });
        }
      }

      // Also find orphan fields (not in any form)
      const allFields = detector.findAllFields();
      const orphanFields = [];

      for (const field of allFields) {
        const parentForm = field.closest('form');
        if (!parentForm) {
          const info = this.extractSingleField(field);
          if (info && info.value) {
            orphanFields.push(info);
          }
        }
      }

      if (orphanFields.length > 0) {
        result.push({
          form: null,
          formId: null,
          action: null,
          fields: orphanFields
        });
      }

      return result;
    }
  };

  // Export to window for content scripts
  window.OpenAutofillFieldExtractor = FieldExtractor;
})();
