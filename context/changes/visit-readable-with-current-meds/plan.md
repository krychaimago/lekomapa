# Czytelna „Wizyta” z listą bieżących leków — plan wdrożenia

## Overview

„Wizyta” (`/wizyta`) przy wielu objawach rośnie o ~10 linijek na objaw, bo każde pytanie do lekarza jest rozwinięte i powtarza leki z okna 90 dni. Plan: lista bieżących leków z dawkami raz na górze ekranu (MS-11, rozszerzenie FR-011), pytania zwinięte poza najnowszym, sekcja możliwych interakcji zwijana w całości z liczbą w tytule i notą zawsze widoczną. Roadmapa: S-05 (#108).

## Current State Analysis

- Ekran: `src/pages/wizyta.astro` — dwie sekcje: możliwe interakcje (karty z notą przy każdej, `:61-67`) i pytania do lekarza (wszystkie `open`, `:102-104`).
- Karta pytania `src/components/journal/DoctorQuestionCard.astro` jest wspólna z dziennikiem; przyjmuje `open`.
- Logika sekcji: `src/lib/services/visit-summary.ts` (czyste funkcje, testowane w `scripts/visit-summary/visit-summary.test.mjs` pod `node --experimental-strip-types`), dane: `src/lib/services/visit-summary-data.ts` (`loadVisitSummary`).
- Leki z okresami dawkowania i wariantem (moc, postać) są już wczytywane przez `loadQuestionMedications` (`src/lib/services/doctor-question-data.ts:89-118`) — lista bieżących leków nie potrzebuje nowego zapytania ani migracji.
- Reguła „bieżący lek” istnieje: `isCurrentMedication(discontinuedOn, today)` (`visit-summary.ts`), ta sama co w `medication_interactions()` i na `/leki`.
- Teksty: `src/lib/copy/visit-summary.ts` (każdy string przez filtr FR-012 w `scripts/fr012/visit-summary-copy.test.mjs`), nota `INTERACTION_COPY.note` (`src/lib/copy/interactions.ts`).
- `variantText` (`src/lib/services/medications.ts:86-95`) daje „Moc: 500 mg · Postać: tabletki”, pusty string gdy brak obu.
- Bezpieczne wstawianie wartości w szablon `{…}` jednym przebiegiem: `fill` w `src/lib/services/doctor-question.ts` (dziś nieeksportowane). `wizyta.astro` używa łańcucha `.replace`, który nie chroni przed `$&` w nazwie.
- Pokrycie: smoke sprawdza sekcję pytań (`scripts/smoke.mjs:1530-1557`), galeria trybu ciemnego ma stan `wizyta / with-question-and-interaction` (`tests/e2e/dark-gallery.spec.ts:237`). Brak testu „wiele objawów”.
- PRD pyt. 7 (`context/foundation/prd.md:245`) odłożyło stałą listę bieżących leków, bo rozszerza FR-011 poza zbieranie gotowych treści; ta sama decyzja odrzuciła jedno wspólne pytanie dla kilku objawów.

## Desired End State

Na `/wizyta`, od góry:

1. **Bieżące leki** — każdy lek bieżący raz, alfabetycznie (polskie sortowanie), w wierszu: nazwa, moc i postać bieżącej dawki (gdy znane z rejestru), data rozpoczęcia bieżącej dawki, dawka. Przykład: „Metformax (Moc: 500 mg · Postać: tabletki) — od 03.09.2026, 1 tabletka 2 razy dziennie”. Brak bieżących leków: krótki tekst i odnośnik „Dodaj lek”.
2. **Możliwe interakcje** — gdy są pary: cała sekcja zwijana chevronem, domyślnie rozwinięta, tytuł „Możliwe interakcje (N)”, gdzie N = liczba kart; pod tytułem nota poglądowa widoczna także przy zwiniętej sekcji. Karty bez zmian (nota przy każdej). Dwie linijki „lista nie obejmuje wszystkich interakcji” i „brak oznaczenia ≠ bezpieczne” zwijają się razem z kartami. Pusty stan (brak leków, jeden lek, brak pary) bez zmian i bez zwijania.
3. **Pytania do lekarza** — najnowszy objaw rozwinięty, pozostałe zwinięte do nagłówka. Treść karty bez zmian.

Weryfikacja: testy jednostkowe listy, filtr FR-012 na nowych tekstach, smoke, galeria trybu ciemnego, test E2E przy wielu lekach i objawach, ręczne sprawdzenie 320/360/375 px w obu trybach, LCP ≤ 2,5 s.

### Key Discoveries:

- Zwinięty `<details>` zostawia treść w HTML — smoke szukający nazw w sekcji pytań dalej przechodzi (`scripts/smoke.mjs:1538-1546`).
- Leku bez okresu dawkowania nie ma (pierwszy okres zapisywany razem z lekiem), ale funkcja listy ma go pominąć zamiast się wywrócić.
- `variantText` bierze wariant okresu, a okres bez wariantu dziedziczy wariant leku — to już robi `loadQuestionMedications:106-115`.
- `lucide-react` jest tylko dla React; w `.astro` chevron jako inline SVG w `currentColor` (bramka `hardcoded-colors` nie dopuszcza hexa).

## What We're NOT Doing

- Nota przy każdej karcie kolizji zostaje (decyzja autorki, `frame.md`); FR-007 bez zmian.
- Treść karty pytania bez zmian, także „Pozostałe leki” i lista przyjmowanych leków — pytanie mówi o lekach z czasu objawu, nie o bieżących.
- Karty pytań zostają ze znacznikiem przeglądarki — zmiana dotknęłaby dziennika.
- Bez scalania objawów o tym samym bloku zdarzeń (PRD pyt. 7: sugerowałoby wspólną przyczynę).
- Bez paginacji i bez spisu z odnośnikami.
- Bez zapamiętywania stanu zwinięcia (po odświeżeniu sekcja znów rozwinięta).
- Bez zwijania pojedynczych kart kolizji i bez liczby w tytule bez noty obok.
- Szukanie objawu z konkretnego dnia — `## Parked` roadmapy („Dziennik”).
- Kolejność leków nigdy według kolizji (FR-012).

## Implementation Approach

Logika najpierw, jako czysta funkcja w `visit-summary.ts` z testem (nadaje się na `/10x-tdd`), potem ekran, potem test E2E na ryzyku „przy wielu danych nota i lista leków nie giną”. Zmiana PRD w fazie 1, przed jakimkolwiek kodem ekranu — roadmapa wymaga jawnej zmiany FR-011 przed implementacją.

## Critical Implementation Details

- **Nota przy zwiniętej sekcji**: nota musi być widoczna razem z tytułem zawierającym liczbę, także po zwinięciu (granica z roadmapy: nota nigdy pod zwinięciem obok informacji o kolizji). Leży więc w `<summary>` pod tytułem, nie w treści `<details>`. Liczba bez noty obok to złamanie tej granicy.
- **Wstawianie nazw w szablon**: nazwa leku wpisana przez użytkowniczkę może zawierać `$&` albo `{…}`; wiersz listy i tytuł z liczbą budowane jednym przebiegiem (jak `fill`), nie łańcuchem `.replace`.

## Faza 1: PRD i dane listy bieżących leków

### Overview

Jawna zmiana FR-011, funkcja wyznaczająca listę bieżących leków z testami, nowe teksty i podpięcie w `loadVisitSummary`. Ekran jeszcze bez zmian.

### Changes Required:

#### 1. PRD

**File**: `context/foundation/prd.md`

**Intent**: FR-011 dostaje listę bieżących leków z dawkami — sekcja przestaje tylko zbierać gotowe treści. Zapis jawny, z datą i odwołaniem do odłożenia w pyt. 7.

**Contract**: Linia FR-011 (`:161`): dopisane zdanie o liście bieżących leków (nazwa, moc i postać, od kiedy bieżąca dawka, dawka; alfabetycznie, nigdy według kolizji) oraz o zwijaniu pytań poza najnowszym i sekcji interakcji z notą zawsze widoczną przy tytule. Adnotacja „rozszerzone 16.10.2026, S-05 (#108); wcześniej odłożone w pyt. 7”. Wypisane granice nienaruszone: niczego nie liczy od nowa, jedno aktualne pytanie na objaw, pusty stan nie brzmi jak potwierdzenie bezpieczeństwa, FR-007 i FR-010 bez zmian.

#### 2. Funkcja listy i tekst wiersza

**File**: `src/lib/services/visit-summary.ts`

**Intent**: Wyznacza bieżące leki z tych samych danych, z których powstają pytania, i układa ich wiersze. Bez `@/` importów, żeby test ładował plik bezpośrednio.

**Contract**:

- `currentMedications(medications: DoctorQuestionMedication[], today: string): VisitCurrentMedication[]` — tylko leki z `isCurrentMedication(discontinuedOn, today)`; bieżąca dawka = okres o najpóźniejszym `startedOn`; lek bez okresu pominięty; kolejność: nazwa (`localeCompare(…, "pl")`), potem `since`; wynik niezależny od kolejności tablic wejściowych.
- `VisitCurrentMedication { name: string; since: string /* ISO */; doseText: string; strength: string | null; pharmaceuticalForm: string | null }`.
- `currentMedicationText(item: VisitCurrentMedication): string` — szablon z wariantem, gdy `variantText` niepusty, inaczej bez nawiasu; data przez `formatIsoDate`; wstawianie jednym przebiegiem.
- `fill` z `doctor-question.ts` eksportowane i użyte tutaj (zamiast kopii).

#### 3. Typy

**File**: `src/types.ts`

**Intent**: `VisitSummary` niesie listę bieżących leków.

**Contract**: `VisitSummary.currentMedications: VisitCurrentMedication[]` (typ przeniesiony do `src/types.ts` albo zaimportowany z serwisu — jak `DoctorQuestion`).

#### 4. Dane

**File**: `src/lib/services/visit-summary-data.ts`

**Intent**: `loadVisitSummary` zwraca listę z już wczytanych leków i już policzonego `today`.

**Contract**: pole `currentMedications: currentMedications(medications, today)`; bez nowego zapytania.

#### 5. Teksty

**File**: `src/lib/copy/visit-summary.ts`

**Intent**: Nowe stringi listy i tytułu z liczbą; przechodzą filtr FR-012 bez wyjątku. Brzmienie zatwierdza autorka.

**Contract** (brzmienie robocze):

- `currentMedicationsHeading: "Bieżące leki"`
- `currentMedicationItem: "{lek} — od {data}, {ilość}"`
- `currentMedicationItemWithVariant: "{lek} ({wariant}) — od {data}, {ilość}"`
- `currentMedicationsEmpty: "Na liście nie ma bieżących leków."`
- `interactionsHeadingCount: "Możliwe interakcje ({liczba})"`

Bez rdzenia `dawk` (filtr) — dawka przez znacznik `{ilość}`, jak w `DOCTOR_QUESTION_COPY`.

#### 6. Testy jednostkowe

**File**: `scripts/visit-summary/visit-summary.test.mjs`

**Intent**: Oczekiwane wartości z decyzji planu, nie z kodu.

**Contract**: przypadki — lek z `discontinuedOn` = dziś nie jest bieżący, jutro jest; lek bez daty odstawienia jest; po zmianie dawki wiersz ma nową dawkę i datę zmiany; kolejność alfabetyczna po polsku („Łaxil” po „Lamisil”, przed „Metformax”); odwrócona kolejność wejścia daje ten sam wynik; lek bez okresu pominięty; wiersz bez mocy i postaci nie ma nawiasu; wiersz z samą mocą ma tylko moc; nazwa z `$&` i `{data}` wstawiona dosłownie; pusta lista leków daje pustą listę.

### Success Criteria:

#### Automated Verification:

- Testy jednostkowe listy bieżących leków przechodzą: `npm test`
- Filtr FR-012 przyjmuje nowe teksty: `npm test` (`scripts/fr012/visit-summary-copy.test.mjs`)
- Typy przechodzą: `npm run typecheck`
- Lint przechodzi: `npm run lint`

#### Manual Verification:

- Autorka zatwierdza brzmienie nowych tekstów w `src/lib/copy/visit-summary.ts`
- Autorka zatwierdza zmianę FR-011 w PRD

**Implementation Note**: Po zielonych bramkach automatycznych pauza na potwierdzenie autorki przed fazą 2.

---

## Faza 2: Ekran „Wizyta”

### Overview

Nowa sekcja listy na górze, zwijana sekcja interakcji z liczbą i notą przy tytule, pytania zwinięte poza najnowszym.

### Changes Required:

#### 1. Ekran

**File**: `src/pages/wizyta.astro`

**Intent**: Kolejność sekcji: bieżące leki → możliwe interakcje → pytania do lekarza. Tylko układ; ekran niczego nie liczy.

**Contract**:

- Sekcja `data-visit-current-medications` z nagłówkiem `currentMedicationsHeading`; lista `currentMedicationText(item)`; przy pustej liście `currentMedicationsEmpty` i odnośnik „Dodaj lek” (`/leki/nowy`). Widoczna zawsze poza stanem wprowadzenia (`showIntro`) i błędu.
- Sekcja `data-visit-interactions`: przy `interactions.length > 0` — `<details open>`; `<summary>` (cały wiersz klikalny, min. 44 px wysokości) zawiera `h2` z `interactionsHeadingCount` (N = `interactions.length`), chevron SVG w `currentColor` obracany przy `open` (`group-open:` / `[open]`), a pod tytułem `INTERACTION_COPY.note`. W treści `<details>`: karty bez zmian oraz `rulesIncomplete` i `noWarningIsNotSafe`. Przy braku par: nagłówek bez liczby i pusty stan jak dziś.
- Pytania: `open` tylko dla pierwszego elementu `questionTexts` (najnowszy objaw — kolejność już z `composeVisitQuestions`).
- Komentarz na górze pliku zaktualizowany (S-05, kolejność sekcji, nota przy tytule).

#### 2. Galeria trybu ciemnego

**File**: `tests/e2e/dark-gallery.spec.ts`

**Intent**: Zrzut ekranu także dla zwiniętej sekcji interakcji, żeby nota przy tytule i chevron były sprawdzane w obu trybach.

**Contract**: nowy wpis `{ page: "wizyta", state: "interactions-collapsed", … }` z `prepare` klikającym tytuł sekcji (`getByText` / `getByRole` na tytule z liczbą).

#### 3. Smoke

**File**: `scripts/smoke.mjs`

**Intent**: Smoke dowodzi, że lista bieżących leków zawiera lek konta smoke i nie zawiera nazwy w URL.

**Contract**: krok „visit summary: current medications list shows the smoke medication” — wycinek sekcji `data-visit-current-medications`, wymagany `fixtures.a.medication.product_name`; krok musi odróżnić brak sekcji od braku leku (lekcja „Bramka musi odróżnić blokadę od niewykonania”).

### Success Criteria:

#### Automated Verification:

- Typy przechodzą: `npm run typecheck`
- Lint przechodzi: `npm run lint`
- Testy jednostkowe i bramki tokenów przechodzą: `npm test`
- Build przechodzi: `npm run build`
- Smoke przeciw lokalnemu Supabase przechodzi, z nowym krokiem listy leków: `npm run smoke`
- Galeria trybu ciemnego przechodzi z nowym stanem: `npx playwright test tests/e2e/dark-gallery.spec.ts`

#### Manual Verification:

- Przy 320, 360 i 375 px, w trybie jasnym i ciemnym: lista leków czytelna, tytuł interakcji z liczbą i nota widoczne przy zwiniętej sekcji, treść nie chowa się pod przyklejonym menu
- Klawiatura: Tab dochodzi do tytułu interakcji i pytań, Enter/spacja zwija i rozwija
- Przy 6 parach i 10 objawach ekran po wejściu: lista leków, rozwinięte interakcje, jedno rozwinięte pytanie, reszta jednolinijkowa
- Przy koncie bez bieżących leków: tekst listy i odnośnik „Dodaj lek”; pusty stan interakcji jak dotąd
- Dziennik: karta pytania po zapisaniu objawu wygląda jak przed zmianą
- LCP `/wizyta` ≤ 2,5 s (Lighthouse Mobile) na koncie z wieloma lekami i objawami

**Implementation Note**: Po zielonych bramkach automatycznych pauza na ręczne sprawdzenie autorki przed fazą 3.

---

## Faza 3: Test E2E — wiele leków i objawów

### Overview

Test przeglądarkowy ryzyka z roadmapy: przy wielu danych nota i lista bieżących leków są widoczne, a ekran nie rozwija wszystkiego. Prowadzony przez `/10x-e2e`.

### Changes Required:

#### 1. Test

**File**: `tests/e2e/visit-readable.spec.ts`

**Intent**: Na koncie z co najmniej 3 bieżącymi lekami (w tym parą kolizji) i co najmniej 4 objawami: lista bieżących leków widoczna z każdym lekiem; tytuł „Możliwe interakcje (N)” i nota widoczne; po zwinięciu sekcji tytuł z liczbą i nota dalej widoczne, karty nie; tylko pierwsze pytanie rozwinięte. Dane unikalne na test i sprzątane po nim; bieg wyłącznie przeciw lokalnemu Supabase.

**Contract**: selektory przez role i tekst z `src/lib/copy/*`; bez `waitForTimeout`; żadnej nazwy leku ani objawu w URL.

### Success Criteria:

#### Automated Verification:

- Test przechodzi: `npx playwright test tests/e2e/visit-readable.spec.ts`
- Test pada, gdy nota zostanie przeniesiona do treści zwijanej sekcji (sprawdzenie w trakcie `/10x-e2e`, zmiana cofnięta)
- Pełny zestaw E2E przechodzi: `npx playwright test`

#### Manual Verification:

- Autorka przegląda test i potwierdza, że sprawdza zachowanie z „Desired End State”

---

## Testing Strategy

### Unit Tests:

- `currentMedications` i `currentMedicationText` — przypadki z fazy 1, pkt 6.
- Filtr FR-012 na nowych tekstach (automatycznie, cały moduł copy).

### Integration Tests:

- Smoke: sekcja listy leków z lekiem konta smoke; istniejący krok pytań bez zmian.
- E2E: `visit-readable.spec.ts`; galeria trybu ciemnego z nowym stanem.

### Manual Testing Steps:

1. Konto lokalne z 6 parami i 10 objawami, `/wizyta` przy 375 px: lista leków na górze, interakcje rozwinięte, jedno pytanie rozwinięte.
2. Zwinąć interakcje: zostaje „Możliwe interakcje (6)” i nota.
3. Powtórzyć przy 320 i 360 px oraz w trybie ciemnym.
4. Zapisać objaw w dzienniku: pytanie po zapisie bez zmian.
5. Lighthouse Mobile na `/wizyta`.

## Performance Considerations

Bez nowego zapytania; zwinięte `<details>` nie zmienia ilości HTML. Próg LCP z PRD (≤ 2,5 s) obowiązuje ten ekran — pomiar w fazie 2.

## Migration Notes

Brak migracji.

## References

- Frame: `context/changes/visit-readable-with-current-meds/frame.md`
- Roadmapa S-05: `context/foundation/roadmap.md` (`### S-05`)
- PRD: `context/foundation/prd.md:144` (FR-007), `:161` (FR-011), `:245` (pyt. 7)
- Ekran: `src/pages/wizyta.astro`
- Karta pytania: `src/components/journal/DoctorQuestionCard.astro`
- Logika: `src/lib/services/visit-summary.ts`, `src/lib/services/doctor-question.ts`
- Dane: `src/lib/services/visit-summary-data.ts`, `src/lib/services/doctor-question-data.ts:89-118`
- Poprzedni plan sekcji: `context/archive/2026-10-08-doctor-visit-summary/plan.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: PRD i dane listy bieżących leków

#### Automated

- [x] 1.1 Testy jednostkowe listy bieżących leków przechodzą: `npm test` — 61dcb33
- [x] 1.2 Filtr FR-012 przyjmuje nowe teksty: `npm test` (`scripts/fr012/visit-summary-copy.test.mjs`) — 61dcb33
- [x] 1.3 Typy przechodzą: `npm run typecheck` — 61dcb33
- [x] 1.4 Lint przechodzi: `npm run lint` — 61dcb33

#### Manual

- [x] 1.5 Autorka zatwierdza brzmienie nowych tekstów w `src/lib/copy/visit-summary.ts` — 61dcb33
- [x] 1.6 Autorka zatwierdza zmianę FR-011 w PRD — 61dcb33

### Phase 2: Ekran „Wizyta”

#### Automated

- [x] 2.1 Typy przechodzą: `npm run typecheck` — d2b74b5
- [x] 2.2 Lint przechodzi: `npm run lint` — d2b74b5
- [x] 2.3 Testy jednostkowe i bramki tokenów przechodzą: `npm test` — d2b74b5
- [x] 2.4 Build przechodzi: `npm run build` — d2b74b5
- [x] 2.5 Smoke przeciw lokalnemu Supabase przechodzi, z nowym krokiem listy leków: `npm run smoke` — d2b74b5
- [x] 2.6 Galeria trybu ciemnego przechodzi z nowym stanem: `npx playwright test tests/e2e/dark-gallery.spec.ts` — d2b74b5

#### Manual

- [x] 2.7 Przy 320, 360 i 375 px, w trybie jasnym i ciemnym: lista leków czytelna, tytuł interakcji z liczbą i nota widoczne przy zwiniętej sekcji, treść nie chowa się pod przyklejonym menu — d2b74b5
- [x] 2.8 Klawiatura: Tab dochodzi do tytułu interakcji i pytań, Enter/spacja zwija i rozwija — d2b74b5
- [x] 2.9 Przy 6 parach i 10 objawach ekran po wejściu: lista leków, rozwinięte interakcje, jedno rozwinięte pytanie, reszta jednolinijkowa — d2b74b5
- [x] 2.10 Przy koncie bez bieżących leków: tekst listy i odnośnik „Dodaj lek”; pusty stan interakcji jak dotąd — d2b74b5
- [x] 2.11 Dziennik: karta pytania po zapisaniu objawu wygląda jak przed zmianą — d2b74b5
- [x] 2.12 LCP `/wizyta` ≤ 2,5 s (Lighthouse Mobile) na koncie z wieloma lekami i objawami — d2b74b5

### Phase 3: Test E2E — wiele leków i objawów

#### Automated

- [x] 3.1 Test przechodzi: `npx playwright test tests/e2e/visit-readable.spec.ts`
- [x] 3.2 Test pada, gdy nota zostanie przeniesiona do treści zwijanej sekcji (sprawdzenie w trakcie `/10x-e2e`, zmiana cofnięta)
- [x] 3.3 Pełny zestaw E2E przechodzi: `npx playwright test`

#### Manual

- [x] 3.4 Autorka przegląda test i potwierdza, że sprawdza zachowanie z „Desired End State”
