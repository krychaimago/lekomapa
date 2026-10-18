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
  // Medication details (S-07): the section title with the number of folded cards.
  detailsHeadingCount: "Możliwe interakcje ({liczba})",
  withMedication: "z lekiem {nazwa}",
  // Inside an unfolded card: the link to the other medication, kept out of the clickable heading.
  openOtherMedication: "Przejdź do leku {nazwa}",
  noInteractionsForMedication: "Wśród Twoich bieżących leków nie znaleziono sprawdzanej pary z tym lekiem.",
  substanceNotCovered: "Ta substancja nie jest objęta żadną sprawdzaną parą.",
  // On the page of ended medications (S-04): they carry no flag because they are not compared, not because they passed.
  endedNotCompared:
    "Zakończone leki nie są porównywane z listą par substancji, więc nie mają oznaczenia. Brak oznaczenia przy nich nie znaczy, że zostały sprawdzone.",
  rulesIncomplete: "Lekomapa sprawdza tylko wybrane pary substancji — ta lista nie obejmuje wszystkich interakcji.",
  // Interaction graph under the medication list (S-10, FR-014).
  graphTitle: "Interakcje na grafie",
  graphHint: "Dotknij leku, żeby zobaczyć jego możliwe interakcje z pozostałymi lekami.",
  graphLabel: "Graf bieżących leków. Linia łączy dwa leki, które tworzą sprawdzaną parę.",
  graphNoSelection: "Nie wybrano leku.",
  graphPartner: "Możliwa interakcja z: {nazwa}",
  graphTooFewMedications: "Graf pojawi się, gdy na liście będą co najmniej dwa leki.",
  graphNoLineIsNotSafe: "Brak linii nie znaczy, że połączenie jest bezpieczne.",
  graphLoadError: "Nie udało się wczytać grafu. Lista leków powyżej działa bez zmian.",
  // Link from the "Wizyta" section to the graph on /leki#graf.
  graphVisitLink: "Zobacz leki na grafie",
} as const;
