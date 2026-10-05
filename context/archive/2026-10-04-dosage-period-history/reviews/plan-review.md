<!-- PLAN-REVIEW-REPORT -->

# Plan Review: S-03 Historia okresów dawkowania

- **Plan**: context/changes/dosage-period-history/plan.md
- **Mode**: Deep
- **Date**: 2026-10-04
- **Verdict**: REVISE → SOUND (po triage: 5/5 FIXED)
- **Findings**: 0 critical, 3 warnings, 2 observations

## Verdicts

| Dimension             | Verdict |
| --------------------- | ------- |
| End-State Alignment   | WARNING |
| Lean Execution        | PASS    |
| Architectural Fitness | PASS    |
| Blind Spots           | WARNING |
| Plan Completeness     | WARNING |

## Grounding

12/12 paths ✓, 6/6 symbols ✓ (`dosage_periods_guard_core`, `add_medication_from_registry`, `todayInWarsaw`, `formatIsoDate`, `useSubmitting`, `GATE_COMPLETE` w `scripts/db-checks.mjs`), brief↔plan ✓, Progress↔phases ✓.

Potwierdzone w kodzie:

- Strażnik `dosage_periods_guard_core` działa tylko przy BEFORE UPDATE, więc nowy okres wchodzi bez przeszkód. Zamknięcie okresu (`ended_on` z pustego na datę) przechodzi zawsze.
- `select … for update` na `medications` działa, bo RLS ma politykę UPDATE dla właściciela.
- `db:check` sam wykrywa nowe pliki w `supabase/tests/`.
- FK `dosage_periods → registry_products on delete restrict` nie łamie INVARIANT 2 ani 7. Funkcja `security invoker` z uprawnieniem dla `authenticated` też przechodzi.
- Lista leków liczy datę początku z pierwszego okresu (`src/pages/leki/index.astro:58`), więc zmiana dawki nie zmieni kolejności na liście.

## Findings

### F1 — Cofanie daty zmiany bez limitu przepisuje zamkniętą historię

- **Severity**: ⚠️ WARNING
- **Impact**: 🔬 HIGH — architectural stakes; think carefully before deciding
- **Dimension**: Blind Spots
- **Location**: Phase 2 (reguła DP002), Phase 4 (`min` pola daty)
- **Detail**: Datę zmiany można cofnąć do dnia po początku bieżącego okresu, także po zamknięciu okna korekty. Przykład: okres trwa od stycznia, a w październiku użytkowniczka zapisuje zmianę z datą 2 stycznia. Dawka X obowiązuje wtedy jeden dzień, a nowa dawka obejmuje 9 miesięcy wstecz. Strażnik na to pozwala, bo `ended_on` zmienia się z pustego na datę. Tymczasem `dose_text` okresu jest niemodyfikowalny właśnie po to, żeby nie dało się tak zrobić. Kryterium akceptacji US-04 mówi: „wcześniejsze zestawienia objawów z poprzednim okresem dawkowania pozostają prawdziwe”. Pytanie z S-06 („objaw w marcu przy dawce X”) przestałoby być prawdziwe.
- **Fix A ⭐ Recommended**: Limit cofnięcia w `change_dosage`: `p_changed_on >= dziś − N dni` (np. 14), z nazwanym kodem (DP002 albo nowy DP007) i testem SQL. Ekran ustawia `min` jako późniejszą z dwóch dat: `nextDay(started_on)` i `dziś − N`.
  - Strength: Jedna reguła w bazie i jeden test SQL. Spóźniony wpis dalej jest możliwy.
  - Tradeoff: Trzeba wybrać N. Zmianę sprzed więcej niż N dni da się zapisać tylko przez zakończenie leku i dodanie nowego.
  - Confidence: HIGH — reguła mieści się w istniejącej funkcji i kolejności sprawdzeń.
  - Blind spot: N powinno pasować do okna korekty z S-05, którego jeszcze nie ma.
- **Fix B**: Zostawić bez limitu i dopisać ryzyko do „What We're NOT Doing” oraz zależność dla S-06.
  - Strength: Zero kodu teraz.
  - Tradeoff: Historię da się przepisać wstecz. S-06 musi odróżniać okres wpisany z opóźnieniem, np. po `created_at`.
  - Confidence: MED — nie sprawdzono, czy `dosage_periods` ma `created_at`.
  - Blind spot: Co S-06 pokazuje przy wpisie spóźnionym.
- **Decision**: FIXED (Fix A: N = 14 dni, nowy kod DP007)

### F2 — Tekst „Zmień dawkowanie” nie przejdzie filtra FR-012

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: End-State Alignment
- **Location**: Desired End State; Phase 4 §3
- **Detail**: Wynik prawdziwego filtra z `scripts/rpl/pairs.mjs`:
  - „Zmień dawkowanie” odpada na rdzeniu `zmień daw`,
  - „Lek odstawiony …” odpada na rdzeniu `odstaw`,
  - „Zmiana dawkowania” i „zakończony” przechodzą.

  Tryb rozkazujący brzmi jak sugestia zmiany dawki, a przed tym chroni FR-012.

- **Fix**: W planie zamienić przycisk na „Zmiana dawkowania”, a w stanach ekranu słowo „odstawiony” na „zakończony”.
- **Decision**: FIXED

### F3 — Szczegóły leku nie pobierają `discontinued_on`

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 4 §2–3
- **Detail**: Plan pokazuje przycisk tylko przy leku bieżącym, a ekran zmiany ma osobny stan „lek odstawiony”. Zapytanie w `src/pages/leki/[id].astro:49` nie pobiera jednak `discontinued_on`, a kontrakt fazy nie każe go dodać. Bez tego przycisk pokaże się przy każdym leku.
- **Fix**: W kontrakcie fazy 4 dopisać `discontinued_on` do zapytania w `[id].astro` i `zmiana-dawki.astro`. Lek jest bieżący, gdy `discontinued_on` jest puste albo późniejsze niż `todayInWarsaw()` (ta sama reguła co w SQL).
- **Decision**: FIXED

### F4 — Ponowne wysłanie formularza pokazuje zły komunikat

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 2, tabela reguł `change_dosage`
- **Detail**: Scenariusz: zapis się udał, a potem wraca to samo żądanie (przycisk wstecz, ponowne wysłanie). Data równa się wtedy początkowi nowego okresu, więc padnie DP002 („data za wczesna”). Właściwy komunikat to DP004 („już zapisane”), ale DP004 jest sprawdzany dopiero po DP002.
- **Fix**: Sprawdzać DP004 przed DP002 i dopisać przypadek „powtórzone wywołanie” do `dosage_change_checks.sql`.
- **Decision**: FIXED

### F5 — Brak testu uprawnień `change_dosage`

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 2 §4
- **Detail**: Plan nadaje uprawnienia (`revoke` od `anon`, `grant` dla `authenticated`), ale żaden przypadek testowy ich nie sprawdza. Funkcje z S-02 są sprawdzane przez listę INTERACTION 11 w `supabase/tests/medication_interaction_checks.sql:542-547`.
- **Fix**: Dopisać `change_dosage` do listy INTERACTION 11 (anon nie może wykonać, authenticated może).
- **Decision**: FIXED
