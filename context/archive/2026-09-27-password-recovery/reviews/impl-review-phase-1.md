<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Odzyskiwanie dostępu przez ustawienie nowego hasła

- **Plan**: context/changes/password-recovery/plan.md
- **Scope**: Phase 1 of 3
- **Reviewed phases**: 1
- **Date**: 2026-09-27
- **Verdict**: APPROVED
- **Findings**: 0 critical, 2 warnings, 4 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | PASS    |
| Scope Discipline    | PASS    |
| Safety & Quality    | WARNING |
| Architecture        | PASS    |
| Pattern Consistency | PASS    |
| Success Criteria    | PASS    |

Automated checks rerun during review on commit f97d255: `npm run lint` (0 errors, 2 `no-console` warnings on the intended `console.error` calls), `npm run typecheck` (0 errors), `npm run build` (success), `npm test` (130/130 pass).

Manual items 1.5–1.8 are marked `[x]`. Item 1.5 has recorded evidence in `change.md` (`## Notes`). Items 1.6–1.8 (curl runs) have no recorded output; they are consistent with the code but not independently verified by this review.

All seven planned changes match the plan. The only file outside "Changes Required" is `context/foundation/roadmap.md` (F-05 row, S-10 in progress): bookkeeping the plan already assumes.

## Findings

### F1 — Password update gate lets a normal session through when getClaims fails

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/auth/password-update.ts:54-58
- **Detail**: `isRecoverySession` treats missing claims as a recovery session. In the middleware this locks the interior (safe). In `password-update` the same `true` grants permission to set a password. When `getClaims()` returns an error (JWKS fetch failure, `getSession` error), `claimsData` is `null`, so an ordinary password session passes the gate and can set a new password without the old one. Real impact is limited: `secure_password_change = false` (supabase/config.toml:215), so a normal session can already call `updateUser` against Supabase directly. But the gate does not do what the plan says it does.
- **Fix**: In `password-update`, redirect to `EXPIRED_PATH` when `getClaims()` returns an error or no claims; only a recovery result from present claims allows the update.
- **Decision**: FIXED — `claimsError` or missing claims redirect to EXPIRED_PATH before `isRecoverySession` is asked.

### F2 — Middleware ignores getClaims errors: silent lock or 500 on every page

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/middleware.ts:30-31
- **Detail**: The `error` from `getClaims()` is dropped. A transient error (e.g. JWKS refetch after the 10-minute cache) sends a normally logged-in user to `/auth/reset-password` with no log line to diagnose it. `getClaims()` also rethrows non-auth errors (node_modules/@supabase/auth-js/dist/module/GoTrueClient.js:5570-5574, e.g. a WebCrypto `DOMException`), which gives a 500 on every page for logged-in users.
- **Fix**: Log `{ code, status }` of the error (no address, no token) and wrap `getClaims()` in try/catch that treats a throw like an error (fail-closed, as planned).
- **Decision**: FIXED — error logged as `{ code, status }`, throw caught and logged by `name`, `recoverySession = true` (fail-closed).

### F3 — Phase 1 redirects to pages that exist only after phase 2

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/middleware.ts:39-45, src/pages/api/auth/password-reset-request.ts:41
- **Detail**: `/auth/reset-password`, `/auth/reset-password/confirm` and `/auth/forgot-password[/sent]` do not exist yet, so all these redirects end in 404. The plan accepts this for phase 1, but merge to `main` deploys to production with no other gate.
- **Fix**: Do not merge the branch to `main` before phase 2 lands.
- **Decision**: FIXED — recorded in `change.md` (`## Notes`): no merge to `main` before phase 2.

### F4 — Missing form field shows zod's default English message

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/auth/password-update.ts:28-29, 65
- **Detail**: A request without `password` or `password_confirm` fails `z.string()` with zod v4's default English `invalid_type` message, which is passed to the UI through `?error=`. Only a crafted request triggers it, but the plan says no English and no raw library messages in the UI.
- **Fix**: Give both `z.string()` calls `{ error: MESSAGES.generic }`.
- **Decision**: FIXED — both `z.string()` take `{ error: MESSAGES.generic }`; measured: missing field (`null`) gives the Polish message, `min(6)` message unchanged.

### F5 — Allowlist of normal sign-in methods is enforced only by a comment

- **Severity**: 💡 OBSERVATION
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Architecture
- **Location**: src/lib/auth/recovery-session.ts:14-19
- **Detail**: `NORMAL_SESSION_METHODS = {"password"}` is fail-closed by design. Every future sign-in method (magic link, OAuth, MFA `totp`, a session from an email-confirmation link if the app ever exchanges it) will lock the user on the new password screen until someone adds it here. The comment says so; nothing else does, and the symptom would look like a broken sign-in, not like a missing allowlist entry.
- **Fix**: Record it as a project rule via `/10x-lesson` ("new sign-in method = entry in `NORMAL_SESSION_METHODS` + smoke step").
  - Strength: The rule reaches `/10x-plan` for any future auth slice, where the omission would be made.
  - Tradeoff: Still a convention, not a mechanical check.
  - Confidence: MED — depends on future plans re-reading `lessons.md`, which the chain does.
  - Blind spot: Production `enable_confirmations` setting not checked; today the app has no route exchanging a confirmation link for a session, so it does not apply yet.
- **Decision**: ACCEPTED-AS-RULE: Nowa metoda logowania wymaga wpisu w NORMAL_SESSION_METHODS

### F6 — Expired-link path defined three times

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/middleware.ts:14, src/pages/api/auth/password-reset-verify.ts:8, src/pages/api/auth/password-update.ts:8
- **Detail**: `"/auth/reset-password/confirm?expired=1"` is repeated in three files, while `RESET_PASSWORD_PATH` already lives in `recovery-session.ts` as the single source.
- **Fix**: Export `RECOVERY_EXPIRED_PATH` from `src/lib/auth/recovery-session.ts` and import it in all three files.
- **Decision**: FIXED — `RECOVERY_EXPIRED_PATH` exported from `src/lib/auth/recovery-session.ts`, imported in all three files.

## Triage (2026-09-28)

- Fixed: F1, F2, F3 (process note in `change.md`), F4, F6
- Rule: F5 (lesson only, code unchanged)
- After fixes: `npm run lint` 0 errors (4 `no-console` warnings, all intended `console.error`), `npm run typecheck` 0 errors, `npm run build` success, `npm test` 130/130 pass. `npm run smoke` against local Supabase (`.env` moved aside, fresh preview, local `auth.users` 11 → 14): 42 PASS, 0 FAIL, exit 0; "dashboard renders for signed-in user" 200 confirms F2 does not lock a password session.
