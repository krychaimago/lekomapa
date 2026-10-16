# Zwarte kolizje w szczegółach leku — plan wdrożenia

## Overview

S-07 (#110, MS-04): szczegóły leku `/leki/[id]` mają być czytelne przy wielu możliwych kolizjach. Każda karta kolizji zwija się do nagłówka „z lekiem X” i noty, a opis widać po rozwinięciu. Tytuł sekcji podaje liczbę kolizji. FR-007 (nota przy każdej informacji o kolizji), FR-012 i ekran „Wizyta” zostają bez zmian.

## Current State Analysis

- Karty kolizji są wpisane bezpośrednio w `src/pages/leki/[id].astro:373-402`. Każda karta ma nagłówek „z lekiem {nazwa}” z linkiem do drugiego leku, opis pary i notę `INTERACTION_COPY.note`.
- Skala z `supabase/seed-data/interaction_pairs.csv`:
  - grupa M01AE (ibuprofen) ma 11 par, a kilka leków z jednej grupy daje kolejne karty,
  - opisy mają 144–322 znaki (mediana 240), czyli ok. 4 linijki na telefonie,
  - karta zajmuje dziś ok. 7 linijek.
- Kolejność jest alfabetyczna po nazwie drugiego leku, potem po opisie (`[id].astro:103-106`). Nie zależy od „wagi” (FR-012) i zostaje bez zmian.
- „Wizyta” (S-05) zwija całą sekcję przez `<details>` z chevronem, a notę pokazuje pod tytułem z liczbą (`src/pages/wizyta.astro:83-106`). Nota przy każdej karcie zostaje, bo S-05 świadomie nie zmieniło FR-007.
- Teksty o kolizjach są w `src/lib/copy/interactions.ts`. Moduł nie ma importów i ma same pola tekstowe, a `scripts/fr012/interaction-copy.test.mjs` przepuszcza każdy tekst przez filtr FR-012. Szablony mają znaczniki `{…}`, a wartości wstawia `fill` z `src/lib/services/doctor-question.ts:149`.

## Desired End State

Po wejściu na szczegóły leku z kolizjami:

- tytuł sekcji to „Możliwe interakcje (N)”,
- każda karta jest zwinięta i pokazuje „z lekiem X”, chevron oraz notę,
- kliknięcie nagłówka karty (albo Enter/Spacja na klawiaturze) pokazuje opis pary i link do drugiego leku,
- przy 11 kolizjach lista zajmuje ok. 2 linijki na kartę zamiast ok. 7,
- linijki „Lekomapa sprawdza tylko wybrane pary…” i „Brak oznaczenia nie znaczy…” zostają pod listą, widoczne bez rozwijania,
- pusty stan sekcji i „Wizyta” wyglądają jak dotąd.

Weryfikacja: test E2E z fazy 2 oraz ręczny przegląd w obu trybach przy 320 px i na dużym ekranie.

### Key Discoveries:

- Wzorzec zwijania w `.astro` to `<details>` + `<summary>` z ukrytym markerem i chevronem `group-open:rotate-180` (`src/pages/wizyta.astro:83-106`; CLAUDE.md, „Zwijanie i wybór objawów”).
- `VISIT_SUMMARY_COPY.interactionsHeadingCount` ma już brzmienie „Możliwe interakcje ({liczba})” (`src/lib/copy/visit-summary.ts:31`), ale należy do „Wizyty”. Szczegóły leku dostają własny klucz w `INTERACTION_COPY`, żeby nie wiązać ekranów.
- `tests/e2e/dark-gallery.spec.ts:167` robi zrzut szczegółów leku z kolizją do przeglądu ręcznego. Nie ma wzorców do porównania, więc zmiana układu niczego tam nie wywróci.
- `tests/e2e/visit-readable.spec.ts` to wzorzec testu z jednorazowym kontem: rejestracja i logowanie przez HTTP, leki z ulotki, sprzątanie przez trasę S-09 w `afterEach`.

## What We're NOT Doing

- Zmiana FR-007: nota zostaje przy każdej karcie, nie raz przy tytule.
- „Wizyta”: bez wspólnego komponentu i bez zmian w `src/pages/wizyta.astro` (decyzja planu, pytanie 4).
- Zwijanie całej sekcji kolizji: zwijają się karty, sekcja nie.
- Grupowanie par z identycznym opisem w jednej karcie.
- Próg liczby kolizji, poniżej którego karty są rozwinięte: wszystkie są zawsze zwinięte, także przy jednej kolizji.
- Przenoszenie sekcji kolizji wyżej na ekranie i zmiany w składzie, historii dawkowania, banerach.
- Zmiany kolejności kolizji i zmiany w danych, bazie, migracjach.

## Implementation Approach

Jedna zmiana znaczników w `src/pages/leki/[id].astro` i jeden nowy tekst w `src/lib/copy/interactions.ts`, potem test E2E ryzyka.

Każda karta (`<li>`) zawiera:

1. `<details>` bez `open`. W jego `<summary>` jest nagłówek „z lekiem X” jako tekst, bez linku, oraz chevron. Pod `<summary>` jest opis pary i link do drugiego leku.
2. Notę, poza `<details>`, żeby zwinięcie jej nie chowało.

Link wychodzi z nagłówka, bo element klikalny wewnątrz `<summary>` (który sam jest przyciskiem) jest dla czytnika ekranu i klawiatury niejednoznaczny.

## Critical Implementation Details

- **Nota poza `<details>`.** Nota musi być rodzeństwem `<details>` w `<li>`, nie jego dzieckiem. Postawienie jej pod `<summary>` wewnątrz `<details>` schowałoby ją po zwinięciu, a to łamie FR-007. Test z fazy 2 pilnuje tego wprost.
- **Brak linku w `<summary>`.** `<summary>` ma rolę przycisku. Zagnieżdżony `<a>` daje dwa cele kliknięcia w jednym wierszu, a czytnik ekranu odczytuje przycisk z linkiem w środku.

## Faza 1: Zwinięte karty kolizji

### Overview

Karty kolizji w szczegółach leku są zwinięte do nagłówka i noty, a tytuł sekcji podaje liczbę.

### Changes Required:

#### 1. Teksty o kolizjach

**File**: `src/lib/copy/interactions.ts`

**Intent**: Dodać tytuł sekcji z liczbą i tekst linku do drugiego leku w rozwiniętej karcie. Oba przechodzą przez filtr FR-012 w istniejącym teście kopii.

**Contract**: Nowe pola `INTERACTION_COPY.detailsHeadingCount: "Możliwe interakcje ({liczba})"` i `INTERACTION_COPY.openOtherMedication: "Przejdź do leku {nazwa}"`. Bez importów i funkcji, zgodnie z nagłówkiem modułu. `detailsHeading` zostaje bez zmian, bo używa go pusty stan i „Wizyta”.

#### 2. Karty kolizji w szczegółach leku

**File**: `src/pages/leki/[id].astro`

**Intent**: Zamienić każdą kartę na zwijaną, zawsze zwiniętą po wejściu. Nota zostaje widoczna przy każdej karcie, tytuł sekcji podaje liczbę kolizji. Kolejność, pusty stan i linijki pod listą bez zmian.

**Contract**:

- Tytuł `<h2>` sekcji z niepustą listą: `fill(INTERACTION_COPY.detailsHeadingCount, { liczba: interactions.length })`, `fill` z `@/lib/services/doctor-question`.
- Każde `<li data-other-medication-id={otherId}>` zawiera w tej kolejności:
  - `<details>` bez `open`. `<summary>` ma `min-h-11`, ukryty marker, focus ring (wzorzec z `wizyta.astro:84-88`), tekst nagłówka `withMedication` z nazwą drugiego leku jako zwykły tekst oraz chevron `aria-hidden`. Pod `<summary>` jest opis (`item.description`) i link `/leki/{otherId}` z tekstem `openOtherMedication`.
  - `<p>` z `INTERACTION_COPY.note` poza `<details>`.
- Kolory wyłącznie z tokenów `interaction*`, które karta już ma. Bez `dark:` i bez `destructive*`.
- Komentarz na górze pliku (linie 1-4) mówi, że karty są zwinięte, a nota zostaje widoczna przy każdej.
- Zmienne `withBefore`/`withAfter` przestają być potrzebne, jeśli nagłówek składa się przez `fill`. Usunąć je, gdy nie mają już użycia.

### Success Criteria:

#### Automated Verification:

- Testy jednostkowe i bramki kopii przechodzą (w tym filtr FR-012 dla nowych tekstów): `npm test`
- Typy przechodzą: `npm run typecheck`
- Lint przechodzi: `npm run lint`
- Build przechodzi: `npm run build`

#### Manual Verification:

- Lek z co najmniej trzema kolizjami: tytuł „Możliwe interakcje (N)”, wszystkie karty zwinięte, nota widoczna przy każdej, opisy schowane.
- Kliknięcie i klawiatura (Tab do nagłówka, Enter/Spacja) rozwijają kartę: widać opis i link „Przejdź do leku X”, link prowadzi do szczegółów drugiego leku.
- Przy 320 px nagłówek z długą nazwą leku zawija się, nie wychodzi poza kartę, a chevron zostaje na swoim miejscu.
- Tryb jasny i ciemny: karta, chevron i focus ring czytelne.
- Lek bez kolizji i lek zakończony: pusty stan jak dotąd. „Wizyta” wygląda jak przed zmianą.

**Implementation Note**: Po przejściu weryfikacji automatycznej zatrzymaj się na potwierdzenie ręcznego testu przez autorkę przed fazą 2.

---

## Faza 2: Test E2E — zwinięcie nie chowa noty

### Overview

Test w przeglądarce pilnuje ryzyka, którego nie widać w testach jednostkowych: zwinięcie karty nie może schować noty (FR-007), a rozwinięcie musi pokazać opis. Test działa w widoku telefonu, bo tam problem długości jest największy.

### Changes Required:

#### 1. Spec ryzyka

**File**: `tests/e2e/medication-interactions-compact.spec.ts`

**Intent**: Na jednorazowym koncie zapisać lek z ibuprofenem i trzy leki z substancjami w parze z M01AE. Sprawdzić na szczegółach leku z ibuprofenem stan zwinięty i rozwinięty karty.

**Contract**:

- Wzorzec `tests/e2e/visit-readable.spec.ts`:
  - `storageState` pusty,
  - konto rejestrowane i logowane przez HTTP,
  - leki z ulotki przez POST,
  - w URL wyłącznie identyfikatory,
  - sprzątanie przez trasę usunięcia konta w `afterEach`,
  - wyłącznie lokalne Supabase.
- Substancje: `ibuprofenum` oraz trzy kodowane nazwy ze słownika ulotki z grup sparowanych z M01AE w `interaction_pairs.csv` (np. `acenocoumarolum` z B01AA, jak w `visit-readable.spec.ts`; dwie pozostałe z różnych grup, sprawdzone w słowniku przy implementacji).
- Viewport telefonu (np. 360 × 740).
- Asercje biznesowe przez `getByRole`/`getByText` z tekstów `INTERACTION_COPY`:
  - nagłówek poziomu 2 równy `detailsHeadingCount` z liczbą 3,
  - 3 widoczne noty `INTERACTION_COPY.note`,
  - opisy par niewidoczne,
  - po kliknięciu jednego nagłówka widoczny opis tej pary i link do drugiego leku, nota tej karty dalej widoczna, pozostałe karty zwinięte.
- Weryfikacja ryzyka (zasada `/10x-e2e`): test musi paść po tymczasowym przeniesieniu noty do wnętrza `<details>`. Zmiana jest cofana przed commitem.

### Success Criteria:

#### Automated Verification:

- Nowy spec przechodzi przeciw lokalnemu Supabase: `npx playwright test tests/e2e/medication-interactions-compact.spec.ts`
- Spec pada, gdy nota jest tymczasowo wewnątrz `<details>`. Zmiana cofnięta, spec znów przechodzi.
- Pozostałe testy E2E przechodzą (w tym `visit-readable` i `dark-gallery`): `npx playwright test`
- Lint i typy przechodzą: `npm run lint`, `npm run typecheck`

#### Manual Verification:

- Przegląd zrzutów `dark-gallery` dla szczegółów leku z kolizją w obu trybach: karty zwinięte, nota widoczna.

---

## Testing Strategy

### Unit Tests:

- Nowe teksty w `INTERACTION_COPY` przechodzą istniejący `scripts/fr012/interaction-copy.test.mjs` bez zmian w teście. Moduł jest skanowany w całości.
- `scripts/pages/page-title.test.mjs` i `scripts/pages/url-params.test.mjs` bez zmian: tytuł strony i parametry adresu się nie zmieniają.

### Integration Tests:

- Faza 2: zwinięte karty z widoczną notą, rozwinięcie pokazuje opis i link, w widoku telefonu.

### Manual Testing Steps:

1. Dodaj lek z ibuprofenem i trzy leki sparowane z M01AE, otwórz szczegóły leku z ibuprofenem.
2. Sprawdź tytuł z liczbą, zwinięte karty, notę przy każdej.
3. Rozwiń kartę myszą i klawiaturą, przejdź linkiem do drugiego leku.
4. Powtórz przy 320 px i w trybie ciemnym.
5. Otwórz lek bez kolizji, lek zakończony i „Wizytę”: wyglądają jak przed zmianą.

## Performance Considerations

Brak. Ta sama liczba zapytań, `<details>` bez JavaScriptu.

## Migration Notes

Nie dotyczy. Bez zmian w bazie.

## References

- Roadmapa: `context/foundation/roadmap.md`, S-07 (#110)
- PRD: FR-006, FR-007, FR-012 w `context/foundation/prd.md`
- Wzorzec zwijania i tytułu z liczbą: `src/pages/wizyta.astro:83-106`
- Decyzje S-05 o nocie: `context/archive/2026-10-16-visit-readable-with-current-meds/plan-brief.md`
- Wzorzec testu: `tests/e2e/visit-readable.spec.ts`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Zwinięte karty kolizji

#### Automated

- [x] 1.1 Testy jednostkowe i bramki kopii przechodzą (w tym filtr FR-012 dla nowych tekstów): `npm test` — 1c50e3d
- [x] 1.2 Typy przechodzą: `npm run typecheck` — 1c50e3d
- [x] 1.3 Lint przechodzi: `npm run lint` — 1c50e3d
- [x] 1.4 Build przechodzi: `npm run build` — 1c50e3d

#### Manual

- [x] 1.5 Lek z co najmniej trzema kolizjami: tytuł „Możliwe interakcje (N)”, wszystkie karty zwinięte, nota widoczna przy każdej, opisy schowane — 1c50e3d
- [x] 1.6 Kliknięcie i klawiatura rozwijają kartę: widać opis i link „Przejdź do leku X”, link prowadzi do szczegółów drugiego leku — 1c50e3d
- [x] 1.7 Przy 320 px nagłówek z długą nazwą leku zawija się, nie wychodzi poza kartę, a chevron zostaje na swoim miejscu — 1c50e3d
- [x] 1.8 Tryb jasny i ciemny: karta, chevron i focus ring czytelne — 1c50e3d
- [x] 1.9 Lek bez kolizji i lek zakończony: pusty stan jak dotąd; „Wizyta” wygląda jak przed zmianą — 1c50e3d

### Phase 2: Test E2E — zwinięcie nie chowa noty

#### Automated

- [x] 2.1 Nowy spec przechodzi przeciw lokalnemu Supabase: `npx playwright test tests/e2e/medication-interactions-compact.spec.ts` — d409de8
- [x] 2.2 Spec pada, gdy nota jest tymczasowo wewnątrz `<details>`; zmiana cofnięta, spec znów przechodzi — d409de8
- [x] 2.3 Pozostałe testy E2E przechodzą (w tym `visit-readable` i `dark-gallery`): `npx playwright test` — d409de8
- [x] 2.4 Lint i typy przechodzą: `npm run lint`, `npm run typecheck` — d409de8

#### Manual

- [x] 2.5 Przegląd zrzutów `dark-gallery` dla szczegółów leku z kolizją w obu trybach: karty zwinięte, nota widoczna — d409de8
