# Luki w testach wskazane przez Strykera — leki i filtr FR-012: plan wdrożenia

## Overview

Dopisanie testów, które zabijają przeżyłe mutanty w `src/lib/services/medications.ts` (39) i `scripts/rpl/pairs.mjs` (41), oraz zapis mutantów pominiętych świadomie razem z powodem. Bez zmian w kodzie produkcyjnym. Oczekiwane wartości biorą się z wymagań (PRD, plan S-02, reguła SQL, decyzje autorki z 4.10.2026), nie z testowanego kodu (test-plan §6.1).

## Current State Analysis

- Pierwszy pomiar (`npm run test:mutation`, konfiguracja z PR #61): łącznie 81,70 % (516 zabitych, 116 przeżyłych). `medications.ts` 62,50 % (39 przeżyłych + 1 timeout), `pairs.mjs` 82,40 % (41 przeżyłych).
- Pełny podział mutantów z werdyktami: `research.md` (sekcje „Detailed Findings” i tabele).
- `medications.ts`: 22 przeżyłe mają jedną przyczynę — `registryCompositionNames` (`medications.ts:63-77`) nie ma żadnego testu. `formatIsoDate` (`:80-83`) też go nie ma.
- `todayInWarsaw`: test `medications.test.mjs:58-63` przechodzi także bez `timeZone`, bo strefa maszyny autorki to `Europe/Warsaw`. Zmierzone: `process.env.TZ = "UTC"` ustawione w czasie biegu zmienia strefę domyślną `Intl.DateTimeFormat` w Node 24.13.0, a `node --test` uruchamia każdy plik w osobnym procesie. Daty sprawdza wyłącznie `medications.test.mjs`.
- `pairs.mjs`: jedyny przeżyły w samym filtrze FR-012 to #56 (`/\s+/` → `/\s/` w `foldText`, `pairs.mjs:71-73`). Zmierzone: opis ze złamaniem wiersza albo podwójną spacją przechodzi przez parser CSV w całości i jest odrzucany z powodem `forbidden_word` (`nie łącz`).
- Polska kolacja (zmierzone): `["Lc","Łb"]` z `localeCompare(…, "pl")` daje `Lc, Łb`, bez locale `Łb, Lc`.

## Desired End State

- Każdy mutant z listy „do zabicia” (research + decyzje niżej) pada w `npm run test:mutation`.
- Każdy przeżyły mutant w obu plikach ma wiersz w `context/changes/mutation-gaps-medications-fr012/surviving-mutants.md` z linią, mutatorem i powodem pominięcia. Żaden przeżyły nie zostaje bez powodu.
- `context/foundation/test-plan.md` (§5, wiersz Stryker) podaje drugi pomiar obok pierwszego.

### Key Discoveries:

- Reguła deduplikacji składu, która jest wyrocznią dla `registryCompositionNames`: `supabase/migrations/20260930120000_medication_write_and_interactions.sql:192-207` — jeden wiersz na kod ATC (pierwszy wg `position`, potem nazwy), wiersze bez kodu distinct po nazwie. Wymaganie: FR-006 „pełny skład” (`prd.md:129`), plan S-02 `context/archive/2026-09-29-add-medication-with-interaction-flag/plan.md:93-97`.
- Wymaganie podpowiedzi: przedrostek ≥ 4 znaki po złożeniu wielkości liter i ogonków, najwyżej 5 nazw — `context/archive/2026-09-29-add-medication-with-interaction-flag/plan.md:498`.
- Pułapka V8: `localeCompare(x, "")` rzuca w czystym procesie, ale po wcześniejszym `localeCompare` bez locale porównuje cicho kolacją domyślną. Test kolacji musi rozróżniać polską od domyślnej, nie liczyć na wyjątek.
- Wzorzec testów walidatora par: `scripts/rpl/pairs-fr012.test.mjs` (korpus jako wyrocznia, nazwany powód `forbidden_word`), `scripts/rpl/pairs.test.mjs` (pliki tymczasowe przez `mkdtemp`, `loadPairs`).

## What We're NOT Doing

- `scripts/tokens/contrast.mjs` (32 przeżyłe) i `src/lib/navigation.ts` (4) — poza zakresem wg `change.md`.
- Zmiany w kodzie produkcyjnym. Jeśli test ujawni błąd w kodzie, faza staje i sprawa wraca do autorki jako osobna zmiana.
- Komentarze `// Stryker disable` w kodzie — pominięte mutanty żyją wyłącznie w tabeli w folderze zmiany (decyzja autorki).
- Testy całego wyjścia CLI `pairs.mjs` (treść wypisywanych linii) — utrwalamy tylko kod wyjścia.
- Nowe zdania w `scripts/fr012/corpus.mjs` — #56 zabija wariant istniejących zdań, nie nowe dane.
- Mutant #594 (remis po nazwie w `registryCompositionNames`) — pomijany: remis na tej samej `position` jest możliwy tylko dla pary „wiersz z kodem + wiersz bez kodu” i zmienia wyłącznie kolejność nazw na ekranie.
- Pytanie, czy `max_rows` w PostgREST może uciąć osadzenie `registry_substances` w `src/pages/leki/nowy.astro:61-66` — osobna sprawa (Open Risks w briefie).
- Bramka Stryker w CI — zostaje opcjonalna, ręczna.

## Implementation Approach

Kod pod testem istnieje, więc reguła „test czerwony przed poprawką” (test-plan §6.1) działa odwrotnie: dowodem, że test coś mierzy, jest mutant, który przy nim pada. Każda faza kończy się biegiem Strykera zawężonym do jednego pliku i porównaniem przeżyłych z listą pominiętych. Mutanty porównujemy po linii i mutatorze, nie po numerze — numery Strykera zmieniają się przy innym zakresie `mutate`.

Implementacja przez `/10x-implement` (nie `/10x-tdd` — kod produkcyjny już istnieje).

## Phase 1: Testy `medications.ts`

### Overview

Testy dla `registryCompositionNames` i `formatIsoDate`, przypadki brzegowe `similarSubstances`, polska kolacja w `groupRegistryResults`, strefa UTC w pliku testu. Zabija 33 mutanty.

### Changes Required:

#### 1. Strefa czasowa w pliku testu

**File**: `scripts/medications/medications.test.mjs`

**Intent**: Wymusić strefę inną niż Warszawa, żeby test `todayInWarsaw` padał, gdy funkcja zgubi `timeZone: "Europe/Warsaw"` (#581). Dziś przechodzi tylko dlatego, że maszyna autorki sama jest w tej strefie.

**Contract**: `process.env.TZ = "UTC"` na początku pliku, przed pierwszym testem, z komentarzem dlaczego. Bez zmian w `package.json`.

#### 2. `registryCompositionNames`

**File**: `scripts/medications/medications.test.mjs`

**Intent**: Pierwsze testy funkcji, która pokazuje skład przed zapisem. Wyrocznią jest reguła SQL `add_medication_from_registry` i FR-006 — skład na ekranie ma być tym, który zostanie zapisany. Zabija #586–#593, #595–#607.

**Contract**: dodać funkcję do importu. Przypadki (wejścia wzorowane na produktach z planu S-02 `plan.md:37-39`, wiersze podane celowo nie w kolejności `position`):

| Przypadek                                                                             | Oczekiwanie                           |
| ------------------------------------------------------------------------------------- | ------------------------------------- |
| dwie substancje z różnymi kodami, wiersz z `position` 2 przed wierszem z `position` 1 | nazwy w kolejności `position`         |
| ten sam kod na dwóch pozycjach, różne nazwy (forma soli, wzór: Dexak M01AE17)         | jedna nazwa — ta z niższej `position` |
| wiersz bez kodu obok wierszy z kodem                                                  | wiersz bez kodu zostaje               |
| ta sama nazwa z dwoma różnymi kodami                                                  | nazwa pokazana raz                    |
| pusta lista                                                                           | `[]`                                  |

#### 3. `formatIsoDate`

**File**: `scripts/medications/medications.test.mjs`

**Intent**: Utrwalić format daty w liście i szczegółach leku. Źródło: decyzja autorki z 4.10.2026 (format nie występuje w PRD). Zabija #608–#610.

**Contract**: `formatIsoDate("2026-10-01")` → `"01.10.2026"`. Dzień i miesiąc różne od siebie, żeby zamiana kolejności padła.

#### 4. `similarSubstances` — przypadki brzegowe

**File**: `scripts/medications/medications.test.mjs`

**Intent**: Granice z planu S-02 `plan.md:498` i reguła „każda nazwa raz” (decyzja autorki z 4.10.2026). Zabija #617, #623, #625, #628, #637, #643, #644.

**Contract**:

- ogonek przed 4. znakiem: `"dićlofenac"` znajduje `"diclofenacum"` (#617),
- wpis równy pozycji słownika: `"ibuprofenum"` zwraca `["ibuprofenum"]` — mutanty pętli dają timeout, który Stryker liczy jako wykrycie (#623, #625, #628),
- wpis o długości dokładnie 4: `"ibup"` znajduje `"ibuprofenum"` (#637),
- nazwa podana w słowniku dwa razy wraca raz (#643, #644).

#### 5. `groupRegistryResults` — polska kolacja

**File**: `scripts/medications/medications.test.mjs`

**Intent**: Wymaganie „alfabetycznie” (`plan.md:304`) doprecyzowane przez autorkę 4.10.2026 jako polska kolejność. Zabija #574.

**Contract**: dwie nazwy produktów, jedna na „L”, druga na „Ł”, dobrane tak, żeby kolacja domyślna dawała inną kolejność niż polska (litera po „Ł” wcześniej w alfabecie niż litera po „L”, wzór zmierzony: `Lc` / `Łb`). Oczekiwanie: nazwa na „L” przed nazwą na „Ł”.

### Success Criteria:

#### Automated Verification:

- Testy jednostkowe przechodzą: `npm test`
- Lint przechodzi: `npm run lint`
- Typy przechodzą: `npm run typecheck`
- Stryker zawężony do pliku: `npx stryker run --mutate src/lib/services/medications.ts` — przeżywa dokładnie 6 mutantów, wszystkie z listy pominiętych: #594 (remis po nazwie), #624, #626, #629 (warunki pętli równoważne), #636 (osłona długości), #564 (`toLocaleUpperCase` w kluczu grupy)

#### Manual Verification:

- Autorka czyta przypadki `registryCompositionNames` i potwierdza, że oczekiwania odpowiadają składowi, który chce widzieć przy wyborze wariantu

**Implementation Note**: Jeśli przeżyje mutant spoza listy pominiętych albo nowy test padnie na niezmienionym kodzie, faza staje — nie dopisujemy mutanta do pominiętych i nie zmieniamy kodu bez decyzji autorki.

---

## Phase 2: Testy `pairs.mjs`

### Overview

Wariant białych znaków dla korpusu FR-012 (#56), nagłówek z odstępem (#79), błąd inny niż brak pliku (#206) i kod wyjścia CLI (#234–#237 i pokrewne w `main()`).

### Changes Required:

#### 1. Białe znaki w zakazanych zdaniach

**File**: `scripts/rpl/pairs-fr012.test.mjs`

**Intent**: Zakazane zdanie nie może przejść filtra dlatego, że wyrazy rozdziela podwójna spacja albo złamanie wiersza. Jedyny przeżyły mutant w samym filtrze FR-012 (#56).

**Contract**: dla każdego zdania z `FORBIDDEN_SENTENCES` dwa warianty — każda spacja zamieniona na dwie spacje, każda spacja zamieniona na złamanie wiersza — przez istniejący `assertForbidden` (powód `forbidden_word`). Pętla idzie po korpusie, nigdy po `FORBIDDEN_WORDS`.

#### 2. Nagłówek i błąd odczytu

**File**: `scripts/rpl/pairs.test.mjs`

**Intent**: Nazwy kolumn z odstępem wokół nadal pasują do nagłówka (#79). Błąd odczytu inny niż brak pliku wychodzi bez zmiany, a nie jako „No pairs file” (#206).

**Contract**:

- nagłówek z kolumnami otoczonymi spacjami parsuje się, a poprawny wiersz pod nim jest przyjęty,
- `loadPairs` na katalogu (z `mkdtemp`) odrzuca błąd z `code === "EISDIR"`, a komunikat nie zawiera „No pairs file”.

#### 3. Kod wyjścia CLI

**File**: `scripts/rpl/pairs.test.mjs`

**Intent**: Utrwalić kod wyjścia jako kontrakt skryptu walidacji (decyzja autorki z 4.10.2026): błąd daje 1, poprawny plik daje 0. Treści wypisywanych linii nie sprawdzamy.

**Contract**: skrypt uruchamiany jako osobny proces (`process.execPath`, `scripts/rpl/pairs.mjs`), pliki w katalogu z `mkdtemp`:

| Wywołanie                                               | Kod wyjścia |
| ------------------------------------------------------- | ----------- |
| bez argumentu                                           | 1           |
| ścieżka do nieistniejącego pliku                        | 1           |
| plik z wierszem z błędem (np. opis bez wymaganej frazy) | 1           |
| plik z jedną poprawną, sprawdzoną parą                  | 0           |

### Success Criteria:

#### Automated Verification:

- Testy jednostkowe przechodzą: `npm test`
- Lint przechodzi: `npm run lint`
- Stryker zawężony do pliku: `npx stryker run --mutate scripts/rpl/pairs.mjs` — padają #56, #79, #206 i #234–#237
- Każdy przeżyły po tym biegu jest na liście pominiętych z `research.md` (17 poza CLI) albo w `main()` (`pairs.mjs:189-212`)

#### Manual Verification:

- Autorka uruchamia `node scripts/rpl/pairs.mjs supabase/seed-data/interaction_pairs.csv` i widzi ten sam wynik co przed zmianą (testy nie dotykają danych)

**Implementation Note**: Przeżyły spoza obu list = stop i pytanie do autorki.

---

## Phase 3: Pomiar i zapis pominiętych

### Overview

Pełny bieg Strykera, tabela pominiętych mutantów z powodem, drugi pomiar w test-plan.

### Changes Required:

#### 1. Tabela pominiętych mutantów

**File**: `context/changes/mutation-gaps-medications-fr012/surviving-mutants.md`

**Intent**: Jedno miejsce z każdym przeżyłym mutantem obu plików i powodem pominięcia, wzorem decyzji z impl-review.

**Contract**: nagłówek z datą pomiaru, commitem i zastrzeżeniem, że numery mutantów są ważne tylko dla tego pomiaru. Tabela: plik, linia, mutator i zmiana (np. `/\s+/g, " "` → `""`), powód. Powody z `research.md` i z tego planu; grupy jednorodne (treść komunikatów, `main()`) mogą dzielić jeden powód. Mutant bez powodu z research ani planu nie trafia do tabeli — wraca do autorki.

#### 2. Drugi pomiar w test-plan

**File**: `context/foundation/test-plan.md`

**Intent**: Wiersz „testy mutacyjne (Stryker)” w §5 dostaje drugi pomiar obok pierwszego, z odnośnikiem do tabeli pominiętych.

**Contract**: tylko kolumna „Catches” tego wiersza; pierwszy pomiar zostaje bez zmian.

### Success Criteria:

#### Automated Verification:

- Pełny bieg przechodzi: `npm run test:mutation`
- Liczba przeżyłych w `medications.ts` i `pairs.mjs` z raportu równa się liczbie wierszy dla tych plików w `surviving-mutants.md`
- `contrast.mjs` i `navigation.ts` mają tyle samo przeżyłych co w pierwszym pomiarze (32 i 4)

#### Manual Verification:

- Autorka przegląda `surviving-mutants.md` i akceptuje każdy powód pominięcia

---

## Testing Strategy

### Unit Tests:

- Wszystkie nowe testy w istniejących plikach: `scripts/medications/medications.test.mjs`, `scripts/rpl/pairs.test.mjs`, `scripts/rpl/pairs-fr012.test.mjs`. Nazwy testów po angielsku.
- Każdy przypadek nazywa w treści testu wymaganie, z którego bierze oczekiwanie (FR-006, plan S-02, decyzja autorki z 4.10.2026).

### Integration Tests:

- Test CLI w fazie 2 uruchamia skrypt jako osobny proces — jedyny test procesu w tej zmianie.

### Manual Testing Steps:

1. Przeczytać przypadki `registryCompositionNames` i porównać z oczekiwanym składem (faza 1).
2. Uruchomić walidację pliku par z README i porównać wynik (faza 2).
3. Przejrzeć `surviving-mutants.md` (faza 3).

## Performance Considerations

Pełny `npm run test:mutation` trwa ~3–4 min; bieg zawężony do pliku krócej. Test CLI dodaje kilka uruchomień procesu Node do `npm test`.

## References

- Research: `context/changes/mutation-gaps-medications-fr012/research.md`
- Raport pierwszego pomiaru: `reports/mutation/mutation.html`
- Wzorzec testów walidatora: `scripts/rpl/pairs-fr012.test.mjs`, `scripts/rpl/pairs.test.mjs`
- Reguła deduplikacji składu: `supabase/migrations/20260930120000_medication_write_and_interactions.sql:192-207`
- Plan S-02: `context/archive/2026-09-29-add-medication-with-interaction-flag/plan.md:93-97`, `:303-317`, `:498`
- test-plan §5 i §6.1: `context/foundation/test-plan.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Testy `medications.ts`

#### Automated

- [x] 1.1 Testy jednostkowe przechodzą: `npm test` — b72090b
- [x] 1.2 Lint przechodzi: `npm run lint` — b72090b
- [x] 1.3 Typy przechodzą: `npm run typecheck` — b72090b
- [x] 1.4 Stryker zawężony do `medications.ts` — przeżywa dokładnie 6 mutantów z listy pominiętych — b72090b

#### Manual

- [x] 1.5 Autorka potwierdza przypadki `registryCompositionNames` — b72090b

### Phase 2: Testy `pairs.mjs`

#### Automated

- [x] 2.1 Testy jednostkowe przechodzą: `npm test` — 67d070e
- [x] 2.2 Lint przechodzi: `npm run lint` — 67d070e
- [x] 2.3 Stryker zawężony do `pairs.mjs` — padają #56, #79, #206 i #234–#237 — 67d070e
- [x] 2.4 Każdy przeżyły jest na liście pominiętych albo w `main()` — 67d070e

#### Manual

- [x] 2.5 Walidacja pliku par z README daje ten sam wynik co przed zmianą — 67d070e

### Phase 3: Pomiar i zapis pominiętych

#### Automated

- [x] 3.1 Pełny bieg przechodzi: `npm run test:mutation`
- [x] 3.2 Liczba przeżyłych w obu plikach równa się liczbie wierszy w `surviving-mutants.md`
- [x] 3.3 `contrast.mjs` i `navigation.ts` bez zmian (32 i 4 przeżyłe)

#### Manual

- [x] 3.4 Autorka akceptuje każdy powód w `surviving-mutants.md`
