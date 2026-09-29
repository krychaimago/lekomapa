# Niezmienniki schematu dla każdej tabeli — Implementation Plan

## Overview

Bramka SQL przestaje polegać na ręcznie wpisanych listach tabel. Zbiór tabel z danymi konta wyprowadza z katalogu bazy: to domknięcie kluczy obcych prowadzących do `auth.users`. Potem dla każdej tabeli z tego zbioru wymaga:

- struktury: RLS, polityki na każdą operację dla `authenticated`, kaskada od konta, brak `TRUNCATE`,
- zachowania: izolacja na dwóch kontach i `anon`, usunięcie razem z kontem przy zamkniętym oknie korekty.

Nowa tabela z S-02 albo S-05, która czegoś z tego nie ma, wywraca `npm run db:check` w CI. Przy okazji migracja zamyka dwie zmierzone luki odłożone z fazy 1: `TRUNCATE` na tabelach konta i `EXECUTE` funkcji okna korekty dla `anon`.

Faza 2 rolloutu z `context/foundation/test-plan.md`, ryzyka #1, #3, #6.

## Current State Analysis

Źródło: `context/changes/testing-schema-invariants/research.md` (pomiary na lokalnej bazie, 6 z 6 migracji zastosowanych).

- **Każda lista tabel w bramkach jest wpisana ręcznie**:
  - `supabase/tests/rls_checks.sql:40,50` (sprawdzenia 1–2),
  - `supabase/tests/account_isolation_checks.sql:92+` (ISOLATION 1–5, literały `values` w każdym bloku),
  - `scripts/smoke.mjs:193-207` (`isolationTargets`).
    Nowa tabela bez RLS przejdzie dziś wszystkie bramki na zielono.
- **Domknięcie kluczy obcych** do `auth.users` w `public` daje dokładnie 3 tabele: `medications`, `medication_substances`, `dosage_periods`. Każda krawędź ma `on delete cascade` (`20260922120000_medication_schema.sql:19,47,73`). Pozostałe 5 tabel `public` to tabele wspólne: `registry_products`, `registry_substances`, `interaction_pairs`, `symptoms`, `symptom_search_terms`.
- **Uprawnienia**: `anon` i `authenticated` mają pełne uprawnienia na 3 tabelach konta, łącznie z `TRUNCATE`, które omija RLS i wyzwalacze wierszy. Tabele wspólne mają je odebrane (`20260924120000_registry_schema.sql:157-159`, `20260926120000_symptom_catalog_schema.sql:143-144`).
- **Funkcja okna**: `proacl` funkcji `medication_correction_window_open` to `{postgres=X, anon=X, authenticated=X, service_role=X}`. `revoke … from public` (MS:246) nie odbiera bezpośrednich nadań Supabase. Po S-05 funkcja stanie się dla `anon` wyrocznią istnienia wpisów.
- **Kaskada od konta** działa przy zamkniętym oknie: `delete from auth.users` zeruje 3 tabele. Ręczne usunięcie leku pada z P0001. Żadna bramka tego nie sprawdza. `rls_checks.sql:588-614` (sprawdzenie 8) testuje kaskadę od leku, nie od konta.
- **Wyzwalacze strażnicze**: jest ich 5, wszystkie `tgenabled = 'O'`. Obecności w katalogu nic nie sprawdza, sprawdzane jest wyłącznie zachowanie (sprawdzenia 5–7 i 19).
- **F3 z fazy 1** (`context/archive/2026-09-28-testing-sql-gate-in-ci/reviews/impl-review.md:59-67`): ISOLATION 4 nie ma kontrprzykładu właściciela.
- **CI**: job `smoke` stawia Supabase z migracjami. Potem puszcza dwie próbki, które muszą wywrócić bramkę, i `npm run db:check` (`.github/workflows/ci.yml:44-64`). Runner bierze każdy `supabase/tests/*.sql` bez rejestracji. Plik jest zielony tylko przy kodzie 0 i linii `GATE_COMPLETE <nazwa>`.
- **Migracje na produkcję** idą ręcznie przez `npx supabase db push` (`README.md`, sekcja Migracje). Deploy ich nie stosuje.

## Desired End State

- Nowa migracja odbiera `TRUNCATE` na 3 tabelach konta od `anon` i `authenticated`. Odbiera też `EXECUTE` na `medication_correction_window_open` od `anon`. Jest zastosowana lokalnie, w CI i na produkcji.
- Nowy plik `supabase/tests/schema_invariants_checks.sql` wyprowadza zbiór tabel konta z katalogu i oblewa bramkę, gdy:
  - tabela `public` nie należy ani do domknięcia, ani do jawnej listy 5 tabel wspólnych (albo należy do obu),
  - klucz obcy prowadzący do `auth.users` albo do tabeli konta nie ma `on delete cascade`,
  - tabela nie ma RLS,
  - tabela konta nie ma polityki dla każdej z komend SELECT/INSERT/UPDATE/DELETE, polityka jest dla roli innej niż `authenticated` albo nie ma wyrażenia,
  - tabela wspólna ma politykę inną niż SELECT albo uprawnienie zapisu dla `anon`/`authenticated`,
  - `anon` albo `authenticated` ma `TRUNCATE` na dowolnej tabeli `public`,
  - `anon` ma `EXECUTE` na funkcji `security definer` w `public`, która nie jest wyzwalaczem,
  - któregoś z 5 strażników historii brakuje albo jest wyłączony.
