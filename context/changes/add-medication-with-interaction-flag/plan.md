# S-02: Dodanie leku po nazwie handlowej ze znacznikiem możliwej kolizji — plan wdrożenia

## Overview

Użytkowniczka dodaje przyjmowany preparat na dwa sposoby:

- z rejestru: wpisuje nazwę handlową, wybiera wariant (moc, postać) i podaje dawkowanie z datą rozpoczęcia;
- spoza rejestru: podaje nazwę i substancję czynną z ulotki.

Na liście `/leki` każdy lek należący do pary kolizji ma dyskretny, bursztynowy znacznik. Szczegóły leku pokazują skład, treść informacji o kolizji z nazwą drugiego leku oraz stałą notę poglądową.

Plasterek domyka też dług z F-02: strażnika historii na `medications`, kontrolę spójności źródła składu i decyzję F7.

Źródła: `context/foundation/roadmap.md` (S-02, issue #13), `context/foundation/prd.md` (US-01, FR-003, FR-006, FR-007, FR-012), `context/changes/add-medication-with-interaction-flag/research.md`.

## Current State Analysis

- **Dane są, logiki nie ma.** Tabele konta (`medications`, `medication_substances`, `dosage_periods`) mają RLS i strażników historii. Rejestr (3273 produkty) i 24 pary kolizji są wgrane. Brakuje:
  - funkcji zapisu leku,
  - funkcji liczącej kolizje,
  - strażnika UPDATE na `medications`,
  - jakiegokolwiek ekranu domenowego (`NAV_ITEMS` jest puste).
- **Okno korekty to zaślepka.** `medication_correction_window_open()` zawsze zwraca `true` (`supabase/migrations/20260922120000_medication_schema.sql:222-240`). Nowego strażnika da się sprawdzić tylko przez podmianę funkcji w transakcji testu. Wzorzec: `supabase/tests/rls_checks.sql:260-300`.
- **Zapis to dziś trzy nieatomowe inserty** (`src/types.ts:75-102`). Błąd w połowie zostawiłby lek bez składu albo bez okresu.
- **Filtr języka odrzuca rdzeń `dawk`** (`scripts/rpl/pairs.mjs:24-61`). Moduł copy testowany w całości nie może więc zawierać etykiet formularza z dawką.

### Pomiary z lokalnej bazy (2026-09-30), które zmieniają założenia research

- **Część nazw handlowych ma różny skład zależnie od wariantu.** Przykład: „Sartesta” to raz amlodypina z walsartanem, raz sakubitryl z walsartanem. Wybór samej nazwy nie ustala składu, więc użytkowniczka wybiera wariant.
  - Pomiar powtórzony 2026-09-30 przy przeglądzie planu (wcześniejsze „13 nazw” się nie powtórzyło). Nazwa = `lower(product_name)`; nazwa liczy się, gdy jej produkty mają więcej niż jeden różny skład:
    - zbiór kodów ATC (brak kodu jako `-`): **1** — Sartesta;
    - zbiór `normalized_name`: **3** — Prenessa, Rosamera, Sartesta;
    - pełna lista wierszy nazwa:kod, z dublami: **6** — dochodzą Coroswera, Dexak, Ibuprofen Zentiva (dubel kodu, patrz niżej).
  - Zapytanie: `registry_products` left join `registry_substances`, per produkt `string_agg(distinct …)` składu, potem `group by lower(product_name) having count(distinct skład) > 1`.
  - Decyzja nie zależy od liczby: jeden przypadek z różnym kodem (Sartesta) wystarcza, żeby sama nazwa dawała fałszywy skład.
- **4 produkty mają ten sam kod ATC dwa razy:**
  - Ibuprofen Zentiva 400 mg — dwa razy „Ibuprofenum” / M01AE01. Kopia 1:1 łamie istniejący klucz `unique nulls not distinct (medication_id, substance_name, atc_code)`.
  - Dexak — dwie pisownie, M01AE17.
  - Coroswera (2 warianty) — „Rosuvastatinum” i „Rosuvastatinum calicum”, C10AA07.

  Roadmapa (S-02, „Decyzja przejęta z F-02”) podaje, że takiego produktu nie ma. Pomiar z 2026-09-26 był błędny albo liczył coś innego — poprawka w fazie 1.

- **Słownik substancji dla ścieżki ulotki:** 100 różnych `normalized_name` z kodem, 112 par nazwa–kod.
  - Niektóre substancje mają kilka kodów, np. `diclofenacum` 5, `acidum acetylsalicylicum` 3.
  - Nazwy są łacińskie, a ulotka podaje nazwę polską („ibuprofen”).

## Desired End State

- `/leki` jest w menu. Lista pokazuje leki nieodstawione, najnowsze (wg daty rozpoczęcia) na górze. Każdy lek należący do pary ma znacznik „możliwa interakcja” w tokenach `interaction*`. Pod listą stale widać notę i zdanie „Brak oznaczenia nie znaczy, że połączenie jest bezpieczne”.
- `/leki/nowy` — wyszukiwanie nazwy handlowej formularzem „Szukaj”, potem lista wariantów ze składem, potem dawkowanie i data rozpoczęcia (domyślnie dziś). Zapis jest atomowy. Po zapisie następuje powrót na listę z wyróżnioną nową pozycją.
- `/leki/nowy/z-ulotki` — nazwa własna i substancja z podpowiedzi (`datalist`). Substancja spoza słownika zapisuje się bez kodu wyłącznie po świadomym potwierdzeniu.
- `/leki/[id]` — pełny skład, każda kolizja z nazwą drugiego leku i opisem pary, nota przy każdej informacji. Przy substancji bez kodu linijka, że nie jest objęta żadną sprawdzaną parą.
- Baza:
  - pilnuje spójności `composition_source` ⇔ `registry_medication_id`;
  - blokuje zmianę źródła składu i wskazanego preparatu po zamknięciu okna;
  - nie dopuszcza dwóch wierszy z tym samym kodem w jednym leku.
- Bramki: `npm test`, `npm run db:check`, `npm run smoke`, `npm run lint`, `npm run typecheck` są zielone. Nowe sprawdzenia padają na zepsutej implementacji.

Weryfikacja końcowa: dwie osoby testowe w smoke dodają Acenocumarol (B01AA) i Ibuprom (M01AE) — oba leki mają znacznik, szczegóły zawierają notę.

### Key Discoveries:

- Reguła dopasowania jest zapisana tylko jako komentarz tabeli (`supabase/migrations/20260924120000_registry_schema.sql:92-93`). Przykład wykonania jest w `supabase/tests/rls_checks.sql:707-725`.
- INVARIANT 7 dotyczy wyłącznie funkcji `security definer` (`supabase/tests/schema_invariants_checks.sql:15-16`). Nowe funkcje są `security invoker`, więc RLS działa na nich naturalnie.
- INVARIANT 8 to ręczna lista strażników (`supabase/tests/schema_invariants_checks.sql:411-418`). Nowy strażnik to nowy wpis.
- `npm test` uruchamia się z `--experimental-strip-types`, więc test `.mjs` importuje moduł `.ts` bez aliasów `@/`. Wzorzec: `scripts/navigation/navigation.test.mjs:7`.
- Wzorzec trasy API i modułu copy: `src/pages/api/auth/password-reset-request.ts`, `src/lib/copy/password-recovery.ts:57-79` (biała lista kodów błędów).
- `request()` w smoke porzuca treść odpowiedzi (`scripts/smoke.mjs:87-100`), więc krok z notą potrzebuje helpera zwracającego body.
- Dopasowanie prefiksem prowadzi przez `like group || '%'`. Kod krótszy niż grupa nie trafi w parę — dotyczy wyłącznie danych z ulotki, a słownik zawiera pełne kody.

## What We're NOT Doing

- Zmiana dawkowania (S-03), odstawienie i usunięcie leku (S-04), edycja nazwy w UI. Baza pozwala zmienić `product_name`, ale ekranu do tego nie ma.
- Stan okna korekty w interfejsie. Brak edycji oznacza, że UI go nie potrzebuje, a EXECUTE na funkcji okna zostaje odebrane.
- Ręczne kompletowanie składu kilku substancji z ulotki (Non-Goal `prd.md:206`). Lek z ulotki ma jedną substancję, być może z kilkoma kodami. Napięcie z lekcją „Niepełny zbiór reguł…”: preparat złożony spoza rejestru straci składniki. Łagodzi to linijka o substancji nieobjętej parą i nota PRD `prd.md:211`. Nie rozwiązuje.
- Porządkowanie leków według kolizji. Kolejność zależy wyłącznie od daty rozpoczęcia i daty dodania.
- Kolizje leków odstawionych i historycznych nakładek — liczone są tylko leki bez daty odstawienia albo z datą w przyszłości.
- Sekcja „Do omówienia z lekarzem” (S-08). Funkcja kolizji jest pod nią gotowa, ekranu nie ma.
- Indeks wyszukiwania (`pg_trgm`). Przy 3273 wierszach wystarczy `ilike`.
- Tryb ciemny ponad to, co dają tokeny z F-04.
- Poprawka `CLAUDE.md` („zod nie jest zainstalowany”) — osobna drobna zmiana.

## Implementation Approach

Kolejność: baza → czyste funkcje i teksty → ekrany → smoke → podpowiedzi.

- **Reguła żyje w bazie.** Zapis leku i liczenie kolizji to funkcje SQL `security invoker`. RLS widzi w nich dane wyłącznie wywołującej, a jedna implementacja obsłuży S-02 i później S-08. Bramka `db:check` sprawdza je na prawdziwych kodach z seeda.
- **Aplikacja jest cienka.** Strony `.astro` renderowane serwerowo i jedna trasa POST z walidacją zod. React tylko tam, gdzie wymaga go wzorzec formularza (`useSubmitting`) i w odkładalnej fazie 6.
- **Teksty o kolizji mają jeden moduł** testowany filtrem FR-012 w całości. Teksty formularza (z „dawkowaniem”) są w osobnym module.

## Critical Implementation Details

- **Deduplikacja przy kopiowaniu składu jest obowiązkowa, nie kosmetyczna.** Bez niej zapis Ibuprofen Zentiva 400 mg kończy się błędem klucza unikalnego. Zasada:
  - jeden wiersz na kod ATC — pierwszy wg `position`, potem wg `substance_name`;
  - wiersze bez kodu (`unmatched`) deduplikowane po nazwie.
  - Kandydaci `derived_ambiguous` mają różne kody, więc zostają wszyscy (lekcja „Niepełny zbiór reguł…”).
- **Strażnik UPDATE na `medications` musi przepuścić zmiany, które robi baza sama:** `updated_at` (wyzwalacz `set_updated_at`), `discontinued_on` (S-04) i `product_name` (decyzja: etykieta). Blokuje wyłącznie `composition_source`, `registry_medication_id` i `user_id` przy zamkniętym oknie. Komunikat w tym samym brzmieniu co pozostali strażnicy („okno korekty … jest już zamknięte”), bo `pg_temp.assert_history_guard_message` sprawdza ten wzorzec.
- **Kolejność wyzwalaczy BEFORE UPDATE** jest alfabetyczna: `medications_guard_core` < `medications_set_updated_at`. Strażnik porównuje wyłącznie wymienione kolumny, więc kolejność nie zmienia wyniku. Warto to zapisać w komentarzu, zanim ktoś doda do strażnika `updated_at`.
- **Formularz z ulotki nie może po cichu zapisać substancji bez kodu.** Wpis niepasujący do słownika wraca z podobnymi pozycjami (wspólny przedrostek, bez rozróżniania wielkości liter i ogonków) i z polem „Zapisz bez sprawdzania”. Kod `null` zapisuje się tylko przy zaznaczonym polu. Powód: „ibuprofen” z polskiej ulotki nie jest równy „ibuprofenum” ze słownika, a cichy zapis bez kodu daje brak znacznika przy leku, który koliduje.

---

## Phase 1: Baza — zapis leku, kolizje, strażnik

### Overview

Jedna migracja domyka dług F-02 i dodaje trzy funkcje. Sprawdzenia SQL dowodzą każdej gwarancji na wyniku, nie na braku błędu.

### Changes Required:

#### 1. Migracja S-02

**File**: `supabase/migrations/20260930120000_medication_write_and_interactions.sql`

**Intent**: Dodać do schematu leków gwarancje spójności i historii, których brakowało od F-02, oraz funkcje, przez które aplikacja zapisuje lek i czyta kolizje.

**Contract**:

- `medications`:
  - `constraint medications_registry_source_check check ((composition_source = 'registry') = (registry_medication_id is not null))`;
  - `check (btrim(product_name) <> '')`.
- `dosage_periods`: `check (btrim(dose_text) <> '')`.
- `medication_substances`: `check (btrim(substance_name) <> '')`.
- F7: `create unique index medication_substances_medication_id_atc_code_key on medication_substances (medication_id, atc_code) where atc_code is not null`. Istniejący klucz `(medication_id, substance_name, atc_code)` zostaje, bo pilnuje wierszy bez kodu.
- `medications_guard_core()`:
  - `security definer`, `set search_path = ''`, BEFORE UPDATE FOR EACH ROW;
  - przy zamkniętym oknie (`medication_correction_window_open(old.id)`) blokuje zmianę `composition_source`, `registry_medication_id` i `user_id`;
  - przepuszcza `product_name`, `discontinued_on` i `updated_at`;
  - komunikat po polsku, w konwencji pozostałych strażników, nazywa blokowane pole;
  - EXECUTE odebrane od `anon` i `authenticated` (funkcja wyzwalacza, jak pozostali strażnicy).
- `add_medication_from_registry(p_registry_product_id uuid, p_dose_text text, p_started_on date) returns uuid`:
  - `security invoker`, `volatile`, `set search_path = ''`;
  - wstawia lek z `product_name` z rejestru, `composition_source = 'registry'` i `user_id = auth.uid()`;
  - kopiuje skład wg zasady deduplikacji (Critical Implementation Details) i wstawia pierwszy okres;
  - rzuca nazwanym błędem, gdy produktu nie ma albo `auth.uid()` jest pusty.
- `add_medication_from_leaflet(p_product_name text, p_substance_name text, p_verified boolean, p_dose_text text, p_started_on date) returns uuid`:
  - `security invoker`;
  - przy `p_verified = true` szuka `lower(btrim(p_substance_name))` w `registry_substances.normalized_name`, wyłącznie w wierszach z `atc_code is not null`, i zapisuje **jeden wiersz na każdy kod** tej nazwy — kod zawsze pochodzi z danych, nigdy z wejścia;
  - brak dopasowania przy `p_verified = true` to nazwany błąd — także gdy nazwa istnieje w słowniku wyłącznie w wierszach bez kodu;
  - przy `p_verified = false` zapisuje jeden wiersz z `atc_code = null`;
  - `composition_source = 'leaflet'`.
- `medication_interactions() returns table (medication_id uuid, other_medication_id uuid, pair_id uuid, group_a text, group_b text, description text)`:
  - `security invoker`, `stable`;
  - wiersz na każdą parę (lek, inny lek, para), gdy kod dowolnej substancji leku zaczyna się od `group_a`, a kod dowolnej substancji innego leku od `group_b`, lub odwrotnie;
  - tylko leki z `discontinued_on is null or discontinued_on > (now() at time zone 'Europe/Warsaw')::date` — „dziś” w tej samej strefie co formularz i walidacja, nie `current_date` (sesja bazy liczy w UTC);
  - nigdy lek z samym sobą; bez duplikatów, także przy wielu substancjach trafiających w tę samą grupę;
  - symetryczna: para A–B daje wiersz dla A i dla B.
- Uprawnienia do trzech funkcji publicznych: `revoke execute … from public, anon`, `grant execute … to authenticated`.
- Nagłówek migracji wymienia wszystkie zmiany i powód każdej. Dokładny wzór deduplikacji i dopasowania jest w komentarzu przy funkcji — w miejscu komentarza tabeli, który do tej pory był jedynym zapisem reguły.

#### 2. Sprawdzenia strażnika i spójności

**File**: `supabase/tests/rls_checks.sql`

**Intent**: Dowieść długu F-02 w miejscu, które wskazuje roadmapa, tym samym wzorcem co istniejące sprawdzenia historii.

**Contract**: Nowe numerowane bloki:

- **Przy otwartym oknie** zmiana `registry_medication_id` i `composition_source` przechodzi (odczyt po zmianie potwierdza wartość).
- **Przy zamkniętym oknie** (wewnątrz istniejącego `savepoint before_window_closed`):
  - zmiana `registry_medication_id`, `composition_source` i `user_id` pada z `P0001` i komunikatem sprawdzonym przez `assert_history_guard_message`;
  - zmiana `product_name` i ustawienie `discontinued_on` przechodzą.
- **Kontrola spójności:** `registry` bez `registry_medication_id` i `leaflet` z nim padają z `check_violation`, a nazwa ograniczenia w komunikacie to `medications_registry_source_check`.
- **F7:** drugi wiersz z tym samym kodem w leku pada z `unique_violation` na `medication_substances_medication_id_atc_code_key`. Dwa wiersze bez kodu o różnych nazwach przechodzą.
- **Puste teksty** (`product_name`, `dose_text`, `substance_name` ze spacji) padają z `check_violation`.
- Każdy blok łapie nazwany błąd, nigdy `when others` (lekcja „Bramka musi odróżnić blokadę od niewykonania”).
- **Zmiana istniejącego CHECK 14** (`rls_checks.sql:906-942`): testy 14a i 14e ustawiają `registry_medication_id` na leku `...0005`, który ma `composition_source = 'leaflet'`. Po nowej kontroli spójności 14a dostałby `check_violation` zamiast `foreign_key_violation` (ograniczenie `check` działa przed kluczem obcym), a 14e padłby wprost. Oba `update` ustawiają więc razem `composition_source = 'registry'`; 14a nadal oczekuje `medications_registry_medication_id_fkey`.

#### 3. Sprawdzenia zapisu i kolizji

**File**: `supabase/tests/medication_interaction_checks.sql` (nowy, podchwytywany przez `scripts/db-checks.mjs` automatycznie)

**Intent**: Dowieść funkcji zapisu i reguły kolizji na prawdziwych danych seeda, jako zalogowana osoba (RLS włączone), w jednej transakcji z `rollback`.

**Contract**: Konta testowe A i B wstawione jak w `account_isolation_checks.sql`; `set local role authenticated` i `request.jwt.claims` z `sub`. Bloki `INTERACTION n` ze znacznikiem `GATE_COMPLETE medication_interaction_checks`:

1. **Zapis z rejestru, Ibuprofen Zentiva 400 mg** (wybrany po `rpl_id` z seeda): dokładnie 1 wiersz składu M01AE01, 1 okres, `composition_source = 'registry'`, `registry_medication_id` ustawione.
2. **Zapis z rejestru, wariant Sartesta z sakubitrylem:** skład równy składowi tego wariantu (sakubitryl bez kodu + walsartan), bez amlodypiny.
3. **Atomowość:** zapis z pustym `dose_text` pada `check_violation` i nie zostawia leku ani składu (liczba wierszy konta A bez zmian).
4. **Ulotka, `p_verified = true`, `diclofenacum`:** tyle wierszy, ile kodów tej nazwy w słowniku (zmierzone, nie wpisane na sztywno), każdy z kodem. Ta sama nazwa wpisana jako „ Diclofenacum ” (wielka litera, spacje) daje ten sam wynik. Nieznana nazwa z `p_verified = true` pada nazwanym błędem. `p_verified = false` daje 1 wiersz z `atc_code is null`.
5. **Kolizja podstawowa:** A ma lek B01AA i lek M01AE, więc `medication_interactions()` zwraca dokładnie 2 wiersze (A→B i B→A) z tym samym `pair_id` B01AA×M01AE.
6. **Para grupy z samą sobą (M01AE×M01AE):** dwa różne leki M01AE dają znacznik. Jeden lek z dwoma kodami M01AE nie daje wiersza z samym sobą.
7. **Brak podwójnego liczenia:** lek z kilkoma substancjami trafiającymi w tę samą grupę daje jeden wiersz na (lek, inny lek, para).
8. **Odstawienie:** lek z `discontinued_on` w przeszłości znika z wyników w obu kierunkach; z datą w przyszłości zostaje.
9. **Izolacja:** B, który ma lek M01AE, nie widzi kolizji z lekami A. `medication_interactions()` jako B nie zwraca żadnego wiersza z lekiem A. Jako A nie ma wiersza z lekiem B.
10. **Brak kolizji:** lek bez kodu (ulotka, `p_verified = false`) nie tworzy wierszy.
11. **Uprawnienia:** `anon` nie ma EXECUTE na trzech funkcjach (`has_function_privilege`).

#### 4. Lista strażników

**File**: `supabase/tests/schema_invariants_checks.sql`

**Intent**: Nowy strażnik nie wynika ze struktury bazy, więc trafia na ręczną listę INVARIANT 8.

**Contract**:

- Wiersz `('medications', 'medications_guard_core', 'UPDATE')` na liście w bloku INVARIANT 8.
- Komunikat `INVARIANT 8 OK` (`schema_invariants_checks.sql:441`) mówi o 6 strażnikach zamiast 5.

#### 5. Typy

**File**: `src/types.ts`

**Intent**: Zastąpić trzy nieatomowe komendy zapisu kontraktami funkcji i dodać DTO odczytu.

**Contract**:

- `NewMedicationCommand`, `NewMedicationSubstanceCommand` i `NewDosagePeriodCommand` zastąpione przez `AddRegistryMedicationCommand { registryProductId, doseText, startedOn }` i `AddLeafletMedicationCommand { productName, substanceName, verified, doseText, startedOn }`.
- `MedicationInteraction` — wiersz `medication_interactions()`.
- Komentarz przy typach wskazuje nową migrację jako źródło prawdy.
- Polskie komentarze F-01 zostają — tłumaczenie to osobna decyzja (`CLAUDE.md`).

#### 6. Poprawka pomiaru w roadmapie

**File**: `context/foundation/roadmap.md`

**Intent**: Zdanie „w rejestrze nie ma produktu z dwiema różnymi substancjami o tym samym kodzie” jest nieprawdziwe wobec pomiaru z 2026-09-30.

**Contract**: Blok S-02 „Decyzja przejęta z F-02” — dopisek z wynikiem pomiaru (4 produkty, Ibuprofen Zentiva łamie obecny klucz) i wybranym wariantem F7.

### Success Criteria:

#### Automated Verification:

- Migracja wchodzi na czystą bazę: `npx supabase db reset`
- Wszystkie pliki sprawdzeń SQL przechodzą, w tym nowy `medication_interaction_checks`: `npm run db:check`
- Sprawdzenia strażnika padają bez migracji strażnika: z `drop trigger medications_guard_core` na początku transakcji `rls_checks.sql` kończy się `FAILED` (jednorazowo, lokalnie, bez commitu próbki)
- Typy i lint przechodzą: `npm run typecheck` i `npm run lint`

#### Manual Verification:

- Przeczytanie nagłówka migracji i komentarza przy `medication_interactions()`: wzór dopasowania i zasada deduplikacji są zrozumiałe bez znajomości kodu

**Implementation Note**: Po zielonych sprawdzeniach automatycznych zatrzymaj się na potwierdzenie sprawdzenia ręcznego, zanim przejdziesz do fazy 2.

---

## Phase 2: Teksty o kolizji i test FR-012

### Overview

Moduł z notą i zdaniem o bezpieczeństwie oraz test z kontraktu fazy 3 planu testów. Do tego dwie czyste funkcje, których własności da się dowieść testem jednostkowym: grupowanie wyników wyszukiwania i kolejność listy. Faza nadaje się do `/10x-tdd`.

### Changes Required:

#### 1. Moduł tekstów o kolizji

**File**: `src/lib/copy/interactions.ts`

**Intent**: Jedno miejsce na każdy tekst, który mówi o kolizji albo jej braku (kontrakt S-02, pkt 1). Moduł bez importów, żeby test i smoke mogły go wczytać.

**Contract**: `INTERACTION_COPY` (`as const`) z polami:

- `flagLabel` — np. „Możliwa interakcja”;
- `note` — „Informacja poglądowa — w razie niepokoju skonsultuj z lekarzem lub farmaceutą.”;
- `noWarningIsNotSafe` — „Brak oznaczenia nie znaczy, że połączenie jest bezpieczne.”;
- `detailsHeading` i `withMedication` (wstęp „z lekiem {nazwa}”);
- `noInteractionsForMedication` — tekst szczegółów bez kolizji, bez sugestii bezpieczeństwa;
- `substanceNotCovered` — „Ta substancja nie jest objęta żadną sprawdzaną parą.”;
- `rulesIncomplete` — zdanie o niepełnym zbiorze reguł, jeśli potrzebne.

Każde pole to string. Szablony z nazwą leku mają znacznik `{nazwa}` podstawiany na ekranie, nigdy funkcję — test zbiera tylko stringi, więc tekst w funkcji ominąłby filtr.

Brzmienie wstępne. Ostateczne ustala autorka przy przeglądzie fazy 3, a test pilnuje każdej wersji. Żaden tekst nie zawiera rdzeni z `FORBIDDEN_WORDS`. Wyjątek: `noWarningIsNotSafe` zawiera rdzeń `bezpieczn`.

#### 2. Moduł tekstów formularza i listy

**File**: `src/lib/copy/medications.ts`

**Intent**: Etykiety, podpowiedzi, objaśnienia i kody błędów tras dla ekranów leków — poza zasięgiem testu języka, bo zawierają „dawkowanie”.

**Contract**:

- tytuły ekranów, etykiety pól, przyciski;
- objaśnienia z makiety: „Dawkowanie ma historię” i „Substancji nie podmienisz” (`design-draft.md:196-199`) w brzmieniu dostosowanym do nazwy handlowej;
- linijka źródła „Dane o składzie: Rejestr Produktów Leczniczych, licencja CC BY 4.0”;
- mapa `apiErrors` i `apiErrorMessage()` z białą listą, jak w `src/lib/copy/password-recovery.ts:57-79`.

Plik nie zawiera tekstów o kolizji.

#### 3. Test języka tekstów interfejsu

**File**: `scripts/fr012/interaction-copy.test.mjs`

**Intent**: Dowieść kontraktu S-02 pkt 2 na obserwowalnym wyniku filtra, nie na porównaniu z listą zdań.

**Contract**: Test importuje `../../src/lib/copy/interactions.ts`, `scripts/fr012/corpus.mjs` i `forbiddenWordsIn` z `scripts/rpl/pairs.mjs`:

- **(a) Filtr działa:** każde zdanie z `FORBIDDEN_SENTENCES` daje ≥1 trafienie. Bez tego zielony wynik (b) nic nie znaczy.
- **(b) Teksty modułu bez trafień:** każdy tekst modułu (zebrany rekurencyjnie ze wszystkich pól) ma zero trafień, poza jawnie nazwanym wyjątkiem. Pole, które nie jest stringiem ani obiektem, wywraca test.
- Test nie wymaga formuły „może mieć związek” (lekcja „Filtr języka wymaga formuły…”) i mówi dlaczego, w jednym zdaniu komentarza: formuła dotyczy związku leku z objawem, a te teksty opisują parę leków, nie objaw. Opisy par (`description`) formułę mają i sprawdza je walidator z `pairs.mjs`.
- **(c) Wyjątek jest wąski:** `noWarningIsNotSafe` daje trafienia wyłącznie na `bezpieczn`, a sprawdzone bez tego rdzenia ma zero trafień. Wyjątek jest nazwany w teście, nie w walidatorze.
- **(d) Nota i zdanie o bezpieczeństwie istnieją:** oba niepuste po `trim`. Zdanie o bezpieczeństwie zawiera zaprzeczenie („nie”), więc nie da się go zamienić na zdanie z korpusu `safety`.

#### 4. Czyste funkcje listy i wyszukiwania

**File**: `src/lib/services/medications.ts`

**Intent**: Wydzielić logikę, której własności test musi dowieść niezależnie od ekranu: kolejność listy (kontrakt S-02, pkt 4) i grupowanie wyników rejestru po nazwie.

**Contract**:

- `orderMedications(items)` — sortuje po dacie rozpoczęcia pierwszego okresu malejąco, przy remisie po `created_at` malejąco. Argument może nieść dowolne pola, w tym znacznik kolizji, ale funkcja go nie czyta.
- `groupRegistryResults(rows)` — grupuje produkty po `lower(product_name)`, zachowując pisownię pierwszego wystąpienia; zwraca nazwy alfabetycznie z liczbą wariantów.
- `escapeLikePattern(q)` — zamienia `%`, `_` i `\` we wpisie użytkowniczki na literały.
- `todayInWarsaw(now = new Date())` — data ISO „dziś” w strefie `Europe/Warsaw`. Jedyne źródło „dziś” dla domyślnej daty w formularzu i dla walidacji zod (Worker działa w UTC).
- Bez importów z aliasem `@/`, bez klienta Supabase.

**File**: `scripts/medications/medications.test.mjs`

**Contract**: Testy:

- odwrócenie wartości znacznika kolizji w wejściu nie zmienia kolejności wyniku;
- remis dat rozstrzyga `created_at`;
- „Bibloc” i „BIBLOC” to jedna grupa;
- `escapeLikePattern("50%_a\\b")` daje wzorzec bez symboli wieloznacznych;
- `todayInWarsaw` dla `2026-09-30T22:30:00Z` (00:30 czasu polskiego 1.10) zwraca `2026-10-01`.

### Success Criteria:

#### Automated Verification:

- Nowe testy przechodzą razem z istniejącymi: `npm test`
- Test języka pada, gdy do `note` dopisać „Odstaw jeden z leków.” (sprawdzenie jednorazowe, bez commitu)
- Test kolejności pada, gdy `orderMedications` sortuje najpierw po znaczniku (sprawdzenie jednorazowe, bez commitu)
- `npm run typecheck` i `npm run lint`

#### Manual Verification:

- Autorka czyta teksty w `src/lib/copy/interactions.ts` i akceptuje brzmienie albo je poprawia (test pilnuje każdej wersji)

**Implementation Note**: Po zielonych sprawdzeniach automatycznych zatrzymaj się na potwierdzenie sprawdzenia ręcznego, zanim przejdziesz do fazy 3.

---

## Phase 3: Dodanie leku z rejestru i lista ze znacznikiem

### Overview

Gwiazda przewodnia: od wpisania nazwy handlowej do znacznika na liście. Pierwszy ekran wnętrza z pozycją w menu.

### Changes Required:

#### 1. Menu

**File**: `src/lib/navigation.ts`

**Intent**: Dodać ekran leków do menu, co chroni też `/leki/**` w middleware.

**Contract**: `NAV_ITEMS = [{ href: "/leki", label: "Leki" }]`. Istniejący `scripts/navigation/navigation.test.mjs` pilnuje kształtu.

#### 2. Komponenty shadcn

**File**: `src/components/ui/{input,label,card,badge,radio-group}.tsx`

**Intent**: Pola i znacznik z biblioteki komponentów zamiast ręcznego HTML ze stylami.

**Contract**:

- dodane przez `npx shadcn@latest add`;
- oczyszczone z klas `dark:` z kolorami;
- `badge` dostaje wariant `interaction` na tokenach `bg-interaction text-interaction-foreground border-interaction-border`;
- wybór wariantu: `radio-group` albo natywne `<input type="radio">` w `label` — decyzja implementacyjna, byle działało bez JavaScriptu.

#### 3. Lista leków

**File**: `src/pages/leki/index.astro`

**Intent**: Pokazać leki nieodstawione ze znacznikiem przy każdym leku z pary oraz stałą notę pod listą.

**Contract**:

- czyta leki z pierwszym okresem i wynik `rpc('medication_interactions')` klientem z sesji;
- kolejność przez `orderMedications`;
- znacznik = `INTERACTION_COPY.flagLabel` w `badge` wariantu `interaction`;
- pod listą zawsze `note` i `noWarningIsNotSafe`;
- każda pozycja ma atrybut `data-medication-id="<id>"`, a znacznik leży wewnątrz tego elementu (smoke sprawdza znacznik per lek);
- `?dodano=<id>` wyróżnia nowo dodaną pozycję;
- pusta lista ma zachętę do dodania leku, bez przykładowych wpisów;
- przycisk „Dodaj lek” prowadzi do `/leki/nowy`;
- każda pozycja to odnośnik do `/leki/[id]` — strona powstaje w fazie 4, do tego czasu odnośnik zwraca 404.

#### 4. Dodanie z rejestru

**File**: `src/pages/leki/nowy.astro` (+ `src/components/medications/AddMedicationForm.tsx`, jeśli formularz potrzebuje stanu wysyłania)

**Intent**: Trzy kroki na jednej stronie renderowanej serwerowo, sterowane parametrami GET.

**Contract**:

- `?q=` → wyniki `registry_products` przez `ilike` z `escapeLikePattern`, zgrupowane `groupRegistryResults`, najwyżej 20 nazw, każda jako odnośnik `?nazwa=`;
- `?nazwa=` → warianty tej nazwy (bez rozróżniania wielkości liter): moc, postać, skład z `registry_substances` (nazwy substancji w kolejności `position`, bez dubli kodów); jeden wariant jest zaznaczony z góry;
- formularz POST do `/api/medications` z `source=registry`, `registryProductId`, `doseText`, `startedOn` (domyślnie `todayInWarsaw()`);
- objaśnienia z `MEDICATION_COPY`;
- odnośnik „Nie ma mojego leku — dodam z ulotki” (strona w fazie 4);
- brak wyników pokazuje ten sam odnośnik;
- linijka źródła RPL przy wynikach;
- `?error=` przez `apiErrorMessage()`.

#### 5. Trasa zapisu

**File**: `src/pages/api/medications/index.ts`

**Intent**: Przyjąć formularz, zwalidować i zapisać atomowo przez funkcję w bazie.

**Contract**:

- `export const prerender = false`, `POST`;
- zod `discriminatedUnion("source", [...])`:
  - `registry`: uuid, niepusty `doseText` ≤ 200 znaków, `startedOn` ISO date nie późniejsza niż `todayInWarsaw()`;
  - wariant `leaflet` dochodzi w fazie 4;
- błąd walidacji → `redirect(/leki/nowy?error=<kod>)` z zachowaniem kroku;
- brak sesji → 401: `/api/medications` nie leży pod `PROTECTED_ROUTES`, więc trasa sama sprawdza `locals.user` i odrzuca też sesję z odnośnika resetu hasła (middleware robi to już dla każdej trasy spoza dozwolonych);
- `rpc('add_medication_from_registry')`, a sukces to `redirect(/leki?dodano=<id>)`;
- błąd bazy → log `{ code }` bez danych zdrowotnych i ogólny kod błędu, nigdy surowe `error.message`.

#### 6. Kontrast bursztynowego tekstu

**File**: `scripts/tokens/contrast.mjs`

**Intent**: Jeśli znacznik albo ikona używa `interaction-foreground` na tle innym niż `interaction` (np. obramowany znacznik na `card`), para musi trafić do bramki 7 : 1.

**Contract**: Wpis w `EXPLICIT_PAIRS` wyłącznie dla faktycznie użytej pary tekst–tło. Przy `badge` na tle `interaction` nic nie trzeba dopisywać.

### Success Criteria:

#### Automated Verification:

- `npm test` (w tym `navigation.test.mjs` z niepustym `NAV_ITEMS`, skaner kolorów bez nowych wyjątków, kontrast)
- `npm run lint` i `npm run typecheck`
- `npm run build`
- `npm run smoke` przechodzi bez regresji istniejących kroków (nowe kroki dochodzą w fazie 5)

#### Manual Verification:

- Na telefonie i na dużym ekranie: dodanie „Acenocumarol”, potem „Ibuprom” pokazuje znacznik przy obu; nota i zdanie o bezpieczeństwie widoczne pod listą
- Wyszukanie „Sartesta” pokazuje warianty z różnym składem; nazwa z jednym wariantem nie wymaga dodatkowego kliknięcia
- Wpis `%` albo `_` w wyszukiwarce nie zwraca całego rejestru
- Lista po dodaniu trzeciego leku, starszego datą, stawia go niżej; znacznik nie zmienia kolejności
- Wylogowane wejście na `/leki/nowy` przekierowuje do logowania

**Implementation Note**: Po zielonych sprawdzeniach automatycznych zatrzymaj się na potwierdzenie sprawdzenia ręcznego, zanim przejdziesz do fazy 4.

---

## Phase 4: Szczegóły leku i dodanie z ulotki

### Overview

Pełna treść informacji o kolizji ze składem (FR-006, FR-007) i ścieżka leku spoza rejestru (FR-003).

### Changes Required:

#### 1. Szczegóły leku

**File**: `src/pages/leki/[id].astro`

**Intent**: Skład preparatu i każda informacja o kolizji z notą w jednym miejscu.

**Contract**:

- lek (RLS: cudzy albo nieistniejący daje 404);
- dawkowanie i data rozpoczęcia;
- pełny skład: nazwa substancji i kod, a przy kodzie `null` linijka `substanceNotCovered`; przy leku z rejestru nazwa wariantu (moc, postać) i linijka źródła RPL;
- sekcja kolizji: dla każdego wiersza `medication_interactions()` z `medication_id = id` — nazwa drugiego leku (odnośnik), `description` pary i `note` przy każdej informacji;
- kolejność kolizji: alfabetycznie po nazwie drugiego leku, nigdy według podejrzenia;
- bez kolizji: `noInteractionsForMedication` i `noWarningIsNotSafe`.

#### 2. Dodanie z ulotki

**File**: `src/pages/leki/nowy/z-ulotki.astro`

**Intent**: Lek spoza rejestru z substancją, która uczestniczy w regułach, gdy jest w słowniku.

**Contract**:

- pola: nazwa leku (wolny tekst), substancja (`<input list>` + `<datalist>` ze 100 nazwami `normalized_name` mającymi kod), dawkowanie, data rozpoczęcia;
- linijka, że pierwsza wersja przyjmuje jedną substancję;
- stan „brak dopasowania” (`?niedopasowana=<wpis>` z trasy): lista podobnych pozycji (wspólny przedrostek po złożeniu wielkości liter i ogonków) i pole wyboru „Zapisz bez sprawdzania — ta substancja nie będzie objęta żadną parą”; wpisane wartości zostają w polach.

#### 3. Trasa zapisu — wariant ulotki

**File**: `src/pages/api/medications/index.ts`

**Intent**: Obsłużyć `source=leaflet` bez możliwości cichego zapisu bez kodu.

**Contract**:

- zod: `productName`, `substanceName` (niepuste, ≤ 200), `confirmUnverified` (opcjonalne), `doseText`, `startedOn`;
- trasa porównuje `substanceName` ze słownikiem tą samą regułą co funkcja (`lower(btrim())`, tylko nazwy z kodem), żeby trasa i funkcja nie rozeszły się w ocenie dopasowania:
  - dopasowanie → `rpc('add_medication_from_leaflet', { p_verified: true, … })`;
  - brak dopasowania bez `confirmUnverified` → redirect do stanu „brak dopasowania”;
  - brak dopasowania z potwierdzeniem → `p_verified: false`;
- sukces → `/leki?dodano=<id>`.

**File**: `src/lib/services/medications.ts` (+ test w `scripts/medications/medications.test.mjs`)

**Contract**: `similarSubstances(input, names)` — pozycje słownika o wspólnym przedrostku ≥ 4 znaków po złożeniu wielkości liter i ogonków, najwyżej 5. Test: „ibuprofen” zwraca „ibuprofenum”, „xyz” zwraca pustą listę.

### Success Criteria:

#### Automated Verification:

- `npm test` (nowy test `similarSubstances`)
- `npm run lint`, `npm run typecheck`, `npm run build`
- `npm run db:check` bez regresji

#### Manual Verification:

- Szczegóły leku z pary: skład, opis pary z nazwą drugiego leku i nota przy informacji
- Szczegóły leku bez pary: brak sekcji kolizji, widoczne zdanie o bezpieczeństwie
- Lek z ulotki z substancją „ibuprofenum” z podpowiedzi i lek z rejestru z grupy B01AA mają znacznik
- Wpis „ibuprofen” (spoza listy) zwraca ekran z propozycją „ibuprofenum”; zapis bez zaznaczenia pola nie przechodzi
- Lek z ulotki zapisany bez sprawdzania ma w szczegółach linijkę o substancji nieobjętej parą
- Adres szczegółów leku z innego konta zwraca 404

**Implementation Note**: Po zielonych sprawdzeniach automatycznych zatrzymaj się na potwierdzenie sprawdzenia ręcznego, zanim przejdziesz do fazy 5.

---

## Phase 5: Smoke — znacznik i nota na zbudowanej aplikacji

### Overview

Kontrakt S-02 pkt 3: krok smoke dowodzi, że widok z kolizją zawiera notę. Kroki idą przez prawdziwe trasy HTTP, tak jak przeglądarka.

### Changes Required:

#### 1. Helper z treścią odpowiedzi i kroki leków

**File**: `scripts/smoke.mjs`

**Intent**: Sprawdzić przepływ od formularza do znacznika i noty na zbudowanej aplikacji z lokalnym Supabase.

**Contract**:

- helper `requestPage(path, { jar })` zwracający `{ status, location, body }` (obok istniejącego `request()`, które zostaje);
- kroki w trybie konta jednorazowego z lokalnym Supabase (ta sama bramka co izolacja):
  1. znalezienie w rejestrze jednego produktu B01AA i jednego M01AE klientem z sesji (identyfikatory z danych, nie wpisane na sztywno);
  2. dwa POST do `/api/medications` z `Origin` wyprowadzonym przez `formOrigin('/leki/nowy')`, każdy odpowiada 302 na `/leki?dodano=`;
  3. GET `/leki`: element z `data-medication-id` każdego z dwóch leków zawiera `flagLabel`, a strona zawiera `note` (nie liczymy wystąpień etykiety na całej stronie — legenda albo objaśnienie zmieniłyby wynik);
  4. GET `/leki/<id>` zawiera `note` i opis pary;
  5. lek z ulotki `p_verified=false` → szczegóły zawierają `substanceNotCovered`;
  6. GET `/leki/<id cudzego leku>` z drugiego konta zwraca 404.
- teksty z `src/lib/copy/interactions.ts`, nie przepisane do smoke.

**File**: `package.json`

**Contract**: skrypt `smoke` dostaje `--experimental-strip-types`, żeby smoke mógł zaimportować moduł `.ts`. `npm run smoke` w CI używa tego samego skryptu.

### Success Criteria:

#### Automated Verification:

- `npm run build`, `npx astro preview stop`, świeży `npm run preview`, potem `npm run smoke` — wszystkie kroki zielone (lekcja „Zatrzymaj stary podgląd…”)
- Krok z notą pada, gdy nota zniknie z `/leki/[id]` (sprawdzenie jednorazowe, bez commitu)
- Bieg smoke pisze do lokalnej bazy: świeże konta w lokalnym `auth.users`, `.env` odsunięty na czas biegu (lekcja „Lokalne bramki sprawdź…”)

#### Manual Verification:

- CI na PR: joby `ci` i `smoke` zielone

**Implementation Note**: Po zielonych sprawdzeniach automatycznych zatrzymaj się na potwierdzenie sprawdzenia ręcznego, zanim przejdziesz do fazy 6.

---

## Phase 6: Podpowiedzi przy wpisywaniu nazwy (odkładalna)

### Overview

Wygoda nałożona na działający formularz: podpowiedzi nazw w trakcie pisania. Bez JavaScriptu formularz „Szukaj” działa jak wcześniej. Faza nie zmienia bazy ani trasy zapisu. Przy braku czasu przechodzi do osobnej zmiany bez straty funkcji.

### Changes Required:

#### 1. Trasa podpowiedzi

**File**: `src/pages/api/registry/search.ts`

**Intent**: Pierwsza trasa JSON w repozytorium; zwraca nazwy do podpowiedzi.

**Contract**:

- `GET ?q=` (zod: 2–60 znaków), `prerender = false`;
- bez sesji → 401 JSON;
- odpowiedź `{ names: { name, variants }[] }` z `groupRegistryResults`, najwyżej 10;
- nagłówek `Cache-Control: private, no-store`.

#### 2. Komponent podpowiedzi

**File**: `src/components/medications/RegistrySearch.tsx`, `src/components/hooks/useRegistrySuggestions.ts`

**Intent**: Pole z listą podpowiedzi, które zastępuje zwykłe pole wyszukiwarki, gdy JavaScript działa. Wybór podpowiedzi przechodzi do `?nazwa=`.

**Contract**:

- `client:load` w `nowy.astro`;
- opóźnienie ~250 ms, porzucanie spóźnionych odpowiedzi (`AbortController`);
- wzorzec ARIA combobox: `role="combobox"`, `aria-expanded`, `aria-activedescendant`, `role="listbox"`;
- klawiatura: strzałki, Enter, Esc;
- przycisk „Szukaj” zostaje.

### Success Criteria:

#### Automated Verification:

- `npm run lint`, `npm run typecheck`, `npm run build`, `npm test`
- `npm run smoke` bez regresji; nowy krok: GET `/api/registry/search?q=ibu` z sesją zwraca 200 i niepustą listę, bez sesji 401

#### Manual Verification:

- W prawdziwej przeglądarce: podpowiedzi przy pisaniu, wybór klawiaturą i myszą, Esc zamyka listę
- Z wyłączonym JavaScriptem formularz „Szukaj” działa jak w fazie 3
- Czytnik ekranu (VoiceOver) odczytuje liczbę podpowiedzi i aktywną pozycję

---

## Testing Strategy

### Unit Tests:

- `scripts/fr012/interaction-copy.test.mjs` — teksty o kolizji przez filtr FR-012, wyjątek `bezpieczn` nazwany i wąski, filtr sprawdzony na korpusie.
- `scripts/medications/medications.test.mjs` — kolejność niezależna od znacznika, grupowanie nazw, ucieczka `like`, podobne substancje.

### Integration Tests:

- `supabase/tests/medication_interaction_checks.sql` — zapis atomowy, deduplikacja, ulotka z wieloma kodami, reguła kolizji (symetria, para grupy z samą sobą, brak liczenia z samym sobą, odstawienie, izolacja).
- `supabase/tests/rls_checks.sql` — strażnik UPDATE na `medications`, kontrola spójności, F7, puste teksty.
- `supabase/tests/schema_invariants_checks.sql` — INVARIANT 8 z nowym strażnikiem.
- `scripts/smoke.mjs` — znacznik na liście i nota w szczegółach przez prawdziwe trasy.

### Manual Testing Steps:

1. Zaloguj się, dodaj „Acenocumarol” (dowolny wariant), potem „Ibuprom”: znacznik przy obu, nota pod listą.
2. Otwórz szczegóły Ibupromu: skład, opis pary z nazwą Acenocumarolu, nota.
3. Dodaj z ulotki lek „Test” z substancją „ibuprofen”: ekran proponuje „ibuprofenum”. Wybierz propozycję — nowy lek ma znacznik.
4. Dodaj z ulotki lek z substancją spoza słownika, zaznaczając „Zapisz bez sprawdzania”: brak znacznika, w szczegółach linijka o substancji nieobjętej parą.
5. Na telefonie: lista czytelna, zakładka „Leki” w dolnym pasku, znacznik nie wygląda jak alarm.

## Performance Considerations

- `ilike` na 3273 wierszach bez indeksu — pełny skan jest akceptowalny przy tej skali (wniosek, nie pomiar czasu). Wróć do tematu, jeśli rejestr zostanie rozszerzony o rząd wielkości.
- `medication_interactions()` łączy leki jednej osoby (kilka–kilkanaście) z 24 parami. Indeks `atc_code text_pattern_ops` jest tylko na rejestrze, a tutaj nie jest potrzebny.

## Migration Notes

- Kontrola spójności i nowe `check` wchodzą bez `not valid`. Żadne środowisko nie ma jeszcze wierszy `medications`, bo zapisu nie było. Gdyby produkcja miała wiersze testowe, `db reset` lokalnie tego nie pokaże — przed wdrożeniem sprawdź `select count(*) from medications` na produkcji.
- Wycofanie: nowa migracja odwrotna (drop funkcji, wyzwalacza, indeksu, ograniczeń). Dane leków zapisane przez funkcje pozostają poprawne i bez nich.

## References

- Research: `context/changes/add-medication-with-interaction-flag/research.md`
- Roadmapa S-02: `context/foundation/roadmap.md` (blok S-02)
- PRD: `context/foundation/prd.md:56-69` (US-01), `:117-133` (FR-003, FR-006, FR-007), `:144` (FR-012)
- Makieta: `context/changes/auth-login-design/design-draft.md:180-199`
- Wzorce: `supabase/tests/rls_checks.sql:260-300` (zamknięte okno), `supabase/tests/account_isolation_checks.sql:656-690` (odcisk funkcji), `src/pages/api/auth/password-reset-request.ts`, `src/lib/copy/password-recovery.ts`, `scripts/navigation/navigation.test.mjs`
- Dług F-02: `context/archive/2026-09-23-interaction-rules-seed/reviews/impl-review.md` (F2, F7)
- Checklista schematu: `context/foundation/test-plan.md` §6.4

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Baza — zapis leku, kolizje, strażnik

#### Automated

- [x] 1.1 Migracja wchodzi na czystą bazę: `npx supabase db reset` — da38bed
- [x] 1.2 Wszystkie pliki sprawdzeń SQL przechodzą, w tym nowy `medication_interaction_checks`: `npm run db:check` — da38bed
- [x] 1.3 Sprawdzenia strażnika padają bez migracji strażnika — da38bed
- [x] 1.4 Typy i lint przechodzą: `npm run typecheck` i `npm run lint` — da38bed

#### Manual

- [x] 1.5 Nagłówek migracji i komentarz przy `medication_interactions()` zrozumiałe bez znajomości kodu — da38bed

### Phase 2: Teksty o kolizji i test FR-012

#### Automated

- [x] 2.1 Nowe testy przechodzą razem z istniejącymi: `npm test` — 4b37d99
- [x] 2.2 Test języka pada po dopisaniu zdania zakazanego do `note` — 4b37d99
- [x] 2.3 Test kolejności pada, gdy `orderMedications` sortuje po znaczniku — 4b37d99
- [x] 2.4 `npm run typecheck` i `npm run lint` — 4b37d99

#### Manual

- [x] 2.5 Autorka akceptuje brzmienie tekstów w `src/lib/copy/interactions.ts` — 4b37d99

### Phase 3: Dodanie leku z rejestru i lista ze znacznikiem

#### Automated

- [x] 3.1 `npm test` (nawigacja, skaner kolorów, kontrast) — d251cc4
- [x] 3.2 `npm run lint` i `npm run typecheck` — d251cc4
- [x] 3.3 `npm run build` — d251cc4
- [x] 3.4 `npm run smoke` bez regresji istniejących kroków — d251cc4

#### Manual

- [x] 3.5 Acenocumarol + Ibuprom: znacznik przy obu, nota i zdanie o bezpieczeństwie pod listą — d251cc4
- [x] 3.6 Sartesta pokazuje warianty z różnym składem; jeden wariant bez dodatkowego kliknięcia — d251cc4
- [x] 3.7 `%` i `_` w wyszukiwarce nie zwracają całego rejestru — d251cc4
- [x] 3.8 Kolejność wg daty rozpoczęcia, niezależna od znacznika — d251cc4
- [x] 3.9 Wylogowane wejście na `/leki/nowy` przekierowuje do logowania — d251cc4

### Phase 4: Szczegóły leku i dodanie z ulotki

#### Automated

- [x] 4.1 `npm test` (test `similarSubstances`) — 106eb84
- [x] 4.2 `npm run lint`, `npm run typecheck`, `npm run build` — 106eb84
- [x] 4.3 `npm run db:check` bez regresji — 106eb84

#### Manual

- [x] 4.4 Szczegóły leku z pary: skład, opis pary z nazwą drugiego leku, nota — 106eb84
- [x] 4.5 Szczegóły leku bez pary: brak sekcji kolizji, zdanie o bezpieczeństwie — 106eb84
- [x] 4.6 Lek z ulotki z „ibuprofenum” i lek B01AA mają znacznik — 106eb84
- [x] 4.7 „ibuprofen” zwraca propozycję „ibuprofenum”; zapis bez potwierdzenia nie przechodzi — 106eb84
- [x] 4.8 Lek zapisany bez sprawdzania ma linijkę o substancji nieobjętej parą — 106eb84
- [x] 4.9 Szczegóły leku z innego konta zwracają 404 — 106eb84

### Phase 5: Smoke — znacznik i nota na zbudowanej aplikacji

#### Automated

- [x] 5.1 Świeży podgląd i `npm run smoke` — wszystkie kroki zielone
- [x] 5.2 Krok z notą pada, gdy nota zniknie ze szczegółów
- [x] 5.3 Bieg smoke pisze do lokalnej bazy

#### Manual

- [ ] 5.4 CI na PR: joby `ci` i `smoke` zielone

### Phase 6: Podpowiedzi przy wpisywaniu nazwy (odkładalna)

#### Automated

- [ ] 6.1 `npm run lint`, `npm run typecheck`, `npm run build`, `npm test`
- [ ] 6.2 `npm run smoke` bez regresji; trasa podpowiedzi 200 z sesją, 401 bez

#### Manual

- [ ] 6.3 Podpowiedzi w przeglądarce: klawiatura, mysz, Esc
- [ ] 6.4 Bez JavaScriptu formularz „Szukaj” działa
- [ ] 6.5 VoiceOver odczytuje liczbę podpowiedzi i aktywną pozycję
