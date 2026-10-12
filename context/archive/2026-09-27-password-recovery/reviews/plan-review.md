<!-- PLAN-REVIEW-REPORT -->

# Plan Review: Odzyskiwanie dostępu przez ustawienie nowego hasła

- **Plan**: context/changes/password-recovery/plan.md
- **Mode**: Deep
- **Date**: 2026-09-27
- **Verdict**: REVISE → SOUND (po triage'u)
- **Findings**: 0 critical, 3 warnings, 3 observations

## Verdicts

| Dimension             | Verdict |
| --------------------- | ------- |
| End-State Alignment   | PASS    |
| Lean Execution        | PASS    |
| Architectural Fitness | PASS    |
| Blind Spots           | WARNING |
| Plan Completeness     | WARNING |

## Grounding

17/17 paths ✓, 10/10 symbols ✓ (EXCEPTIONS counts, otp_expiry, min 6, mailpit in `-x`, getClaims in auth-js 2.116.0, signin → `/`), brief↔plan ✓, Progress↔Phase ✓

## Findings

### F1 — Brak wyjścia z trybu odzyskiwania

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Faza 1 #3 `RECOVERY_ALLOWED_PATHS`, Faza 2 #4 `/auth/reset-password`
- **Detail**: Sesja z odnośnika przekierowuje wszystko poza trzema trasami, także `/auth/signin`. Użytkowniczka, która po kliknięciu linku przypomni sobie stare hasło, nie ma wyjścia — `/api/auth/signout` jest dozwolony, ale żaden ekran go nie wywołuje. Sesja trwa, dopóki żyje refresh token.
- **Fix**: Na `/auth/reset-password` formularz POST na `/api/auth/signout` („Anuluj i wyloguj”) + punkt w kryteriach ręcznych fazy 2.
- **Decision**: FIXED

### F2 — Brak ścieżki błędu `signOut({ scope: "global" })`

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Faza 1 #6 Zapis nowego hasła
- **Detail**: Kontrakt opisuje tylko sukces. `auth-js` przy błędzie serwera usuwa lokalną sesję i zwraca `error` (`GoTrueClient.js`, `_signOut`). Hasło jest zmienione, inne urządzenia mogą zostać zalogowane, a `?reset=done` obieca coś, czego nie zrobiono.
- **Fix**: Błąd `signOut` → `console.error` bez adresu, przekierowanie `?reset=done` bez zmian; napis po zmianie hasła nie twierdzi, że wylogowano ze wszystkich urządzeń. Powtarzalną awarię łapie krok smoke 12.
- **Decision**: FIXED

### F3 — Połknięty błąd limitu maili zamaskuje przyczynę w smoke

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Faza 1 #1 config.toml, Faza 3 #2 smoke
- **Detail**: `supabase/config.toml:182` ma `email_sent = 2` na godzinę; komentarz mówi, że limit wymaga SMTP, więc lokalnie może nie działać — niezmierzone. Jeśli działa, testy ręczne faz 1–2 i smoke dają ≥3 maile na godzinę, trasa połyka błąd, a smoke pada na kroku 2 jako „brak maila po limicie czasu”.
- **Fix**: W pomiarze fazy 1 wyślij 3 prośby w ciągu godziny i sprawdź mailpit; jeśli trzeci nie dochodzi, podnieś `email_sent` lokalnie. Komunikat porażki kroku 2 wskazuje limit maili i `console.error` serwera.
- **Decision**: FIXED

### F4 — Nie wiadomo, jak zrobić „czysty słoik” w kroku 7

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Faza 3 #2, krok 7
- **Detail**: `request()` używa jednego globalnego `jar` (`scripts/smoke.mjs:80-92`). Wyczyszczenie go w kroku 7 zabierze sesję z odnośnika i wywróci kroki 8–9.
- **Fix**: `request(path, { jar })` z domyślnym słoikiem głównym; krok 7 dostaje osobny `new Map()`.
- **Decision**: FIXED

### F5 — Dwa brzmienia reguły rozpoznania sesji

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Key Discoveries (linia 40) vs Critical Implementation Details (linia 65)
- **Detail**: Linia 40: „każda metoda inna niż hasło = odnośnik” (domyka się bezpiecznie). Linia 65: „po zmierzonej różnicy” — może znaczyć dokładne dopasowanie `recovery`, które przepuści sesję, jeśli GoTrue nazwie ją `otp`. Pierwszy wariant przesądza, że każda przyszła metoda logowania wymaga zmiany reguły.
- **Fix**: Ustal wariant „wszystko poza `password` = tryb odzyskiwania” i komentarz w `recovery-session.ts`, że nowa metoda logowania wymaga zmiany reguły.
- **Decision**: FIXED

### F6 — Błędna uwaga o koszcie `getClaims()`

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Performance Considerations
- **Detail**: Przy kluczu HS256 `getClaims()` woła `getUser()` przez sieć. Lokalnie brak `signing_keys_path` (`config.toml:162`), więc zalogowane żądanie to dwa wywołania GoTrue. Algorytm klucza na produkcji niezmierzony.
- **Fix**: Popraw sekcję Performance; w pomiarze fazy 1 zapisz `alg` tokenu lokalnie i na produkcji.
- **Decision**: FIXED