- `supabase/tests/account_isolation_checks.sql` bierze zbiór tabel z tego samego predykatu, a dane testowe z mapy per tabela:
  - tabela z domknięcia bez wpisu w mapie oblewa bramkę komunikatem, co dopisać,
  - wpis w mapie dla tabeli spoza domknięcia też oblewa,
  - ISOLATION 4 ma kontrprzykład właściciela,
  - nowe ISOLATION 6 dowodzi, że usunięcie konta przy zamkniętym oknie kasuje wiersze konta A w każdej tabeli z domknięcia i nie rusza wierszy konta B.
- CI puszcza 4 nowe próbki, każda wywraca bramkę na konkretnym, nazwanym sprawdzeniu:
  - tabela konta bez RLS,
  - klucz do konta z `on delete set null`,
  - tabela z `user_id` bez klucza obcego,
  - tabela z domknięcia bez danych testowych.
- test-plan §6.4 ma checklistę „nowa tabela z danymi konta”, a §6.2, README i `CLAUDE.md` do niej odsyłają.

Weryfikacja: `npm run db:check` przechodzi lokalnie i w CI. Każda próbka pada z oczekiwanym komunikatem. Na produkcji `has_table_privilege('authenticated', 'public.medications', 'TRUNCATE')` zwraca `false`.

### Key Discoveries:

- Predykat „ma kolumnę `user_id`” łapie 1 z 3 tabel konta. Predykat „domknięcie kluczy obcych do `auth.users`” łapie 3 z 3 (research, Architecture Insights).
- `medications.registry_medication_id → registry_products on delete restrict` (RS:187-191) wskazuje od tabeli konta do wspólnej. Nie wciąga więc tabeli wspólnej do domknięcia. Reguła kaskady dotyczy wyłącznie kluczy, których **cel** jest w domknięciu albo jest `auth.users`.
- `create or replace function` zachowuje uprawnienia funkcji. Podmiana okna na `false` w testach i przyszła podmiana treści w S-05 nie przywrócą `EXECUTE` dla `anon`. `drop function` + `create` przywróciłby je z domyślnych uprawnień, i to łapie reguła katalogu.
- `symptoms_guard_key` (SC:76) i funkcje strażników historii zwracają `trigger`. Reguła `EXECUTE` dla `anon` je pomija, bo funkcji wyzwalacza nie da się wywołać wprost.
- PostgREST przy blokadzie RLS dla `anon` zwraca pusty wynik, nie błąd. Kroki smoke tego oczekują. Dlatego migracja odbiera wyłącznie `TRUNCATE`, a nie wszystkie uprawnienia `anon` na tabelach konta: `revoke select` zamieniłby pusty wynik na błąd 401/42501 i wywrócił smoke.
- Wzorzec podmiany okna z przywróceniem: odcisk `md5(pg_get_functiondef(...))`, `savepoint`, `create or replace … return false`, `rollback to savepoint`, porównanie odcisku (`rls_checks.sql:268-301,586,1362-1375`).
- Wszystkie komunikaty strażników historii zawierają „okno korekty jest już zamknięte” i kod P0001 (MS:267-384).

## What We're NOT Doing

- **Prawdziwa logika okna korekty i jej test** — należy do S-05. Sprawdzenia dalej zakładają zaślepkę `return true` dla świeżych wierszy (ISOLATION 0).
- **Automatyczna synchronizacja `scripts/smoke.mjs` `isolationTargets` z katalogiem** — lista zostaje ręczna. Checklista §6.4 każe ją uzupełniać. Rozjazd smoke z katalogiem łapie wyłącznie ta checklista.
- **Przepisanie sprawdzeń 1–2, 9–10 i 15–16 w `rls_checks.sql`** na katalog — zostają jako stare, węższe sprawdzenia. Nowy plik je obejmuje. Usunięcie duplikatów to osobna decyzja.
- **`alter default privileges`** dla przyszłych tabel — każda nowa migracja odbiera `TRUNCATE` jawnie. Reguła katalogu łapie brak odebrania.
- **Odbieranie `anon` uprawnień innych niż `TRUNCATE`** na tabelach konta — zmieniłoby odpowiedź PostgREST z pustego wyniku na błąd i wywróciło smoke.
- **`force row level security`** — właścicielem tabel jest `postgres`, który nie jest drogą dostępu użytkowniczki.
- **Ochrona UPDATE na `medications` i INSERT do tabel podrzędnych przy zamkniętym oknie** — znana luka schematu, UPDATE na `medications` należy do S-02.
- **Mechanizm usuwania konta w aplikacji (S-09)** — faza dowodzi tylko, że kaskada w schemacie kasuje wszystko.
- **Tabele w schematach `auth` i `storage`** — należą do Supabase.
- **Aktualizacja statusu fazy w `test-plan.md §3`** — to robi orkiestrator `/10x-test-plan`.
- **Tłumaczenie polskich komentarzy w istniejących migracjach i `rls_checks.sql`** — osobna decyzja z `CLAUDE.md`. Nowy kod po angielsku.

