// Working copy (Polish) for the medication screens (S-02): titles, field labels, buttons, hints and API route
// errors. Kept apart from src/lib/copy/interactions.ts on purpose: these texts mention the dose, which the FR-012
// stem filter blocks. Nothing here may speak about an interaction or its absence — that belongs in interactions.ts.

export const MEDICATION_COPY = {
  // Shared by every medication form. Plain text inside the label, so a screen reader reads it with the field name.
  form: {
    requiredMark: "(obowiązkowe)",
  },
  list: {
    title: "Leki",
    add: "Dodaj lek",
    empty: "Nie masz jeszcze żadnego leku. Dodaj pierwszy, który przyjmujesz.",
    since: "od {data}",
    added: "Dodano lek.",
    // `{do}` is formatCorrectionDeadline: "jutra (06.10), godz. 21:14", "dziś (05.10), godz. 21:14" or
    // "23.10, godz. 21:14" (Polish time). `{nazwa}` is the medication's name, so the banner says which one it means.
    addedWithDeadline: "Dodano lek {nazwa}. Dawkowanie możesz poprawić do {do} w szczegółach leku.",
    // Under each medication whose dosage period is still in its correction window; the latest such window.
    correctableUntil: "Dawkowanie możesz poprawić do {do}",
    loadError: "Nie udało się wczytać listy leków. Odśwież stronę.",
  },
  add: {
    title: "Dodaj lek",
    searchLabel: "Nazwa handlowa",
    // Example value shown as a hint under the field, not inside it: an example inside the field reads as typed text.
    searchHint: "Na przykład: Ibuprom",
    searchSubmit: "Szukaj",
    results: "Wyniki wyszukiwania",
    noResults: "Nie znaleziono leku o tej nazwie w rejestrze.",
    moreResults: "Pokazano pierwsze {liczba} nazw. Wpisz dokładniejszą nazwę, żeby zawęzić wyniki.",
    searchError: "Nie udało się przeszukać rejestru. Spróbuj ponownie.",
    variants: "Warianty: {liczba}",
    // Suggestions under the name field (RegistrySearch). The count is read out by a screen reader.
    suggestionsLabel: "Podpowiedzi nazw",
    suggestionsCount: "Podpowiedzi: {liczba}. Wybierz strzałkami w górę i w dół, zatwierdź Enterem.",
    suggestionsNone: "Brak podpowiedzi dla tej nazwy. Naciśnij Szukaj, żeby zobaczyć wyniki.",
    chooseVariant: "Wybierz wariant",
    strength: "Moc",
    form: "Postać",
    composition: "Skład",
    compositionUnknown: "brak danych w rejestrze",
    doseLabel: "Dawkowanie",
    doseHint: "Na przykład: 1 tabletka rano",
    startedOnLabel: "Data rozpoczęcia",
    submit: "Zapisz lek",
    pending: "Zapisywanie...",
    notInRegistry: "Nie ma mojego leku — dodam z ulotki",
    registrySource: "Dane o składzie: Rejestr Produktów Leczniczych, licencja CC BY 4.0",
    backToList: "Wróć do listy leków",
  },
  leaflet: {
    title: "Dodaj lek z ulotki",
    productNameLabel: "Nazwa leku",
    substanceLabel: "Substancja czynna",
    substanceHint: "Pierwsza wersja przyjmuje jedną substancję czynną na lek.",
    noMatch: "Nie znaleziono tej substancji na liście. Czy chodzi o jedną z poniższych?",
    confirmUnverified: "Zapisz bez sprawdzania — ta substancja nie będzie objęta żadną parą",
    substanceListHint: "Na przykład: ibuprofenum. Wybierz nazwę z podpowiedzi, jeśli ją widzisz.",
    noSimilar: "Nie ma podobnych nazw na liście.",
    loadError: "Nie udało się wczytać listy substancji. Odśwież stronę.",
    registryInstead: "Wróć do wyszukiwania w rejestrze",
  },
  details: {
    title: "Szczegóły leku",
    doseLabel: "Dawkowanie",
    startedOnLabel: "Data rozpoczęcia",
    compositionHeading: "Skład",
    codeLabel: "kod ATC",
    variant: "Wariant",
    // Dosage periods, newest first (S-03). A closed period shows its last day, the day before the saved end date.
    historyHeading: "Historia dawkowania",
    periodOngoing: "od {data}",
    periodClosed: "{od} – {do}",
    // Link next to a period still in its correction window (S-05); `{do}` as in list.addedWithDeadline.
    correctPeriod: "Popraw dawkę – do {do}",
    leafletSource: "Skład wpisany z ulotki.",
    notFound: "Nie znaleziono takiego leku.",
    loadError: "Nie udało się wczytać leku. Odśwież stronę.",
    backToList: "Wróć do listy leków",
  },
  // Dose change screen (S-03). Nouns, not imperatives: the screen records a change already prescribed and never
  // suggests that the dose should change (FR-012). A medication that ended is "zakończony".
  dosageChange: {
    title: "Zmiana dawkowania",
    // Link on the details screen, shown only for a current medication.
    open: "Zmiana dawkowania",
    intro:
      "Zapis zmiany dawkowania, która już obowiązuje. Bieżący okres kończy się dzień przed datą zmiany, a nowy zaczyna się od tej daty. Lek zostaje jedną pozycją na liście.",
    currentDoseLabel: "Bieżące dawkowanie",
    currentSinceLabel: "Obowiązuje od",
    currentVariantLabel: "Bieżący wariant",
    newDoseLabel: "Nowe dawkowanie",
    changedOnLabel: "Data zmiany",
    changedOnHint: "Pierwszy dzień nowego dawkowania: od {od} do dziś.",
    variantLegend: "Wariant",
    variantHint:
      "Warianty tego samego preparatu o tym samym składzie. Preparat o innym składzie zapisuje się jako nowy lek.",
    currentVariantMark: "(bieżący)",
    submit: "Zapisz zmianę dawkowania",
    // States without the form.
    discontinued: "Ten lek jest zakończony, więc nie ma bieżącego dawkowania do zmiany.",
    startedToday: "Bieżące dawkowanie zaczyna się dziś. Zmianę dawkowania można zapisać od jutra.",
    backToDetails: "Wróć do szczegółów leku",
    // Banner on the details screen after `?zmieniono=1`.
    saved: "Zapisano zmianę dawkowania.",
    savedWithDeadline: "Zapisano zmianę dawkowania. Pomyłkę w nowym dawkowaniu możesz poprawić do {do}.",
  },
  // Correction of one dosage period inside its correction window (S-05, F6a): fixes a mistake in what was saved, the
  // dates of the period stay and no new period appears. Never a suggestion that the dose should be different (FR-012).
  correction: {
    title: "Poprawa dawkowania",
    intro:
      "Poprawa pomyłki w zapisie tego okresu, na przykład literówki. Daty okresu zostają bez zmian i nie powstaje nowy okres.",
    deadline: "Możesz poprawić do {do}.",
    periodLabel: "Okres",
    savedDoseLabel: "Zapisane dawkowanie",
    doseLabel: "Dawkowanie",
    variantHint: "Warianty tego samego preparatu o tym samym składzie.",
    savedVariantMark: "(zapisany w tym okresie)",
    submit: "Zapisz poprawkę",
    closed:
      "Okno korekty tego okresu jest już zamknięte, więc jego zapisu nie da się poprawić. Nowe dawkowanie zapisuje się jako zmianę dawkowania.",
    openDosageChange: "Przejdź do zmiany dawkowania",
    notFound: "Nie znaleziono takiego okresu dawkowania.",
    // Banner on the details screen after `?poprawiono=<period id>`.
    saved: "Poprawiono dawkowanie.",
    savedWithDeadline: "Poprawiono dawkowanie. Możesz je poprawić jeszcze do {do}.",
  },
  // Hints next to the form (design-draft.md:196-199), reworded for a product chosen by its trade name.
  hints: {
    doseHistoryTitle: "Dawkowanie ma historię",
    doseHistory:
      "Późniejsza zmiana dawkowania zamknie ten wpis datą i otworzy nowy okres obok. Lek zostaje jedną pozycją na liście.",
    fixedCompositionTitle: "Substancji nie podmienisz",
    fixedComposition:
      "Skład leku zostaje taki, jaki zapiszesz. Inny lek to zakończenie obecnego i dodanie nowego — inaczej dawne wpisy o samopoczuciu nie będą się zgadzać.",
  },
  // Errors the API route sends back as `?error=<key>`. The page looks the text up here, so the URL can never put
  // arbitrary text on screen. Never a raw Supabase error.message.
  apiErrors: {
    invalidProduct: "Wybierz wariant leku z listy.",
    doseRequired: "Wpisz dawkowanie.",
    doseTooLong: "Dawkowanie może mieć najwyżej 200 znaków.",
    invalidDate: "Wpisz poprawną datę rozpoczęcia.",
    futureDate: "Data rozpoczęcia nie może być późniejsza niż dziś.",
    productNameRequired: "Wpisz nazwę leku.",
    productNameTooLong: "Nazwa leku może mieć najwyżej 200 znaków.",
    substanceRequired: "Wpisz substancję czynną.",
    substanceTooLong: "Nazwa substancji może mieć najwyżej 200 znaków.",
    // Dose change (S-03): codes raised by change_dosage (supabase/migrations/20261004120000_dosage_change.sql).
    medicationDiscontinued: "Ten lek jest zakończony, więc zmiany dawkowania nie da się zapisać.",
    changeDateTooEarly: "Data zmiany musi być późniejsza niż początek bieżącego dawkowania.",
    changeDateTooOld: "Datę zmiany można cofnąć najwyżej o 14 dni.",
    changeDateInFuture: "Data zmiany nie może być późniejsza niż dziś.",
    invalidChangeDate: "Wpisz poprawną datę zmiany.",
    sameDose: "To dawkowanie jest już zapisane jako bieżące.",
    variantNotAllowed:
      "Ten wariant należy do innego preparatu albo ma inny skład. Taki preparat zapisuje się jako nowy lek.",
    noCurrentPeriod: "Ten lek nie ma bieżącego okresu dawkowania, więc nie ma czego zmienić.",
    medicationNotFound: "Nie znaleziono takiego leku.",
    // Correction of a period (S-05): codes raised by correct_dosage_period
    // (supabase/migrations/20261005140000_correct_dosage_period.sql).
    periodNotFound: "Nie znaleziono takiego okresu dawkowania.",
    correctionWindowClosed:
      "Okno korekty tego okresu jest już zamknięte. Nowe dawkowanie zapisuje się jako zmianę dawkowania.",
    sameDoseInPeriod: "To dawkowanie jest już zapisane w tym okresie.",
    sameAsAdjacentPeriod:
      "To dawkowanie jest takie samo jak w okresie bezpośrednio przed tym okresem albo po nim. Taka poprawa usunęłaby z historii zmianę dawkowania, a cofnięcia zmiany nie da się jeszcze zapisać.",
    correctionGeneric: "Nie udało się zapisać poprawki. Spróbuj ponownie.",
    generic: "Nie udało się zapisać leku. Spróbuj ponownie.",
  },
} as const;

export type MedicationApiErrorCode = keyof typeof MEDICATION_COPY.apiErrors;

// Unknown or missing codes show nothing: a crafted `?error=` link must not render its own text.
export function apiErrorMessage(code: string | null): string | null {
  const messages = MEDICATION_COPY.apiErrors;
  return code && Object.hasOwn(messages, code) ? messages[code as MedicationApiErrorCode] : null;
}
