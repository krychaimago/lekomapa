// Working copy (Polish) for the browser's own validation bubble on native forms (required fields, date bounds).
// Without it the bubble speaks the browser's language ("Please fill in this field."), not the page's.
// scripts/fr012/validation-copy.test.mjs runs every string here through the FR-012 stem filter, so the module has only
// string fields. `{data}` is replaced with the bound as `DD.MM.YYYY` (or `DD.MM.YYYY, HH:MM` for date and time).

export const VALIDATION_COPY = {
  valueMissing: "Uzupełnij to pole.",
  valueMissingChoice: "Wybierz jedną z opcji.",
  valueMissingCheckbox: "Zaznacz to pole.",
  // A date field left half-filled (only the day typed, say) reports badInput in some browsers.
  badInputDate: "Wpisz pełną datę.",
  typeMismatchEmail: "Wpisz poprawny adres e-mail.",
  rangeUnderflowDate: "Wybierz datę nie wcześniejszą niż {data}.",
  rangeOverflowDate: "Wybierz datę nie późniejszą niż {data}.",
};
