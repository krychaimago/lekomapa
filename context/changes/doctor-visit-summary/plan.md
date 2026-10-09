# Sekcja „Do omówienia z lekarzem” (S-08) — plan implementacji

## Overview

Nowy ekran wnętrza `/wizyta`, trzecia pozycja menu. Zbiera w jednym miejscu dwie gotowe treści: możliwe interakcje między bieżącymi lekami (S-02) i jedno aktualne pytanie do lekarza na każdy objaw z dzienniczka (S-06). Niczego nie wylicza od nowa: kolizje przychodzą z tej samej funkcji bazy co na liście leków, a pytania składa ta sama funkcja `composeDoctorQuestion` co po zapisaniu wpisu. To moment odbioru wartości całego produktu (US-03, FR-011), więc język FR-012 obowiązuje tu bez wyjątku.

## Current State Analysis

- Pytanie do lekarza powstaje dziś wyłącznie po zapisaniu wpisu: `src/pages/dzienniczek/index.astro:107` woła `loadDoctorQuestions(supabase, addedEntry.id)`, które czyta **jeden** wpis (`src/lib/services/doctor-question-data.ts:35`). Nie ma odczytu „wszystkie objawy, najnowszy wpis każdego”.
- `composeDoctorQuestion` (`src/lib/services/doctor-question.ts:85`) jest czysta i wystarcza bez zmian: dostaje `entryOccurredAt` i `symptomOccurrences` (wszystkie daty wpisów z objawem), sama wyznacza pierwszy wpis, okno 90 dni i `entryCount`. Wpisy późniejsze niż `entryOccurredAt` ignoruje.
- Odczyt wszystkich wystąpień objawów zwykłym zapytaniem PostgREST obcina `max_rows = 1000` (`supabase/config.toml:18`); przy obcięciu może odpaść najstarszy wpis, który wyznacza początek okna (plan-review S-06, F3; `roadmap.md` S-08, Unknowns).
- Kolizje: `public.medication_interactions()` (`supabase/migrations/20260930120000_medication_write_and_interactions.sql:291-347`) — `security invoker`, porównuje tylko bieżące leki (`discontinued_on is null or > dziś w Europe/Warsaw`), zwraca każdą parę leków w obu kierunkach (A→B i B→A). Strony leków wołają RPC bezpośrednio (`src/pages/leki/index.astro:40-50`, `src/pages/leki/[id].astro:58-67`); wspólnego serwisu nie ma.
- Teksty: `src/lib/copy/interactions.ts` ma notę (FR-007), `noWarningIsNotSafe`, `rulesIncomplete`, `detailsHeading`. Tekstów pustych stanów sekcji (0 / 1 / 2+ bieżących leków, wprowadzenie, brak pytań, stała zachęta) **nie ma** — `roadmap.md:322` twierdzi inaczej. Każdy plik tekstów ma własny test FR-012 w `scripts/fr012/`; nowy plik nie jest objęty automatycznie.
- Menu: `NAV_ITEMS` w `src/lib/navigation.ts:8-11` (`/leki`, `/dzienniczek`); trasa z menu jest chroniona i objęta kontrolą warunków automatycznie (`INTERIOR_ROUTES`, `:16`). `scripts/auth/route-coverage.test.mjs` pilnuje, że każda strona wnętrza jest w `INTERIOR_ROUTES`.
- Znacznik pytania renderowany jest wprost w `src/pages/dzienniczek/index.astro:131-183` (`<details>` bez React).
- Pomiaru LCP nie ma żadnego; pomiar dla tej sekcji należy do S-08 (`roadmap.md:324`, PRD NFR).

## Desired End State

