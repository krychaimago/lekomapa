<!-- PLAN-REVIEW-REPORT -->

# Plan Review: Śledzenie błędów i monitor dostępności (F-06)

- **Plan**: context/changes/production-observability/plan.md
- **Mode**: Deep
- **Date**: 2026-10-13
- **Verdict**: REVISE
- **Findings**: 1 critical, 6 warnings, 3 observations
- **Triage (2026-10-13)**: all 10 fixed in plan (F7 and F8 with adjustments noted in Decision). Verdict after fixes: SOUND

## Verdicts

| Dimension             | Verdict |
| --------------------- | ------- |
| End-State Alignment   | WARNING |
| Lean Execution        | PASS    |
| Architectural Fitness | PASS    |
| Blind Spots           | WARNING |
| Plan Completeness     | FAIL    |

## Grounding

12/12 paths ✓, 4/4 symbols ✓ (`@astrojs/cloudflare/handler` export, `routePattern`, `sequence`, `locals.cfContext`), brief↔plan ✓. `console.error`: 61 calls in 36 files (the plan says ~57). Installed Astro is 7.3.2, adapter 14.3.1.

Verified as sound:

- The adapter respects a custom `main` (`dist/wrangler.js`), and `triggers` is copied into `dist/server/wrangler.json`.
- `next()` rejects when a page frontmatter or endpoint throws.
- No `scripts/**` file (tests, smoke, db-checks) imports a module that currently contains `console.error`.

## Findings

### F1 — `cloudflare:workers` has no types; `npm run typecheck` fails

