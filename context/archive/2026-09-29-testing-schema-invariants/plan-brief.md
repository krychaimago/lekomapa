# Niezmienniki schematu dla każdej tabeli — Plan Brief

> Full plan: `context/changes/testing-schema-invariants/plan.md`
> Research: `context/changes/testing-schema-invariants/research.md`

## What & Why

Faza 2 rolloutu testów (ryzyka #1, #3, #6). Nowa tabela z danymi konta bez RLS na każdą operację albo bez usuwania razem z kontem ma wywrócić CI, zanim S-02 i S-05 dodadzą swoje tabele. Dziś każda bramka ma listę tabel wpisaną ręcznie, więc nowa tabela bez ochrony przechodzi na zielono.

## Starting Point

- 3 tabele konta i 5 wspólnych.
- Sprawdzenia SQL biegną w CI od fazy 1, ale na ręcznych listach tabel.
- Zmierzone luki:
  - `TRUNCATE` dla `anon`/`authenticated` na tabelach konta (omija RLS),
  - `EXECUTE` funkcji okna korekty dla `anon`.
- Kaskada usunięcia konta działa, ale żadna bramka jej nie sprawdza.

## Desired End State

- Zbiór tabel konta bramka wyprowadza z katalogu bazy: to tabele, do których prowadzi łańcuch kluczy obcych od `auth.users`.
- Dla każdej takiej tabeli, także przyszłej, bramka wymaga:
  - struktury: RLS, polityki SELECT/INSERT/UPDATE/DELETE, kaskada, brak `TRUNCATE`,
  - zachowania: izolacja na dwóch kontach i `anon`, usunięcie z kontem przy zamkniętym oknie.
- Tabela bez danych testowych oblewa bramkę z instrukcją, co dopisać.
- Obie luki uprawnień zamknięte migracją, także na produkcji.

## Key Decisions Made

| Decision                    | Choice                                                                           | Why (1 sentence)                                                                                       | Source                         |
| --------------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------ |
| Luki `TRUNCATE` i `EXECUTE` | Migracja w tej fazie                                                             | Bramka od razu zielona, luka zamknięta przed S-05                                                      | Plan                           |
| Dowód zachowania            | Pętle ISOLATION po zbiorze z katalogu + mapa danych testowych; brak wpisu = FAIL | Sama struktura przepuści politykę, która nie wiąże wiersza z kontem („jest RLS, więc izolacja działa”) | Plan                           |
| Tabele wspólne              | Jawna lista 5 nazw; tabela spoza domknięcia i listy = FAIL                       | Tabela z `user_id` bez klucza nie wypadnie po cichu                                                    | Plan (rekomendacja z Research) |
| Strażnicy historii          | Lista ręczna w teście (nazwa, tabela, `tgenabled`)                               | Strażnik nie wynika ze struktury bazy                                                                  | Research                       |
| Predykat tabel konta        | Domknięcie kluczy obcych do `auth.users`                                         | Łapie 3 z 3 tabel; `user_id` łapie 1 z 3                                                               | Research                       |
| Zakres dodatkowy            | F3 (kontrprzykład właściciela) + checklista §6.4; smoke zostaje ręczne           | Domyka otwarty finding, S-02/S-05 dostają gotową listę                                                 | Plan                           |
| Odebranie `anon`            | Tylko `TRUNCATE`, nie SELECT                                                     | `revoke select` zamieniłby pusty wynik PostgREST na błąd i wywrócił smoke                              | Plan                           |
| Okno korekty po S-05        | Poza zakresem                                                                    | Prawdziwa logika okna należy do S-05                                                                   | Research                       |

## Scope

**In scope:**

- migracja `revoke truncate` + `revoke execute … from anon`,
- `supabase/tests/schema_invariants_checks.sql` (8 reguł katalogu),
- przeróbka `account_isolation_checks.sql` na zbiór z katalogu, F3, ISOLATION 6 (usunięcie konta),
- 4 nowe próbki w CI, każda z oczekiwanym komunikatem,
- test-plan §6.4, odsyłacze w README i `CLAUDE.md`.

**Out of scope:**

- logika okna korekty (S-05),
- synchronizacja `smoke.mjs` z katalogiem,
- przepisanie starych sprawdzeń w `rls_checks.sql`,
- `alter default privileges`,
- ochrona UPDATE na `medications` (S-02),
- usuwanie konta w aplikacji (S-09).

## Architecture / Approach

Katalog wyznacza zbiór, zachowanie dowodzi dla każdego jego elementu.

- **Warstwa katalogu** (`schema_invariants_checks.sql`) sprawdza strukturę i klasyfikację tabel.
- **Warstwa zachowania** (`account_isolation_checks.sql`) iteruje po tym samym zbiorze na dwóch kontach i `anon`, łącznie z usunięciem konta przy oknie podmienionym na `false`.

Każda reguła ma próbkę w CI: DDL psujący schemat wewnątrz transakcji pliku plus treść pliku sprawdzeń. Próbka musi wywrócić bramkę konkretnym komunikatem.

## Phases at a Glance

| Phase                                    | What it delivers                                  | Key risk                                                                 |
| ---------------------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------ |
| 1. Migracja uprawnień i reguły katalogu  | Zamknięte luki, 8 reguł katalogu, 3 próbki        | DDL próbki poza transakcją zostaje w bazie (wykrywane przez INVARIANT 1) |
| 2. Izolacja i usunięcie konta z katalogu | ISOLATION 0–6 po zbiorze z katalogu, F3, 1 próbka | Czytanie mapy danych po zmianie roli; rozjazd dwóch kopii predykatu      |
| 3. Checklista i odsyłacze                | test-plan §6.4, README, `CLAUDE.md`               | Checklista jedynym strażnikiem smoke                                     |

**Prerequisites:**

- `npx supabase start` lokalnie,
- zielony `smoke` na commicie z migracją przed `db push`.

**Estimated effort:** ~3 sesje, faza 2 największa.

## Open Risks & Assumptions

- `db push` na produkcję robi autorka ręcznie po merge'u. Do tego czasu produkcja ma stare uprawnienia. Luka jest nieosiągalna przez PostgREST, więc ryzyko jest niskie.
- Zakładamy, że domyślne uprawnienia na produkcji odpowiadają lokalnym. Pomiar `has_table_privilege` po `db push` to potwierdza.
- Rozjazd `smoke.mjs` z katalogiem łapie tylko checklista, nie bramka.

## Success Criteria (Summary)

- Migracja z nową tabelą bez RLS, bez kaskady, z `TRUNCATE` albo bez danych testowych daje czerwony `smoke` z nazwą złamanej reguły.
- Usunięcie konta przy zamkniętym oknie kasuje wszystkie jego wiersze we wszystkich tabelach konta, a konto sąsiednie zostaje nietknięte. Bramka to sprawdza.
- Autorka wie z §6.4, czego potrzebuje tabela z S-05.
