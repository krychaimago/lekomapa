# S-04: Zakończenie przyjmowania leku z datą — plan wdrożenia

## Overview

Użytkowniczka może zakończyć przyjmowanie leku datą „pierwszego dnia bez leku”. Lek przechodzi z listy aktualnych na osobną stronę leków zakończonych, zostaje w historii i dalej tłumaczy dawne wpisy. Zakończenie można poprawić albo cofnąć w jego własnym oknie korekty (24 h od zapisu). Trwałe usunięcie jest osobną, wyraźnie oddzieloną ścieżką — tylko dla pozycji dodanej przez pomyłkę, tylko w oknie korekty leku. Plan domyka dwa długi z roadmapy: S-02 (data zakończenia ruchoma po zamknięciu okna) i S-03 F6b (okres otwarty po dacie zakończenia).

Roadmapa: S-04, issue #15, FR-005.

## Current State Analysis

- **Baza** (`supabase/migrations/`):
  - `medications.discontinued_on date` istnieje od F-01 (`20260922120000_medication_schema.sql:29`). Nic w aplikacji jej nie zapisuje.
  - Reguła „aktualny” jest wszędzie ta sama: `discontinued_on is null or discontinued_on > dziś (Europe/Warsaw)` — `medication_interactions()` (`20260930120000_medication_write_and_interactions.sql:309-310`), DP001 w `change_dosage` (`20261004130000_dosage_period_variant_guard.sql:206`), `src/pages/leki/index.astro:41`, `src/pages/leki/[id].astro:165`, `src/pages/leki/[id]/zmiana-dawki.astro:63`. Data działa więc jak pierwszy dzień bez leku — tak samo jak `dosage_periods.ended_on` (granica wyłączna).
  - `medications_guard_core` (`20260930120000_…sql:112-141`) po zamknięciu okna blokuje tylko `composition_source`, `registry_medication_id`, `user_id`. `discontinued_on` przechodzi zawsze — dług S-02.
  - `dosage_periods_guard_core` (`20261005120000_correction_window.sql:167-226`) po zamknięciu okna okresu przepuszcza `ended_on` z pustego na datę w `[dziś − 14, dziś]`, a zmianę już ustawionego `ended_on` blokuje. Cofnięcie zakończenia potrzebuje więc wąskiego wyjątku.
  - `dosage_periods_guard_insert` (`20261005120000_correction_window.sql:313-350`) nie patrzy na `discontinued_on` — przy przyszłej dacie zakończenia `change_dosage` otwierał okres trwający dalej niż lek (F6b).
  - `medications_guard_delete` (`20260922120000_medication_schema.sql:370-391`) już pozwala usunąć lek wyłącznie w oknie korekty leku (24 h od `created_at`), z kaskadą na skład i okresy. Rzuca ogólne P0001.
  - Okno korekty: `correction_window_end(timestamptz)` to jedyne miejsce z „24 h” (`20261005120000_correction_window.sql:89-101`); pola wyliczane `correction_window_ends_at(...)` dla ekranów (`:362-393`).
- **Aplikacja**:
  - Brak przycisku, trasy i funkcji do zakończenia leku; brak ścieżki usuwania w UI.
  - `/leki` po prostu ukrywa leki zakończone (`src/pages/leki/index.astro:41`); szczegóły nie pokazują daty zakończenia.
  - Wzorzec tras: POST z formularza, zod, RPC, mapowanie nazwanych kodów na klucze `MEDICATION_COPY.apiErrors`, przekierowanie z `?error=<klucz>` albo banerem sukcesu (`src/pages/api/medications/[id]/dosage.ts:15-24`, `:54-56`, `:106`).
  - Teksty w `src/lib/copy/medications.ts`; `scripts/fr012/medication-copy.test.mjs:28` przepuszcza każdy tekst przez `FORBIDDEN_WORDS` (`scripts/rpl/pairs.mjs:24-61`), który zawiera `odstaw`, `przesta`, `dawk`.
- **Testy**:
  - `rls_checks.sql` CHECK 21 (`:736-758`) twierdzi, że `discontinued_on = '2026-06-01'` przechodzi przy zamkniętym oknie — po tej zmianie to musi być odmowa.
  - `dosage_change_checks.sql` DOSAGE 8 (`:431-463`) i `medication_interaction_checks.sql` INTERACTION 8 (`:423-456`) ustawiają datę zakończenia „jutro” — po tej zmianie niedozwoloną.
  - `correction_window_checks.sql:80-110` — wzorzec `pg_temp.backdate` (postarzanie wiersza przez wyłączenie jednego wyzwalacza na jeden update) zamiast podmiany funkcji okna.
  - `npm run db:check` sam bierze każdy `supabase/tests/*.sql` (`scripts/db-checks.mjs:219`).

