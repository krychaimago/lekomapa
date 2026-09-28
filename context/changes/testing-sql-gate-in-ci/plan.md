# Bramka SQL w CI — Implementation Plan

## Overview

Sprawdzenia SQL z `supabase/tests/` zaczynają biec w CI przed buildem i smoke. Uruchamia je skrypt, który nie potrafi skończyć się zielono bez dowodu, że sprawdzenia faktycznie przeszły. Przy okazji zmiana domyka braki w samych sprawdzeniach:

- ryzyko #1: izolacja kont sprawdzana per operacja (SELECT, INSERT, UPDATE, DELETE), dla drugiego konta i dla `anon`,
- ryzyko #3: pozytywna połowa reguły „zmiana dawki zamyka okres i otwiera nowy”, blokada rozpoznawana po nazwanym błędzie, funkcja okna korekty przywracana do stanu z migracji, a nie do wpisanego na sztywno `return true`.

Faza 1 rolloutu z `context/foundation/test-plan.md`, ryzyka #4, #1, #3.

## Current State Analysis

- `supabase/tests/rls_checks.sql` ma 18 sprawdzeń w jednej transakcji z rollbackiem. Uruchamiany jest wyłącznie ręcznie (`README.md:94-97`). Żaden job w `.github/workflows/ci.yml` go nie woła.
- Kod wyjścia różny od zera przy porażce zależy od jednej linii w pliku: `\set ON_ERROR_STOP on` (`supabase/tests/rls_checks.sql:22`). Bez niej ten sam błąd daje kod 0 (zmierzone w research).
- Polecenie z README (`docker ps -qf name=supabase_db`) łapie każdy kontener z tym podciągiem. Na maszynie autorki są dwa, więc polecenie kończy się kodem 127. Nazwa kontenera wynika z `project_id` w `supabase/config.toml:5`.
- Job `smoke` stawia lokalny Supabase z migracjami (`.github/workflows/ci.yml:40-43`). `deploy` czeka na `ci` i `smoke` (`:59`).
- **Ochrona gałęzi `main` jest niedostępna.** `gh api repos/krychaimago/lekomapa/branches/main/protection` zwraca `403 Upgrade to GitHub Pro or make this repository public` (zmierzone 2026-09-28). Czerwony job zatrzymuje deploy, ale nie blokuje merge'a.
- Sprawdzenia SQL chodzą jako `postgres`, więc RLS badają tylko przez katalog. Zachowanie polityk mierzy smoke, ale tylko dla SELECT/UPDATE/DELETE cudzego wiersza i SELECT bez sesji (`scripts/smoke.mjs:193-281`). Nie ma INSERT pod cudze konto, przepięcia wiersza podrzędnego pod cudzy lek ani zapisów `anon`.
- Sprawdzenia 5–7 łapią `sqlstate 'P0001'` bez porównania treści (`supabase/tests/rls_checks.sql:289-424`). `P0001` daje każdy `raise exception` bez ERRCODE.
- Funkcja okna korekty jest podmieniana na `false` (`:262-272`) i „przywracana” wpisanym `return true` (`:440-450`). Sprawdzenie końcowe zakłada `true` (`:1216-1223`). Po S-05 ta sekwencja przestanie odtwarzać stan z migracji.

## Desired End State

- Job `smoke` ma krok „SQL checks” zaraz po starcie Supabase. Krok:
  - najpierw dowodzi, że bramka umie być czerwona (dwie próbki muszą ją wywrócić),
  - potem uruchamia wszystkie pliki `supabase/tests/*.sql` przeciw kontenerowi na runnerze.
- Porażka dowolnego sprawdzenia kończy krok kodem różnym od zera. Log wskazuje identyfikator złamanego sprawdzenia. Deploy się nie wykonuje.
- Bramka kończy się porażką także wtedy, gdy:
  - nie ma kontenera bazy,
  - któraś migracja z repozytorium nie jest zastosowana w bazie,
  - plik zakończył się bez linii potwierdzającej przejście wszystkich sprawdzeń.
