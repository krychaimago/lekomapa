// Working copy (Polish) for the symptom journal screens (S-05): titles, field labels, buttons, hints and API route
// errors. scripts/fr012/journal-copy.test.mjs runs every string here through the FR-012 stem filter, so the module
// has only string fields. Templates carry a marker the screen replaces (`{do}`, `{od}`) — never a function, because
// text built in a function would bypass the filter. An entry records what was felt and when; nothing here links a
// symptom to a medication, so no text needs the "może mieć związek" wording.

export const JOURNAL_COPY = {
  list: {
    title: "Dzienniczek",
    add: "Nowy wpis",
    empty: "Nie masz jeszcze żadnego wpisu. Zapisz pierwszy, gdy coś poczujesz.",
    // `{objawy}` lists the symptoms of the saved entry ("ból głowy, nudności"), so the message says which entry it
    // means when several were saved in a row. Past three names the rest is counted with savedMoreSymptoms.
    saved: "Zapisano wpis: {objawy}.",
    savedWithDeadline: "Zapisano wpis: {objawy}. Możesz go poprawić do {do}.",
    savedMoreSymptoms: "i jeszcze {liczba}",
    correctableUntil: "Możesz poprawić do {do}",
    noteLabel: "Notatka",
    loadError: "Nie udało się wczytać dzienniczka. Odśwież stronę.",
  },
  form: {
    title: "Nowy wpis",
    backToList: "Wróć do dzienniczka",
    occurredLabel: "Data i godzina",
    occurredHint:
      "Bez zmiany zapisze się chwila zapisu wpisu. Datę i godzinę możesz cofnąć najwyżej o 14 dni, od {od}.",
    symptomsLegend: "Objawy",
    requiredMark: "(obowiązkowe)",
    selectedHeading: "Wybrane objawy",
    noneSelected: "Nie wybrano jeszcze żadnego objawu.",
    removeSymptom: "Usuń z wpisu",
    severityLegend: "Nasilenie",
    severityOptional: "(opcjonalne)",
    searchLabel: "Szukaj objawu",
    searchHint: "Na przykład: ból głowy. Możesz pisać bez polskich znaków.",
    resultsLabel: "Pasujące objawy",
    noMatch: "Nie ma takiego objawu na liście. Opisz go w notatce.",
    notFoundHint: "Nie znalazłaś objawu? Opisz go w notatce.",
    noteLabel: "Notatka",
    noteHint: "Na przykład: po kolacji. Najwyżej 200 znaków.",
    submit: "Zapisz wpis",
    pending: "Zapisywanie...",
    noSymptomsSelected: "Wybierz co najmniej jeden objaw.",
    earliestAllowed: "Najwcześniejsza możliwa data i godzina: {od}.",
    loadError: "Nie udało się wczytać listy objawów. Odśwież stronę.",
  },
  // Keys the API route sends back as `{ error: <key> }`. The form looks the text up here, so a response can never put
  // arbitrary text on screen. Never a raw Supabase error.message.
  apiErrors: {
    invalidRequest: "Nie udało się odczytać formularza. Odśwież stronę i spróbuj ponownie.",
    invalidOccurred: "Wpisz poprawną datę i godzinę.",
    noSymptoms: "Wybierz co najmniej jeden objaw.",
    tooManySymptoms: "Wybrano więcej objawów, niż jest na liście. Odśwież stronę.",
    invalidSeverity: "Wybierz nasilenie z listy.",
    noteTooLong: "Notatka może mieć najwyżej 200 znaków.",
    // Codes raised by add_symptom_entry (supabase/migrations/20261005130000_symptom_journal.sql).
    occurredInFuture: "Data i godzina wpisu nie mogą być późniejsze niż teraz.",
    occurredTooOld: "Datę i godzinę wpisu można cofnąć najwyżej o 14 dni.",
    duplicateSymptom: "Ten sam objaw jest wybrany więcej niż raz.",
    unknownSymptom: "Wybranego objawu nie ma na liście. Odśwież stronę.",
    sessionExpired: "Sesja wygasła. Zaloguj się ponownie.",
    unknown: "Nie udało się zapisać wpisu. Spróbuj ponownie.",
  },
} as const;

export type JournalApiErrorCode = keyof typeof JOURNAL_COPY.apiErrors;

// Unknown or missing codes show nothing: a crafted response must not render its own text.
export function apiErrorMessage(code: string | null | undefined): string | null {
  const messages = JOURNAL_COPY.apiErrors;
  return code && Object.hasOwn(messages, code) ? messages[code as JournalApiErrorCode] : null;
}