- Pozycja menu „Wizyta” prowadzi na `/wizyta` (pasek boczny i dolny).
- Bez żadnego leku (także zakończonego) i bez żadnego wpisu: jedno wprowadzenie z przyciskami „Dodaj lek” i „Zapisz objaw” zamiast dwóch pustych części.
- W pozostałych przypadkach dwie części:
  - **Możliwe interakcje** — każda para leków raz, z treścią opisu pary i notą poglądową przy każdej; pod listą „sprawdzane są tylko wybrane pary” i „brak oznaczenia nie znaczy bezpieczne”. Pusty stan zależny od liczby bieżących leków: 0 — brak bieżących leków i droga do dodania; 1 — pary sprawdzane są od dwóch leków; 2+ — „nie znaleziono sprawdzanej pary” wraz z notą o niepełnym zbiorze.
  - **Pytania do lekarza** — jedno pytanie na objaw, złożone z najnowszego wpisu tego objawu (wg daty objawu `occurred_at`), objawy od najnowszego wpisu, remis alfabetycznie, wszystkie pytania rozwinięte („Pozostałe leki” zwinięte jak w S-06). Pod pytaniami linijka „Bez pytania: …” z nazwami objawów, dla których pytanie nie powstaje, i zdanie z S-06, kiedy powstaje. Bez wpisów — „pytania pojawią się po zapisaniu objawu” z odnośnikiem do dzienniczka.
- Zawsze, także przy wprowadzeniu, zachęta: o każdy lek i objaw można zapytać lekarza lub farmaceutę.
- Żadna nazwa leku, objawu ani dawka nie trafia do URL — strona nie ma parametrów, odnośniki tylko do stałych tras.
- LCP sekcji ≤ 2,5 s w Lighthouse Mobile na produkcji, wynik zapisany w Progress.

Weryfikacja: `npm test`, `npm run db:check`, `npm run typecheck`, `npm run lint`, `npm run smoke`, ręczny przegląd ekranu i pomiar Lighthouse.

### Key Discoveries:

- `composeDoctorQuestion` potrzebuje wszystkich dat wpisów objawu, nie tylko najstarszej — inaczej `entryCount` w podsumowaniu („… (12 wpisów)”) będzie zły (`src/lib/services/doctor-question.ts:88-91,124-131`).
- Funkcja bazy zwracająca jeden wiersz na objaw z tablicą dat (`array_agg`) daje najwyżej 34 wiersze (rozmiar katalogu), więc `max_rows` jej nie dotyczy, a `composeDoctorQuestion` zostaje bez zmian.
- `medication_interactions()` zwraca parę dwa razy i potencjalnie raz na każdy pasujący `pair_id` — deduplikacja po nieuporządkowanej parze `{medication_id, other_medication_id}` + `pair_id` (`…interactions.sql:312-330`).
- Wzorzec funkcji bazy: `language sql stable security invoker set search_path = ''`, `revoke execute … from public, anon`, `grant execute … to authenticated` (`…interactions.sql:291-347`). Funkcja `security invoker` nie podlega INVARIANT 7 (`supabase/tests/schema_invariants_checks.sql:351`), ale RLS działa jak przy zwykłym zapytaniu.
- Bramka SQL: `npm run db:check` uruchamia każdy `supabase/tests/*.sql` i wymaga znacznika `GATE_COMPLETE <nazwa pliku>` (`scripts/db-checks.mjs:16,219`).
- Smoke ma już konto A z lekiem i zapisany wpis (`scripts/smoke.mjs:1316-1345`) — krok sekcji może z nich skorzystać i dopisać ścieżkę do `journal.paths`, które sprawdza krok „żaden URL nie niesie nazwy”.

## What We're NOT Doing

- Nie poprawiamy limitu `max_rows` w odczycie S-06 (`loadDoctorQuestions` dla jednego wpisu, zapytanie `symptom_entry_items … in(symptom_id)`). Ten sam błąd istnieje tam, ale to osobna zmiana — do zgłoszenia jako issue.
- Nie zmieniamy `composeDoctorQuestion` ani `doctorQuestionText`.
- Bez listy bieżących leków w sekcji (`## Parked` roadmapy — rozszerza FR-011 poza zbieranie gotowych treści).
- Bez porównywania leków zakończonych z parami — sekcja pokazuje dokładnie to, co `medication_interactions()`.
- Bez automatycznego pomiaru LCP (skrypt, Lighthouse w CI) — jednorazowy pomiar ręczny.
- Bez testu E2E (Playwright) — decyzja z planowania: SQL + krok smoke.
- Bez wydruku, eksportu i udostępniania lekarzowi (`## Non-Goals` PRD).
- Bez zmiany przekierowania po logowaniu — `/dashboard` zostaje.

