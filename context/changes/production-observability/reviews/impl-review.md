<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Śledzenie błędów i monitor dostępności (F-06)

- **Plan**: context/changes/production-observability/plan.md
- **Scope**: Full plan (faza 5 bez kroku 5.10 — pomiar CPU czeka na okno 24 h)
- **Reviewed phases**: 1, 2, 3, 4, 5, 6
- **Date**: 2026-10-14
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 3 warnings, 4 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | WARNING |
| Scope Discipline    | PASS    |
| Safety & Quality    | WARNING |
| Architecture        | PASS    |
| Pattern Consistency | WARNING |
| Success Criteria    | PASS    |

Success Criteria (14.10.2026): `npm test` 467/467, `npm run typecheck`, `npm run lint` (0 błędów, 10 ostrzeżeń), `npm run build`, `dist/server/wrangler.json` z `*/15 * * * *`, brak `console.error` w `src/` poza `src/lib/observability/`, `npm run db:check` (15 plików), `npx supabase migration list` z `20261013120000` po obu stronach, `curl https://lekomapa.pl/api/health` → 200 `{"status":"ok"}`, `cache-control: no-store`. `npm run smoke` nie uruchomiony ponownie w przeglądzie (wymaga odsunięcia `.env`); przeszedł w fazach 2–4.

Pliki spoza planu, uzasadnione: `src/lib/registry-suggestions.ts` i `src/components/hooks/useRegistrySuggestions.ts` (stałe przeniesione, żeby hook przeglądarki nie wciągał `report.ts`), `eslint.config.js` i `.prettierignore` (pomijają wygenerowany `worker-configuration.d.ts`).

Świadomie przyjęte w planie, nie finding: podwójne zgłoszenie przy 500 z trasy JSON (`reportError` w trasie + `request.5xx` w middleware), „Critical Implementation Details”.

## Findings

### F1 — Błędy wywołane przez użytkowniczkę trafiają do Sentry jako awarie

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/account/delete.ts:86-91, src/pages/api/auth/email-resend.ts:29-31, src/pages/api/auth/password-reset-request.ts:36-38
- **Detail**: Złe hasło przy usuwaniu konta (`invalid_credentials`, 400) i limit wysyłki maili (429) wołają `reportError`, więc dają zgłoszenie i mail. Plan sam sobie przeczy: faza 2 każe podmienić każde `console.error`, a „What We're NOT Doing” wyklucza zgłaszanie „nieprawidłowe logowanie” i innych oczekiwanych błędów. Middleware (`auth.get-user`) już stosuje właściwą regułę: tylko `isAuthRetryableFetchError` albo status ≥ 500. Skutek: szum w skrzynce, zużycie limitu 5 tys. zgłoszeń, ryzyko przyzwyczajenia się do ignorowania maili z Sentry.
- **Fix**: W trzech miejscach zgłaszać tylko przy `isAuthRetryableFetchError(error)` albo `error.status >= 500`; pozostałe przypadki bez zgłoszenia (zachowanie dla użytkowniczki bez zmian).
  - Strength: Ta sama reguła co `src/middleware.ts` (`auth.get-user`); zgodne z „What We're NOT Doing”.
  - Tradeoff: Test `report-usage` przestaje wymagać zgłoszenia w każdym dawnym miejscu — ale tego nie wymagał.
  - Confidence: HIGH — kod i dawne `console.error` sprawdzone w diffie.
  - Blind spot: Inne trasy auth z dawnym `console.error` (`email-confirm`, `password-update`) nie przejrzane pod kątem 4xx.
- **Decision**: FIXED — zgłoszenie tylko przy `isAuthRetryableFetchError` albo status ≥ 500 w trzech trasach (14.10.2026)

### F2 — Test zakazu pilnuje nazw pól, nie ich wartości

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: scripts/observability/report-usage.test.mjs:59-69, src/lib/observability/error-report.ts:130,139-141
- **Detail**: Skaner sprawdza, że `reportError` dostaje tylko klucze `code`/`status`/`error`/`route`, ale nie co w nich jest. `reportError("x.y", { code: error.message })` przechodzi test, a `code` idzie wprost do tagu i `fingerprint` w Sentry — treść błędu Postgresa może nieść wartości wiersza (nazwa leku). Dziś każde wywołanie jest poprawne, ale obietnica „treść błędu nigdy nie wychodzi” stoi na przeglądzie, nie na bramce (lesson „Regułę pilnuje test, nie komentarz”).
- **Fix A ⭐ Recommended**: W `buildErrorEvent` przepuszczać `code` tylko jeśli pasuje do `^[\w.-]{1,64}$`, inaczej `"invalid"`; test w `error-report.test.mjs` z `code: "Ibuprofen 400 mg"`.
  - Strength: Ochrona u źródła — obejmuje każde przyszłe wywołanie, także z zadania 1102.
  - Tradeoff: Jedno-wyrazowa treść (np. `Ibuprofen`) nadal przejdzie wzorzec.
  - Confidence: MED — kody Postgresa, Supabase i HTTP mieszczą się we wzorcu; nie sprawdzone dla wszystkich kodów auth.
  - Blind spot: Pole `route` dalej niepilnowane.
- **Fix B**: W skanerze wymagać, by `code`/`status` były literałem albo dostępem kończącym się na `.code`/`.status`, a `route` dostępem `.routePattern`.
  - Strength: Wyklucza także jedno-wyrazową treść i pilnuje `route`.
  - Tradeoff: Więcej kodu skanera; nie chroni wywołań, których skaner nie widzi.
  - Confidence: HIGH — wszystkie obecne wywołania mają tę postać (raport podagenta, do potwierdzenia testem).
  - Blind spot: Lokalna zmienna `const code = error.message` przejdzie jako identyfikator, jeśli skaner dopuści identyfikatory.
