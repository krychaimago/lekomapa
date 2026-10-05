<!-- PLAN-REVIEW-REPORT -->

# Plan Review: S-05 Wpis o samopoczuciu i okno korekty

- **Plan**: context/changes/symptom-journal-entry/plan.md
- **Mode**: Deep
- **Date**: 2026-10-05
- **Verdict**: REVISE → SOUND po triage (5/5 FIXED)
- **Findings**: 0 critical, 3 warnings, 2 observations

## Verdicts

| Dimension             | Verdict |
| --------------------- | ------- |
| End-State Alignment   | PASS    |
| Lean Execution        | PASS    |
| Architectural Fitness | PASS    |
| Blind Spots           | WARNING |
| Plan Completeness     | WARNING |

## Grounding

8/8 ścieżek ✓, 6/6 symboli ✓, brief↔plan ✓, Progress↔fazy ✓.

Potwierdzone w kodzie (podagent):

- strażnicy wołają `medication_correction_window_open(uuid)`,
- `change_dosage` tylko zamyka bieżący okres i wstawia nowy,
- żaden test, seed ani skrypt nie ustawia `created_at`,
- INVARIANT 7 jest wzorcowy, bez listy nazw,
- nowa pozycja menu nie psuje `navigation.test.mjs`,
- `symptoms.id` to uuid, katalog ma 8 kategorii.

## Findings

### F1 — Dopisanie wiersza pod zamknięty lek omija okno

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Phase 1 — Migracja okna korekty
- **Detail**: `medication_substances` i `dosage_periods` mają polityki INSERT dla `authenticated` (`20260922120000_medication_schema.sql:143`, `:185`). Żaden strażnik nie pilnuje INSERT. Dziś okno zawsze zwraca true, więc to nie ma znaczenia. Po fazie 1 okno działa naprawdę, a kontem przez PostgREST nadal da się:
  - dopisać substancję do leku sprzed roku — zmienia skład wstecz, a z nim znaczniki kolizji,
  - wstawić okres przed pierwszym okresem leku — wykluczenie nakładania tego nie łapie.

  Dla `symptom_entry_items` plan sam blokuje INSERT do zamkniętego wpisu, dla leków tego nie robi. Lekcja „Ograniczenie na tabeli podrzędnej nie chroni…”: gwarancja ma objąć całą ścieżkę zapisu.

- **Fix A ⭐ Recommended**: strażnicy INSERT w fazie 1:
  - `medication_substances`: odrzucenie przy zamkniętym oknie leku.
  - `dosage_periods`: przy zamkniętym oknie leku przechodzi tylko okres dopisany na końcu historii (`started_on` > najpóźniejszy istniejący `started_on`), czyli dokładnie to, co robi `change_dosage`.
  - Sprawdzenia w `correction_window_checks.sql` i wpis w INVARIANT 8.
  - Strength: Ta sama zasada co przy wpisach dzienniczka; reguła w bazie, nie tylko w RPC.
  - Tradeoff: Dwa wyzwalacze i ok. 6 sprawdzeń więcej w fazie 1, która już jest największa.
  - Confidence: MED — CHECK 19 wstawia P2 po zamknięciu P1, warunek „na końcu” musi go przepuścić. Do sprawdzenia przy wdrożeniu.
  - Blind spot: Odstawienie leku w S-04 może potrzebować tego samego warunku.
- **Fix B**: zapisać jako znany dług (issue + wpis w roadmapie przy S-04).
  - Strength: Faza 1 bez zmian.
  - Tradeoff: Gwarancja historii leków jest dziurawa od pierwszego dnia, w którym zaczyna obowiązywać.
  - Confidence: HIGH — luka jest dziś, zmienia się tylko jej waga.
  - Blind spot: Nikt nie pilnuje, kiedy dług zostanie spłacony.
- **Decision**: FIXED (Fix A)

### F2 — Godzina domyślna to otwarcie ekranu, nie zapis; minimum się przeterminowuje

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 2 — RPC `add_symptom_entry`; Phase 3 — NewEntryForm
- **Detail**:
  - FR-008 mówi „domyślnie na moment zapisu”. Plan bierze godzinę otwarcia ekranu: formularz wypełniany 5 minut zapisze godzinę sprzed 5 minut.
  - `min` = teraz − 14 dni, liczone przy ładowaniu strony. Baza sprawdza `now() - 14 days` przy zapisie. Wybranie wartości minimalnej i zapis minutę później kończy się `SE003`, choć przeglądarka wartość przyjęła. Plan nie rozstrzyga tego przypadku granicznego.
- **Fix**: Gdy użytkowniczka nie ruszyła pola, formularz wysyła `occurredLocal: null`, a RPC zapisuje `now()`. Komunikat `SE003` podaje najwcześniejszą dopuszczalną datę. Test w `symptom_journal_checks.sql`: brak godziny → wpis z `now()`.
- **Decision**: FIXED

### F3 — Pominięte listy w testach, które trzeba zaktualizować

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 1 §2, Phase 2 §2, Phase 4 §1
- **Detail**:
  - `supabase/tests/medication_interaction_checks.sql:543-558` (INTERACTION 11) ma ręczną listę funkcji invoker z asercją „authenticated ma EXECUTE”. Plan nie dopisuje do niej `add_symptom_entry`, `correct_dosage_period` ani pól wyliczanych.
  - INVARIANT 8 ma w komunikacie na sztywno „7 history guards” (`schema_invariants_checks.sql:443`).
  - ISOLATION 4 dla tabeli podrzędnej wymaga drugiego wiersza nadrzędnego konta A (`repoint_owner_target`, wzorzec a11). Plan wspomina tylko `isolation_fixtures`.
- **Fix**: Dopisać te trzy miejsca do kontraktów plików w fazach 1, 2 i 4.
- **Decision**: FIXED

### F4 — Pierwsze pole wyliczane i przeciążenie nazwy w repo

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Architectural Fitness
- **Location**: Phase 1 — „Pola wyliczane PostgREST”
- **Detail**: W migracjach nie ma dziś żadnej funkcji przyjmującej typ wiersza ani żadnego przeciążenia. Plan wprowadza cztery wersje `correction_window_ends_at` naraz; jedna przyjmuje `timestamptz` i wychodzi jako `/rpc`. Faza 1 sprawdza to tylko w Studio, a pierwszy odczyt przez PostgREST (supabase-js) wypada w fazie 3.
- **Fix**: Nazwać miarę bazową inaczej (np. `correction_window_end(timestamptz)`). Do fazy 1 dodać pomiar: `select=id,correction_window_ends_at` przez PostgREST zwraca godzinę dla `authenticated`.
- **Decision**: FIXED

### F5 — Poprawa nie wymaże zmiany, której w ogóle nie było

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 4 — `correct_dosage_period`
- **Detail**: Przykład: zmiana dawki zapisana przy złym leku. Poprawa może tylko przywrócić poprzednią dawkę. W historii zostają wtedy dwa kolejne okresy z tą samą dawką, a S-06 zobaczy datę „zmiany”, której nie było. Cofnięcie zmiany jest świadomie poza zakresem, ale plan nie mówi, co się dzieje przy poprawie na dawkę z poprzedniego okresu.
- **Fix**: Taką poprawę odrzucić nazwanym kodem (np. `DP010`) i zapisać „cofnięcie zmiany” jako dług w roadmapie przed S-06.
- **Decision**: FIXED