- Nowy plik `supabase/tests/account_isolation_checks.sql` dowodzi, że dla każdej z 3 tabel z danymi konta i każdej operacji drugie konto i `anon` nie mają dostępu do wierszy konta A. Każda blokada ma kontrprzykład: właściciel robi to samo na swoim wierszu.
- `rls_checks.sql`:
  - rozpoznaje blokadę wyzwalacza historii po `P0001` i treści komunikatu,
  - ma sprawdzenie „zamknij okres, otwórz przylegający z nową dawką”,
  - przywraca funkcję okna przez savepoint i porównuje ją z odciskiem sprzed podmiany.
- README opisuje `npm run db:check` i dyscyplinę: nie merguj PR z czerwonym `smoke`, a przed `supabase db push` sprawdź zielony status na commicie.

Weryfikacja: `npm run db:check` lokalnie przechodzi. Próbki w CI są czerwone. Próbny PR z migracją psującą politykę daje czerwony krok „SQL checks” z nazwą sprawdzenia.

### Key Discoveries:

- Wejście w rolę w SQL działa także wewnątrz `do $$`. Wystarczą `perform set_config('request.jwt.claims', '{"sub":"<uuid>","role":"authenticated"}', true)` i `execute 'set local role authenticated'`. Wtedy `auth.uid()` zwraca `sub`, a po `execute 'reset role'` wraca `postgres` (zmierzone 2026-09-28).
- Zmierzone kody (lokalnie, transakcja z rollbackiem):
  - INSERT konta B pod `user_id` konta A: `42501 new row violates row-level security policy for table "medications"`,
  - przepięcie `dosage_periods.medication_id` konta B pod lek konta A: `42501 … "dosage_periods"`,
  - INSERT jako `anon`: `42501`,
  - UPDATE cudzego wiersza (konto B) i DELETE jako `anon`: bez błędu, `row_count = 0`.
- Wszystkie komunikaty wyzwalaczy historii leków zawierają frazę „okno korekty jest już zamknięte” i nazwę pola albo obiektu (`supabase/migrations/20260922120000_medication_schema.sql:267-384`).
- Wiersze testowe leku `…0002` i jego wiersze podrzędne powstają przed podmianą okna (`supabase/tests/rls_checks.sql:131-156`). `rollback to savepoint` po sprawdzeniach 5–7 nie usunie więc danych, których używa sprawdzenie 8. Lek `…0005` (używany od sprawdzenia 14) też powstaje wcześniej (`:139`).
- `supabase db query -f` nie wykona pliku (odrzuca wiele poleceń i `\set`), więc zostaje `docker exec … psql` (research).
- Wzorzec skryptów Node w repozytorium: `scripts/smoke.mjs` (ESM, komunikaty w konsoli po angielsku), testy `scripts/**/*.test.mjs` w `npm test`.

## What We're NOT Doing

