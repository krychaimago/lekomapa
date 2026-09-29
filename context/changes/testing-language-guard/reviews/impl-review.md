<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Strażnik języka FR-012 — plan wdrożenia

- **Plan**: context/changes/testing-language-guard/plan.md
- **Scope**: Full plan
- **Reviewed phases**: 1, 2, 3
- **Date**: 2026-09-29
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 3 warnings, 4 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | WARNING |
| Scope Discipline    | WARNING |
| Safety & Quality    | WARNING |
| Architecture        | PASS    |
| Pattern Consistency | WARNING |
| Success Criteria    | WARNING |

## Weryfikacja

- `npm test` — 170/170 pass (w tym 42 testy `pairs-fr012.test.mjs`)
- `npm run lint` — 0 błędów, 4 ostrzeżenia `no-console` spoza zmiany
- `node scripts/rpl/pairs.mjs supabase/seed-data/interaction_pairs.csv` — `accepted=24 skipped=0 errors=0`
- `npx prettier --check` roadmapa, plan testów, lekcje — czysto
- `npm run db:check` (lokalny kontener) — 4 pliki PASS
- Próbka `pair-description-without-phrase.sql` lokalnie — FAIL zgodnie z oczekiwaniem
- CI PR #53, run 36608545879 — `ci` i `smoke` zielone; w logu `Probe … failed as expected: LANGUAGE 2 FAILED`

## Findings

### F1 — Osiem starych rdzeni bez zdania w korpusie, w tym `powoduj` i `odstaw`

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: scripts/fr012/corpus.mjs:11-42
- **Detail**: Usunięta pętla `for (const word of FORBIDDEN_WORDS)` pokrywała każdy rdzeń. Korpus jej nie zastąpił w całości: `powoduj`, `odstaw`, `przerwij`, `zmień daw`, `zmniejsz daw`, `zwiększ daw`, `zakaz`, `groźn` nie mają żadnego zdania zakazanego (zmierzone `grep`). Pilnuje ich tylko test przypinający listę, który stoi obok listy i zmienia się razem z nią — usunięcie `powoduj` z obu miejsc w jednej edycji zostawia zielone testy. To dokładnie ten dryf, przed którym korpus miał chronić. `powoduj` i `odstaw` to dwie najbardziej podstawowe formuły zakazane przez FR-012.
- **Fix**: Dopisz do `FORBIDDEN_SENTENCES` zdania z PRD: „Lek powoduje objawy.” (cause), „Odstaw jeden z leków.”, „Przerwij leczenie.” (advice), „Przyjmowanie razem jest zakazane.” (ban), „Połączenie jest groźne.” (safety). `…daw` pokrywa `dawk` — zostaw albo usuń jawnie.
  - Strength: Każdy rdzeń ma wyrocznię z PRD niezależną od listy — spełnia §6.1 planu testów.
  - Tradeoff: Kilka linii w korpusie; zero zmian w walidatorze.
  - Confidence: HIGH — luka zmierzona dwukrotnie.
  - Blind spot: Nie sprawdzono, czy nowe zdania nie łapią się przypadkiem na inny rdzeń (wtedy dalej nie pilnują tego jednego) — test „tylko ten rdzeń łapie zdanie” rozstrzygnie.
- **Decision**: FIXED — 5 zdań z PRD w `FORBIDDEN_SENTENCES` (powoduj, odstaw, przerwij, groźn, zakaz); `npm test` 176/176; mutacja `powoduj` daje 2 czerwone testy

### F2 — Zdania łamiące FR-012 wciąż przechodzą przez filtr

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: scripts/rpl/pairs.mjs:24-54
- **Detail**: Zmierzone `forbiddenWordsIn` — puste trafienia dla: „Zmień lek na inny.”, „Nie przyjmuj obu leków razem.”, „Nie stosuj tych leków razem.” (advice), „Połączenie daje krwawienia.” (cause), „Połączenie jest nieszkodliwe.”, „Nic nie grozi.” (safety), „Zamien lek.” (bez polskiej litery — kandydat `zamien` z planu odpadł). Z dopisaną frazą walidator przyjmie każde. Lekcja mówi wprost, że lista jest z natury niepełna i autorka czyta każdy opis — ale klasy advice i safety w korpusie sugerują pokrycie, którego nie ma.
- **Fix A ⭐ Recommended**: Najpierw zdania do korpusu (czerwony test), potem tanie rdzenie: `nie przyjmuj`, `nie stosuj`, `zmień lek`, `zamien`, `grozi`, `nieszkodliw`, `dozwolon`.
  - Strength: Ten sam cykl co faza 1 (czerwony → zielony); rdzenie wąskie, mało fałszywych alarmów.
  - Tradeoff: Kolejne ~7 rdzeni do przeglądu przez autorkę; każdy może zablokować neutralne słowo.
  - Confidence: MED — lista znów będzie niepełna, to tylko kolejna warstwa.
  - Blind spot: Nie sprawdzono zdań z przeczeniem frazy („Wykluczone, że … może mieć związek”) — tego rdzenie nie rozwiążą.