## Implementation Approach

1. **Najpierw migracja, potem reguły katalogu.** Dzięki tej kolejności nowy plik sprawdzeń jest zielony od pierwszego commita. Bez migracji reguła `TRUNCATE` byłaby czerwona i blokowałaby deploy każdego PR.
2. **Katalog wyznacza zbiór, zachowanie dowodzi dla każdego elementu.** Katalog nie powie, czy polityka faktycznie wiąże wiersz z `auth.uid()` — `using (medication_id is not null)` przejdzie każde sprawdzenie strukturalne. Pętle ISOLATION biorą więc zbiór z katalogu, a brak danych testowych dla tabeli z domknięcia jest porażką, nie pominięciem.
3. **Jedyna lista ręczna to tabele wspólne i strażnicy historii.** Obie wymagają świadomej decyzji przy dodaniu i żadna nie wynika ze struktury bazy.
4. **Każda nowa reguła ma próbkę w CI, która ją wywraca.** Bramka, której nikt nie widział na czerwono, niczego nie dowodzi.

## Critical Implementation Details

**Próbki muszą biec wewnątrz transakcji pliku.** Próbka to DDL psujące schemat, doklejone przed treść pliku sprawdzeń. DDL musi wykonać się **po** `begin;`, inaczej zostanie w bazie na stałe. Wtedy każdy kolejny `npm run db:check` na tej maszynie jest czerwony, a w CI czerwony jest właściwy bieg. Najprostsza forma: próbka zaczyna się od `begin;`. Drugie `begin;` z pliku daje tylko WARNING, a końcowy `rollback;` pliku cofa wszystko. Po próbkach CI uruchamia pełny `npm run db:check`. Reguła podziału tabel wywróci go, jeśli tabela z próbki przetrwała, więc przeciek jest wykrywalny, a nie cichy.

**Jeden predykat domknięcia w dwóch plikach.** Oba pliki definiują tę samą funkcję pomocniczą w `pg_temp` (domknięcie kluczy obcych do `auth.users` w `public`). Rozjazd między kopiami mógłby wyjąć tabelę z testów zachowania. Dlatego `account_isolation_checks.sql` stosuje też regułę podziału (każda tabela `public` jest w domknięciu albo na liście wspólnych). Tabela, która wypadła z jego kopii predykatu, oblewa wtedy w obu plikach. Obie kopie mają komentarz wskazujący na drugą.

**Dane testowe czytane przed zmianą roli.** Mapa danych testowych jest tabelą tymczasową utworzoną jako `postgres`. Pętla `for … in select` z przełączeniem roli w środku może czytać kolejne wiersze już jako `authenticated`/`anon`, bez uprawnień do tej tabeli. Wczytaj mapę do zmiennej (tablica rekordów) przed pętlą albo nadaj rolom `select` na tabeli tymczasowej. Zmierz, która forma działa, zanim ustawisz warunek.

**ISOLATION 6 po wszystkich pozostałych blokach.** Podmienia okno na `false` i usuwa konto A. Biegnie w `savepoint` z `rollback to savepoint` i porównaniem odcisku funkcji okna, według wzorca z `rls_checks.sql`. Kontrprzykład ma dwie części:

- wiersze konta B w każdej tabeli zostają,
- ręczne `delete` leku konta A przy zamkniętym oknie, wykonane przed usunięciem konta, pada z P0001.

Bez drugiej części „wszystko zniknęło” mogłoby oznaczać, że wyzwalacze w ogóle nie działały.

---

## Phase 1: Migracja uprawnień i reguły katalogu

### Overview

Zamyka dwie zmierzone luki uprawnień i dodaje plik, który z katalogu bazy wyprowadza tabele konta i sprawdza ich strukturę. Po tej fazie nowa tabela bez RLS, bez polityki na którąś operację, bez kaskady od konta albo z `TRUNCATE` dla ról klienckich wywraca CI.

### Changes Required:

#### 1. Migracja uprawnień

**File**: `supabase/migrations/20260929120000_revoke_account_truncate_and_window_execute.sql`

**Intent**: Odbiera `TRUNCATE` na tabelach konta (omija RLS i strażników historii) oraz `EXECUTE` funkcji okna korekty od `anon`, zanim S-05 da jej treść czytającą wpisy dzienniczka. Wyrównuje tabele konta do wzorca `revoke` z F-02/F-03.

**Contract**:

- `revoke truncate on public.medications, public.medication_substances, public.dosage_periods from anon, authenticated`,
- `revoke execute on function public.medication_correction_window_open(uuid) from anon`.

`authenticated` zachowuje `EXECUTE` (MS:247). Komentarz w migracji po angielsku wyjaśnia, dlaczego `revoke … from public` z MS:246 nie wystarczył (bezpośrednie nadania z domyślnych uprawnień Supabase). Nic poza tym — żadnych zmian polityk ani danych.

#### 2. Reguły katalogu

**File**: `supabase/tests/schema_invariants_checks.sql` (nowy)

**Intent**: Wyprowadza zbiór tabel konta z katalogu i wymaga dla nich struktury izolacji i usuwania razem z kontem. Jedyne listy ręczne to 5 tabel wspólnych i 5 strażników historii.

