// Working copy (Polish) for the medication screens (S-02): titles, field labels, buttons, hints and API route
// errors. Kept apart from src/lib/copy/interactions.ts on purpose: these texts mention the dose, which the FR-012
// stem filter blocks. Nothing here may speak about an interaction or its absence — that belongs in interactions.ts.

export const MEDICATION_COPY = {
  list: {
    title: "Leki",
    add: "Dodaj lek",
    empty: "Nie masz jeszcze żadnego leku. Dodaj pierwszy, który przyjmujesz.",
    since: "od {data}",
    added: "Dodano lek.",
  },
  add: {
    title: "Dodaj lek",
    searchLabel: "Nazwa handlowa",
    searchPlaceholder: "np. Ibuprom",
    searchSubmit: "Szukaj",
    results: "Wyniki wyszukiwania",
    noResults: "Nie znaleziono leku o tej nazwie w rejestrze.",
    variants: "Warianty: {liczba}",
    chooseVariant: "Wybierz wariant",
    strength: "Moc",
    form: "Postać",
    composition: "Skład",
    doseLabel: "Dawkowanie",
    dosePlaceholder: "np. 1 tabletka rano",
    startedOnLabel: "Data rozpoczęcia",
    submit: "Zapisz lek",
    pending: "Zapisywanie...",
    notInRegistry: "Nie ma mojego leku — dodam z ulotki",
    registrySource: "Dane o składzie: Rejestr Produktów Leczniczych, licencja CC BY 4.0",
  },
  leaflet: {
    title: "Dodaj lek z ulotki",
    productNameLabel: "Nazwa leku",
    substanceLabel: "Substancja czynna",
    substanceHint: "Pierwsza wersja przyjmuje jedną substancję czynną na lek.",
    noMatch: "Nie znaleziono tej substancji na liście. Czy chodzi o jedną z poniższych?",
    confirmUnverified: "Zapisz bez sprawdzania — ta substancja nie będzie objęta żadną parą",
  },
  // Hints next to the form (design-draft.md:196-199), reworded for a product chosen by its trade name.
  hints: {
    doseHistoryTitle: "Dawkowanie ma historię",
    doseHistory:
      "Późniejsza zmiana dawkowania zamknie ten wpis datą i otworzy nowy okres obok. Lek zostaje jedną pozycją na liście.",
    fixedCompositionTitle: "Substancji nie podmienisz",
    fixedComposition:
      "Skład leku zostaje taki, jaki zapiszesz. Inny lek to zakończenie tego i dodanie nowego — inaczej dawne wpisy o samopoczuciu przestałyby się zgadzać.",
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
    substanceRequired: "Wpisz substancję czynną.",
    generic: "Nie udało się zapisać leku. Spróbuj ponownie.",
  },
} as const;

export type MedicationApiErrorCode = keyof typeof MEDICATION_COPY.apiErrors;

// Unknown or missing codes show nothing: a crafted `?error=` link must not render its own text.
export function apiErrorMessage(code: string | null): string | null {
  const messages = MEDICATION_COPY.apiErrors;
  return code && Object.hasOwn(messages, code) ? messages[code as MedicationApiErrorCode] : null;
}