## Implementation Approach

Kolejność „baza → czysta logika → strona”: najpierw funkcja bazy z dowodem izolacji, potem czysty moduł z testami jednostkowymi (bez Supabase, ładowalny przez `node --test`), na końcu odczyt danych, ekran i menu. Pytania składa istniejąca funkcja z S-06; nowy moduł decyduje wyłącznie, który wpis jest „najnowszy”, w jakiej kolejności idą objawy, które pary pokazać raz i który pusty stan wybrać. Renderowanie pytania wydzielamy z dzienniczka do wspólnego komponentu `.astro`, żeby oba ekrany pokazywały pytanie identycznie.

Definicje (rozstrzygnięte w planowaniu):

- **Najnowszy wpis objawu** = największe `occurred_at` (data i godzina objawu), nie `created_at`. Przykład: 05.10.2026 dopisany wpis o objawie z 25.09.2026 przy istniejącym wpisie z 02.10.2026 — najnowszy jest wpis z 02.10.2026.
- **Kolejność objawów** = `occurred_at` najnowszego wpisu malejąco; remis — nazwa objawu alfabetycznie (`localeCompare(…, "pl")`).
- **Bieżący lek** = ta sama reguła co `medication_interactions()` i `/leki`: `discontinued_on` puste albo późniejsze niż dziś w Europe/Warsaw.
- **Wprowadzenie** = zero leków jakichkolwiek (także zakończonych) i zero wpisów dzienniczka. Lek zakończony to nadal dane, które zasilają pytania, więc nie pokazujemy „zacznij od dodania leku”.

## Critical Implementation Details

- **Pomiar przed warunkiem (lesson „Bramka musi odróżnić blokadę od niewykonania”)**: zanim sprawdzenie SQL zażąda konkretnego kodu dla `anon` wywołującego funkcję, zmierz, co faktycznie przychodzi (oczekiwane `42501`, ale ustaw warunek dopiero po pomiarze). Krok „konto B nie widzi objawów konta A” musi wymagać zera wierszy **i** najpierw potwierdzić, że konto A widzi swoje wiersze — inaczej pusty wynik z błędnej funkcji daje PASS.
- **Smoke i lokalna baza (lessons o podglądzie i `.env`)**: przed `npm run smoke` zatrzymaj stary podgląd (`npx astro preview stop`) i odsuń `.env`, zostawiając `.dev.vars` z wartościami z `npx supabase status`.

## Faza 1: Funkcja bazy z wystąpieniami objawów

### Overview

Funkcja `public.symptom_occurrences()` zwraca jeden wiersz na objaw zalogowanej osoby z kompletem dat wpisów. Dowód izolacji na dwóch kontach.

### Changes Required:

#### 1. Migracja

**File**: `supabase/migrations/20261008120000_symptom_occurrences.sql`

**Intent**: Dać sekcji odczyt wszystkich objawów z kompletem dat bez obcinania przez `max_rows`, przez RLS osoby wywołującej.

**Contract**: `public.symptom_occurrences() returns table (symptom_id uuid, symptom_name text, occurrences timestamptz[])`, `language sql stable security invoker set search_path = ''`. Jeden wiersz na objaw z co najmniej jednym wpisem; `occurrences` = `array_agg(occurred_at order by occurred_at)`. Jawny filtr `e.user_id = (select auth.uid())` obok RLS (jak w `medication_interactions()`). `comment on function` z przykładem. `revoke execute … from public, anon; grant execute … to authenticated`. Bez nowej tabeli — RLS istniejących tabel `symptom_entries`/`symptom_entry_items` bez zmian.

#### 2. Sprawdzenie SQL

**File**: `supabase/tests/symptom_occurrences_checks.sql`

**Intent**: Dowieść, że funkcja zwraca komplet własnych dat i nic z cudzego konta, a `anon` nie może jej wywołać.

