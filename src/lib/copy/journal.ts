// Working copy (Polish) for the symptom journal screens (S-05, S-07): titles, field labels, buttons, hints and API
// route errors. scripts/fr012/journal-copy.test.mjs runs every string here through the FR-012 stem filter, so the
// module has only string fields. Templates carry a marker the screen replaces (`{do}`, `{od}`, `{o}`, `{objawy}`) —
// never a function, because
// text built in a function would bypass the filter. An entry records what was felt and when; nothing here links a
// symptom to a medication, so no text needs the "może mieć związek" wording.

export const JOURNAL_COPY = {
  list: {
    title: "Dziennik",
    add: "Nowy wpis",
    empty: "Nie masz jeszcze żadnego wpisu. Zapisz pierwszy, gdy coś poczujesz.",
    // `{objawy}` lists the symptoms of the saved entry ("ból głowy, nudności"), so the message says which entry it
    // means when several were saved in a row. Past three names the rest is counted with savedMoreSymptoms.
    saved: "Zapisano wpis: {objawy}.",
    savedWithDeadline: "Zapisano wpis: {objawy}. Możesz go poprawić do {do}.",
    savedMoreSymptoms: "i jeszcze {liczba}",
    correctableUntil: "Możesz poprawić do {do}",
    noteLabel: "Notatka",
    loadError: "Nie udało się wczytać dziennika. Odśwież stronę.",
    // After a correction (S-07), `?poprawiono=<uuid>`. Markers as in saved / savedWithDeadline; `{do}` is the end of
    // the correction window, which does not move with a correction (24 hours from the first save).
    corrected: "Poprawiono wpis: {objawy}.",
    correctedWithDeadline: "Poprawiono wpis: {objawy}. Możesz go jeszcze poprawić do {do}.",
    // After `?notatka=<uuid>` and `?usunieto=1`.
    noteSaved: "Zapisano notatkę.",
    deleted: "Usunięto wpis dodany przez pomyłkę.",
  },
  // Screen of one entry (S-07), /dzienniczek/<id>: correcting it while the window is open, the note always.
  entry: {
    title: "Wpis w dzienniku",
    // Link on every card of the list: `open` while the window is open, `openClosed` after it closes (only the note
    // can still change).
    open: "Popraw wpis",
    openClosed: "Zobacz wpis i notatkę",
    deadline: "Możesz poprawić do {do}.",
    // The date field of a correction: left untouched, the saved date stays (unlike a new entry).
    occurredHint:
      "Bez zmiany zostaje zapisana data i godzina. Datę i godzinę możesz cofnąć najwyżej o 14 dni, od {od}.",
    // Window closed: the core of the entry is read-only. `{o}` is the end of the window.
    closedTitle: "Ten wpis jest częścią historii",
    closed:
      "Okno korekty tego wpisu zamknęło się {o}. Data, godzina, objawy i nasilenie zostają takie, jak zapisano. Notatkę możesz zmienić zawsze.",
    submit: "Zapisz poprawkę",
    submitNote: "Zapisz notatkę",
    delete: "Usuń wpis dodany przez pomyłkę",
    notFound: "Nie ma takiego wpisu w dzienniku.",
    loadError: "Nie udało się wczytać wpisu. Odśwież stronę.",
  },
  // Screen confirming the deletion of an entry added by mistake (S-07), /dzienniczek/<id>/usun. Plain wording, no
  // alarm, as in MEDICATION_COPY.deletion.
  deletion: {
    title: "Usunięcie wpisu dodanego przez pomyłkę",
    explanation:
      "Usunięcie kasuje ten wpis razem z jego objawami i notatką. Służy wyłącznie do poprawienia pomyłki przy dodawaniu, na przykład gdy ten sam wpis zapisał się dwa razy.",
    deadline: "Wpis można usunąć do {do}.",
    submit: "Usuń wpis",
    closed:
      "Okno korekty tego wpisu jest już zamknięte, więc nie da się go usunąć. Wpis jest częścią historii. Notatkę możesz zmienić na ekranie wpisu.",
    backToEntry: "Wróć do wpisu",
  },
  form: {
    title: "Nowy wpis",
    backToList: "Wróć do dziennika",
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
    // Count of ticked symptoms next to a collapsed category heading. Polish plural: 1 / 2–4 (not 12–14) / the rest.
    selectedCountOne: "{n} wybrany",
    selectedCountFew: "{n} wybrane",
    selectedCountMany: "{n} wybranych",
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
    // Codes raised by correct_symptom_entry, set_symptom_entry_note and delete_symptom_entry
    // (supabase/migrations/20261009120000_journal_correction.sql): SE006 and SE007. `{o}` is the end of the window.
    entryNotFound: "Nie ma takiego wpisu w dzienniku. Odśwież stronę.",
    correctionWindowClosed:
      "Okno korekty tego wpisu zamknęło się {o}. Data, godzina, objawy i nasilenie są już częścią historii. Notatkę możesz zmienić po odświeżeniu strony.",
    deleteWindowClosed:
      "Okno korekty tego wpisu jest już zamknięte, więc nie da się go usunąć. Wpis jest częścią historii.",
    deleteGeneric: "Nie udało się usunąć wpisu. Spróbuj ponownie.",
    unknown: "Nie udało się zapisać wpisu. Spróbuj ponownie.",
  },
} as const;

export type JournalApiErrorCode = keyof typeof JOURNAL_COPY.apiErrors;

// Unknown or missing codes show nothing: a crafted response must not render its own text.
export function apiErrorMessage(code: string | null | undefined): string | null {
  const messages = JOURNAL_COPY.apiErrors;
  return code && Object.hasOwn(messages, code) ? messages[code as JournalApiErrorCode] : null;
}
