// Polish wording of the browser's validation bubble (src/lib/form-validation.ts). Expected texts are written out by
// hand, so a changed message or date format fails here.

import assert from "node:assert/strict";
import { test } from "node:test";

import { formatBound, validationMessage } from "../../src/lib/form-validation.ts";

const VALID = {
  valueMissing: false,
  badInput: false,
  typeMismatch: false,
  rangeUnderflow: false,
  rangeOverflow: false,
};
const field = (type, failed, bounds = {}) => ({ type, min: "", max: "", ...bounds, validity: { ...VALID, ...failed } });

test("an empty required text field asks to fill it in, in Polish", () => {
  assert.equal(validationMessage(field("text", { valueMissing: true })), "Uzupełnij to pole.");
  assert.equal(validationMessage(field("date", { valueMissing: true })), "Uzupełnij to pole.");
});

test("an unchosen radio group and an unticked checkbox get their own wording", () => {
  assert.equal(validationMessage(field("radio", { valueMissing: true })), "Wybierz jedną z opcji.");
  assert.equal(validationMessage(field("checkbox", { valueMissing: true })), "Zaznacz to pole.");
});

test("date bounds are named as DD.MM.YYYY", () => {
  assert.equal(
    validationMessage(field("date", { rangeUnderflow: true }, { min: "2026-10-06" })),
    "Wybierz datę nie wcześniejszą niż 06.10.2026.",
  );
  assert.equal(
    validationMessage(field("date", { rangeOverflow: true }, { max: "2026-10-20" })),
    "Wybierz datę nie późniejszą niż 20.10.2026.",
  );
});

test("date and time bounds are named as DD.MM.YYYY, HH:MM", () => {
  assert.equal(
    validationMessage(field("datetime-local", { rangeUnderflow: true }, { min: "2026-10-06T17:59" })),
    "Wybierz datę nie wcześniejszą niż 06.10.2026, 17:59.",
  );
  assert.equal(formatBound("2026-10-06T17:59:30"), "06.10.2026, 17:59");
});

test("a half-typed date and a malformed e-mail get Polish wording", () => {
  assert.equal(validationMessage(field("date", { badInput: true })), "Wpisz pełną datę.");
  assert.equal(validationMessage(field("email", { typeMismatch: true })), "Wpisz poprawny adres e-mail.");
});

test("a check not covered here keeps the browser's own text", () => {
  assert.equal(validationMessage(field("text", {})), null);
  assert.equal(validationMessage(field("number", { rangeUnderflow: true }, { min: "1" })), null);
});
