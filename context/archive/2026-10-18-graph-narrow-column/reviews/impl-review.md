<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Graf leków w jednej kolumnie, gdy brakuje miejsca

- **Plan**: context/changes/graph-narrow-column/plan.md
- **Scope**: Full plan
- **Reviewed phases**: 1, 2, 3
- **Date**: 2026-10-18
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 2 warnings, 4 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | WARNING |
| Scope Discipline    | PASS    |
| Safety & Quality    | WARNING |
| Architecture        | PASS    |
| Pattern Consistency | WARNING |
| Success Criteria    | PASS    |

Bramki 18.10.2026: `npm test` 563/563, `npm run typecheck` 0 błędów, `npm run lint` 0 błędów (10 ostrzeżeń `no-console` w `src/lib/observability/`, sprzed zmiany), `npm run build` OK, pomiar 1,24 / 3,53 / 8,69 ms (12 + 0 i 20 + 20 PASS, 30 + 60 FAIL — przyjęte ryzyko #127). E2E: 20/20 przy fazie 3, test grafu 3 biegi z rzędu zielone, czerwony po cofnięciu progów do px.

## Findings

### F1 — Próg kolumny leży dokładnie na szerokości karty przy telefonie 360 px

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/components/medications/InteractionGraph.tsx:311-317
- **Detail**: Przy 360 px i zwykłym tekście treść karty ma 360 − 2×16 (`p-4` w `<main>`, `src/layouts/AppLayout.astro:76`) − 2×16 (`px-4` karty) − 2 (ramka) = 294 px = dokładnie 18,375 rem. Telefon „C” pokazuje się tylko dlatego, że `@min` obejmuje równość. Zapas zero: klasyczny pasek przewijania (przeglądarka na komputerze z wąskim oknem), 1 px więcej marginesu albo ułamkowa szerokość ekranu przełącza 360 px na kolumnę. Przypadek E2E 360/100 → telefon też stoi na tej krawędzi; w headless Chromium paski są ukryte, więc przechodzi.
- **Fix A ⭐ Recommended**: Obniżyć próg do 18,25 rem (292 px) w trzech klasach sceny i w komentarzach (`InteractionGraph.tsx`, `interaction-graph.ts`, `types.ts`), plan i `change.md` dostają notkę.
  - Strength: 2 px zapasu przy 360 px; przypadki E2E 412/125 i 360/125 dalej rozróżniają rem od px (330 i 278 px treści przy 125%, z dala od 292).
  - Tradeoff: Ekran 358–359 px (rzadki) zostaje przy telefonie zamiast kolumny; zmiana liczby, którą autorka zatwierdziła w planie.
  - Confidence: MED — arytmetyka sprawdzona na kodzie, nie mierzona w przeglądarce z paskiem przewijania.
  - Blind spot: Nie sprawdzone, czy przy 358 px telefon „C” nie nachodzi (pomiar #126 był przy 360 px).
- **Fix B**: Zostawić 18,375 rem i dopisać przy klasach komentarz, że próg to celowo dokładna szerokość treści karty przy 360 px, a każda zmiana `p-4` / `px-4` / ramki go przesuwa.
  - Strength: Bez zmiany zachowania zatwierdzonego w fazie 2.
  - Tradeoff: Zapas dalej zero; ryzyko zostaje, tylko jest opisane.
  - Confidence: HIGH — sam komentarz.
  - Blind spot: Okno przeglądarki na komputerze z paskiem przewijania przy 360 px pokaże kolumnę.
- **Decision**: FIXED (Fix A) — próg 18,25 rem w klasach i komentarzach, notka w planie i change.md; npm test, typecheck, E2E grafu 3/3 zielone

### F2 — Test łuków nie sprawdza punktów kontrolnych w pionie ani wygięcia

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: scripts/medications/interaction-graph.test.mjs:554-572
- **Detail**: Test sprawdza końce łuku, `c1x === c2x` i `0 ≤ c1x < x`. Nie sprawdza, że `y` punktów kontrolnych równa się `y` końców (poziome wejście w punkt, obiecane w komentarzu `buildColumn`), ani że łuk dalszej pary wygina się mocniej. Regres do łuku z pionowym wejściem albo do stałego wygięcia przeszedłby test.
- **Fix**: Dopisać asercje `c1y === a.y`, `c2y === b.y` i jedną wartość policzoną ręcznie: sąsiednie wiersze → `cx = 65 − (10 + 48 × 0,18) = 46,4`, oraz że łuk przez 2 wiersze ma `cx` mniejsze niż przez 1.
- **Decision**: FIXED — asercje c1y/c2y + test „a column arc bends further left…” (46,4 / 37,7); oba czerwone przy mutacji (stałe wygięcie, pionowe wejście); npm test 564/564

### F3 — Komentarz i plan podają 318 px zamiast 330 px przy 412 px + 125%

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: tests/e2e/interaction-graph.spec.ts:282; context/changes/graph-narrow-column/plan.md:198
- **Detail**: 412 − 2×20 − 2×20 − 2 = 330 px treści karty (tą samą metodą test słusznie podaje 558 px przy 640 px). Asercja bez zmian, bo 330 leży między 294 a 367,5.
- **Fix**: Poprawić komentarz w teście na „About 330 px”; w planie dopisać sprostowanie pod listą (blok fazy zostaje).
- **Decision**: FIXED — komentarz w teście (330 px, próg 292 px), sprostowanie w planie pod listą fazy 3

### F4 — Plan podaje szerokość pasa łuków 56, kod ma 80

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: context/changes/graph-narrow-column/plan.md:102; src/lib/services/interaction-graph.ts:56
- **Detail**: `GRAPH_COLUMN_GUTTER = 80` (5 rem) to decyzja autorki z ręcznego sprawdzenia fazy 2, zapisana w `change.md`. Plan dalej mówi 56 w trzech miejscach (Implementation Approach, kontrakt fazy 1, testy). Przy archiwizacji plan opisze inną liczbę niż kod.
- **Fix**: Dopisać w planie notkę przy kontrakcie fazy 1 z odesłaniem do `change.md`.
- **Decision**: FIXED — notka po kontrakcie testów fazy 1 w planie

### F5 — Stałe kolumny importowane z serwisu, BUTTON_WIDTH dalej powielone

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/components/medications/InteractionGraph.tsx:5, :25
- **Detail**: Komponent importuje `GRAPH_COLUMN_ROW` i `GRAPH_COLUMN_GUTTER` z serwisu, a `BUTTON_WIDTH = 90` zostaje kopią `GRAPH_BUTTON_WIDTH` z komentarzem „keep in sync”. Dwa sposoby obok siebie; import działa (serwis bez `@/` i efektów ubocznych).
- **Fix**: Zaimportować `GRAPH_BUTTON_WIDTH` z serwisu zamiast kopii.
- **Decision**: FIXED — import `GRAPH_BUTTON_WIDTH`, kopia usunięta

### F6 — Pusty pas pod kolumną z `pb-14`

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/components/medications/InteractionGraph.tsx:308
- **Detail**: `pb-14` na karcie rezerwuje miejsce na nazwy pod ostatnim rzędem punktów w układach „C” i „10”. W kolumnie nazwy są w wierszach, więc pod ostatnim wierszem zostaje ok. 3,5 rem pustego miejsca. Autorka zatwierdziła wygląd w sprawdzeniu 2.6 — możliwe, że to zgodne z makietą.
- **Fix**: Jeśli niezgodne z makietą: najpierw makieta (reguła „makieta przed zmianą wyglądu”), potem dolny odstęp zależny od sceny.
- **Decision**: SKIPPED — autorka: wygląd zatwierdzony w sprawdzeniu 2.6, zostaje
