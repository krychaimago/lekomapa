<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Zamknięta lista objawów

- **Plan**: context/changes/symptom-catalog-seed/plan.md
- **Scope**: Phase 1 of 2
- **Reviewed phases**: 1
- **Date**: 2026-09-26
- **Verdict**: APPROVED
- **Findings**: 0 critical, 2 warnings, 8 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | PASS    |
| Scope Discipline    | PASS    |
| Safety & Quality    | PASS    |
| Architecture        | PASS    |
| Pattern Consistency | PASS    |
| Success Criteria    | WARNING |

Sprawdzenia automatyczne powtórzone 2026-09-26: `db reset` OK, `rls_checks.sql` CHECK 1–17 OK (dwa biegi pod rząd, bez pozostawionych wierszy), `typecheck` 0 błędów, `lint` OK. Zmierzone: `lower('ŁÓDŹ ŻÓŁĆ ĄĘŚŃ')` = `łódź żółć ąęśń` (kolacja ICU), więc wymóg małych liter działa dla polskich znaków. Punkt ręczny 1.5 potwierdzony przez autorkę w rozmowie.

Triage 2026-09-26: wszystkie findingi naprawione w tej samej migracji. Po poprawkach: `db reset` OK, CHECK 1–17 OK dwa razy pod rząd, każda nowa asercja czerwienieje po zdjęciu jej ochrony (tryb odroczenia, wyzwalacz klucza, NFC, `btrim` nazwy, unikalność `lower(name)`), `typecheck` i `lint` czyste.

Faza 1 nie jest jeszcze na `main`, więc poprawki schematu mogą wejść do tej samej migracji zamiast do nowej.

## Findings

### F1 — Tryb „initially deferred” nie jest sprawdzany

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: supabase/tests/rls_checks.sql:944-966
- **Detail**: 17e dowodzi, że ograniczenie `symptoms_category_sort_order_key` jest odraczalne (`set constraints` rzuciłoby błąd), a 17f — że zamiana miejsc w jednym `UPDATE` przechodzi. Oba przypadki przechodzą też przy `deferrable initially immediate`, więc obietnica z migracji (zamiana w kilku instrukcjach, sprawdzenie przy zatwierdzeniu) mogłaby zniknąć bez czerwonego sprawdzenia.
- **Fix**: Dopisać w CHECK 17 asercję z katalogu: `condeferrable and condeferred` z `pg_constraint` dla `symptoms_category_sort_order_key`.
- **Decision**: FIXED — asercja 17-0 z `pg_constraint` (`condeferrable and condeferred`); czerwienieje przy `initially immediate`.

### F2 — CHECK 18 musi stać przed danymi testowymi CHECK 17

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: context/changes/symptom-catalog-seed/plan.md (Faza 2, zmiana 3)
- **Detail**: Skrypt sprawdzeń to jedna transakcja; wiersze `check_17_*` żyją do końcowego rollbacku. CHECK 18 dopisany na końcu policzy 37 objawów zamiast 34 i fałszywie padnie (albo ktoś „poprawi” liczbę). Plan nie mówi, gdzie CHECK 18 ma stać. Tak samo w F-02 CHECK 11 stoi przed danymi testowymi.
- **Fix**: Dopisać w planie przy fazie 2: CHECK 18 wstawiony przed CHECK 17 (numeracja zostaje, zmienia się tylko pozycja w pliku).
- **Decision**: FIXED — w planie (Faza 2, zmiana 3) dopisana pozycja CHECK 18 przed CHECK 17.

### F3 — Nazwa objawu przyjmuje spacje na brzegach i duplikat różniący się wielkością liter

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20260926120000_symptom_catalog_schema.sql:24-27
- **Detail**: `btrim(name) <> ''` odrzuca tylko pustą nazwę. „ból głowy ” i „Ból głowy” obok „ból głowy” przejdą jako różne objawy.
- **Fix**: Dodać `name = btrim(name)` do `symptoms_name_check` i unikalność na `lower(name)` zamiast na `name`; dopisać przypadek w CHECK 17.
- **Decision**: FIXED — `symptoms_name_check` wymaga `name = btrim(name)`; unikalność przez indeks `symptoms_name_lower_key` na `lower(name)`; przypadki w 17l i 17m.

### F4 — Słowo wyszukiwania przyjmuje tabulator, twardą spację, podwójne spacje i rozłożone znaki Unicode

- **Severity**: 💬 OBSERVATION
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20260926120000_symptom_catalog_schema.sql:79
- **Detail**: `term = lower(btrim(term))` usuwa tylko zwykłe spacje na brzegach. Zmierzone: `'ból' = normalize('ból', NFD)` daje `false` — słowo zapisane z rozłożonym „ó” nigdy nie trafi w wyszukiwanie wpisane zwykle.
- **Fix**: Rozszerzyć `symptom_search_terms_term_check` o `term = normalize(term, NFC)` i brak białych znaków innych niż pojedyncza spacja (`term !~ '\s{2,}|[^\S ]'`); dopisać dwa przypadki w CHECK 17.
  - Strength: Błąd zapisu w migracji wychodzi przy wgraniu, nie jako „nie znaleziono” w S-05.
  - Tradeoff: Dłuższa blokada do czytania; S-05 i tak musi znormalizować wpisany tekst tak samo.
  - Confidence: HIGH — zmierzone na lokalnej bazie.
  - Blind spot: Nie sprawdzono, w jakiej postaci Unicode edytor autorki zapisze `symptom-list.md`.