**Contract**: Szkielet i konwencje z test-plan §6.2:

- `\set ON_ERROR_STOP on`, `begin; … rollback;`,
- bloki `do $$`, komunikaty `INVARIANT <n> FAILED: …` z nazwą tabeli albo obiektu,
- znacznik `GATE_COMPLETE schema_invariants_checks`,
- żadnego `when others`.

Funkcja pomocnicza `pg_temp.account_data_tables()` zwraca tabele `public` (`relkind in ('r','p')`) osiągalne rekurencyjnie po `pg_constraint` (`contype = 'f'`) od `confrelid = 'auth.users'::regclass`, z głębokością. Komentarz wskazuje na kopię w `account_isolation_checks.sql`.

Rozstrzygnięcia grafu (obie kopie predykatu identycznie):

- zbiór tabel to wynik rekurencji przez `UNION`, bez głębokości w kluczu, więc każda tabela występuje raz,
- głębokość = najdłuższa ścieżka od `auth.users` (`max` po ścieżkach), nie najkrótsza — tabela osiągalna przez `user_id` i przez `medication_id` ma głębokość większą niż `medications`,
- krawędź tabeli do samej siebie (`conrelid = confrelid`, np. okres wskazujący poprzedni okres) nie zwiększa głębokości,
- rekurencja niesie tablicę odwiedzonych tabel i nie wchodzi w tabelę już obecną na ścieżce — cykl się kończy.

Sprawdzenia:

- **INVARIANT 1 — podział tabel**:
  - każda tabela `public` jest w domknięciu albo na liście wspólnych, nigdy w obu,
  - każda nazwa z listy wspólnych istnieje,
  - domknięcie nie jest puste (inaczej zły predykat dałby fałszywą zieleń).
    Komunikat przy tabeli spoza obu zbiorów mówi, że trzeba dodać klucz obcy do konta albo świadomie dopisać tabelę do listy wspólnych.
- **INVARIANT 2 — kaskada**: każdy klucz obcy z tabeli `public`, którego cel jest w domknięciu albo jest `auth.users`, ma `confdeltype = 'c'`.
- **INVARIANT 3 — RLS**: `relrowsecurity` na każdej tabeli `public`.
- **INVARIANT 4 — polityki tabel konta**:
  - dla każdej z komend SELECT/INSERT/UPDATE/DELETE co najmniej jedna polityka,
  - każda polityka tabeli konta ma `roles = {authenticated}`, a jej komenda nie jest `ALL`,
  - wyrażenia niepuste: `qual` dla SELECT/UPDATE/DELETE, `with_check` dla INSERT/UPDATE,
  - żadne wyrażenie nie jest dosłownie `true`.
    Zachowanie dowodzi ISOLATION, ta reguła łapie tylko jawne braki.
- **INVARIANT 5 — tabele wspólne**: wyłącznie polityki SELECT; `anon` i `authenticated` bez INSERT/UPDATE/DELETE/TRUNCATE (`has_table_privilege`).
- **INVARIANT 6 — `TRUNCATE`**: `anon` i `authenticated` nie mają `TRUNCATE` na żadnej tabeli `public`.
- **INVARIANT 7 — funkcje `security definer`**: dla każdej funkcji w `public` z `prosecdef` i typem zwracanym innym niż `trigger` `has_function_privilege('anon', …, 'EXECUTE')` jest fałszem. Zbiór funkcji niepusty (dziś: funkcja okna).
- **INVARIANT 8 — strażnicy historii**: lista (tabela, nazwa wyzwalacza, zdarzenie) 5 strażników z research, tabela „Wyzwalacze strażnicze”. Każdy istnieje w `pg_trigger` (`not tgisinternal`), ma `tgenabled = 'O'` i zdarzenie BEFORE zgodne z listą. Komentarz: strażnik nie wynika ze struktury, więc lista jest ręczna z wyboru, a dodanie strażnika w S-02/S-05 oznacza wpis tutaj.

#### 3. Próbki czerwonej bramki

**File**:

- `scripts/db-checks/probes/` (nowe pliki),
- `.github/workflows/ci.yml` (krok „SQL checks”).

**Intent**: Dowodzi, że każda główna reguła umie wywrócić bramkę na scenariuszu z celu fazy, a nie z przypadkowego powodu.

**Contract**: 3 próbki. Każda to `begin;` + DDL + treść `supabase/tests/schema_invariants_checks.sql`, sklejone w pliku tymczasowym przy uruchomieniu (nie kopia pliku w repo, żeby próbka nie rozjechała się ze sprawdzeniami):

- `account-table-without-rls`: tabela z `user_id → auth.users on delete cascade` bez RLS → `INVARIANT 3 FAILED`,
- `account-fk-set-null`: tabela z RLS i 4 politykami, klucz do `auth.users on delete set null` → `INVARIANT 2 FAILED`,
- `unclassified-table`: tabela z kolumną `user_id uuid` bez klucza obcego → `INVARIANT 1 FAILED`.