- **Severity**: ❌ CRITICAL
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Plan Completeness
- **Location**: Phase 1 (#2 `report.ts`), Phase 4 (#2 `src/worker.ts`)
- **Detail**:
  - The repo has no `@cloudflare/workers-types`, no `worker-configuration.d.ts` and no `declare module "cloudflare:workers"`.
  - A probe file failed with `TS2307: Cannot find module 'cloudflare:workers'`.
  - `@astrojs/cloudflare/dist/utils/handler.d.ts` also relies on the globals `ExportedHandler`, `Env` and `ExecutionContext`.
  - Running `npx wrangler types` (workerd 1.20261001.1, date 2026-05-08) declares `waitUntil`. With that file included, all of `src/` typechecks with 0 errors.
- **Fix A ⭐ Recommended**: At the start of Phase 1, generate types with `npx wrangler types`, commit the file, include it in `tsconfig` and add an `npm run cf-typegen` script.
  - Strength: Official Cloudflare path. Measured: typecheck passes with it.
  - Tradeoff: The file must be regenerated after changing vars or `compatibility_date`.
  - Confidence: HIGH — measured with a probe.
  - Blind spot: Whether CI needs regeneration, or whether the committed file is enough.
- **Fix B**: Add the `@cloudflare/workers-types` package.
  - Strength: No generated file to keep in sync.
  - Tradeoff: Does not know the project's `Env`, and its version can drift from the runtime.
  - Confidence: MED — not measured.
  - Blind spot: Possible conflict with DOM lib types.
- **Decision**: FIXED (Fix A) — Phase 1 #0 added; tsconfig already includes root files; CLAUDE.md rule in Phase 5 #3

### F2 — Same error in different routes lands in one Sentry group; the second one sends no mail

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: End-State Alignment
- **Location**: Phase 1 (#1 `buildErrorEvent`, #2 `reportError`)
- **Detail**:
  - `fingerprint = [where, code, type]` has no route. Example:
    1. `request.exception` with `TypeError` on `/leki` opens a new issue and sends mail.
    2. Later the same `TypeError` on `/dzienniczek` joins the same issue, so no mail is sent.
  - This breaks the promise "a new kind of error sends mail".
  - Separately, `reportError` accepts `status`, but `buildErrorEvent` has no `status` input. The implementer would have to guess where the 5xx status goes.
- **Fix**: Add `route` to `fingerprint` and pass `status` as `code` when no `code` is given. Extend the Phase 1 test to cover both.
  - Strength: Each failing route gets its own issue and its own mail.
  - Tradeoff: More issues in Sentry. Fine at 5k events per month.
  - Confidence: HIGH — Sentry groups by `fingerprint` verbatim.
  - Blind spot: None significant.
- **Decision**: FIXED — route added to fingerprint; status passed as code; Phase 1 test extended

### F3 — The 503 from the health page is still reported by middleware

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 3 (#3) vs Phase 1 (#4)
- **Detail**: Phase 3 says `/api/health` does not report its failure, because the monitor already alarms. But the middleware layer reports every response ≥ 500, so the 503 reaches Sentry as `request.5xx`. That is a second mail about the same outage.
- **Fix**: The middleware layer skips the route pattern `/api/health`. Record this in the Phase 1 contract.
- **Decision**: FIXED — middleware skips request.5xx for /api/health; exceptions still reported

### F4 — `import.meta.env.DEV` reports "production" under `npm run preview`

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 1 (#2), Phase 5 step 4
- **Detail**: Preview runs the built app, so `DEV` is `false`. Phase 5 step 4 expects `environment: local`; the local test event would land under production instead.
- **Fix**: Add an optional `SENTRY_ENVIRONMENT` to `env.schema` with default `"production"`, and set `"local"` in `.dev.vars`.
- **Decision**: FIXED — SENTRY_ENVIRONMENT in env.schema (default production), local in .dev.vars and .env.example

### F5 — Manual tests with revoked grants do not move `.env` aside and can hit the production database

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 2 manual verification, Phase 5 step 4
- **Detail**:
  - Lesson "Lokalne bramki sprawdź…": `.env` points to production and overrides `.dev.vars`.
  - Without moving `.env` aside, Phase 5 step 4 inserts "Ibuprofen 400 mg" into the production database, and the revoke on the local database has no effect.
  - The plan moves `.env` aside only for smoke.
- **Fix**: In both steps, add in this order:
  1. move `.env` aside,
  2. stop the old preview (`npx astro preview stop`),
  3. confirm a fresh row in local `auth.users`.
- **Decision**: FIXED — three-step preparation (move .env, stop preview, confirm local auth.users row) in Phase 2 manual and Phase 5 step 4; cleanup step added

### F6 — The `grep` in criterion 2.2 can pass without checking anything

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 2, criterion 2.2
- **Detail**:
  - The shell on this machine is zsh. It aborts an unquoted `--include=*.ts` with `no matches found`, before any file is searched.
  - The output is then empty, so "returns nothing" passes.
  - Observed in this session.
  - This is the case from the lesson "Bramka musi odróżnić blokadę od niewykonania".
- **Fix**: Quote the patterns: `--include='*.ts' --include='*.tsx' --include='*.astro'`.
- **Decision**: FIXED — --include patterns quoted

### F7 — Phase 4: wrong local trigger and no contract for the Crons check-in

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 4 (#2, #3, criterion 4.6)
- **Detail**:
  - The project runs through `@cloudflare/vite-plugin`. The scheduled handler is triggered by `npm run preview` + `/cdn-cgi/local/scheduled`, not by `wrangler dev --test-scheduled` + `/__scheduled` (miniflare `CorePaths.SCHEDULED`; the plugin sets `unsafeTriggerHandlers` in dev and preview).
  - The check-in envelope has no named function or module, yet the Phase 4 test asserts its field list.
  - The plan does not say whether the `exceeded-cpu-check` monitor is created by hand or by the first check-in.
- **Fix**:
  - Fix the command in 4.6.
  - Add `buildCheckInEnvelope(slug, status, dsn)` with an allowed field list to `exceeded-cpu.ts`.
  - Decide that the monitor is created by hand in Phase 5 step 8.
- **Decision**: FIXED — 4.6 uses preview + /cdn-cgi/local/scheduled; buildCheckInEnvelope contract and test; monitor created by hand in Phase 5 step 5 (before secrets), alarm in step 8

### F8 — A Supabase Auth outage silently signs users out and is not reported

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 1 (#4) / Phase 2
- **Detail**:
  - `supabase.auth.getUser()` does not throw on outage. It returns `AuthRetryableFetchError` in `error` (`auth-js GoTrueClient.js:2716-2723`).
  - `src/middleware.ts:25-28` ignores that error, so a signed-in user is redirected to sign-in. There is no 5xx and no log.
  - The health monitor catches it only if the database is down too.
- **Fix**: In Phase 2, add `reportError("auth.get-user", { code })` when the error is anything other than `AuthSessionMissingError`.
- **Decision**: FIXED (narrowed) — Phase 2 reports auth.get-user only for AuthRetryableFetchError or status >= 500; 4xx and missing session not reported

### F9 — Errors in child components while streaming bypass middleware

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: End-State Alignment
- **Location**: Desired End State, Phase 1 (#4)
- **Detail**: Only page frontmatter and endpoint handlers reject `next()`. Child-component errors during streaming go to `controller.error` after the 200 response has resolved (`astro/dist/runtime/server/render/astro/render.js:62-73`). Desired End State promises "a crash on any route".
- **Fix**: Name this limit in "What We're NOT Doing", or hand it to `/10x-observability-audit`.
- **Decision**: FIXED — Desired End State narrowed; streaming child-component crash named in What We're NOT Doing, handed to /10x-observability-audit

### F10 — `reportError` must stay out of modules imported by `npm test`

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Architectural Fitness
- **Location**: Phase 2, Phase 5 (#3 CLAUDE.md)
- **Detail**:
  - Today none of the 36 files is imported by tests or smoke.
  - `report.ts` imports `cloudflare:workers`. A single call in `services/{journal,medications,doctor-question,visit-summary}.ts`, `terms-gate.ts` or `navigation.ts` would break `npm test` and smoke.
- **Fix**: Add this boundary to the CLAUDE.md rule from Phase 5: `reportError` only in routes, pages, middleware and `*-data` services.
- **Decision**: FIXED — usage boundary in Phase 2 contract and CLAUDE.md rule (Phase 5 #3)
