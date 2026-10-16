# Nasilenie przy samym objawie — plan wdrożenia

## Overview

Na telefonie przyciski nasilenia stoją w bloku „Wybrane objawy” nad wyszukiwarką i listą 34 objawów, więc po zaznaczeniu objawu z końca listy są ok. 2 tys. px wyżej, poza ekranem. Plan przenosi nasilenie pod zaznaczony objaw, zamienia górny blok na podsumowanie na dole (przed zapisem), zwija kategorie objawów chevronem i przypina zaznaczone objawy na początku wyników wyszukiwania. Roadmapa: S-06 (#109), MS-06, FR-008. Zmiana prowadzona przez `/10x-ui`; zarzuty w `research.md` → `## Charges`.

## Current State Analysis

- Jeden komponent `src/components/journal/SymptomPicker.tsx` na dwóch ekranach: `/dzienniczek/nowy` (`NewEntryForm.tsx:123-129`) i poprawa wpisu `/dzienniczek/[id]` (`EditEntryForm.tsx:214-220`). Gospodarze trzymają `selected: SelectedSymptom[]` (kolejność = kolejność zaznaczania) i przekazują `onToggle` / `onSeverityChange` — ten kontrakt zostaje.
- Kolejność w JSX: blok „Wybrane objawy” z przyciskami nasilenia (`SymptomPicker.tsx:105-143`) → wyszukiwarka (`:145-164`) → lista zgrupowana albo wyniki (`:166-189`) → podpowiedź (`:191`).
- Wyszukiwanie: `filterSymptoms` (`src/lib/services/journal.ts:31-53`) daje płaską listę alfabetyczną; zaznaczony objaw, który nie pasuje, znika z widoku. Dlatego impl-review F5 pierwszej wersji dzienniczka przeniósł przyciski do górnego bloku (`context/archive/2026-10-05-symptom-journal-entry/reviews/impl-review.md:105-113`).
- Grupowanie: `groupSymptomsByCategory` (`journal.ts:69-82`), 8 kategorii, kolejność z `SYMPTOM_CATEGORIES` (`src/types.ts:239-253`).
- Notatka w obu gospodarzach używa klucza `copy.severityOptional` (`NewEntryForm.tsx:133`, `EditEntryForm.tsx:153`) — zarzut C4.
- Dwa testy E2E zaznaczają objaw prosto z listy: `tests/e2e/visit-readable.spec.ts:59`, `tests/e2e/dark-gallery.spec.ts:390`. Przy zwiniętych grupach pole wyboru jest schowane i oba padną.
- Nasilenie na liście wpisów: „· silne” (`src/pages/dzienniczek/index.astro:230`) — bez zmian.
- Brak komponentu zwijania w `src/components/ui/` (button, input, label, card, badge). `/wizyta` zwija przez `<details>` w `.astro`; w React potrzebny jest stan, bo wyszukiwanie przełącza widok.

## Desired End State

Formularz wpisu (nowy i poprawa), od góry:

1. **Wyszukiwarka** jak dziś.
2. **Lista objawów** (pusta wyszukiwarka): 8 nagłówków kategorii, na start **zwinięte**. Nagłówek to przycisk z chevronem; przy nagłówku licznik zaznaczonych w tej grupie („1 wybrany”, „2 wybrane”, „5 wybranych”), brak licznika przy zerze. Zaznaczony objaw ma pod sobą, w tym samym obramowaniu, podpis „Nasilenie (opcjonalne)” i trzy przyciski (łagodne / umiarkowane / silne; drugie dotknięcie czyści).
3. **Wyniki wyszukiwania** (niepusta wyszukiwarka): płaska lista. Zaznaczone objawy, które nie pasują do tekstu, stoją na początku pod napisem „Zaznaczone”, z przyciskami nasilenia; pod nimi „Pasujące objawy”. Zaznaczony objaw, który pasuje, stoi na swoim miejscu alfabetycznym (bez duplikatu).
4. **Podsumowanie „Wybrane objawy”** na końcu wyboru, tuż przed notatką: nazwa · nasilenie (gdy wybrane) i przycisk usunięcia; pusty stan „Nie wybrano jeszcze żadnego objawu.”. Bez przycisków nasilenia.

Szkic zatwierdzony przez autorkę: https://claude.ai/artifact/L5jhQNDmyiGkNTUUEox8Ex (wersja 3, telefon A).

Weryfikacja: testy jednostkowe pomocników, filtr FR-012 na nowych tekstach, dwa poprawione testy E2E, nowy test E2E w widoku telefonu, galeria trybu ciemnego ze stanem „zaznaczony objaw”, ręczne sprawdzenie 390 px i 1280 px w obu trybach.

### Key Discoveries:

- Nasilenie musi zostać **poza** `<label>` pola wyboru — inaczej zmieni się dostępna nazwa pola i padną selektory `getByRole("checkbox", { name, exact: true })`.
- Schowana treść grupy (`hidden`) nie jest dostępna dla Playwright `check()` — testy zaznaczają objaw przez wyszukiwarkę, co nie zależy od stanu zwinięcia.
- `scripts/fr012/journal-copy.test.mjs` sprawdza teksty `JOURNAL_COPY` — nowe teksty przechodzą przez filtr bez dodatkowej pracy.
- `journal.ts` jest importowany przez `scripts/**` — bez `reportError` w tym module (`CLAUDE.md`, „Błędy serwera”).
- `lucide-react` jest dostępny w React (`SymptomPicker.tsx:2` już importuje `X`).

## What We're NOT Doing

- Baza, API, `SelectedSymptom`, FR-008 bez zmian; nasilenie dalej opcjonalne.
- Bez kresek / kolorów nasilenia (▮▯▯, sygnalizacja świetlna) — decyzja autorki: ewentualnie osobna pozycja w roadmapie, bo dotyka listy wpisów i „Wizyty”.
- Bez zapamiętywania stanu zwinięcia grup (po odświeżeniu znów zwinięte).
- Bez różnego stanu startowego na telefonie i komputerze — zwinięte wszędzie.
- Komunikat „Wybierz co najmniej jeden objaw.” zostaje na górze formularza (`ServerError`) — wspólny wzorzec błędów formularzy, nie ten widok.
- Bez nowego projektu „telefon” w `playwright.config.ts` — szerokość ustawia sam test.
- Bez placeholdera przed hydratacją wyspy — osobny temat (lista objawów i tak renderuje się serwerowo).

## Implementation Approach

Logika najpierw jako czyste funkcje w `journal.ts` z testami (faza 1, nadaje się na `/10x-tdd`). Potem przebudowa widoku z poprawką C4 i naprawą dwóch istniejących testów E2E (faza 2). Na końcu stany, bramka wizualna, test E2E na telefonie i reguła dla następnego agenta (faza 3). Kolejność `/10x-ui`: środowisko/biblioteki i tokeny nie wymagają zmian (bez nowych zależności i kolorów), więc pierwsza faza wizualna to od razu widok.

## Critical Implementation Details

- **Przypięte w wyszukiwaniu**: kolejność przypiętych = kolejność zaznaczania (`selected`), nie alfabet — tak, by objaw zaznaczony przed chwilą nie przeskakiwał. Objaw pasujący do tekstu nie trafia do przypiętych (jeden komplet przycisków na objaw, jedna dostępna nazwa grupy „Nasilenie: <objaw>”).
- **Stan zwinięcia** żyje w `SymptomPicker` i przetrwa wpisanie i wyczyszczenie wyszukiwarki (po wyczyszczeniu grupy wracają do stanu sprzed wyszukiwania).

## Faza 1: Logika wyszukiwania i licznika

### Overview

Dwie czyste funkcje w `src/lib/services/journal.ts` z testami jednostkowymi. Widok jeszcze ich nie używa.

### Changes Required:

#### 1. Wyniki wyszukiwania z przypiętymi zaznaczonymi

**File**: `src/lib/services/journal.ts`

**Intent**: Gwarancja F5 (nasilenie osiągalne podczas wyszukiwania) bez górnego bloku: zaznaczone objawy, których tekst nie znajduje, stoją na początku wyników.

**Contract**: nowa funkcja `searchSymptoms(catalog, terms, query, selectedIds: readonly string[])` → `null` przy pustym zapytaniu (jak `filterSymptoms`), inaczej `{ pinned: T[]; matches: T[] }`. `matches` = wynik `filterSymptoms` bez zmian. `pinned` = zaznaczone spoza `matches`, w kolejności `selectedIds`; id spoza katalogu pomijane. `filterSymptoms` zostaje (używany dalej i testowany).

#### 2. Licznik wybranych w grupie

**File**: `src/lib/services/journal.ts`, `src/lib/copy/journal.ts`

**Intent**: Tekst licznika przy nagłówku kategorii w poprawnej polskiej odmianie.

**Contract**: `selectedCountLabel(count: number): string | null` — `0` → `null`; `1` → „1 wybrany”; końcówka 2–4 poza 12–14 → „N wybrane”; pozostałe → „N wybranych”. Formy tekstu w `JOURNAL_COPY.form` (np. `selectedCountOne/Few/Many` z `{n}`), nie w kodzie funkcji.

#### 3. Testy jednostkowe

**File**: `scripts/journal/journal.test.mjs`

**Intent**: Oczekiwane wartości z decyzji planu, nie z kodu.

**Contract**: przypadki `searchSymptoms`: puste zapytanie → `null`; zaznaczony niepasujący → w `pinned`; zaznaczony pasujący → tylko w `matches`; kolejność `pinned` = kolejność zaznaczenia (nie alfabet); nieznane id pominięte; bez zaznaczonych → `pinned: []`. `selectedCountLabel`: 0, 1, 2, 4, 5, 11, 12, 14, 21, 22, 25.

### Success Criteria:

#### Automated Verification:

- Testy jednostkowe przechodzą: `npm test`
- Typy: `npm run typecheck`
- Lint: `npm run lint`

#### Manual Verification:

- Autorka czyta listę przypadków testowych i potwierdza, że oddają zachowanie ze szkicu (przypięte, odmiana licznika)

**Implementation Note**: Po zielonych bramkach automatycznych zatrzymaj się na ręczne potwierdzenie autorki przed fazą 2.

---

## Faza 2: Widok wyboru objawów

### Overview

Przebudowa `SymptomPicker` do zatwierdzonego układu, poprawka C4, naprawa dwóch istniejących testów E2E.

### Changes Required:

#### 1. Komponent

**File**: `src/components/journal/SymptomPicker.tsx`

**Intent**: Nasilenie przy palcu (C1), lista nie skacze po zaznaczeniu (C2), jedno miejsce wyboru nasilenia zamiast dwóch (C3).

**Contract**:

- Props bez zmian (`symptoms`, `terms`, `selected`, `onToggle`, `onSeverityChange`).
- Wiersz objawu: `<label>` z polem wyboru i nazwą bez zmian; pod nim, w tym samym `<li>` i obramowaniu, ale **poza** `<label>`, grupa nasilenia (`role="group"`, `aria-label` „Nasilenie: <objaw>”, `aria-pressed`) — tylko gdy objaw zaznaczony.
- Nagłówek kategorii: `Button` (wariant ghost lub własne klasy tokenowe) z `aria-expanded` i `aria-controls`, ikona `ChevronRight` z `lucide-react` obracana przy rozwinięciu (`motion-reduce` bez animacji), licznik przez `Badge` + `selectedCountLabel`. Lista grupy z atrybutem `hidden`, gdy zwinięta. Stan startowy: wszystkie zwinięte.
- Wyszukiwanie przez `searchSymptoms`: sekcja „Zaznaczone” (gdy `pinned` niepuste), potem „Pasujące objawy”; `noMatch` gdy oba puste.
- Podsumowanie „Wybrane objawy” na końcu `fieldset` (po `notFoundHint`): `section` z nagłówkiem, lista „nazwa · nasilenie” i przycisk usunięcia z `sr-only` „Usuń z wpisu: <objaw>”; pusty stan `noneSelected`. Bez przycisków nasilenia.
- Tylko tokeny i komponenty z `src/components/ui/`; `cn()` do łączenia klas; komentarz nad grupą nasilenia opisuje nowy powód położenia (F5 trzymane przez przypięcie w wyszukiwaniu).

#### 2. Teksty

**File**: `src/lib/copy/journal.ts`

**Intent**: Nowe napisy i osobny klucz „(opcjonalne)” dla notatki (C4).

**Contract**: w `JOURNAL_COPY.form`: `pinnedHeading` („Zaznaczone”), formy licznika z fazy 1, `noteOptional` („(opcjonalne)”). `resultsLabel` („Pasujące objawy”) staje się widocznym nagłówkiem wyników.

#### 3. Gospodarze — poprawka C4

**File**: `src/components/journal/NewEntryForm.tsx`, `src/components/journal/EditEntryForm.tsx`

**Intent**: Podpis notatki niezależny od tekstu nasilenia; tekst na ekranie bez zmian.

**Contract**: etykieta notatki używa `noteOptional` zamiast `severityOptional`.

#### 4. Wspólny krok E2E: zaznacz objaw

**File**: `tests/e2e/journal-helpers.ts` (nowy), `tests/e2e/visit-readable.spec.ts`, `tests/e2e/dark-gallery.spec.ts`

**Intent**: Testy zaznaczają objaw w sposób niezależny od zwinięcia grup.

**Contract**: `pickSymptom(page, name)` — wpisuje nazwę w pole „Szukaj objawu”, zaznacza `getByRole("checkbox", { name, exact: true })`, czyści wyszukiwarkę. Wywołania w `visit-readable.spec.ts:59` i `dark-gallery.spec.ts:390` zamienione na `pickSymptom`. Plik bez `.spec` w nazwie, więc Playwright go nie uruchamia.

### Success Criteria:

#### Automated Verification:

- Testy jednostkowe i filtr FR-012: `npm test`
- Typy: `npm run typecheck`
- Lint: `npm run lint`
- Build: `npm run build`
- Skan wartości wpisanych na sztywno na plikach widoku: 0 trafień (`SymptomPicker.tsx`, `NewEntryForm.tsx`, `EditEntryForm.tsx`)
- Istniejące testy E2E przechodzą przeciw lokalnemu Supabase: `npx playwright test visit-readable`

#### Manual Verification:

- Zrzut 390 px i 1280 px, oba tryby: grupy zwinięte, liczniki, nasilenie pod zaznaczonym objawem, podsumowanie na dole
- Na 390 px: rozwinięcie „pozostałe”, zaznaczenie „spadek libido” — przyciski widoczne bez przewijania; lista nad palcem nie przesuwa się
- Wyszukiwanie „kasz” przy zaznaczonym „bólu głowy”: „Ból głowy” z przyciskami pod „Zaznaczone”, „Kaszel” pod „Pasujące objawy”
- Poprawa istniejącego wpisu (`/dzienniczek/[id]`): liczniki pokazują zapisane objawy, zmiana nasilenia i zapis działają
- Obsługa klawiaturą: Tab po nagłówkach grup, Enter/Spacja rozwija, widoczny pierścień fokusu

**Implementation Note**: Po zielonych bramkach automatycznych zatrzymaj się na ręczne potwierdzenie autorki przed fazą 3.

---

## Faza 3: Stany, bramka wizualna i test na telefonie

### Overview

Matryca 7 stanów, zrzut nowego stanu w galerii, test E2E ryzyka „nasilenie poza ekranem na telefonie”, reguła w `CLAUDE.md`, statusy zarzutów.

### Changes Required:

#### 1. Test E2E w widoku telefonu

**File**: `tests/e2e/severity-on-phone.spec.ts` (nowy)

**Intent**: Pilnuje ryzyka S-06: po zaznaczeniu ostatniego objawu nasilenie jest w zasięgu bez przewijania i zapisuje się.

**Contract**: `test.use({ viewport: { width: 390, height: 844 } })`. Świeże konto (rejestracja + logowanie przez API) i sprzątanie w `afterEach` jak w `visit-readable.spec.ts`. Kroki: `/dzienniczek/nowy` → czekaj na wyspy → rozwiń „pozostałe” (przycisk nagłówka) → zaznacz „spadek libido” → grupa „Nasilenie: spadek libido” `toBeInViewport()` bez przewijania → „silne” → podsumowanie pokazuje „silne” przy objawie → zapis → na `/dzienniczek` wpis z „spadek libido · silne”. Test musi paść na układzie sprzed fazy 2 (sprawdzone raz, wynik w opisie commita).

#### 2. Galeria trybu ciemnego

**File**: `tests/e2e/dark-gallery.spec.ts`

**Intent**: Bramka wizualna widoku: stan z zaznaczonym objawem i nasileniem, telefon i komputer, oba tryby.

**Contract**: nowy wpis `{ page: "dzienniczek/nowy", state: "with-selected", prepare }` — rozwija jedną grupę, zaznacza objaw z nasileniem, drugi objaw bez nasilenia. Bez `toHaveScreenshot` (repo nie ma bazowych zrzutów; nie dodajemy).

#### 3. Reguła dla następnego agenta

**File**: `CLAUDE.md`, sekcja „Konwencje kodu”

**Intent**: Następny agent nie wróci do górnego bloku ani nie zepsuje testów selektorem z listy.

**Contract**: krótki wpis: zwijanie w React — `Button` z `aria-expanded` + `hidden`, w `.astro` — `<details>`; nasilenie objawu zawsze pod zaznaczonym objawem, poza `<label>`, a gwarancję F5 trzyma przypięcie w `searchSymptoms`; w E2E objaw zaznaczaj przez `pickSymptom` z `tests/e2e/journal-helpers.ts`.

#### 4. Zarzuty

**File**: `context/changes/severity-next-to-symptom/research.md`, sekcja `## Charges`

**Intent**: Każdy zarzut ma status.

**Contract**: C1, C2, C3 — rozwiązane w fazie 2; C4 — rozwiązany w fazie 2 (klucz notatki; podpis „Nasilenie (opcjonalne)” przy każdym zaznaczonym objawie zostaje świadomie, bo stoi teraz przy objawie, nie w stosie kart).

### Success Criteria:

#### Automated Verification:

- Nowy test przechodzi: `npx playwright test severity-on-phone`
- Pełny zestaw E2E przechodzi przeciw lokalnemu Supabase: `npx playwright test`
- Galeria generuje stan `with-selected`: `DARK_GALLERY=1 npx playwright test dark-gallery`
- `npm test`, `npm run typecheck`, `npm run lint` zielone

#### Manual Verification:

- Matryca 7 stanów na zrzutach z galerii: default (tokeny i komponenty ui), hover (nagłówek grupy, przyciski), focus-visible (nagłówek, pole wyboru, przyciski nasilenia, usuń w podsumowaniu), disabled — N/A (brak takich kontrolek), error — bez zmian (`ServerError` na górze formularza), empty (`noneSelected`, `noMatch`), loading — bez skoku układu po hydratacji
- Test telefonu padł na układzie sprzed fazy 2 (adnotacja w commicie)
- Wpis w `CLAUDE.md` czytelny dla autorki

**Implementation Note**: Bieg E2E wyłącznie przeciw lokalnemu Supabase — przed biegiem zatrzymaj stary podgląd i odsuń `.env` (lessons: „Zatrzymaj stary podgląd…”, „Lokalne bramki sprawdź…”).

---

## Testing Strategy

### Unit Tests:

- `searchSymptoms`: przypięte vs pasujące, kolejność zaznaczania, nieznane id, puste zapytanie.
- `selectedCountLabel`: odmiana 1 / 2–4 / 5+ i wyjątki 12–14.

### Integration Tests:

- `severity-on-phone.spec.ts` — ryzyko S-06 w przeglądarce, 390 px.
- `visit-readable.spec.ts` po zmianie selektora — regresja zapisu wpisu.

### Manual Testing Steps:

1. 390 px, tryb jasny: rozwiń „pozostałe”, zaznacz „spadek libido”, wybierz „silne”, sprawdź podsumowanie, zapisz.
2. Zaznacz „ból głowy”, wpisz „kasz”: „Ból głowy” pod „Zaznaczone”, zmień nasilenie bez czyszczenia wyszukiwarki.
3. Zwiń grupę z zaznaczonym objawem: licznik zostaje, podsumowanie pokazuje objaw.
4. Poprawa wpisu: liczniki przy grupach, zapis zmiany nasilenia.
5. Te same kroki w trybie ciemnym i na 1280 px.

## Performance Considerations

Brak nowych zapytań; filtrowanie i przypinanie w przeglądarce na 34 objawach.

## Migration Notes

Nie dotyczy — bez migracji i zmian API.

## References

- Research i zarzuty: `context/changes/severity-next-to-symptom/research.md`
- Szkic zatwierdzony przez autorkę: https://claude.ai/artifact/L5jhQNDmyiGkNTUUEox8Ex
- F5 (powód górnego bloku): `context/archive/2026-10-05-symptom-journal-entry/reviews/impl-review.md:105-113`
- Wzorzec zwijania z licznikiem: `src/pages/wizyta.astro` (S-05)
- Wzorzec konta testowego E2E: `tests/e2e/visit-readable.spec.ts`
- Roadmapa: `context/foundation/roadmap.md` (S-06)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Logika wyszukiwania i licznika

#### Automated

- [x] 1.1 Testy jednostkowe przechodzą: `npm test` — 3a81264
- [x] 1.2 Typy: `npm run typecheck` — 3a81264
- [x] 1.3 Lint: `npm run lint` — 3a81264

#### Manual

- [x] 1.4 Autorka czyta listę przypadków testowych i potwierdza, że oddają zachowanie ze szkicu (przypięte, odmiana licznika) — 3a81264

### Phase 2: Widok wyboru objawów

#### Automated

- [x] 2.1 Testy jednostkowe i filtr FR-012: `npm test` — 210118e
- [x] 2.2 Typy: `npm run typecheck` — 210118e
- [x] 2.3 Lint: `npm run lint` — 210118e
- [x] 2.4 Build: `npm run build` — 210118e
- [x] 2.5 Skan wartości wpisanych na sztywno na plikach widoku: 0 trafień (`SymptomPicker.tsx`, `NewEntryForm.tsx`, `EditEntryForm.tsx`) — 210118e
- [x] 2.6 Istniejące testy E2E przechodzą przeciw lokalnemu Supabase: `npx playwright test visit-readable` — 210118e

#### Manual

- [x] 2.7 Zrzut 390 px i 1280 px, oba tryby: grupy zwinięte, liczniki, nasilenie pod zaznaczonym objawem, podsumowanie na dole — 210118e
- [x] 2.8 Na 390 px: rozwinięcie „pozostałe”, zaznaczenie „spadek libido” — przyciski widoczne bez przewijania; lista nad palcem nie przesuwa się — 210118e
- [x] 2.9 Wyszukiwanie „kasz” przy zaznaczonym „bólu głowy”: „Ból głowy” z przyciskami pod „Zaznaczone”, „Kaszel” pod „Pasujące objawy” — 210118e
- [x] 2.10 Poprawa istniejącego wpisu (`/dzienniczek/[id]`): liczniki pokazują zapisane objawy, zmiana nasilenia i zapis działają — 210118e
- [x] 2.11 Obsługa klawiaturą: Tab po nagłówkach grup, Enter/Spacja rozwija, widoczny pierścień fokusu — 210118e

### Phase 3: Stany, bramka wizualna i test na telefonie

#### Automated

- [x] 3.1 Nowy test przechodzi: `npx playwright test severity-on-phone` — a1f1a64
- [x] 3.2 Pełny zestaw E2E przechodzi przeciw lokalnemu Supabase: `npx playwright test` — a1f1a64
- [x] 3.3 Galeria generuje stan `with-selected`: `DARK_GALLERY=1 npx playwright test dark-gallery` — a1f1a64
- [x] 3.4 `npm test`, `npm run typecheck`, `npm run lint` zielone — a1f1a64

#### Manual

- [x] 3.5 Matryca 7 stanów na zrzutach z galerii: default (tokeny i komponenty ui), hover (nagłówek grupy, przyciski), focus-visible (nagłówek, pole wyboru, przyciski nasilenia, usuń w podsumowaniu), disabled — N/A (brak takich kontrolek), error — bez zmian (`ServerError` na górze formularza), empty (`noneSelected`, `noMatch`), loading — bez skoku układu po hydratacji — a1f1a64
- [x] 3.6 Test telefonu padł na układzie sprzed fazy 2 (adnotacja w commicie) — a1f1a64
- [x] 3.7 Wpis w `CLAUDE.md` czytelny dla autorki — a1f1a64