Krok CI sprawdza dla każdej próbki niezerowy kod runnera **oraz** obecność oczekiwanego `INVARIANT <n> FAILED` w wyjściu. Istniejący `expect_probe_failure` sprawdza tylko powód z runnera, więc potrzebny jest wariant z oczekiwanym tekstem sprawdzenia. Kolejność: istniejące 2 próbki, nowe 3, na końcu `npm run db:check`. Ten sam skrypt składania próbki musi dać się uruchomić lokalnie jednym poleceniem. Forma (skrypt powłoki czy Node) należy do implementera, byle z komunikatami po angielsku.

### Success Criteria:

#### Automated Verification:

- Migracja stosuje się na świeżej bazie: `npx supabase db reset` kończy się bez błędu
- Po migracji `has_table_privilege` dla `anon` i `authenticated` z `TRUNCATE` na 3 tabelach konta oraz `has_function_privilege('anon', 'public.medication_correction_window_open(uuid)', 'EXECUTE')` zwracają `false`, a `has_function_privilege('authenticated', …)` zwraca `true`
- `npm run db:check` przechodzi, w wyjściu jest `GATE_COMPLETE schema_invariants_checks` i `INVARIANT 1–8 OK`
- Każda z 3 nowych próbek pada lokalnie z oczekiwanym `INVARIANT <n> FAILED`, a pełny `npm run db:check` po nich dalej przechodzi (brak przecieku DDL)
- `npm test`, `npm run lint`, `npm run typecheck` przechodzą
- CI na PR: job `smoke` zielony, w logu kroku „SQL checks” widać 5 próbek padających z oczekiwanego powodu

#### Manual Verification:

- Przegląd listy wspólnych i listy strażników w pliku: 5 + 5 pozycji zgodnych z research
- Ręczny kontrprzykład: w lokalnej bazie usuń w transakcji jedną politykę (np. DELETE na `dosage_periods`) i uruchom plik — pada `INVARIANT 4 FAILED` z nazwą tabeli i komendy
- Po merge'u i zielonym `smoke` na commicie z migracją: autorka uruchamia `npx supabase migration list` (oczekiwane: tylko `20260929120000` bez odpowiednika zdalnego; inna oczekująca migracja = stop), potem `npx supabase db push` na produkcję, a potem w panelu SQL Supabase sprawdza `has_table_privilege('authenticated', 'public.medications', 'TRUNCATE')` = `false` i `has_function_privilege('anon', 'public.medication_correction_window_open(uuid)', 'EXECUTE')` = `false`
- Po `db push` logowanie i lista leków na produkcji działają jak przed zmianą

**Implementation Note**: Po zielonej weryfikacji automatycznej zatrzymaj się na potwierdzenie ręcznych kroków przez autorkę, zanim przejdziesz do fazy 2. `db push` na produkcję wykonuje wyłącznie autorka, nie agent.

---

## Phase 2: Izolacja i usunięcie konta dla każdej tabeli z domknięcia

### Overview

`account_isolation_checks.sql` przestaje mieć listy tabel wpisane w każdym bloku. Zbiór bierze z katalogu, dane testowe z jednej mapy. Dokłada kontrprzykład właściciela w ISOLATION 4 (F3) i dowód, że usunięcie konta przy zamkniętym oknie kasuje wszystko w każdej tabeli z domknięcia.

### Changes Required:

#### 1. Zbiór tabel z katalogu i mapa danych testowych

**File**: `supabase/tests/account_isolation_checks.sql`

**Intent**: Nowa tabela konta automatycznie przechodzi przez SELECT/INSERT/UPDATE/przepięcie/DELETE i usunięcie konta. Autorka migracji musi tylko dopisać dane testowe, a bez nich bramka pada z instrukcją, co dopisać.

**Contract**:

- Na początku pliku `pg_temp.account_data_tables()` — ten sam predykat co w `schema_invariants_checks.sql`, z komentarzem wskazującym tamten plik — oraz ta sama reguła podziału z listą 5 tabel wspólnych.
- Mapa danych testowych jako tabela tymczasowa, jeden wiersz na tabelę konta. Kolumny (nazwy po angielsku, dokładny kształt należy do implementera):
  - wiersz A (`a_row`), dodatkowy wiersz A do usunięcia przez właściciela (`a_extra_row`), wiersz B (`b_row`),
  - kolumna i oryginalna wartość do UPDATE,
  - instrukcja INSERT wiersza należącego do A z parametrem `id`,
  - kolumna przepięcia z celem pod A, oryginałem B i celem właściciela (dla F3).
    Wypełniona dla 3 obecnych tabel wartościami z dzisiejszych literałów `values`.
- **ISOLATION 0** (rozszerzone):
  - tabela z domknięcia bez wiersza w mapie → `ISOLATION 0 FAILED: <tabela> has no test data — add a row to the fixture map`,
  - wiersz mapy dla tabeli spoza domknięcia → porażka,
  - każdy `a_row`, `a_extra_row` i `b_row` z mapy istnieje w swojej tabeli.
- **ISOLATION 1–5**: iterują po mapie złączonej z domknięciem, bez literałów tabel. Asercje, komunikaty i kontrprzykłady bez zmian. Kolejność DELETE w ISOLATION 5 (podrzędne przed rodzicem) wynika z głębokości w domknięciu, malejąco, nie z ręcznego `ord`. Remis głębokości łamany nazwą tabeli (`order by depth desc, table_name`), żeby kolejność była deterministyczna.

