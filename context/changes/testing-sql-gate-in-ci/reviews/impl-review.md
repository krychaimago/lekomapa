<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Bramka SQL w CI — Implementation Plan

- **Plan**: context/changes/testing-sql-gate-in-ci/plan.md
- **Scope**: Full plan
- **Reviewed phases**: 1, 2, 3
- **Date**: 2026-09-29
- **Verdict**: APPROVED
- **Findings**: 0 critical, 2 warnings, 3 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | PASS    |
| Scope Discipline    | PASS    |
| Safety & Quality    | WARNING |
| Architecture        | PASS    |
| Pattern Consistency | WARNING |
| Success Criteria    | PASS    |

## Evidence (success criteria)

- `npm test`: 141/141 pass, `npm run lint`: 0 errors (4 pre-existing warnings).
- `npm run db:check` (lokalnie, `supabase_db_10x-astro-starter`): kod 0, `GATE_COMPLETE account_isolation_checks`, `CHECK 19 OK`, `GATE_COMPLETE rls_checks`.
- Próbki: `failing-check.sql` kod 1 („psql exited with code 3”), `missing-marker.sql` kod 1 („without completion marker”).
- `grep "return true|when others"` w obu plikach `supabase/tests/`: brak trafień.
- CI na PR #47: ostatni bieg (36545089715) zielony.
- Próbny PR #48 (`probe/isolation-break`): krok „SQL checks” czerwony z `ISOLATION 1 FAILED: account B sees 1 row(s) of account A in medications`, deploy pominięty, PR zamknięty bez merge'a, gałąź zdalna usunięta.
- Punkty ręczne 1.7, 2.4, 2.5, 3.5: zaznaczone, bez śladu w diffie (z natury — psucie lokalne bez commita). Nie weryfikowane ponownie.

## Findings

### F1 — Próbka failing-check nie dowodzi, że runner wymusza ON_ERROR_STOP

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: scripts/db-checks/probes/failing-check.sql:3-6, .github/workflows/ci.yml:48-53
- **Detail**: Komentarz próbki twierdzi: „bez ON_ERROR_STOP psql doszedłby do znacznika i zakończył się kodem 0”. Zmierzone: bez `-v ON_ERROR_STOP=1` psql kończy się kodem 0, ale znacznika nie wypisuje, bo plik jest w `begin;` i po błędzie DO ze znacznikiem trafia na „current transaction is aborted”. Runner odrzuca więc próbkę z powodu braku znacznika, nie kodu psql. Gdyby ktoś usunął `ON_ERROR_STOP=1` z `runFile`, obie próbki dalej byłyby czerwone, a CI zielone. Krok CI akceptuje też każdy kod ≠ 0 (brak kontenera, wyjątek Node) jako „próbka zadziałała”. Łamie lesson „Bramka musi odróżnić blokadę od niewykonania”. Obecne pliki w `supabase/tests/` mają własne `\set ON_ERROR_STOP on`, więc dziś realnej dziury nie ma — problem dotyczy tego, co próbka deklaruje.
- **Fix**: Usuń `begin;`/`rollback;` z `failing-check.sql` (autocommit — bez ON_ERROR_STOP znacznik naprawdę się wypisze), a w kroku CI wymagaj konkretnego powodu porażki w wyjściu runnera: `psql exited with code 3` dla failing-check, `without completion marker` dla missing-marker.
  - Strength: Próbka mierzy dokładnie to, co deklaruje; porażka z innego powodu (brak kontenera, crash) staje się czerwienią kroku.
  - Tradeoff: Krok CI zależy od treści komunikatów runnera — ich zmiana wymaga zmiany w `ci.yml`.
  - Confidence: HIGH — zachowanie psql zmierzone lokalnie na tym samym pliku.
  - Blind spot: Nie sprawdzono, czy autocommit w próbce nie zostawia śladów w bazie (DO z `raise` niczego nie zapisuje, więc nie powinien).