**Contract**: Wzorzec `account_isolation_checks.sql` (rola zmieniana poza podblokami, jedna transakcja z `rollback`, znacznik `GATE_COMPLETE symptom_occurrences_checks`). Bloki:

- OCCURRENCES 1: konto A z trzema wpisami jednego objawu i jednym drugiego — dwa wiersze, tablica pierwszego ma trzy daty rosnąco.
- OCCURRENCES 2: konto B (z własnym wpisem) dostaje wyłącznie swój objaw; żadna data konta A nie występuje. Warunek wstępny: konto A w tym samym biegu widzi swoje wiersze.
- OCCURRENCES 3: `anon` — wywołanie kończy się nazwanym błędem uprawnień (kod ustalony pomiarem), nie `when others`.

### Success Criteria:

#### Automated Verification:

- Migracja wchodzi na czystą bazę: `npx supabase db reset`
- Bramka SQL przechodzi, w tym nowy plik: `npm run db:check`
- Niezmienniki schematu bez zmian (INVARIANT 1–7 OK) w tym samym biegu `npm run db:check`

#### Manual Verification:

- Przy celowo zepsutej funkcji odpowiedni blok OCCURRENCES pada — sprawdzone raz lokalnie, zmiana cofnięta (np. `grant execute … to anon` wywraca OCCURRENCES 3)

**Implementation Note**: Po fazie i zielonych bramkach automatycznych — pauza na ręczne potwierdzenie przed fazą 2.

---

## Faza 2: Logika sekcji i teksty

### Overview

Czysty moduł decydujący o zawartości sekcji oraz plik tekstów z testem FR-012.

### Changes Required:

#### 1. Moduł sekcji

**File**: `src/lib/services/visit-summary.ts`

**Intent**: Wybór najnowszego wpisu i kolejności objawów, lista objawów bez pytania, deduplikacja par, wybór pustych stanów — bez Supabase i bez importów `@/`, żeby `node --test` ładował plik wprost (jak `doctor-question.ts`).

**Contract**:

- `composeVisitQuestions(symptoms: { symptomId: string; name: string; occurrences: string[] }[], medications: DoctorQuestionMedication[]): { questions: DoctorQuestion[]; withoutQuestion: string[] }` — dla każdego objawu woła `composeDoctorQuestion` z `entryOccurredAt` = maksimum `occurrences` i pełną tablicą; `questions` od najnowszego wpisu, remis alfabetycznie; `withoutQuestion` = nazwy objawów z wynikiem `null`, alfabetycznie.
- `uniqueInteractions(rows: MedicationInteraction[], names: ReadonlyMap<string, string>): { firstName: string; secondName: string; description: string }[]` — jedna pozycja na nieuporządkowaną parę leków i `pair_id`; w pozycji nazwy alfabetycznie; lista po `firstName`, `secondName`, `description` (alfabet, nigdy wg podejrzenia — FR-012).
- `isCurrentMedication(discontinuedOn: string | null, today: string): boolean` — reguła z `medication_interactions()`.
- `interactionsEmptyState(currentCount: number, pairCount: number): "noMedications" | "oneMedication" | "noPair" | null`.
- `showIntro(medicationCount: number, symptomCount: number): boolean` — prawda tylko przy 0 i 0.

#### 2. Teksty sekcji

**File**: `src/lib/copy/visit-summary.ts`

**Intent**: Nowe teksty sekcji w jednym module bez importów, tylko pola tekstowe, szablony ze znacznikami `{…}` (konwencja plików `src/lib/copy/`).

