<!-- PLAN-REVIEW-REPORT -->

# Plan Review: Tryb ciemny (S-11)

- **Plan**: context/changes/dark-mode/plan.md
- **Mode**: Deep (claims verified directly in code, no sub-agent)
- **Date**: 2026-10-11
- **Verdict**: SOUND
- **Findings**: 0 critical, 1 warning, 3 observations

## Verdicts

| Dimension             | Verdict |
| --------------------- | ------- |
| End-State Alignment   | PASS    |
| Lean Execution        | PASS    |
| Architectural Fitness | PASS    |
| Blind Spots           | WARNING |
| Plan Completeness     | WARNING |

## Grounding

12/12 paths ✓, symbols ✓ (`global.css:4` dark variant, `.dark` block, `zod`, `parseTokenBlocks` reads only `--` declarations), Progress↔Faza ✓, brief↔plan ✓. Minor inaccuracy left as is: 18 pages use `AppLayout.astro`, not 22.

Verified OK: no `ClientRouter` (full page loads), no `prerender = true`, no CSP (the `is:inline` script is not blocked), interior pages keep the default Referrer-Policy (form POST passes `checkOrigin`), `/warunki/akceptacja` uses `AuthSpreadLayout` (no toggle).

## Findings

### F1 — Galeria tworzy dane bez sprzątania

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Faza 3, #1 Skrypt galerii
- **Detail**: Skrypt ma być powtarzalny po każdej poprawce, a tworzy leki, wpis i pytanie na wspólnym koncie E2E bez sprzątania. Kolejne biegi dokładają dane, więc zrzuty nie są porównywalne; łamie regułę E2E o izolowanych danych ze sprzątaniem.
- **Fix**: Dane z unikalnym znacznikiem biegu, usuwane w `afterAll` przez interfejs (w oknie korekty).
- **Decision**: FIXED

### F2 — Galeria może przekroczyć limit 16 MB strony

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Faza 3, #2 Strona galerii
- **Detail**: ~70+ zrzutów całej strony w PNG wklejonych jako `data:` łatwo przekroczy 16 MB.
- **Fix**: Zrzuty jako osobne pliki obok strony (mapa `files`), nie wklejone w HTML.
- **Decision**: FIXED

### F3 — Trasa trybu nie jest „publiczna i bez bazy”

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Key Discoveries + Faza 1 #4
- **Detail**: `isTermsGatedPath` (`src/lib/auth/terms-gate.ts:30`) obejmuje każde `/api/*` spoza EXEMPT; dla zalogowanej osoby middleware pyta `terms_acceptances`, bez akceptacji zwraca 403. Dziś nieosiągalne, ale zdanie w planie było nieprawdziwe.
- **Fix**: Poprawione zdanie: trasa przechodzi przez bramkę warunków jak każde `/api/*`, zamierzone, `EXEMPT_PATHS` bez zmian.
- **Decision**: FIXED

### F4 — Kryterium 3.2: liczba zrzutów przy wielu stanach na ekran

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Faza 3, Success Criteria 3.2
- **Detail**: „2 × liczba ekranów” kłóciło się ze stanami (błąd formularza, lista pusta i z danymi).
- **Fix**: „Każda strona z `src/pages` poza `api/` ma ≥ 1 wpis na liście; zrzutów = 2 × liczba wpisów” — w fazie 3 i w Progress 3.2.
- **Decision**: FIXED
