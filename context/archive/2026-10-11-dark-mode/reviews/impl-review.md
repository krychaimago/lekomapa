<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Tryb ciemny (S-11)

- **Plan**: context/changes/dark-mode/plan.md
- **Scope**: Full plan
- **Reviewed phases**: 1, 2, 3
- **Date**: 2026-10-11
- **Verdict**: APPROVED
- **Findings**: 0 critical, 1 warning, 5 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | PASS    |
| Scope Discipline    | WARNING |
| Safety & Quality    | WARNING |
| Architecture        | PASS    |
| Pattern Consistency | PASS    |
| Success Criteria    | PASS    |

Bramki przy przeglądzie (2026-10-11): `npm test` 399/399, `npm run typecheck` czysto, `npm run lint` 0 błędów, `npx playwright test` (z buildem) 7 passed / 6 skipped (galeria). Galeria `DARK_GALLERY=1` 7/7 w fazie 3. Sprawdzenia ręczne 1.5–3.7 potwierdzone przez autorkę.

Sprawdzone bez zastrzeżeń: `safeReturnPath` przeciw `//`, `\`, `%2F`, tabulatorom i nowym liniom (otwartego przekierowania brak), CSRF (`checkOrigin` domyślnie włączone), XSS (`data-theme` tylko z trzech wartości), atrybuty ciasteczka, bramka warunków na `/api/preferences/theme`, brak mignięcia, brak nazw leków w URL.

## Findings

### F1 — Sprzątanie galerii nie jest pełne przy awarii w połowie

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: tests/e2e/dark-gallery.spec.ts:419-457
- **Detail**: Nagłówek pliku obiecuje usunięcie danych „także gdy zrzut padnie w połowie”. Dwie luki: (1) wpis dzienniczka nie jest szukany po znaczniku biegu — jeśli `journalId` się nie zapisze, wpis zostaje na koncie testowym; (2) jedno nieudane usunięcie leku przerywa pętlę, więc pozostałe leki i końcowe sprawdzenie „zero znaczników” się nie wykonują. Dotyczy tylko lokalnego konta E2E, ale resztki mogą wywrócić przyszły test oczekujący pustej listy.
- **Fix**: Szukać znacznika także na `/dzienniczek`; usuwać każdy element w try/catch, zbierać porażki i rzucić błąd dopiero po końcowym sprawdzeniu.
- **Decision**: FIXED — journal entry also found by run marker; every deletion attempted separately, failures reported after the final check (lint, prettier, typecheck clean; gallery not re-run)

### F2 — Pomiar galerii wpina stałe elementy w treść (poza planem)

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: tests/e2e/dark-gallery.spec.ts:26-29, 407
- **Detail**: Plan zakładał zwykły zrzut całej strony. W fazie 3 dodano CSS tylko na czas zrzutu: dolny pasek zakładek i pas boczny w przepływie strony — inaczej pasek zasłaniał komunikat błędu. Aplikacja bez zmian, galeria to opisuje. Pozostałe dodatki poza planem (polskie etykiety w `auth.setup.ts` i `seed.spec.ts`, status roadmapy) są uzasadnione i opisane w commitach. Galeria nie pokazuje więc faktycznego nakładania się stałych elementów — to przegląd kolorów, nie układu.
- **Fix**: Dopisać jedno zdanie w `## Notes` w `change.md`.
- **Decision**: FIXED — note added to change.md ## Notes

### F3 — Testy `safeReturnPath` nie pilnują znaków sterujących ani `#`; znaki spoza ASCII dają 500

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: scripts/theme/theme.test.mjs:27-41, src/lib/theme.ts:26-34
- **Detail**: Kod odrzuca `#` i znaki sterujące, ale żaden test tego nie sprawdza — usunięcie tych warunków zostawi testy zielone. Najważniejszy przypadek: przeglądarka wycina tabulator z adresu, więc `/\t/evil.com` stałby się `//evil.com` (wyjście poza lekomapę). Dodatkowo ścieżka ze znakiem spoza ASCII (np. `/ł`) przechodzi filtr, a nagłówek `Location` jej nie przyjmuje → błąd 500. Niewykorzystywalne (wymaga spreparowanego POST z tej samej domeny; prawdziwa ikona wysyła ścieżkę już zakodowaną).
- **Fix**: Dodać do testu `"/\t/example.com"`, `"/\n/example.com"`, `"/leki#x"`, `"/ł"`; w `safeReturnPath` przepuszczać tylko drukowalne ASCII (`/^[\x21-\x7e]+$/`).
- **Decision**: FIXED — safeReturnPath accepts printable ASCII only; tests cover "#", tab, newline and "/ł" (theme tests 4/4)

### F4 — Test „Jak w systemie” nie odróżnia zapisu „system” od „jasny”

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: tests/e2e/theme.spec.ts:71-85
- **Detail**: Urządzenie emulowane jako jasne, więc brak klasy `dark` po zapisie „Jak w systemie” przejdzie też wtedy, gdy trasa zapisze „light”. `toHaveURL(/\/konto$/)` i `toBeChecked()` są prawdziwe jeszcze przed przekierowaniem.
- **Fix**: Po zapisie przełączyć emulację na `dark` i oczekiwać klasy `dark` — to dowodzi, że zapisano „system”.
- **Decision**: FIXED — after saving, the device is switched to dark and the page must turn dark (Playwright: passed)

### F5 — Zachowanie bramki warunków na `/api/preferences/theme` niezapisane w teście

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: scripts/theme/appearance-copy.test.mjs (wzór: scripts/account/account-copy.test.mjs:62-70)
- **Detail**: Test sąsiedniej funkcji (usunięcie konta) przypina `termsGateAction(...) === "forbid"` dla swojej trasy. Plan opiera się na tym, że trasa trybu przechodzi przez bramkę jak każde `/api/*`, ale nic tego nie pilnuje — dopisanie jej do wyjątków byłoby niewidoczne.
- **Fix**: Jedna asercja `termsGateAction("/api/preferences/theme", null, 1) === "forbid"`.
- **Decision**: FIXED — assertion termsGateAction("/api/preferences/theme", null, 1) === "forbid" in scripts/theme/theme.test.mjs (5/5)

### F6 — Przekierowanie trasy trybu bez `Cache-Control: private, no-store`

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/pages/api/preferences/theme.ts:24
- **Detail**: Sąsiednie trasy (`api/account/delete.ts:30`, `api/journal/[id]/delete.ts:27`) ustawiają ten nagłówek na przekierowaniu. Tu jest `context.redirect(...)` z `Set-Cookie`. Odpowiedź 303 domyślnie nie trafia do bufora, więc ryzyko praktycznie zerowe.
- **Fix**: Zbudować odpowiedź 303 ręcznie z nagłówkiem, jak w sąsiednich trasach.
- **Decision**: FIXED — manual 303 with Cache-Control: private, no-store (theme.spec.ts 6/6, npm test 400/400)
