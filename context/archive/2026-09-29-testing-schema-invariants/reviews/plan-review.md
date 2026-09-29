<!-- PLAN-REVIEW-REPORT -->

# Plan Review: Niezmienniki schematu dla każdej tabeli

- **Plan**: context/changes/testing-schema-invariants/plan.md
- **Mode**: Deep
- **Date**: 2026-09-29
- **Verdict**: SOUND (po triage: wszystkie findingi naprawione w planie)
- **Findings**: 0 critical, 1 warning, 2 observations

## Verdicts

| Dimension             | Verdict |
| --------------------- | ------- |
| End-State Alignment   | PASS    |
| Lean Execution        | PASS    |
| Architectural Fitness | PASS    |
| Blind Spots           | WARNING |
| Plan Completeness     | PASS    |

## Grounding

7/7 paths ✓, 6/6 symbols ✓, brief↔plan ✓, Progress↔Phase ✓

Weryfikacja na lokalnej bazie `supabase_db_10x-astro-starter`, wyłącznie w transakcjach wycofywanych na końcu:

- Wszystkie 8 reguł katalogu jest dziś zielonych, poza dwoma planowanymi `revoke`. Oba `revoke` sprawdzone w wycofanej transakcji — działają.
- `delete from auth.users` jako `postgres` przy oknie podmienionym na `false` kasuje leki, substancje i okresy. Bezpośrednie usunięcie leku pada z P0001.
- Odebranie `EXECUTE` od `anon` jest bezpieczne:
  - strażnicy historii są `security definer`, więc wołają funkcję okna jako właściciel,
  - kod aplikacji i smoke jej nie wołają.
- Plan omija cztery pułapki, które dałyby czerwień od pierwszego dnia:
  - klucz `medications → registry_products` ma `restrict`,
  - `symptoms_guard_key` nie jest strażnikiem historii,
  - tabele wspólne mają politykę `true`,
  - w `public` leży 190 funkcji `btree_gist`.

## Findings

### F1 — Głębokość w domknięciu: cykl i remis przy wielu ścieżkach

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Faza 1 (`pg_temp.account_data_tables()`), Faza 2 (ISOLATION 5)
- **Detail**: Funkcja zwraca tabele „z głębokością”. ISOLATION 5 kasuje wiersze malejąco według tej głębokości. Plan nie rozstrzyga dwóch przypadków:
  - Samoodwołanie, np. okres wskazujący poprzedni okres (możliwe w S-02). Rekurencja z kolumną głębokości nie kończy się na cyklu: każdy krok daje nowy wiersz z inną głębokością, więc UNION go nie odrzuca.
  - Tabela osiągalna dwiema ścieżkami, np. wpis dzienniczka z S-05 z `user_id` i `medication_id`. Ma wtedy głębokość 1 albo 2, a przy min = 1 remisuje z `medications`. Właściciel może skasować lek przed wierszem podrzędnym, kaskada zabierze `a_extra_row`, a `row_count = 0` da fałszywe FAIL.

  Dzisiejszy schemat nie ma żadnego z tych przypadków. Problem wyjdzie dopiero przy S-02 i S-05.

- **Fix A ⭐ Recommended**: Rozstrzygnąć w kontrakcie funkcji:
  - zbiór liczony przez UNION bez głębokości,
  - głębokość = najdłuższa ścieżka, liczona bez krawędzi do samej siebie i z ochroną przed cyklem (tablica ścieżki),
  - remis w ISOLATION 5 łamany nazwą tabeli.
  - Strength: Deterministyczne; działa dla S-02 i S-05 bez zmian.
  - Tradeoff: Kilka linii SQL więcej w obu kopiach predykatu.
  - Confidence: HIGH — znane zachowanie rekurencyjnego CTE.
  - Blind spot: Cykl między dwiema różnymi tabelami nieobsłużony (mało prawdopodobny w tym schemacie).
- **Fix B**: Kolejność DELETE w ISOLATION 5 zapisana w mapie danych testowych.
  - Strength: Zero logiki grafu, jawna decyzja przy dodawaniu tabeli.
  - Tradeoff: Wraca ręczna kolejność, której plan chciał się pozbyć.
  - Confidence: HIGH.
  - Blind spot: Cykl w samym domknięciu dalej trzeba zabezpieczyć.
- **Decision**: FIXED (Fix A)

### F2 — `db push` wypchnie każdą niewysłaną migrację, nie tylko tę

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Faza 1, krok ręczny 1.9
- **Detail**: `npx supabase db push` stosuje wszystkie migracje, których produkcja nie ma. Krok 1.9 nie sprawdza, co jeszcze czeka.
- **Fix**: Przed `db push` w 1.9 dopisać `npx supabase migration list`. Oczekiwany wynik: tylko `20260929120000` bez odpowiednika zdalnego.
- **Decision**: FIXED

### F3 — Kontrprzykład ISOLATION 6 wymaga literału tabeli

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Faza 2, ISOLATION 6 krok 4 vs kryterium 2.2
- **Detail**: Krok 4 kasuje lek `0a01` wprost, a kryterium 2.2 zakazuje nazw tabel konta poza mapą. Grep z cudzysłowem przepuści `public.medications`, więc kryterium przejdzie, ale implementer nie wie, czy to celowy wyjątek.
- **Fix**: W 2.2 dopisać wyjątek: kontrprzykład ISOLATION 6 na tabeli-korzeniu (głębokość 1) albo wziąć tę tabelę z domknięcia zamiast z literału.
- **Decision**: FIXED
