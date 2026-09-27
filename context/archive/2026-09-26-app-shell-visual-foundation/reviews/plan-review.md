<!-- PLAN-REVIEW-REPORT -->

# Plan Review: Wspólna warstwa wizualna i szkielet wnętrza

- **Plan**: context/changes/app-shell-visual-foundation/plan.md
- **Mode**: Deep
- **Date**: 2026-09-26
- **Verdict**: REVISE → SOUND po triage’u (7/7 poprawione)
- **Findings**: 1 critical, 3 warnings, 3 observations

## Verdicts

| Dimension             | Verdict |
| --------------------- | ------- |
| End-State Alignment   | FAIL    |
| Lean Execution        | PASS    |
| Architectural Fitness | PASS    |
| Blind Spots           | WARNING |
| Plan Completeness     | WARNING |

## Grounding

13/13 paths ✓, 5/5 symbols ✓ (3 line numbers shifted), brief↔plan ✓

## Findings

### F1 — Smoke oczekuje, że / zwraca 200

- **Severity**: ❌ CRITICAL
- **Impact**: 🏃 LOW — szybka decyzja, naprawa oczywista i wąska
- **Dimension**: End-State Alignment
- **Location**: Faza 3, zmiana 4; Current State Analysis
- **Detail**: `scripts/smoke.mjs:415` ma krok „home renders” z oczekiwanym 200. Przekierowanie `/` wywraca smoke i blokuje wdrożenie; plan błędnie twierdzi, że smoke sprawdza tylko `/dashboard`.
- **Fix**: W fazie 3 zmienić krok na „home redirects anonymous user” (302 na `/auth/signin`); poprawić Current State Analysis.
- **Decision**: FIXED

### F2 — Klasy dark: w przycisku omijają test kontrastu

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — prawdziwy kompromis, warto się zatrzymać
- **Dimension**: Blind Spots
- **Location**: Faza 1 (test kontrastu), Faza 2 zmiana 3
- **Detail**: `button.tsx:14-18` ma `dark:bg-destructive/60`, `dark:bg-input/30`, `dark:hover:bg-accent/50`. Po włączeniu trybu ciemnego zmieniają efektywny kolor tła pod tekstem; test mierzy tylko surowe tokeny.
- **Fix**: Usunąć kolorowe klasy `dark:` z `button.tsx`; skaner uznaje `dark:` + klasę koloru za naruszenie.
  - Strength: Tokeny są jedynym źródłem trybu ciemnego; test mierzy to, co widać.
  - Tradeoff: Każdy nowy komponent shadcn trzeba oczyścić z `dark:` (skaner to wymusi).
  - Confidence: HIGH — wszystkie wystąpienia w jednym pliku.
  - Blind spot: Przezroczystości hover zostają niezmierzone.
- **Decision**: FIXED (Fix: usunięte dark: + skaner)

### F3 — Niepełna lista par w teście kontrastu

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — szybka decyzja, naprawa oczywista i wąska
- **Dimension**: Blind Spots
- **Location**: Faza 1, zmiana 3
- **Detail**: Brak par `primary`/`background`, `primary`/`card` (wariant link, podpisy), `primary`/`accent` (liczniki), `secondary-foreground`/`secondary`, `popover-foreground`/`popover`, `destructive`/`background`.
- **Fix**: Pary liczone mechanicznie (każdy `X-foreground` z `X`) plus jawna lista dodatkowych.
- **Decision**: FIXED

### F4 — Trasy wnętrza chronione listą, którą łatwo pominąć

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — prawdziwy kompromis, warto się zatrzymać
- **Dimension**: Blind Spots
- **Location**: Faza 3 zmiany 1–2; Faza 4 zmiana 2
- **Detail**: `middleware.ts:4` chroni tylko `PROTECTED_ROUTES`. Plasterek dopisujący pozycję do `NAV_ITEMS` bez wpisu w middleware wystawia szkielet wnętrza niezalogowanej osobie.
- **Fix A ⭐ Recommended**: middleware chroni `/dashboard` i każdą ścieżkę z `NAV_ITEMS`
  - Strength: Jedno miejsce dla plasterka, ochrona przychodzi sama.
  - Tradeoff: Trasa spoza menu nadal wymaga ręcznego wpisu — reguła w `CLAUDE.md`.
  - Confidence: HIGH — middleware już importuje z `@/lib`.
  - Blind spot: None significant.
- **Fix B**: middleware odwrócony — wszystko chronione poza listą publicznych
  - Strength: Bezpieczny domyślnie.
  - Tradeoff: Dotyka auth w fundamencie wizualnym; S-01 dopisuje stronę prywatności do publicznych.
  - Confidence: MED — nie sprawdzone zachowanie plików statycznych na Workers.
  - Blind spot: `/favicon.png` i zasoby `_astro/` na Workers.
- **Decision**: FIXED (Fix A)

### F5 — Ręczne logowanie w fazie 3 bez wskazania bazy

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — szybka decyzja, naprawa oczywista i wąska
- **Dimension**: Blind Spots
- **Location**: Faza 3, Implementation Note
- **Detail**: Lekcja o bazie przywołana tylko przy smoke; kryteria 3.7–3.10 też logują się do bazy.
- **Fix**: Notatka obejmuje wszystkie kroki z logowaniem — lokalny Supabase sprawdzony przed pierwszym krokiem.
- **Decision**: FIXED

### F6 — Aktywna pozycja menu: remis przy wspólnym początku

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — szybka decyzja, naprawa oczywista i wąska
- **Dimension**: Plan Completeness
- **Location**: Faza 3, zmiana 1
- **Detail**: `/leki` pasuje do `/leki-archiwum`; przy pozycjach `/leki` i `/leki/nowe` podświetlą się obie.
- **Fix**: Dopasowanie do granicy segmentu; przy kilku trafieniach wygrywa najdłuższe `href`.
- **Decision**: FIXED

### F7 — Przesunięte numery linii

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — szybka decyzja, naprawa oczywista i wąska
- **Dimension**: Plan Completeness
- **Location**: Current State Analysis, Key Discoveries, References
- **Detail**: `bg-cosmic` w `global.css:113-115` (plan: 118-120), `.dark` w `:41` (plan: `:40`), Banner w `Layout.astro:23` (plan: `:21`).
- **Fix**: Poprawić odnośniki.
- **Decision**: FIXED
