# Bramka SQL w CI — Plan Brief

> Full plan: `context/changes/testing-sql-gate-in-ci/plan.md`
> Research: `context/changes/testing-sql-gate-in-ci/research.md`

## What & Why

Sprawdzenia SQL (RLS, wyzwalacze historii, niezmienniki danych) mają biec w CI przed buildem, a nie wyłącznie ręcznie. Merge do `main` wdraża na produkcję, a migracje idą na produkcję ręcznym `db push`. Regresja RLS albo historii może więc dziś trafić na produkcję niezauważona (ryzyko #4). Przy okazji zmiana domyka braki dowodu dla izolacji kont (#1) i nienaruszalności historii (#3).

## Starting Point

- `supabase/tests/rls_checks.sql` (18 sprawdzeń) uruchamia się ręcznie poleceniem, które na maszynie autorki nie działa: łapie dwa kontenery i kończy się kodem 127.
- Kod ≠ 0 przy porażce zależy od jednej linii w pliku.
- Izolacja jest sprawdzana tylko przez katalog (SQL) i przez smoke dla SELECT/UPDATE/DELETE.
- Okno korekty jest przywracane wpisanym `return true`.
- Ochrona gałęzi `main` jest niedostępna (plan GitHub Free, zmierzone: 403).

## Desired End State

- Job `smoke` ma krok „SQL checks”. Najpierw dowodzi, że bramka umie być czerwona, potem uruchamia wszystkie `supabase/tests/*.sql`.
- Złamane sprawdzenie daje czerwony krok z identyfikatorem sprawdzenia, a deploy się nie wykonuje.
- Drugie konto i `anon` są sprawdzane per operacja na 3 tabelach kont, każda blokada z kontrprzykładem właściciela.
- Reguła „zmiana dawki zamyka okres i otwiera nowy” jest sprawdzona także w pozytywnej połowie.

## Key Decisions Made

| Decision                     | Choice                                                                                              | Why (1 sentence)                                                              | Source   |
| ---------------------------- | --------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | -------- |
| Co blokuje czerwona bramka   | Deploy (`needs`), merge dyscypliną z README                                                         | Ochrona gałęzi wymaga Pro albo repo publicznego; blokada deployu jest darmowa | Plan     |
| Miejsce w CI                 | Krok w jobie `smoke` przed buildem                                                                  | Baza stawiana raz, porażka po ~2 min                                          | Plan     |
| Sposób uruchomienia          | `docker exec … psql -X -v ON_ERROR_STOP=1` przez `scripts/db-checks.mjs`                            | `supabase db query -f` nie wykona pliku                                       | Research |
| Dowód „nie zawsze 0”         | Dwie próbki w każdym biegu CI + znacznik `GATE_COMPLETE` + kontrola migracji                        | Bramka nie ufa samym plikom SQL                                               | Plan     |
| Zakres sprawdzeń             | Zachowanie RLS per operacja + krok zamknij/otwórz okres                                             | Intencje #1 „per operacja” i #3 wprost                                        | Plan     |
| Rozpoznanie blokady historii | `P0001` + treść „okno korekty jest już zamknięte” + nazwa pola                                      | Bez nowej migracji na produkcję                                               | Plan     |
| Przywracanie okna korekty    | Savepoint + odcisk definicji funkcji                                                                | Działa bez zmian po S-05                                                      | Plan     |
| Rozpoznanie blokady RLS      | Wyłącznie `42501` przy INSERT/przepięciu; `row_count = 0` + kontrprzykład przy UPDATE/DELETE/SELECT | Zmierzone 2026-09-28 na lokalnej bazie                                        | Plan     |

## Scope

**In scope:**

- runner `npm run db:check` z testami jednostkowymi i próbkami czerwieni,
- krok w CI,
- README,
- nazwany błąd, savepoint, sprawdzenie 19 w `rls_checks.sql`,
- nowy `account_isolation_checks.sql`,
- cookbook §6.2 w test-planie.

**Out of scope:**

- lista tabel wyprowadzona z katalogu (faza 2),
- granty `TRUNCATE`/`EXECUTE`,
- własny SQLSTATE w wyzwalaczach,
- kaskada usunięcia konta (#6),
- ochrona gałęzi w GitHubie,
- osobny job CI,
- zmiany w `smoke.mjs`,
- tłumaczenie istniejących sprawdzeń.

## Architecture / Approach

`scripts/db-checks.mjs` czyta `project_id` z `supabase/config.toml` i łączy się z kontenerem `supabase_db_<project_id>`. Kolejne kroki:

1. Sprawdza, że każda migracja z repo jest w `schema_migrations`.
2. Każdy plik z `supabase/tests/` puszcza przez `psql` z `ON_ERROR_STOP` z wiersza poleceń.
3. Plik uznaje za zaliczony tylko przy kodzie 0 **i** notice `GATE_COMPLETE <plik>`.

Krok CI odpala najpierw dwie próbki (muszą być czerwone), potem właściwy bieg.

## Phases at a Glance

| Phase            | What it delivers                                                     | Key risk                                                                                                       |
| ---------------- | -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| 1. Bramka w CI   | Istniejące 18 sprawdzeń biegnie w CI i umie być czerwone             | Bramka zielona bez wykonania (np. zły kontener) — pilnują próbki i znacznik                                    |
| 2. Historia (#3) | Nazwany błąd, okno przez savepoint, sprawdzenie 19                   | Savepoint cofający dane potrzebne sprawdzeniu 8 — dane powstają przed savepointem, sprawdzenie 8 to potwierdza |
| 3. Izolacja (#1) | Macierz 3 tabele × 4 operacje × (konto B, `anon`) z kontrprzykładami | Rola cofnięta razem z podtransakcją, więc kroki biegną jako `postgres` — asercja `current_user` w każdym bloku |

**Prerequisites:** lokalny Supabase (`npx supabase start`), Docker, `gh` do obejrzenia CI.
**Estimated effort:** ~3 sesje, po jednej na fazę.

## Open Risks & Assumptions

- Na świeżym runnerze kontener nazywa się `supabase_db_10x-astro-starter` (wniosek z `config.toml`, niezmierzony w CI). Jeśli nie, pierwszy bieg fazy 1 pokaże czerwony krok z nazwą kontenera.
- Merge czerwonego PR jest technicznie możliwy. Chroni tylko dyscyplina z README i blokada deployu. Migracja z takiego PR i tak czeka na ręczny `db push`.
- Po S-05 sprawdzenie 8 i kontrprzykłady DELETE właściciela potrzebują otwartego okna. Zapisane w komentarzu w pliku, do uwzględnienia w planie S-05.
- Próbny PR z fazy 3 zawiera psującą migrację: nie mergować, zamknąć i usunąć gałąź.

## Success Criteria (Summary)

- PR łamiący RLS albo wyzwalacz historii ma czerwony krok „SQL checks” z identyfikatorem sprawdzenia, a deploy się nie wykonuje.
- Bramka nie przechodzi bez kontenera, bez kompletu migracji ani bez znacznika ukończenia.
- Każda operacja na każdej tabeli z danymi konta ma dowód blokady dla konta B i `anon` oraz kontrprzykład właściciela.
