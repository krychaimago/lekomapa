<!-- PLAN-REVIEW-REPORT -->

# Plan Review: S-04 Zakończenie przyjmowania leku z datą

- **Plan**: context/changes/discontinue-medication/plan.md
- **Mode**: Deep (weryfikacja inline)
- **Date**: 2026-10-05
- **Verdict**: REVISE
- **Findings**: 1 critical, 2 warnings, 2 observations

## Verdicts

| Dimension             | Verdict |
| --------------------- | ------- |
| End-State Alignment   | FAIL    |
| Lean Execution        | WARNING |
| Architectural Fitness | PASS    |
| Blind Spots           | WARNING |
| Plan Completeness     | WARNING |

## Grounding

9/9 paths ✓, 6/6 symbols ✓ (prefiks MD0xx wolny), brief↔plan ✓, Progress↔Phase ✓ (3/3 fazy, 22/22 kryteria)

## Findings

### F1 — Cofnięcie zakończenia odbije się od strażnika okresów

- **Severity**: ❌ CRITICAL
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: End-State Alignment
- **Location**: Faza 1 — migracja, kroki 3, 5, 6; testy, punkt 2
- **Detail**: Przy cofnięciu stempel (krok 3) ustawia `discontinued_at = null`. Potem wyzwalacz AFTER (krok 5) przywraca `ended_on = null`, a wyjątek w `dosage_periods_guard_core` (krok 6) wymaga „okno zakończenia otwarte”. Okno liczy z `medications.discontinued_at`, a ta kolumna jest już pusta, więc warunek zawsze daje fałsz i zapis kończy się P0001. Cofnięcie pada dla każdego leku, którego bieżący okres ma więcej niż 24 h — to typowy przypadek. Testy z planu tego nie złapią: tworzą świeże okresy, a przy otwartym oknie okresu strażnik pomija cały blok (`20261005120000_correction_window.sql:190`).
- **Fix A ⭐ Recommended**: Wyjątek przechodzi tylko przy `pg_trigger_depth() > 1`, gdy `ended_on` równa się bieżącemu `discontinued_on` i chodzi o ostatni okres leku. O oknie decyduje wtedy `medications_guard_core` na podstawie `old.discontinued_at`. W testach postarz okres (`backdate` `created_at` > 24 h) przed przesunięciem i cofnięciem.
  - Strength: Jedno źródło decyzji o oknie; bezpośredni zapis do `dosage_periods` (głębokość 1) dalej blokowany.
  - Tradeoff: Reguła zależy od głębokości wyzwalaczy — wymaga komentarza.
  - Confidence: MED — znany wzorzec, w repozytorium jeszcze nieużywany.
  - Blind spot: Przyszły inny wyzwalacz piszący do `dosage_periods` też miałby głębokość > 1.
- **Fix B**: Cofnięcie nie czyści `discontinued_at` (stempel zostawia starą wartość przy data→null), a `check` zmieniony na „`discontinued_at` not null, gdy `discontinued_on` not null”.
  - Strength: Bez zależności od głębokości wyzwalaczy.
  - Tradeoff: Na leku aktualnym zostaje stara wartość; bezpośredni zapis `ended_on = null` na leku aktualnym przechodzi w oknie po cofnięciu.
  - Confidence: MED.
  - Blind spot: Ponowne zakończenie musi i tak nadpisać stempel.
- **Decision**: FIXED (Fix A) — wyjątek tylko przy `pg_trigger_depth() > 1` i ostatnim okresie; okno sprawdza `medications_guard_core`; testy na postarzonym okresie

### F2 — W oknie okresu można otworzyć okres zakończonego leku

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Faza 1 — migracja, kroki 6–7
- **Detail**: Krok 7 blokuje tylko INSERT. Polityka `dosage_periods_update_authenticated` pozwala na bezpośredni UPDATE, a przy otwartym oknie okresu strażnik nic nie sprawdza. Przykład: lek dodany godzinę temu i zakończony dziś. Klient wysyła `update dosage_periods set ended_on = null`, lek jest zakończony, a okres dalej trwa. To dług F6b w innej postaci; narusza też zasadę planu „gwarancja na całą ścieżkę zapisu”.
- **Fix**: W `dosage_periods_guard_core` dodaj regułę niezależną od okna: jeśli lek ma `discontinued_on`, żaden okres nie może mieć `ended_on` null ani `ended_on > discontinued_on`. Dopisz przypadek do `discontinuation_checks.sql`.
- **Decision**: FIXED — reguła niezależna od okna w `dosage_periods_guard_core` (krok 6) + przypadek w `discontinuation_checks.sql`

### F3 — earliestDiscontinuationDate dubluje earliestChangeDate

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Lean Execution
- **Location**: Faza 2 — punkt 1
- **Detail**: `src/lib/services/medications.ts:113` ma już `earliestChangeDate` z identyczną formułą (później z `nextDay(start)` i `today − 14`) i testami.
- **Fix**: Użyj `earliestChangeDate` (ewentualnie zmień nazwę na `earliestPeriodEndDate` i popraw wywołania); bez nowej funkcji.
- **Decision**: FIXED — faza 2 używa istniejącego `earliestChangeDate`, bez nowej funkcji i zmiany nazwy

### F4 — Kolejność check i dopełnienia w migracji

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Faza 1 — migracja, krok 2
- **Detail**: Krok 2 wymienia `check` przed dopełnieniem. Gdy na produkcji jest zakończony lek z datą w przeszłości, `add constraint` padnie na tym wierszu.
- **Fix**: Kolejność: `add column` → `update … set discontinued_at = updated_at` → `add constraint`.
- **Decision**: FIXED — krok 2: add column → dopełnienie → add constraint

### F5 — Faza 2 linkuje do strony z fazy 3; nieostry kontrakt MD001

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Faza 2 punkt 5; Faza 3 punkt 3
- **Detail**: Faza 2 każe szczegółom leku zakończonego linkować do `/leki/zakonczone`, a ta strona powstaje w fazie 3 — do jej końca link prowadzi na 404. Zapis „`MD001` → 404/`medicationNotFound`” nie przesądza, czy trasa zwraca 404, czy przekierowuje.
- **Fix**: Przenieś link do fazy 3. Przy `MD001` zapisz jedną odpowiedź, tak jak w `dosage.ts`.
- **Decision**: FIXED — link do `/leki/zakonczone` w fazie 3; `MD001` → przekierowanie z `medicationNotFound`, 404 tylko dla błędnego uuid
