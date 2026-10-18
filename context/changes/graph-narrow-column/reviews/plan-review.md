<!-- PLAN-REVIEW-REPORT -->

# Plan Review: Graf leków w jednej kolumnie, gdy brakuje miejsca

- **Plan**: context/changes/graph-narrow-column/plan.md
- **Mode**: Deep
- **Date**: 2026-10-18
- **Verdict**: REVISE → SOUND (po triage)
- **Findings**: 0 critical, 2 warnings, 1 observation

## Verdicts

| Dimension             | Verdict |
| --------------------- | ------- |
| End-State Alignment   | PASS    |
| Lean Execution        | PASS    |
| Architectural Fitness | PASS    |
| Blind Spots           | WARNING |
| Plan Completeness     | WARNING |

## Grounding

6/6 paths ✓, 5/5 symbols ✓ (Intl.Collator sort, @min-[480px], LAYOUTS, max-w-sm, data-graph-node), brief↔plan ✓, Progress↔phases 3/3, 22/22 ✓

## Findings

### F1 — Test E2E nie złapie cofnięcia progu do pikseli

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Faza 3 — test E2E, punkt 3.4
- **Detail**: Powiększenie przez `font-size` na `<html>` powiększa też marginesy (`main p-4`, karta `px-4` są w rem). Przy 360 px i 125% treść karty ma 360 − 40 − 40 − 2 = 278 px, czyli mniej niż 294 px — kolumna pokaże się także przy progu w pikselach. Przy 320 px tak samo. Oba zaplanowane przypadki przechodzą przy obu progach, więc punkt 3.4 się nie spełni. Tekst 150% z Desired End State nie ma sprawdzenia.
- **Fix**: Dodać przypadki, w których rem i px dają różny wynik: 412 px + 125% (318 px treści: px = telefon, rem = kolumna) i 640 px + 125% (558 px treści: px = komputer, rem = telefon); oraz 360 px + 150% bez nachodzenia.
- **Decision**: FIXED — przypadki 412 px + 125%, 640 px + 125%, 360 px + 150% dopisane do kontraktu fazy 3

### F2 — Kontrakt łuku „C” sprzeczny z typem ścieżki

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Faza 1 — typ modelu i testy
- **Detail**: `src/types.ts:481` opisuje `path` jako „only the letters M and Q”, a plan każe kolumnie rysować „M … C …”. Testy idą pętlą po `LAYOUTS = ["phone", "wide"]` (`interaction-graph.test.mjs:19`) z wyrażeniem tylko na Q. Plan nie rozstrzyga, czy dopisać "column" do LAYOUTS ani czy zmienić komentarz typu.
- **Fix**: W fazie 1: komentarz `path` = „M i Q (telefon, komputer) albo M i C (kolumna)”; "column" poza LAYOUTS, łuki kolumny mają osobne testy.
- **Decision**: FIXED — komentarz `path` i wyłączenie kolumny z `LAYOUTS` dopisane do fazy 1

### F3 — PR #131 zderzy się już w fazie 1–2, nie w 3

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Architectural Fitness
- **Location**: Faza 3 — komentarze o progach
- **Detail**: PR #131 (otwarty) zmienia `InteractionGraph.tsx` i `interaction-graph.ts`. Fazy 1 i 2 przepisują te same komentarze na rem, więc konflikt pojawi się wcześniej niż w fazie 3. Punkt „Komentarze o progach” w fazie 3 w dużej części powtarza pracę z faz 1–2.
- **Fix**: Przed fazą 1 zamknąć #131 jako zastąpiony przez tę zmianę; punkt w fazie 3 zostawić jako samo sprawdzenie grep.
- **Decision**: FIXED — zamknięcie #131 jako warunek przed fazą 1 (plan + brief), punkt w fazie 3 skrócony do sprawdzenia grep
