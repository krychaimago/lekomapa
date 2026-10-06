// Working copy (Polish) for every text that speaks about a possible interaction or its absence (S-02).
// scripts/fr012/interaction-copy.test.mjs runs each string here through the FR-012 stem filter, so the module
// has no imports and only string fields. Templates carry a `{nazwa}` marker the screen replaces — never a
// function, because text built in a function would bypass the filter.
// Form labels and hints mentioning the dose live in src/lib/copy/medications.ts: the `dawk` stem blocks them here.

export const INTERACTION_COPY = {
  flagLabel: "Możliwa interakcja",
  note: "Informacja poglądowa — w razie niepokoju skonsultuj z lekarzem lub farmaceutą.",
  noWarningIsNotSafe: "Brak oznaczenia nie znaczy, że połączenie jest bezpieczne.",
  detailsHeading: "Możliwe interakcje",
  withMedication: "z lekiem {nazwa}",
  noInteractionsForMedication: "Wśród Twoich bieżących leków nie znaleziono sprawdzanej pary z tym lekiem.",
  substanceNotCovered: "Ta substancja nie jest objęta żadną sprawdzaną parą.",
  // On the page of ended medications (S-04): they carry no flag because they are not compared, not because they passed.
  endedNotCompared:
    "Zakończone leki nie są porównywane z listą par substancji, więc nie mają oznaczenia. Brak oznaczenia przy nich nie znaczy, że zostały sprawdzone.",
  rulesIncomplete: "Lekomapa sprawdza tylko wybrane pary substancji — ta lista nie obejmuje wszystkich interakcji.",
} as const;
