# S-05: Wpis o samopoczuciu i okno korekty — plan wdrożenia

## Overview

Użytkowniczka może dodać wpis o samopoczuciu. Data i godzina są wypełnione domyślnie na moment zapisu i można je cofnąć. Wpis ma jeden lub więcej objawów z zamkniętej listy, opcjonalne nasilenie przy każdym objawie i opcjonalną notatkę (US-02, FR-008, roadmapa S-05, issue #16).

Ten sam plasterek zamienia zaślepkę okna korekty na prawdziwą regułę: 24 h od chwili zapisu, zegarem serwera (FR-004, FR-009, Q-3). Po zapisie i na liście użytkowniczka widzi, do kiedy może poprawić wpis, lek albo zmianę dawki. Przy okresie dawkowania w oknie pojawia się „Popraw dawkę” — to domyka dług F6a z S-03.

## Current State Analysis

- **Okno korekty to zaślepka.** `public.medication_correction_window_open(uuid)` zwraca zawsze `true` (`supabase/migrations/20260922120000_medication_schema.sql:222-236`). Woła ją sześciu strażników na `medications`, `medication_substances` i `dosage_periods`. Każdy przekazuje id leku, więc dziś jest jedno okno na lek. Funkcja nie ma `EXECUTE` dla `anon` ani `authenticated` (`20260929120000_revoke_account_truncate_and_window_execute.sql:29`). Pilnuje tego INVARIANT 7 i sonda `window-execute-for-authenticated.sql` w CI.
- **„Chwila zapisu” nie jest wiarygodna.** `medications.created_at` i `dosage_periods.created_at` to tylko wartości domyślne `now()` (`20260922120000_medication_schema.sql:30, :82`). Polityki RLS pozwalają klientowi ustawić je przy wstawianiu i zmienić później. `medication_substances` nie ma żadnej daty.
- **Testy SQL podmieniają funkcję okna u siebie.** Robią to `rls_checks.sql:320-354`, `account_isolation_checks.sql:655-750` i `dosage_change_checks.sql:657-734`. Wzorzec: `create or replace … return false` w savepoincie, z odciskiem `md5(pg_get_functiondef(…))`. Każdy test działa w jednej transakcji, więc `now()` jest stałe, a świeże wiersze mają okno otwarte.
- **Zmiana dawki zostawia pomyłkę na zawsze (F6a).** `change_dosage` (`20261004130000_dosage_period_variant_guard.sql:161-276`) zamyka okres i otwiera nowy. Druga zmiana tego samego dnia kończy się `DP002`. Nie ma żadnej trasy poprawiającej treść okresu. Limit wstecz to 14 dni (`c_max_days_back` `:176`, `DOSAGE_CHANGE_MAX_DAYS_BACK` w `src/lib/services/medications.ts:87`).
- **Katalog objawów jest gotowy (F-03).** `public.symptoms` ma 34 pozycje, kategorie w `symptoms_category_check`. `public.symptom_search_terms` ma 82 słowa, małe litery i NFC, z polskimi znakami (`20260926120000_symptom_catalog_schema.sql`). Obie tabele są tylko do odczytu. W `src/types.ts:232-275` są `SymptomCategory`, `SYMPTOM_CATEGORIES`, `Symptom` i `SymptomSearchTerm`. Typów wpisu dzienniczka jeszcze nie ma.
- **Brak zakładki dzienniczka.** `NAV_ITEMS` ma tylko „Leki” (`src/lib/navigation.ts:8`). Trasa z menu jest chroniona automatycznie (`src/middleware.ts:13`).
- **Wzorce aplikacji.** Formularz to natywny POST z Reactem tylko do stanu przycisku (`src/components/medications/ChangeDosageForm.tsx`). Trasa API: zod, `formText`, mapa kodów bazy na klucze tekstów, zapis jednym RPC, w logach tylko `error.code` (`src/pages/api/medications/[id]/dosage.ts`). Teksty leżą w `src/lib/copy/medications.ts` i przechodzą filtr FR-012 (`scripts/fr012/medication-copy.test.mjs`).
- **Brak narzędzi do czasu i wyszukiwania.** Nie ma formatera godziny ani strefy czasowej: `formatIsoDate` daje sam `DD.MM.YYYY`, a `todayInWarsaw` sam dzień. Funkcja zdejmująca polskie znaki istnieje, ale jest prywatna: `foldForComparison` (`src/lib/services/medications.ts:122-124`). W bazie nie ma `unaccent`.

## Desired End State

- **Menu ma pozycję „Dzienniczek”** (`/dzienniczek`). Strona pokazuje wpisy od najnowszego: data i godzina, objawy z nasileniem, notatka. Przy wpisie z otwartym oknem korekty widać „Możesz poprawić do jutra, 21:14”. Przycisk „Nowy wpis” prowadzi do `/dzienniczek/nowy`.
- **Formularz nowego wpisu:**
  - Data i godzina są wypełnione momentem otwarcia ekranu w czasie polskim. Można je cofnąć najwyżej o 14 dni, nie do przodu.
  - Wyszukiwarka objawów ignoruje wielkość liter i polskie znaki („nudnosci” znajduje „Nudności”) i szuka także po słowach potocznych.
  - Bez wpisanego tekstu objawy są pogrupowane w 8 kategorii, bez płaskiej listy 34 pozycji.
  - Przy każdym zaznaczonym objawie jest opcjonalne nasilenie: łagodne / umiarkowane / silne.
  - Notatka jest opcjonalna.
  - Błąd serwera pokazuje komunikat nad formularzem; zaznaczone objawy zostają.
- **Po zapisie** użytkowniczka trafia na listę (`/dzienniczek?dodano=<uuid>`) z komunikatem „Zapisano wpis. Możesz go poprawić do jutra, 21:14”.
- **Baza egzekwuje okno korekty** dla każdego wiersza osobno, licząc od jego `created_at`:
  - lek i jego skład: od dodania leku,
  - każdy okres dawkowania: od jego zapisu,
  - wpis dzienniczka i jego objawy: od zapisu wpisu.
  - Okno jest otwarte, dopóki `now() < created_at + 24 h`. `created_at` jest wymuszane na `now()` przy wstawianiu i nie do zmiany później.
- **Na szczegółach leku:** komunikat po dodaniu i po zmianie dawki pokazuje „do kiedy”. Przy każdym okresie w oknie jest „Popraw dawkę (do jutra, 21:14)”, prowadzące do ekranu poprawy treści dawki i wariantu bez nowego okresu.
- **Weryfikacja:** `npm test`, `npm run lint`, `npm run typecheck`, `npx supabase db reset` + `npm run db:check`, `npm run smoke` (przeciw lokalnej bazie) oraz ręczne przejście obu ścieżek na telefonie.

### Key Discoveries:

- `supabase/migrations/20260922120000_medication_schema.sql:222-247` — sygnatura funkcji okna ustalona z góry, żeby wołający się nie zmieniali. `create or replace` zachowuje uprawnienia; `drop` + `create` przywróciłoby domyślne `EXECUTE`, co złapie INVARIANT 7.
- `supabase/migrations/20261004120000_dosage_change.sql:80-121` — `dosage_periods_guard_core` sprawdza okno leku (`old.medication_id`). Zamknięcie okresu (`ended_on` z pustej na datę) przechodzi zawsze, więc `change_dosage` działa przy zamkniętym oknie.
- `supabase/migrations/20260922120000_medication_schema.sql:370-392` — strażnik usunięcia pomija sprawdzenie, gdy konta już nie ma (kaskada usunięcia konta). Ten sam wzorzec dla wpisów dzienniczka.
- `supabase/tests/rls_checks.sql:327-338`, `dosage_change_checks.sql:704`, `account_isolation_checks.sql:706` — testy rozpoznają strażników po treści `'%okno korekty%jest już zamknięte%'`. Nowi strażnicy trzymają to brzmienie.
- `supabase/tests/schema_invariants_checks.sql:411-420` — INVARIANT 8 ma ręczną listę strażników historii; nowi strażnicy trafiają na nią.
- `supabase/tests/account_isolation_checks.sql:126-160` — każda nowa tabela konta potrzebuje wpisu w `isolation_fixtures`, inaczej ISOLATION 0 pada z nazwą tabeli.
- `scripts/rpl/pairs.mjs:24-61` — rdzenie zakazane, które mogą trafić w neutralne teksty dzienniczka: `skutk`, `przyczyn`, `wynikaj`, `przesta`, `unika`, `prowadz` (także w „wprowadź”), `dawk`, `podejrz`.
- `src/lib/services/medications.ts:43-51` — `todayInWarsaw` przez `Intl` (`en-CA`); Worker działa w UTC, więc każda godzina dla użytkowniczki idzie przez `Europe/Warsaw`.

## What We're NOT Doing

- **Ekran poprawy i usuwania wpisu dzienniczka, edycja notatki po zamknięciu okna** — S-07. S-05 daje regułę w bazie i informację „do kiedy”.
- **Złożone pytanie do lekarza po zapisie** — S-06. Po zapisie jest tylko komunikat i lista.
- **Poprawa daty zmiany dawki i cofnięcie zmiany** — zdecydowano poprawę samej dawki (i wariantu). Pomyłka w dacie zmiany zostaje nienaprawialna, dlatego limit 14 dni zostaje.
- **Zmiana limitu 14 dni wstecz przy zmianie dawki.** Limit zostaje bez zmian. Zmiana dawki starsza niż 14 dni nie ma drogi w MVP. Jest to świadoma decyzja, nie przeoczenie.
- **Wpis o objawie starszym niż 14 dni** — ta sama granica co przy zmianie dawki.
- **Okno korekty daty odstawienia** (`discontinued_on`) i zamykanie okresów po odstawieniu — S-04.
- **Usuwanie leku z poziomu UI** — S-04 (FR-005). Reguła w bazie od tej zmiany działa prawdziwie.
- **Kopia nazwy objawu przy wpisie.** Wpis wskazuje objaw po id i pokazuje bieżącą nazwę z katalogu. Zmiany w katalogu muszą zachować sens nazwy.
- **Pozycja „inny objaw”** — objaw spoza katalogu idzie do notatki (Q-2).
- **Notatka w regule** — notatka nie uczestniczy w żadnym zestawieniu.
- **Wspólny wzorzec ciasteczka ze stanem formularza** — formularz dzienniczka wysyła dane przez `fetch`, więc stan zostaje w przeglądarce. Formularze leków zostają bez zmian.
- **Nazwy leków w URL przy dodawaniu leku** — dług z S-02, issue #57.
- **Test E2E w Playwright** — przepływ w przeglądarce sprawdzany ręcznie; ewentualny test przez `/10x-e2e` jako osobny krok.

## Implementation Approach

**Najpierw baza, potem ekrany.** Okno korekty to gwarancja historii, więc powstaje i jest sprawdzone w SQL, zanim pojawi się ekran, który na nim polega.

**Jedna miara okna.** W bazie jest jedna funkcja `public.correction_window_end(timestamptz)` = zapis + 24 h. Nazwa celowo inna niż pól wyliczanych — bez przeciążenia, które PostgREST mógłby pomylić. Używają jej:

- funkcje „okno otwarte” (leku, okresu, wpisu), wołane przez strażników,
- pola wyliczane PostgREST: `correction_window_ends_at(<wiersz>)` dla `medications`, `dosage_periods` i `symptom_entries`.

Ekran czyta godzinę końca z bazy, więc zgadza się z blokadą. Funkcje „okno otwarte” zostają bez `EXECUTE` dla użytkowników.

**Okno per wiersz.** `medication_correction_window_open(uuid)` zachowuje sygnaturę i liczy od `medications.created_at` — obsługuje lek i skład. Nowa `dosage_period_correction_window_open(uuid)` liczy od `dosage_periods.created_at` i przejmuje strażników okresów. Wpisy dzienniczka dostają własną funkcję.

**Dzienniczek to dwie tabele:**

- `symptom_entries`: kiedy, notatka, `created_at`,
- `symptom_entry_items`: który objaw i z jakim nasileniem.

Zapis idzie jednym RPC `add_symptom_entry` (`security invoker`), wszystko albo nic. Granice daty i „co najmniej jeden objaw” pilnuje baza (wyzwalacze), nie tylko RPC — reguła obejmuje całą ścieżkę zapisu.

**Formularz** to komponent React wysyłający JSON w treści `POST /api/journal`. Lista objawów (34 nazwy i 82 słowa) przychodzi z serwera razem ze stroną, a filtrowanie dzieje się w przeglądarce. Żaden tekst objawu nie trafia do URL ani do zapytania `fetch`.

## Critical Implementation Details

- **Kolejność w migracji fazy 1:**
  1. Wyzwalacze zamrażające `created_at`.
  2. Nowe ciała funkcji okna.
  3. Przepięcie strażników okresów.

  Istniejące wiersze produkcyjne mają `created_at` z chwili zapisu, więc po wdrożeniu wszystko starsze niż 24 h od razu staje się niemodyfikowalne. To zamierzone. Ostrzeż przed tym w opisie PR: nie ma powrotu inaczej niż migracją.

- **Testy granicy 24 h potrzebują starego `created_at`.** Wyzwalacz blokuje jego zmianę, więc testy SQL (jako `postgres`, w transakcji z `rollback`) wyłączają na chwilę tylko ten wyzwalacz: `alter table … disable trigger <freeze>`. Cofają wiersz o 24 h i 23 h 59 min, potem włączają wyzwalacz. Nie wolno używać `session_replication_role = replica`: wyłącza wszystkich strażników i test przestaje mierzyć to, co deklaruje.
- **Kody błędów zmierz przed mapowaniem** (lekcja „Bramka musi odróżnić blokadę od niewykonania”). Sprawdź, co przychodzi w `error.code` dla nowych `SE00x`, `DP009` i `DP010`, zanim trasa zacznie je mapować.
- **Godzina z formularza nie ma strefy.** `datetime-local` daje czas bez strefy. RPC przyjmuje `timestamp without time zone` i zamienia go przez `at time zone 'Europe/Warsaw'`. Przeglądarka ani Worker (UTC) nie przeliczają strefy same.

## Phase 1: Okno korekty leków w bazie

### Overview

Zaślepka okna znika. Lek, skład i każdy okres dawkowania mają prawdziwe 24-godzinne okno liczone od zapisu wiersza, a godzinę końca okna da się odczytać.

### Changes Required:

#### 1. Migracja okna korekty

**File**: `supabase/migrations/20261005120000_correction_window.sql`

**Intent**: Zamienia zaślepkę na regułę czasową i rozdziela okno leku od okna okresu, żeby świeży okres ze zmiany dawki był poprawialny, a stare okresy nie.

**Contract**:

- **Miara okna:** `public.correction_window_end(p_saved_at timestamptz) returns timestamptz` — `p_saved_at + interval '24 hours'`. Funkcja `stable`, `security invoker`, `search_path = ''`. Jedyne miejsce, w którym jest liczba 24.
- **Funkcja okna leku:** `public.medication_correction_window_open(p_medication_id uuid)`, przez `create or replace`, ta sama sygnatura.
  - Zwraca `now() < correction_window_end(medications.created_at)`.
  - Gdy leku nie ma, zwraca `true` (kaskada; strażnicy podrzędni i tak przepuszczają kaskadę).
- **Funkcja okna okresu (nowa):** `public.dosage_period_correction_window_open(p_period_id uuid) returns boolean`.
  - Liczy tak samo, od `dosage_periods.created_at`.
  - `security definer`, `search_path = ''`.
  - `revoke execute from public, anon, authenticated`.
- **Strażnicy okresów:** `dosage_periods_guard_core` i `dosage_periods_guard_delete` wołają funkcję okna okresu z `old.id`. Treść komunikatów bez zmian, poza tą samą formułą „okno korekty jest już zamknięte”. Strażnicy `medications` i `medication_substances` zostają przy funkcji leku.
- **Wymuszenie `created_at`:** na `medications` i `dosage_periods` wyzwalacze `BEFORE INSERT` ustawiają `created_at := now()`. `BEFORE UPDATE` odrzuca zmianę `created_at` komunikatem z formułą okna korekty. Bez tego zmiana `created_at` otwierałaby okno na nowo.
- **Strażnicy INSERT (cała ścieżka zapisu, lekcja „Ograniczenie na tabeli podrzędnej nie chroni…”):** polityki INSERT dla `authenticated` na `medication_substances` i `dosage_periods` (`20260922120000_medication_schema.sql:143`, `:185`) zostają, ale wstawienie przechodzi przez wyzwalacz `BEFORE INSERT`:
  - `medication_substances_guard_insert` — przy zamkniętym oknie leku (`medication_correction_window_open(new.medication_id)`) odrzuca wstawienie komunikatem z formułą okna korekty. Skład leku nie zmienia się wstecz.
  - `dosage_periods_guard_insert` — przy zamkniętym oknie leku przechodzi wyłącznie okres dopisany na końcu historii: `new.started_on` późniejsze niż każde istniejące `started_on` tego leku. To dokładnie przypadek `change_dosage` (zamknięcie bieżącego okresu i wstawienie nowego). Okres wstawiony przed albo między istniejącymi jest odrzucony.
- **Pola wyliczane PostgREST:** `public.correction_window_ends_at(public.medications)` i `public.correction_window_ends_at(public.dosage_periods)`. `stable`, `security invoker`, `grant execute to authenticated`. Czytają tylko przekazany wiersz, więc nie omijają RLS.
- **Uprawnienia:** każda nowa funkcja ma jawne `revoke` od `public` i `anon`, zgodnie z wzorcem z `20260930120000_medication_write_and_interactions.sql:338-347`.

#### 2. Testy SQL — przepięcie podmian i nowe sprawdzenia

**File**: `supabase/tests/rls_checks.sql`, `supabase/tests/dosage_change_checks.sql`, `supabase/tests/account_isolation_checks.sql`, `supabase/tests/schema_invariants_checks.sql`, `supabase/tests/medication_interaction_checks.sql`, nowy `supabase/tests/correction_window_checks.sql`

**Intent**: Istniejące sprawdzenia zamkniętego okna na okresach muszą zamykać okno okresu, a nie leku. Nowy plik dowodzi prawdziwej reguły na granicy 24 h.

**Contract**:

- **Podmiany i odciski:** każdy blok, który dziś podmienia `medication_correction_window_open` i sprawdza okresy (CHECK 5–7 i 19 w `rls_checks`, DOSAGE 13, ISOLATION 6), podmienia także `dosage_period_correction_window_open`. Dostaje też dla niej odcisk przed i po.
- **`correction_window_checks.sql` (nowy):** dla leku, składu i okresu sprawdza oba przypadki:
  - wiersz cofnięty o 23 h 59 min — zmiana rdzenia przechodzi,
  - wiersz cofnięty o 24 h — odrzucona z nazwanym komunikatem.
- Okres zapisany dziś przy leku sprzed 3 dni: poprawa `dose_text` przechodzi, a poprawa okresu sprzed 3 dni jest odrzucona.
- Klient nie ustawi `created_at` w przeszłości przy wstawianiu ani nie zmieni go później.
- Strażnicy INSERT, przy leku z oknem cofniętym o 24 h:
  - dopisanie substancji — odrzucone z nazwanym komunikatem; przy oknie 23 h 59 min przechodzi,
  - okres z `started_on` wcześniejszym niż pierwszy okres leku — odrzucony,
  - okres wstawiony między dwa istniejące — odrzucony,
  - `change_dosage` (okres dopisany na końcu) — przechodzi; CHECK 19 w `rls_checks` dalej zielony.
- `correction_window_ends_at(wiersz)` dla `authenticated` zwraca `created_at + 24 h`.
- Plik kończy się `GATE_COMPLETE`. Łapie wyłącznie nazwane błędy (`sqlstate 'P0001'` z dopasowaniem treści), nigdy `when others`.
- **INVARIANT 8:** lista strażników dostaje wyzwalacze zamrażające `created_at` oraz `medication_substances_guard_insert` i `dosage_periods_guard_insert`. Komunikat z liczbą na sztywno („7 history guards”, `schema_invariants_checks.sql:443`) dostaje nową liczbę albo liczbę wyliczaną z listy.
- **INTERACTION 11** (`medication_interaction_checks.sql:543-558`): ręczna lista funkcji invoker z asercją „authenticated ma EXECUTE” dostaje pola wyliczane `correction_window_ends_at(public.medications)` i `correction_window_ends_at(public.dosage_periods)` oraz miarę bazową `correction_window_end(timestamptz)`.
- **INVARIANT 7:** obejmuje nową funkcję definer. Komunikat o pustym zbiorze może zostać.

#### 3. Sonda CI

**File**: `scripts/db-checks/probes/window-execute-for-authenticated.sql`, `.github/workflows/ci.yml`

**Intent**: Sonda dowodzi, że INVARIANT 7 łapie `EXECUTE` dla użytkowników także na nowej funkcji okna okresu.

**Contract**: druga sonda (albo rozszerzenie istniejącej) z `grant execute on function public.dosage_period_correction_window_open(uuid) to authenticated`, oczekująca porażki INVARIANT 7 z nazwanym komunikatem.

### Success Criteria:

#### Automated Verification:

- Migracje wchodzą czysto: `npx supabase db reset`
- Wszystkie sprawdzenia SQL przechodzą, w tym nowy `correction_window_checks.sql`: `npm run db:check`
- Sondy schematu padają z oczekiwanym komunikatem, także nowa sonda funkcji okna okresu: `node scripts/db-checks.mjs --probe window-execute-for-authenticated schema_invariants_checks.sql` (i odpowiednik dla nowej sondy)
- `npm test`, `npm run lint`, `npm run typecheck` przechodzą bez zmian w wynikach

#### Manual Verification:

- W lokalnym Studio: lek dodany dziś ma `correction_window_ends_at` = `created_at` + 24 h, a ręczna zmiana `created_at` przez SQL jako `authenticated` jest odrzucona
- Pomiar przez PostgREST (pierwsze pole wyliczane w repo): zalogowana użytkowniczka, `select=id,correction_window_ends_at` na `medications` i `dosage_periods`, zwraca godzinę końca okna, nie błąd ani brak pola

**Implementation Note**: Po zielonej weryfikacji automatycznej zatrzymaj się na ręczne potwierdzenie przed fazą 2.

---

## Phase 2: Schemat dzienniczka

### Overview

Baza przyjmuje wpis o samopoczuciu jednym wywołaniem. Wpis jest prywatny dla konta, ma co najmniej jeden objaw, datę w dopuszczalnych granicach i rdzeń chroniony oknem korekty.

### Changes Required:

#### 1. Migracja dzienniczka

**File**: `supabase/migrations/20261005130000_symptom_journal.sql`

**Intent**: Tabele wpisów z RLS od pierwszej migracji, strażnicy rdzenia na całej ścieżce zapisu i jeden RPC do zapisu.

**Contract**:

- **Tabela `public.symptom_entries`:**
  - `id uuid pk default gen_random_uuid()`,
  - `user_id uuid not null references auth.users on delete cascade`,
  - `occurred_at timestamptz not null`,
  - `note text null` (przycięta; pusta → `null`; limit długości jak dla dawki w S-02/S-03),
  - `created_at timestamptz not null default now()`, `updated_at timestamptz not null default now()`.
  - Indeks `(user_id, occurred_at desc)`.
- **Tabela `public.symptom_entry_items`:**
  - `id uuid pk`,
  - `entry_id uuid not null references symptom_entries on delete cascade`,
  - `symptom_id uuid not null references symptoms on delete restrict`,
  - `severity text null check (severity in ('mild','moderate','severe'))`,
  - `unique (entry_id, symptom_id)`.
- **RLS:**
  - Włączone na obu tabelach w tej samej migracji.
  - Cztery polityki per operacja, `to authenticated`. `symptom_entries` przez `user_id = auth.uid()`; `symptom_entry_items` przez `exists` do wpisu właściciela (wzorzec `medication_substances`).
  - `revoke truncate … from anon, authenticated`.
  - Brak polityk dla `anon`.
- **Strażnicy (`security definer`, `search_path = ''`, `revoke execute`, formuła „okno korekty jest już zamknięte”):**
  - Wpis po zamknięciu okna: `occurred_at`, `user_id` i `created_at` są niezmienne, a usunięcie jest odrzucone (pominięte, gdy konta już nie ma). `note` zostaje edytowalna zawsze.
  - Objaw wpisu po zamknięciu okna wpisu: `INSERT`, `UPDATE` (`symptom_id`, `severity`, `entry_id`) i `DELETE` są odrzucone. Usunięcie jest pominięte, gdy wpisu już nie ma (kaskada).
  - Dodanie objawu do zamkniętego wpisu to zmiana rdzenia, tak samo jak przepięcie `entry_id`.
- **Funkcja okna wpisu:** `public.symptom_entry_correction_window_open(p_entry_id uuid)` przez `correction_window_end` z fazy 1. Pole wyliczane: `correction_window_ends_at(public.symptom_entries)`.
- **Wymuszenie `created_at`:** jak w fazie 1, także na `symptom_entries`.
- **Granice `occurred_at`:** wyzwalacz `BEFORE INSERT OR UPDATE OF occurred_at`:
  - `SE002`, gdy `occurred_at > now()`,
  - `SE003`, gdy `occurred_at < now() - interval '14 days'`.
  - Granice liczone względem `now()` w chwili zapisu.
- **Co najmniej jeden objaw:** wyzwalacz ograniczenia `deferrable initially deferred` na obu tabelach zgłasza `SE001`, gdy przy zatwierdzeniu wpis ma zero objawów. Usunięcie całego wpisu (kaskada) nie wywołuje błędu.
- **RPC `public.add_symptom_entry(p_occurred_local timestamp, p_items jsonb, p_note text) returns uuid`:**
  - `security invoker`, `search_path = ''`.
  - `28000` bez sesji.
  - `p_occurred_local` null → `occurred_at := now()` (FR-008: domyślnie moment zapisu, nie otwarcia ekranu). Inaczej `p_occurred_local at time zone 'Europe/Warsaw'`.
  - `p_items` to tablica `{symptom_id, severity|null}`. Pusta tablica → `SE001`; powtórzony objaw → `SE004`; nieznany `symptom_id` → `SE005`.
  - Wstawia wpis i objawy w jednej transakcji, zwraca id wpisu.
  - `grant execute to authenticated`, `revoke` od `public` i `anon`.

#### 2. Sprawdzenia SQL i smoke

**File**: `supabase/tests/account_isolation_checks.sql`, `supabase/tests/schema_invariants_checks.sql`, `supabase/tests/medication_interaction_checks.sql`, nowy `supabase/tests/symptom_journal_checks.sql`, `scripts/smoke.mjs`

**Intent**: Nowe tabele przechodzą bramki izolacji, a każda reguła dzienniczka ma dowód z kontrprzykładem.

**Contract**:

- **Izolacja:** `isolation_fixtures` dostaje obie tabele z wierszami A/B w ISOLATION 0, a ISOLATION 6 obejmuje wpisy dzienniczka (usunięcie konta przy zamkniętym oknie kasuje wszystko).
- **Izolacja tabeli podrzędnej (ISOLATION 4):** `symptom_entry_items` potrzebuje drugiego wpisu konta A jako `repoint_owner_target` (wzorzec a11), żeby przepięcie `entry_id` było mierzone, a nie pominięte.
- **INVARIANT 8:** nowi strażnicy na liście; liczba w komunikacie zaktualizowana.
- **INTERACTION 11:** lista funkcji z `EXECUTE` dla `authenticated` dostaje `add_symptom_entry` i `correction_window_ends_at(public.symptom_entries)`.
- **`symptom_journal_checks.sql` sprawdza:**
  - poprawny zapis z dwoma objawami i nasileniem,
  - każdy kod `SE001`–`SE005`,
  - brak godziny (`p_occurred_local` null) → wpis z `occurred_at` = `now()` transakcji,
  - granicę daty: teraz przechodzi, +1 min odrzucone, −14 dni + 1 min przechodzi, −14 dni − 1 min odrzucone,
  - zamianę czasu polskiego (21:14 lokalnie 20.10.2026 zapisuje się jako 19:14 UTC, a 30.10.2026 — po zmianie czasu 25.10 — jako 20:14 UTC),
  - strażników przy oknie 23 h 59 min i 24 h,
  - edycję notatki po zamknięciu okna,
  - że `delete from symptoms` z wpisem jest odrzucone (`restrict`, nazwany `foreign_key_violation`),
  - że zapis wpisu z zerem objawów bezpośrednio przez tabelę jest odrzucony przy zatwierdzeniu.
- **Smoke:** kroki izolacji dla obu tabel na wzór `isolationTargets` (`scripts/smoke.mjs:207-226`), z fixture `seedSymptomEntry`. Bieg tylko przeciw lokalnej bazie.

### Success Criteria:

#### Automated Verification:

- Migracje wchodzą czysto: `npx supabase db reset`
- Wszystkie sprawdzenia SQL przechodzą, w tym `symptom_journal_checks.sql`: `npm run db:check`
- Sondy schematu w CI padają z oczekiwanym komunikatem — nowe tabele ich nie psują: sondy z `ci.yml` przez `node scripts/db-checks.mjs --probe …`
- Smoke przechodzi przeciw lokalnej bazie, z nowymi krokami izolacji: `npm run smoke`
- `npm test`, `npm run lint`, `npm run typecheck`

#### Manual Verification:

- Przed smoke zmierzone, że bieg pisze do lokalnej bazy (świeże wiersze w lokalnym `auth.users`, `.env` odsunięty)

**Implementation Note**: Po zielonej weryfikacji automatycznej zatrzymaj się na ręczne potwierdzenie przed fazą 3.

---

## Phase 3: Ekran dzienniczka — nowy wpis i lista

### Overview

Użytkowniczka dodaje wpis z telefonu i widzi go na liście razem z godziną końca okna korekty.

### Changes Required:

#### 1. Typy, teksty i narzędzia

**File**: `src/types.ts`, `src/lib/copy/journal.ts`, `src/lib/services/journal.ts`, `src/lib/services/text-fold.ts`, `src/lib/services/medications.ts`

**Intent**: Wspólne typy wpisu, teksty przez filtr FR-012, czyste funkcje do wyszukiwania i formatowania czasu, testowalne przez `node --test`.

**Contract**:

- **`src/types.ts`:** `SymptomSeverity = "mild" | "moderate" | "severe"`, `SYMPTOM_SEVERITIES` z polskimi etykietami (łagodne / umiarkowane / silne), `SymptomEntry` i `SymptomEntryItem` (DTO listy z `correctionWindowEndsAt: string | null`).
- **`src/lib/services/text-fold.ts`:** eksportuje `foldForSearch(text)`:
  - małe litery `pl`, NFC,
  - zdjęte znaki diakrytyczne (NFD + `\p{M}`, `ł→l`),
  - pojedyncze spacje, przycięte.
  - `medications.ts` przestaje mieć prywatną kopię i importuje stąd (bez importów `@/`, żeby `node --test` dalej ładował plik).
- **`src/lib/services/journal.ts`** (czyste funkcje, bez Supabase):
  - `filterSymptoms(catalog, terms, query)` — dopasowanie po złożonej nazwie i słowach potocznych; pusty tekst → `null` (widok grup).
  - `groupSymptomsByCategory(symptoms)` — kolejność wg `SYMPTOM_CATEGORIES`. Kategoria spoza listy rzuca błąd z nazwą kategorii (wymóg roadmapy: widoczny błąd, nie objaw bez nagłówka).
  - `formatCorrectionDeadline(endsAtIso, nowIso)` — „dziś, 21:14” albo „jutra, 21:14” w `Europe/Warsaw`. Przy innej dacie (np. zmiana czasu) zwraca „DD.MM, HH:MM”.
  - `nowInWarsawLocal()` — wartość domyślna dla `datetime-local`.
  - `earliestEntryLocal()` — minimum: teraz − 14 dni.
  - `JOURNAL_MAX_DAYS_BACK = 14`, z komentarzem wskazującym na `SE003`.
- **`src/lib/copy/journal.ts`:** `JOURNAL_COPY`, czyste łańcuchy z szablonami `{do}`, `apiErrors`, `JournalApiErrorCode` i `apiErrorMessage` z `Object.hasOwn` (wzorzec `src/lib/copy/medications.ts:112-143`).
  - Teksty neutralne, bez rdzeni zakazanych. Uwaga na „wprowadź” (`prowadz`) i „przestało” (`przesta`).
  - Przykładowe brzmienie: „Możesz poprawić ten wpis do {do}.”, „Nie znalazłaś objawu? Opisz go w notatce.”

#### 2. Trasa API

**File**: `src/pages/api/journal/index.ts`

**Intent**: Przyjmuje JSON z treści POST, waliduje kształt i oddaje decyzję bazie.

**Contract**:

- `export const prerender = false`, `POST`.
- 401 przy `!locals.user || locals.recoverySession`.
- **Schemat zod:**
  - `occurredLocal` w formacie `YYYY-MM-DDTHH:MM` albo `null` (pole nieruszone → moment zapisu),
  - `items` to 1–34 elementów `{symptomId: z.uuid(), severity: enum | null}`,
  - `note` opcjonalne, przycięte, z limitem długości.
- Jedno `supabase.rpc("add_symptom_entry", …)`. Mapa `SE00x` i `28000` na klucze `JOURNAL_COPY.apiErrors`. W logach wyłącznie `error.code`.
- **Odpowiedzi:** sukces `201 { id }`; błąd danych `422 { error: <klucz> }`; nieznany błąd `500 { error: "unknown" }`.
- Żadnych danych zdrowotnych w URL ani w logach.

#### 3. Formularz i strony

**File**: `src/components/journal/NewEntryForm.tsx`, `src/components/journal/SymptomPicker.tsx`, `src/pages/dzienniczek/index.astro`, `src/pages/dzienniczek/nowy.astro`, `src/lib/navigation.ts`

**Intent**: Ekran na telefon zgodny z wymogami roadmapy, lista z „do kiedy” i pozycja w menu.

**Contract**:

- **`NAV_ITEMS`:** dochodzi `{ href: "/dzienniczek", label: "Dzienniczek" }` (chroni trasę automatycznie).
- **`nowy.astro`:**
  - Ładuje po stronie serwera `symptoms` i `symptom_search_terms`, liczy `nowInWarsawLocal()` i minimum.
  - Montuje `NewEntryForm` z `client:load`, przez `AppLayout`.
- **`SymptomPicker`:**
  - Pole wyszukiwania; pusty tekst → objawy pogrupowane w kategorie z nagłówkami.
  - Tekst → płaska lista trafień, z informacją, gdy nic nie pasuje: „Opisz go w notatce”.
  - Zaznaczone objawy widoczne nad listą z wyborem nasilenia (3 przyciski, opcjonalne, możliwe do odznaczenia).
- **`NewEntryForm`:**
  - `datetime-local` z `defaultValue` i `min`/`max` z serwera, notatka, `SubmitButton`.
  - Dopóki użytkowniczka nie zmieni pola godziny, wysyła `occurredLocal: null` — baza zapisze moment zapisu, nie otwarcia ekranu.
  - `SE003` (minimum przeterminowane między otwarciem a zapisem): komunikat podaje najwcześniejszą dopuszczalną datę i godzinę, liczoną w chwili odpowiedzi.
  - Wysyła `fetch("/api/journal", { method: "POST", body: JSON })`.
  - 201 → `location.assign("/dzienniczek?dodano=<id>")`.
  - 422/500 → `ServerError` nad formularzem; stan formularza zostaje.
  - Walidacja w przeglądarce (co najmniej 1 objaw) przed wysłaniem.
- **`index.astro`:**
  - Wpisy konta od najnowszego `occurred_at`: `select` z objawami, nazwą i kategorią objawu oraz `correction_window_ends_at`.
  - Data i godzina w czasie polskim; objawy z etykietą nasilenia; notatka.
  - „Możesz poprawić do {do}” tylko, gdy okno otwarte (porównanie z `now` serwera).
  - `?dodano=<uuid>` sprawdzone `z.uuid()` i należące do listy → komunikat po zapisie. Pusty stan z odnośnikiem do nowego wpisu.
  - Kolory wyłącznie z tokenów; żadnych `destructive*` przy treści o objawach.

#### 4. Testy jednostkowe i smoke

**File**: `scripts/journal/journal.test.mjs`, `scripts/fr012/journal-copy.test.mjs`, `scripts/navigation/navigation.test.mjs`, `scripts/smoke.mjs`

**Intent**: Dowód zachowań, których nie widać w SQL: wyszukiwania, formatowania godziny, tekstów i trasy HTTP.

**Contract**:

- **`journal.test.mjs`** (uruchamiany w strefie innej niż Warszawa, wzorzec `scripts/medications/medications.test.mjs:20-25`):
  - „nudnosci” znajduje „Nudności”; słowo potoczne znajduje swój objaw; „ból głowy” z wieloma spacjami trafia.
  - Kategoria spoza listy rzuca błąd.
  - `formatCorrectionDeadline`: „dziś” / „jutra”, granica północy w czasie polskim, dzień zmiany czasu (25.10.2026).
- **`journal-copy.test.mjs`:** klon `medication-copy.test.mjs` na `JOURNAL_COPY`.
- **Smoke:** POST `/api/journal` z prawdziwym nagłówkiem Origin (wyprowadzonym z Referrer-Policy strony `/dzienniczek/nowy`):
  - 201 i wiersz w bazie,
  - pusta lista objawów → 422 z kluczem,
  - lista `/dzienniczek` zawiera nazwę objawu,
  - żaden URL w ścieżce nie zawiera nazwy objawu.

### Success Criteria:

#### Automated Verification:

- Testy jednostkowe i FR-012 przechodzą: `npm test`
- `npm run lint` i `npm run typecheck`
- Skaner kolorów nie zgłasza nowych plików: `npm test` (`scripts/tokens/hardcoded-colors.test.mjs`)
- Smoke z krokami dzienniczka przechodzi przeciw lokalnej bazie: `npm run smoke`
- Build przechodzi: `npm run build`

#### Manual Verification:

- Na telefonie (lub w widoku mobilnym): dodanie wpisu z dwoma objawami, wyszukanymi bez polskich znaków i słowem potocznym, z nasileniem przy jednym, cofniętą godziną i notatką
- Lista pokazuje wpis z poprawną godziną polską i „Możesz poprawić do jutra, HH:MM”
- Wymuszony błąd serwera (np. wyłączona baza) zostawia zaznaczone objawy w formularzu
- Pasek adresu i historia przeglądarki nie zawierają nazwy objawu ani notatki
- Ekran czytelny w trybie jasnym na wąskim ekranie; brak płaskiej listy 34 pozycji bez wpisanego tekstu

**Implementation Note**: Po zielonej weryfikacji automatycznej zatrzymaj się na ręczne potwierdzenie przed fazą 4.

---

## Phase 4: Okno korekty w UI leków i poprawa dawki (F6a)

### Overview

Po dodaniu leku i po zmianie dawki użytkowniczka widzi, do kiedy może je poprawić. Świeżo zapisaną pomyłkę w dawce poprawia bez tworzenia fałszywego okresu.

### Changes Required:

#### 1. RPC poprawy okresu

**File**: `supabase/migrations/20261005140000_correct_dosage_period.sql`, `supabase/tests/dosage_change_checks.sql`, `supabase/tests/medication_interaction_checks.sql`

**Intent**: Jedna funkcja poprawiająca treść dawki i wariant okresu w jego oknie, z nazwanymi błędami zamiast ogólnego komunikatu strażnika.

**Contract**:

- `public.correct_dosage_period(p_period_id uuid, p_dose_text text, p_registry_product_id uuid) returns void`, `security invoker`.
- **Kolejność błędów:**
  - `28000`,
  - `DP008` (nie ten lek/konto),
  - `DP009` — okno korekty okresu zamknięte (sprawdzone przez porównanie `now()` z `correction_window_end(created_at)`, bez wołania funkcji definer),
  - `DP005` — wariant przez `assert_dosage_period_variant`,
  - `DP004` — ta sama dawka i wariant.
  - `DP010` — dawka i wariant identyczne z okresem bezpośrednio poprzedzającym. Taka poprawa nie naprawia pomyłki, tylko zostawia w historii „zmianę”, której nie było (dwa kolejne okresy z tą samą dawką). Komunikat mówi wprost, że to cofnięcie zmiany, którego produkt jeszcze nie obsługuje. Dług „cofnięcie zmiany” wpisany w roadmapie przy S-06.
- `btrim(p_dose_text)`. Daty okresu bez zmian.
- **INTERACTION 11:** `correct_dosage_period` dopisane do listy funkcji z `EXECUTE` dla `authenticated`.
- **Nowe sprawdzenia DOSAGE:** poprawa w oknie przechodzi; po 24 h `DP009`; cudzy okres `DP008`; wariant innego preparatu `DP005`; ta sama treść `DP004`; dawka i wariant z poprzedniego okresu `DP010`; okres bez poprzednika (pierwszy okres leku) — `DP010` nie występuje.

#### 2. Trasa, ekran i informacja „do kiedy”

**File**: `src/pages/api/medications/[id]/periods/[periodId].ts`, `src/pages/leki/[id]/okresy/[periodId]/poprawa.astro`, `src/components/medications/CorrectDosageForm.tsx`, `src/pages/leki/[id].astro`, `src/pages/leki/index.astro`, `src/lib/copy/medications.ts`

**Intent**: Droga poprawy na wzór zmiany dawki oraz informacja o oknie tam, gdzie użytkowniczka właśnie coś zapisała.

**Contract**:

- **Trasa:** `POST` na wzór `src/pages/api/medications/[id]/dosage.ts` — zod, `formText`, mapa `DP00x` (+ `DP009`, `DP010`), przekierowania z samym kluczem błędu albo `/leki/{id}?poprawiono=1`. Dawka nigdy w URL.
- **Ekran poprawy:** dawka i (przy leku z rejestru) wariant tego samego preparatu, z wartościami bieżącymi. Informacja „Możesz poprawić do {do}”. Gdy okno zamknięte, ekran mówi to wprost i odsyła do zmiany dawkowania.
- **`[id].astro`:**
  - Historia okresów czyta `correction_window_ends_at` i przy okresie w oknie pokazuje odnośnik „Popraw dawkę (do {do})”.
  - Komunikaty `?zmieniono=1`, `?dodano=<uuid>` i `?poprawiono=1` dostają „do {do}”.
- **`MEDICATION_COPY`:** nowe teksty przez filtr FR-012. Rdzeń `dawk` dozwolony, pozostałe zakazane.
- **Formatowanie:** `formatCorrectionDeadline` z fazy 3.

#### 3. Smoke

**File**: `scripts/smoke.mjs`

**Intent**: Ścieżka HTTP poprawy dawki działa z nagłówkami jak z przeglądarki.

**Contract**: krok w `medicationFlowSteps` — zmiana dawki, potem poprawa nowego okresu. Wynik: ten sam okres ma nową treść dawki, a liczba okresów się nie zmienia.

### Success Criteria:

#### Automated Verification:

- Migracje i sprawdzenia SQL z nowymi DOSAGE: `npx supabase db reset` + `npm run db:check`
- `npm test` (w tym FR-012 dla nowych tekstów), `npm run lint`, `npm run typecheck`, `npm run build`
- Smoke z krokiem poprawy dawki przeciw lokalnej bazie: `npm run smoke`

#### Manual Verification:

- Dodanie leku pokazuje „do kiedy” w komunikacie po zapisie
- Zmiana dawki z pomyłką („2 tabletki”), potem „Popraw dawkę” → historia ma jeden okres z poprawioną dawką, bez jednodniowego fałszywego okresu
- Okres sprzed ponad 24 h nie ma odnośnika poprawy; bezpośrednie wejście na ekran poprawy mówi, że okno jest zamknięte

---

## Testing Strategy

### Unit Tests:

- `foldForSearch`: wielkość liter, polskie znaki (z „ł”), wielokrotne spacje, NFC vs NFD.
- `filterSymptoms` / `groupSymptomsByCategory`: trafienie po nazwie i słowie potocznym, brak trafień, nieznana kategoria → błąd.
- `formatCorrectionDeadline`: dziś/jutra, granica północy, zmiana czasu 25.10.2026, uruchomienie w strefie innej niż Warszawa.
- Filtr FR-012 na `JOURNAL_COPY` i nowych tekstach `MEDICATION_COPY`.

### Integration Tests:

- SQL: granica 24 h dla leku, składu, okresu i wpisu; zamrożenie `created_at`; izolacja kont dla nowych tabel; kody `SE001`–`SE005`, `DP009` i `DP010`; `restrict` na objawach; wymóg co najmniej jednego objawu przy zatwierdzeniu.
- Smoke (lokalnie): izolacja nowych tabel, zapis wpisu przez HTTP, poprawa dawki przez HTTP.

### Manual Testing Steps:

1. Na telefonie dodaj wpis z godziną cofniętą o 10 h, objawami „nudnosci” i „sraczka” (słowo potoczne), z nasileniem „silne” przy jednym.
2. Sprawdź listę: godzina polska, nasilenie, „Możesz poprawić do …”.
3. Wymuś błąd serwera i sprawdź, że zaznaczenia zostają.
4. Zmień dawkę leku z pomyłką, popraw ją w oknie, sprawdź historię okresów.
5. Sprawdź pasek adresu i historię przeglądarki pod kątem nazw objawów i dawek.

## Performance Considerations

Katalog (34 + 82 wiersze) ładowany raz ze stroną i filtrowany w przeglądarce. Lista wpisów bez stronicowania. Przy skali jednej osoby to wystarczy, a indeks `(user_id, occurred_at desc)` przygotowuje stronicowanie na później.

## Migration Notes

- Po wdrożeniu fazy 1 każdy lek, skład i okres zapisany ponad 24 h wcześniej staje się niemodyfikowalny w rdzeniu. Dotyczy to też danych testowych na produkcji. To zamierzone; napisz to w opisie PR.
- Nowe funkcje przez `create function`, funkcja leku przez `create or replace` (zachowuje uprawnienia). Żadnego `drop function` na istniejących funkcjach okna.
- Wycofanie: nowa migracja przywracająca zaślepkę — nie edycja zastosowanej migracji.

## References

- PRD: `context/foundation/prd.md` — US-02, FR-004, FR-008, FR-009, FR-012, Open Questions 5
- Roadmapa: `context/foundation/roadmap.md` — S-05 (wymogi projektowe, długi z F-01 i S-03), S-07 (granica zakresu)
- Notatki zmiany: `context/changes/symptom-journal-entry/change.md` — rozstrzygnięcie Q-3
- Poprzednia zmiana: `context/archive/2026-10-04-dosage-period-history/plan.md`, `reviews/impl-review.md` (F6a)
- Wzorce: `src/pages/api/medications/[id]/dosage.ts`, `src/components/medications/ChangeDosageForm.tsx`, `src/lib/copy/medications.ts:112-143`, `supabase/migrations/20260922120000_medication_schema.sql:106-216` (RLS), `:370-392` (strażnik usunięcia)
- Checklista nowej tabeli: `context/foundation/test-plan.md` §6.4

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Okno korekty leków w bazie

#### Automated

- [x] 1.1 Migracje wchodzą czysto: `npx supabase db reset` — 1b14817
- [x] 1.2 Wszystkie sprawdzenia SQL przechodzą, w tym nowy `correction_window_checks.sql`: `npm run db:check` — 1b14817
- [x] 1.3 Sondy schematu padają z oczekiwanym komunikatem, także nowa sonda funkcji okna okresu — 1b14817
- [x] 1.4 `npm test`, `npm run lint`, `npm run typecheck` przechodzą bez zmian w wynikach — 1b14817

#### Manual

- [x] 1.5 W lokalnym Studio: `correction_window_ends_at` = `created_at` + 24 h, ręczna zmiana `created_at` jako `authenticated` odrzucona — 1b14817
- [x] 1.6 Pomiar przez PostgREST: `select=id,correction_window_ends_at` na `medications` i `dosage_periods` zwraca godzinę końca okna dla zalogowanej — 1b14817

### Phase 2: Schemat dzienniczka

#### Automated

- [x] 2.1 Migracje wchodzą czysto: `npx supabase db reset` — 31a57f2
- [x] 2.2 Wszystkie sprawdzenia SQL przechodzą, w tym `symptom_journal_checks.sql`: `npm run db:check` — 31a57f2
- [x] 2.3 Sondy schematu w CI padają z oczekiwanym komunikatem — 31a57f2
- [x] 2.4 Smoke przechodzi przeciw lokalnej bazie, z nowymi krokami izolacji: `npm run smoke` — 31a57f2
- [x] 2.5 `npm test`, `npm run lint`, `npm run typecheck` — 31a57f2

#### Manual

- [x] 2.6 Przed smoke zmierzone, że bieg pisze do lokalnej bazy — 31a57f2

### Phase 3: Ekran dzienniczka — nowy wpis i lista

#### Automated

- [x] 3.1 Testy jednostkowe i FR-012 przechodzą: `npm test`
- [x] 3.2 `npm run lint` i `npm run typecheck`
- [x] 3.3 Skaner kolorów nie zgłasza nowych plików
- [x] 3.4 Smoke z krokami dzienniczka przechodzi przeciw lokalnej bazie: `npm run smoke`
- [x] 3.5 Build przechodzi: `npm run build`

#### Manual

- [x] 3.6 Na telefonie: wpis z dwoma objawami (bez polskich znaków, słowo potoczne), nasileniem, cofniętą godziną i notatką
- [x] 3.7 Lista pokazuje poprawną godzinę polską i „Możesz poprawić do jutra, HH:MM”
- [x] 3.8 Wymuszony błąd serwera zostawia zaznaczone objawy
- [x] 3.9 Pasek adresu i historia przeglądarki bez nazwy objawu i notatki
- [x] 3.10 Ekran czytelny na wąskim ekranie; brak płaskiej listy 34 pozycji bez wpisanego tekstu

### Phase 4: Okno korekty w UI leków i poprawa dawki (F6a)

#### Automated

- [ ] 4.1 Migracje i sprawdzenia SQL z nowymi DOSAGE: `npx supabase db reset` + `npm run db:check`
- [ ] 4.2 `npm test`, `npm run lint`, `npm run typecheck`, `npm run build`
- [ ] 4.3 Smoke z krokiem poprawy dawki przeciw lokalnej bazie: `npm run smoke`

#### Manual

- [ ] 4.4 Dodanie leku pokazuje „do kiedy” w komunikacie po zapisie
- [ ] 4.5 Pomyłka w zmianie dawki poprawiona w oknie; historia bez fałszywego okresu
- [ ] 4.6 Okres sprzed ponad 24 h bez odnośnika poprawy; ekran poprawy mówi, że okno zamknięte