- **Decision**: FIXED — `symptom_search_terms_term_check`: `lower`, `normalize(term, NFC)` i wzorzec `^[^[:space:]]+( [^[:space:]]+)*$` (zamiast proponowanego `[^\S ]`, niedozwolonego w nawiasach w Postgres); przypadki tab, NBSP, podwójna spacja, NFD w 17l.

### F5 — Niezmienność `key` to tylko konwencja

- **Severity**: 💬 OBSERVATION
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20260926120000_symptom_catalog_schema.sql:17-19, 55
- **Detail**: Komentarz mówi „key is never changed after load”, ale nic tego nie wymusza. Pisać mogą tylko migracje, więc zagrożeniem jest własna pomyłka w późniejszej migracji, która po cichu zerwie odwołania po `key`.
- **Fix A ⭐ Recommended**: Wyzwalacz `before update of key` rzucający nazwany błąd, na wzór guardów z F-01, plus przypadek w CHECK 17.
  - Strength: Gwarancja w bazie, nie w pamięci; spójne z lekcją „gwarancja na całej ścieżce zapisu”.
  - Tradeoff: Pierwsza funkcja w tym schemacie; ~15 linii.
  - Confidence: HIGH — wzorzec guardów już istnieje w F-01.
  - Blind spot: Świadoma zmiana klucza w przyszłości wymaga zdjęcia wyzwalacza w tej samej migracji.
- **Fix B**: Zostawić konwencję i komentarz.
  - Strength: Zero kodu.
  - Tradeoff: Ochrona zależy od uwagi przy przeglądzie każdej przyszłej migracji.
  - Confidence: MED — list jest krótka i zmieniana rzadko.
  - Blind spot: Nikt nie pilnuje tego w CI.
- **Decision**: FIXED via Fix A — wyzwalacz `symptoms_guard_key` (P0001) + 17n.

### F6 — Zbędny indeks na `symptom_id`

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20260926120000_symptom_catalog_schema.sql:85-86
- **Detail**: `unique (symptom_id, term)` już tworzy indeks zaczynający się od `symptom_id`.
- **Fix**: Usunąć `symptom_search_terms_symptom_id_idx`; indeks pod wyszukiwanie po `term` zostawić S-05.
- **Decision**: FIXED — indeks `symptom_search_terms_symptom_id_idx` usunięty.

### F7 — Brak komentarzy kolumn `source_code` i `term`

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: supabase/migrations/20260926120000_symptom_catalog_schema.sql:56-65, 88-89
- **Detail**: `source_vocabulary` ma komentarz, `source_code` nie; `term` nie ma komentarza o zapisie małymi literami.
- **Fix**: Dopisać oba komentarze.
- **Decision**: FIXED — komentarze kolumn `source_code` i `term`.

### F8 — `SYMPTOM_CATEGORIES` nie musi zawierać wszystkich kategorii

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/types.ts:196
- **Detail**: Po dodaniu kategorii do typu i do bazy kompilator nie zgłosi brakującej etykiety.
- **Fix**: Etykiety jako `Record<SymptomCategory, string>` plus tablica kolejności, z której powstaje `SYMPTOM_CATEGORIES`.
- **Decision**: FIXED — `Record<SymptomCategory, string>` w kolejności wyświetlania, `SYMPTOM_CATEGORIES` wyliczane z niego; brak etykiety = błąd kompilacji (sprawdzone).

### F9 — Część blokad niesprawdzona

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: supabase/tests/rls_checks.sql:873-1014
- **Detail**: Bez przypadku: pusta nazwa, `source_code`/`source_vocabulary` ze spacji, `sort_order <= 0`, kod bez słownika (sprawdzony tylko słownik bez kodu), spacja na końcu słowa, kaskada słów po usunięciu objawu.
- **Fix**: Dopisać te przypadki w CHECK 17, każdy z nazwą ograniczenia.
- **Decision**: FIXED — 17l (pusta nazwa, spacja w nazwie, `sort_order` 0, puste źródło i kod, kod bez słownika, pusty termin, spacja na końcu) i 17o (kaskada słów).

### F10 — Wymogi dla S-05 wynikające ze schematu

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Architecture
- **Location**: supabase/migrations/20260926120000_symptom_catalog_schema.sql:75
- **Detail**: Kaskada objaw → słowa jest w porządku dla danych wspólnych. Wpis dzienniczka z S-05 nie może jednak dziedziczyć tej kaskady: jego klucz obcy do `symptoms` musi być `on delete restrict`, jak `medications_registry_medication_id_fkey`. Otwarte zostaje też, czy dawny wpis pokazuje bieżącą nazwę objawu, czy tę z chwili zapisu.
- **Fix**: Dopisać oba punkty do wymogów S-05 w roadmapie.
- **Decision**: FIXED — roadmapa S-05: FK `on delete restrict`, otwarte pytanie o nazwę historyczną, normalizacja wpisanego tekstu.