- **Fix B**: Zostaw filtr; dopisz do §6.5 planu testów zmierzone dziury jako znane ograniczenie.
  - Strength: Zero zmian w kodzie; uczciwy zapis stanu.
  - Tradeoff: Znane luki zostają otwarte do czasu, aż ktoś je zauważy.
  - Confidence: HIGH — zgodne z lekcją „Filtr języka wymaga formuły”.
  - Blind spot: Przyszłe opisy pisane bez czytania przez autorkę.
- **Decision**: FIXED via Fix A — 9 zdań do korpusu (7 czerwonych przed zmianą), 7 rdzeni w `FORBIDDEN_WORDS` i teście przypinającym; `npm test` 183/183, CSV `accepted=24`. Luka zostaje: „Połączenie daje krwawienia.” — brak wąskiego rdzenia

### F3 — Próbka czerwonej bramki tylko dla LANGUAGE 2

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: supabase/tests/fr012_language_checks.sql:28-40
- **Detail**: `test-plan.md` §6.2: „nowa reguła dostaje próbkę”. LANGUAGE 1 (pusta tabela) nigdy nie został pokazany jako czerwony. To on odróżnia „zero wierszy bez frazy” od „zero wierszy w ogóle” (lekcja „Bramka musi odróżnić blokadę od niewykonania”).
- **Fix**: Nowa próbka `scripts/db-checks/probes/interaction-pairs-empty.sql` (`delete from public.interaction_pairs;`) i linia w `ci.yml`: `expect_invariant_failure … "LANGUAGE 1 FAILED"`.
- **Decision**: FIXED — próbka `interaction-pairs-empty.sql`, linia w `ci.yml`, nagłówek SQL; lokalnie: próbka kończy się `LANGUAGE 1 FAILED` (exit 1), zwykły bieg PASS z 24 wierszami

### F4 — `ALLOWED_SENTENCES` bez zdania dla 6 nowych rdzeni

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: scripts/fr012/corpus.mjs:46-57
- **Detail**: Plan: „co najmniej jedno na każdy nowy rdzeń”. Brak dla `wywoł`, `bezpieczn`, `podejrz`, `zamień`, `rezygn`, `nie bierz`. Komentarz `:46-48` uzasadnia: neutralne użycie nie istnieje. Odchylenie jawne w kodzie, nieopisane w planie.
- **Fix**: Dopisz odchylenie do planu (sekcja fazy 1) — bez zmian w kodzie.
- **Decision**: FIXED — odchylenie dopisane w planie (faza 1, pod `ALLOWED_SENTENCES`), komentarz w `corpus.mjs` rozszerzony o 7 rdzeni z F2

### F5 — Fałszywe alarmy rdzeni `wynikiem`, `unika`, `prowadz`

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: scripts/rpl/pairs.mjs:46, :52, :53
- **Detail**: Podciąg łapie neutralne słowa: „z nieprawidłowym wynikiem badania” → `wynikiem` (zmierzone), „komunikat” → `unika`, „wprowadzenie” → `prowadz`. Błąd bezpieczny (odrzuca, nie przepuszcza), ale koszt nie jest zmierzony w `ACCEPTED_FALSE_POSITIVES`, choć plan tego wymaga dla znanych kosztów.
- **Fix**: Dopisz „…może mieć związek z nieprawidłowym wynikiem badania” do `ACCEPTED_FALSE_POSITIVES` z rdzeniem `wynikiem` (albo zawęź do `jest wynikiem`).
- **Decision**: FIXED — 3 wpisy w `ACCEPTED_FALSE_POSITIVES` (`wynikiem`, `unika`, `prowadz`) z powodem niezawężania; `npm test` 186/186

### F6 — Zmiana statusów w §3 planu testów wbrew planowi

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: context/foundation/test-plan.md §3 (commit b3eb0e0)
- **Detail**: Plan: „Status wiersza fazy 3 w §3 zostaje dla orkiestratora `/10x-test-plan`”. Commit zmienił wiersz 2 na `complete` (poprawka nieaktualnego stanu) i wiersz 3 na `change opened`. Nieszkodliwe, ale poza zakresem.
- **Fix**: Zostaw; dopisz w planie jako świadome odchylenie.
- **Decision**: FIXED — zmiana zostaje; odchylenie dopisane w planie (faza 3, pod kontraktem §3)

### F7 — 2.3 nieodhaczone mimo zielonego CI

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: context/changes/testing-language-guard/plan.md (Progress 2.3)
- **Detail**: Run 36608545879 (PR #53): `smoke` zielony, w logu `Probe scripts/db-checks/probes/pair-description-without-phrase.sql failed as expected: LANGUAGE 2 FAILED`. Kryterium spełnione, brak znacznika.
- **Fix**: Odhacz 2.3 z odnośnikiem do runu 36608545879.
- **Decision**: FIXED — 2.3 odhaczone z odnośnikiem do runu 36608545879 (341298b, `ci` i `smoke` success)

## Triage

- Fixed: F1, F2 (Fix A), F3, F4, F5, F6, F7 (7)
- Pozostała luka z F2: „Połączenie daje krwawienia.” przechodzi filtr — brak wąskiego rdzenia; pilnuje formuła i lektura autorki.
- Próbka LANGUAGE 1 z F3 zweryfikowana lokalnie; w CI po pushu.
