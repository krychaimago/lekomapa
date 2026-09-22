# Schemat leków i okresów dawkowania z RLS — plan wdrożenia

## Overview

Pierwsza migracja lekomapy zakłada trzy tabele: lek użytkowniczki (nazwa handlowa), jego skład (substancje czynne z kodami ATC) i okresy dawkowania od–do. RLS włączone w tej samej migracji, z politykami per-operacja i per-rola. Do tego typy encji w `src/types.ts` oraz krok w `scripts/smoke.mjs` dowodzący, że drugie konto nie widzi cudzych wierszy — ta ścieżka weryfikacji zostaje bramką dla każdej późniejszej tabeli produktu.

To fundament (F-01 w `context/foundation/roadmap.md`, issue #9). Odblokowuje S-02 (gwiazda przewodnia) i S-05.

## Current State Analysis

- **Brak `supabase/migrations/`** — katalog nie istnieje, w bazie nie ma ani jednej tabeli produktowej. Ten plan zakłada katalog i konwencję nazewniczą dla całego produktu.
- **Brak `src/types.ts`** — plik powstaje tu po raz pierwszy.
- **Auth działa i jest baseline'em** — `src/middleware.ts:6` wpina użytkownika w `context.locals.user`, `src/lib/supabase.ts:5` tworzy klienta SSR z ciasteczkami. Tożsamość konta w bazie to `auth.users.id`, dostępne w politykach jako `auth.uid()`.
- **`scripts/smoke.mjs` to jedyny test** — bezzależnościowy, przechodzi ścieżkę auth po HTTP. CI (`.github/workflows/ci.yml`, job `smoke`) podnosi lokalne Supabase przez CLI, buduje aplikację i odpala skrypt. `supabase start` stosuje migracje z `supabase/migrations/` automatycznie, więc migracja trafia do bramki CI bez dodatkowej konfiguracji.
- **Supabase CLI jest w `devDependencies`**, nie globalnie — wszystkie komendy przez `npx supabase`.
- **Rejestr leków (F-02) jeszcze nie istnieje** i jest zmianą równoległą, nie wcześniejszą. Schemat F-01 nie może od niego zależeć.
- **`context/foundation/infrastructure.md:84`**: rollback Cloudflare cofa kod, nie migracje. Cofnięcie zmiany schematu wymaga osobnej migracji odwracającej.
- **`context/foundation/infrastructure.md:104`**: operacje destrukcyjne na bazie wykonuje człowiek, nie agent.

## Desired End State

Po wykonaniu planu:

- `supabase/migrations/<timestamp>_medication_schema.sql` tworzy `medications`, `medication_substances` i `dosage_periods` z RLS i ograniczeniami chroniącymi historię.
- `npx supabase db reset` przechodzi czysto na świeżej bazie.
- `src/types.ts` opisuje te trzy encje plus polecenia zapisu; `npm run typecheck` i `npm run lint` przechodzą.
- `npm run smoke` wykonuje dodatkowy krok izolacji: dwa konta, każde ze swoim lekiem, próba sięgnięcia po cudzy wiersz wraca pusta, a próba zapisu na cudzym wierszu nie zmienia niczego. Krok jest częścią CI.

Weryfikacja: `npx supabase db reset && npm run smoke` po uruchomieniu podglądu produkcyjnego.

### Key Discoveries:

- Reguły kolizji z F-02 są zapisane na poziomie grup ATC (pięć znaków), a przy leku stoi pełny kod substancji (siedem znaków). Dopasowanie idzie po przedrostku kodu, nie po równości — dlatego kolumna z kodem ATC musi trzymać pełny kod i nie wolno jej obcinać przy zapisie (`context/foundation/lessons.md`, „Niepełny zbiór reguł to co innego niż wyrzucone dane").
- Warunek okna korekty przy leku jest zdarzeniowy („dopóki nie istnieje wpis objawu po dacie rozpoczęcia", PRD `## Open Questions` pkt 5), a tabela dzienniczka powstaje dopiero w S-05. Reguła w bazie musi więc pytać osobną funkcję, której treść S-05 podmieni.
- `supabase start` w jobie `smoke` stosuje migracje sam — nie trzeba dokładać kroku do CI, żeby migracja była sprawdzana przy każdym pull requeście.
- Ograniczenie wykluczające nakładki okresów wymaga rozszerzenia `btree_gist`, bo w warunku występuje równość `uuid` obok przecięcia zakresu dat.

## What We're NOT Doing

- Żadnych tras API ani ekranów dodawania leku — to S-02. Skrypt weryfikacyjny sięga do Supabase bezpośrednio, żeby fundament nie wciągał kodu produktowego przed jego plasterkiem.
- Żadnej tabeli rejestru leków ani par kolizji — to F-02.
- Żadnych tabel dzienniczka objawów — to S-05.
- Żadnego klucza obcego z leku do rejestru — kolumna `registry_medication_id` powstaje jako zwykła kolumna, powiązanie dociąga migracja z F-02.
- Żadnej logiki zamykania i otwierania okresu dawkowania w kodzie aplikacji — F-01 daje tylko ograniczenia, które tę logikę będą pilnować w S-03.
- Żadnego generowania typów z bazy przez CLI — typy pisane ręcznie, żeby `npm run typecheck` nie wymagał uruchomionej bazy.
- Żadnego wdrożenia migracji na produkcję w ramach tej zmiany — patrz `## Migration Notes`.

## Implementation Approach

Jedna migracja, trzy fazy planu. Migracja jest niepodzielna celowo: RLS i ograniczenia powstają razem z tabelami, bo dołożone później zostawiają okno, w którym dane zdrowotne leżą bez ochrony, a przy jednym koncie testowym nic tego nie ujawnia (`context/foundation/lessons.md`, „Włącz RLS w tej samej migracji, co CREATE TABLE").

Skład leku jest kopiowany przy leku użytkowniczki, nie czytany przez odniesienie do rejestru. Dzięki temu F-01 da się dokończyć i sprawdzić bez F-02, lek spoza rejestru chodzi tą samą ścieżką co lek z rejestru, a późniejsza poprawka w rejestrze nie przepisuje po cichu historii już zapisanych leków.

Ochrona historii siedzi w bazie, nie w kodzie: nakładki okresów blokuje ograniczenie wykluczające, zmianę rdzenia wpisu blokuje wyzwalacz. Powód jest ten sam w obu wypadkach — reguła obowiązuje wtedy każdą drogę zapisu, także przyszłe trasy API i ręczną poprawkę w panelu, a błąd pada od razu zamiast wychodzić dopiero jako nieprawdziwe zdanie pokazane lekarzowi w S-06.

## Critical Implementation Details

- **Kolejność w migracji.** `create extension if not exists btree_gist` musi stać przed definicją `dosage_periods`, bo ograniczenie wykluczające z równością `uuid` bez tego rozszerzenia nie powstanie.
- **Funkcja okna korekty jest zaślepką z terminem.** W F-01 `public.medication_correction_window_open()` zwraca `true`, bo wpisów objawów jeszcze nie ma i warunek zdarzeniowy jest spełniony z definicji. Migracja z S-05 podmienia samą treść funkcji na sprawdzenie dzienniczka. Funkcja musi mieć komentarz `comment on function` mówiący to wprost — inaczej ktoś usunie ją jako martwy kod.
- **Polityki RLS dla tabel podrzędnych idą przez lek nadrzędny.** `medication_substances` i `dosage_periods` nie mają własnej kolumny właściciela; przynależność sprawdzana jest zapytaniem o wiersz `medications` tego samego użytkownika. Duplikowanie `user_id` na tabelach podrzędnych dawałoby dwa źródła prawdy o właścicielu i możliwość ich rozjechania.
- **Zamknięcie okresu to nie zmiana rdzenia.** Wyzwalacz musi przepuścić ustawienie daty końca okresu z pustej na konkretną nawet po zamknięciu okna korekty — na tym polega zmiana dawkowania z FR-004 i odstawienie z FR-005. Blokowana jest zmiana dawki, daty rozpoczęcia oraz podmiana już ustawionej daty końca.

---

## Phase 1: Migracja — tabele, RLS, ograniczenia

### Overview

Pierwsza migracja produktu. Trzy tabele, RLS z politykami per-operacja i per-rola, ograniczenie przeciw nakładkom okresów, wyzwalacz chroniący rdzeń wpisu.

### Changes Required:

#### 1. Katalog migracji

**File**: `supabase/migrations/` (nowy katalog)

**Intent**: Założyć miejsce na migracje i ustalić konwencję nazw obowiązującą dla całego produktu.

**Contract**: Nazwy plików `YYYYMMDDHHmmss_krotki_opis.sql`, zgodnie z `README.md` `### Migracje` i `CLAUDE.md`. Plik tej zmiany: `<timestamp>_medication_schema.sql`.

#### 2. Tabela leku użytkowniczki

**File**: `supabase/migrations/<timestamp>_medication_schema.sql`

**Intent**: Zapisać przyjmowany preparat jako jedną pozycję na liście: nazwa handlowa jako etykieta, odniesienie do rejestru jako notatka o pochodzeniu składu, data odstawienia jako sposób zakończenia leku bez usuwania go z historii (FR-003, FR-005).

**Contract**: Tabela `public.medications` z kolumnami:

| Kolumna                  | Typ           | Uwagi                                                                    |
| ------------------------ | ------------- | ------------------------------------------------------------------------ |
| `id`                     | `uuid`        | klucz główny, `gen_random_uuid()`                                        |
| `user_id`                | `uuid`        | `not null`, `references auth.users(id) on delete cascade`                |
| `product_name`           | `text`        | `not null`, nazwa handlowa wpisana przez użytkowniczkę                   |
| `composition_source`     | `text`        | `not null`, `check` na `'registry'` albo `'leaflet'`                     |
| `registry_medication_id` | `uuid`        | dopuszcza pustą wartość, **bez klucza obcego** — dociąga go F-02         |
| `discontinued_on`        | `date`        | dopuszcza pustą wartość; wypełniona oznacza lek zakończony, nie usunięty |
| `created_at`             | `timestamptz` | `not null default now()`                                                 |
| `updated_at`             | `timestamptz` | `not null default now()`                                                 |

Indeks na `user_id`. Kaskada z `auth.users` pokrywa wymaganie bezpowrotnego skasowania danych po usunięciu konta (S-09 dokłada resztę).

#### 3. Tabela składu leku

**File**: `supabase/migrations/<timestamp>_medication_schema.sql`

**Intent**: Zapisać pełny skład preparatu — także substancje spoza grup objętych regułami — bo pominięcie którejkolwiek daje brak znacznika przy leku, który faktycznie koliduje (FR-003, rewizja 2026-09-21).

**Contract**: Tabela `public.medication_substances`:

| Kolumna          | Typ    | Uwagi                                                      |
| ---------------- | ------ | ---------------------------------------------------------- |
| `id`             | `uuid` | klucz główny                                               |
| `medication_id`  | `uuid` | `not null`, `references medications(id) on delete cascade` |
| `substance_name` | `text` | `not null`, nazwa substancji czynnej                       |
| `atc_code`       | `text` | `not null`, **pełny kod**, nigdy obcięty do grupy          |

Ograniczenie `unique (medication_id, atc_code)` i indeks na `medication_id`. Kontrola kształtu kodu ATC dopuszczająca wszystkie poziomy klasyfikacji, nie tylko siedmioznakowy:

```sql
check (atc_code ~ '^[A-Z][0-9]{2}([A-Z]([A-Z]([0-9]{2})?)?)?$')
```

Powód luźnej kontroli: reguły z F-02 siedzą na grupach, a dopasowanie idzie po przedrostku — kontrola przyjmująca wyłącznie siedem znaków zamknęłaby drogę zapisowi kodu na poziomie grupy, gdyby ulotka nie dawała więcej.

#### 4. Tabela okresów dawkowania

**File**: `supabase/migrations/<timestamp>_medication_schema.sql`

**Intent**: Trzymać historię dawkowania jako ciąg okresów od–do, tak żeby zmiana dawki zamykała okres i otwierała nowy zamiast nadpisywać poprzedni (FR-004).

**Contract**: Tabela `public.dosage_periods`:

| Kolumna         | Typ           | Uwagi                                                                      |
| --------------- | ------------- | -------------------------------------------------------------------------- |
| `id`            | `uuid`        | klucz główny                                                               |
| `medication_id` | `uuid`        | `not null`, `references medications(id) on delete cascade`                 |
| `dose_text`     | `text`        | `not null`, dawkowanie własnymi słowami użytkowniczki                      |
| `started_on`    | `date`        | `not null`                                                                 |
| `ended_on`      | `date`        | pusta wartość oznacza okres trwający                                       |
| `period`        | `daterange`   | kolumna wyliczana i przechowywana, `daterange(started_on, ended_on, '[)')` |
| `created_at`    | `timestamptz` | `not null default now()`                                                   |

Ograniczenie `check (ended_on is null or ended_on >= started_on)` oraz ograniczenie przeciw nakładkom:

```sql
exclude using gist (medication_id with =, period with &&)
```

Poprzedzone `create extension if not exists btree_gist;` — bez niego równość `uuid` w ograniczeniu wykluczającym nie działa. Indeks na `medication_id`.

#### 5. RLS i polityki

**File**: `supabase/migrations/<timestamp>_medication_schema.sql`

**Intent**: Odciąć każde konto od cudzych danych zdrowotnych na poziomie bazy, a nie zapytań w kodzie — to mechanizm izolacji per-konto z wymagań niefunkcjonalnych PRD.

**Contract**: `alter table ... enable row level security` na wszystkich trzech tabelach, w tej samej migracji, w której powstają. Polityki **osobne dla każdej operacji** (`select`, `insert`, `update`, `delete`) i **dla roli `authenticated`**; dla roli `anon` nie powstaje żadna polityka, więc dostęp jest odcięty. Dwanaście polityk łącznie.

- `medications`: warunek `user_id = auth.uid()`, przy `insert` ten sam warunek w `with check`, przy `update` w `using` i `with check`.
- `medication_substances` i `dosage_periods`: warunek przez lek nadrzędny —

```sql
exists (
  select 1 from public.medications m
  where m.id = medication_id and m.user_id = auth.uid()
)
```

#### 6. Funkcja okna korekty i wyzwalacze niemodyfikowalności

**File**: `supabase/migrations/<timestamp>_medication_schema.sql`

**Intent**: Nie dopuścić do zmiany rdzenia wpisu po zamknięciu okna korekty, żeby wcześniejsze zestawienia objawów z okresami dawkowania nie przestały być prawdziwe (FR-004, `CLAUDE.md` `### Nienaruszalność historii`).

**Contract**: Funkcja `public.medication_correction_window_open(p_medication_id uuid) returns boolean`, w F-01 zwracająca `true`, z komentarzem `comment on function` mówiącym, że treść podmienia migracja z S-05 na sprawdzenie wpisów dzienniczka po dacie rozpoczęcia. Wyzwalacze `before update`:

- na `medication_substances` — blokują zmianę `substance_name` i `atc_code`, gdy funkcja zwraca `false`; substancja czynna pozostaje niemodyfikowalna, jej zmiana to zakończenie leku i dodanie nowego,
- na `dosage_periods` — blokują zmianę `dose_text`, `started_on` oraz podmianę `ended_on` z jednej daty na inną, gdy funkcja zwraca `false`; ustawienie `ended_on` z pustej wartości na datę przechodzi zawsze, bo na tym polega zamknięcie okresu.

Dodatkowo wyzwalacze `before delete` na `medication_substances` i `dosage_periods`, blokujące usunięcie wiersza, gdy funkcja okna zwraca `false`. Bez nich ochrona rdzenia jest pozorna: wiersza nie da się zmienić, ale da się go skasować i zapisać od nowa z inną dawką. Usunięcie pozycji dodanej przez pomyłkę pozostaje możliwe, dopóki okno korekty jest otwarte (FR-005, FR-009).

Wyzwalacze przy usuwaniu muszą przepuścić kasowanie kaskadowe idące od `medications` — inaczej zablokują usunięcie leku i usunięcie konta w S-09. Rozpoznanie kaskady: brak wiersza nadrzędnego w `medications` w momencie usuwania wiersza podrzędnego.

Komunikat wyjątku nazywa pole i powód, nie samą nazwę wyzwalacza.

#### 7. Plik sprawdzeń SQL

**File**: `supabase/tests/rls_checks.sql` (nowy)

**Intent**: Dać kryteriom sukcesu Fazy 1 jedną komendę do uruchomienia, zamiast opisu zapytania, które każdy odpala po swojemu. Plik zostaje w repozytorium jako wzór dla kolejnych tabel.

**Contract**: Zapytania sprawdzające po kolei: włączone RLS na trzech tabelach (`pg_tables.rowsecurity`), liczbę polityk per tabela (`pg_policies`), odrzucenie dwóch nakładających się okresów, zachowanie wyzwalaczy przy funkcji okna zwracającej `true` i `false` (zmiana oraz usunięcie), przejście kaskady przy usunięciu leku. Każde sprawdzenie kończy się czytelnym wierszem wyniku, a nieudane podnosi wyjątek, żeby kod wyjścia był różny od zera.

Uruchomienie: Supabase CLI nie wykonuje SQL, a `psql` nie jest zależnością repozytorium, więc plik idzie do kontenera bazy podniesionego przez `npx supabase start`. Nazwę kontenera daje `npx supabase status`; komendę w tej postaci zapisać w `README.md` obok opisu migracji:

```bash
docker exec -i $(docker ps -qf name=supabase_db) psql -U postgres -d postgres -f - < supabase/tests/rls_checks.sql
```

#### 8. Wyzwalacz `updated_at`

**File**: `supabase/migrations/<timestamp>_medication_schema.sql`

**Intent**: Nie dopuścić, żeby kolumna `updated_at` na zawsze została równa `created_at` i kłamała o tym, kiedy wiersz był ostatnio zmieniany.

**Contract**: Funkcja podnosząca `updated_at` do `now()` i wyzwalacz `before update` na `medications`. Jeśli implementujący uzna kolumnę za zbędną na tym etapie, alternatywą jest jej usunięcie — kolumna bez utrzymania jest gorsza niż jej brak.

### Success Criteria:

Sprawdzenia z zapytaniami SQL (1.2–1.5, 1.8) odpala plik `supabase/tests/rls_checks.sql` z punktu 7 — jedną komendą, nie ręcznym klikaniem w Studio.

#### Automated Verification:

- Migracja stosuje się czysto na świeżej bazie: `npx supabase db reset`
- Wszystkie trzy tabele mają włączone RLS (zapytanie o `pg_tables.rowsecurity` zwraca `true` dla każdej)
- Liczba polityk to dwanaście — po cztery na tabelę (zapytanie o `pg_policies`)
- Próba zapisu dwóch nakładających się okresów dla jednego leku kończy się błędem bazy
- Próba zmiany dawki i daty rozpoczęcia zamkniętego okresu przechodzi, gdy funkcja okna zwraca `true`, i pada po tymczasowej podmianie funkcji na `false`
- Przy funkcji okna zwracającej `false` usunięcie wiersza składu i wiersza okresu pada, a usunięcie całego leku wraz z kaskadą przechodzi

#### Manual Verification:

- W Studio widać trzy tabele z oznaczeniem włączonego RLS
- Odczyt tabeli kluczem `anon` bez sesji nie zwraca żadnych wierszy

---

## Phase 2: Typy encji

### Overview

`src/types.ts` powstaje po raz pierwszy i ustala konwencję: encje odpowiadające wierszom tabel plus polecenia zapisu, wszystko w jednym pliku.

### Changes Required:

#### 1. Typy współdzielone

**File**: `src/types.ts` (nowy)

**Intent**: Dać kolejnym zmianom kontrakt danych, z którego da się wnioskować bez uruchamiania bazy, i zapobiec rozsypaniu typów po komponentach (`CLAUDE.md` `### Konwencje kodu`).

**Contract**: Typy `Medication`, `MedicationSubstance`, `DosagePeriod` odwzorowujące kolumny z Fazy 1 (pola dopuszczające pustą wartość jako `| null`, daty jako `string` w zapisie ISO). Polecenia zapisu `NewMedicationCommand`, `NewMedicationSubstanceCommand`, `NewDosagePeriodCommand` bez pól nadawanych przez bazę (`id`, `created_at`, `updated_at`). Typ `CompositionSource` jako unia `"registry" | "leaflet"`, zgodna z kontrolą w migracji. Typy pisane ręcznie — bez kroku generowania z bazy, żeby sprawdzenie typów nie wymagało uruchomionego Supabase.

### Success Criteria:

#### Automated Verification:

- Sprawdzenie typów przechodzi: `npm run typecheck`
- Lint przechodzi: `npm run lint`
- Build przechodzi: `npm run build`

---

## Phase 3: Ścieżka weryfikacji izolacji

### Overview

Krok w `scripts/smoke.mjs` dowodzący, że drugie konto nie widzi ani nie zmienia cudzych leków. Ta sama ścieżka posłuży każdej późniejszej tabeli.

### Changes Required:

#### 1. Krok izolacji w skrypcie dymnym

**File**: `scripts/smoke.mjs`

**Intent**: Zamienić RLS z deklaracji w migracji na sprawdzany fakt — wyciek ma wywracać CI, a nie czekać na zauważenie przy drugim koncie.

**Contract**: Po istniejącej ścieżce auth dochodzi blok zakładający dwa konta i sięgający do Supabase bezpośrednio przez `@supabase/supabase-js` (pakiet jest już w `dependencies`), z adresem i kluczem publicznym z `SUPABASE_URL` i `SUPABASE_KEY`. Kroki:

1. konta A i B zakładane osobno, każde zapisuje jeden lek z jedną substancją i jednym okresem dawkowania,
2. odczyt tabeli `medications` przez konto A zwraca wyłącznie własny wiersz,
3. odczyt cudzego wiersza po jego identyfikatorze przez konto A zwraca zero wierszy,
4. próba zmiany i usunięcia cudzego wiersza przez konto A nie zmienia niczego,
5. odczyt bez sesji, samym kluczem publicznym, zwraca zero wierszy,
6. te same cztery sprawdzenia dla `medication_substances` i `dosage_periods`.

Zachowana zostaje **forma wyjścia** skryptu: wiersz `PASS`/`FAIL` na krok, licznik błędów i kod wyjścia różny od zera przy porażce. Nie zachowany zostaje kształt kroku — obecna trójka `[nazwa, funkcja, { status, location }]` (`scripts/smoke.mjs:61`) porównuje kod HTTP i przekierowanie, a kroki izolacji porównują liczbę wierszy. Pętla sprawdzająca (`scripts/smoke.mjs:85`) dostaje drugi wariant oczekiwania — sprawdzenie zwracające wartość prawda lub fałsz — przy zachowaniu dotychczasowego wariantu dla kroków HTTP.

Krok izolacji działa **wyłącznie w trybie kont jednorazowych**. Przy ustawionych `SMOKE_EMAIL` i `SMOKE_PASSWORD` (zmienna `usesExistingAccount`, `scripts/smoke.mjs:21`) jest pomijany z jawnym wierszem `SKIP` w wyjściu i powodem. Tamten tryb jest pomyślany pod środowisko potwierdzające adres e-mail, czyli pod produkcję — zakładanie tam drugiego konta jest niemożliwe, a zapisywanie zmyślonych leków do prawdziwego konta byłoby wpisem zmyślonych danych zdrowotnych. CI chodzi w trybie jednorazowym, więc bramka pozostaje w mocy.

Brak `SUPABASE_URL` albo `SUPABASE_KEY` kończy bieg błędem z nazwą brakującej zmiennej — nigdy cichym pominięciem kroku.

Nagłówek skryptu (`scripts/smoke.mjs:2`) deklaruje „Zero dependencies on purpose" — po dołożeniu importu `@supabase/supabase-js` deklaracja przestaje być prawdziwa i komentarz idzie do poprawki razem z kodem.

#### 2. Opis w README

**File**: `README.md`

**Intent**: Powiedzieć wprost, że krok izolacji jest obowiązkową częścią sprawdzenia każdej nowej tabeli, a nie jednorazowym testem tej zmiany.

**Contract**: Uzupełnienie sekcji `### Migracje` i sekcji o testach o dwie rzeczy: każda nowa tabela dokłada swój zestaw sprawdzeń izolacji do `scripts/smoke.mjs`, a sprawdzenia SQL z `supabase/tests/rls_checks.sql` uruchamia się komendą podaną w Fazie 1 punkt 7. Bez zmiany struktury dokumentu.

### Success Criteria:

#### Automated Verification:

- `npm run smoke` przechodzi lokalnie przeciw `npx supabase start` i podglądowi produkcyjnemu
- Wszystkie kroki izolacji raportują wynik pozytywny, a ich liczba zgadza się z listą z kontraktu
- Job `smoke` w CI jest zielony na pull requeście z tą zmianą

#### Manual Verification:

- Tymczasowe wyłączenie RLS na jednej tabeli powoduje, że `npm run smoke` pada — dowód, że krok faktycznie mierzy to, co deklaruje (przywrócić przed commitem)

---

## Testing Strategy

### Integration Tests:

- `scripts/smoke.mjs` jako jedyna warstwa testów w repozytorium: ścieżka auth (istniejąca) plus izolacja danych dwóch kont (nowa).

### Manual Testing Steps:

1. `npx supabase start`, następnie `npx supabase db reset` — migracja stosuje się czysto.
2. W Studio sprawdzić, że trzy tabele mają włączone RLS i po cztery polityki.
3. `npm run build`, `npm run preview -- --port 4321`, w drugim terminalu `BASE_URL=http://localhost:4321 npm run smoke`.
4. Wyłączyć RLS na `medications`, powtórzyć `npm run smoke` — musi paść. Przywrócić RLS.

## Performance Considerations

Skala z PRD jest mała (jedna użytkowniczka, mały wolumen), więc indeksy na `user_id` i `medication_id` wystarczają. Polityki tabel podrzędnych wykonują zapytanie o lek nadrzędny przy każdym wierszu — przy tej skali bez znaczenia, ale gdyby lista leków kiedyś urosła, to jest pierwsze miejsce do zmierzenia.

## Migration Notes

- Wdrożenie migracji na produkcyjne Supabase wykonuje człowiek: `npx supabase link` i `npx supabase db push`, zgodnie z zasadą z `context/foundation/infrastructure.md:104`.
- Rollback Cloudflare cofa kod, nie schemat bazy (`infrastructure.md:84`). Cofnięcie tej migracji wymaga osobnej migracji odwracającej — usunięcia trzech tabel, funkcji i wyzwalaczy w odwrotnej kolejności.
- Dług do domknięcia w F-02: `medications.registry_medication_id` zostaje zwykłą kolumną, dopóki nie istnieje tabela rejestru. Migracja z F-02 dokłada klucz obcy.
- Dług do domknięcia w S-05: treść `public.medication_correction_window_open()` podmieniana na sprawdzenie wpisów dzienniczka po dacie rozpoczęcia.

## References

- Roadmapa: `context/foundation/roadmap.md`, pozycja F-01 (issue #9)
- Wymagania: `context/foundation/prd.md` — FR-003, FR-004, FR-005, `## Non-Functional Requirements`
- Reguły: `context/foundation/lessons.md` — RLS w tej samej migracji, niezawężanie danych wejściowych
- Infrastruktura: `context/foundation/infrastructure.md:84`, `:104`
- Klient Supabase: `src/lib/supabase.ts:5`; middleware: `src/middleware.ts:6`
- Skrypt dymny: `scripts/smoke.mjs`; CI: `.github/workflows/ci.yml`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Migracja — tabele, RLS, ograniczenia

#### Automated

- [x] 1.1 Migracja stosuje się czysto na świeżej bazie: `npx supabase db reset`
- [x] 1.2 Wszystkie trzy tabele mają włączone RLS (zapytanie o `pg_tables.rowsecurity` zwraca `true` dla każdej)
- [x] 1.3 Liczba polityk to dwanaście — po cztery na tabelę (zapytanie o `pg_policies`)
- [x] 1.4 Próba zapisu dwóch nakładających się okresów dla jednego leku kończy się błędem bazy
- [x] 1.5 Próba zmiany dawki i daty rozpoczęcia zamkniętego okresu przechodzi, gdy funkcja okna zwraca `true`, i pada po tymczasowej podmianie funkcji na `false`
- [x] 1.8 Przy funkcji okna zwracającej `false` usunięcie wiersza składu i wiersza okresu pada, a usunięcie całego leku wraz z kaskadą przechodzi

#### Manual

- [x] 1.6 W Studio widać trzy tabele z oznaczeniem włączonego RLS
- [x] 1.7 Odczyt tabeli kluczem `anon` bez sesji nie zwraca żadnych wierszy

### Phase 2: Typy encji

#### Automated

- [ ] 2.1 Sprawdzenie typów przechodzi: `npm run typecheck`
- [ ] 2.2 Lint przechodzi: `npm run lint`
- [ ] 2.3 Build przechodzi: `npm run build`

### Phase 3: Ścieżka weryfikacji izolacji

#### Automated

- [ ] 3.1 `npm run smoke` przechodzi lokalnie przeciw `npx supabase start` i podglądowi produkcyjnemu
- [ ] 3.2 Wszystkie kroki izolacji raportują wynik pozytywny, a ich liczba zgadza się z listą z kontraktu
- [ ] 3.3 Job `smoke` w CI jest zielony na pull requeście z tą zmianą

#### Manual

- [ ] 3.4 Tymczasowe wyłączenie RLS na jednej tabeli powoduje, że `npm run smoke` pada (przywrócić przed commitem)
