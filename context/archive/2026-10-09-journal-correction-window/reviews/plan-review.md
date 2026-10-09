<!-- PLAN-REVIEW-REPORT -->

# Plan Review: Okno korekty wpisu dzienniczka (S-07)

- **Plan**: context/changes/journal-correction-window/plan.md
- **Mode**: Deep
- **Date**: 2026-10-09
- **Verdict**: REVISE → SOUND po triage’u (6/6 FIXED)
- **Findings**: 0 critical, 5 warnings, 1 observation

## Verdicts

| Dimension             | Verdict |
| --------------------- | ------- |
| End-State Alignment   | PASS    |
| Lean Execution        | PASS    |
| Architectural Fitness | WARNING |
| Blind Spots           | WARNING |
| Plan Completeness     | WARNING |

## Grounding

11/11 paths ✓, 6/6 symbols ✓ (SE006/SE007 wolne, `correction_window_end`, `correction_window_ends_at` jako pole wyliczane, `earliestEntryLocal`, `formatWarsawDateTime`, `db:check`), brief↔plan ✓, Progress↔Phase ✓.

Potwierdzone w kodzie: usunięcie wpisu nie wywołuje fałszywie SE001 (kaskada + `symptom_entry_correction_window_open` zwraca true dla nieistniejącego wpisu, :448-451); „skasuj, potem dodaj” objawy w jednej transakcji jest bezpieczne (SE001 odroczone, `unique(entry_id, symptom_id)` wymusza tę kolejność); `/dzienniczek/<id>` i `/dzienniczek/<id>/usun` chronione i za kontrolą warunków przez `matchesNavHref`; `scripts/db-checks.mjs` sam wykrywa `supabase/tests/*.sql`; `20261008120000_symptom_occurrences.sql` liczy przy odczycie, poprawka niczego tam nie wymaga.

## Findings

### F1 — Smoke poprawia wpis, na którym stoją późniejsze kroki

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Phase 2 §3 (smoke)
- **Detail**: Plan każe poprawić „wpis zapisany w kroku dodawania” (`journal.entryId`), zmieniając objaw. Na tym wpisie i na `journal.symptom` stoją kroki S-06: pytanie do lekarza (`scripts/smoke.mjs:1322-1336`), podsumowanie wizyty (:1350-1361) i kontrola wycieku w URL (:1376-1383). Po zmianie objawu te kroki padną albo sprawdzą nie to, co deklarują. Lista zakazanych tekstów w kontroli wycieku zna tylko `journal.symptom.name`, nazwę leku i „Smoke journal note” — nowy objaw i nowa notatka z poprawki nie są sprawdzane.
- **Fix A ⭐ Recommended**: Poprawa na osobnym wpisie dodanym w smoke
  - Strength: Istniejące kroki S-06 nietknięte; ten sam wzór („świeży wpis”) plan już stosuje przy usunięciu.
  - Tradeoff: Jeden dodatkowy zapis w smoke.
  - Confidence: HIGH — zależność widoczna w kodzie.
  - Blind spot: Do listy zakazanych w kroku :1377 dopisać nazwę nowego objawu i tekst nowej notatki.
- **Fix B**: Kroki poprawy po wszystkich krokach S-06, z aktualizacją `journal.symptom`
  - Strength: Bez dodatkowego wpisu.
  - Tradeoff: Kolejność kroków staje się niejawnym kontraktem.
  - Confidence: MED — działa dziś, łatwo zepsuć dopisaniem kroku.
  - Blind spot: Każdy przyszły krok dopisany na końcu trafi na poprawiony wpis.
- **Decision**: FIXED (Fix A)

### F2 — Walidacja SE004/SE005 w SQL: kopia czy wspólna funkcja — nierozstrzygnięte

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Architectural Fitness
- **Location**: Phase 1 §1, Migration Notes
- **Detail**: Dla zod plan każe wydzielić wspólny schemat, dla SQL milczy. W `add_symptom_entry` (`20261005130000_symptom_journal.sql:505-529`) SE001/SE004/SE005 są wpisane w treść funkcji, bez helpera. Wydzielenie helpera wymaga `create or replace` `add_symptom_entry` — sprzeczne z Migration Notes („Migracja dodaje wyłącznie funkcje”).
- **Fix**: Zapisać w kontrakcie: sprawdzenia kopiowane do `correct_symptom_entry` z komentarzem wskazującym `add_symptom_entry`; zgodność pilnują sprawdzenia SQL obu funkcji; `add_symptom_entry` bez zmian.
- **Decision**: FIXED

### F3 — Nowe funkcje poza rejestrem uprawnień INTERACTION 11

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Architectural Fitness
- **Location**: Phase 1 §2
- **Detail**: `supabase/tests/medication_interaction_checks.sql:556-570` to jedyna lista funkcji wołanych przez aplikację z kontrolą `anon`/`authenticated` (nagłówek :16: „thirteen functions”, w tym `add_symptom_entry` i `correct_dosage_period`). Plan robi tę kontrolę osobno w nowym pliku — dwa miejsca prawdy.
- **Fix**: Dopisać trzy nowe funkcje do tablicy INTERACTION 11 i zmienić licznik w nagłówku na szesnaście; w nowym pliku zostaje tylko sprawdzenie `28000`.
- **Decision**: FIXED

### F4 — Pomocniki testów SQL nie obsłużą nowych kodów

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 1 §2
- **Detail**: „Te same pomocniki” sugeruje współdzielenie, a są definiowane per plik (`pg_temp`). `try_code` łapie wyłącznie `28000` i SE001–SE005 (`symptom_journal_checks.sql:180`), więc SE006/SE007 nie zostaną złapane jako nazwany kod. Testy kończą się rollbackiem — odroczone SE001 nie odpali bez `set constraints … immediate` (:38-41), więc test „poprawa bez objawów” mógłby przejść bez pomiaru (lesson „Bramka musi odróżnić blokadę od niewykonania”).
- **Fix**: W kontrakcie: pomocniki skopiowane do nowego pliku, `try_code` rozszerzony o SE006 i SE007, każdy test SE001 z `set constraints … immediate`.
- **Decision**: FIXED

### F5 — Kluczowe ryzyko fazy 3 bez obowiązkowego testu

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 3 §1, Testing Strategy
- **Detail**: Brief nazywa `min` pola daty kluczowym ryzykiem fazy 3, a test jest warunkowy („Jeśli wyliczenie `minOccurred` trafi do `src/lib/services/journal.ts`”). Bez niego pilnuje tego wyłącznie ręczny krok 3.10.
- **Fix**: `minOccurred` jako czysta funkcja w `src/lib/services/journal.ts` (obok `earliestEntryLocal`, :150), test w `scripts/journal/journal.test.mjs` obowiązkowy; kryterium 3.1 obejmuje ten test.
- **Decision**: FIXED

### F6 — NewEntryForm „tylko jeśli” — zbędna furtka

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 3 §1
- **Detail**: `SymptomPicker` jest w pełni sterowany propsami (`selected`, `onToggle`, `onSeverityChange` — `SymptomPicker.tsx:21-37`), więc `EditEntryForm` wypełni go bez dotykania `NewEntryForm` (który ma na sztywno pusty stan, :33). Warunek „tylko jeśli wydzielenie tego wymaga” zostawia implementującemu decyzję, której nie trzeba podejmować.
- **Fix**: Zapisać „`NewEntryForm.tsx` bez zmian”, usunąć warunek.
- **Decision**: FIXED
