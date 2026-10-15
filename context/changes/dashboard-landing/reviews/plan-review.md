<!-- PLAN-REVIEW-REPORT -->

# Plan Review: Start na liście leków zamiast pustego `/dashboard`

- **Plan**: context/changes/dashboard-landing/plan.md
- **Mode**: Deep
- **Date**: 2026-10-15
- **Verdict**: SOUND
- **Findings**: 0 critical, 1 warning, 0 observations

## Verdicts

| Dimension             | Verdict |
| --------------------- | ------- |
| End-State Alignment   | PASS    |
| Lean Execution        | PASS    |
| Architectural Fitness | WARNING |
| Blind Spots           | PASS    |
| Plan Completeness     | PASS    |

## Grounding

7/7 paths ✓, 10/10 dashboard references ✓, Progress↔Phase ✓ (10 + 4 items), brief↔plan ✓

Verified in code (sub-agent):

- Status 302 is kept, not replaced by 301 or 308: `@astrojs/underscore-redirects` `getRedirectStatus`.
- Smoke `request()` uses `redirect: "manual"`, so it never follows redirects.
- The account at `:2713` has accepted the terms.
- `terms-gate.test.mjs` hard-codes its path lists.
- The dark-mode gallery test checks pages and entries in both directions.
- `auth.setup.ts` waits for any URL that is not `/auth/signin`.

## Findings

### F1 — Plan doesn't say /dashboard is redirected before the Worker runs

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Architectural Fitness
- **Location**: Critical Implementation Details; Faza 1 §2 and §7
- **Detail**:
  - The adapter writes `/dashboard /leki 302` to `dist/client/_redirects` (`node_modules/@astrojs/cloudflare/dist/index.js:528-549`).
  - Cloudflare static assets answer from that file before the Worker runs. `wrangler.jsonc` sets no `run_worker_first`.
  - As a result, middleware, Sentry and app headers never see `/dashboard`. `npm run preview` behaves the same way.
  - The `/dashboard.html` → 404 note was only in plan-brief.md.
- **Fix**: Add to the plan:
  - a note in Critical Implementation Details,
  - the same note in the CLAUDE.md sentence,
  - a post-build check `grep -F "/dashboard /leki 302" dist/client/_redirects`,
  - the `/dashboard.html` → 404 note.
- **Decision**: FIXED — added to plan; new Progress item 1.5, items renumbered 1.5–1.11