**Contract**: `VISIT_SUMMARY_COPY` z kluczami co najmniej: `title` („Wizyta”), `intro`, `introAddMedication` („Dodaj lek”), `introAddSymptom` („Zapisz objaw”), `pairLabel` („{lek} i {drugi}”), `noCurrentMedications`, `oneMedication`, `noPairFound`, `questionsHeading`, `noQuestions`, `journalLink`, `withoutQuestion` („Bez pytania: {objawy}.”), `askDoctorOrPharmacist` („O każdy lek i objaw możesz zapytać lekarza lub farmaceutę.”), `questionsNote` („Pytania zestawiają daty z dzienniczka oraz listy leków. Nie są oceną ani diagnozą.”), `loadError`. Teksty interakcji już istniejące (`note`, `rulesIncomplete`, `noWarningIsNotSafe`, `detailsHeading`) i S-06 (`noQuestion`) — z ich modułów, nie kopiowane. `DOCTOR_QUESTION_COPY.note` z S-06 nie trafia do sekcji: jego ostatnie zdanie to `askDoctorOrPharmacist`, więc padłoby na ekranie dwa razy; zamiast niego `questionsNote` raz pod nagłówkiem pytań (plan-review F2). Brzmienie robocze; autorka zatwierdza w fazie 3. Etykieta menu „Wizyta” w `src/lib/navigation.ts`.

#### 3. Testy

**File**: `scripts/visit-summary/visit-summary.test.mjs`, `scripts/fr012/visit-summary-copy.test.mjs`

**Intent**: Dowieść reguł sekcji na obserwowalnym wyniku i przepuścić nowe teksty przez filtr FR-012.

**Contract**:

- Moduł: najnowszy wpis wg `occurred_at`, nie kolejności w tablicy (przykład z dopisanym wstecz wpisem); `entryCount` liczy wszystkie wpisy; kolejność objawów od najnowszego, remis alfabetycznie; objaw bez leku w oknie trafia do `withoutQuestion`, nie do `questions`; para A→B i B→A daje jedną pozycję, dwa różne `pair_id` dla tej samej pary — dwie; kolejność par niezależna od kolejności wejścia; `interactionsEmptyState` dla 0, 1, 2+ bez par i 2+ z parą; `showIntro` prawda tylko dla 0/0 (lek zakończony liczy się jako lek); `isCurrentMedication` na granicy „odstawiony dziś” (fałsz) i „jutro” (prawda).
- FR-012: wzorzec `scripts/fr012/interaction-copy.test.mjs` — każdy tekst modułu przez `forbiddenWordsIn`, bez wyjątków; wartość niebędąca tekstem wywraca test.

### Success Criteria:

#### Automated Verification:

- Testy jednostkowe przechodzą: `npm test`
- Typy: `npm run typecheck`
- Lint: `npm run lint`

#### Manual Verification:

- Test modułu pada, gdy deduplikacja par zostanie wyłączona albo „najnowszy” liczony po pozycji w tablicy — sprawdzone raz, zmiana cofnięta

**Implementation Note**: Po fazie i zielonych bramkach automatycznych — pauza na ręczne potwierdzenie przed fazą 3.

---

## Faza 3: Ekran, menu i smoke

### Overview

Odczyt danych, strona `/wizyta`, wspólny komponent pytania, pozycja menu, krok smoke.

### Changes Required:

#### 1. Wspólny odczyt leków

**File**: `src/lib/services/doctor-question-data.ts`

**Intent**: Wydzielić zapytanie o leki z okresami i mapowanie na `DoctorQuestionMedication`, żeby dzienniczek i sekcja czytały leki identycznie.

**Contract**: eksport `loadQuestionMedications(supabase): Promise<DoctorQuestionMedication[] | { error: true }>` (to samo `select` i fallback wariantu co dziś, `:61-89`); `loadDoctorQuestions` z niego korzysta. Zachowanie `loadDoctorQuestions` bez zmian; loguje wyłącznie kody błędów.

#### 2. Odczyt sekcji

**File**: `src/lib/services/visit-summary-data.ts`

**Intent**: Jedno miejsce czytające dane sekcji równolegle przez RLS.

**Contract**: `loadVisitSummary(supabase): Promise<VisitSummary | { error: true }>`; `Promise.all` z `rpc("symptom_occurrences")`, `loadQuestionMedications`, `rpc("medication_interactions")`. `VisitSummary` (w `src/types.ts`) = `{ showIntro, interactions, interactionsEmptyState, questions: DoctorQuestionText[], withoutQuestion: string[] }`. Błąd dowolnego odczytu → `{ error: true }`, log tylko z kodem błędu, nigdy z danymi.

