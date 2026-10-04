# S-03: Historia okresów dawkowania — plan wdrożenia

## Overview

Użytkowniczka może zmienić dawkowanie leku. Bieżący okres dawkowania zostaje zamknięty, otwiera się nowy, a szczegóły leku pokazują pełną historię okresów od–do (US-04, FR-004, roadmapa S-03, issue #14). Zmiana dawki obejmuje też zmianę mocy tego samego preparatu z rejestru (np. Ibuprom 200 mg → 400 mg): każdy okres pamięta swój wariant.

Przy okazji formularze leku dostają dwie poprawki czytelności: przykład wartości przestaje udawać wpisaną treść, a pola obowiązkowe są oznaczone wprost.

## Current State Analysis

- Baza jest przygotowana na zamykanie i otwieranie okresów, ale aplikacja nie ma żadnej drogi zapisu zmiany dawki. `dosage_periods` ma okres `[)`, zakaz nakładania (`exclude using gist`) i zakaz okresu zerowej długości (`ended_on > started_on`). Strażnik `dosage_periods_guard_core` przepuszcza zamknięcie okresu (`ended_on` z pustej na datę) także po zamknięciu okna korekty.
- CHECK 19 w `supabase/tests/rls_checks.sql:535-629` dowodzi wzorca na poziomie SQL: P1 zamknięty `ended_on = 2026-04-01`, P2 otwarty `started_on = 2026-04-01`, nadpisanie `dose_text` w P1 odrzucone.
- Zapis leku idzie przez funkcje `security invoker` (`add_medication_from_registry`, `add_medication_from_leaflet` w `20260930120000_medication_write_and_interactions.sql`): jedno wywołanie, wszystko albo nic. Trasa `src/pages/api/medications/index.ts` waliduje formularz przez zod, mapuje kody błędów bazy na klucze `MEDICATION_COPY.apiErrors`, a po błędzie przekierowuje z samym kodem — dawki nie odsyła.
- Szczegóły leku (`src/pages/leki/[id].astro:97-171`) pokazują wyłącznie bieżącą dawkę, datę pierwszego startu i wariant leku (`medications.registry_medication_id`). Historii okresów nie ma. Wariant jest cechą leku, więc po zmianie mocy ekran pokazywałby moc z chwili dodania.
- Okno korekty (`medication_correction_window_open`) to wciąż zaślepka zwracająca `true` (dług do S-05). Do tego czasu rdzeń okresów da się technicznie nadpisać bezpośrednim zapytaniem.
- Formularze (`AddMedicationForm.tsx`, `AddLeafletMedicationForm.tsx`, `RegistrySearch.tsx`) mają placeholdery w kolorze `muted-foreground` (#4c534c). Kolor jest tak ciemny z powodu progu kontrastu 7 : 1, więc przykład wygląda jak wpisana wartość. Pola obowiązkowe mają wyłącznie atrybut `required`, bez oznaczenia w etykiecie.

## Desired End State

- Na szczegółach bieżącego leku jest przycisk „Zmiana dawkowania”. Prowadzi do osobnego ekranu z polem dawki, datą zmiany (domyślnie dziś, z możliwością cofnięcia najwyżej o 14 dni i nie wcześniej niż na dzień po rozpoczęciu bieżącego okresu) i — przy leku z rejestru — wyborem wariantu tego samego preparatu.
- Zapis zamyka bieżący okres datą zmiany i otwiera nowy od tej daty, w jednej transakcji. Lek zostaje jedną pozycją na liście.
- Szczegóły leku pokazują sekcję historii: okresy od najnowszego, z dawką, wariantem i datami. Data „do” to ostatni dzień starej dawki, czyli dzień przed zmianą: zmiana 10.10 daje „1.09.2026 – 9.10.2026” oraz „od 10.10.2026”.
- Baza odrzuca nazwanymi błędami:
  - datę zmiany w przyszłości, starszą niż 14 dni albo nie późniejszą niż początek bieżącego okresu,
  - tę samą dawkę (ten sam tekst i ten sam wariant),
  - lek odstawiony,
  - wariant innego preparatu lub o innym składzie,
  - wariant przy leku z ulotki.
- Formularze leku pokazują przykład pod polem jako podpowiedź, a etykiety pól obowiązkowych mają dopisek „(obowiązkowe)”.
- Weryfikacja: `npm test`, `npm run lint`, `npm run typecheck`, `npm run db:check` (po `npx supabase db reset`), `npm run smoke` oraz ręczne przejście ścieżki zmiany dawki w przeglądarce.

### Key Discoveries:

- `supabase/migrations/20260922120000_medication_schema.sql:275-311` — `dosage_periods_guard_core`; zamknięcie okresu przechodzi zawsze (:300-303).
- `supabase/migrations/20260922120000_medication_schema.sql:88-89` — okres jednodniowy to `started_on = d, ended_on = d + 1`; dlatego zmiana w dniu rozpoczęcia jest niemożliwa (decyzja „od jutra”).
- `supabase/migrations/20260930120000_medication_write_and_interactions.sql:156-215` — wzorzec funkcji zapisu: `security invoker`, `set search_path = ''`, `28000` bez sesji, `P0002` brak obiektu, uprawnienia na końcu (:341-347).
- `supabase/migrations/20260930120000_medication_write_and_interactions.sql:309-310` — „dziś” w SQL to `(now() at time zone 'Europe/Warsaw')::date`; lek bieżący = `discontinued_on is null or discontinued_on > dziś`.
- `src/lib/services/medications.ts:43-51` — `todayInWarsaw()`, jedyne źródło „dziś” w aplikacji (Worker działa w UTC). `:80` — `formatIsoDate()` na łańcuchach, bez `Date`.
- `src/pages/leki/nowy.astro:61-64` — warianty jednej nazwy to wiersze `registry_products` o tej samej `product_name` (porównanie `ilike`, bez wielkości liter).
- `src/lib/copy/medications.ts` + `scripts/fr012/medication-copy.test.mjs` — każdy nowy tekst trafia do `MEDICATION_COPY` i przechodzi filtr FR-012; dozwolony jest wyłącznie rdzeń `dawk`.
- `supabase/tests/schema_invariants_checks.sql:417-418` — INVARIANT 8 zna strażnika `dosage_periods_guard_core` po nazwie; rozszerzenie jego treści nie zmienia listy.

## What We're NOT Doing

- **Dawka wybierana z list** (ilość, jednostka, częstość). Odłożone przez autorkę na później, jeśli starczy czasu. Kandydat na osobną zmianę. Skutek: reguła „ta sama dawka” porównuje tekst, więc „pół tabletki” i „½ tabletki” przejdą jako zmiana. To znane ograniczenie.
- **Poprawka literówki w bieżącej dawce bez nowego okresu.** Czeka na prawdziwe okno korekty z S-05. Dziś okno jest zaślepką zawsze „otwartą”, więc przycisk poprawki pozwalałby nadpisać dowolny okres.
- **Zmiana dawki tego samego dnia, w którym zaczął się bieżący okres.** Ekran mówi, że zmiana jest możliwa od jutra. Nie robimy podmiany dawki tylnymi drzwiami.
- **Zmiana dawki przy leku odstawionym** i ponowne przyjmowanie leku po odstawieniu — należy do S-04.
- **Zmiana substancji czynnej albo przejście na inny preparat** — to zakończenie leku i dodanie nowego (US-04, S-04).
- **Zmiana wariantu przy leku z ulotki.** Lek z ulotki nie ma wariantów z rejestru; zmiana mocy zostaje w tekście dawki.
- **Twarde blokady w bazie dla bezpośrednich `INSERT` okresów z pominięciem funkcji** (np. okres z wariantem innego preparatu). Zapis tylko przez funkcje pozostaje konwencją aplikacji — znane ograniczenie przejęte z S-02.
- **Test E2E w Playwright** — autorka wybrała testy SQL i jednostkowe. Przepływ w przeglądarce sprawdzany ręcznie.
- **Placeholdery i oznaczenia na ekranach auth** — poprawka czytelności dotyczy wyłącznie formularzy leku.
- **Przeniesienie nazwy leku poza URL na ekranach dodawania** (`?q=`, `?nazwa=` …) — dług z S-02, osobne issue #57.
- **Podmiana okna korekty** — dług S-05.

## Implementation Approach

Kolejność od ryzyka: najpierw mała faza formularzy (niezależna, od razu widoczna), potem baza z regułami i testami SQL, bo ona jest jedyną gwarancją historii. Dalej odczyt historii na szczegółach (widoczny efekt nowej kolumny jeszcze bez zapisu), na końcu ekran i trasa zapisu.

Zmiana dawki to jedna funkcja `security invoker` w bazie, tak jak dodawanie leku w S-02. Funkcja blokuje wiersz leku, sprawdza reguły i nazwanymi kodami SQLSTATE zgłasza każde odrzucenie. Następnie zamyka okres trwający i otwiera nowy. Trasa API waliduje kształt danych przez zod, a decyzję zostawia bazie. Kody błędów tłumaczy na klucze tekstów; dawka nigdy nie wraca w URL.

Wariant przechodzi z leku do okresu: `dosage_periods.registry_product_id`. `medications.registry_medication_id` zostaje bez zmian i nadal oznacza preparat, z którego przy dodaniu skopiowano skład.

## Critical Implementation Details

- **Kolejność w migracji:** najpierw kolumna i uzupełnienie istniejących okresów, dopiero potem nowa wersja `dosage_periods_guard_core` blokująca `registry_product_id`. Odwrotna kolejność wywróci uzupełnienie wszędzie tam, gdzie okno korekty jest już zamknięte (po S-05).
- **Kody błędów zmierz przed mapowaniem w trasie.** Lekcja „Bramka musi odróżnić blokadę od niewykonania”: zanim trasa zacznie mapować własne kody SQLSTATE, sprawdź, co PostgREST faktycznie zwraca w `error.code` dla `raise exception using errcode = 'DP001'`.

## Phase 1: Formularze leku — podpowiedź zamiast placeholdera, oznaczenie pól obowiązkowych

### Overview

Przykład wartości przestaje wyglądać jak wpisana treść, a pole obowiązkowe jest rozpoznawalne przed wysłaniem formularza.

### Changes Required:

#### 1. Teksty

**File**: `src/lib/copy/medications.ts`

**Intent**: Zamienić teksty placeholderów na podpowiedzi pod polem i dodać wspólny dopisek dla pól obowiązkowych.

**Contract**:

- `add.searchPlaceholder` → `add.searchHint` („Na przykład: Ibuprom”),
- `add.dosePlaceholder` → `add.doseHint` („Na przykład: 1 tabletka rano”),
- `leaflet.substancePlaceholder` → wcielony w istniejącą podpowiedź `substanceHint`/`substanceListHint` („Na przykład: ibuprofenum”),
- nowy klucz `requiredMark: "(obowiązkowe)"` w sekcji wspólnej (np. `form`).

Wszystkie teksty przechodzą `scripts/fr012/medication-copy.test.mjs`.

#### 2. Formularze

**File**: `src/components/medications/AddMedicationForm.tsx`, `src/components/medications/AddLeafletMedicationForm.tsx`, `src/components/medications/RegistrySearch.tsx`

**Intent**: Usunąć `placeholder` z pól tekstowych i pokazać przykład jako akapit `text-muted-foreground text-sm` pod polem, powiązany przez `aria-describedby` (wzorzec: `substanceName-hint` w `AddLeafletMedicationForm.tsx`). Każda etykieta pola z `required` i legenda „Wybierz wariant” dostają dopisek `requiredMark`.

**Contract**:

- Dopisek obowiązkowości jest tekstem w etykiecie (czytany przez czytnik ekranu), nie gwiazdką.
- Żaden `<input>` w formularzach leku nie ma atrybutu `placeholder`.
- Kolory wyłącznie tokenami.

### Success Criteria:

#### Automated Verification:

- Testy przechodzą, w tym filtr FR-012 tekstów leku i bramka kolorów: `npm test`
- Lint przechodzi: `npm run lint`
- Typy przechodzą: `npm run typecheck`
- Żaden formularz leku nie ma placeholdera: `grep -rn "placeholder" src/components/medications` nie zwraca nic

#### Manual Verification:

- Na `/leki/nowy` i `/leki/nowy/z-ulotki` puste pole wygląda na puste, a przykład stoi pod nim
- Każde pole obowiązkowe ma przy etykiecie „(obowiązkowe)”, także legenda wariantu
- Czytnik ekranu (VoiceOver) odczytuje etykietę z dopiskiem i podpowiedź przy polu dawki

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Baza — wariant przy okresie i funkcja zmiany dawki

### Overview

Baza zna wariant każdego okresu i ma jedyną drogę zapisu zmiany dawki z kompletem reguł, sprawdzonych testami SQL.

### Changes Required:

#### 1. Pomiar przed migracją

**File**: brak (zapytanie do lokalnej bazy, wynik w `context/changes/dosage-period-history/change.md`, sekcja Notes)

**Intent**: Zmierzyć, ile nazw w `registry_products` ma warianty o różnym zbiorze kodów ATC lub różnych substancjach bez kodu. Wynik pokazuje, jak często reguła „inny skład → nowy lek” zadziała w praktyce. Nie zmienia decyzji.

**Contract**: liczba nazw i przykłady zapisane w Notes.

#### 2. Migracja

**File**: `supabase/migrations/20261004120000_dosage_change.sql`

**Intent**: Dodać wariant do okresu, objąć go ochroną historii, ustawiać go przy dodaniu leku z rejestru i dodać funkcję zmiany dawki. Nagłówek migracji w stylu S-02: opis po angielsku z przykładami.

**Contract**:

- `dosage_periods.registry_product_id uuid null references public.registry_products (id) on delete restrict`.
- Uzupełnienie istniejących wierszy: okresom leków `composition_source = 'registry'` wpisać `medications.registry_medication_id`; okresy leków z ulotki zostają z `null`.
- `create or replace public.dosage_periods_guard_core()` — dotychczasowe gałęzie bez zmian plus blokada zmiany `registry_product_id` po zamknięciu okna, z polskim komunikatem w tym samym stylu.
- `create or replace public.add_medication_from_registry(...)` — pierwszy okres zapisuje `registry_product_id = p_registry_product_id`. Sygnatura bez zmian.
- Nowa funkcja `public.change_dosage(p_medication_id uuid, p_dose_text text, p_changed_on date, p_registry_product_id uuid default null) returns uuid` (id nowego okresu). Zachowanie: `volatile`, `security invoker`, `set search_path = ''`. Blokuje wiersz leku `for update`. Reguły w tej kolejności:

| Warunek                                                                                                                                                                                                                              | SQLSTATE |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- |
| brak sesji                                                                                                                                                                                                                           | `28000`  |
| lek nie istnieje albo należy do innego konta (RLS go nie pokazuje)                                                                                                                                                                   | `P0002`  |
| lek odstawiony: `discontinued_on <= dziś` (Warszawa)                                                                                                                                                                                 | `DP001`  |
| brak okresu trwającego                                                                                                                                                                                                               | `DP006`  |
| przy leku z rejestru wariant inny niż ta sama `product_name` (bez wielkości liter) lub inny skład (zbiór kodów ATC i zbiór nazw substancji bez kodu różny od `medication_substances`); przy leku z ulotki podany jakikolwiek wariant | `DP005`  |
| `lower(btrim(dawka))` równe bieżącej i wariant równy bieżącemu                                                                                                                                                                       | `DP004`  |
| `p_changed_on > dziś`                                                                                                                                                                                                                | `DP003`  |
| `p_changed_on < dziś − 14 dni` (limit cofnięcia, patrz niżej)                                                                                                                                                                        | `DP007`  |
| `p_changed_on <= started_on` okresu trwającego                                                                                                                                                                                       | `DP002`  |

`DP004` stoi przed regułami daty celowo: powtórzone wywołanie po udanym zapisie (przycisk „wstecz”, ponowne wysłanie) ma tę samą dawkę i datę równą początkowi nowego okresu. Przy odwrotnej kolejności dostałoby `DP002` („data za wczesna”) zamiast `DP004` („już zapisane”). `DP005` jest przed `DP004`, bo porównanie wariantu wymaga wariantu już sprawdzonego.

Limit cofnięcia 14 dni chroni zamkniętą historię: bez niego zmiana wpisana w październiku z datą 2 stycznia przypisałaby nową dawkę dziewięciu miesiącom wstecz, a wcześniejsze zestawienia objawów (US-04, S-06) przestałyby być prawdziwe. Starszą zmianę zapisuje się przez zakończenie leku i dodanie nowego. Liczba 14 jest stałą w funkcji z komentarzem wskazującym `DOSAGE_CHANGE_MAX_DAYS_BACK` w `src/lib/services/medications.ts`; do zgrania z oknem korekty, gdy S-05 je ustali.

Wariant `null` przy leku z rejestru oznacza wariant bieżący. Po sprawdzeniach: `update` okresu trwającego `ended_on = p_changed_on`, potem `insert` nowego okresu (`btrim` dawki, `started_on = p_changed_on`, wariant). Pusta dawka pada na `dosage_periods_dose_text_check`.

- Uprawnienia: `revoke execute ... from public, anon`, `grant execute ... to authenticated` (wzorzec S-02). Komentarz funkcji z przykładem, jak przy `add_medication_from_registry`.

#### 3. Typy

**File**: `src/types.ts`

**Intent**: Odzwierciedlić nową kolumnę i komendę zmiany dawki.

**Contract**: `DosagePeriod.registry_product_id: string | null`; nowy `ChangeDosageCommand` (`medicationId`, `doseText`, `changedOn`, `registryProductId?`).

#### 4. Testy SQL

**File**: `supabase/tests/dosage_change_checks.sql` (nowy, kończy się `rollback` i `GATE_COMPLETE dosage_change_checks`)

**Intent**: Dowieść każdej reguły funkcji nazwanym wynikiem (lekcja „Bramka musi odróżnić blokadę od niewykonania”). Łapany jest konkretny SQLSTATE, nie `when others`. Każda blokada ma kontrprzykład właściciela z `row_count = 1`.

**Contract**: przypadki:

- udana zmiana: stary okres ma `ended_on = data zmiany`, nowy `started_on = data zmiany`, dokładnie dwa okresy, jeden trwający, wariant przepisany;
- zmiana mocy (inny wariant tej samej nazwy i składu) przechodzi i zapisuje nowy wariant;
- `DP002` dla daty równej początkowi okresu i wcześniejszej; `DP003` dla jutra;
- `DP007` dla daty `dziś − 15 dni`; `dziś − 14 dni` przechodzi (okres zaczęty wcześniej);
- `DP004` dla tej samej dawki różniącej się wielkością liter i spacjami; ta sama dawka z innym wariantem przechodzi;
- powtórzone wywołanie z tymi samymi argumentami po udanej zmianie daje `DP004`, nie `DP002`, i nie dodaje trzeciego okresu;
- `DP001` dla leku z `discontinued_on = dziś`; lek z `discontinued_on = jutro` przechodzi;
- `DP005` dla wariantu innej nazwy, dla wariantu o innym składzie i dla wariantu przy leku z ulotki;
- `P0002` dla leku drugiego konta (bez zmian w jego okresach);
- `28000` bez sesji;
- po zamknięciu okna korekty (podmiana funkcji jak w `rls_checks.sql:341-353`) zmiana dawki nadal przechodzi, a zmiana `registry_product_id` istniejącego okresu pada z komunikatem strażnika;
- `add_medication_from_registry` zapisuje wariant w pierwszym okresie.

Osobno: `change_dosage` dopisana do listy INTERACTION 11 w `supabase/tests/medication_interaction_checks.sql:542-547` (anon nie może wykonać, authenticated może) — ta sama bramka uprawnień co funkcje z S-02.

### Success Criteria:

#### Automated Verification:

- Migracje wchodzą od zera: `npx supabase db reset`
- Wszystkie sprawdzenia SQL przechodzą, w tym nowy plik: `npm run db:check`
- Sondy CI nadal padają tam, gdzie powinny (krok „SQL checks” w `.github/workflows/ci.yml` uruchomiony lokalnie)
- Typy przechodzą: `npm run typecheck`
- Testy przechodzą: `npm test`

#### Manual Verification:

- Wynik pomiaru wariantów zapisany w `change.md` (Notes)
- Przegląd nagłówka migracji: opis z przykładami zrozumiały bez czytania SQL

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: Historia okresów na szczegółach leku

### Overview

Szczegóły leku pokazują wszystkie okresy dawkowania, a wariant w podsumowaniu pochodzi z okresu trwającego.

### Changes Required:

#### 1. Pomocnicze funkcje dat

**File**: `src/lib/services/medications.ts`

**Intent**: Czyste funkcje na łańcuchach `YYYY-MM-DD`, bez strefy czasowej (wzorzec `formatIsoDate`). Jedna przelicza zapisane `ended_on` na ostatni dzień okresu, druga podaje dzień następny (minimalna data zmiany w fazie 4).

**Contract**: `lastDayOfPeriod(endedOn: string): string` (dzień wcześniej); `nextDay(iso: string): string`; `earliestChangeDate(startedOn: string, today: string): string` — późniejsza z dat `nextDay(startedOn)` i `today − DOSAGE_CHANGE_MAX_DAYS_BACK`; stała `DOSAGE_CHANGE_MAX_DAYS_BACK = 14`. Wszystkie poprawne na przełomie miesiąca, roku i 29 lutego.

#### 2. Testy jednostkowe

**File**: `scripts/medications/medications.test.mjs`

**Intent**: Oczekiwane wartości wpisane wprost, nie liczone tą samą logiką.

**Contract**: przykłady: `2026-10-10 → 2026-10-09`, `2026-03-01 → 2026-02-28`, `2028-03-01 → 2028-02-29`, `2027-01-01 → 2026-12-31`; `nextDay` odwrotnie, w tym `2028-02-28 → 2028-02-29`; `earliestChangeDate("2026-01-01", "2026-10-04") → "2026-09-20"`, `earliestChangeDate("2026-10-01", "2026-10-04") → "2026-10-02"`, `earliestChangeDate("2026-01-01", "2026-03-05") → "2026-02-19"`.

#### 3. Ekran szczegółów

**File**: `src/pages/leki/[id].astro`, `src/lib/copy/medications.ts`

**Intent**: Dociągnąć okresy z wariantem (`dosage_periods(id, dose_text, started_on, ended_on, registry_products(strength, pharmaceutical_form))`). Dodać sekcję „Historia dawkowania”: okresy od najnowszego, każdy z dawką, wariantem (przy leku z rejestru) i datami. Okres trwający pokazany jako „od {data}”, zamknięty jako „{od} – {ostatni dzień}”. „Wariant” w podsumowaniu bierze wariant okresu trwającego; wartość leku jest tylko fallbackiem dla okresów bez wariantu.

**Contract**: nowe teksty w `MEDICATION_COPY.details` (nagłówek historii, wzorce dat z `{od}`/`{do}`/`{data}`), przechodzące filtr FR-012. Ekran `.astro` bez React.

### Success Criteria:

#### Automated Verification:

- Testy jednostkowe dat i filtr FR-012 przechodzą: `npm test`
- Lint przechodzi: `npm run lint`
- Typy przechodzą: `npm run typecheck`

#### Manual Verification:

- Lek z dwoma okresami (wstawionymi przez `change_dosage` w lokalnej bazie) pokazuje oba, najnowszy na górze, z datą „do” o dzień wcześniejszą niż początek nowego
- Lek z jednym okresem pokazuje jeden wpis „od …”
- Lek z ulotki nie pokazuje wariantu przy okresach
- Na telefonie (szerokość ~375 px) historia czyta się bez poziomego przewijania

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 4: Ekran i trasa zmiany dawki

### Overview

Użytkowniczka zmienia dawkę z poziomu szczegółów leku. Każde odrzucenie przez bazę wraca jako zrozumiały komunikat.

### Changes Required:

#### 1. Trasa API

**File**: `src/pages/api/medications/[id]/dosage.ts`

**Intent**: Zapis zmiany dawki z formularza (POST, `request.formData()`), według wzorca `src/pages/api/medications/index.ts`: ta sama ochrona sesji (401 bez użytkownika lub przy sesji odzyskiwania), walidacja zod, mapowanie kodów bazy, logi z samym `error.code`.

**Contract**:

- `export const prerender = false`, eksport `POST`.
- `id` ze ścieżki walidowany `z.uuid()`.
- Pola: `doseText` (trim, 1–200), `changedOn` (`z.iso.date`, `<= todayInWarsaw()`), `registryProductId` (opcjonalny `z.uuid`).
- RPC `change_dosage`; mapa `DP001…DP007` i `P0002` na nowe klucze `apiErrors`, reszta na `generic`.
- Błąd: przekierowanie na `/leki/<id>/zmiana-dawki?error=<klucz>`, bez dawki i bez daty w URL.
- Sukces: `/leki/<id>?zmieniono=1`.

#### 2. Ekran zmiany dawki

**File**: `src/pages/leki/[id]/zmiana-dawki.astro`, `src/components/medications/ChangeDosageForm.tsx`

**Intent**: Ekran przez `AppLayout`. Pokazuje bieżącą dawkę i jej datę początku. Formularz to natywny POST z `useSubmitting`, wzorzec `AddMedicationForm`.

**Contract**:

- Pola formularza:
  - `doseText` — puste, obowiązkowe, podpowiedź pod polem z fazy 1;
  - `changedOn` — `type="date"`, domyślnie dziś, `min = earliestChangeDate(started_on okresu trwającego, dziś)`, `max = dziś`;
  - przy leku z rejestru radio `registryProductId` z wariantami tej samej nazwy i tego samego składu; bieżący wariant zaznaczony domyślnie.
- Stany ekranu bez formularza:
  - lek nieistniejący lub cudzy — 404;
  - lek odstawiony — komunikat i link do szczegółów (w tekście „zakończony”, nie „odstawiony”: rdzeń `odstaw` odpada w filtrze FR-012);
  - okres trwający rozpoczęty dziś — komunikat, że zmiana jest możliwa od jutra.
- React wstawiany z `client:load`.

#### 3. Szczegóły leku i teksty

**File**: `src/pages/leki/[id].astro`, `src/lib/copy/medications.ts`

**Intent**: Przycisk „Zmiana dawkowania” przy leku bieżącym, prowadzący do `/leki/<id>/zmiana-dawki`, oraz baner po `?zmieniono=1` (wzorzec „Dodano lek.” z listy).

**Contract**:

- Zapytania w `[id].astro` i `zmiana-dawki.astro` pobierają `discontinued_on`. Lek jest bieżący, gdy `discontinued_on` jest puste albo późniejsze niż `todayInWarsaw()` — ta sama reguła co `DP001` w SQL. Przycisk tylko przy leku bieżącym; ekran zmiany przy leku niebieżącym pokazuje stan „zakończony”.
- Nowa sekcja `MEDICATION_COPY.dosageChange` (tytuł, etykiety, podpowiedzi, stany bez formularza, przycisk).
- Nowe klucze `apiErrors`: `medicationDiscontinued`, `changeDateTooEarly`, `changeDateTooOld` (przy `DP007`: zmianę sprzed więcej niż 14 dni zapisuje się przez zakończenie leku i dodanie nowego), `changeDateInFuture`, `sameDose`, `variantNotAllowed`, `noCurrentPeriod`, `medicationNotFound`.
- Rzeczowniki zamiast trybu rozkazującego: „Zmiana dawkowania”, nie „Zmień dawkowanie” (rdzeń `zmień daw` odpada w filtrze i brzmi jak sugestia zmiany dawki); lek „zakończony”, nie „odstawiony”.
- Teksty neutralne. Nic nie sugeruje, że dawkę należy zmienić (FR-012) — opisują wyłącznie zapis zmiany już zaleconej. Wszystkie przechodzą filtr.

### Success Criteria:

#### Automated Verification:

- Kody błędów zmierzone: `error.code` z PostgREST dla `DP00x` zapisany w Notes przed spięciem mapy
- Testy przechodzą, w tym filtr FR-012 nowych tekstów: `npm test`
- Lint przechodzi: `npm run lint`
- Typy przechodzą: `npm run typecheck`
- Build przechodzi: `npm run build`
- Smoke przeciw lokalnemu Supabase przechodzi (`.env` odsunięty, nowy podgląd potwierdzony): `npm run smoke`

#### Manual Verification:

- Zmiana dawki z dzisiejszą datą: powrót do szczegółów z banerem, historia ma dwa okresy, lek nadal jedną pozycją na liście
- Zmiana z datą cofniętą o kilka dni zapisuje tę datę; data przed początkiem bieżącego okresu albo starsza niż 14 dni daje komunikat
- Ta sama dawka daje komunikat „już zapisane”; ta sama dawka z innym wariantem przechodzi
- Zmiana mocy leku z rejestru: nowy okres pokazuje nową moc, stary starą
- Lek dodany dziś: ekran mówi, że zmiana jest możliwa od jutra
- Po błędzie adres zawiera wyłącznie `?error=<klucz>` — ani dawki, ani daty
- Na telefonie formularz i komunikaty czytelne

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Testing Strategy

### Unit Tests:

- `lastDayOfPeriod`, `nextDay` i `earliestChangeDate` na granicach miesiąca, roku i roku przestępnego (`scripts/medications/medications.test.mjs`, w zakresie Strykera).
- Filtr FR-012 obejmuje automatycznie wszystkie nowe teksty `MEDICATION_COPY`.

### Integration Tests:

- `supabase/tests/dosage_change_checks.sql` — każda reguła `change_dosage` z nazwanym SQLSTATE i kontrprzykładem, w CI przez `npm run db:check`.
- Istniejące `rls_checks.sql`, `account_isolation_checks.sql`, `schema_invariants_checks.sql` i `npm run smoke` pilnują, że nowa kolumna i nowa wersja strażnika niczego nie zepsuły.

### Manual Testing Steps:

1. Dodaj lek z rejestru z dzisiejszą datą i sprawdź, że ekran zmiany mówi „od jutra”.
2. W lokalnej bazie przesuń `started_on` okresu (okno otwarte) o kilka dni wstecz, a potem zmień dawkę z dzisiejszą datą — historia pokazuje dwa okresy z poprawną datą „do”.
3. Zmień moc na inny wariant tej samej nazwy i sprawdź historię.
4. Sprawdź komunikaty: ta sama dawka, data za wczesna, data starsza niż 14 dni.
5. Sprawdź adres po każdym błędzie.

## Migration Notes

- Kolumna jest dopuszczalnie pusta, więc migracja nie wymaga przestoju. Istniejące okresy leków z rejestru dostają wariant leku z chwili dodania. Okresy z ulotki zostają bez wariantu — to prawda o tych danych, nie brak.
- Wycofanie kodu nie cofa migracji (ryzyko #3 planu testów). Kolumna i funkcja są addytywne, więc stara wersja aplikacji działa na nowym schemacie.

## References

- Roadmapa: `context/foundation/roadmap.md` (S-03, issue #14)
- PRD: US-04, FR-004, FR-012 w `context/foundation/prd.md`
- F-01: `context/archive/2026-09-22-medication-schema-rls/plan.md:44,61`
- S-02: `context/archive/2026-09-29-add-medication-with-interaction-flag/plan.md:145,306,649-652`
- Wzorzec zamknięcia i otwarcia okresu: `supabase/tests/rls_checks.sql:535-629`
- Checklista migracji: `context/foundation/test-plan.md` §6.2, §6.4
- Lekcje: „Zmiana dawki zamyka okres”, „Pusty zakres omija ograniczenie wykluczające”, „Bramka musi odróżnić blokadę od niewykonania”, „Żadna nazwa leku ani dawka w adresie URL”, „Niepełny zbiór reguł to co innego niż wyrzucone dane”

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Formularze leku — podpowiedź zamiast placeholdera, oznaczenie pól obowiązkowych

#### Automated

- [x] 1.1 Testy przechodzą, w tym filtr FR-012 tekstów leku i bramka kolorów: `npm test` — e652cdc
- [x] 1.2 Lint przechodzi: `npm run lint` — e652cdc
- [x] 1.3 Typy przechodzą: `npm run typecheck` — e652cdc
- [x] 1.4 Żaden formularz leku nie ma placeholdera: `grep -rn "placeholder" src/components/medications` nie zwraca nic — e652cdc

#### Manual

- [x] 1.5 Na `/leki/nowy` i `/leki/nowy/z-ulotki` puste pole wygląda na puste, a przykład stoi pod nim — e652cdc
- [x] 1.6 Każde pole obowiązkowe ma przy etykiecie „(obowiązkowe)”, także legenda wariantu — e652cdc
- [x] 1.7 Czytnik ekranu (VoiceOver) odczytuje etykietę z dopiskiem i podpowiedź przy polu dawki — e652cdc

### Phase 2: Baza — wariant przy okresie i funkcja zmiany dawki

#### Automated

- [x] 2.1 Migracje wchodzą od zera: `npx supabase db reset` — 2da1cc5
- [x] 2.2 Wszystkie sprawdzenia SQL przechodzą, w tym nowy plik: `npm run db:check` — 2da1cc5
- [x] 2.3 Sondy CI nadal padają tam, gdzie powinny (krok „SQL checks” w `.github/workflows/ci.yml` uruchomiony lokalnie) — 2da1cc5
- [x] 2.4 Typy przechodzą: `npm run typecheck` — 2da1cc5
- [x] 2.5 Testy przechodzą: `npm test` — 2da1cc5

#### Manual

- [x] 2.6 Wynik pomiaru wariantów zapisany w `change.md` (Notes) — 2da1cc5
- [x] 2.7 Przegląd nagłówka migracji: opis z przykładami zrozumiały bez czytania SQL — 2da1cc5

### Phase 3: Historia okresów na szczegółach leku

#### Automated

- [x] 3.1 Testy jednostkowe dat i filtr FR-012 przechodzą: `npm test` — dfad9b0
- [x] 3.2 Lint przechodzi: `npm run lint` — dfad9b0
- [x] 3.3 Typy przechodzą: `npm run typecheck` — dfad9b0

#### Manual

- [x] 3.4 Lek z dwoma okresami (wstawionymi przez `change_dosage` w lokalnej bazie) pokazuje oba, najnowszy na górze, z datą „do” o dzień wcześniejszą niż początek nowego — dfad9b0
- [x] 3.5 Lek z jednym okresem pokazuje jeden wpis „od …” — dfad9b0
- [x] 3.6 Lek z ulotki nie pokazuje wariantu przy okresach — dfad9b0
- [x] 3.7 Na telefonie (szerokość ~375 px) historia czyta się bez poziomego przewijania — dfad9b0

### Phase 4: Ekran i trasa zmiany dawki

#### Automated

- [x] 4.1 Kody błędów zmierzone: `error.code` z PostgREST dla `DP00x` zapisany w Notes przed spięciem mapy — abd2986
- [x] 4.2 Testy przechodzą, w tym filtr FR-012 nowych tekstów: `npm test` — abd2986
- [x] 4.3 Lint przechodzi: `npm run lint` — abd2986
- [x] 4.4 Typy przechodzą: `npm run typecheck` — abd2986
- [x] 4.5 Build przechodzi: `npm run build` — abd2986
- [x] 4.6 Smoke przeciw lokalnemu Supabase przechodzi (`.env` odsunięty, nowy podgląd potwierdzony): `npm run smoke` — abd2986

#### Manual

- [x] 4.7 Zmiana dawki z dzisiejszą datą: powrót do szczegółów z banerem, historia ma dwa okresy, lek nadal jedną pozycją na liście — abd2986
- [x] 4.8 Zmiana z datą cofniętą o kilka dni zapisuje tę datę; data przed początkiem bieżącego okresu albo starsza niż 14 dni daje komunikat — abd2986
- [x] 4.9 Ta sama dawka daje komunikat „już zapisane”; ta sama dawka z innym wariantem przechodzi — abd2986
- [x] 4.10 Zmiana mocy leku z rejestru: nowy okres pokazuje nową moc, stary starą — abd2986
- [x] 4.11 Lek dodany dziś: ekran mówi, że zmiana jest możliwa od jutra — abd2986
- [x] 4.12 Po błędzie adres zawiera wyłącznie `?error=<klucz>` — ani dawki, ani daty — abd2986
- [x] 4.13 Na telefonie formularz i komunikaty czytelne — abd2986
