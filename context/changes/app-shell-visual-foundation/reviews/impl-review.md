<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Wspólna warstwa wizualna i szkielet wnętrza

- **Plan**: context/changes/app-shell-visual-foundation/plan.md
- **Scope**: Full plan
- **Reviewed phases**: 1, 2, 3, 4
- **Date**: 2026-09-27
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 3 warnings, 3 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | PASS    |
| Scope Discipline    | PASS    |
| Safety & Quality    | WARNING |
| Architecture        | PASS    |
| Pattern Consistency | PASS    |
| Success Criteria    | PASS    |

## Success criteria — pomiar

- `npm test`: 124/124 PASS
- `npm run lint`: czysto
- `npm run typecheck`: 0 błędów, 0 ostrzeżeń
- `npm run build`: Complete
- `npm run smoke` (świeży podgląd po `npx astro preview stop`, `.env` brak, `SUPABASE_URL` z `.dev.vars` = lokalna instancja worktree `127.0.0.1:55521`): wszystkie kroki PASS
- `curl /` bez sesji: `302 → /auth/signin`; `/auth/signin` zawiera `lang="pl"` i „Wersja demonstracyjna”
- Kroki ręczne: wszystkie `[x]`; zgodne z tym, co widać w diffie (brak śladów „odhaczenia na ślepo”)

## Uwagi poza findingami

- Zmiana `Status` F-04 na `in-progress` w roadmapie (commit 5c65404) pochodzi od `/10x-implement` — plan przypisuje mu te pola, więc to nie dryf.
- `index.astro` używa `Astro.response.status = 302` + `Location` zamiast `Astro.redirect` (obejście awarii parsera lintu, z komentarzem) — zachowanie zgodne z planem.
- Sprawdzone i bezpieczne w middleware: `/dashboard/`, `//dashboard`, `/%64ashboard`, `/DASHBOARD`, `/dashboard?x=1`, `/dashboard/index.html` i inne — 302 albo 404.

## Findings

### F1 — Test kontrastu może pominąć token bez pomiaru

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — szybka decyzja, naprawa oczywista i wąska
- **Dimension**: Safety & Quality
- **Location**: scripts/tokens/contrast.mjs:47-86
- **Detail**: Dwie drogi, którymi token omija pomiar, obie zmierzone sondą. (1) `findRuleBody` czyta tylko pierwszy blok `:root` / `.dark`, a skaner kolorów maskuje deklaracje we wszystkich takich blokach. Dopisany na końcu `global.css` drugi `:root { --primary: #d0d0d0; }` przechodzi obie bramki, a w przeglądarce nadpisuje zmierzony kolor (ok. 1,5 : 1). Fixture w `hardcoded-colors.test.mjs` wręcz utrwala przepuszczanie drugiego `:root`. (2) Regex deklaracji wymaga `;` — ostatnia deklaracja bloku bez średnika jest pomijana w cichości. To dokładnie przypadek z lekcji „Bramka musi odróżnić blokadę od niewykonania”: para bez pomiaru wygląda jak zmierzona.
- **Fix**: `parseTokenBlocks` rzuca błąd przy powtórzonym selektorze `:root` / `.dark` i dzieli ciało bloku po `;` zamiast wymagać średnika na końcu; fixture z `--late` zmieniony tak, by oczekiwał porażki.
- **Decision**: FIXED — `parseTokenBlocks` rzuca błąd przy powtórzonym `:root` / `.dark` i czyta deklarację bez średnika; skaner maskuje tylko pierwszy blok każdego selektora; fixture `--late` oczekuje naruszenia; 2 nowe testy (126/126 PASS)

### F2 — Skaner kolorów nie łapie kilku form koloru

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — realny kompromis; warto się zatrzymać
- **Dimension**: Safety & Quality
- **Location**: scripts/tokens/hardcoded-colors.mjs:94-108
- **Detail**: Zmierzone 0 trafień dla: nazwanych kolorów CSS (`style="color: red"`, `bg-[red]`, `fill="black"`), funkcji pisanych wielką literą (`RGB(`, `Oklch(`), `color-mix(`, zmiennych palety Tailwinda (`var(--color-red-500)`, `bg-(--color-red-500)` — Tailwind v4 publikuje je w zbudowanym CSS). Osobno: krycie na klasie tekstu z tokenem (`text-foreground/50`) przechodzi obie bramki, a daje 4,77 : 1 w jasnym i 3,24 : 1 w ciemnym trybie — poniżej 7 : 1. Obecny kod tych form nie używa; luka dotyczy przyszłych plasterków.
- **Fix A ⭐ Recommended**: Domknąć formy, które agent realnie napisze: flaga `i` i `color-mix` w regexie funkcji, reguła na `--color-<paleta>-<odcień>|white|black`, nazwane kolory w wartościach `-[…]` i we właściwościach `color|background|fill|stroke:`, zakaz krycia `/<n>` na klasach `text-*`; każda forma z przypadkiem w teście.
  - Strength: Zamyka obejścia, które wyglądają jak „poprawny Tailwind” — najbardziej prawdopodobne u agenta.
  - Tradeoff: Kilka nowych reguł i przypadków testowych; ryzyko fałszywych trafień przy nazwanych kolorach (np. słowo „red” w tekście) — dlatego tylko w kontekście właściwości i wartości `[…]`.
  - Confidence: HIGH — każda luka zmierzona sondą.
  - Blind spot: Nie sprawdzone, czy krycie na tłach (`bg-primary/90`) warto mierzyć mieszaniem — dziś trzyma 7,3 : 1+.