- **Decision**: FIXED — `begin;`/`rollback;` removed from failing-check.sql; CI step requires the named failure reason per probe. Measured: without ON_ERROR_STOP the probe now exits 0 with the marker; with a broken docker the step fails with "failed for the wrong reason".

### F2 — Mylące komentarze o wierszach do usunięcia w izolacji

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: supabase/tests/account_isolation_checks.sql:35, :368
- **Detail**: Nagłówek mówi, że składnik `0a12` i okres `0a13` należą do leku `0a11`, a wiersze 59 i 65 wpinają je pod `0a01`. Komentarz przy :368 („children before the parent, so owner deletes of 0a12/0a13 are not cascades”) uzasadnia kolejność, która tu nic nie zmienia. Zachowanie poprawne; kłamią tylko komentarze, a ten plik jest wzorcem w cookbooku test-planu §6.2.
- **Fix**: Popraw :35 na „medication 0a11 (no children), substance 0a12 and period 0a13 under medication 0a01” i usuń albo przeredaguj :368.
- **Decision**: FIXED — both comments corrected (:35 header, owner-delete ordering comment); no SQL change.

### F3 — ISOLATION 4 bez kontrprzykładu właściciela

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: supabase/tests/account_isolation_checks.sql:304-354
- **Detail**: Plan: „każdy przypadek blokady ma kontrprzykład właściciela”. Przepięcie pod cudzy lek daje `42501` + sprawdzenie treści, ale nie ma przypadku „A przepina swój wiersz pod swój drugi lek → przechodzi” (albo pada wyzwalaczem historii, a nie RLS). Ryzyko niskie: nazwany błąd z treścią o RLS już wskazuje przyczynę.
- **Fix**: Skip albo dopisz przypadek właściciela z oczekiwanym wynikiem zmierzonym przed ustawieniem warunku (przy otwartym oknie przepięcie powinno przejść).
- **Decision**: SKIPPED

### F4 — Plik może wyłączyć ON_ERROR_STOP i dalej wypisać znacznik

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: scripts/db-checks.mjs:124-141
- **Detail**: `-v ON_ERROR_STOP=1` z wiersza poleceń to tylko wartość startowa. Plik z `\set ON_ERROR_STOP off` (albo `\unset`) i znacznikiem poza transakcją przeszedłby mimo nieudanych sprawdzeń. Dziś żaden plik tego nie robi. Przy okazji: wczesne wyjście psql może rzucić nieobsłużony `EPIPE` na `child.stdin` (czerwone, ale z niejasnym komunikatem).
- **Fix**: Runner odrzuca plik zawierający `\set ON_ERROR_STOP off` / `\unset ON_ERROR_STOP`; dodaj `child.stdin.on("error", …)`.
- **Decision**: FIXED — `errorStopWeakening()` in the runner fails a file that `\unset`s ON_ERROR_STOP or `\set`s it to anything but on (meta-command at line start only; comments ignored), 2 unit tests; `child.stdin.on("error")` added. Measured: a file with `\set ON_ERROR_STOP off` + failed check + marker is rejected; both CI probes still fail for their own reasons.

### F5 — TRUNCATE dla anon/authenticated poza macierzą izolacji

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20260922120000_medication_schema.sql (grants), supabase/tests/account_isolation_checks.sql
- **Detail**: Lokalnie `anon` i `authenticated` mają `TRUNCATE` na trzech tabelach leków (F-01 go nie odebrał; F-02 i F-03 odebrały na swoich). TRUNCATE omija RLS i wyzwalacze wierszy. Niedostępne przez PostgREST. Plan świadomie wyłączył to z zakresu („kandydat na fazę 2 albo lesson”) — finding tylko przypomina, że plik „per operacja” tej operacji nie mierzy.
- **Fix**: Osobna zmiana (faza 2 test-planu): migracja `revoke truncate` + sprawdzenie w stylu CHECK 10.
- **Decision**: SKIPPED — out of scope; left for test-plan phase 2 (`revoke truncate` migration + check).

## Triage summary

- Fixed: F1, F2, F4 (3)
- Skipped: F3, F5 (2)