#### 3. Komponent pytania

**File**: `src/components/journal/DoctorQuestionCard.astro`, `src/pages/dzienniczek/index.astro`

**Intent**: Jeden sposób renderowania pytania na obu ekranach.

**Contract**: props `{ text: DoctorQuestionText; open: boolean }`; markup przeniesiony z `dzienniczek/index.astro:146-184` bez zmian treści; dzienniczek przekazuje `open={index === 0}`, sekcja `open`. Atrybut `data-doctor-question` zostaje na `<section>` dzienniczka (smoke).

#### 4. Strona

**File**: `src/pages/wizyta.astro`

**Intent**: Ekran sekcji przez `AppLayout`, bez parametrów w URL.

**Contract**: `.astro`, bez React. Wprowadzenie albo dwie części (`<section aria-labelledby>` z atrybutami `data-visit-interactions`, `data-visit-questions`); interakcje w stylu `bg-interaction`/`border-interaction-border` jak `leki/[id].astro:367-389`, nota przy każdej parze; pod listą `rulesIncomplete` i `noWarningIsNotSafe`; `questionsNote` raz pod nagłówkiem pytań (bez `DOCTOR_QUESTION_COPY.note`); zachęta `askDoctorOrPharmacist` zawsze na dole. Błąd odczytu → status 500 i `loadError` (jak `leki/index.astro:56-66`). Odnośniki wyłącznie do `/leki/nowy`, `/dzienniczek/nowy`, `/dzienniczek`. Kolory tylko z tokenów.

#### 5. Menu

**File**: `src/lib/navigation.ts`, `scripts/navigation/navigation.test.mjs`

**Intent**: Trzecia pozycja menu; ochrona trasy i kontrola warunków przychodzą z `INTERIOR_ROUTES`.

**Contract**: `NAV_ITEMS` += `{ href: "/wizyta", label: "Wizyta" }` (po „Dzienniczek”). Test: pozycja jest w menu i `/wizyta` jest w `INTERIOR_ROUTES`.

#### 6. Krok smoke

**File**: `scripts/smoke.mjs`

**Intent**: Dowieść, że sekcja renderuje się dla zalogowanego konta i pokazuje pytanie z zapisanego wpisu.

**Contract**: krok po krokach dzienniczka, na `journal.jar`: `GET /wizyta` → 200; w `data-visit-questions` nazwa objawu z `journal.symptom`, nazwa leku `fixtures.a.medication.product_name` i fraza `REQUIRED_PHRASE` / `REQUIRED_PHRASE_PLURAL` (wg `PLURAL_SYMPTOM_NAMES`); na stronie `askDoctorOrPharmacist`. Krok wstawiony w `journalFlowSteps` przed krokiem „journal: no URL on the way carries…” i sam woła `journal.paths.push("/wizyta")` (jak `scripts/smoke.mjs:1300`, `:1322`) — `requestPage` nie dopisuje ścieżki sam, więc bez tego krok „żaden URL nie niesie nazwy” nie obejmie sekcji. Niezalogowany `GET /wizyta` → przekierowanie na logowanie.

### Success Criteria:

#### Automated Verification:

- Testy jednostkowe, w tym nawigacja i pokrycie tras: `npm test`
- Typy: `npm run typecheck`
- Lint: `npm run lint`
- Build: `npm run build`
- Smoke przeciw lokalnemu Supabase przechodzi, w tym nowy krok: `npm run smoke`

#### Manual Verification:

- Na telefonie (szerokość ~375 px) menu ma trzy pozycje, etykiety się mieszczą, sekcja czytelna
- Konto bez leków i wpisów: tylko wprowadzenie z dwoma przyciskami i zachęta do pytania lekarza lub farmaceuty
- Puste stany interakcji dla 1 leku, 2 leków bez pary i para pokazana raz z notą (1 lek — pary od dwóch leków; 2 bez pary — „nie znaleziono sprawdzanej pary” z notą o niepełnym zbiorze)
- Konto z trzema objawami: kolejność od najnowszego wpisu, wszystkie rozwinięte, objaw bez leku w oknie w linijce „Bez pytania”
- Pytanie dla objawu w sekcji identyczne z pytaniem po zapisaniu jego najnowszego wpisu
- Autorka czyta wszystkie nowe teksty i zatwierdza brzmienie
- Pasek adresu na każdym kroku bez nazwy leku, objawu i dawki