#### 2. Kontrprzykład właściciela w ISOLATION 4 (F3)

**File**: `supabase/tests/account_isolation_checks.sql`

**Intent**: Dowód, że blokada przepięcia pochodzi z RLS, a nie z czegoś, co blokuje każdą zmianę tej kolumny.

**Contract**: Po przypadku konta B, dla każdej tabeli z mapy, konto A przepina **swój** wiersz na cel właściciela:

- tabele podrzędne: pod drugi lek A (`0a11`) przy otwartym oknie,
- `medications`: `user_id` na A.

Oczekiwany `row_count = 1`. Potem wiersz wraca na miejsce, żeby ISOLATION 5 i 6 zastały dane z ISOLATION 0. Najpierw zmierz, że przepięcie właściciela przy otwartym oknie przechodzi, potem ustaw warunek (lessons: „zmierz, co przychodzi naprawdę”).

#### 3. ISOLATION 6: usunięcie konta przy zamkniętym oknie

**File**: `supabase/tests/account_isolation_checks.sql`

**Intent**: Dowód ryzyka #6 dla każdej tabeli konta, także przyszłej. Usunięcie konta przechodzi przez strażników historii i nie zostawia wierszy. Konto sąsiednie jest nietknięte.

**Contract**: Blok po ISOLATION 5, przed znacznikiem ukończenia, jako `postgres`:

1. Odcisk funkcji okna.
2. `savepoint`.
3. Podmiana okna na `return false` (wzorzec `rls_checks.sql:289-301`).
4. Kontrprzykład: `delete` leku `0a01` konta A pada z P0001 i treścią „okno korekty jest już zamknięte” (łapany wyłącznie `sqlstate 'P0001'`).
5. `delete from auth.users` konta A.
6. W każdej tabeli z domknięcia zero wierszy konta A spośród `a_row` z mapy oraz wierszy wstawionych przez A w ISOLATION 2.
7. Każdy `b_row` istnieje.
8. `rollback to savepoint` i porównanie odcisku.

Komunikat porażki wskazuje tabelę, w której zostały wiersze.

#### 4. Próbka tabeli bez danych testowych

**File**:

- `scripts/db-checks/probes/` (nowa próbka),
- `.github/workflows/ci.yml`.

**Intent**: Dowód, że nowa tabela konta z poprawną strukturą, ale bez danych testowych, nie przejdzie niezauważona.

**Contract**: `begin;` + tabela z `user_id → auth.users on delete cascade`, RLS, 4 polityki `authenticated` z `user_id = auth.uid()` i odebrane `TRUNCATE` + treść `account_isolation_checks.sql`. Oczekiwany tekst: `ISOLATION 0 FAILED` z nazwą tabeli z próbki. Ten sam mechanizm próbek co w fazie 1.

### Success Criteria:

#### Automated Verification:

- `npm run db:check` przechodzi, w wyjściu jest `ISOLATION 0–6 OK` i `GATE_COMPLETE account_isolation_checks`
- W pliku nie ma literału nazwy tabeli konta poza mapą danych testowych, komentarzami i jednym nazwanym wyjątkiem: kontrprzykładem ISOLATION 6 (krok 4) na tabeli-korzeniu `medications`, głębokość 1 (grep `'medications'`, `'medication_substances'`, `'dosage_periods'`)
- Brak `when others` w plikach `supabase/tests/`
- Próbka „tabela bez danych testowych” pada lokalnie z `ISOLATION 0 FAILED` i nazwą swojej tabeli, a pełny `npm run db:check` po niej przechodzi
- `npm test`, `npm run lint`, `npm run typecheck` przechodzą
- CI na PR: job `smoke` zielony, w logu 6 próbek padających z oczekiwanego powodu

#### Manual Verification:

- Ręczne zepsucie kaskady w transakcji (wyzwalacz `before delete` blokujący usunięcie z `dosage_periods` bez warunku) wywraca ISOLATION 6 z nazwą tabeli `dosage_periods`
- Ręczne zepsucie polityki (`drop policy` SELECT na `medication_substances` i `create policy … using (medication_id is not null)`) wywraca ISOLATION 1, choć `schema_invariants_checks.sql` przechodzi — potwierdza podział: katalog wyznacza zbiór, zachowanie dowodzi
- Przegląd mapy danych testowych: wartości zgodne z dotychczasowymi literałami, komunikat ISOLATION 0 czytelny dla kogoś, kto dodaje tabelę

**Implementation Note**: Po zielonej weryfikacji automatycznej zatrzymaj się na potwierdzenie ręcznych kroków, zanim przejdziesz do fazy 3.

---

## Phase 3: Checklista nowej tabeli i odsyłacze

### Overview

S-02 i S-05 dostają jedną checklistę: co musi mieć migracja z nową tabelą konta, żeby przeszła bramkę. Dokumenty, które dziś mówią o nowych tabelach, odsyłają do niej zamiast powtarzać reguły.

### Changes Required:

#### 1. Checklista w test-plan

**File**: `context/foundation/test-plan.md`

