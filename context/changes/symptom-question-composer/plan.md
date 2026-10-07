# S-06: Złożone pytanie do lekarza po zapisaniu objawu — plan wdrożenia

## Overview

Po zapisaniu wpisu w dzienniczku użytkowniczka widzi gotowe pytanie do lekarza dla każdego objawu z wpisu (US-02, FR-010, FR-012, roadmapa S-06, issue #17). Pytanie zestawia objaw z okresami dawkowania: na górze leki rozpoczęte, zmienione lub odstawione w oknie czasowym objawu, ułożone według dat; pod zwinięciem pozostałe leki przyjmowane w tym czasie. Pytanie kończy się formułą „może mieć związek”.

Przed pytaniem plasterek domyka dług z S-05 (plan-review F5): zmianę dawki zapisaną przez pomyłkę da się cofnąć w oknie korekty. Bez tego pytanie pokazywałoby na górze zmianę, której nie było.

## Current State Analysis

- **Po zapisie wpisu** przeglądarka idzie na `/dzienniczek?dodano=<uuid>` (`src/components/journal/NewEntryForm.tsx:79`). Strona znajduje wpis w pełnej liście i pokazuje baner „Zapisano wpis: {objawy}…” (`src/pages/dzienniczek/index.astro:84-117`). Pytania do lekarza nie ma; plan S-05 zostawił je dla S-06.
- **Dane dzienniczka:** `symptom_entries(id, user_id, occurred_at timestamptz, note, created_at)` i `symptom_entry_items(entry_id, symptom_id, severity)` (`supabase/migrations/20261005130000_symptom_journal.sql:57-89`). RLS tylko dla `authenticated`. Nazwy objawów z `public.symptoms.name` (`20260926120000_symptom_catalog_schema.sql:15-52`), zapisane małą literą; ekran podnosi pierwszą literę klasą CSS.
- **Dane leków:** `medications` nie ma daty rozpoczęcia. Początek leku to `min(dosage_periods.started_on)` (`src/pages/leki/index.astro:89-95`). Okres: `started_on`, `ended_on` (wyłączne, `'[)'`), `dose_text`, `registry_product_id` (`20260922120000_medication_schema.sql:71-94`, `20261004120000_dosage_change.sql:61-62`). Zmiana dawki zamyka okres i otwiera nowy (`change_dosage`). Odstawienie zapisuje `medications.discontinued_on` (pierwszy dzień bez leku), a wyzwalacz zamyka ostatni okres tą datą (`20261006120000_discontinue_medication.sql:232-280`). Lek usunięty jako pomyłka znika z kaskadą (`delete_medication`, `:673-713`).
- **Dług DP010:** `correct_dosage_period` odrzuca poprawę dawki na taką jak w okresie sąsiednim (`20261005140000_correct_dosage_period.sql:101-130`). Zmiana zapisana przy złym leku zostaje więc w historii na zawsze. Usunięcie okresu pyta o okno korekty **leku**, nie okresu (`20261005120000_correction_window.sql:228-250`), więc po 24 h od dodania leku świeżego okresu nie da się usunąć.
- **Bramki FR-012:** filtr rdzeni `forbiddenWordsIn` i `REQUIRED_WORDING` (`scripts/rpl/pairs.mjs:24-78`). Każdy moduł tekstów ma własny, ręcznie dopisany test w `scripts/fr012/*-copy.test.mjs`; nic nie skanuje nowego modułu samo. Złożonego zdania (z wstawionymi nazwami i datami) nie sprawdza dziś nic. Test kolejności istnieje tylko dla listy leków (`scripts/medications/medications.test.mjs:26-43`).
- **Wzorce:** czyste helpery bez klienta Supabase w `src/lib/services/*.ts`, testowane przez `node --experimental-strip-types --test` (`scripts/journal/journal.test.mjs`). Odczyt z bazy w frontmatterze stron albo w module przyjmującym `SupabaseClient` (`src/lib/services/registry-search.ts:29`). Teksty jako obiekt `as const` z samymi napisami i znacznikami `{…}` (`src/lib/copy/journal.ts`). Pomocnicze daty: `todayInWarsaw`, `formatIsoDate`, prywatne `addDays` (`src/lib/services/medications.ts:45-109`).

## Desired End State

- Po zapisie wpisu, pod banerem „Zapisano wpis…”, jest sekcja „Pytanie do lekarza”: osobne pytanie dla każdego objawu wpisu, pierwsze rozwinięte, pozostałe zwinięte pod nazwą objawu. Pytanie składa się od nowa przy każdym otwarciu strony, z bieżących danych.
- Wygląd pytania (dane przykładowe):

  ```
  Ból głowy
  pierwszy wpis 01.09.2026, ostatni 06.10.2026 (5 wpisów)

  Zmiany w lekach w tym czasie i do 90 dni wcześniej:
  • Od 01.07.2026 biorę lek Apap, 1 tabletka.
  • Od 03.09.2026 nie biorę leku Ibuprom.
  • Od 20.09.2026 biorę lek Euthyrox 75 µg, zamiast 50 µg.

  Czy ból głowy może mieć związek z którymś z tych leków?

  ▸ Pozostałe leki (1)
  ```

- Gdy w oknie nie było zmian, zamiast listy zmian jest zdanie „W tym czasie i do 90 dni wcześniej nie było zmian w lekach.”, rozwinięta lista przyjmowanych leków i pytanie o przyjmowane leki.
- Gdy w oknie nie było żadnego leku, pytanie dla tego objawu nie powstaje. Jeśli nie powstaje dla żadnego objawu wpisu, sekcja pokazuje jedną linijkę wyjaśniającą, kiedy pytanie powstaje.
- Na szczegółach leku przy najnowszym okresie powstałym ze zmiany dawki, w jego oknie korekty, jest „Cofnij zmianę dawki (do …)”. Po potwierdzeniu okres znika, a poprzedni trwa dalej bez daty końca.
- Weryfikacja: `npm test`, `npm run lint`, `npm run typecheck`, `npx supabase db reset` + `npm run db:check`, `npm run smoke` przeciw lokalnej bazie, ręczne przejście na telefonie.

### Key Discoveries:

- `discontinued_on` i `ended_on` są wyłączne: pierwszy dzień bez leku. Zdanie „Od {data} nie biorę leku {lek}.” używa tej daty wprost (roadmapa: „od 3 marca nie przyjmuję X”), bez `lastDayOfPeriod`.
- Zmiana samego wariantu (mocy) przy tym samym `dose_text` jest prawdziwą zmianą (DP004 porównuje dawkę i wariant, `20261004120000_dosage_change.sql:318-323`). Zdanie o zmianie musi wtedy pokazać moc, inaczej brzmi „1 tabletka → 1 tabletka”. Etykieta wariantu: `variantText` w `src/pages/leki/[id].astro:132-139`.
- Wyzwalacz `medications_sync_discontinuation` pisze do okresów na głębokości wyzwalacza 2, a strażnik okresów ma wyjątek `pg_trigger_depth() > 1` (`20261006120000_discontinue_medication.sql:357-369`). Wyjątek przepuszcza zapis, gdy jednocześnie: głębokość > 1, okres jest najnowszy w leku i nowe `ended_on` równa się `discontinued_on` leku (przy leku niezakończonym oba puste). Ponowne otwarcie poprzednika przez wyzwalacz `AFTER DELETE` spełnia ten warunek bez zmian: po usunięciu najnowszego okresu poprzednik staje się najnowszy. Komentarz w liniach 355-356 każe dopisywać nowe wyzwalacze do tego warunku świadomie — wystarczy dopisać nowy wyzwalacz w komentarzu.
- `schema_invariants_checks.sql`, niezmiennik 7, sam znajduje funkcje `security definer` w `public` i sprawdza `search_path` oraz brak `EXECUTE` — nowa funkcja nie wymaga wpisu. Niezmiennik 8 to ręczna lista wyzwalaczy strażników `BEFORE`; wyzwalacz `AFTER DELETE` ponownego otwarcia nie jest strażnikiem i tam nie trafia.
- Okno korekty okresu liczy gotowa funkcja `public.dosage_period_correction_window_open(p_period_id)` (`20261005120000_correction_window.sql:133-159`).
- Filtr `forbiddenWordsIn` szuka podciągów w całym napisie, także w znacznikach. Brzmienie z roadmapy „nie przyjmuję” trafia w rdzeń `nie przyjmuj`, a znacznik `{dawka}` w rdzeń `dawk` (pomiar w plan-review, F1). `medication-copy.test.mjs:14` ma jawny wyjątek na `dawk`; teksty pytania go nie potrzebują: zdania o zdarzeniach mają postać „Od {data} biorę lek / nie biorę leku {lek}”, a znacznik ilości nazywa się `{ilość}`. Słowo „lek” przed nazwą przyjmuje odmianę, bo nazwy preparatu kod nie odmienia. Nowy test nie ma wyjątków.

## What We're NOT Doing

- **Zapisu pytania w bazie.** Pytanie jest przeliczane przy każdym wyświetleniu. Nie powstaje tabela, więc S-09 nie ma czego kasować, a poprawka wpisu w S-07 trafia do pytania sama.
- **Zakładki „Do omówienia z lekarzem”.** To S-08. S-08 użyje tego samego modułu składania pytania.
- **Osobnego ekranu wpisu ani pytania przy starszych wpisach na liście.** Pytanie widać zaraz po zapisie; stały dostęp daje S-08.
- **Stronicowania dzienniczka (follow-up F8 z S-05).** Ta zmiana nie dokłada niczego do kart na liście; pytanie czyta tylko zapisany wpis.
- **Informacji o kolizjach w pytaniu.** Składanie pytania nie dostaje danych o parach leków, więc nie może od nich zależeć kolejność.
- **Odmiany nazw leków przez przypadki.** Nazwy z rejestru stoją w mianowniku po dwukropku.
- **Ustawienia długości okna.** 90 dni to stała w kodzie (PRD, pytanie 4).
- **Cofnięcia starszej zmiany niż najnowsza ani zmiany przy leku zakończonym.** Cofnąć można tylko najnowszy okres w jego oknie korekty, przy leku nie zakończonym; najpierw cofa się zakończenie.
- **Poluzowania DP010.** Poprawa na dawkę z okresu sąsiedniego nadal jest odrzucana; komunikat wskazuje cofnięcie zmiany.

## Implementation Approach

1. Najpierw baza i ekran cofnięcia zmiany, bo pytanie daje pierwszeństwo zmienionym lekom i nie może pokazać zmiany, której nie było.
2. Potem czysta funkcja składania pytania i jego teksty, testowane bez bazy (dobra faza na `/10x-tdd`: pierwszą padającą asercję da się nazwać z góry).
3. Na końcu odczyt danych, wyświetlenie po zapisie wpisu, smoke i dopisanie ustaleń do PRD i roadmapy.

Reguła okna (wspólna dla faz 2 i 3, z datami w czasie polskim):

- `dataWpisu` = dzień bieżącego wpisu (`occurred_at` w strefie Europe/Warsaw).
- `pierwszyWpis` = dzień najwcześniejszego wpisu z tym objawem spośród wpisów z `occurred_at` ≤ bieżący wpis (wlicza bieżący).
- `początekOkna` = `pierwszyWpis` − 90 dni. Okno = od `początekOkna` do `dataWpisu`, obie granice włącznie. Przykład: pierwszy wpis 01.09.2026 → okno od 03.06.2026.
- Zdarzenia leku: początek (`started_on` pierwszego okresu), zmiana (`started_on` każdego kolejnego okresu, z dawką poprzednią i nową), odstawienie (`discontinued_on`). Zdarzenie jest w oknie, gdy `początekOkna` ≤ data ≤ `dataWpisu`. Zdarzenia po bieżącym wpisie się nie liczą.
- Lek przyjmowany w oknie: jakikolwiek jego okres zachodzi na okno (`started_on` ≤ `dataWpisu` i (`ended_on` puste albo `ended_on` > `początekOkna`)).
- Góra: wszystkie zdarzenia w oknie, rosnąco po dacie; przy tej samej dacie alfabetycznie po nazwie leku (polskie sortowanie). Pozostałe leki: przyjmowane w oknie bez zdarzenia w oknie, alfabetycznie, z datą początku i dawką obowiązującą w `dataWpisu`.
- Brak leku przyjmowanego w oknie → pytanie nie powstaje (`null`).

## Critical Implementation Details

- **Cofnięcie zmiany jest regułą bazy, nie tylko RPC.** Zgodnie z lekcją „Ograniczenie na tabeli podrzędnej nie chroni…” ta sama reguła obowiązuje bezpośredni `delete from dosage_periods` przez PostgREST. RPC dokłada nazwane kody błędów. Ponowne otwarcie poprzedniego okresu (`ended_on` → `null`) musi być osiągalne wyłącznie jako skutek tego usunięcia, nigdy samodzielnym `update` na zamkniętym okresie.
- **Strefa czasowa.** `occurred_at` 23:30 UTC to już następny dzień w Polsce. Data wpisu zawsze przez `todayInWarsaw(new Date(occurred_at))`, nigdy `occurred_at.slice(0, 10)`.

## Phase 1: Cofnięcie zmiany dawki

### Overview

Najnowszy okres powstały ze zmiany dawki da się usunąć w jego oknie korekty (24 h od zapisu okresu); poprzedni okres staje się znów trwający. Domyka dług DP010 z roadmapy (S-06, „Dług przejęty z S-05”).

### Changes Required:

#### 1. Migracja cofnięcia zmiany

**File**: `supabase/migrations/20261007120000_undo_dosage_change.sql`

**Intent**: Zmienić strażnika usuwania okresu, dodać ponowne otwarcie poprzedniego okresu jako skutek usunięcia i RPC z nazwanymi błędami. Komentarze po angielsku, komunikaty błędów po polsku, jak w poprzednich migracjach.

**Contract**:

- `dosage_periods_guard_delete`: poza dotychczasowymi przypadkami (kaskada, otwarte okno leku) przepuszcza usunięcie okresu, gdy jednocześnie: okno korekty **tego okresu** jest otwarte (`dosage_period_correction_window_open`), okres jest najnowszy w leku, ma poprzednika i lek nie jest zakończony (`discontinued_on` puste). W pozostałych przypadkach komunikat jak dziś.
- Wyzwalacz `AFTER DELETE` na `dosage_periods` (nazwa np. `dosage_periods_reopen_previous`, `security definer`, `search_path = ''`, bez `EXECUTE` dla `anon`/`authenticated`): gdy usunięty okres miał poprzednika z `ended_on = usunięty.started_on` i lek nadal istnieje, ustawia poprzednikowi `ended_on = null`. Przy kaskadzie z usunięcia leku nic nie robi.
- `dosage_periods_guard_core`: bez nowego wyjątku — ponowne otwarcie przechodzi przez istniejący (Key Discoveries). Zmiana wyłącznie w komentarzu nad warunkiem: wymienić `dosage_periods_reopen_previous` obok `medications_sync_discontinuation`. Samodzielny `update ... set ended_on = null` (głębokość 1) na zamkniętym okresie dalej odrzucany.
- RPC `public.undo_dosage_change(p_period_id uuid) returns void`, `security invoker`, `EXECUTE` tylko dla `authenticated`. Okno sprawdza przez `dosage_period_correction_window_open`. Błędy w tej kolejności: `28000` brak sesji; `DP008` nie ma takiego okresu na koncie; `DP011` okres jest pierwszym okresem leku (to początek leku, nie zmiana — pomyłkę usuwa się przez usunięcie leku); `DP012` okres nie jest najnowszy; `DP013` lek jest zakończony; `DP009` okno korekty okresu zamknięte. Blokuje lek (`for update`) przed sprawdzeniami, potem `delete` okresu.
- Komunikat `DP010` w `correct_dosage_period` (tekst wyjątku) wskazuje cofnięcie zmiany zamiast „nie da się jeszcze zapisać”.

#### 2. Bramki SQL

**File**: `supabase/tests/dosage_undo_checks.sql`

**Intent**: Dowieść reguły na obu ścieżkach (RPC i bezpośredni zapis), łapiąc nazwane kody, nie `when others` (lekcja „Bramka musi odróżnić blokadę od niewykonania”).

**Contract**:

- Nowy plik w strukturze istniejących (`begin … rollback`, `\set ON_ERROR_STOP on`, helpery `pg_temp.*`, `backdate`, znacznik `GATE_COMPLETE dosage_undo_checks.sql`). Przypadki:
  - cofnięcie świeżej zmiany: okres znika, poprzednik ma `ended_on is null`, lek ma jeden trwający okres;
  - `DP011` dla pierwszego okresu, `DP012` dla okresu nie najnowszego, `DP013` przy leku zakończonym, `DP009` po cofnięciu `created_at` okresu o 25 h, `DP008` dla okresu innego konta;
  - bezpośredni `delete` najnowszego okresu w jego oknie (lek starszy niż 24 h) przechodzi i otwiera poprzednika; ten sam `delete` po zamknięciu okna jest odrzucany komunikatem strażnika;
  - bezpośredni `update ... set ended_on = null` na zamkniętym poprzedniku, bez usuwania, jest odrzucany;
  - usunięcie leku w oknie nadal kasuje wszystkie okresy (kaskada nie uruchamia ponownego otwarcia).
- `schema_invariants_checks.sql` bez zmian: niezmiennik 7 obejmie nowy wyzwalacz sam (`search_path = ''` w kontrakcie migracji), a do niezmiennika 8 wyzwalacz `AFTER DELETE` nie należy.

#### 3. Trasa, ekran i teksty

**File**: `src/pages/api/medications/[id]/periods/[periodId]/undo.ts`, `src/pages/leki/[id]/okresy/[periodId]/cofniecie.astro`, `src/pages/leki/[id].astro`, `src/lib/copy/medications.ts`

**Intent**: Dać użytkowniczce przycisk cofnięcia w miejscu, gdzie dziś jest „Popraw dawkę”, z ekranem potwierdzenia, który mówi, co się stanie.

**Contract**:

- Szczegóły leku: przy najnowszym okresie, który nie jest pierwszym, ma otwarte okno korekty, a lek nie jest zakończony — odnośnik „Cofnij zmianę dawki (do {do})” obok „Popraw dawkę”.
- Ekran potwierdzenia: okres od {data} z dawką {nowa} zniknie, dawka {poprzednia} będzie obowiązywać dalej bez daty końca. Formularz POST, wzorzec `poprawa.astro`.
- Trasa: `POST`, `prerender = false`, zod na `id` i `periodId` jako uuid, `supabase.rpc("undo_dosage_change")`, mapa kodów `DP008/DP009/DP011/DP012/DP013` na klucze tekstów, w logach tylko `error.code`. Po sukcesie przekierowanie na `/leki/<id>` z komunikatem o cofnięciu, według wzorca istniejących komunikatów po zmianie dawki. W URL tylko uuid.
- Teksty w `MEDICATION_COPY` (pokrywa je istniejący `medication-copy.test.mjs`); `sameAsAdjacentPeriod` wskazuje cofnięcie zmiany.

#### 4. Smoke

**File**: `scripts/smoke.mjs`

**Intent**: Sprawdzić cofnięcie przez prawdziwą trasę.

**Contract**: krok: zmiana dawki → POST cofnięcia → przekierowanie, lek ma jeden trwający okres z poprzednią dawką; drugi POST cofnięcia tego samego leku (teraz pierwszy okres) → komunikat błędu `DP011`, bez 5xx.

### Success Criteria:

#### Automated Verification:

- Migracje wchodzą czysto: `npx supabase db reset`
- Bramki SQL przechodzą, w tym nowy plik z `GATE_COMPLETE`: `npm run db:check`
- Testy jednostkowe i filtr FR-012 tekstów leków: `npm test`
- Lint i typy: `npm run lint` i `npm run typecheck`
- Smoke z krokiem cofnięcia przeciw lokalnej bazie: `npm run smoke`

#### Manual Verification:

- Na telefonie: zmiana dawki → „Cofnij zmianę dawki” → potwierdzenie → historia leku ma jeden trwający okres z poprzednią dawką
- Przy leku zakończonym i przy pierwszym okresie odnośnika cofnięcia nie ma
- Poprawa dawki na wartość z poprzedniego okresu pokazuje nowy komunikat wskazujący cofnięcie

**Implementation Note**: Po automatycznej weryfikacji zatrzymaj się na ręczne potwierdzenie przed fazą 2.

---

## Phase 2: Składanie pytania

### Overview

Czysta funkcja, która z wpisów objawu i historii leków składa pytanie, oraz moduł tekstów. Bez bazy i bez ekranu.

### Changes Required:

#### 1. Typy

**File**: `src/types.ts`

**Intent**: Wspólne typy wejścia i wyniku, żeby S-08 użył tych samych.

**Contract**:

- `DoctorQuestionMedication`: `id`, `name` (`product_name`), `discontinuedOn: string | null`, `periods: { startedOn, endedOn: string | null, doseText, strength: string | null, pharmaceuticalForm: string | null }[]`.
- `DoctorQuestionEvent`: `date`, `kind: "start" | "change" | "stop"`, `medicationName`, `dose?`, `previousDose?` (gdy sama dawka jest identyczna — z tą częścią wariantu, która się zmieniła: „1 tabletka (Moc: 75 µg)”).
- Ustalenia z autorką przy fazie 2 (06.10.2026): (1) odstawienie z datą równą `początekOkna` jest zdarzeniem w oknie i trafia na górę, nawet gdy w oknie nie było już ani jednego dnia z lekiem — pytanie wtedy powstaje; (2) w „Pozostałych lekach” `since` to początek okresu obowiązującego w `dataWpisu`, nie początek leku („od {data}, {ilość}” ma być prawdą); (3) przy zmianie samej mocy lub postaci zdanie pokazuje tylko zmienioną część wariantu, więc odczyt w fazie 3 przekazuje moc i postać osobno.
- `DoctorQuestion`: `symptomName`, `firstEntryOn`, `entryOn`, `entryCount`, `windowStart`, `events: DoctorQuestionEvent[]`, `otherMedications: { name, since, dose }[]`.
- Brak pola o kolizjach i jakiejkolwiek ocenie — typ wejścia nie zna par leków.

#### 2. Składanie pytania

**File**: `src/lib/services/doctor-question.ts`, `src/lib/services/medications.ts`

**Intent**: Zaimplementować regułę okna z „Implementation Approach”. Bez importów `@/` i bez klienta Supabase, jak `journal.ts`.

**Contract**:

- `export const QUESTION_WINDOW_DAYS = 90`.
- `composeDoctorQuestion(input: { symptomName: string; entryOccurredAt: string; symptomOccurrences: string[]; medications: DoctorQuestionMedication[] }): DoctorQuestion | null`. `symptomOccurrences` to `occurred_at` wszystkich wpisów z tym objawem; funkcja sama odrzuca późniejsze niż bieżący wpis. Wynik nie zależy od kolejności tablic wejściowych.
- `doctorQuestionText(question: DoctorQuestion): { heading, summary, eventsIntro, events: string[], question, othersLabel, others: string[], note }` — gotowe napisy z szablonów `DOCTOR_QUESTION_COPY`, daty `DD.MM.YYYY` przez `formatIsoDate`. Ekran tylko wstawia te napisy.
- `medications.ts`: eksport `addDays` (dziś prywatne) i przeniesienie `variantText` z `src/pages/leki/[id].astro` do serwisu, żeby obie strony używały jednej etykiety wariantu.

#### 3. Teksty

**File**: `src/lib/copy/doctor-question.ts`

**Intent**: Wszystkie napisy pytania jako szablony ze znacznikami, bez funkcji.

**Contract**: obiekt `DOCTOR_QUESTION_COPY as const` z kluczami m.in.: `sectionTitle` („Pytanie do lekarza”), `summaryOne` („wpis {data}”), `summaryMany` („pierwszy wpis {od}, ostatni {do} ({liczba} {wpisy})”), formy liczby `entriesFew`/`entriesMany` („wpisy”/„wpisów”), `eventsIntro` („Zmiany w lekach w tym czasie i do 90 dni wcześniej:”), `eventStart` („Od {data} biorę lek {lek}, {ilość}.”), `eventChange` („Od {data} biorę lek {lek} {po}, zamiast {przed}.”), `eventStop` („Od {data} nie biorę leku {lek}.”), `noEvents` („W tym czasie i do 90 dni wcześniej nie było zmian w lekach.”), `questionOne`/`questionMany` („Czy {objaw} może mieć związek z tym lekiem?” / „…z którymś z tych leków?”), `questionTakenOne`/`questionTakenMany` (wersje o przyjmowanych lekach), `othersLabel` („Pozostałe leki ({liczba})”), `takenLabel` („Przyjmowane leki:”), `otherItem` („{lek} — od {data}, {ilość}”), `note` (stała nota: zestawienie dat, nie ocena; o każdy lek i objaw można zapytać lekarza lub farmaceutę), `noQuestion` (kiedy pytanie powstaje), `loadError`. Ostateczne brzmienie przechodzi filtr i asercję formuły.

#### 4. Testy

**File**: `scripts/doctor-question/doctor-question.test.mjs`, `scripts/fr012/doctor-question-copy.test.mjs`, `stryker.config.json`

**Intent**: Oczekiwane wyniki z PRD i ustaleń, nie z kodu. Daty w fixture'ach z rokiem, `TZ=UTC`.

**Contract**:

- Granice okna: zdarzenie dokładnie w `początekOkna` jest na górze, dzień wcześniej nie; zdarzenie w `dataWpisu` jest na górze, dzień później nie (lek trafia do pozostałych z dawką z `dataWpisu`).
- Przykład z planowania: pierwszy wpis 01.09.2026 → `windowStart` 03.06.2026.
- Lek odstawiony przed oknem i lek rozpoczęty po wpisie: nie ma ich nigdzie.
- Wpis wsteczny wcześniejszy niż dotychczasowy pierwszy: staje się pierwszym; wpis późniejszy niż bieżący nie przesuwa okna.
- Strefa: `occurred_at` `2026-10-05T22:30:00Z` to wpis z 06.10.2026.
- Brak leku w oknie → `null`; leki w oknie bez zdarzeń → `events` puste, `otherMedications` pełne.
- Zmiana samej mocy: zdanie o zmianie zawiera etykietę wariantu.
- Kolejność: przetasowanie tablic wejściowych nie zmienia wyniku; ta sama data → alfabetycznie po nazwie.
- FR-012 (copy test): każdy napis modułu przez `forbiddenWordsIn` bez wyjątków; `questionOne`, `questionMany`, `questionTakenOne`, `questionTakenMany` zawierają `REQUIRED_PHRASE`.
- FR-012 (złożony tekst): `doctorQuestionText` dla kilku fixture'ów — każdy napis przechodzi filtr, pytanie zawiera `REQUIRED_PHRASE`.
- `stryker.config.json`: `src/lib/services/doctor-question.ts` na liście `mutate`.

### Success Criteria:

#### Automated Verification:

- Testy składania pytania i filtr FR-012 przechodzą: `npm test`
- Lint i typy: `npm run lint` i `npm run typecheck`

#### Manual Verification:

- Bieg mutacyjny na `doctor-question.ts` (`npm run test:mutation`) nie zostawia żywych mutantów w regule okna i kolejności; żywe mutanty opisane albo zabite testem
- Autorka czyta wygenerowane pytania z fixture'ów testu i potwierdza brzmienie

**Implementation Note**: Po automatycznej weryfikacji zatrzymaj się na ręczne potwierdzenie przed fazą 3.

---

## Phase 3: Pytanie na ekranie po zapisie

### Overview

Odczyt danych do pytania, wyświetlenie pod banerem „Zapisano wpis…”, smoke, dopisanie ustaleń do PRD i roadmapy.

### Changes Required:

#### 1. Odczyt danych

**File**: `src/lib/services/doctor-question-data.ts`

**Intent**: Odczyt danych do pytań jednego wpisu (S-06). Przyjmuje klienta, jak `registry-search.ts`. Sposób odczytu dla S-08 ustala plan S-08 (Faza 3 §4).

**Contract**: `loadDoctorQuestions(supabase: SupabaseClient, entryId: string): Promise<{ questions: DoctorQuestion[]; skippedSymptoms: number } | { error: true }>`. Trzy zapytania przez RLS:

- wpis po `id` z objawami (`symptom_entry_items(symptom_id, symptoms(name))`);
- `occurred_at` wpisów z tymi objawami (`symptom_entry_items` z `symptom_entries!inner(occurred_at)`, filtr po `symptom_id`);
- leki z okresami i wariantem (`medications(id, product_name, discontinued_on, dosage_periods(started_on, ended_on, dose_text, registry_products(strength, pharmaceutical_form)))`).

Pytania w kolejności objawów jak na karcie wpisu (alfabetycznie). Przy błędzie log tylko `{ code }`.

#### 2. Ekran

**File**: `src/pages/dzienniczek/index.astro`

**Intent**: Pod banerem zapisanego wpisu sekcja „Pytanie do lekarza”.

**Contract**:

- Tylko gdy `dodano` wskazuje wpis z listy.
- Każde pytanie w `<details>`, pierwsze z `open`, `summary` = nazwa objawu.
- Zmiany jako lista, pytanie, „Pozostałe leki” w zagnieżdżonym `<details>`. Przy braku zmian lista przyjmowanych leków bez zwijania.
- Stała nota pod pytaniami. Przy `questions` pustym — `noQuestion`. Przy błędzie odczytu — `loadError`; baner zapisu zostaje.
- Kolory wyłącznie tokenami, bez `destructive*` i bez `interaction*` (to nie jest informacja o kolizji).
- Komentarz w nagłówku strony „Nothing here links a symptom to a medication” zaktualizowany.

#### 3. Smoke

**File**: `scripts/smoke.mjs`

**Intent**: Dowód, że pytanie dociera do wyrenderowanej strony.

**Contract**: po kroku zapisu wpisu, przy leku dodanym w smoke: strona `?dodano=<id>` zawiera `DOCTOR_QUESTION_COPY.sectionTitle`, nazwę leku i `REQUIRED_PHRASE`. Adres i przekierowania nie zawierają nazwy objawu ani leku (istniejące sprawdzenie URL rozszerzone o nazwę leku).

#### 4. Dokumenty

**File**: `context/foundation/prd.md`, `context/foundation/roadmap.md`

**Intent**: Dopisać ustalenia jawnie (lekcja „Otwarte pytanie może kryć niezadaną decyzję”).

**Contract**:

- PRD US-02 i FR-010: pytanie nie powstaje, gdy w oknie objawu nie było przyjmowanego leku; pod zwinięciem tylko leki przyjmowane w oknie bez zdarzenia; brak zmian w oknie daje pytanie o przyjmowane leki; pytanie przeliczane przy wyświetleniu.
- PRD pytanie 4 i roadmapa S-06 (wymogi okna): przykład zdania o odstawieniu „od 3 marca nie przyjmuję X” zamienić na „Od 03.03.2026 nie biorę leku X.” z dopiskiem, że „nie przyjmuję” trafia w rdzeń filtra FR-012 `nie przyjmuj`.
- Roadmapa S-06: pytanie o przeliczanie rozstrzygnięte (przeliczane), dług DP010 zamknięty cofnięciem zmiany. S-07: przeliczanie spełnia „pytanie idzie za poprawionym wpisem”. S-08: sposób odczytu danych ustali plan S-08 (S-08 zbiera objawy z różnych wpisów, a `loadDoctorQuestions` czyta jeden wpis). Uwaga dla planu S-08: zapytanie o wszystkie wpisy obcina limit `max_rows = 1000` (`supabase/config.toml:18`); przy sortowaniu od najnowszego odpada najstarszy wpis, który wyznacza początek okna 90 dni (plan-review S-06, F3).

### Success Criteria:

#### Automated Verification:

- Testy jednostkowe: `npm test`
- Lint i typy: `npm run lint` i `npm run typecheck`
- Build: `npm run build`
- Smoke z krokiem pytania przeciw lokalnej bazie (stary podgląd zatrzymany, `.env` odsunięty): `npm run smoke`

#### Manual Verification:

- Na telefonie: wpis z jednym objawem przy lekach ze zmianą w oknie — pytanie zgodne z podglądem z planu
- Wpis z trzema objawami: trzy pytania, pierwsze rozwinięte, pozostałe zwinięte pod nazwą objawu
- Konto bez leków w oknie: wpis zapisuje się, widać linijkę `noQuestion`, pytania brak
- Leki bez zmian w oknie: zdanie o braku zmian i rozwinięta lista przyjmowanych leków
- Cofnięcie zmiany dawki (faza 1), potem ponowne otwarcie strony wpisu: zmiana znika z pytania
- Tryb ciemny: sekcja czytelna, nic nie wygląda jak alarm
- Autorka czyta pytania na ekranie i potwierdza, że żadne nie stwierdza przyczyny ani nie porządkuje leków według podejrzenia

**Implementation Note**: Po automatycznej weryfikacji zatrzymaj się na ręczne potwierdzenie.

---

## Testing Strategy

### Unit Tests:

- Reguła okna i kolejność w `composeDoctorQuestion` (faza 2) — granice dat, strefa, wpisy wsteczne, zmiana wariantu, przetasowane wejście.
- FR-012 na szablonach i na złożonym tekście (faza 2).

### Integration Tests:

- `dosage_undo_checks.sql` — reguła cofnięcia na ścieżce RPC i bezpośredniego zapisu (faza 1).
- Smoke: cofnięcie zmiany przez trasę (faza 1), pytanie na stronie po zapisie (faza 3).

### Manual Testing Steps:

1. Dodaj Apap i Euthyrox, zmień dawkę Euthyroxu, zapisz ból głowy — Euthyrox i Apap na górze, daty rosnąco.
2. Cofnij zmianę dawki, odśwież stronę wpisu — zmiana znika, Euthyrox zostaje (początek w oknie).
3. Zapisz wpis z trzema objawami — trzy osobne pytania.
4. Na koncie bez leków zapisz objaw — linijka o tym, kiedy powstaje pytanie.

## Performance Considerations

Strona po zapisie robi trzy dodatkowe zapytania, małe przy jednym koncie. Pomiar LCP ekranów należy do F-06 i S-08; ta zmiana nie dokłada JavaScriptu w przeglądarce (`<details>` bez Reacta).

## Migration Notes

Brak danych do przeliczenia: migracja zmienia tylko funkcje i wyzwalacze. Okresy z tą samą dawką obok siebie nie powstają w aplikacji (DP010), więc pytanie nie potrzebuje filtra takich par.

## References

- Roadmapa: `context/foundation/roadmap.md` — S-06 (`symptom-question-composer`), S-07, S-08
- PRD: `context/foundation/prd.md` — US-02, FR-010, FR-012, Open Questions 4 i 7
- Plan S-05: `context/archive/2026-10-05-symptom-journal-entry/plan.md`, plan-review F5, follow-up F8
- Wzorzec poprawy okresu: `supabase/migrations/20261005140000_correct_dosage_period.sql`, `src/pages/leki/[id]/okresy/[periodId]/poprawa.astro`
- Wzorzec testu tekstów: `scripts/fr012/journal-copy.test.mjs`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Cofnięcie zmiany dawki

#### Automated

- [x] 1.1 Migracje wchodzą czysto: `npx supabase db reset` — 9ed5929
- [x] 1.2 Bramki SQL przechodzą, w tym nowy plik z `GATE_COMPLETE`: `npm run db:check` — 9ed5929
- [x] 1.3 Testy jednostkowe i filtr FR-012 tekstów leków: `npm test` — 9ed5929
- [x] 1.4 Lint i typy: `npm run lint` i `npm run typecheck` — 9ed5929
- [x] 1.5 Smoke z krokiem cofnięcia przeciw lokalnej bazie: `npm run smoke` — 9ed5929

#### Manual

- [x] 1.6 Na telefonie: zmiana dawki → „Cofnij zmianę dawki” → potwierdzenie → historia leku ma jeden trwający okres z poprzednią dawką — 9ed5929
- [x] 1.7 Przy leku zakończonym i przy pierwszym okresie odnośnika cofnięcia nie ma — 9ed5929
- [x] 1.8 Poprawa dawki na wartość z poprzedniego okresu pokazuje nowy komunikat wskazujący cofnięcie — 9ed5929

### Phase 2: Składanie pytania

#### Automated

- [x] 2.1 Testy składania pytania i filtr FR-012 przechodzą: `npm test` — 15cc2f2
- [x] 2.2 Lint i typy: `npm run lint` i `npm run typecheck` — 15cc2f2

#### Manual

- [x] 2.3 Bieg mutacyjny na `doctor-question.ts` (`npm run test:mutation`) nie zostawia żywych mutantów w regule okna i kolejności; żywe mutanty opisane albo zabite testem — 15cc2f2
- [x] 2.4 Autorka czyta wygenerowane pytania z fixture'ów testu i potwierdza brzmienie — 15cc2f2

### Phase 3: Pytanie na ekranie po zapisie

#### Automated

- [x] 3.1 Testy jednostkowe: `npm test` — 7989eb0
- [x] 3.2 Lint i typy: `npm run lint` i `npm run typecheck` — 7989eb0
- [x] 3.3 Build: `npm run build` — 7989eb0
- [x] 3.4 Smoke z krokiem pytania przeciw lokalnej bazie (stary podgląd zatrzymany, `.env` odsunięty): `npm run smoke` — 7989eb0

#### Manual

- [x] 3.5 Na telefonie: wpis z jednym objawem przy lekach ze zmianą w oknie — pytanie zgodne z podglądem z planu — 7989eb0
- [x] 3.6 Wpis z trzema objawami: trzy pytania, pierwsze rozwinięte, pozostałe zwinięte pod nazwą objawu — 7989eb0
- [x] 3.7 Konto bez leków w oknie: wpis zapisuje się, widać linijkę `noQuestion`, pytania brak — 7989eb0
- [x] 3.8 Leki bez zmian w oknie: zdanie o braku zmian i rozwinięta lista przyjmowanych leków — 7989eb0
- [x] 3.9 Cofnięcie zmiany dawki (faza 1), potem ponowne otwarcie strony wpisu: zmiana znika z pytania — 7989eb0
- [x] 3.10 Tryb ciemny: sekcja czytelna, nic nie wygląda jak alarm — 7989eb0
- [x] 3.11 Autorka czyta pytania na ekranie i potwierdza, że żadne nie stwierdza przyczyny ani nie porządkuje leków według podejrzenia — 7989eb0
