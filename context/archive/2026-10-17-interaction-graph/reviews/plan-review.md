<!-- PLAN-REVIEW-REPORT -->

# Plan Review: Graf leków i możliwych interakcji

- **Plan**: context/changes/interaction-graph/plan.md
- **Mode**: Deep
- **Date**: 2026-10-18
- **Verdict**: REVISE
- **Findings**: 1 critical, 2 warnings, 3 observations

## Verdicts

| Dimension             | Verdict |
| --------------------- | ------- |
| End-State Alignment   | WARNING |
| Lean Execution        | PASS    |
| Architectural Fitness | PASS    |
| Blind Spots           | FAIL    |
| Plan Completeness     | WARNING |

## Grounding

10/10 paths ✓, 6/6 symbols ✓ (tokens, `INTERACTION_COPY.note` / `noInteractionsForMedication` / `endedNotCompared`, `EXCEPTIONS`), brief↔plan ✓, Progress↔Phase ✓

## Findings

### F1 — Odstawienie wstecz przesuwa leki na mapie

- **Severity**: ❌ CRITICAL
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Critical Implementation Details — „Stała mapa”; Faza 1 §2 i §4
- **Detail**: Odejście liczone od `discontinued_on`, a tę datę można ustawić do 14 dni wstecz (`earliestChangeDate`, `src/lib/services/medications.ts:131`). Przykład: A dodany 01.10.2026 (pole 1), B dodany 10.10.2026 (pole 2), 15.10.2026 A odstawiony z datą 05.10.2026 → przy odtwarzaniu B przychodzi po odejściu A i bierze pole 1, czyli przeskakuje. `started_on` nie ma dolnej granicy (`src/pages/api/medications/index.ts:33-35`), więc odejście może wypaść nawet przed własnym przyjściem leku. Tabela ma `discontinued_at timestamptz` — moment zapisu odstawienia, stemplowany zegarem bazy (`supabase/migrations/20261006120000_discontinue_medication.sql:108,121`). Warunek „tylko gdy lek nie jest już bieżący” jest martwy: daty odstawienia z przyszłości już nie istnieją.
- **Fix**: Odejście = `discontinued_at` (gdy nie null); zapytanie o historię czyta `id, created_at, discontinued_at`. Dopisać test „odstawienie z datą wstecz nie przesuwa leku dodanego później”. W skutkach przyjętych świadomie dopisać, że anulowanie odstawienia w oknie 24 h działa jak usunięcie pomyłki (mapa może się przesunąć).
- **Decision**: FIXED

### F2 — Zielone linie par stoją w sprzeczności z „bez zieleni”

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: End-State Alignment
- **Location**: What We're NOT Doing (l. 36); Faza 1 §1 (FR-014); Faza 2 §1; brief „Kolory”
- **Detail**: Linia startowa łączy wyłącznie pary ze zbioru reguł, więc jest linią interakcji — a plan rysuje ją `var(--accent-border)` (#b9d0c0, zielonkawy). Plan jednocześnie wyklucza „zieleń jako kolor interakcji”, a FR-014 mówi „nigdy kolor sugerujący bezpieczeństwo”. Brief uzasadnia bursztyn podświetlenia tym, że „zielona linia czytałaby się «ok»” — to samo dotyczy linii startowych.
- **Fix A ⭐ Recommended**: Linie startowe w neutralnym tokenie (`--input` / `--border`).
  - Strength: Plan zgodny z własnym „nie robimy” i FR-014; zieleń tylko dla wyboru.
  - Tradeoff: Odejście od makiety A2 — autorka musi zobaczyć efekt.
  - Confidence: MED — kontrast neutralnej linii w trybie ciemnym niesprawdzony.
  - Blind spot: Widoczność neutralnej linii na tle karty.
- **Fix B**: Zostawić zielonkawą linię i zapisać wyjątek jawnie w FR-014 i „Nie robimy”.
  - Strength: Zgodność z zatwierdzoną makietą.
  - Tradeoff: Wyjątek od własnej reguły; ryzyko odczytu „te pary są ok”.
  - Confidence: MED — decyzja wyglądu, nie techniki.
  - Blind spot: Brak sprawdzenia, jak to czyta użytkowniczka.
- **Decision**: FIXED (Fix A)

### F3 — Długa nazwa leku nie ma reguły układu

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Plan Completeness
- **Location**: Faza 1 §2 („nazwa nie wychodzi poza width”); Faza 2 §1
- **Detail**: `product_name` z rejestru ma do 63 znaków, z ulotki do 200 (`MAX_TEXT_LENGTH`), a kolumna to ok. 120 jednostek na 360. Czysta funkcja nie zmierzy tekstu, więc zapis „nazwa nie wychodzi poza width” jest nietestowalny w `node --test`. Plan nie mówi, co z nakładaniem nazw sąsiednich pól (zawijanie, ucinanie, liczba linii).
- **Fix**: Przycisk najwyżej szerokości kolumny, nazwa najwyżej w 2 liniach (`line-clamp-2`), pełna nazwa w panelu po wyborze. Test jednostkowy sprawdza tylko granice pola (`x` ± pół kolumny w `width`). E2E z długą nazwą z ulotki sprawdza brak nakładania przycisków (bounding box).
- **Decision**: FIXED

### F4 — Dwa atrybuty, których graf nie może użyć

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Faza 2 §1
- **Detail**: Smoke (`scripts/smoke.mjs:826-836`) tnie stronę od pierwszego `data-medication-id`; `scripts/pages/page-title.test.mjs` złapie atrybut `title={nazwa}` na elemencie SVG (element `<title>` przechodzi).
- **Fix**: W kontrakcie komponentu: bez `data-medication-id` i bez atrybutu `title=` z nazwą; identyfikator np. `data-graph-node`.
- **Decision**: FIXED

### F5 — Pomiar LCP bez ustawionej kompresji

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Faza 3 §3
- **Detail**: W S-09 pomiar bez kompresji dał medianę 2,57 s (ponad próg), dopiero lokalny proxy brotli jak na produkcji — 1,11 s (`context/archive/2026-10-17-medication-symptom-timeline/change.md:33-58`). Plan nie podaje ustawień, więc 3.6 może paść fałszywie.
- **Fix**: Skopiować ustawienia z S-09 (Lighthouse 12.8.2, proxy brotli, ciasteczko w `Cookie`); konto z 12 lekami przez skrypt seed z zapisaną ścieżką.
- **Decision**: FIXED

### F6 — Dwie drobne zbędności w kontraktach

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Faza 2 §1 i §3
- **Detail**: `src/pages/wizyta.astro:71` już używa `summary.currentMedications.length`, więc `visit-summary-data.ts` nie wymaga zmian. Komponenty `.tsx` importują teksty bezpośrednio (`src/components/journal/SymptomPicker.tsx:7`), żaden nie bierze ich w props.
- **Fix**: Usunąć `visit-summary-data.ts` z Fazy 2 §3; w komponencie importować `INTERACTION_COPY` bezpośrednio.
- **Decision**: FIXED