- Wyprowadzanie listy tabel z katalogu bazy. W tej fazie lista 3 tabel z danymi konta jest wpisana ręcznie; wyprowadzenie należy do fazy 2 test-planu.
- Grant `TRUNCATE` dla `anon`/`authenticated` na tabelach kont i `EXECUTE` dla `anon` na funkcji okna. To stan schematu, nie bramki. Kandydat na fazę 2 albo lesson.
- Własny SQLSTATE w wyzwalaczach. Byłaby to nowa migracja z ręcznym `db push` na produkcję; wybrano porównanie treści.
- Kaskada usunięcia konta przy zamkniętym oknie (ryzyko #6, faza 2).
- Ochrona gałęzi w GitHubie (Pro albo repo publiczne). Wybrano blokadę deployu i dyscyplinę zapisaną w README.
- Osobny job CI dla SQL. Krok idzie do `smoke`.
- Tłumaczenie polskich komentarzy i komunikatów w istniejących sprawdzeniach 1–8. To osobna decyzja z `CLAUDE.md`. Nowy kod i nowe sprawdzenia piszemy po angielsku.
- Zmiany w `scripts/smoke.mjs`. Kroki izolacji przez PostgREST zostają bez zmian.
- Aktualizacja statusu fazy w `test-plan.md §3`. To robi orkiestrator `/10x-test-plan`.

## Implementation Approach

1. Najpierw bramka, na istniejących 18 sprawdzeniach. Już po fazie 1 CI łapie regresję tego, co jest sprawdzane dziś.
2. Potem hartowanie historii (#3) w istniejącym pliku.
3. Na końcu nowy plik izolacji (#1), który runner podchwyci automatycznie.

Każda faza zostawia zielone CI i daje samodzielną wartość.

Runner nie ufa samym plikom SQL. Trzy warunki bramki (`ON_ERROR_STOP`, baza lokalna, kompletne wykonanie) wymusza z zewnątrz:

- `ON_ERROR_STOP` idzie z wiersza poleceń,
- kontener ma dokładną nazwę, a przed biegiem runner sprawdza, że migracje są zastosowane,
- każdy plik musi wypisać znacznik ukończenia.

## Critical Implementation Details

**Role w blokach z wyjątkami.** `set local role` wykonane wewnątrz podbloku `begin … exception … end` cofa się razem z podtransakcją, gdy blok złapie wyjątek. Przełączaj rolę poza podblokiem łapiącym błąd i po każdym przypadku wracaj przez `execute 'reset role'`. Inaczej kolejne kroki pobiegną jako `postgres` i przejdą, nie mierząc RLS. Każdy blok izolacji zaczyna się więc asercją `current_user` i `auth.uid()`.

**Kolejność w CI.** Próbki (oczekiwana porażka) biegną przed właściwym biegiem i w odwrotnej logice: krok pada, jeśli runner zakończy próbkę kodem 0. Runner nie ma flagi „oczekuj porażki”. Odwrócenie jest w samym kroku CI, żeby nikt nie mógł jej przypadkiem zostawić włączonej na właściwym biegu.

## Phase 1: Bramka w CI na istniejących sprawdzeniach

### Overview

Runner `npm run db:check` z twardymi warunkami, dwie próbki dowodzące czerwieni, krok w jobie `smoke`, testy jednostkowe czystej logiki runnera, poprawione README i nagłówek pliku SQL.

### Changes Required:

#### 1. Runner sprawdzeń SQL

**File**: `scripts/db-checks.mjs` (nowy), `package.json`

**Intent**: Jedno polecenie, które lokalnie i w CI uruchamia sprawdzenia SQL przeciw kontenerowi bazy z `supabase start`. Kończy się kodem 0 wyłącznie wtedy, gdy każdy plik przeszedł do końca.

**Contract**:

- `npm run db:check` → `node scripts/db-checks.mjs`. Bez argumentów bierze `supabase/tests/*.sql` posortowane po nazwie. Z argumentami bierze wyłącznie podane pliki (tego używają próbki).
- Kontener: `supabase_db_<project_id>`, gdzie `project_id` czytane z `supabase/config.toml`. Brak kontenera albo kontener niedziałający → kod 1 i komunikat z nazwą kontenera. Nigdy SKIP.
- Przed plikami: każda wersja z nazw plików `supabase/migrations/*.sql` (prefiks `YYYYMMDDHHmmss`) musi być w `supabase_migrations.schema_migrations`. Brak którejkolwiek → kod 1 z listą brakujących.
- Każdy plik: `docker exec -i <container> psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres -f -` z treścią pliku na stdin. Wynik jest wypisywany na bieżąco.
- Plik przechodzi wyłącznie wtedy, gdy psql zakończy się kodem 0 **i** wynik zawiera notice `GATE_COMPLETE <basename bez .sql>`. W każdym innym przypadku runner zgłasza `FAIL <plik>` i kończy się kodem 1. Brak znacznika przy kodzie 0 ma osobny komunikat („file finished without completion marker”).
- Logika czysta (parsowanie `project_id`, lista wersji z nazw migracji, różnica wersji, rozpoznanie znacznika w wyniku) jest wydzielona i eksportowana na potrzeby testów jednostkowych.
- Komunikaty w konsoli po angielsku.

#### 2. Testy jednostkowe runnera

**File**: `scripts/db-checks.test.mjs` (nowy)

**Intent**: Pokryć logikę, której pomyłka dałaby fałszywą zieleń bez dockera.

**Contract**: `node:test`, w `npm test`. Przypadki:

- `project_id` z przykładowego TOML (także z komentarzem i cudzysłowami),
- różnica wersji migracji (wszystkie są / jednej brakuje / plik bez prefiksu daty ignorowany),
- znacznik `GATE_COMPLETE rls_checks` rozpoznany w linii `NOTICE:` psql,
- znacznik innego pliku nie liczy się dla bieżącego,
- brak znacznika → porażka.

#### 3. Próbki czerwieni

**File**: `scripts/db-checks/probes/failing-check.sql`, `scripts/db-checks/probes/missing-marker.sql` (nowe)

**Intent**: Dowód w każdym biegu CI, że bramka nie kończy się zawsze kodem 0.

**Contract**:

- `failing-check.sql`: transakcja, `raise exception 'PROBE FAILED: deliberate failure'`, potem znacznik `GATE_COMPLETE failing-check` (runner nie może go uznać, bo psql zakończy się wcześniej), rollback.
- `missing-marker.sql`: poprawny SQL bez znacznika.
- Pliki leżą poza `supabase/tests/`, więc domyślny bieg ich nie bierze. Nie zawierają `\set ON_ERROR_STOP`, żeby próbka dowodziła, że runner wymusza go sam.

#### 4. Znacznik ukończenia w istniejącym pliku i nagłówek

**File**: `supabase/tests/rls_checks.sql`

**Intent**: Plik potwierdza, że doszedł do końca, a nagłówek pokazuje aktualny sposób uruchomienia.

**Contract**:

- Tuż przed `rollback;` notice `GATE_COMPLETE rls_checks` w bloku, który wykonuje się po sprawdzeniu końcowym.
- Nagłówek `:8-11` zastąpiony opisem `npm run db:check` i informacją, że `supabase db query` nie wykona tego pliku.
- `\set ON_ERROR_STOP on` zostaje (bieg ręczny przez psql też ma być bezpieczny).

#### 5. Krok w CI

**File**: `.github/workflows/ci.yml`

**Intent**: Sprawdzenia SQL biegną w jobie `smoke` zaraz po starcie Supabase, przed buildem.

**Contract**: Nowy krok `name: SQL checks (RLS and history invariants)` między „Start local Supabase” a „Configure secrets…”. Najpierw każda próbka osobno, w konstrukcji, która kończy krok porażką, jeśli runner zwrócił 0. Potem `npm run db:check`. `set -e` jest domyślne w `run` GitHub Actions i ma zostać.

#### 6. README

**File**: `README.md` (sekcja „Migracje”)

**Intent**: Poprawne polecenie i jasna reguła, co oznacza czerwona bramka, gdy ochrona gałęzi jest niedostępna.

**Contract**:

- Blok `docker exec … docker ps -qf …` zastąpiony przez `npm run db:check` (wymaga `npx supabase start`).
- Akapit: sprawdzenia biegną w CI w jobie `smoke`; czerwony `smoke` zatrzymuje deploy, ale nie blokuje merge'a (plan GitHub Free); nie merguj PR z czerwonym `smoke`; przed `npx supabase db push` sprawdź, że commit z migracją ma zielony `smoke`.

### Success Criteria:

#### Automated Verification:

- `npm test` przechodzi, w tym `scripts/db-checks.test.mjs`
- `npm run lint` przechodzi
- `npm run db:check` lokalnie (po `npx supabase start`) kończy się kodem 0 i wypisuje `GATE_COMPLETE rls_checks`
- `node scripts/db-checks.mjs scripts/db-checks/probes/failing-check.sql` kończy się kodem różnym od zera
- `node scripts/db-checks.mjs scripts/db-checks/probes/missing-marker.sql` kończy się kodem różnym od zera z komunikatem o braku znacznika
- Job `smoke` na PR jest zielony, a log kroku „SQL checks” pokazuje obie próbki czerwone i właściwy bieg zielony

#### Manual Verification:

- Przy zatrzymanym Supabase (`npx supabase stop`) `npm run db:check` kończy się porażką z nazwą kontenera, nie zielenią
- README czytelnie mówi, co robić przy czerwonym `smoke` i przed `db push`

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Nienaruszalność historii (#3) w `rls_checks.sql`

### Overview

Blokada wyzwalacza rozpoznawana po nazwanym błędzie i treści. Okno korekty przywracane do stanu z migracji. Nowe sprawdzenie pozytywnej połowy reguły „zmiana dawki zamyka okres i otwiera nowy”.

### Changes Required:

#### 1. Nazwany błąd w sprawdzeniach 5–7

**File**: `supabase/tests/rls_checks.sql`

**Intent**: Błąd z innego `raise` (np. literówka w samym sprawdzeniu) nie może wyglądać jak działający wyzwalacz.

**Contract**: Każde `exception when sqlstate 'P0001'` w sprawdzeniach 5–7 dodatkowo wymaga, żeby `sqlerrm` zawierało „okno korekty jest już zamknięte” i nazwę chronionego pola albo obiektu z komunikatu wyzwalacza (np. `dose_text`, `medication_id`, „usunąć leku”). `P0001` z inną treścią → `raise exception` z identyfikatorem sprawdzenia i otrzymaną treścią. Wzorzec porównania treści: sprawdzenie 17n (`:1195-1204`).

#### 2. Savepoint i odcisk funkcji okna

**File**: `supabase/tests/rls_checks.sql`

**Intent**: Plik przestaje zakładać, że funkcja okna to zaślepka `return true`. Działa też po S-05.

**Contract**:

- Przed podmianą (`:262`): odcisk `md5(pg_get_functiondef('public.medication_correction_window_open(uuid)'::regprocedure))` zapisany w tabeli tymczasowej, potem `savepoint before_window_closed`.
- Blok „Przywrócenie oryginalnej treści” (`:436-450`) zastąpiony przez `rollback to savepoint before_window_closed`.
- Sprawdzenie końcowe (`:1216-1223`) porównuje bieżący odcisk z zapisanym zamiast wywoływać funkcję. Różnica → `raise exception` „final check failed: correction window function differs from migration state”.
- Sprawdzenie 8 przed usunięciem potwierdza, że lek `…0002` ma co najmniej jeden wiersz w `medication_substances` i `dosage_periods`. Bez tego kaskada mogłaby przejść na pustym zbiorze (lesson „Bramka musi odróżnić blokadę od niewykonania”).
- Komentarz przy sprawdzeniu 8: po S-05 to sprawdzenie potrzebuje własnej podmiany okna na otwarte.

#### 3. Sprawdzenie 19: zmiana dawki zamyka okres i otwiera nowy

**File**: `supabase/tests/rls_checks.sql`

**Intent**: Pozytywna połowa reguły. Przy zamkniętym oknie zmiana dawki da się zapisać jako zamknięcie okresu i nowy okres, a stara dawka zostaje w historii.

**Contract**: Blok w sekcji zamkniętego okna (między sprawdzeniem 7 a `rollback to savepoint`), na własnym leku testowym, żeby nie kolidować z okresami sprawdzeń 3–7. Kroki:

- okres P1 (`dose_text` = A, bez `ended_on`) istnieje,
- `update … set ended_on = D` przechodzi,
- `insert` okresu P2 (`started_on` = D, `dose_text` = B) przechodzi (przylega przy granicy `'[)'`),
- oba istnieją, P1 ma nadal A, P2 ma B,
- `update P1 set dose_text = B` pada `P0001` z treścią o `dose_text` (nazwany błąd jak w punkcie 1).

Komunikaty sprawdzenia po angielsku (`CHECK 19 …`). W nagłówku pliku: zakres „Checks 19: dosage change closes a period and opens a new one” i uwaga o kolejności (19 stoi przed 8).

### Success Criteria:

#### Automated Verification:

- `npm run db:check` lokalnie przechodzi i wypisuje `CHECK 19 OK`
- W `supabase/tests/rls_checks.sql` nie ma wpisanego `return true` ani `when others` (`grep`)
- Job `smoke` na PR zielony

#### Manual Verification:

- Celowe psucie lokalnie, bez commita: usuń warunek `dose_text` z `dosage_periods_guard_core` w lokalnej bazie (`create or replace` przez psql) → `npm run db:check` czerwone z identyfikatorem sprawdzenia 5 albo 19; potem `npx supabase db reset` przywraca bazę
- Celowe psucie treści: w kopii roboczej zmień oczekiwaną frazę w jednym sprawdzeniu → czerwone z otrzymaną treścią w logu; zmianę cofnij

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: Izolacja kont per operacja (#1)

### Overview

Nowy plik sprawdzeń zachowania RLS na dwóch syntetycznych kontach i `anon`. Każdy przypadek blokady ma kontrprzykład właściciela. Do tego cookbook w `test-plan.md` i ręczny dowód całej bramki próbnym PR.

### Changes Required:

#### 1. Sprawdzenia izolacji

**File**: `supabase/tests/account_isolation_checks.sql` (nowy)

**Intent**: Dowód, że konto B i `anon` nie czytają, nie wstawiają, nie zmieniają i nie usuwają wierszy konta A w `medications`, `medication_substances`, `dosage_periods`. Każda operacja jest sprawdzana osobno, a „brak błędu” nigdy nie jest dowodem blokady.

**Contract**:

- `\set ON_ERROR_STOP on`, jedna transakcja, `rollback` na końcu, znacznik `GATE_COMPLETE account_isolation_checks` przed rollbackiem. Komentarze i komunikaty po angielsku, identyfikatory `ISOLATION <n>`.
- Dane jako `postgres`: konta A i B w `auth.users`, po jednym leku, składniku i okresie dla każdego konta. Stałe UUID z innej puli niż `rls_checks.sql`.
- Przełączanie ról zgodnie z „Critical Implementation Details”. Każdy blok zaczyna się asercją `current_user` i `auth.uid()`.
- Macierz, osobno dla każdej z 3 tabel:
  - SELECT: B widzi 0 wierszy A; A widzi swoje (> 0); `anon` widzi 0.
  - INSERT: B pod lek/konto A → `42501`; A pod swój → przechodzi; `anon` → `42501`.
  - UPDATE: B na wierszu A → `row_count = 0`, a wiersz A po powrocie do `postgres` bez zmian; A na swoim → `row_count = 1`; `anon` → `row_count = 0`.
  - DELETE: B i `anon` na wierszu A → `row_count = 0`, wiersz A istnieje; A na swoim (osobny wiersz testowy) → `row_count = 1`.
  - Tabele podrzędne: UPDATE przepinający wiersz B pod lek A → `42501`.
- Łapany jest wyłącznie `sqlstate '42501'`. Każdy inny błąd kończy sprawdzenie porażką. Przy `42501` treść musi zawierać „row-level security” albo „permission denied”.

#### 2. Cookbook i stan stacku w test-planie

**File**: `context/foundation/test-plan.md`

**Intent**: Następna osoba dopisująca sprawdzenie SQL wie, jak to zrobić, nie czytając tej zmiany.

**Contract**:

- §6.2 zastępuje `TBD` wzorcem: gdzie leży plik, znacznik `GATE_COMPLETE`, nazwany błąd (SQLSTATE + treść), przełączanie ról i kontrprzykład właściciela, `npm run db:check`, gdzie biegnie w CI.
- §4, wiersz „integration (baza)”: „dziś uruchamiane ręcznie” → „w CI w jobie smoke (`npm run db:check`)”.
- §3 i §5 bez zmian.

### Success Criteria:

#### Automated Verification:

- `npm run db:check` lokalnie przechodzi i wypisuje `GATE_COMPLETE account_isolation_checks`
- W `supabase/tests/account_isolation_checks.sql` nie ma `when others` (`grep`)
- Job `smoke` na PR zielony, log pokazuje oba pliki

#### Manual Verification:

- Próbny PR z gałęzi jednorazowej z migracją psującą izolację (np. polityka SELECT na `medications` z `using (true)`) → krok „SQL checks” w `smoke` czerwony z identyfikatorem `ISOLATION …`, deploy się nie wykonuje; PR zamknięty bez merge'a, gałąź usunięta
- Po przełączeniu lokalnie roli w jednym bloku na `postgres` (kopia robocza, bez commita) sprawdzenie pada na asercji `current_user`, zamiast przejść

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Testing Strategy

### Unit Tests:

- `scripts/db-checks.test.mjs`: parsowanie `project_id`, różnica wersji migracji, rozpoznanie znacznika ukończenia (właściwy plik, cudzy plik, brak).

### Integration Tests:

- `supabase/tests/rls_checks.sql` (1–19 i końcowe) oraz `supabase/tests/account_isolation_checks.sql` przeciw lokalnej bazie po pełnym zastosowaniu migracji, przez `npm run db:check`.
- Próbki `scripts/db-checks/probes/*.sql` w każdym biegu CI jako dowód, że bramka umie być czerwona.

### Manual Testing Steps:

1. Zatrzymany Supabase → `npm run db:check` czerwony z nazwą kontenera.
2. Lokalnie zepsuty wyzwalacz `dose_text` → czerwone sprawdzenie 5 albo 19; `npx supabase db reset`.
3. Próbny PR z polityką `using (true)` → czerwony `smoke`, brak deployu; zamknąć bez merge'a.

## Performance Considerations

Krok SQL dokłada kilka sekund do joba `smoke`: bez drugiego startu bazy, jeden `docker exec` na plik.

## Migration Notes

Zmiana nie dodaje migracji i nie wymaga `supabase db push`. Ręczny próbny PR z fazy 3 zawiera migrację psującą, więc **nie wolno go mergować ani puszczać na produkcję**. Zamknij go bez merge'a i usuń gałąź.

## References

- Related research: `context/changes/testing-sql-gate-in-ci/research.md`
- Test plan: `context/foundation/test-plan.md` (§2 ryzyka #1, #3, #4; §3 faza 1)
- Istniejące sprawdzenia: `supabase/tests/rls_checks.sql:22`, `:262-272`, `:436-450`, `:1195-1204`, `:1216-1223`
- Polityki i wyzwalacze: `supabase/migrations/20260922120000_medication_schema.sql:106-216`, `:253-408`
- Job CI: `.github/workflows/ci.yml:28-60`
- Kroki izolacji przez PostgREST: `scripts/smoke.mjs:193-281`
- Lessons: „Bramka musi odróżnić blokadę od niewykonania”, „Lokalne bramki sprawdź pod kątem tego, do której bazy faktycznie idą”, „Ograniczenie na tabeli podrzędnej nie chroni, dopóki rodzic go nie ma”

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Bramka w CI na istniejących sprawdzeniach

#### Automated

- [x] 1.1 `npm test` przechodzi, w tym `scripts/db-checks.test.mjs`
- [x] 1.2 `npm run lint` przechodzi
- [x] 1.3 `npm run db:check` lokalnie kończy się kodem 0 i wypisuje `GATE_COMPLETE rls_checks`
- [x] 1.4 Próbka `failing-check.sql` kończy runner kodem różnym od zera
- [x] 1.5 Próbka `missing-marker.sql` kończy runner kodem różnym od zera z komunikatem o braku znacznika
- [ ] 1.6 Job `smoke` na PR zielony, obie próbki czerwone w logu kroku „SQL checks”

#### Manual

- [x] 1.7 Przy zatrzymanym Supabase `npm run db:check` pada z nazwą kontenera
- [x] 1.8 README czytelnie mówi, co robić przy czerwonym `smoke` i przed `db push`

### Phase 2: Nienaruszalność historii (#3) w rls_checks.sql

#### Automated

- [ ] 2.1 `npm run db:check` lokalnie przechodzi i wypisuje `CHECK 19 OK`
- [ ] 2.2 Brak wpisanego `return true` i `when others` w `rls_checks.sql`
- [ ] 2.3 Job `smoke` na PR zielony

#### Manual

- [ ] 2.4 Lokalnie zepsuty wyzwalacz `dose_text` daje czerwone sprawdzenie 5 albo 19
- [ ] 2.5 Zmieniona oczekiwana fraza daje czerwone sprawdzenie z otrzymaną treścią w logu

### Phase 3: Izolacja kont per operacja (#1)

#### Automated

- [ ] 3.1 `npm run db:check` lokalnie przechodzi i wypisuje `GATE_COMPLETE account_isolation_checks`
- [ ] 3.2 Brak `when others` w `account_isolation_checks.sql`
- [ ] 3.3 Job `smoke` na PR zielony, log pokazuje oba pliki

#### Manual

- [ ] 3.4 Próbny PR z polityką `using (true)` daje czerwony krok „SQL checks”, bez deployu, zamknięty bez merge'a
- [ ] 3.5 Blok z rolą `postgres` pada na asercji `current_user`