## Desired End State

- Na szczegółach leku aktualnego jest „Zakończ przyjmowanie”. Formularz pyta o „Pierwszy dzień bez leku” (domyślnie dziś), przyjmuje datę od `max(dzień po początku bieżącego okresu, dziś − 14)` do dziś.
- Po zapisie lek znika z `/leki`, bieżący okres jest zamknięty tą datą, a szczegóły pokazują „przyjmowany do <dzień przed datą>” i — przez 24 h od zapisu — „Zakończenie można poprawić lub cofnąć do <data, godzina>”.
- W oknie zakończenia można zmienić datę albo cofnąć zakończenie (okres wraca jako trwający, lek wraca na `/leki`). Po oknie data jest ostateczna — także przy bezpośrednim zapisie do bazy.
- Nie da się zapisać daty zakończenia w przyszłości ani starszej niż 14 dni; do leku zakończonego nie da się dopisać okresu.
- `/leki/zakonczone` pokazuje leki zakończone (najnowsze zakończenie najpierw). Pod notą na `/leki` jest link „Zakończone leki (n)”, widoczny przy n > 0.
- W oknie korekty leku (24 h od dodania) szczegóły mają osobny, odsunięty link „Usuń pozycję dodaną przez pomyłkę”, prowadzący na ekran potwierdzenia.
- Weryfikacja: `npm run db:check`, `npm test`, `npm run lint`, `npm run typecheck`, `npm run smoke` zielone; ręczny przegląd na telefonie.

### Key Discoveries:

- Filtr FR-012 blokuje `odstaw` i `przesta` — w UI wyłącznie „zakończ przyjmowanie” / „zakończony” (`scripts/rpl/pairs.mjs:31`, `:61`; decyzja S-03 w `context/archive/2026-10-04-dosage-period-history/plan.md:312`).
- S-05 F1 przesądziło: okres zamyka się najwyżej 14 dni wstecz (`context/archive/2026-10-05-symptom-journal-entry/reviews/impl-review.md:47-55`). Ta sama granica obowiązuje datę zakończenia.
- `/leki/zakonczone` leży pod `/leki`, więc jest chroniona automatycznie (`src/lib/navigation.ts`, `src/middleware.ts:13`); statyczna trasa ma w Astro pierwszeństwo przed `[id]`.
- `pg_temp.backdate` wyłącza tylko wyzwalacz `<tabela>_freeze_created_at` — postarzenie zakończenia potrzebuje analogicznego wyłączenia wyzwalacza stemplującego (`correction_window_checks.sql:80-110`).

## What We're NOT Doing

- Data zakończenia w przyszłości (decyzja: zapisujemy fakt, który już nastąpił).
- Data zakończenia starsza niż 14 dni — „skończyłam miesiąc temu” dostaje komunikat z najwcześniejszą możliwą datą. Historia pokaże wtedy lek dłużej, niż był brany; świadomy koszt spójności z S-05 F1.
- Wznowienie zakończonego leku. Powrót do leku = dodanie nowej pozycji; zakończona zostaje bez zmian.
- Zakończenie w dniu rozpoczęcia bieżącego okresu (okres zerowej długości). Komunikat podaje najwcześniejszą datę; pozycja dodana dziś przez pomyłkę idzie ścieżką usuwania.
- Stronicowanie `/leki/zakonczone` — osobno, gdy lista urośnie (jak F8 w dzienniczku).
- Testy E2E Playwright dla tej ścieżki — pokrycie przez SQL, testy jednostkowe i smoke.
- Udział leków zakończonych w S-06 — S-06 czyta okresy z bazy; zamknięty okres wystarcza.
- Zmiana `change_dosage`: DP001 (`discontinued_on <= dziś`) obejmuje teraz każdy lek zakończony, bo przyszłych dat nie ma.

## Implementation Approach

Baza jest jedynym źródłem reguł, aplikacja tłumaczy nazwane kody na tekst. Zamknięcie i ponowne otwarcie okresu robi wyzwalacz na `medications`, nie funkcja RPC — każda ścieżka zapisu `discontinued_on` (RPC, bezpośredni update) zostawia okresy spójne z datą zakończenia (lesson „Ograniczenie na tabeli podrzędnej…”: gwarancja na całą ścieżkę zapisu). Funkcje RPC sprawdzają warunki z góry i zwracają nazwane kody (lesson „Bramka musi odróżnić blokadę od niewykonania”); strażniki zostają ostatnią linią obrony z ogólnym P0001.

Okno zakończenia liczy się od nowej kolumny `discontinued_at` (zegar serwera, niepodrabialna, jak `created_at` w S-05) przez tę samą `correction_window_end`. Przesunięcie daty nie przedłuża okna; cofnięcie i ponowne zakończenie to nowy zapis z nowym oknem.

