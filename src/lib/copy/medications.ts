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
    // `{do}` is formatCorrectionDeadline: "jutra (06.10.2026), godz. 21:14", "dziś (05.10.2026), godz. 21:14" or
    // "23.10.2026, godz. 21:14" (Polish time). `{nazwa}` is the medication's name, so the banner says which one it means.
    addedWithDeadline: "Dodano lek {nazwa}. Dawkowanie możesz poprawić do {do} w szczegółach leku.",
    // Under each medication whose dosage period is still in its correction window; the latest such window.
    correctableUntil: "Dawkowanie możesz poprawić do {do}",
    loadError: "Nie udało się wczytać listy leków. Odśwież stronę.",
    // Under the note, shown only when at least one medication has ended (S-04). `{liczba}` is their number.
    endedLink: "Zakończone leki ({liczba})",
    // Banner after `?usunieto=1`: an item added by mistake was deleted.
    deleted: "Usunięto pozycję dodaną przez pomyłkę.",
  },
  // Ended medications (S-04), on a page of their own so the list of current ones stays short. Newest end first.
  endedList: {
    title: "Zakończone leki",
    intro: "Leki, których przyjmowanie zostało zakończone. Zostają w historii razem z datami przyjmowania.",
    // `{od}` is the first day taken, `{do}` the last day taken (the day before the saved end date), DD.MM.YYYY.
    takenRange: "przyjmowany od {od} do {do}",
    empty: "Nie masz żadnego zakończonego leku.",
    loadError: "Nie udało się wczytać listy zakończonych leków. Odśwież stronę.",
    backToList: "Wróć do listy aktualnych leków",
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
    // Link next to the newest period opened by a dose change, while its window is open (S-06); `{do}` as above.
    undoChange: "Cofnij zmianę dawki – do {do}",
    leafletSource: "Skład wpisany z ulotki.",
    notFound: "Nie znaleziono takiego leku.",
    loadError: "Nie udało się wczytać leku. Odśwież stronę.",
    backToList: "Wróć do listy leków",
    // Back link on the details of an ended medication (S-04).
    backToEndedList: "Wróć do zakończonych leków",
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
  // Undoing a dose change saved by mistake (S-06): the newest period disappears and the dose before it is ongoing
  // again. Only within the correction window of that period. Records a correction of the record, never a suggestion
  // that the dose should be different (FR-012).
  undo: {
    title: "Cofnięcie zmiany dawki",
    // `{data}` is the start of the undone period (DD.MM.YYYY); `{nowa}` and `{poprzednia}` are the saved doses.
    explanation:
      "Okres od {data} z dawkowaniem „{nowa}” zniknie z historii. Dawkowanie „{poprzednia}” będzie obowiązywać dalej, bez daty końca.",
    purpose: "Cofnięcie służy wyłącznie do poprawienia zmiany dawki zapisanej przez pomyłkę.",
    undoneLabel: "Cofana zmiana",
    previousLabel: "Dawkowanie, które zostanie",
    // `{do}` is formatCorrectionDeadline, as in list.addedWithDeadline.
    deadline: "Zmianę możesz cofnąć do {do}.",
    submit: "Cofnij zmianę dawki",
    notFound: "Nie znaleziono takiego okresu dawkowania.",
    // Banner on the details screen after `?cofnieto=1`.
    saved: "Cofnięto zmianę dawki. Poprzednie dawkowanie obowiązuje dalej.",
  },
  // Ending a medication with a date (S-04, FR-005), and moving or cancelling that end inside its own correction window.
  // Records an end that has already happened; never a suggestion that a medication should end (FR-012). Only
  // "zakończenie" / "zakończony": the stems for stopping a medicine are blocked by the FR-012 filter. The saved date is
  // the first day without the medication; the screens show the day before it as the last day taken.
  discontinuation: {
    title: "Zakończenie przyjmowania",
    // Link on the details screen, shown only for a current medication, next to the dose change.
    open: "Zakończenie przyjmowania",
    intro:
      "Zapis zakończenia przyjmowania, które już nastąpiło. Lek znika z listy aktualnych leków, ale zostaje w historii razem z wpisami z czasu, gdy był przyjmowany. Nic nie jest usuwane.",
    // The difference between ending and deleting, shown next to the form.
    notDeleting:
      "Zakończenie to nie usunięcie. Pozycję dodaną przez pomyłkę usuwa się osobno, w szczegółach leku, przez 24 godziny od jej dodania.",
    takenSinceLabel: "Przyjmowany od",
    discontinuedOnLabel: "Pierwszy dzień bez leku",
    discontinuedOnHint: "Dzień po ostatnim przyjęciu: od {od} do dziś.",
    submit: "Zapisz zakończenie przyjmowania",
    // States without the form.
    startedToday: "Bieżący okres przyjmowania zaczyna się dziś. Zakończenie można zapisać od jutra.",
    // Next to startedToday and the MD005 error when the item itself was added today (a single period starting today).
    addedTodayHint: "Jeśli ta pozycja została dodana dziś przez pomyłkę, można ją usunąć zamiast kończyć.",
    noCurrentPeriod: "Ten lek nie ma trwającego okresu przyjmowania, więc nie ma czego zakończyć.",
    // An ended medication. `{data}` is the last day taken (the day before the saved date), DD.MM.YYYY.
    takenUntil: "Przyjmowany do {data}",
    // `{do}` is formatCorrectionDeadline, as in list.addedWithDeadline.
    deadline: "Zakończenie można poprawić lub cofnąć do {do}.",
    // Link on the details screen while the window of the end is open.
    correctLink: "Popraw zakończenie – do {do}",
    moveHeading: "Inna data zakończenia",
    moveSubmit: "Zapisz nową datę",
    cancelHeading: "Cofnięcie zakończenia",
    cancelHint: "Lek wraca na listę aktualnych leków, a jego ostatni okres przyjmowania znów trwa.",
    cancelSubmit: "Cofnij zakończenie",
    closed:
      "Okno korekty zakończenia jest już zamknięte, więc daty zakończenia nie da się zmienić. Data zakończenia jest częścią historii.",
    backToDetails: "Wróć do szczegółów leku",
    // Banners on the details screen after `?zakonczenie=zapisane|poprawione|cofniete`.
    saved: "Zapisano zakończenie przyjmowania.",
    savedWithDeadline: "Zapisano zakończenie przyjmowania. Możesz je poprawić lub cofnąć do {do}.",
    moved: "Zmieniono datę zakończenia przyjmowania.",
    movedWithDeadline: "Zmieniono datę zakończenia przyjmowania. Możesz ją poprawić lub cofnąć do {do}.",
    cancelled: "Cofnięto zakończenie przyjmowania. Lek jest znów na liście aktualnych leków.",
  },
  // Deleting an item added by mistake (S-04, FR-005): only within the correction window of the medication (24 hours
  // from adding it). Kept apart from ending: an end is part of the history, a deletion removes an item that never
  // belonged there. Plain wording, no alarm: nothing here says a medication should end.
  deletion: {
    title: "Usunięcie pozycji dodanej przez pomyłkę",
    // Link in a separate section at the bottom of the details screen. `{do}` as in list.addedWithDeadline.
    open: "Usuń pozycję dodaną przez pomyłkę – do {do}",
    explanation:
      "Usunięcie kasuje tę pozycję razem z całą jej historią przyjmowania. Służy wyłącznie do poprawienia pomyłki przy dodawaniu.",
    endInstead:
      "Jeśli ten lek był przyjmowany, a przyjmowanie się zakończyło, zapisz to przez „Zakończenie przyjmowania” w szczegółach leku. Wtedy lek zostaje w historii.",
    deadline: "Pozycję można usunąć do {do}.",
    submit: "Usuń pozycję",
    closed:
      "Okno korekty tego leku jest już zamknięte, więc tej pozycji nie da się usunąć. Lek jest częścią historii; zakończenie przyjmowania zapisuje się datą.",
    backToDetails: "Wróć do szczegółów leku",
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
      "To dawkowanie jest takie samo jak w okresie bezpośrednio przed tym okresem albo po nim. Taka poprawa usunęłaby z historii zmianę dawkowania. Zmianę dawki zapisaną przez pomyłkę cofa się przez „Cofnij zmianę dawki” w szczegółach leku, w oknie korekty najnowszego okresu.",
    correctionGeneric: "Nie udało się zapisać poprawki. Spróbuj ponownie.",
    // Undoing a dose change (S-06): codes raised by undo_dosage_change
    // (supabase/migrations/20261007120000_undo_dosage_change.sql). DP008 is periodNotFound.
    undoFirstPeriod:
      "To pierwszy okres dawkowania tego leku, czyli jego początek, a nie zmiana dawki. Pozycję dodaną przez pomyłkę usuwa się w szczegółach leku, przez 24 godziny od jej dodania.",
    undoNotLatest: "Cofnąć można tylko najnowszą zmianę dawki tego leku.",
    undoDiscontinued:
      "Przyjmowanie tego leku jest zakończone. Zmianę dawki można cofnąć dopiero po cofnięciu zakończenia przyjmowania.",
    undoWindowClosed: "Okno korekty tej zmiany dawki jest już zamknięte. Zmiana jest częścią historii.",
    undoGeneric: "Nie udało się cofnąć zmiany dawki. Spróbuj ponownie.",
    // Ending a medication (S-04): codes raised by discontinue_medication and correct_discontinuation
    // (supabase/migrations/20261006120000_discontinue_medication.sql). MD001 is medicationNotFound. `{data}` is the
    // earliest allowed date (DD.MM.YYYY), filled in by the screen: the URL carries only the key, never a date.
    alreadyDiscontinued: "Przyjmowanie tego leku jest już zakończone.",
    discontinuedOnInFuture: "Pierwszy dzień bez leku nie może być późniejszy niż dziś.",
    discontinuedOnTooOld: "Zakończenie można zapisać najwyżej 14 dni wstecz. Najwcześniejsza możliwa data: {data}.",
    discontinuedOnTooEarly:
      "Pierwszy dzień bez leku musi być późniejszy niż początek ostatniego okresu przyjmowania. Najwcześniejsza możliwa data: {data}.",
    discontinuationNoCurrentPeriod: "Ten lek nie ma trwającego okresu przyjmowania, więc nie ma czego zakończyć.",
    notDiscontinued: "Przyjmowanie tego leku nie jest zakończone, więc nie ma czego poprawiać.",
    discontinuationWindowClosed: "Okno korekty zakończenia jest już zamknięte. Data zakończenia jest częścią historii.",
    sameDiscontinuedOn: "Ta data zakończenia jest już zapisana.",
    invalidDiscontinuedOn: "Wpisz poprawną datę pierwszego dnia bez leku.",
    discontinuationGeneric: "Nie udało się zapisać zakończenia przyjmowania. Spróbuj ponownie.",
    // Deleting an item added by mistake (S-04): MD010 from delete_medication; MD001 is medicationNotFound.
    deleteWindowClosed:
      "Okno korekty tego leku jest już zamknięte, więc tej pozycji nie da się usunąć. Zakończenie przyjmowania zapisuje się datą.",
    deleteGeneric: "Nie udało się usunąć pozycji. Spróbuj ponownie.",
    generic: "Nie udało się zapisać leku. Spróbuj ponownie.",
  },
} as const;

export type MedicationApiErrorCode = keyof typeof MEDICATION_COPY.apiErrors;

// Unknown or missing codes show nothing: a crafted `?error=` link must not render its own text.
export function apiErrorMessage(code: string | null): string | null {
  const messages = MEDICATION_COPY.apiErrors;
  return code && Object.hasOwn(messages, code) ? messages[code as MedicationApiErrorCode] : null;
}