**Implementation Note**: Po fazie i zielonych bramkach automatycznych — pauza na ręczne potwierdzenie przed fazą 4. Faza 4 wymaga wdrożenia (merge do `main`).

---

## Faza 4: Pomiar szybkości po wdrożeniu

### Overview

Jednorazowy pomiar progu z PRD (LCP ≤ 2,5 s, Lighthouse Mobile) na produkcji.

### Changes Required:

#### 1. Pomiar

**File**: `context/changes/doctor-visit-summary/plan.md` (wynik w Progress)

**Intent**: Potwierdzić próg z NFR na prawdziwym środowisku (Cloudflare Workers + Supabase).

**Contract**: Chrome DevTools → Lighthouse, tryb Mobile, kategoria Performance, strona `https://lekomapa.pl/wizyta` (albo bieżący adres Workera), osobne konto wyłącznie do pomiaru (nie konto smoke z `.env`, nie konto prywatne autorki) z danymi przykładowymi: co najmniej 4 bieżące leki z jedną parą, 5 objawów, 15 wpisów, wpisanymi ręcznie przez ekrany aplikacji (~20 min). Po zamknięciu okna korekty wpisów nie da się usunąć, więc konto zostaje jako stałe konto pomiarowe do kolejnych pomiarów; adres konta poza repozytorium (plan-review F4). Trzy biegi, zapisana mediana LCP, data i opis danych. Przy wyniku > 2,5 s — nowa zmiana przez `/10x-new`, bez poprawek w tej.

### Success Criteria:

#### Manual Verification:

- Mediana LCP z trzech biegów Lighthouse Mobile ≤ 2,5 s, wynik i dane wpisane przy kroku w Progress

---

## Testing Strategy

### Unit Tests:

- `scripts/visit-summary/visit-summary.test.mjs` — reguły z fazy 2 (najnowszy wpis, kolejność, bez pytania, deduplikacja par, puste stany, bieżący lek).
- `scripts/fr012/visit-summary-copy.test.mjs` — nowe teksty przez filtr FR-012.
- `scripts/navigation/navigation.test.mjs` — pozycja menu i trasa wnętrza.

### Integration Tests:

- `supabase/tests/symptom_occurrences_checks.sql` — komplet dat, izolacja kont, brak dostępu `anon`.
- Krok smoke sekcji — render dla zalogowanego konta, pytanie z frazą, zachęta, brak nazw w URL, przekierowanie niezalogowanego.

### Manual Testing Steps:

1. Nowe konto testowe lokalnie → `/wizyta`: wprowadzenie, przyciski prowadzą na `/leki/nowy` i `/dzienniczek/nowy`.
2. Dodaj jeden lek → część interakcji: tekst o dwóch lekach; część pytań: „pojawią się po zapisaniu objawu”.
3. Dodaj drugi lek tworzący parę (np. Acenocumarol + Ibuprom) → para raz, z notą.
4. Zapisz trzy wpisy z różnymi objawami w różnych dniach → kolejność od najnowszego, wszystkie rozwinięte.
5. „Bez pytania”: na osobnym koncie bez leków zapisz objaw z datą sprzed 10 dni, potem dodaj lek z dzisiejszą datą rozpoczęcia → objaw w linijce „Bez pytania”.
6. Porównaj pytanie objawu z pytaniem po zapisaniu jego najnowszego wpisu w dzienniczku.

## Performance Considerations

Trzy odczyty równolegle (`Promise.all`), jedna funkcja zwraca ≤ 34 wiersze. Strona `.astro` bez JavaScriptu w przeglądarce (`<details>`), więc LCP zależy głównie od czasu odpowiedzi serwera. Próg mierzony w fazie 4.

## Migration Notes

