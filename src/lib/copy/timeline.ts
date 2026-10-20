// Working copy (Polish) for the medication and symptom timeline, /wizyta/os-czasu (S-09, FR-013). The author approves
// the wording in phase 3 of context/changes/medication-symptom-timeline/plan.md. scripts/fr012/timeline-copy.test.mjs
// runs every string here through the FR-012 stem filter with no exception, so the module has no imports and only
// string fields. Templates carry `{…}` markers the screen fills in one pass with `fill` (doctor-question.ts) — never a
// function, because text built in a function would bypass the filter. The timeline shows dates, not relations: no
// text here links a symptom to a medication, so none needs the "może mieć związek" wording. The dose goes in through
// the `{ilość}` marker, so no template carries the filtered stem itself.

export const TIMELINE_COPY = {
  title: "Oś czasu",
  // Back links above the title, by where the timeline was opened from (`?z=`, src/lib/back-link.ts).
  backToVisit: "Wróć do Wizyty",
  backToJournal: "Wróć do dziennika",
  intro: "Okresy brania leków i wpisy wybranego objawu na jednej osi dat.",
  rangeLegend: "Okres",
  range90d: "90 dni",
  rangeYear: "Rok",
  rangeAll: "Całość",
  symptomLabel: "Objaw",
  symptomPlaceholder: "— wybierz objaw —",
  showMedications: "Pokaż leki",
  medicationsHidden: "Część leków jest ukryta.",
  showAll: "Pokaż wszystkie",
  medicationsHeading: "Leki",
  symptomHeading: "Objaw",
  symptomHint: "Wybierz objaw z listy, żeby zobaczyć jego wpisy na osi.",
  noEntriesInRange: "Brak wpisów w tym okresie. Wybierz dłuższy zakres.",
  noMedicationsInRange: "Brak leków w tym okresie.",
  // `{liczba}` is the count; the form follows Polish plurals: 1 lek, 2–4 (but not 12–14) leki, every other leków.
  endedBeforeOne: "{liczba} lek zakończony przed tym okresem. Zobaczysz go w dłuższym zakresie.",
  endedBeforeFew: "{liczba} leki zakończone przed tym okresem. Zobaczysz je w dłuższym zakresie.",
  endedBeforeMany: "{liczba} leków zakończonych przed tym okresem. Zobaczysz je w dłuższym zakresie.",
  today: "dziś",
  legendHeading: "Znaczniki objawu",
  legendBars: "Kreska: im wyższa, tym silniejsze nasilenie.",
  legendDots: "Kropka: im pełniejsza, tym silniejsze nasilenie.",
  legendOneMarkPerDay: "Jeden znacznik to jeden dzień z najsilniejszym nasileniem z tego dnia.",
  severityNone: "bez nasilenia",
  note: "Oś pokazuje daty, nie związki. O każdy lek i objaw możesz zapytać lekarza lub farmaceutę.",
  textListSummary: "Te same dane jako tekst",
  textPeriod: "od {od} do {do}: {ilość}",
  textPeriodOngoing: "od {od}, nadal: {ilość}",
  textMedicationItem: "{lek}: {okresy}",
  textSymptomItem: "{objaw}: {wpisy}",
  textEntryWithSeverity: "{data} ({nasilenie})",
  emptyIntro: "Oś pokaże okresy brania leków i wpisy objawów, gdy dodasz lek albo zapiszesz objaw w dzienniku.",
  emptyAddMedication: "Dodaj lek",
  emptyAddSymptom: "Zapisz objaw",
  noMedications: "Na liście nie ma leków, więc oś pokazuje same wpisy objawów.",
  noSymptoms: "Lista objawów jest pusta. Objaw pojawi się na niej po zapisaniu wpisu w dzienniku.",
  journalLink: "Przejdź do dziennika",
  loadError: "Nie udało się wczytać osi czasu. Odśwież stronę.",
  timelineLink: "Zobacz na osi czasu",
  chartLabel: "Wykres okresów brania leków i wpisów wybranego objawu na osi dat. Te same dane są niżej jako tekst.",
} as const;