## Critical Implementation Details

- **Kolejność w migracji**: najpierw sprawdzenie danych i dopełnienie `discontinued_at` dla istniejących wierszy, dopiero potem wyzwalacze stemplujące i nowe strażniki — inaczej dopełnienie odbije się od nowych reguł.
- **Kolejność wyzwalaczy**: `BEFORE UPDATE` na `medications` odpalają się alfabetycznie. Strażnik czyta `old.discontinued_at`, stempel nadpisuje `new.discontinued_at` — obie kolejności działają, bo strażnik nigdy nie czyta `new.discontinued_at`. Synchronizacja okresów jest `AFTER UPDATE OF discontinued_on`, więc wyjątek w `dosage_periods_guard_core` porównuje z już nową wartością `medications.discontinued_on`. Z tego samego powodu wyjątek nie może czytać okna z `medications.discontinued_at` — przy cofnięciu jest już null. Okno sprawdza wyłącznie `medications_guard_core` (BEFORE, z `old.discontinued_at`); wyjątek ogranicza się do `pg_trigger_depth() > 1` i ostatniego okresu.
- **Postarzanie w testach**: okno zakończenia sprawdzaj prawdziwym zegarem przez cofnięcie `discontinued_at` z wyłączonym wyzwalaczem stemplującym — nie przez podmianę funkcji (test-plan ryzyko #3: test nie może podmieniać tego, co sprawdza).

## Phase 1: Baza i testy SQL

### Overview

Migracja z kolumną chwili zapisu, regułami daty, synchronizacją okresów, wyjątkiem dla ponownego otwarcia okresu i trzema funkcjami RPC. Nowy plik testów i aktualizacja testów, które zakładały starą swobodę.

### Changes Required:

#### 1. Migracja zakończenia leku

**File**: `supabase/migrations/20261006120000_discontinue_medication.sql`

**Intent**: Nagłówek po angielsku w stylu S-03/S-05 (przykład, kody błędów, uwaga wdrożeniowa). Kolejno:

1. **Sprawdzenie danych**: migracja przerywa się nazwanym komunikatem, jeśli istnieje lek z `discontinued_on` w przyszłości (Europe/Warsaw) albo lek z `discontinued_on` i okresem bez `ended_on`. Aplikacja nigdy nie pisała tej kolumny, więc oczekiwany wynik to zero wierszy; jeśli nie — wdrożenie staje zamiast cicho naprawiać historię.
2. **Kolumna** `medications.discontinued_at timestamptz`, w tej kolejności: (a) `add column` bez ograniczenia; (b) dopełnienie istniejących zakończonych `update … set discontinued_at = updated_at where discontinued_on is not null` (okno już zamknięte); (c) dopiero potem `add constraint … check ((discontinued_on is null) = (discontinued_at is null))`. Odwrotna kolejność wywraca migrację na pierwszym zakończonym leku.
3. **Stempel** `medications_stamp_discontinuation` (`BEFORE INSERT OR UPDATE`): insert z `discontinued_on` odrzucany (lek powstaje aktualny); null→data: `discontinued_at := now()`; data→null: `null`; data→inna data albo bez zmiany: `old.discontinued_at`. Klient nie ustawi tej kolumny sam.
4. **`medications_guard_core`** dostaje gałąź dla `discontinued_on`, niezależną od okna leku: nowa data (różna od starej) musi leżeć w `[dziś − 14, dziś]`; zmiana albo wyczyszczenie już ustawionej daty tylko gdy `now() < correction_window_end(old.discontinued_at)`, inaczej P0001 z „okno korekty … jest już zamknięte”. Komentarz w nagłówku poprawia zdanie „setting the date it was stopped is still allowed”.
5. **Synchronizacja** `medications_sync_discontinuation` (`AFTER UPDATE OF discontinued_on`): null→data zamyka trwający okres tą datą; data→data przesuwa `ended_on` ostatniego okresu; data→null przywraca mu `ended_on = null`. Brak trwającego okresu przy zakończeniu = P0001 (RPC łapie to wcześniej jako MD006).
6. **`dosage_periods_guard_core`**: wyjątek od blokady zmiany ustawionego `ended_on` — przechodzi wyłącznie, gdy zapis przychodzi z wyzwalacza `medications_sync_discontinuation` (`pg_trigger_depth() > 1`), okres jest ostatnim okresem leku, a nowe `ended_on` równa się bieżącemu `medications.discontinued_on` (także null). Wyjątek **nie** sprawdza okna zakończenia: przy cofnięciu `discontinued_at` jest już wyczyszczone przez stempel, więc okno liczone z niego zawsze dawałoby odmowę. O oknie decyduje `medications_guard_core` na podstawie `old.discontinued_at`, zanim wyzwalacz synchronizacji w ogóle się odpali. Bezpośredni zapis klienta do `dosage_periods` ma głębokość 1 i wyjątku nie dostaje. Komentarz w kodzie: każdy przyszły wyzwalacz piszący do `dosage_periods` też będzie miał głębokość > 1 — musi dopisać się do warunku świadomie. Druga, nowa reguła — niezależna od okna okresu i okna zakończenia, sprawdzana także przy otwartym oknie okresu: jeśli lek ma `discontinued_on`, nowy wiersz okresu nie może mieć `ended_on` null ani `ended_on > discontinued_on` (P0001). Bez niej świeżo dodany i zakończony lek dawał się „otworzyć” bezpośrednim `update dosage_periods set ended_on = null`. Synchronizacja z kroku 5 tej reguły nie łamie: przy zakończeniu i przesunięciu ustawia `ended_on = discontinued_on`, przy cofnięciu `discontinued_on` jest już null. Poza tym zachowanie bez zmian.
7. **`dosage_periods_guard_insert`**: odmowa dodania okresu do leku z ustawionym `discontinued_on` (domknięcie F6b od strony wstawiania), niezależnie od okna.
8. **Pole wyliczane** `discontinuation_correction_ends_at(public.medications)` → `correction_window_end(discontinued_at)` albo null; uprawnienia jak `correction_window_ends_at`.
9. **RPC** (security invoker, `search_path = ''`, `revoke` od `public, anon`, `grant` dla `authenticated`, komentarze z przykładem i kodami):

**Contract**:

| Funkcja                                                                                      | Zwraca | Błędy (kolejność sprawdzania)                                                                                                                                                                                                         |
| -------------------------------------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `discontinue_medication(p_medication_id uuid, p_discontinued_on date)`                       | `void` | `28000` brak sesji; `MD001` brak leku tego konta; `MD002` lek już zakończony; `MD006` brak trwającego okresu; `MD003` data w przyszłości; `MD004` data starsza niż 14 dni; `MD005` data nie późniejsza niż początek trwającego okresu |
| `correct_discontinuation(p_medication_id uuid, p_discontinued_on date)` — `null` = cofnięcie | `void` | `28000`; `MD001`; `MD007` lek nie jest zakończony; `MD008` okno zakończenia zamknięte; `MD009` ta sama data; `MD003`; `MD004`; `MD005` (wobec początku ostatniego okresu)                                                             |
| `delete_medication(p_medication_id uuid)`                                                    | `void` | `28000`; `MD001`; `MD010` okno korekty leku zamknięte (sprawdzane przez `correction_window_end(created_at)`, jak DP009)                                                                                                               |

Każda funkcja blokuje wiersz leku (`for update`) i filtruje po `user_id = auth.uid()` jak `change_dosage`. Prefiks `MD` przed użyciem sprawdź `grep`iem — dziś wolny. Granica 14 dni: komentarz „keep equal” obok `c_max_days_back` w `change_dosage` i strażnikach okresów.

#### 2. Testy zakończenia

**File**: `supabase/tests/discontinuation_checks.sql`

**Intent**: Nowy plik bramki z markerem `GATE_COMPLETE discontinuation_checks`, prawdziwy zegar okna (postarzanie `created_at` i `discontinued_at` wzorcem `pg_temp.backdate`), role przez `set local role authenticated`, nazwane `sqlstate`, nigdy `when others`.

**Contract** — przypadki (każdy z konkretnym oczekiwanym wynikiem):

- `discontinue_medication`: dziś i 14 dni wstecz przechodzą; trwający okres dostaje `ended_on` = data; `discontinued_at` ≈ `now()` mimo wartości wysłanej przez klienta; każdy kod MD001–MD006 osiągnięty swoim przypadkiem (MD001 także dla leku innego konta).
- `correct_discontinuation` w oknie: przesunięcie zmienia `discontinued_on` i `ended_on` ostatniego okresu, nie zmienia `discontinued_at`; cofnięcie czyści obie daty, lek znów aktualny; MD007, MD009, MD003–MD005. Przesunięcie i cofnięcie sprawdzane **także na okresie postarzonym > 24 h** (`pg_temp.backdate` na `created_at` okresu przed zakończeniem) — świeży okres omija blok strażnika i nie dowodzi, że wyjątek działa.
- Bezpośredni update `ended_on` ostatniego okresu przez klienta (głębokość 1) przy otwartym oknie zakończenia i postarzonym okresie → P0001 — wyjątek działa tylko z wyzwalacza.
- Po 24 h od zakończenia: MD008 z RPC, a bezpośredni update `discontinued_on` (przesunięcie i wyczyszczenie) i `ended_on` ostatniego okresu kończą się P0001 — **dług S-02**.
- Bezpośredni update `discontinued_on` na jutro i na 15 dni wstecz → P0001.
- Okres wstawiony do leku zakończonego → P0001; `change_dosage` leku zakończonego → DP001 — **dług F6b**.
- Lek dodany przed chwilą (otwarte okno okresu) i zakończony: bezpośredni update `ended_on = null` oraz `ended_on` = dzień po dacie zakończenia → P0001 — reguła działa niezależnie od okna.
- Wyjątek w `dosage_periods_guard_core` nie otwiera nic poza ostatnim okresem: zmiana `ended_on` wcześniejszego okresu przy otwartym oknie zakończenia → P0001.
- `delete_medication`: w oknie leku usuwa z kaskadą; po 24 h MD010 i wiersze zostają; lek innego konta MD001.
- Wyzwalacz `medications_sync_discontinuation` istnieje, jest włączony i jest `AFTER UPDATE`.

#### 3. Aktualizacja istniejących testów

**File**: `supabase/tests/rls_checks.sql`, `supabase/tests/dosage_change_checks.sql`, `supabase/tests/medication_interaction_checks.sql`, `supabase/tests/schema_invariants_checks.sql`

**Intent**: Testy, które zakładały dowolną datę zakończenia, sprawdzają nową regułę zamiast starej.

**Contract**:

- `rls_checks.sql` CHECK 21: przy zamkniętym oknie `product_name` przechodzi, a `discontinued_on` spoza `[dziś − 14, dziś]` (np. `2026-06-01`) daje P0001; komunikat `raise notice` zaktualizowany.
- `dosage_change_checks.sql` DOSAGE 8: zostaje „zakończony dziś → DP001”; przypadek „zakończony jutro przechodzi” zastąpiony odmową ustawienia daty jutrzejszej.
- `medication_interaction_checks.sql` INTERACTION 8: zostaje „zakończony wczoraj wypada”; przypadek „jutro zostaje” zastąpiony „zakończony dziś wypada”. Dane testowe muszą mieć trwający okres rozpoczęty przed datą zakończenia.
- `schema_invariants_checks.sql` INVARIANT 8: dopisany `('medications', 'medications_stamp_discontinuation', 'INSERT OR UPDATE')`.

### Success Criteria:

#### Automated Verification:

- Migracja wchodzi na czystą bazę: `npx supabase db reset`
- Wszystkie bramki SQL przechodzą, w tym `discontinuation_checks`: `npm run db:check`
- Testy jednostkowe przechodzą: `npm test`
- Typy i lint czyste: `npm run typecheck` i `npm run lint`

#### Manual Verification:

- Przegląd nagłówka migracji: przykład, kody i uwaga wdrożeniowa zrozumiałe bez czytania SQL

**Implementation Note**: Po zielonej automatyce zatrzymaj się na ręczne potwierdzenie autorki przed fazą 2.

---

## Phase 2: Zakończenie i jego poprawa w interfejsie

### Overview

Ekran zakończenia (zapis, przesunięcie, cofnięcie), dwie trasy POST, stan „zakończony” w szczegółach leku, teksty i testy jednostkowe.

### Changes Required:

#### 1. Pomocnicze funkcje dat

**File**: `src/lib/services/medications.ts`

**Intent**: Najwcześniejsza dopuszczalna data zakończenia i ostatni dzień przyjmowania, liczone tak samo jak w bazie — bez nowych funkcji.

**Contract**: najwcześniejsza data zakończenia przez istniejące `earliestChangeDate(startedOn, today)` (`src/lib/services/medications.ts:113`) — ta sama formuła, ta sama granica 14 dni, już pokryta testami (`scripts/medications/medications.test.mjs:197-205`). Ostatni dzień przyjmowania przez istniejące `lastDayOfPeriod`. Jedyna zmiana: komentarz nad `earliestChangeDate` mówi, że funkcja obsługuje też datę zakończenia leku (żeby nikt nie rozdzielił jej przy zmianie jednej z reguł).

#### 2. Teksty

**File**: `src/lib/copy/medications.ts`

**Intent**: Sekcja `discontinuation` i klucze `apiErrors` dla MD001–MD009. Słownictwo: „Zakończ przyjmowanie”, „Pierwszy dzień bez leku”, „Przyjmowany do {data}”, „Zakończenie można poprawić lub cofnąć do {do}”, „Cofnij zakończenie”. Komunikat MD005 i MD004 podaje najwcześniejszą datę; podpowiedź przy MD005 dla pozycji dodanej dziś kieruje do usuwania. Nigdy „odstaw”, „przesta”, „dawk”; bez zachęty do kończenia leku (FR-012).

**Contract**: wszystkie nowe teksty przechodzą `scripts/fr012/medication-copy.test.mjs`; `MedicationApiErrorCode` rozszerzony o nowe klucze.

#### 3. Trasy POST

**File**: `src/pages/api/medications/[id]/discontinuation.ts`, `src/pages/api/medications/[id]/discontinuation/correction.ts`

**Intent**: Wzorzec `dosage.ts`: `prerender = false`, sprawdzenie sesji (`!locals.user || locals.recoverySession` → 401), uuid → 404, zod, RPC, mapa kodów MD → klucz, `console.error` tylko z kodem.

**Contract**:

- `discontinuation.ts`: pole `discontinuedOn` (`z.iso.date()`, ≤ dziś Warsaw) → `discontinue_medication`; sukces `/leki/{id}?zakonczenie=zapisane`, błąd `/leki/{id}/zakonczenie?error=<klucz>`.
- `correction.ts`: pole `action` (`move` | `cancel`) i `discontinuedOn` wymagane przy `move` → `correct_discontinuation`; sukces `?zakonczenie=poprawione` albo `?zakonczenie=cofniete`.
- W URL nigdy nazwa leku ani data (lesson „Żadna nazwa leku ani dawka w adresie URL”).

#### 4. Ekran zakończenia

**File**: `src/pages/leki/[id]/zakonczenie.astro`

**Intent**: Zwykły formularz HTML w `.astro` (bez stanu w przeglądarce, więc bez React). Trzy stany: lek aktualny — pole daty (`min` = najwcześniejsza data, `max` = dziś, domyślnie dziś) i opis różnicy między zakończeniem a usunięciem; lek zakończony w oknie — zmiana daty i osobny przycisk „Cofnij zakończenie”; okno zamknięte — informacja bez formularza. Błąd z `?error` przez `apiErrorMessage`.

**Contract**: select z `discontinued_on`, `discontinuation_correction_ends_at`, `dosage_periods(started_on, ended_on)`; termin przez `formatCorrectionDeadline` (`src/lib/services/journal.ts:120`); 404 dla obcego/nieistniejącego leku.

#### 5. Szczegóły leku

**File**: `src/pages/leki/[id].astro`

**Intent**: Lek zakończony pokazuje „Przyjmowany do {ostatni dzień}” i, dopóki okno otwarte, link „Popraw zakończenie – do {do}”. Lek aktualny ma link „Zakończ przyjmowanie” obok „Zmiana dawkowania”. Banery dla `?zakonczenie=zapisane|poprawione|cofniete` (whitelista wartości). Link powrotny leku zakończonego do `/leki/zakonczone` dochodzi w fazie 3, razem ze stroną — do tego czasu zostaje obecny powrót do `/leki`.

**Contract**: select rozszerzony o `discontinuation_correction_ends_at`; reguła `isCurrent` bez zmian.

#### 6. Smoke

**File**: `scripts/smoke.mjs`

**Intent**: Kroki HTTP: zakończenie dziś (302 na szczegóły, lek znika z `/leki`), przesunięcie, cofnięcie (lek wraca na `/leki`), MD005 dla okresu rozpoczętego dziś. Nagłówki jak z przeglądarki (lesson „Smoke wysyła nagłówki tak jak przeglądarka”). Każde przekierowanie bez nazwy leku i daty w URL.

**Contract**: tekst asercji z `MEDICATION_COPY`, nie wpisany na sztywno.

### Success Criteria:

#### Automated Verification:

- Testy jednostkowe i filtr FR-012 przechodzą: `npm test`
- Typy i lint czyste: `npm run typecheck` i `npm run lint`
- Bramki SQL dalej zielone: `npm run db:check`
- Smoke przechodzi przeciw lokalnemu Supabase (stary podgląd zatrzymany, `.env` odsunięty): `npm run smoke`

#### Manual Verification:

- Na telefonie: zakończenie leku, poprawa daty i cofnięcie działają; teksty zrozumiałe i neutralne
- Formularz nie pozwala wybrać daty w przyszłości ani wcześniejszej niż najwcześniejsza dopuszczalna; komunikat MD005 podaje konkretną datę
- „Zakończ przyjmowanie” nie wygląda jak kasowanie

**Implementation Note**: Po zielonej automatyce zatrzymaj się na ręczne potwierdzenie autorki przed fazą 3.

---

## Phase 3: Leki zakończone i usuwanie

### Overview

Osobna strona leków zakończonych z linkiem i licznikiem na `/leki`, oraz ścieżka usunięcia pozycji dodanej przez pomyłkę z ekranem potwierdzenia.

### Changes Required:

#### 1. Strona leków zakończonych

**File**: `src/pages/leki/zakonczone.astro`, `src/lib/copy/medications.ts`

**Intent**: Lista leków z `discontinued_on is not null`, sortowana po `discontinued_on desc`, przy remisie `created_at desc`. Karta: nazwa, „przyjmowany od {pierwszy dzień} do {ostatni dzień}”, link do szczegółów. Pusty stan. Jedno neutralne zdanie, że leki zakończone nie są porównywane z listą par (brak znacznika ≠ sprawdzone). Bez znaczników kolizji.

**Contract**: przez `AppLayout`; trasa chroniona automatycznie pod `/leki`; nowa sekcja `endedList` w copy.

#### 2. Link na liście aktualnych

**File**: `src/pages/leki/index.astro`

**Intent**: Pod notą o kolizjach link „Zakończone leki ({n})”, tylko przy n > 0. Nota zostaje bezpośrednio pod listą aktualnych. Baner `?usunieto=1`.

**Contract**: licznik osobnym zapytaniem `count: "exact", head: true`; błąd licznika nie psuje listy (link się nie pokazuje).

#### 3. Usuwanie pozycji dodanej przez pomyłkę

**File**: `src/pages/leki/[id]/usun.astro`, `src/pages/api/medications/[id]/delete.ts`, `src/pages/leki/[id].astro`, `src/lib/copy/medications.ts`

**Intent**: Na szczegółach, tylko w oknie korekty leku, link „Usuń pozycję dodaną przez pomyłkę – do {do}” odsunięty od pozostałych akcji (osobna sekcja na dole). Ekran potwierdzenia: nazwa leku, wyjaśnienie, że usunięcie kasuje pozycję z historią, a zakończone przyjmowanie zapisuje się przez „Zakończ przyjmowanie”; przycisk usunięcia i link powrotu. Po oknie ekran pokazuje informację bez przycisku. Przycisk bez tokenów `destructive*` (zarezerwowane dla błędów formularzy).

**Contract**: trasa wzorcem `dosage.ts` → `delete_medication`; sukces `/leki?usunieto=1`; `MD010` → `/leki/{id}/usun?error=deleteWindowClosed`; `MD001` → `/leki/{id}/usun?error=medicationNotFound` (jak DP008 w `dosage.ts`); 404 wyłącznie dla id, które nie jest uuid. Na szczegółach leku zakończonego (`src/pages/leki/[id].astro`) link powrotny prowadzi do `/leki/zakonczone` — przeniesiony z fazy 2, bo strona powstaje tutaj.

#### 4. Smoke

**File**: `scripts/smoke.mjs`

**Intent**: Kroki: lek zakończony widoczny na `/leki/zakonczone` i w liczniku na `/leki`; świeżo dodany lek usunięty przez trasę (302 na `/leki?usunieto=1`, brak go na obu listach).

**Contract**: jak w fazie 2 — teksty z `MEDICATION_COPY`, URL bez danych zdrowotnych.

### Success Criteria:

#### Automated Verification:

- Testy jednostkowe i filtr FR-012 przechodzą: `npm test`
- Typy i lint czyste: `npm run typecheck` i `npm run lint`
- Bramka kolorów przechodzi bez nowych wyjątków: `npm test` (`scripts/tokens/hardcoded-colors.mjs`)
- Smoke przechodzi przeciw lokalnemu Supabase: `npm run smoke`

#### Manual Verification:

- Na telefonie `/leki` z kilkoma lekami: nota tuż pod listą, link do zakończonych pod notą, strona nie wydłuża się o zakończone
- `/leki/zakonczone` czytelna na telefonie i w przeglądarce
- Ścieżki zakończenia i usunięcia są wyraźnie rozdzielone; link usuwania znika po 24 h od dodania

**Implementation Note**: Po zielonej automatyce zatrzymaj się na ręczne potwierdzenie autorki.

---

## Testing Strategy

### Unit Tests:

- Najwcześniejsza data zakończenia i ostatni dzień przyjmowania — pokryte istniejącymi testami `earliestChangeDate` i `lastDayOfPeriod` (granice dnia, miesiąca, roku, 14 dni).
- Filtr FR-012 na każdym nowym tekście (istniejący test obejmuje cały `MEDICATION_COPY`).

### Integration Tests:

- `discontinuation_checks.sql` — reguły daty, okno zakończenia na prawdziwym zegarze, synchronizacja okresów, długi S-02 i F6b, usuwanie, izolacja kont.
- Smoke — pełne ścieżki HTTP: zakończenie, przesunięcie, cofnięcie, lista zakończonych, usunięcie.

### Manual Testing Steps:

1. Dodaj lek, zmień dawkę wczoraj, zakończ dziś → `/leki` bez leku, `/leki/zakonczone` z nim, szczegóły „przyjmowany do wczoraj”.
2. Przesuń datę zakończenia na wczoraj, potem cofnij zakończenie → lek z powrotem na `/leki`, okres trwający.
3. Spróbuj zakończyć lek w dniu rozpoczęcia bieżącego okresu → komunikat z najwcześniejszą datą.
4. Dodaj lek przez pomyłkę → usuń przez ekran potwierdzenia → brak na obu listach.

## Performance Considerations

Licznik zakończonych to jedno zapytanie `head` po indeksie `medications_user_id_idx`. Strona zakończonych bez stronicowania — świadomie odłożone.

## Migration Notes

- Migracja przerywa się, jeśli dane łamią nowe reguły (przyszła data zakończenia albo zakończony lek z trwającym okresem) — wtedy decyzja autorki, nie cicha naprawa.
- Istniejące zakończone leki dostają `discontinued_at = updated_at`, więc ich okno zakończenia jest od razu zamknięte.
- Wycofanie: tylko kolejną migracją; nowe kolumny i funkcje nie niszczą danych.

## References

- Roadmapa: `context/foundation/roadmap.md` — S-04 (długi S-02 i F6b)
- PRD: `context/foundation/prd.md` — FR-005, FR-009, FR-012
- Wzorzec RPC z nazwanymi kodami: `supabase/migrations/20261004120000_dosage_change.sql`, `supabase/migrations/20261005140000_correct_dosage_period.sql`
- Okno korekty: `supabase/migrations/20261005120000_correction_window.sql`
- Wzorzec trasy: `src/pages/api/medications/[id]/dosage.ts`
- Wzorzec testu okna: `supabase/tests/correction_window_checks.sql:80-110`
- Decyzje z przeglądów: `context/archive/2026-09-29-add-medication-with-interaction-flag/reviews/impl-review.md:46-63`, `context/archive/2026-10-04-dosage-period-history/reviews/impl-review.md:95-103`, `context/archive/2026-10-05-symptom-journal-entry/reviews/impl-review.md:47-75`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Baza i testy SQL

#### Automated

- [x] 1.1 Migracja wchodzi na czystą bazę: `npx supabase db reset` — 8b83aec
- [x] 1.2 Wszystkie bramki SQL przechodzą, w tym `discontinuation_checks`: `npm run db:check` — 8b83aec
- [x] 1.3 Testy jednostkowe przechodzą: `npm test` — 8b83aec
- [x] 1.4 Typy i lint czyste: `npm run typecheck` i `npm run lint` — 8b83aec

#### Manual

- [x] 1.5 Przegląd nagłówka migracji: przykład, kody i uwaga wdrożeniowa zrozumiałe bez czytania SQL — 8b83aec

### Phase 2: Zakończenie i jego poprawa w interfejsie

#### Automated

- [x] 2.1 Testy jednostkowe i filtr FR-012 przechodzą: `npm test` — f522672
- [x] 2.2 Typy i lint czyste: `npm run typecheck` i `npm run lint` — f522672
- [x] 2.3 Bramki SQL dalej zielone: `npm run db:check` — f522672
- [x] 2.4 Smoke przechodzi przeciw lokalnemu Supabase (stary podgląd zatrzymany, `.env` odsunięty): `npm run smoke` — f522672

#### Manual

- [x] 2.5 Na telefonie: zakończenie leku, poprawa daty i cofnięcie działają; teksty zrozumiałe i neutralne — f522672
- [x] 2.6 Formularz nie pozwala wybrać daty w przyszłości ani wcześniejszej niż najwcześniejsza dopuszczalna; komunikat MD005 podaje konkretną datę — f522672
- [x] 2.7 „Zakończ przyjmowanie” nie wygląda jak kasowanie — f522672

### Phase 3: Leki zakończone i usuwanie

#### Automated

- [x] 3.1 Testy jednostkowe i filtr FR-012 przechodzą: `npm test`
- [x] 3.2 Typy i lint czyste: `npm run typecheck` i `npm run lint`
- [x] 3.3 Bramka kolorów przechodzi bez nowych wyjątków: `npm test` (`scripts/tokens/hardcoded-colors.mjs`)
- [x] 3.4 Smoke przechodzi przeciw lokalnemu Supabase: `npm run smoke`

#### Manual

- [x] 3.5 Na telefonie `/leki` z kilkoma lekami: nota tuż pod listą, link do zakończonych pod notą, strona nie wydłuża się o zakończone
- [x] 3.6 `/leki/zakonczone` czytelna na telefonie i w przeglądarce
- [x] 3.7 Ścieżki zakończenia i usunięcia są wyraźnie rozdzielone; link usuwania znika po 24 h od dodania