Migracja dodaje wyłącznie funkcję; bez zmian w danych i tabelach. Wycofanie: `drop function public.symptom_occurrences()` w nowej migracji.

## References

- Roadmapa: `context/foundation/roadmap.md` — S-08 (Outcome, Unknowns, Risk)
- PRD: US-03, FR-011, FR-012, NFR szybkości (`context/foundation/prd.md`)
- Plan S-06: `context/archive/2026-10-06-symptom-question-composer/plan.md`
- Składanie pytania: `src/lib/services/doctor-question.ts:85`
- Odczyt pytania jednego wpisu: `src/lib/services/doctor-question-data.ts:35`
- Funkcja kolizji: `supabase/migrations/20260930120000_medication_write_and_interactions.sql:291-347`
- Render pytania: `src/pages/dzienniczek/index.astro:131-183`
- Render kolizji: `src/pages/leki/[id].astro:367-394`
- Test FR-012 tekstów: `scripts/fr012/interaction-copy.test.mjs`
- Krok smoke pytania: `scripts/smoke.mjs:1316-1345`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Funkcja bazy z wystąpieniami objawów

#### Automated

- [x] 1.1 Migracja wchodzi na czystą bazę: `npx supabase db reset` — bc4f2ae
- [x] 1.2 Bramka SQL przechodzi, w tym nowy plik: `npm run db:check` — bc4f2ae
- [x] 1.3 Niezmienniki schematu bez zmian (INVARIANT 1–7 OK) w tym samym biegu `npm run db:check` — bc4f2ae

#### Manual

- [x] 1.4 Przy celowo zepsutej funkcji odpowiedni blok OCCURRENCES pada — sprawdzone raz lokalnie, zmiana cofnięta (np. `grant execute … to anon` wywraca OCCURRENCES 3) — bc4f2ae

### Phase 2: Logika sekcji i teksty

#### Automated

- [x] 2.1 Testy jednostkowe przechodzą: `npm test` — 70bce7a
- [x] 2.2 Typy: `npm run typecheck` — 70bce7a
- [x] 2.3 Lint: `npm run lint` — 70bce7a

#### Manual

- [x] 2.4 Test modułu pada, gdy deduplikacja par zostanie wyłączona albo „najnowszy” liczony po pozycji w tablicy — sprawdzone raz, zmiana cofnięta — 70bce7a

### Phase 3: Ekran, menu i smoke

#### Automated

- [x] 3.1 Testy jednostkowe, w tym nawigacja i pokrycie tras: `npm test`
- [x] 3.2 Typy: `npm run typecheck`
- [x] 3.3 Lint: `npm run lint`
- [x] 3.4 Build: `npm run build`
- [x] 3.5 Smoke przeciw lokalnemu Supabase przechodzi, w tym nowy krok: `npm run smoke`

#### Manual

- [x] 3.6 Na telefonie (szerokość ~375 px) menu ma trzy pozycje, etykiety się mieszczą, sekcja czytelna
- [x] 3.7 Konto bez leków i wpisów: tylko wprowadzenie z dwoma przyciskami i zachęta do pytania lekarza lub farmaceuty
- [x] 3.8 Puste stany interakcji dla 1 leku, 2 leków bez pary i para pokazana raz z notą (1 lek — pary od dwóch leków; 2 bez pary — „nie znaleziono sprawdzanej pary” z notą o niepełnym zbiorze)
- [x] 3.9 Konto z trzema objawami: kolejność od najnowszego wpisu, wszystkie rozwinięte, objaw bez leku w oknie w linijce „Bez pytania”
- [x] 3.10 Pytanie dla objawu w sekcji identyczne z pytaniem po zapisaniu jego najnowszego wpisu
- [x] 3.11 Autorka czyta wszystkie nowe teksty i zatwierdza brzmienie
- [x] 3.12 Pasek adresu na każdym kroku bez nazwy leku, objawu i dawki

### Phase 4: Pomiar szybkości po wdrożeniu

#### Manual

- [ ] 4.1 Mediana LCP z trzech biegów Lighthouse Mobile ≤ 2,5 s, wynik i dane wpisane przy kroku w Progress
