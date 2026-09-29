---
date: 2026-09-28T21:34:11+02:00
researcher: Claude (Opus 5.5) dla Krycha Imago
git_commit: 95accb5c88b37fc2858b90c3bf95af379d964163
branch: main
repository: krychaimago/lekomapa
topic: "Bramka SQL w CI — co dziś sprawdza rls_checks.sql, jak go uruchomić w CI i czego brakuje dla ryzyk #4, #1, #3"
tags: [research, ci, supabase, rls, sql-checks, smoke, test-plan-phase-1]
status: complete
last_updated: 2026-09-28
last_updated_by: Claude (Opus 5.5)
---

# Research: Bramka SQL w CI

**Date**: 2026-09-28T21:34:11+02:00
**Researcher**: Claude (Opus 5.5) dla Krycha Imago
**Git Commit**: 95accb5c88b37fc2858b90c3bf95af379d964163
**Branch**: main
**Repository**: krychaimago/lekomapa

## Research Question

Faza 1 rolloutu z `context/foundation/test-plan.md` („Bramka SQL w CI”), ryzyka #4, #1, #3:

1. Jak dziś działa `supabase/tests/rls_checks.sql` i czy jego wynik zamienia się na kod wyjścia, który może wywrócić CI?
2. Jak job CI stawia bazę i którędy najtaniej wpiąć w niego sprawdzenia SQL bez ryzyka pójścia do produkcji?
3. Co sprawdzenia SQL i smoke razem pokrywają dla izolacji kont (#1) per tabela × operacja, a czego nie?
4. Co pokrywają dla nienaruszalności historii (#3) — zmiana dawki zamyka okres, rdzeń po oknie korekty nie do zmiany, blokada po nazwanym błędzie?

## Summary

- **Sprawdzenia SQL nie biegną w CI.** `.github/workflows/ci.yml` ma trzy joby (`ci`, `smoke`, `deploy`); żaden nie uruchamia `rls_checks.sql` (`.github/workflows/ci.yml:10-78`). Plik powstał jako bramka ręczna (`supabase/tests/rls_checks.sql:8-11`, `README.md:94-97`). Migracje trafiają na produkcję ręcznie przez `npx supabase db push` (`context/archive/2026-09-22-medication-schema-rls/plan.md:326`), więc CI jest ostatnim automatem przed deployem kodu.
- **Mechanizm kodu wyjścia działa — zmierzone lokalnie 2026-09-28 na bazie z sześcioma migracjami.** Bieżący plik przechodzi z kodem 0 i wypisuje `OK` dla sprawdzeń 1–18. Celowo rzucony `raise exception` przy `\set ON_ERROR_STOP on` daje kod **3** i linię `ERROR: CHECK X FAILED: …`. Ten sam błąd **bez** `ON_ERROR_STOP` daje kod **0**. Dziś jedyną ochroną przed „bramką zawsze zieloną” jest linia `\set ON_ERROR_STOP on` wewnątrz pliku (`supabase/tests/rls_checks.sql:22`).
- **Najtańsze miejsce w CI to job `smoke`.** Już stawia lokalny Supabase z migracjami (`.github/workflows/ci.yml:36-43`), a `.env` pisze z `supabase status` (`:43-48`). Krok SQL wpięty tam idzie do kontenera bazy na runnerze, więc nie ma drogi do produkcji. Alternatywy `supabase db query -f` (CLI 2.117.0) nie da się użyć: odrzuca plik błędem `cannot insert multiple commands into a prepared statement` oraz metapolecenie `\set` (zmierzone).
- **#1 (izolacja) — SQL dziś sprawdza tylko katalog, nie zachowanie.** Skrypt chodzi jako `postgres`, więc polityk nie przechodzi (`supabase/tests/rls_checks.sql:13-16`). Zachowanie mierzy smoke na dwóch kontach: SELECT/UPDATE/DELETE cudzego wiersza i SELECT bez sesji, na 3 tabelach kont (`scripts/smoke.mjs:193-281`). **Nie pokrywa**: INSERT pod cudze konto, przepięcia wiersza podrzędnego pod cudzy lek, zapisów roli `anon`. **Zmierzone**: w SQL da się wejść w rolę użytkownika (`set local role authenticated` + `set_config('request.jwt.claims', …, true)`) — `auth.uid()` zwraca podany `sub`, RLS działa (0 z 14 leków widocznych, `UPDATE 0` bez błędu).
- **#3 (historia) — rdzeń po oknie jest sprawdzany nazwanym błędem, zmiana dawki tylko częściowo.** Sprawdzenia 5–7 łapią wyłącznie `sqlstate 'P0001'` (`supabase/tests/rls_checks.sql:289-424`); w pliku nie ma `when others`. „Zmiana dawki zamyka okres i otwiera nowy” to konwencja, nie reguła bazy. Plik sprawdza zakaz nadpisania `dose_text` (5b) i zamknięcie okresu (5d), ale **nie** sprawdza, że po zamknięciu da się otworzyć nowy, przylegający okres.
- **Znana pułapka na S-05:** okno korekty to zaślepka `return true` (`supabase/migrations/20260922120000_medication_schema.sql:222-236`). Plik podmienia ją na `false`, a potem „przywraca” wpisanym na sztywno `return true` (`supabase/tests/rls_checks.sql:440-450`) i sprawdza, że okno jest otwarte (`:1216-1223`). Po podmianie treści funkcji w S-05 ta sekwencja przestanie odtwarzać stan z migracji.

## Detailed Findings

### 1. Obecna bramka SQL: struktura i kod wyjścia

- 18 numerowanych sprawdzeń w jednej transakcji z `rollback` na końcu (`supabase/tests/rls_checks.sql:24`, `:1225`). Kolejność: 1–16, 18, 17 i sprawdzenie końcowe. 18 stoi przed 17 celowo (`:6`, `:878-880`).
- Każde sprawdzenie to blok `do $$ … $$`, który przy porażce rzuca `raise exception '<N> NIEUDANE/FAILED: …'` z numerem sprawdzenia w treści, np. `:42`, `:374`, `:500`.
- **Pomiar lokalny (2026-09-28, kontener `supabase_db_10x-astro-starter`, 6 migracji w `supabase_migrations.schema_migrations`)**:
  - pełny plik, `docker exec -i … psql -U postgres -d postgres -f -`: kod **0**, notatki `OK` dla sprawdzeń 1–18 i końcowego;
  - plik z `\set ON_ERROR_STOP on` i jednym `raise exception 'CHECK X FAILED: probe'`: kod **3**, stderr `psql:<stdin>:3: ERROR:  CHECK X FAILED: probe`;
  - ten sam błąd bez `ON_ERROR_STOP`: kod **0** (psql wykonał dalej `ROLLBACK`).
- Wniosek: błąd wskazuje złamane sprawdzenie numerem w treści. Kod różny od zera zależy od jednej linii w pliku. Archiwalny plan F-03 uruchamiał go z `-v ON_ERROR_STOP=1` w wierszu poleceń (`context/archive/2026-09-26-symptom-catalog-seed/plan.md:115`); `README.md:97` i nagłówek pliku (`:11`) tego nie robią.
- **Polecenie z README na tym komputerze nie działa**: `docker ps -qf name=supabase_db` jest filtrem podciągu. Lokalnie zwraca 2 kontenery (`supabase_db_10x-astro-starter` i `supabase_db_lekomapa-app-shell`), a polecenie kończy się kodem **127** (zmierzone). Na świeżym runnerze CI zakładam jeden kontener — nie mierzone. Nazwa kontenera wynika z `project_id = "10x-astro-starter"` (`supabase/config.toml:5`), więc da się ją podać wprost: `supabase_db_10x-astro-starter`.
- Nagłówek `supabase/tests/rls_checks.sql:8` („Supabase CLI nie wykonuje SQL”) — **częściowo nieaktualny**: CLI 2.117.0 ma `supabase db query --local -f`. Sedno pozostaje prawdziwe — ta komenda nie wykona tego pliku (patrz Summary).
- `psql` nie jest zainstalowany na tej maszynie (`which psql` → brak). Obecność `psql` na `ubuntu-latest` nie była sprawdzana; `docker exec` do kontenera bazy tego nie wymaga.
- `supabase test db` (pgTAP, `pg_prove`) istnieje w CLI 2.117.0 i domyślnie uruchamia pliki z `supabase/tests/`. W repozytorium nie ma o nim żadnej wzmianki (przeszukane: README, `context/**`, `scripts/`, CI). Plik nie jest w formacie TAP. Nie sprawdzałam, jak `supabase test db` zachowa się na pliku bez TAP.

### 2. Jak CI stawia bazę

- Job `smoke`: `supabase/setup-cli@v1` z `version: latest` (`.github/workflows/ci.yml:36-38`), `supabase start -x studio,imgproxy,…` (`:40-42`), `.env` i `.dev.vars` z `supabase status -o env` (`:43-48`), build, preview, `npm run smoke` (`:49-54`), `supabase stop --no-backup` przy `always()` (`:55-56`).
- Że `supabase start` stosuje `supabase/migrations/*` na świeżej bazie — wniosek pośredni, nie zmierzony w CI: smoke wstawia do `medications` (`scripts/smoke.mjs:159`) i wymaga wiersza w tabelach współdzielonych (`:381`), co bez migracji by nie przeszło.
- `[db.seed] sql_paths = ["./seed.sql"]` (`supabase/config.toml:60-65`), a `supabase/seed.sql` nie istnieje. Świadomie: dane produktu wchodzą migracjami (`context/archive/2026-09-23-interaction-rules-seed/plan.md:30`).
- `deploy` zależy od `needs: [ci, smoke]` (`.github/workflows/ci.yml:59`). Czerwony krok SQL w `smoke` zatrzymuje więc deploy przy pushu do `main`. Czy PR jest blokowany przed merge'em, zależy od ustawień ochrony gałęzi w GitHubie — **nie sprawdzone** (nie ma ich w repozytorium).
- Wersja CLI w CI jest ruchoma (`latest`); lokalnie mierzone na 2.117.0, obraz Postgres 17.6.1.166.

### 3. Izolacja kont (#1) — co jest pokryte

Tabele z danymi konta (3): `medications` (`user_id → auth.users on delete cascade`, `supabase/migrations/20260922120000_medication_schema.sql:19`), `medication_substances` i `dosage_periods` (konto tylko przez `medication_id → medications`, `:47`, `:73`). Tabele współdzielone (5): `registry_products`, `registry_substances`, `interaction_pairs`, `symptoms`, `symptom_search_terms`.

Polityki (wszystkie dla `authenticated`, po jednej na operację):

- `medications`: `user_id = auth.uid()` w USING/WITH CHECK (`…medication_schema.sql:113-128`);
- tabele podrzędne: `exists (select 1 from public.medications m where m.id = medication_id and m.user_id = auth.uid())`, UPDATE z USING i WITH CHECK (`:134-216`). WITH CHECK na UPDATE blokuje przepięcie pod cudzy lek — wniosek z treści polityki, nie z pomiaru.

| Tabela konta × operacja                  | SQL (`rls_checks.sql`)                                                      | smoke (`scripts/smoke.mjs`)                                           |
| ---------------------------------------- | --------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| SELECT cudzego                           | tylko katalog: RLS włączone, 4 polityki, rola `{authenticated}` (`:30-109`) | tak, 0 wierszy; błąd = FAIL (`:216-236`)                              |
| UPDATE cudzego                           | katalog                                                                     | tak, 0 zwróconych wierszy + odczyt właściciela bez zmian (`:237-267`) |
| DELETE cudzego                           | katalog                                                                     | tak, jw.                                                              |
| INSERT pod cudze konto / cudzy lek       | katalog                                                                     | **brak**                                                              |
| UPDATE przepinający wiersz pod cudzy lek | katalog                                                                     | **brak**                                                              |
| `anon` SELECT                            | katalog (rola dokładnie `{authenticated}`, `:97-105`)                       | tak, 0 wierszy (`:268-279`)                                           |
| `anon` INSERT/UPDATE/DELETE              | katalog                                                                     | **brak**                                                              |

- Smoke nie traktuje żadnego błędu jako sukcesu: przy RLS błąd = FAIL, przy tabelach współdzielonych wymaga dokładnie `42501` (`scripts/smoke.mjs:250-254`, `:365-367`). Kroki izolacji biegną tylko przy lokalnym `SUPABASE_URL` albo `SMOKE_ALLOW_REMOTE_WRITES=1` (`:42-53`, `:440-444`); w trybie istniejącego konta drukują SKIP i nie wywracają biegu.
- Lista tabel w smoke jest wpisana ręcznie (`:193-212`). Wyprowadzenie z katalogu to faza 2 test-planu, poza tą zmianą.
- **Zmierzone uprawnienia (lokalnie)**: `anon` i `authenticated` mają SELECT, INSERT, UPDATE, DELETE i **TRUNCATE** na wszystkich 3 tabelach kont (domyślne granty Supabase; migracje nie mają tam `revoke`). RLS pilnuje wierszy, ale TRUNCATE omija RLS i wyzwalacze wierszowe. PostgREST nie wystawia TRUNCATE, więc droga istnieje tylko przy bezpośrednim połączeniu z bazą. `anon` ma też EXECUTE na `medication_correction_window_open` mimo `revoke … from public` (`…medication_schema.sql:246-247`). Dziś to nieszkodliwe (funkcja zwraca `true`); po S-05 funkcja `security definer` będzie czytać tabelę dzienniczka.
- **Zmierzone wejście w rolę w SQL**: w transakcji `set local role authenticated; select set_config('request.jwt.claims','{"sub":"<uuid>","role":"authenticated"}', true);` → `auth.uid()` = podany uuid, `current_user` = `authenticated`, `select count(*) from public.medications` = 0 (w bazie 14), `update public.medications … where true` → `UPDATE 0` bez błędu. Sprawdzenia SQL mogą więc mierzyć polityki per operacja na dwóch syntetycznych kontach, z tym samym zastrzeżeniem co smoke: przy RLS „brak błędu i 0 wierszy” to wynik oczekiwany, a nie dowód, więc potrzebny jest kontrprzykład (właściciel widzi i zmienia swój wiersz).

### 4. Nienaruszalność historii (#3) — co jest pokryte

- Wyzwalacze (wszystkie `raise exception` bez ERRCODE → SQLSTATE `P0001`): `medication_substances_guard_core`, `dosage_periods_guard_core`, `medication_substances_guard_delete`, `dosage_periods_guard_delete`, `medications_guard_delete` (`…medication_schema.sql:253-408`); `symptoms_guard_key` (`supabase/migrations/20260926120000_symptom_catalog_schema.sql:76-93`).
- Każdy z pięciu wyzwalaczy leków pyta wyłącznie `medication_correction_window_open()`, dziś zaślepkę `return true` (`…medication_schema.sql:222-236`, komentarz `:239`). W bazie z migracji wyzwalacze są bezczynne; sprawdzenia 5–7 przechodzą, bo plik podmienia funkcję (`supabase/tests/rls_checks.sql:262-272`). Dług jest zapisany w roadmapie jako warunek S-05 (`context/archive/2026-09-22-medication-schema-rls/reviews/impl-review.md:126-128`).
- Pokrycie w `rls_checks.sql`, na ścieżce tego pliku:
  - okres nakładający się → `exclusion_violation`, okres zerowej długości → `check_violation` (`:170-216`);
  - okno zamknięte: zmiana `substance_name`, `dose_text`, `started_on`, podmiana ustawionego `ended_on`, przepięcie `medication_id` (obie tabele), wyczyszczenie `atc_code` → `P0001` (`:279-379`);
  - okno zamknięte: zamknięcie trwającego okresu przechodzi (5d, `:319-327`);
  - okno zamknięte: usunięcie wiersza podrzędnego i leku → `P0001` (`:385-434`);
  - okno otwarte: usunięcie leku z kaskadą przechodzi (`:456-468`).
- **Brak dla intencji #3**:
  - nie ma kroku „po zamknięciu okresu wstaw nowy, przylegający (`started_on` = `ended_on` poprzedniego) z nową dawką i sprawdź, że oba istnieją” — czyli pozytywnej połowy „zmiana dawki zamyka okres i otwiera nowy”. Konwencja nie jest wymuszona w bazie; przy otwartym oknie (dziś zawsze) `dose_text` da się nadpisać w miejscu;
  - `P0001` to kod każdego `raise exception` bez ERRCODE, nie tylko wyzwalaczy historii. Sprawdzenie 17n dodatkowo porównuje treść komunikatu (`:1195-1204`); sprawdzenia 5–7 porównują tylko SQLSTATE. Nazwany kod wyzwalacza (własny ERRCODE albo porównanie prefiksu komunikatu) zawęziłby dowód;
  - nie ma kaskady usunięcia konta przy zamkniętym oknie (`medications_guard_delete` przepuszcza, gdy nie ma wiersza w `auth.users`, `…medication_schema.sql:370-388`) — to dotyka ryzyka #6 i fazy 2.
- Wyzwalacze nie chronią UPDATE na `medications` ani INSERT na tabelach podrzędnych przy zamkniętym oknie (`…medication_schema.sql:390-408`). To stan schematu, nie luka bramki; odnotowane dla planowania, poza zakresem fazy 1.

## Code References

- `.github/workflows/ci.yml:28-56` — job `smoke`: start lokalnego Supabase, `.env`, build, smoke, stop.
- `.github/workflows/ci.yml:58-60` — `deploy` po `needs: [ci, smoke]`, tylko push do `main`.
- `supabase/tests/rls_checks.sql:8-22` — nagłówek, sposób uruchomienia, `\set ON_ERROR_STOP on`.
- `supabase/tests/rls_checks.sql:262-272`, `:440-450` — podmiana i „przywrócenie” funkcji okna korekty.
- `supabase/tests/rls_checks.sql:1216-1223` — sprawdzenie końcowe zakładające `return true`.
- `supabase/migrations/20260922120000_medication_schema.sql:106-216` — RLS i polityki tabel kont.
- `supabase/migrations/20260922120000_medication_schema.sql:222-247` — zaślepka okna, granty.
- `supabase/migrations/20260922120000_medication_schema.sql:253-408` — funkcje i wyzwalacze historii.
- `scripts/smoke.mjs:193-281` — kroki izolacji dwóch kont.
- `scripts/smoke.mjs:42-53` — `isLocalSupabase` i blokada zapisów do zdalnej bazy.
- `supabase/config.toml:5` — `project_id`, z którego wynika nazwa kontenera bazy.
- `README.md:94-97` — ręczne uruchomienie sprawdzeń SQL.

## Architecture Insights

- Dwie warstwy dowodu, różne role: SQL jako `postgres` mierzy katalog, ograniczenia i wyzwalacze; smoke przez PostgREST mierzy polityki na prawdziwych sesjach. Zmierzone wejście w rolę `authenticated` w SQL pozwala przenieść część dowodu izolacji do tańszej warstwy bez HTTP.
- Bramka opiera się na trzech warunkach naraz: `ON_ERROR_STOP` (w pliku), transakcja z rollbackiem (w pliku) i baza lokalna (kontener na runnerze). Tylko trzeci wynika z CI; dwa pierwsze łatwo zgubić edycją pliku.
- Lessons, które ta zmiana musi zachować: „Bramka musi odróżnić blokadę od niewykonania” (nazwany błąd, zmierzony przed ustawieniem warunku), „Lokalne bramki sprawdź pod kątem tego, do której bazy faktycznie idą”, „Ograniczenie na tabeli podrzędnej nie chroni, dopóki rodzic go nie ma”.

## Historical Context (from prior changes)

- `context/archive/2026-09-22-medication-schema-rls/plan.md:210`, `reviews/plan-review.md:63` — wybór `docker exec`, żeby nie klikać w Studio. Nadal trafne.
- `context/archive/2026-09-22-medication-schema-rls/plan.md:326`, `context/foundation/infrastructure.md:104` — migracje na produkcję wykonuje człowiek (`supabase db push`). Nadal trafne; CI nie ma kroku `db push`.
- `context/foundation/infrastructure.md:84`, `:116` — rollback kodu nie cofa migracji. Trafne; uzasadnia sprawdzenie przed merge'em, nie po deployu.
- `context/archive/2026-09-22-medication-schema-rls/reviews/impl-review.md:126-128` — wyzwalacze bezczynne do S-05. Trafne.
- `README.md:92` — „dopiero te kroki [smoke] robią z niej fakt sprawdzany w CI”. Trafne dla izolacji; nieprawdziwe byłoby rozszerzenie tego na sprawdzenia SQL.

## Related Research

- Nie dotyczy — brak wcześniejszych `research.md` o bramkach CI w `context/changes/**` i `context/archive/**`.

## Open Questions

- **Ochrona gałęzi `main`**: czy status joba `smoke` jest wymagany przed merge'em PR? Poza repozytorium; bez tego czerwona bramka blokuje deploy, ale nie merge. Do sprawdzenia w ustawieniach GitHuba (`gh api repos/krychaimago/lekomapa/branches/main/protection`).
- **Osobny job czy krok w `smoke`**: osobny job daje czytelniejszy czerwony status i nie miesza porażki SQL z porażką HTTP, ale stawia bazę drugi raz (koszt minut CI). Decyzja dla `/10x-plan`.
- **Zakres fazy 1 vs faza 2**: dopisanie sprawdzeń zachowania RLS w SQL (INSERT pod cudze konto, przepięcie pod cudzy lek, zapisy `anon`) i kroku „zamknij i otwórz okres” — tu czy w fazie 2? Intencja #1 w `change.md` mówi „per operacja”, co obecny zestaw spełnia tylko dla SELECT/UPDATE/DELETE przez smoke.
- **Przywracanie funkcji okna**: savepoint z `rollback to savepoint` zamiast wpisanego `return true` — do rozstrzygnięcia teraz albo zapisania jako warunek S-05.
- **TRUNCATE i EXECUTE dla `anon`**: stan schematu, nie bramki. Kandydat na sprawdzenie katalogu w fazie 2 albo na lesson.
- **Zachowanie `supabase test db` na pliku bez TAP** i obecność `psql` na `ubuntu-latest` — nie zmierzone; potrzebne tylko, jeśli plan odrzuci `docker exec`.
