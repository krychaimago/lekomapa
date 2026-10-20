// Polish text in the browser's validation bubble. The bubble keeps working as before (required fields, date bounds
// still block a submit, without JavaScript too); this only replaces its wording, which otherwise follows the
// browser's language. Forms with `noValidate` (sign-in, sign-up, password reset) show their own messages and never
// raise `invalid`, so they are unaffected. No `@/` imports, so scripts/forms/form-validation.test.mjs can load the
// file directly under `node --experimental-strip-types`.

import { VALIDATION_COPY } from "./copy/validation.ts";

type Field = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

// The part of a field the message depends on; a plain object in tests.
export interface FieldState {
  type: string;
  min: string;
  max: string;
  validity: Pick<ValidityState, "valueMissing" | "badInput" | "typeMismatch" | "rangeUnderflow" | "rangeOverflow">;
}

// `YYYY-MM-DD` as `DD.MM.YYYY`, `YYYY-MM-DDTHH:MM` as `DD.MM.YYYY, HH:MM`, without a Date object (no zone shift).
export function formatBound(value: string): string {
  const [date, time] = value.split("T");
  const [year, month, day] = date.split("-");
  const formatted = `${day}.${month}.${year}`;
  return time ? `${formatted}, ${time.slice(0, 5)}` : formatted;
}

const isDateType = (type: string) => type === "date" || type === "datetime-local";

// The Polish message for the first failed check, or null to keep the browser's own text for a check not covered here.
export function validationMessage(field: FieldState): string | null {
  const { type, validity } = field;
  if (validity.valueMissing) {
    if (type === "radio") return VALIDATION_COPY.valueMissingChoice;
    if (type === "checkbox") return VALIDATION_COPY.valueMissingCheckbox;
    return VALIDATION_COPY.valueMissing;
  }
  if (validity.badInput && isDateType(type)) return VALIDATION_COPY.badInputDate;
  if (validity.typeMismatch && type === "email") return VALIDATION_COPY.typeMismatchEmail;
  if (validity.rangeUnderflow && isDateType(type) && field.min) {
    return VALIDATION_COPY.rangeUnderflowDate.replace("{data}", formatBound(field.min));
  }
  if (validity.rangeOverflow && isDateType(type) && field.max) {
    return VALIDATION_COPY.rangeOverflowDate.replace("{data}", formatBound(field.max));
  }
  return null;
}

const isField = (target: EventTarget | null): target is Field =>
  target instanceof HTMLInputElement || target instanceof HTMLSelectElement || target instanceof HTMLTextAreaElement;

// A custom message keeps a field invalid until cleared, so it is cleared on every edit. For a radio group the message
// sits on whichever radio the browser reported, so choosing any radio of the group clears all of them.
function clearMessage(field: Field) {
  if (field instanceof HTMLInputElement && field.type === "radio" && field.form && field.name) {
    for (const radio of field.form.querySelectorAll<HTMLInputElement>(`input[type="radio"]`)) {
      if (radio.name === field.name) radio.setCustomValidity("");
    }
    return;
  }
  field.setCustomValidity("");
}

// Listens on the document in the capture phase: `invalid` does not bubble, and forms rendered later by React are
// covered without wiring each one.
export function installPolishValidation(doc: Document) {
  doc.addEventListener(
    "invalid",
    (event) => {
      if (!isField(event.target)) return;
      const field = event.target;
      field.setCustomValidity("");
      const bounds = field instanceof HTMLInputElement ? { min: field.min, max: field.max } : { min: "", max: "" };
      const message = validationMessage({ type: field.type, validity: field.validity, ...bounds });
      if (message) field.setCustomValidity(message);
    },
    true,
  );
  const onEdit = (event: Event) => {
    if (isField(event.target)) clearMessage(event.target);
  };
  doc.addEventListener("input", onEdit, true);
  doc.addEventListener("change", onEdit, true);
}
