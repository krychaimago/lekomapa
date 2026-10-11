<!-- PLAN-REVIEW-REPORT -->

# Plan Review: Usunięcie konta (S-09)

- **Plan**: context/changes/account-deletion-cascade/plan.md
- **Mode**: Deep
- **Date**: 2026-10-11
- **Verdict**: REVISE → SOUND after triage
- **Findings**: 0 critical, 4 warnings, 1 observation

## Verdicts

| Dimension             | Verdict |
| --------------------- | ------- |
| End-State Alignment   | PASS    |
| Lean Execution        | PASS    |
| Architectural Fitness | PASS    |
| Blind Spots           | WARNING |
| Plan Completeness     | WARNING |

## Grounding

16/16 ścieżek ✓, symbole ✓ (`termsGateAction`, `matchesNavHref`, `formOrigin`, `isolationSkipReason`), brief↔plan ✓

Potwierdzone w kodzie (bez findingów):

- `db:check` sam wykrywa pliki `.sql` w `supabase/tests/` i wymaga znacznika `GATE_COMPLETE account_deletion_checks` (`scripts/db-checks.mjs:219-220`, `:117-123`).
- Rola `postgres` usuwa z `auth.users` (ISOLATION 6, `account_isolation_checks.sql:895`).
- Po `signInWithPassword` wywołanie `rpc` tym samym klientem idzie z nowym tokenem (`@supabase/ssr` czyta najpierw sesję trzymaną w pamięci).
- `/konto/usun` jest wnętrzem przez dopasowanie prefiksu (`navigation.ts:22-24`), a `/auth/konto-usuniete` jest publiczna.
- Odroczone wyzwalacze dzienniczka przepuszczają kaskadę (`20261005130000_symptom_journal.sql:448-451`).

## Findings

### F1 — Wymagana treść wpada na filtr FR-012

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Faza 2, §2 Teksty; Faza 3, §1 Strona prywatności
- **Detail**: Kontrakt każe wymienić „leki z historią dawkowania” i jednocześnie wymaga, by tekst przeszedł filtr słów zakazanych. Filtr blokuje rdzenie `dawk`, `przesta`, `skutk`, `prowadz`, `wynik` (`scripts/rpl/pairs.mjs:24-60`), a `scripts/fr012/terms-copy.test.mjs:45-52` filtruje `PRIVACY_COPY`. Zdania z kontraktu nie przejdą bramki.
- **Fix**: W kontrakcie podać brzmienie bez zakazanych rdzeni (np. „leki razem z całą historią zmian”) i dopisać listę rdzeni do ominięcia, także w sekcji prywatności.
- **Decision**: FIXED

### F2 — Test SQL nie odpala odroczonych wyzwalaczy

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Faza 1, §3 Testy SQL (DELETION 4)
- **Detail**: Plik testów działa w `begin … rollback`, więc wyzwalacze `deferrable initially deferred` (`symptom_entries_require_item`, `symptom_entry_items_require_item`, `symptom_journal.sql:468-476`) nigdy się nie wykonują. ISOLATION 6 i TERMS 4 mają tę samą lukę. Zachowanie przy zatwierdzeniu transakcji sprawdza dziś tylko smoke.
- **Fix**: W DELETION 4 zaraz po usunięciu dodać `set constraints public.symptom_entries_require_item, public.symptom_entry_items_require_item immediate;`, potem przywrócić `deferred` — wzorzec z `symptom_journal_checks.sql:128-134`.
- **Decision**: FIXED

### F3 — INVARIANT 7 nie ma listy wyjątków

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Faza 1, §4 Wyjątek w INVARIANT 7
- **Detail**: Plan mówi „lista wyjątków… tak jak przy funkcjach okna korekty”, ale takiej listy nie ma. Komentarz `schema_invariants_checks.sql:351-357` tylko ją zapowiada. Funkcje okna korekty są sprawdzane w innym kroku (`:378-389`), czy istnieją jako `security definer`, a nie są z niczego wyłączane. `delete_own_account` będzie pierwszym wyjątkiem i mechanizm trzeba zbudować.
- **Fix**: W kontrakcie nazwać trzy zmiany: (1) wyłączyć sygnaturę z warunku `authenticated` w kroku `:391-399`, ale nie z warunku `anon`; (2) dodać osobny krok, który pada, gdy funkcji brak albo nie jest `security definer`; (3) wyjątek nie zwalnia z kroku `search_path` (`:401-408`).
- **Decision**: FIXED

### F4 — Test menu porównuje dokładną listę

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Faza 2, §1 Menu
- **Detail**: Plan pisze „aktualizacja testu, jeśli liczy pozycje”. Test zawsze padnie, bo `scripts/navigation/navigation.test.mjs:43-50` porównuje dokładnie `["/leki","/dzienniczek","/wizyta"]`. Pasek zakładek telefonu (`AppLayout.astro:73-77`, `flex` / `flex-1`) zmieści 4 pozycje bez zmian w kodzie; wygląd sprawdza ręczny krok 2.5.
- **Fix**: Zamienić „jeśli” na zmianę obowiązkową: nowy test, że `/konto` jest czwartą pozycją i należy do `INTERIOR_ROUTES`.
- **Decision**: FIXED

### F5 — Pomocnicze funkcje SQL trzeba zdefiniować w nowym pliku

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Faza 1, §3 Testy SQL
- **Detail**: Funkcje `pg_temp.*` żyją tylko w obrębie jednego pliku. `create_account` jest wyłącznie w `terms_checks.sql:33-42`. Obecne `act_as` (np. `correction_window_checks.sql:55-66`) nie dokłada `amr`. `account_data_tables()` ma już 2 kopie z komentarzem „trzymaj identyczne” (`account_isolation_checks.sql:44-57`, `schema_invariants_checks.sql:48`).
- **Fix**: Zapisać, że nowy plik definiuje własne `act_as(uid, amr jsonb)` i `create_account`, a tabele konta bierze z katalogu bazy (tablice z kolumną `user_id` → `auth.users`), bez trzeciej kopii listy.
- **Decision**: FIXED (Fix A — corrected during triage: a catalog filter on `user_id` would miss child tables, so a third copy of `account_data_tables()` plus an id snapshot before deletion)