**Intent**: Zastępuje „TBD” w §6.4 listą kroków, a w §6.2 zamyka punkt „otwarte na Phase 2”.

**Contract**:

§6.4 „Adding a new table with user data” — bullety:

- klucz obcy do `auth.users` albo do tabeli konta z `on delete cascade`,
- RLS i polityki SELECT/INSERT/UPDATE/DELETE dla `authenticated` w tej samej migracji,
- `revoke truncate … from anon, authenticated`,
- nowa funkcja `security definer` bez `EXECUTE` dla `anon`,
- wiersz w mapie danych testowych `account_isolation_checks.sql`,
- nowy strażnik historii dopisany do INVARIANT 8,
- tabela wspólna zamiast tabeli konta dopisana świadomie do listy wspólnych w obu plikach,
- 4 kroki izolacji w `scripts/smoke.mjs` `isolationTargets` (lista ręczna, bramka jej nie pilnuje),
- `npm run db:check` lokalnie przed PR.

§6.2: ostatni bullet zamieniony na odsyłacz do `schema_invariants_checks.sql` i mechanizmu próbek.

§6.5: krótka notatka po fazie 2 — co bramka wie z katalogu, a co wyłącznie z zachowania.

#### 2. README i CLAUDE.md

**File**:

- `README.md` (sekcja Migracje),
- `CLAUDE.md` (Konwencje kodu → Migracje Supabase).

**Intent**: Reguła „4 kroki smoke na tabelę” zostaje, a obok pojawia się to, co teraz wymusza bramka. Szczegóły nie są powtarzane.

**Contract**:

- README: po akapicie o krokach smoke jedno zdanie — nowa tabela konta wymaga też wiersza w mapie danych testowych i przejścia `schema_invariants_checks.sql`, checklista w test-plan §6.4.
- CLAUDE.md: w punkcie o migracjach dopisek „i `revoke truncate` od `anon`/`authenticated`; pełna checklista: test-plan §6.4”.
- Treść po polsku, bez nowych sekcji.

### Success Criteria:

#### Automated Verification:

- `grep -n "TBD" context/foundation/test-plan.md` nie zwraca linii z §6.4
- `npx prettier --check context/foundation/test-plan.md README.md CLAUDE.md` przechodzi

#### Manual Verification:

- Autorka czyta §6.4 i potrafi z niego wypisać, czego potrzebuje tabela wpisów dzienniczka z S-05, bez zaglądania do plików SQL
- README i CLAUDE.md odsyłają do §6.4 i nie powtarzają pełnej listy

**Implementation Note**: Ostatnia faza. Po potwierdzeniu zmiana gotowa do `/10x-impl-review`.

---

## Testing Strategy

### Unit Tests:

- Brak nowych testów `node:test`, chyba że składanie próbek trafi do `scripts/db-checks.mjs` — wtedy test jednostkowy funkcji składającej (`begin;` na początku, treść pliku bez zmian).

### Integration Tests:

- `schema_invariants_checks.sql`: 8 reguł katalogu, każda z komunikatem wskazującym obiekt.
- `account_isolation_checks.sql`: ISOLATION 0–6 po zbiorze z katalogu.
- Próbki w CI: 3 (faza 1) + 1 (faza 2) nowe, każda z oczekiwanym tekstem sprawdzenia.

### Manual Testing Steps:

1. Zepsuć w transakcji politykę DELETE jednej tabeli konta i potwierdzić `INVARIANT 4 FAILED`.
2. Podmienić politykę SELECT na `using (medication_id is not null)` (wyrażenie, którego reguła katalogu nie odróżni od poprawnego) i potwierdzić, że pada ISOLATION 1, a nie reguła katalogu.
3. Dodać blokadę `before delete` bez warunku i potwierdzić, że pada ISOLATION 6.
4. Po `db push` sprawdzić uprawnienia na produkcji zapytaniem `has_table_privilege` / `has_function_privilege`.

## Performance Considerations

Brak. Zapytania katalogowe na kilkunastu tabelach, cały `npm run db:check` biegnie w sekundach.

## Migration Notes

- Migracja jest addytywna (wyłącznie `revoke`). Nie dotyka danych.
- Rollback kodu jej nie cofa. Cofnięcie wymagałoby nowej migracji z `grant`, a nie ma do tego powodu: żaden kod aplikacji nie używa `TRUNCATE`, a `anon` nie woła funkcji okna (grep `src/`).
- Kolejność na produkcji: merge, zielony `smoke` na commicie z migracją, potem `npx supabase db push` wykonany przez autorkę (README, sekcja Migracje).

## References

