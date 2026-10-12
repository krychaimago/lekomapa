<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Odzyskiwanie dostępu przez ustawienie nowego hasła

- **Plan**: context/changes/password-recovery/plan.md
- **Scope**: Phase 3 of 3
- **Reviewed phases**: 3
- **Date**: 2026-10-12
- **Verdict**: APPROVED
- **Findings**: 0 critical, 2 warnings, 2 observations

Phase 3 landed in 8d76504 (squash-merged to `main` as b0b52db, PR #45). Checked against that commit and against HEAD: the recovery block in `scripts/smoke.mjs` and both reset-password pages are unchanged since; `ci.yml`, `CLAUDE.md` and `README.md` still carry the phase 3 content.

Success criteria: `npm run lint` (0 errors, 60 pre-existing warnings), `npm run typecheck`, `npm test` pass on 2026-10-12. `npm run smoke` was not re-run locally (it needs `.env` moved aside); the CI `smoke` job passed on PR #45 and on `main` at ee89375 (2026-10-12), including all 13 recovery steps. Manual 3.6 is recorded in `change.md`; 3.7 and 3.8 were completed in F-05 (96b18ea).

Unplanned but justified: Referrer-Policy `no-referrer` → `same-origin` on both reset pages (under `no-referrer` the browser sent `Origin: null` and Astro answered 403), `formOrigin()` in smoke, control refresh in step 3, a smoke-mode paragraph in README. The Referrer-Policy fix is recorded in the commit message and as a lesson.

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | PASS    |
| Scope Discipline    | PASS    |
| Safety & Quality    | WARNING |
| Architecture        | PASS    |
| Pattern Consistency | WARNING |
| Success Criteria    | PASS    |

## Findings

### F1 — Old-password step accepts any sign-in error

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: scripts/smoke.mjs:2079-2083
- **Detail**: "recovery: old password no longer signs in" expects `location: "/auth/signin?error="` as a prefix. That also matches `?error=unknown`, which `src/pages/api/auth/signin.ts:17` returns when Supabase is not configured — the step passes without proving the old password is rejected. Lesson "Bramka musi odróżnić blokadę od niewykonania". The account-deletion steps already use exact `?error=credentials`.
- **Fix**: `{ status: 302, location: "/auth/signin?error=credentials", exact: true }`.
- **Decision**: FIXED — expected location is now exact `/auth/signin?error=credentials` (scripts/smoke.mjs:2082).

### F2 — Expired-link step does not derive Origin from the page

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: scripts/smoke.mjs:2046-2053
- **Detail**: "the same link used again in another browser is expired" posts with the default `BASE_URL` Origin, while the step before it uses `formOrigin(link)`. Same result today, but it breaks lesson "Smoke wysyła nagłówki tak jak przeglądarka": if the page went back to `no-referrer`, this step would keep passing while a browser gets 403 (step 5 would still catch it).
- **Fix**: create the fresh jar once and pass `origin: await formOrigin(linkPath(), freshJar)` as step 5 does.
- **Decision**: FIXED — the step creates a fresh cookie jar and derives Origin with `formOrigin(linkPath(), freshJar)`.

### F3 — Token travels in same-origin Referer; comment says otherwise

- **Severity**: 💡 OBSERVATION
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/pages/auth/reset-password/confirm.astro:10-14
- **Detail**: Under `same-origin` the full URL with `token_hash` goes as `Referer` on same-origin requests from the confirm page (assets, the verify POST). The token stays on lekomapa's own origin and is consumed by that POST, so no leak to third parties. But the comment on line 10 ("keep it out of … Referer headers") is no longer true. `src/pages/auth/confirm.astro` (email confirmation, later change) uses the same policy.
- **Fix A ⭐ Recommended**: correct the comment to say the token stays out of cross-site Referer only.
  - Strength: one-line edit, no behaviour change, no risk of breaking the form again.
  - Tradeoff: token still appears in same-origin Referer (and potentially in Cloudflare request logs of asset requests).
  - Confidence: HIGH — behaviour already verified by CI and in a real browser.
  - Blind spot: whether Cloudflare logs keep the Referer header.
- **Fix B**: switch both pages to `strict-origin` and correct the comment.
  - Strength: Referer carries only the origin, never `token_hash`; Origin on the https POST stays non-null.
  - Tradeoff: a header change on a form page — by the lesson it needs a check in a real browser on production, the same kind of change that once broke recovery for everyone.
  - Confidence: MED — follows the Fetch spec; not measured in this project.
  - Blind spot: browser behaviour on the local http preview.
- **Decision**: FIXED via Fix A — comment corrected in `src/pages/auth/reset-password/confirm.astro` and `src/pages/auth/confirm.astro`. `reset-password.astro` left as is: its URL carries no token.

### F4 — Mailpit fetch has no per-request timeout

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: scripts/smoke.mjs:1915-1939
- **Detail**: The 15 s limit in `waitForMail` is checked only between requests. A mailpit that accepts the connection and hangs would stall the smoke run for minutes instead of failing after 15 s. A hang still ends in failure, never a false pass.
- **Fix**: `fetch(url, { signal: AbortSignal.timeout(5000) })` in `mailpitMessagesTo`.
- **Decision**: FIXED — `AbortSignal.timeout(MAILPIT_REQUEST_TIMEOUT_MS)` (5 s) on both mailpit fetches (`mailpitMessagesTo`, `readMessage`).
