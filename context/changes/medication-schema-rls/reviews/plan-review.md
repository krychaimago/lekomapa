<!-- PLAN-REVIEW-REPORT -->

# Plan Review: Schemat leków i okresów dawkowania z RLS

- **Plan**: `context/changes/medication-schema-rls/plan.md`
- **Mode**: Deep
- **Date**: 2026-09-22
- **Verdict**: REVISE → SOUND (po poprawkach)
- **Findings**: 1 critical, 3 warnings, 2 observations

## Verdicts

| Dimension             | Verdict                          |
| --------------------- | -------------------------------- |
| End-State Alignment   | PASS                             |
| Lean Execution        | PASS                             |
| Architectural Fitness | PASS                             |
| Blind Spots           | FAIL → PASS po F1 i F2           |
| Plan Completeness     | WARNING → PASS po F3, F4, F5, F6 |

## Grounding

5/5 ścieżek istnieje (`scripts/smoke.mjs`, `README.md`, `.github/workflows/ci.yml`, `src/middleware.ts`, `src/lib/supabase.ts`); `supabase/migrations/` i `src/types.ts` nie istnieją zgodnie z planem. `@supabase/supabase-js` obecny w `dependencies` (`package.json:25`). Skrót↔plan zgodny. Progress↔fazy zgodne.

## Findings

### F1 — Usunięcie wiersza omija całą ochronę historii

- **Severity**: ❌ CRITICAL
- **Impact**: 🔎 MEDIUM — realny kompromis, warto przemyśleć
- **Dimension**: Blind Spots
- **Location**: Faza 1, punkty 5 i 6
- **Detail**: Wyzwalacze stały wyłącznie na `before update`, a polityka `delete` przepuszczała każdy własny wiersz. Zamknięty okres dawkowania można było skasować i wpisać od nowa z inną dawką — skutek, któremu ma zapobiec reguła „historia nie kłamie".
- **Fix A ⭐ Recommended**: wyzwalacz `before delete` na tych samych zasadach
  - Strength: Jedna reguła obejmuje obie drogi zmiany historii; usunięcie pomyłki dalej działa w oknie korekty.
  - Tradeoff: Dopóki funkcja okna zwraca `true`, ochrona zaczyna działać dopiero z S-05.
  - Confidence: HIGH — ta sama funkcja, ten sam kształt co wyzwalacze update.
  - Blind spot: Kaskada przy usunięciu leku musi wyzwalacz omijać, inaczej zablokuje S-09.
- **Fix B**: dług do S-04
- **Decision**: FIXED (Fix A) — Faza 1 punkt 6 rozszerzony o wyzwalacze `before delete` i wyjątek dla kaskady; nowe kryterium 1.8.

### F2 — Krok izolacji nie działa w trybie istniejącego konta

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — realny kompromis, warto przemyśleć
- **Dimension**: Blind Spots
- **Location**: Faza 3, punkt 1
- **Detail**: Przy ustawionych `SMOKE_EMAIL` i `SMOKE_PASSWORD` (`scripts/smoke.mjs:21`) rejestracja jest pomijana, bo tryb celuje w środowisko potwierdzające adres. Krok izolacji potrzebuje dwóch świeżych kont i zapisuje leki — groziło to wpisaniem zmyślonych danych zdrowotnych do prawdziwego konta.
- **Fix A ⭐ Recommended**: krok izolacji wyłącznie w trybie kont jednorazowych, w drugim trybie jawny `SKIP` z powodem.
  - Strength: Dane zdrowotne nie trafiają do prawdziwego konta; CI chodzi w trybie jednorazowym, więc bramka zostaje.
  - Tradeoff: Smoke przeciw produkcji nie sprawdza izolacji.
  - Confidence: HIGH — tryb jest już rozpoznawany zmienną `usesExistingAccount`.
  - Blind spot: Decyzja, czy pominięcie ma być głośne — przyjęto, że tak.
- **Decision**: FIXED (Fix A)

### F3 — Cztery „automatyczne" kryteria bez komendy do uruchomienia

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — szybka decyzja, poprawka oczywista
- **Dimension**: Plan Completeness
- **Location**: Faza 1, kryteria 1.2–1.5
- **Detail**: Kryteria opisywały zapytania SQL, ale nie mówiły, czym je odpalić. Supabase CLI nie wykonuje SQL, `psql` nie jest zależnością repozytorium.
- **Fix**: Plik `supabase/tests/rls_checks.sql` (Faza 1 punkt 7) uruchamiany przez `docker exec` na kontenerze bazy, komenda podana wprost i dopisana do `README.md`.
- **Decision**: FIXED

### F4 — Kroki izolacji nie mieszczą się w istniejącym kształcie kroku

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — szybka decyzja, poprawka oczywista
- **Dimension**: Plan Completeness
- **Location**: Faza 3, punkt 1
- **Detail**: Krok w `scripts/smoke.mjs:61` to trójka `[nazwa, funkcja, { status, location }]`; pętla sprawdzająca (`scripts/smoke.mjs:85`) nie obsłuży porównania liczby wierszy. Zapis „pozostaje przy dotychczasowej formie" mógł zostać odczytany jako zakaz zmiany pętli.
- **Fix**: Doprecyzowany kontrakt — zachowana forma wyjścia (PASS/FAIL, licznik, kod wyjścia), pętla dostaje drugi wariant oczekiwania.
- **Decision**: FIXED

### F5 — `updated_at` nigdy się nie zaktualizuje

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — szybka decyzja, poprawka oczywista
- **Dimension**: Plan Completeness
- **Location**: Faza 1, punkt 2
- **Detail**: Kolumna miała wartość domyślną, ale nic jej nie podnosiło przy zmianie wiersza.
- **Fix**: Punkt 8 w Fazie 1 — funkcja i wyzwalacz `before update` na `medications`, z alternatywą usunięcia kolumny.
- **Decision**: FIXED

### F6 — Nagłówek skryptu mówi „zero zależności"

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — szybka decyzja, poprawka oczywista
- **Dimension**: Plan Completeness
- **Location**: Faza 3, punkt 1
- **Detail**: `scripts/smoke.mjs:2` deklaruje „Zero dependencies on purpose", a plan dokłada import `@supabase/supabase-js`.
- **Fix**: Aktualizacja komentarza nagłówka dopisana do kontraktu Fazy 3.
- **Decision**: FIXED