- Research: `context/changes/testing-schema-invariants/research.md`
- Faza 1 rolloutu: `context/archive/2026-09-28-testing-sql-gate-in-ci/plan.md`, `reviews/impl-review.md` (F3, F5)
- Wzorzec podmiany okna: `supabase/tests/rls_checks.sql:268-301,586,1362-1375`
- Wzorzec `revoke` na tabelach wspólnych: `supabase/migrations/20260924120000_registry_schema.sql:157-159`
- Pętle izolacji: `supabase/tests/account_isolation_checks.sql:80-426`
- Próbki w CI: `.github/workflows/ci.yml:44-64`, `scripts/db-checks/probes/`
- Strategia i cookbook: `context/foundation/test-plan.md` §2 (#1, #3, #6), §6.2, §6.4

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Migracja uprawnień i reguły katalogu

#### Automated

- [x] 1.1 Migracja stosuje się na świeżej bazie: `npx supabase db reset` kończy się bez błędu — 4a0f7c3
- [x] 1.2 Po migracji `has_table_privilege` dla `anon` i `authenticated` z `TRUNCATE` na 3 tabelach konta oraz `has_function_privilege('anon', 'public.medication_correction_window_open(uuid)', 'EXECUTE')` zwracają `false`, a `has_function_privilege('authenticated', …)` zwraca `true` — 4a0f7c3
- [x] 1.3 `npm run db:check` przechodzi, w wyjściu jest `GATE_COMPLETE schema_invariants_checks` i `INVARIANT 1–8 OK` — 4a0f7c3
- [x] 1.4 Każda z 3 nowych próbek pada lokalnie z oczekiwanym `INVARIANT <n> FAILED`, a pełny `npm run db:check` po nich dalej przechodzi (brak przecieku DDL) — 4a0f7c3
- [x] 1.5 `npm test`, `npm run lint`, `npm run typecheck` przechodzą — 4a0f7c3
- [ ] 1.6 CI na PR: job `smoke` zielony, w logu kroku „SQL checks” widać 5 próbek padających z oczekiwanego powodu

#### Manual

- [x] 1.7 Przegląd listy wspólnych i listy strażników w pliku: 5 + 5 pozycji zgodnych z research — 4a0f7c3
- [x] 1.8 Ręczny kontrprzykład: w lokalnej bazie usuń w transakcji jedną politykę (np. DELETE na `dosage_periods`) i uruchom plik — pada `INVARIANT 4 FAILED` z nazwą tabeli i komendy — 4a0f7c3
- [ ] 1.9 Po merge'u i zielonym `smoke` na commicie z migracją: autorka uruchamia `npx supabase migration list` (oczekiwane: tylko `20260929120000` bez odpowiednika zdalnego; inna oczekująca migracja = stop), potem `npx supabase db push` na produkcję, a potem w panelu SQL Supabase sprawdza `has_table_privilege('authenticated', 'public.medications', 'TRUNCATE')` = `false` i `has_function_privilege('anon', 'public.medication_correction_window_open(uuid)', 'EXECUTE')` = `false`
- [ ] 1.10 Po `db push` logowanie i lista leków na produkcji działają jak przed zmianą

### Phase 2: Izolacja i usunięcie konta dla każdej tabeli z domknięcia

#### Automated

- [x] 2.1 `npm run db:check` przechodzi, w wyjściu jest `ISOLATION 0–6 OK` i `GATE_COMPLETE account_isolation_checks` — 880e870
- [x] 2.2 W pliku nie ma literału nazwy tabeli konta poza mapą danych testowych, komentarzami i jednym nazwanym wyjątkiem: kontrprzykładem ISOLATION 6 (krok 4) na tabeli-korzeniu `medications`, głębokość 1 (grep `'medications'`, `'medication_substances'`, `'dosage_periods'`) — 880e870
- [x] 2.3 Brak `when others` w plikach `supabase/tests/` — 880e870
- [x] 2.4 Próbka „tabela bez danych testowych” pada lokalnie z `ISOLATION 0 FAILED` i nazwą swojej tabeli, a pełny `npm run db:check` po niej przechodzi — 880e870
- [x] 2.5 `npm test`, `npm run lint`, `npm run typecheck` przechodzą — 880e870
- [ ] 2.6 CI na PR: job `smoke` zielony, w logu 6 próbek padających z oczekiwanego powodu

#### Manual

- [x] 2.7 Ręczne zepsucie kaskady w transakcji (wyzwalacz `before delete` blokujący usunięcie z `dosage_periods` bez warunku) wywraca ISOLATION 6 z nazwą tabeli `dosage_periods` — 880e870
- [x] 2.8 Ręczne zepsucie polityki (`drop policy` SELECT na `medication_substances` i `create policy … using (medication_id is not null)`) wywraca ISOLATION 1, choć `schema_invariants_checks.sql` przechodzi — potwierdza podział: katalog wyznacza zbiór, zachowanie dowodzi — 880e870
- [x] 2.9 Przegląd mapy danych testowych: wartości zgodne z dotychczasowymi literałami, komunikat ISOLATION 0 czytelny dla kogoś, kto dodaje tabelę — 880e870

### Phase 3: Checklista nowej tabeli i odsyłacze

#### Automated

- [x] 3.1 `grep -n "TBD" context/foundation/test-plan.md` nie zwraca linii z §6.4
- [x] 3.2 `npx prettier --check context/foundation/test-plan.md README.md CLAUDE.md` przechodzi

#### Manual

- [x] 3.3 Autorka czyta §6.4 i potrafi z niego wypisać, czego potrzebuje tabela wpisów dzienniczka z S-05, bez zaglądania do plików SQL
- [x] 3.4 README i CLAUDE.md odsyłają do §6.4 i nie powtarzają pełnej listy