- **Decision**: FIXED via Fix A — `code` spoza `^[\w.-]{1,64}$` wychodzi jako `invalid`; test z `Ibuprofen 400 mg` padał przed poprawką (14.10.2026)

### F3 — Reguła w CLAUDE.md węższa niż kod

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: CLAUDE.md (`### Konwencje kodu`, „Błędy serwera”)
- **Detail**: Reguła dopuszcza `reportError` w trasach, middleware i serwisach `*-data`. Kod woła go też w `src/lib/services/registry-search.ts` i `src/lib/services/terms-acceptance.ts` (zgodnie z fazą 2: podmiana każdego `console.error`). Żaden nie jest importowany przez `scripts/**`, więc nic się nie psuje — ale następny agent, czytając regułę, uzna te pliki za naruszenie albo nie zrozumie granicy.
- **Fix**: Przeformułować na „wyłącznie w modułach, których nie importuje `scripts/**` (trasy, middleware, serwisy `*-data`, `registry-search.ts`, `terms-acceptance.ts`)”.
- **Decision**: FIXED — reguła w CLAUDE.md opisuje granicę (moduły nieimportowane przez `scripts/**`) i wymienia oba serwisy (14.10.2026)

### F4 — Kontrakt planu nieaktualny po poprawce 8f5b2b6

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: src/lib/observability/error-report.ts:17-18,26,136,143; src/lib/observability/exceeded-cpu.ts:237,250
- **Detail**: Plan (faza 1 §1) mówi, że `exception.values[0]` zawsze ma `stacktrace.frames`, i nie podaje `platform`. Kod wysyła `platform: "node"` i pomija pusty ślad (Sentry odrzucał pustą listę). Kod i test są zgodne, uzasadnienie w commicie i `verification.md`. Drugie odstępstwo: `exceeded-cpu.ts` woła `console.error` wprost (zadanie działa poza Astro, `report.ts` importuje `astro:env`), a plan mówi o jednym dozwolonym `console.error` w `report.ts`.
- **Fix**: Dopisać w `plan.md` krótki aneks pod fazą 1 z oboma odstępstwami.
- **Decision**: FIXED — aneks pod fazą 1 w `plan.md` (platform, pusty ślad, filtr `code`, `console.error` w zadaniu 1102) (14.10.2026)

### F5 — Brak limitu czasu na zapytaniach wychodzących

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/health.ts:27, src/lib/observability/exceeded-cpu.ts:182-186, src/lib/observability/error-report.ts:184-186
- **Detail**: Żadne `fetch`/`rpc` nie ma limitu czasu. `/api/health` przy zawieszonej bazie wisi zamiast szybko oddać 503 (monitor i tak uzna to za porażkę po 5 s). W zadaniu 1102 wolny Sentry opóźnia kolejne kroki. Bez wpływu na użytkowniczkę: `sendEvent` idzie w `waitUntil`.
- **Fix**: `AbortSignal.timeout(…)` — ok. 3 s dla `/api/health`, 10 s w zadaniu i wysyłce.
- **Decision**: FIXED — `AbortSignal.timeout`: 3 s w `/api/health`, 10 s w zapytaniu do Cloudflare i w `sendEvent`; bez nowego testu (14.10.2026)

### F6 — SENTRY_ENVIRONMENT wpisywany w kod przy buildzie

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: astro.config.mjs (`SENTRY_ENVIRONMENT`, `access: "public"`), src/lib/observability/report.ts:38
- **Detail**: Zmienna publiczna serwera jest wstawiana do paczki przy buildzie (`node_modules/astro/dist/env/vite-plugin-env.js:134-140`), a zadanie 1102 czyta `env.SENTRY_ENVIRONMENT` w runtime. Dziś działa poprawnie: produkcję buduje wyłącznie CI bez tej zmiennej (→ `production`), a lokalny build bierze `local` z `.dev.vars`. Gdyby ktoś wdrożył z maszyny deweloperskiej, zgłoszenia z żądań szłyby jako `local`, a z zadania jako `production`.
- **Fix**: Zmienić na `access: "secret"` (odczyt w runtime, jak `SENTRY_DSN`).
- **Decision**: FIXED — `SENTRY_ENVIRONMENT` z `access: "secret"`; w zbudowanej paczce `_internalGetSecret("SENTRY_ENVIRONMENT")` zamiast stałej (14.10.2026)

### F7 — Nazwa pliku w ramce śladu bez filtra

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/observability/error-report.ts:111-118
- **Detail**: Nazwa funkcji przechodzi filtr `FRAME_FUNCTION`, nazwa pliku tylko traci `?`/`#`. Usuwanie treści błędu ze śladu (:98-103) zdejmuje bieżące `error.message`; jeśli biblioteka zmieni `message` po utworzeniu błędu, linia treści zaczynająca się od `at ` stałaby się ramką, a jej tekst — `filename`. Mało prawdopodobne.
- **Fix**: Przepuszczać `filename` tylko przy wzorcu ścieżki (np. `^[\w./:@-]+$`), inaczej `"?"`, z przypadkiem w `error-report.test.mjs`.
- **Decision**: FIXED — `filename` spoza `^[\w./:@<>-]+$` wychodzi jako `?`; test padał przed poprawką (14.10.2026)

## Triage (14.10.2026)

- Fixed: F1, F2 (Fix A), F3, F4, F5, F6, F7 (7)
- Po poprawkach: `npm test` 469/469, `npm run typecheck` 0 błędów, `npm run build` przechodzi.
- Poza findingami: lokalny `.dev.vars` ma `SENTRY_ENVIRONMENT=loca` (literówka; produkcji nie dotyczy).