- **Fix B**: Tylko zakaz krycia na `text-*` i flaga `i`; reszta jako znana luka w komentarzu skanera.
  - Strength: Minimalna zmiana; zamyka jedyną lukę, która łamie próg kontrastu wprost.
  - Tradeoff: Nazwane kolory i zmienne palety dalej przechodzą.
  - Confidence: MEDIUM — zależy, jak często agenci sięgną po te formy.
  - Blind spot: None significant.
- **Decision**: FIXED via Fix A — funkcje koloru bez względu na wielkość liter plus `color-mix(` i `color(`; reguły „Tailwind palette variable” (`--color-<paleta>-<odcień>|white|black`), „named color” (pełna lista nazw CSS, tylko we właściwościach/atrybutach koloru i w `-[…]`), „opacity on text token” (`text-<token>/<n>`; `text-sm/6` przepuszczane); przypadki dodatnie i ujemne w teście (127/127 PASS)

### F3 — `/dashboard.html` bez ochrony w trybie dev

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — szybka decyzja, naprawa oczywista i wąska
- **Dimension**: Safety & Quality
- **Location**: src/middleware.ts:20, src/lib/navigation.ts:12-14
- **Detail**: Zmiana `startsWith(route)` na `matchesNavHref` przestała chronić `/dashboard.html`. Router `astro dev` mapuje tę ścieżkę na `dashboard.astro` — zmierzone: 200 i szkielet wnętrza bez sesji. Na zbudowanym workerze `/dashboard.html` daje 404, więc produkcja dziś nie jest dotknięta; stałaby się, gdyby ktoś ustawił `build.format: "file"`. Dziś pustą kartę, jutro dane zdrowotne z plasterków.
- **Fix**: W `matchesNavHref` traktować też `href + ".html"` jako trafienie (albo normalizować ścieżkę przed dopasowaniem); krok smoke dla `/dashboard.html`.
- **Decision**: FIXED — `matchesNavHref` traktuje `href + ".html"` jako trafienie; krok smoke „dashboard.html redirects anonymous user”; zmierzone na świeżym podglądzie: `/dashboard.html` 302 → `/auth/signin`, smoke PASS

### F4 — Przycisk błędu ma fokus w czerwieni zamiast `ring`

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — szybka decyzja, naprawa oczywista i wąska
- **Dimension**: Plan Adherence
- **Location**: src/components/ui/button.tsx:13
- **Detail**: Plan (faza 2.3): widoczny obrys fokusu w kolorze `ring` na elementach interaktywnych. Wariant `destructive` zostawił `focus-visible:ring-destructive/20`, a `cn()` / tailwind-merge daje mu pierwszeństwo nad `focus-visible:ring-ring` z bazy — obrys 20 % czerwieni, słabo widoczny. Żaden przycisk tego wariantu nie jest dziś używany.
- **Fix**: Usunąć `focus-visible:ring-destructive/20` z wariantu `destructive`.
- **Decision**: FIXED — usunięte `focus-visible:ring-destructive/20` z wariantu `destructive`; fokus dziedziczy `focus-visible:ring-ring` z bazy

### F5 — Kształt `href` w `NAV_ITEMS` niesprawdzany, dopasowanie bez testu

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — szybka decyzja, naprawa oczywista i wąska
- **Dimension**: Safety & Quality
- **Location**: src/lib/navigation.ts:8-14
- **Detail**: Pozycja zapisana jako `"/leki/"` (z ukośnikiem na końcu) albo bez wiodącego `/` zostawi `/leki` bez ochrony i bez podświetlenia — `matchesNavHref("/leki", "/leki/")` = false. `matchesNavHref` i `findActiveNavItem` nie mają testów (`npm test` biega tylko po `scripts/**/*.test.mjs`). To ta sama lista, która decyduje o ochronie tras.
- **Fix**: Test w `scripts/` importujący `navigation.ts` (albo asercja przy module) wymagający, by każdy `href` pasował do `^/[^/]+(/[^/]+)*$`, plus przypadki dopasowania z planu (`/leki/nowe` tak, `/leki-archiwum` nie).
- **Decision**: FIXED — `scripts/navigation/navigation.test.mjs`: kształt każdego `href` w `NAV_ITEMS`, przypadki dopasowania (w tym `.html` z F3) i wybór aktywnej pozycji; `npm test` z `--experimental-strip-types`, żeby import `.ts` działał też na Node 22.14 z `.nvmrc` (sprawdzone: 22.14 i 24.13 PASS)

### F6 — Wyjątki skanera obejmują całe pliki

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — szybka decyzja, naprawa oczywista i wąska
- **Dimension**: Safety & Quality
- **Location**: scripts/tokens/hardcoded-colors.mjs:15-28
- **Detail**: Nowy kolor na sztywno dopisany do `signin.astro`, `SignUpForm.tsx` czy innego pliku z listy wyjątków przejdzie bramkę aż do S-01. Zgodne z planem, ale nigdzie nie zapisane jako świadoma luka.
- **Fix**: Przypiąć do każdego wyjątku liczbę naruszeń (test pada, gdy rośnie) albo zapisać lukę w komentarzu przy `EXCEPTIONS`.
- **Decision**: FIXED — każdy wpis `EXCEPTIONS` ma przypiętą liczbę naruszeń (`violations`); test pada przy każdej zmianie liczby; sprawdzone sondą: dopisany `text-red-500` w `SignUpForm.tsx` wywraca test

## Triage

- Fixed: F1, F2 (Fix A), F3, F4, F5, F6 (6)
- Po triage'u: `npm test` 130/130, `npm run lint` czysto, `npm run typecheck` 0 błędów, `npm run build` OK, `npm run smoke` na świeżym podglądzie przeciw lokalnej bazie `127.0.0.1:55521` — wszystkie kroki PASS
