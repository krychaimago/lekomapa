<!-- PLAN-REVIEW-REPORT -->

# Plan Review: S-02 Dodanie leku po nazwie handlowej ze znacznikiem możliwej kolizji

- **Plan**: context/changes/add-medication-with-interaction-flag/plan.md
- **Mode**: Deep
- **Date**: 2026-09-30
- **Verdict**: REVISE → SOUND (po triage 2026-09-30, wszystkie findingi naprawione w planie)
- **Findings**: 1 critical, 2 warnings, 3 observations

## Verdicts

| Dimension             | Verdict |
| --------------------- | ------- |
| End-State Alignment   | PASS    |
| Lean Execution        | PASS    |
| Architectural Fitness | PASS    |
| Blind Spots           | FAIL    |
| Plan Completeness     | WARNING |

## Grounding

10/10 ścieżek ✓, 9/9 symboli ✓, brief↔plan ✓, Progress↔fazy ✓.

Potwierdzone pomiarem na lokalnej bazie:

- 4 grupy (produkt, kod) z dublem: Dexak, Ibuprofen Zentiva, 2× Coroswera. Deduplikacja po kodzie jest konieczna.
- 100 nazw `normalized_name` z kodem, wszystkie małymi literami; `diclofenacum` ma 5 kodów.
- Para M01AE–M01AE istnieje (INTERACTION 6 potrzebne); B01AA–M01AE istnieje.
- INVARIANT 7 wymaga `search_path` także na funkcjach wyzwalaczy `security definer` — plan to ma.

## Findings

### F1 — Nowa kontrola spójności łamie istniejące CHECK 14

- **Severity**: ❌ CRITICAL
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Faza 1 — pkt 1 (migracja) i pkt 2 (`rls_checks.sql`)
- **Detail**:
  - `supabase/tests/rls_checks.sql:906-942` (CHECK 14a i 14e) ustawia `registry_medication_id` na leku `...0005`, który ma `composition_source = 'leaflet'`.
  - Po dodaniu `medications_registry_source_check` test 14a dostaje `check_violation` zamiast `foreign_key_violation`, bo ograniczenie `check` działa przed kluczem obcym.
  - Test 14e pada wprost.
  - Kryterium 1.2 (`npm run db:check`) nie przejdzie, a plan nie wspomina o zmianie CHECK 14.
  - Dodatkowo komunikat INVARIANT 8 OK ma wpisane na sztywno „5 history guards” (`supabase/tests/schema_invariants_checks.sql:441`).
- **Fix**: W kontrakcie fazy 1 pkt 2 dopisać zmianę CHECK 14. Testy 14a i 14e ustawiają razem `composition_source = 'registry'`, a 14a nadal oczekuje `medications_registry_medication_id_fkey`. W pkt 4 dopisać zmianę tekstu INVARIANT 8 OK na 6 strażników.
- **Decision**: FIXED

### F2 — „Dziś” w dwóch strefach czasowych

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Faza 1 (`medication_interactions`), Faza 3 pkt 4–5
- **Detail**:
  - Domyślna data rozpoczęcia to dziś w strefie `Europe/Warsaw`.
  - Zod ma odrzucać „datę w przyszłości”, ale plan nie mówi, w jakiej strefie. Worker działa w UTC.
  - Między 00:00 a 01:00/02:00 czasu polskiego dzisiejsza data domyślna jest w UTC „jutrem”, więc zapis leku pada.
  - Tak samo `discontinued_on > current_date` w bazie liczy w UTC.
- **Fix**: Nazwać w kontrakcie jedną strefę dla „dziś”:
  - `Europe/Warsaw` w zod, przez helper w `src/lib/services/medications.ts` z testem na godzinie 00:30 czasu polskiego;
  - `(now() at time zone 'Europe/Warsaw')::date` zamiast `current_date` w `medication_interactions()`.
- **Decision**: FIXED

### F3 — Trasa i funkcja z ulotki porównują nazwę inaczej

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Faza 1 (`add_medication_from_leaflet`), Faza 4 pkt 3
- **Detail**:
  - Trasa porównuje nazwę ze słownikiem bez rozróżniania wielkości liter. Zmierzone: każde `normalized_name` jest pisane małymi literami.
  - Funkcja szuka dokładnie tego, co dostanie w `p_substance_name`.
  - Skutek: „Ibuprofenum” przechodzi przez trasę, a w funkcji daje nazwany błąd. Użytkowniczka widzi ogólny błąd zamiast zapisu.
  - Plan nie mówi też, co zrobić, gdy nazwa istnieje w słowniku wyłącznie w wierszach bez kodu.
- **Fix**:
  - Funkcja porównuje `lower(btrim(p_substance_name))` i bierze tylko wiersze z `atc_code is not null`.
  - Brak takich wierszy daje ten sam nazwany błąd.
  - Dopisać przypadek z wielką literą do INTERACTION 4.
- **Decision**: FIXED

### F4 — Test FR-012 nie zbierze tekstu z funkcji

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Faza 2 pkt 1 i 3
- **Detail**:
  - Test (b) zbiera rekurencyjnie wszystkie pola modułu. Jeśli `withMedication` będzie funkcją („z lekiem {nazwa}”), jej tekst ominie filtr.
  - Plan nie mówi, dlaczego teksty interfejsu nie wymagają formuły „może mieć związek” (lekcja „Filtr języka wymaga formuły…”). Kontrakt z roadmapy tego nie żąda, ale warto to zapisać wprost.
- **Fix**: Szablony jako stringi z `{nazwa}` zamiast funkcji. W teście jedno zdanie, że formuła dotyczy związku z objawem, którego te teksty nie opisują.
- **Decision**: FIXED

### F5 — Smoke „flagLabel dwukrotnie” jest kruchy

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Faza 5 pkt 1, krok 3
- **Detail**: Dokładne liczenie wystąpień pada, jeśli etykieta pojawi się też w legendzie albo objaśnieniu. Wynik zależy wtedy od układu strony, a nie od reguły.
- **Fix**: Sprawdzać znacznik w obrębie pozycji leku, np. po atrybucie `data-medication-id`. Każdy z dwóch leków ma go mieć.
- **Decision**: FIXED

### F6 — Pomiar „13 nazw o różnym składzie” się nie powtarza

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Current State Analysis, pomiary z 2026-09-30
- **Detail**:
  - Ponowny pomiar daje 6 nazw: Coroswera, Dexak, Ibuprofen Zentiva, Prenessa, Rosamera, Sartesta.
  - Pozostałe liczby się zgadzają.
  - Decyzja o wyborze wariantu zostaje bez zmian. Liczba nie powinna jednak trafić do roadmapy bez opisu, jak ją zmierzono.
- **Fix**: Zapisać zapytanie przy liczbie albo ją poprawić.
- **Decision**: FIXED
