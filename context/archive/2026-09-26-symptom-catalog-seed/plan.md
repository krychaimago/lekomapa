# Zamknięta lista objawów — plan wdrożenia

## Overview

Do bazy trafia trzeci zbiór dostarczany razem z produktem: katalog 34 objawów w ośmiu kategoriach układów, z potocznymi słowami wyszukiwania przy każdej pozycji. Oba zbiory (objawy i słowa) są wspólne dla wszystkich kont, czytelne tylko po zalogowaniu i niezapisywalne z aplikacji. RLS powstaje w tej samej migracji co tabele.

Fundament F-03 z `context/foundation/roadmap.md`, issue #11. Odblokowuje S-05 (wpis o samopoczuciu).

## Current State Analysis

- **Treść listy jest gotowa**: issue #3 (rozstrzygnięcie Q-2, 2026-09-21) zawiera 34 pozycje z kategoriami i 1–3 słowami potocznymi przy każdej. Słowa są opisane jako „propozycja wyjściowa”, do przejrzenia przez autorkę.
- **Rozkład kategorii** (issue #3): pokarmowy 8, nerwowy 7, psychika 3, skóra 3, krążenie 3, ogólne 3, mięśnie 2, pozostałe 5.
- **Wzorzec tabel wspólnych z F-02** (`supabase/migrations/20260924120000_registry_schema.sql:148-172`): RLS włączone, jedna polityka `SELECT` dla `authenticated`, brak polityk zapisu, `revoke insert, update, delete, truncate` od `anon` i `authenticated` jako druga warstwa.
- **Sprawdzenia SQL** (`supabase/tests/rls_checks.sql`): jedna transakcja z rollbackiem, CHECK 1–14, nazwane ograniczenia łapane po nazwie (np. `:604-659`). Ostatni numer to CHECK 14 (`:805`).
- **Krok tabel wspólnych w smoke** (`scripts/smoke.mjs:263-384`): tablica `sharedTargets`, na tabelę cztery kroki. Pierwszy krok wymaga co najmniej jednego wiersza (`:335`), więc tabela bez danych wywraca smoke.
- **Typy tabel wspólnych** w `src/types.ts:104-182`, sekcja „Shared, read-only data”.
- **Tabel katalogu objawów nie ma** (roadmapa, `## Baseline`).

## Desired End State

- `public.symptoms`: 34 wiersze, każdy ze stałym angielskim kluczem, polską nazwą, kategorią (jedna z 8 wartości), kolejnością w kategorii i dwiema pustymi kolumnami kodu źródłowego.
- `public.symptom_search_terms`: słowa potoczne z przejrzanej listy, co najmniej jedno przy każdym objawie.
- Zalogowane konto czyta oba zbiory; nie może w nich nic dodać, zmienić ani usunąć; bez sesji nic nie widać.
- `src/types.ts` ma typy obu tabel, typ kategorii oraz stałą z polskimi etykietami i kolejnością kategorii dla S-05.
- Weryfikacja: `rls_checks.sql` (CHECK 15–18) i `npm run smoke` przechodzą przeciw lokalnemu Supabase po `npx supabase db reset`.

### Key Discoveries:

- Polska nazwa będzie dopracowywana w użyciu (roadmapa, F-03 Risk), więc nie może być identyfikatorem. Kolejne migracje odwołują się do objawu po `key`.
- Pole `sort_order` będzie przestawiane kolejnymi migracjami. Zwykłe `unique (category, sort_order)` odrzuci zamianę miejscami dwóch pozycji w jednym `UPDATE`.
- Kod bez nazwy słownika jest niejednoznaczny (ten sam kod znaczy co innego w MedDRA i ICD-10), stąd para kolumn pilnowana razem.

## What We're NOT Doing

- UI wyboru objawu, grupowanie i wyszukiwarka — S-05.
- Tabela wpisów dzienniczka i klucz obcy do `symptoms` — S-05.
- Słowa wyszukiwania dopisywane przez użytkowniczkę w aplikacji. Zbiór jest tylko do odczytu; słowa uzupełnia autorka kolejnymi migracjami.
- Mapowanie notatki własnymi słowami na objaw z listy. Notatka nie uczestniczy w niczym poza sobą (FR-008).
- Pozycja „inny objaw” (Q-2).
- Wypełnianie kodu źródłowego i łączenie ze zbiorem działań niepożądanych — wersja 2.
- Osobna tabela słownikowa kategorii (roadmapa, wymogi F-03).
- Generator seeda na wzór F-02: przy 34 wierszach migracja pisana ręcznie jest czytelniejsza niż skrypt.

## Implementation Approach

Dwie fazy. Najpierw schemat z RLS i sprawdzeniami na pustych tabelach, żeby struktura była zweryfikowana, zanim autorka poświęci czas na listę. Potem roboczy plik listy do przeglądu, bramka ręczna i dopiero z przejrzanej listy migracja z danymi. Migracja z danymi da się uruchomić ponownie bez skutków (`on conflict do nothing`), a wiersze odnajduje po `key`, nie po nazwie.

## Critical Implementation Details

- **Kolejność w kategorii**: ograniczenie `unique (category, sort_order)` ma być `deferrable initially deferred`. Bez tego późniejsza migracja zamieniająca miejscami dwie pozycje trafi na konflikt w trakcie `UPDATE`.
- **Smoke dopiero w fazie 2**: pierwszy krok tabel wspólnych wymaga odczytu wiersza, więc wpisy w `sharedTargets` dochodzą razem z danymi, nie ze schematem.

## Faza 1: Schemat katalogu z RLS

### Overview

Dwie puste tabele z ograniczeniami, RLS i odebranymi prawami zapisu, typy w `src/types.ts` oraz sprawdzenia SQL struktury i ograniczeń.

### Changes Required:

#### 1. Migracja schematu

**File**: `supabase/migrations/20260926120000_symptom_catalog_schema.sql`

**Intent**: Tworzy katalog objawów i słowa wyszukiwania jako wspólne dane tylko do odczytu, z RLS w tej samej migracji (lekcja „Włącz RLS w tej samej migracji”). Komentarze w pliku po angielsku, na wzór `20260924120000_registry_schema.sql`.

**Contract**:

- `public.symptoms`:
  - `id uuid` PK, `default gen_random_uuid()`.
  - `key text not null unique`, `check (key ~ '^[a-z][a-z0-9_]*$')`; stały identyfikator, nigdy nie zmieniany po wgraniu.
  - `name text not null`, `check (btrim(name) <> '')`, unikalna bez względu na wielkość liter (`create unique index symptoms_name_lower_key on public.symptoms (lower(name))`, poprawka F3 z przeglądu fazy 1); polska nazwa widoczna dla użytkowniczki.
  - `category text not null`, `check (category in ('digestive', 'nervous', 'mental', 'skin', 'circulatory', 'general', 'muscular', 'other'))`.
  - `sort_order smallint not null`, `check (sort_order > 0)`; `unique (category, sort_order) deferrable initially deferred`.
  - `source_vocabulary text`, `source_code text`, oba puste; `check ((source_vocabulary is null) = (source_code is null))` oraz niepustość po `btrim`, gdy wypełnione.
  - `created_at timestamptz not null default now()`.
- `public.symptom_search_terms`:
  - `id uuid` PK.
  - `symptom_id uuid not null references public.symptoms (id) on delete cascade`, bez osobnego indeksu — pokrywa go `unique (symptom_id, term)` (poprawka F6 z przeglądu fazy 1).
  - `term text not null`, `check (term <> '' and term = lower(btrim(term)))`; słowa zapisywane małymi literami, bez spacji na brzegach.
  - `unique (symptom_id, term)`. To samo słowo przy dwóch różnych objawach jest dozwolone.
- Każde ograniczenie ma jawną nazwę (sprawdzenia łapią je po nazwie).
- Komentarz do tabeli `symptoms`: zbiór dostarczony z produktem, ładowany wyłącznie migracjami; zakres to filtr przy wczytywaniu, nie flaga przy wierszu; rozszerzenie listy to doładowanie wierszy; wybór objawu niczego nie stwierdza o przyczynie (FR-012).
- RLS na obu tabelach; po jednej polityce `for select to authenticated using (true)`; brak polityk dla `anon` i brak polityk zapisu; `revoke insert, update, delete, truncate ... from anon, authenticated`.

#### 2. Typy

**File**: `src/types.ts`

**Intent**: Typy obu tabel w sekcji danych wspólnych (bez komend zapisu) oraz jedno miejsce z polskimi etykietami i kolejnością kategorii, z którego weźmie je S-05.

**Contract**:

- `SymptomCategory` — unia ośmiu wartości zgodna z `symptoms_category_check`.
- `SYMPTOM_CATEGORIES` — tablica tylko do odczytu `{ value: SymptomCategory; label: string }` w kolejności: pokarmowy, nerwowy, psychika, skóra, krążenie, ogólne, mięśnie, pozostałe (etykiety po polsku jak w issue #3).
- `Symptom` i `SymptomSearchTerm` — wiersze tabel; kolumny kodu źródłowego jako `string | null`.

#### 3. Sprawdzenia SQL

**File**: `supabase/tests/rls_checks.sql`

**Intent**: Dowód, że oba zbiory są izolowane i ograniczenia działają, na wzór CHECK 9, 10 i 12. Każde sprawdzenie blokady łapie nazwany błąd, nie `when others` (lekcja „Bramka musi odróżnić blokadę od niewykonania”).

**Contract** (dopisane przed końcowym komunikatem, w tej samej transakcji z rollbackiem):

- **CHECK 15**: RLS włączone na `symptoms` i `symptom_search_terms`; na każdej dokładnie jedna polityka, `SELECT`, wyłącznie dla `authenticated`.
- **CHECK 16**: `anon` i `authenticated` nie mają `INSERT`, `UPDATE`, `DELETE`, `TRUNCATE` na obu tabelach.
- **CHECK 17**: ograniczenia odrzucają po nazwie: nieznaną kategorię, klucz z wielką literą, pół wypełnionego kodu źródłowego, powtórzony `key`, powtórzoną parę `(category, sort_order)` przy zatwierdzeniu, słowo z wielką literą albo spacją na brzegu, powtórzone słowo przy tym samym objawie. Poprawny objaw z dwoma słowami przechodzi; to samo słowo przy dwóch objawach przechodzi; zamiana `sort_order` dwóch objawów jednym `UPDATE` przechodzi.

### Success Criteria:

#### Automated Verification:

- Migracje stosują się od zera: `npx supabase db reset`
- Sprawdzenia SQL przechodzą, w tym CHECK 15–17: `docker exec -i $(docker ps -qf name=supabase_db) psql -U postgres -d postgres -v ON_ERROR_STOP=1 -f - < supabase/tests/rls_checks.sql`
- Typy przechodzą: `npm run typecheck`
- Lint przechodzi: `npm run lint`

#### Manual Verification:

- Autorka czyta komunikaty CHECK 15–17 w wyniku sprawdzeń i potwierdza, że opisują to, co ma być zablokowane

**Implementation Note**: Po przejściu weryfikacji automatycznej zatrzymaj się na potwierdzenie autorki przed fazą 2.

---

## Faza 2: Przegląd listy i dane katalogu

### Overview

Roboczy plik listy do przeglądu, bramka ręczna, potem migracja z danymi z przejrzanej listy, sprawdzenie kompletności i wpisy w smoke.

### Changes Required:

#### 1. Roboczy plik listy

**File**: `context/changes/symptom-catalog-seed/symptom-list.md`

**Intent**: Lista w postaci, którą autorka przegląda bez czytania SQL. Źródło danych dla migracji — migracja przepisuje ją 1:1.

**Contract**: tabela z kolumnami: kategoria, kolejność w kategorii, `key`, nazwa, słowa wyszukiwania. Wypełniona z issue #3; kolejność w kategorii wg numerów z issue jako propozycja. Proponowane klucze: `nausea`, `vomiting`, `diarrhea`, `constipation`, `abdominal_pain`, `loss_of_appetite`, `dry_mouth`, `taste_change`, `headache`, `dizziness`, `drowsiness`, `insomnia`, `tremor`, `tingling_numbness`, `concentration_problems`, `anxiety`, `low_mood`, `irritability`, `rash`, `itching`, `excessive_sweating`, `palpitations`, `orthostatic_hypotension`, `edema`, `fatigue`, `weight_change`, `fever`, `muscle_pain`, `muscle_cramps`, `cough`, `dyspnea`, `vision_disturbance`, `frequent_urination`, `decreased_libido`. Słowa zapisane małymi literami.

**Bramka ręczna**: autorka poprawia nazwy, słowa i kolejność „od najczęstszych” i zatwierdza plik. Migracja powstaje dopiero po zatwierdzeniu.

#### 2. Migracja z danymi

**File**: `supabase/migrations/20260926120100_symptom_catalog_seed.sql`

**Intent**: Wgrywa przejrzaną listę. Da się ją uruchomić ponownie bez skutków; słowa wiąże z objawem po `key`.

**Contract**: `insert into public.symptoms (key, name, category, sort_order) ... on conflict (key) do nothing`; `insert into public.symptom_search_terms (symptom_id, term)` z `select` łączącym listę `(key, term)` z `symptoms` po `key`, `on conflict (symptom_id, term) do nothing`. Kolumny kodu źródłowego nie są podawane. Nagłówek: skąd lista (issue #3, zatwierdzony `symptom-list.md`, data) i że kolejna zmiana listy to nowa migracja.

#### 3. Sprawdzenie kompletności

**File**: `supabase/tests/rls_checks.sql`

**Intent**: Dowód, że do bazy trafiła cała lista w zatwierdzonym kształcie.

**Contract**: **CHECK 18**: dokładnie 34 objawy; rozkład kategorii 8/7/3/3/3/3/2/5 (albo zmieniony w przeglądzie — wtedy liczby z zatwierdzonego pliku); każdy objaw ma co najmniej jedno słowo; liczba słów równa liczbie w zatwierdzonym pliku; `sort_order` w każdej kategorii to ciąg 1..n bez luk; kolumny kodu źródłowego puste we wszystkich wierszach.

**Pozycja w pliku**: CHECK 18 stoi w `rls_checks.sql` **przed** CHECK 17 (numeracja bez zmian, zmienia się tylko miejsce). Skrypt to jedna transakcja zakończona rollbackiem, więc syntetyczne wiersze `check_17_*` żyją do końca biegu — CHECK 18 dopisany na końcu policzyłby więcej niż 34 objawy i padł fałszywie. Tak samo w F-02 CHECK 11 stoi przed danymi testowymi.

#### 4. Smoke

**File**: `scripts/smoke.mjs`

**Intent**: Te same cztery kroki co przy rejestrze: zalogowane konto czyta, nie dodaje, nie zmienia ani nie usuwa, bez sesji nic nie widzi.

**Contract**: dwa nowe wpisy w `sharedTargets`: `symptoms` (`guardedColumn: "name"`, syntetyczny wiersz z kluczem `smoke_...`) i `symptom_search_terms` (`guardedColumn: "term"`, `symptom_id` z odczytanego wiersza `symptoms`). Komentarz nad sekcją wymienia nowe tabele. Oczekiwany błąd zapisu jak dla rejestru: `42501`, `permission denied for table <name>` — zmierzyć przed ustawieniem warunku.

### Success Criteria:

#### Automated Verification:

- Migracje stosują się od zera: `npx supabase db reset`
- Sprawdzenia SQL przechodzą, w tym CHECK 18: `docker exec -i $(docker ps -qf name=supabase_db) psql -U postgres -d postgres -v ON_ERROR_STOP=1 -f - < supabase/tests/rls_checks.sql`
- Ponowne uruchomienie migracji z danymi nie dodaje wierszy (liczności przed i po równe)
- Smoke przechodzi przeciw lokalnemu Supabase, z krokami dla `symptoms` i `symptom_search_terms`: `npm run smoke`
- Typy i lint przechodzą: `npm run typecheck && npm run lint`

#### Manual Verification:

- Autorka zatwierdziła `symptom-list.md` przed napisaniem migracji z danymi
- Autorka porównuje kilka pozycji z bazy z zatwierdzonym plikiem (nazwa, kategoria, kolejność, słowa)

**Implementation Note**: Przed biegiem smoke zatrzymaj stary podgląd (`npx astro preview stop`) i zmierz, że bramka pisze do lokalnej bazy, nie produkcyjnej (lekcje „Zatrzymaj stary podgląd” i „Lokalne bramki sprawdź”).

---

## Testing Strategy

### Integration Tests:

- `rls_checks.sql` CHECK 15–18: izolacja, prawa, ograniczenia, kompletność danych.
- `scripts/smoke.mjs`: odczyt i blokada zapisu przez PostgREST dla obu tabel.

### Manual Testing Steps:

1. Przejrzyj i zatwierdź `symptom-list.md`.
2. Po `db reset` porównaj trzy losowe objawy w bazie z plikiem.
3. Przeczytaj komunikaty CHECK 15–18.

## Performance Considerations

34 wiersze i około 80 słów — brak. Indeks na `symptom_search_terms.symptom_id` wystarcza dla S-05.

## Migration Notes

- Dane wchodzą migracją, nie `supabase/seed.sql`, bo seed nie dociera na produkcję (F-02).
- Zmiana nazwy, kolejności albo dopisanie słów po wdrożeniu to nowa migracja odwołująca się do `key`. `key` nie zmienia się nigdy.
- Merge do `main` wdraża na produkcję.

## References

- Roadmapa: `context/foundation/roadmap.md`, `### F-03`, `### S-05`
- PRD: `context/foundation/prd.md`, FR-008, `## Business Logic`, `## Open Questions` pkt 3
- Treść listy: issue #3 (`krychaimago/lekomapa`), sekcja „Treść listy”
- Wzorzec tabel wspólnych: `supabase/migrations/20260924120000_registry_schema.sql:148-172`
- Wzorzec sprawdzeń: `supabase/tests/rls_checks.sql:470-659`
- Wzorzec smoke: `scripts/smoke.mjs:263-384`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Schemat katalogu z RLS

#### Automated

- [x] 1.1 Migracje stosują się od zera: `npx supabase db reset` — 62ecf7b
- [x] 1.2 Sprawdzenia SQL przechodzą, w tym CHECK 15–17 — 62ecf7b
- [x] 1.3 Typy przechodzą: `npm run typecheck` — 62ecf7b
- [x] 1.4 Lint przechodzi: `npm run lint` — 62ecf7b

#### Manual

- [x] 1.5 Autorka czyta komunikaty CHECK 15–17 i potwierdza, że opisują to, co ma być zablokowane — 62ecf7b

### Phase 2: Przegląd listy i dane katalogu

#### Automated

- [x] 2.1 Migracje stosują się od zera: `npx supabase db reset` — 62ecf7b
- [x] 2.2 Sprawdzenia SQL przechodzą, w tym CHECK 18 — 62ecf7b
- [x] 2.3 Ponowne uruchomienie migracji z danymi nie dodaje wierszy — 62ecf7b
- [x] 2.4 Smoke przechodzi przeciw lokalnemu Supabase, z krokami dla `symptoms` i `symptom_search_terms` — 62ecf7b
- [x] 2.5 Typy i lint przechodzą — 62ecf7b

#### Manual

- [x] 2.6 Autorka zatwierdziła `symptom-list.md` przed napisaniem migracji z danymi — 62ecf7b
- [x] 2.7 Autorka porównuje kilka pozycji z bazy z zatwierdzonym plikiem — 62ecf7b
