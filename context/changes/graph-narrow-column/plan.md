# Graf leków w jednej kolumnie, gdy brakuje miejsca — plan implementacji

## Overview

Issue #126: przyciski leków na grafie (`/leki`, S-10) nachodzą na siebie przy ekranie węższym niż 360 px i przy powiększonym tekście. Dodajemy trzeci układ grafu: jedną kolumnę leków z łukami par po lewej (makieta `prototype/graf-luzny-uklad.html`, wersja 8). Włącza się on tylko wtedy, gdy na dzisiejszy układ telefonu brakuje miejsca. Oba progi przełączania przechodzą z pikseli na jednostki tekstu (rem), więc reagują także na powiększony tekst.

## Current State Analysis

- `buildInteractionGraph` liczy dwa układy: telefon „C” (360 jednostek szerokości) i komputer „10” (576 jednostek). Oba w jednostkach `viewBox`, które skalują się z szerokością karty (`src/lib/services/interaction-graph.ts:381-431`).
- Przycisk leku ma wysokość w px (`pt-6`, `text-xs`, `line-clamp-2`), a jego położenie podaje się w procentach szerokości i wysokości sceny (`src/components/medications/InteractionGraph.tsx:156-181`). Na węższym ekranie rzędy się zbliżają, a przycisk zostaje tak samo wysoki. Przy większym tekście przycisk rośnie, a rzędy stoją w miejscu. To jest przyczyna #126.
- Układ rezerwuje dla przycisku stały prostokąt 90 × 88 jednostek (`interaction-graph.ts:46-56`). Przy telefonie 360 px i tekście 100% to wystarcza — pomiar z #126: 0 nachodzących par.
- Przełączanie układów robi container query na karcie: `@min-[480px]` (`InteractionGraph.tsx:221-226`). Kontener to obszar treści karty (`px-4` i ramka nie wchodzą), czyli 480 px treści ≈ 514 px całej karty (#128).
- Czas procesora: `replayHistory` dla każdego leku z historii szuka wolnego miejsca w obu układach (`interaction-graph.ts:264-317`). To główny koszt z #127. Pomiar z 18.10.2026 (`node scripts/medications/graph-render-bench.mjs`): 12 + 0 → mediana 1,61 ms, 20 + 20 → 3,23 ms, 30 + 60 → 9,88 ms (FAIL, ryzyko przyjęte przez autorkę).
- Testy: `scripts/medications/interaction-graph.test.mjs` (jednostkowe, `node --test`, ładuje serwis bezpośrednio), `tests/e2e/interaction-graph.spec.ts` (sprawdza nachodzenie przycisków tylko przy 360 px, linia 144).

## Desired End State

- Gdy treść karty grafu ma mniej niż 18,375 rem (294 px przy zwykłym tekście — czyli telefon węższy niż 360 px albo powiększony tekst), graf pokazuje jedną kolumnę: leki alfabetycznie jeden pod drugim, punkt przy nazwie, pary jako łuki po lewej.
- Od 18,375 rem do 30 rem treści karty: dzisiejszy układ telefonu „C”, bez zmian.
- Od 30 rem (480 px przy zwykłym tekście): dzisiejszy układ komputera „10”, bez zmian.
- Przy zwykłym tekście i ekranie ≥ 360 px nikt nie widzi żadnej zmiany.
- Żadne dwa przyciski leków nie nachodzą na siebie przy 320 px, 360 px i tekście 100% / 125% / 150%.
- Wybór leku, karty par, komunikat dla czytnika ekranu i nota działają tak samo we wszystkich trzech układach (wspólny stan).

Weryfikacja: testy jednostkowe kolumny, test E2E przy 320 px i przy tekście 125%, pomiar `graph-render-bench.mjs`, ręczne porównanie z makietą.

### Key Discoveries:

- Kolejność alfabetyczna węzłów już istnieje: `model.nodes` jest sortowane `Intl.Collator("pl")` (`interaction-graph.ts:388-390`). Kolumna nie potrzebuje odtwarzania historii ani szukania miejsca.
- Przycisk leku jest już w DOM w kolejności alfabetycznej (`InteractionGraph.tsx:149`), więc w kolumnie kolejność Tab = kolejność na ekranie.
- Testy jednostkowe ładują serwis przez `node --experimental-strip-types` — serwis nie może importować `@/` ani `reportError` (`interaction-graph.ts:1-3`).
- `max-w-sm` sceny telefonu to 24 rem, więc rośnie razem z tekstem — układ „C” przy dużym tekście dostaje proporcjonalnie więcej miejsca.
- Pomiar `graph-render-bench.mjs` renderuje cały komponent (`renderToString(InteractionGraph)`) i serializuje model — trzecia wersja wejdzie do pomiaru bez zmian w skrypcie (`graph-render-bench.mjs:104-107`).

## What We're NOT Doing

- Nie zmieniamy układów „C” i „10”: ani geometrii, ani stałych, ani algorytmu odtwarzania historii. Punkty obecnych użytkowniczek zostają na swoich miejscach.
- Nie przyspieszamy `replayHistory` (#127 zostaje otwarte jako osobny temat).
- Nie mierzymy tekstu w przeglądarce. Wiersze kolumny mają stałą wysokość na nazwę w dwóch liniach (decyzja autorki).
- Nie ucinamy nazw wielokropkiem. Nazwa dłuższa niż dwie linie dostaje `line-clamp-2` jak dziś na grafie.
- Nie dodajemy nowych tekstów w `src/lib/copy/` — kolumna używa istniejących etykiet grafu.
- Nie układamy łuków tak, by się nie przecinały. Przy wielu parach łuki mogą na siebie nachodzić (przesądzone w makiecie).
- Nie zmieniamy kolejności leków według interakcji (FR-012): kolejność to wyłącznie alfabet.

## Prerequisites

- PR #131 (#128) zamknięty bez merge'u jako zastąpiony przez tę zmianę, zanim ruszy faza 1. Zmienia te same komentarze w `InteractionGraph.tsx` i `interaction-graph.ts`, które fazy 1 i 2 przepisują na rem. Zamyka autorka. Przesądza: #128 zamyka dopiero merge tej zmiany.
- Lokalny Supabase do E2E (faza 3).

## Implementation Approach

Kolumna ma własny układ współrzędnych, w którym 1 jednostka = 1/16 rem (1 px przy zwykłym tekście). Wiersz ma 48 jednostek (3 rem), pas łuków 56 jednostek (3,5 rem). Serwis liczy punkty i łuki w tych jednostkach. Komponent rysuje SVG o szerokości i wysokości w rem, a przyciski jako wiersze o wysokości 3 rem. Wszystko rośnie razem z tekstem w tej samej proporcji, więc łuki trafiają w punkty przy każdym powiększeniu — bez JS i bez mierzenia.

Kolumna to trzecie pole `InteractionGraphModel` o tym samym kształcie co dwa pozostałe (`InteractionGraphLayout`), żeby komponent i testy traktowały wszystkie trzy jednakowo tam, gdzie się da.

## Critical Implementation Details

**Kolejność wariantów container query.** Trzy sceny muszą się wykluczać: kolumna `@min-[18.375rem]:hidden`, telefon `hidden @min-[18.375rem]:block @min-[30rem]:hidden`, komputer `hidden @min-[30rem]:block`. Przy ≥ 30 rem telefonowi pasują jednocześnie `block` i `hidden` — wygrywa reguła późniejsza w wygenerowanym CSS. Tailwind 4 sortuje warianty `@min-[…]` według wartości, ale to trzeba potwierdzić testem E2E (dokładnie jedna scena widoczna przy każdej szerokości), nie założeniem.

**Rem w container query.** `rem` w zapytaniu odnosi się do rozmiaru czcionki elementu `<html>`. Reaguje więc i na ustawienie rozmiaru tekstu w przeglądarce, i na `font-size` na `<html>` — tym drugim test E2E symuluje powiększony tekst, tak jak pomiar w #126.

**Wydajność.** Kolumna ma koszt liniowy: punkt na lek, łuk na parę, bez szukania miejsca i bez sprawdzania odstępu łuku od punktów (łuk leży w całości na lewo od linii punktów, więc nie może przejść przez inny punkt). Koszt dochodzi głównie z renderu trzeciej sceny w HTML. Bramka: faza 2.

## Faza 1: Układ kolumny w serwisie

### Overview

Serwis liczy trzeci układ: kolumnę. Testy jednostkowe ustalają jego kontrakt, zanim powstanie wygląd.

### Changes Required:

#### 1. Typ modelu

**File**: `src/types.ts`

**Intent**: Model grafu dostaje trzeci układ obok `phone` i `wide`. Komentarze przy `phone` i `wide` opisują nowe progi w rem zamiast „480 px”.

**Contract**: `InteractionGraphModel.column: InteractionGraphLayout` — kolumna w jednostkach 1/16 rem; `points` w kolejności `nodes`; `lines` w kolejności `edges`. Komentarz `InteractionGraphLine.path` zmienia się z „only the letters M and Q” na: M i Q w układach telefonu i komputera, M i C w kolumnie.

#### 2. Liczenie kolumny

**File**: `src/lib/services/interaction-graph.ts`

**Intent**: Nowa funkcja buduje kolumnę z posortowanych węzłów i krawędzi: punkt i-tego leku stoi w i-tym wierszu, łuk pary wygina się w lewo tym mocniej, im dalej od siebie są leki, ale nigdy poza lewą krawędź pasa. Nagłówek pliku opisuje trzy układy i progi w rem.

**Contract**:

- Eksportowane stałe: `GRAPH_COLUMN_ROW = 48`, `GRAPH_COLUMN_GUTTER = 56` (jednostki = 1/16 rem).
- `column.width = GRAPH_COLUMN_GUTTER`, `column.height = nodes.length × GRAPH_COLUMN_ROW`.
- Punkt i-tego węzła: `x` stałe dla wszystkich (przy prawej krawędzi pasa, z miejscem na promień punktu i poświatę wybranego), `y = (i + 0.5) × GRAPH_COLUMN_ROW`.
- Łuk: ścieżka sześcienna (`M … C … …`) od punktu `a` do punktu `b`; oba punkty kontrolne mają tę samą współrzędną `x`, mniejszą niż `x` punktów i nie mniejszą niż 0.
- Kolumna nie zależy od historii, pól ani interakcji przy wyznaczaniu punktów (FR-012).

#### 3. Testy jednostkowe kolumny

**File**: `scripts/medications/interaction-graph.test.mjs`

**Intent**: Testy ustalają kontrakt kolumny wartościami policzonymi niezależnie od kodu (indeks wiersza × 48 + 24), nie tą samą funkcją.

**Contract**: `"column"` nie trafia do `LAYOUTS` (`interaction-graph.test.mjs:19`) — tamte testy sprawdzają krzywe Q i geometrię układów z historią. Kolumna dostaje nowe testy:

- kolumna ma szerokość 56 i wysokość 48 × liczba obecnych leków,
- punkty idą w kolejności alfabetycznej (polskiej) i każdy stoi w swoim wierszu, ze wspólnym `x`,
- interakcje nie zmieniają punktów ani wysokości kolumny (FR-012),
- historia (kolejność dodania, zakończone leki) nie zmienia kolumny — tylko zbiór obecnych leków i ich nazwy,
- każdy łuk zaczyna się w punkcie jednego leku pary i kończy w punkcie drugiego, a jego punkty kontrolne leżą w przedziale `[0, x punktu)`,
- zakończony lek nie ma wiersza i nie rysuje łuku.

### Success Criteria:

#### Automated Verification:

- Testy jednostkowe przechodzą: `npm test`
- Typy przechodzą: `npm run typecheck`
- Lint przechodzi: `npm run lint`

**Implementation Note**: Faza nie ma części ręcznej — kolumny jeszcze nie widać. Commit i przejście do fazy 2.

---

## Faza 2: Kolumna w komponencie i progi w jednostkach tekstu

### Overview

Komponent rysuje kolumnę jako trzecią scenę, a oba progi przechodzą na rem. Pomiar czasu procesora jest bramką tej fazy.

### Changes Required:

#### 1. Scena kolumny

**File**: `src/components/medications/InteractionGraph.tsx`

**Intent**: Nowa scena dla `model.column`: SVG z łukami i punktami po lewej, obok lista przycisków-wierszy z nazwą. Kolory, stany wyboru, przyciemnienie, poświata i `aria-pressed` jak w dzisiejszych scenach; wybór wspólny dla trzech scen.

**Contract**:

- SVG `aria-hidden`, szerokość `GRAPH_COLUMN_GUTTER / 16` rem, wysokość `column.height / 16` rem, `viewBox` = wymiary kolumny — skala jednolita, łuki trafiają w punkty przy każdym rozmiarze tekstu.
- Przycisk = wiersz o wysokości 3 rem (`GRAPH_COLUMN_ROW / 16`), obejmuje punkt i nazwę (pole dotyku ≥ 44 px), nazwa `text-sm`, wyrównana do lewej, `line-clamp-2`, `break-words`.
- Przyciski w kolejności `model.nodes`, w grupie z `aria-label={INTERACTION_COPY.graphLabel}`, z `data-graph-node` jak dziś (testy E2E wybierają po nim).
- Kolory wyłącznie przez `var(--…)` z tokenów; bez klas `dark:`.

#### 2. Progi w rem

**File**: `src/components/medications/InteractionGraph.tsx`

**Intent**: Trzy sceny przełączane container query na karcie: kolumna poniżej 18,375 rem, telefon od 18,375 rem do 30 rem, komputer od 30 rem. Komentarz komponentu opisuje trzy układy i progi (zastępuje brzmienie z #128).

**Contract**: dokładnie jedna scena ma `display` różne od `none` przy każdej szerokości karty; pozostałe są poza drzewem dostępności i kolejnością Tab.

#### 3. Zapis pomiaru

**File**: `context/changes/graph-narrow-column/change.md`

**Intent**: Wynik `graph-render-bench.mjs` po zmianie, obok wartości sprzed zmiany (1,61 / 3,23 / 9,88 ms), żeby #127 miało ślad, ile dołożyła kolumna.

**Contract**: sekcja „Pomiar czasu procesora” z trzema wierszami: przed i po.

### Success Criteria:

#### Automated Verification:

- Testy jednostkowe przechodzą, w tym bramka kolorów i zakresu `destructive`: `npm test`
- Typy przechodzą: `npm run typecheck`
- Lint przechodzi: `npm run lint`
- Build przechodzi: `npm run build`
- Pomiar: `node scripts/medications/graph-render-bench.mjs` — konta 12 + 0 i 20 + 20 z medianą ≤ 7 ms. Przekroczenie = stop i rozmowa z autorką przed fazą 3. Wynik 30 + 60 zapisany w `change.md` (był FAIL przed zmianą, przyjęte ryzyko #127)

#### Manual Verification:

- Przy 320 px i tekście 100% graf pokazuje kolumnę zgodną z makietą (wersja 8): alfabetycznie, łuki po lewej, równe wiersze, nazwy 14 px
- Przy 360 px i tekście 125% graf pokazuje kolumnę, a przy 360 px i tekście 100% — dzisiejszy układ telefonu bez zmian
- Na komputerze graf wygląda jak przed zmianą
- Wybór leku w kolumnie podświetla łuki i pokazuje karty par z notą; ponowne kliknięcie czyści wybór
- Tryb ciemny: kolumna czytelna, kolory jak w pozostałych układach

**Implementation Note**: Po automatycznej weryfikacji zatrzymaj się na potwierdzenie autorki, że sprawdzenie ręczne wypadło dobrze, zanim przejdziesz do fazy 3.

---

## Faza 3: Testy E2E i komentarze

### Overview

Test przeglądarkowy pilnuje, że przy wąskim ekranie i dużym tekście nic nie nachodzi i że zawsze widać dokładnie jedną scenę.

### Changes Required:

#### 1. Test E2E grafu

**File**: `tests/e2e/interaction-graph.spec.ts`

**Intent**: Sprawdzenie nachodzenia przycisków obejmuje widoczną scenę przy 320 px (100%) i przy 360 px z tekstem 125% (powiększenie przez `font-size` na `<html>`, jak pomiar w #126). Do tego: dokładnie jedna scena widoczna przy 320, 360 i 1280 px; w kolumnie kolejność Tab = kolejność wierszy na ekranie; wybór w kolumnie pokazuje karty par.

**Contract**:

- Przy 360 px i tekście 100% widoczna jest scena telefonu (układ „C”), nie kolumna — test łapie regres progu w drugą stronę.
- `font-size` na `<html>` powiększa też marginesy strony i karty (w rem), więc przy 320 px i przy 360 px + 125% kolumnę pokazałby także próg w px. Dlatego test ma przypadki, w których rem i px dają różny wynik:
  - 412 px + 125% (ok. 318 px treści karty): widoczna kolumna, nic nie nachodzi — próg w px pokazałby telefon,
  - 640 px + 125% (ok. 558 px treści karty): widoczny telefon, nie komputer — próg w px pokazałby komputer.
- 360 px + 150%: widoczna kolumna, żadne dwa przyciski nie nachodzą (pokrycie „150%” z Desired End State).
- Asercje przez `getByRole` / `data-graph-node`, bez `waitForTimeout`.

#### 2. Komentarze o progach

**File**: `src/lib/services/interaction-graph.ts`, `src/components/medications/InteractionGraph.tsx`, `src/types.ts`

**Intent**: Sprawdzenie, że fazy 1 i 2 nie zostawiły żadnej wzmianki o „480 px” bez rem (30 rem, 480 px przy zwykłym tekście). Komentarze przepisują fazy 1 i 2; tu poprawiasz tylko to, co grep znajdzie.

**Contract**: `grep -n "480" src/lib/services/interaction-graph.ts src/components/medications/InteractionGraph.tsx src/types.ts` zwraca wyłącznie wzmianki z rem albo z dopiskiem „przy zwykłym tekście”.

### Success Criteria:

#### Automated Verification:

- Test E2E grafu przechodzi przeciw lokalnemu Supabase: `npx playwright test tests/e2e/interaction-graph.spec.ts`
- Cały zestaw E2E przechodzi: `npx playwright test`
- Testy jednostkowe, typy i lint przechodzą: `npm test`, `npm run typecheck`, `npm run lint`

#### Manual Verification:

- Test E2E pada, gdy próg kolumny zostanie cofnięty do pikseli (sprawdzenie, że test łapie ryzyko)

**Implementation Note**: Przed biegiem E2E zatrzymaj stary podgląd (`npx astro preview stop`) i odsuń `.env` — bieg idzie do lokalnego Supabase.

---

## Testing Strategy

### Unit Tests:

- Kontrakt kolumny: wymiary, kolejność, `y` z indeksu wiersza, wspólne `x`.
- FR-012: interakcje nie ruszają punktów; historia nie zmienia kolumny.
- Łuki: końce w punktach pary, punkty kontrolne w pasie na lewo od punktów.

### Integration Tests:

- E2E: jedna widoczna scena przy 320 / 360 / 1280 px; brak nachodzenia przy 320 px i przy 360 px z tekstem 125%; kolejność Tab w kolumnie; wybór i karty par w kolumnie.

### Manual Testing Steps:

1. Telefon 320 px (narzędzia przeglądarki), konto z 12 lekami (`seed-graph-heavy.mjs`): kolumna, zgodna z makietą.
2. 360 px, ustawienie rozmiaru tekstu w przeglądarce na duży: kolumna.
3. 360 px, zwykły tekst: dzisiejszy układ telefonu.
4. Komputer: dzisiejszy układ szeroki.
5. Wybór leku w kolumnie, tryb ciemny.

## Performance Considerations

Kolumna jest liniowa względem liczby leków i par. Dochodzi render trzeciej sceny w HTML (wyspa `client:visible` serializuje też model). Bramka w fazie 2: mediana ≤ 7 ms dla kont 12 + 0 i 20 + 20. Konto 30 + 60 już przed zmianą przekracza próg (#127) — zapisujemy przyrost, nie blokujemy nim fazy.

## References

- Issue: #126; powiązane #127 (CPU), #128 (komentarze o progu 480 px, PR #131)
- Makieta: `context/changes/graph-narrow-column/prototype/graf-luzny-uklad.html` (wersja 8)
- Pierwotna zmiana grafu: `context/archive/2026-10-17-interaction-graph/` (plan, makiety, sekcja „Nakładanie przycisków przy 320 px i powiększonym tekście” w `change.md`)
- Serwis: `src/lib/services/interaction-graph.ts:381-431`; komponent: `src/components/medications/InteractionGraph.tsx:69-227`
- Pomiar: `scripts/medications/graph-render-bench.mjs`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Układ kolumny w serwisie

#### Automated

- [x] 1.1 Testy jednostkowe przechodzą: `npm test` — 2e9b445
- [x] 1.2 Typy przechodzą: `npm run typecheck` — 2e9b445
- [x] 1.3 Lint przechodzi: `npm run lint` — 2e9b445

### Phase 2: Kolumna w komponencie i progi w jednostkach tekstu

#### Automated

- [x] 2.1 Testy jednostkowe przechodzą, w tym bramka kolorów i zakresu `destructive`: `npm test` — 0bd883b
- [x] 2.2 Typy przechodzą: `npm run typecheck` — 0bd883b
- [x] 2.3 Lint przechodzi: `npm run lint` — 0bd883b
- [x] 2.4 Build przechodzi: `npm run build` — 0bd883b
- [x] 2.5 Pomiar: konta 12 + 0 i 20 + 20 z medianą ≤ 7 ms, wynik 30 + 60 zapisany w `change.md` — 0bd883b

#### Manual

- [x] 2.6 Przy 320 px i tekście 100% kolumna zgodna z makietą (wersja 8) — 0bd883b
- [x] 2.7 Przy 360 px i tekście 125% kolumna, przy 360 px i tekście 100% dzisiejszy układ telefonu — 0bd883b
- [x] 2.8 Na komputerze graf wygląda jak przed zmianą — 0bd883b
- [x] 2.9 Wybór leku w kolumnie podświetla łuki i pokazuje karty par z notą — 0bd883b
- [x] 2.10 Tryb ciemny: kolumna czytelna — 0bd883b

### Phase 3: Testy E2E i komentarze

#### Automated

- [x] 3.1 Test E2E grafu przechodzi przeciw lokalnemu Supabase — a865797
- [x] 3.2 Cały zestaw E2E przechodzi — a865797
- [x] 3.3 Testy jednostkowe, typy i lint przechodzą — a865797

#### Manual

- [x] 3.4 Test E2E pada, gdy próg kolumny zostanie cofnięty do pikseli — a865797
