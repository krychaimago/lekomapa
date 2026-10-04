# Luki w testach wskazane przez Strykera — leki i filtr FR-012: plan w skrócie

> Full plan: `context/changes/mutation-gaps-medications-fr012/plan.md`
> Research: `context/changes/mutation-gaps-medications-fr012/research.md`

## What & Why

Pierwszy pomiar Strykera pokazał 39 przeżyłych mutantów w `medications.ts` (62,50 %) i 41 w filtrze FR-012 `pairs.mjs` (82,40 %). Przeżyły mutant oznacza zmianę kodu, której żaden test nie zauważa. Dopisujemy testy tam, gdzie zmiana miałaby skutek dla użytkowniczki, a resztę pomijamy świadomie i zapisujemy powód.

## Starting Point

- `registryCompositionNames` (skład leku pokazany przed zapisem) i `formatIsoDate` nie mają żadnego testu — z tego bierze się 25 z 39 przeżyłych.
- Test strefy czasowej przechodzi tylko dlatego, że maszyna autorki jest w strefie Warszawy.
- W filtrze FR-012 przeżywa jeden mutant: podwójna spacja albo złamanie wiersza w zakazanym zdaniu omija filtr.

## Desired End State

Każdy mutant „do zabicia” pada. Każdy przeżyły ma wiersz z powodem w `surviving-mutants.md`. `test-plan.md` podaje drugi pomiar obok pierwszego (81,70 %).

## Key Decisions Made

| Decision                               | Choice                                                            | Why (1 sentence)                                                         | Source          |
| -------------------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------ | --------------- |
| CLI `pairs.mjs` (21 mutantów)          | test kodu wyjścia (błąd = 1, poprawny plik = 0), reszta pominięta | jedyna część CLI z realnym skutkiem                                      | Plan (autorka)  |
| Format daty                            | `DD.MM.YYYY` jest wymaganiem                                      | brak w PRD; decyzja autorki z 4.10.2026                                  | Plan (autorka)  |
| Podpowiedzi substancji                 | każda nazwa raz                                                   | potwierdzone jako wymaganie, było tylko w komentarzu                     | Plan (autorka)  |
| Kolejność nazw z rejestru              | polska kolacja („L” przed „Ł”)                                    | doprecyzowanie „alfabetycznie” z planu S-02                              | Plan (autorka)  |
| Zapis pominiętych                      | tabela `surviving-mutants.md` w folderze zmiany                   | kod bez komentarzy `Stryker disable`                                     | Plan (autorka)  |
| Strefa w teście                        | `process.env.TZ = "UTC"` tylko w `medications.test.mjs`           | zmierzone: działa w Node 24, każdy plik testu biegnie w osobnym procesie | Plan            |
| #56 (białe znaki)                      | warianty istniejących zdań z korpusu, bez nowych zdań             | korpus zostaje jedyną wyrocznią                                          | Plan            |
| #79, #206                              | w zakresie                                                        | po jednym krótkim teście                                                 | Research → Plan |
| Mutanty równoważne i treść komunikatów | pominięte                                                         | zmiana bez skutku albo testy sprawdzają kod `reason`, nie treść          | Research        |

## Scope

**In scope:**

- testy w `scripts/medications/medications.test.mjs`, `scripts/rpl/pairs.test.mjs`, `scripts/rpl/pairs-fr012.test.mjs`
- `surviving-mutants.md`, drugi pomiar w `test-plan.md` §5

**Out of scope:**

- `contrast.mjs` i `navigation.ts`
- jakakolwiek zmiana kodu produkcyjnego
- treść wyjścia CLI
- nowe zdania w korpusie FR-012
- Stryker w CI

## Architecture / Approach

Kod istnieje, więc dowodem, że test coś mierzy, jest mutant, który przy nim pada. Każda faza kończy się biegiem Strykera zawężonym do jednego pliku (`npx stryker run --mutate <plik>`). Przeżyłe porównujemy z listą pominiętych po linii i mutatorze, bo numery Strykera zmieniają się przy innym zakresie. Implementacja przez `/10x-implement`, nie `/10x-tdd`.

## Phases at a Glance

| Phase                     | What it delivers                                 | Key risk                                              |
| ------------------------- | ------------------------------------------------ | ----------------------------------------------------- |
| 1. Testy `medications.ts` | 33 zabite, przeżywa dokładnie 6 pominiętych      | test ujawni błąd w kodzie (wtedy stop, osobna zmiana) |
| 2. Testy `pairs.mjs`      | #56, #79, #206, kod wyjścia CLI                  | test procesu wolniejszy od zwykłego                   |
| 3. Pomiar i zapis         | `surviving-mutants.md`, drugi pomiar w test-plan | przeżyły bez powodu — wraca do autorki                |

**Prerequisites:** gałąź `chore/mutation-gaps-medications-fr012`, Stryker z PR #61 zainstalowany.
**Estimated effort:** ~2 sesje, 3 fazy.

## Open Risks & Assumptions

- Nierozstrzygnięte: czy `max_rows` w PostgREST może uciąć osadzenie składu w `src/pages/leki/nowy.astro:61-66`. Wtedy pokazany skład byłby krótszy niż zapisany niezależnie od testów — osobna sprawa.
- Dokładna liczba mutantów `main()`, które padną po teście kodu wyjścia, wyjdzie dopiero z pomiaru (research: #234–#237, prawdopodobnie #216 i #239).
- Oczekiwany wynik łączny to ok. 88 %. To szacunek, liczy się zmierzona wartość.

## Success Criteria (Summary)

- Zmiana składu, formatu daty, kolejności albo filtra FR-012 w kodzie wywraca test.
- Każdy pominięty mutant ma zapisany powód, który autorka zaakceptowała.
