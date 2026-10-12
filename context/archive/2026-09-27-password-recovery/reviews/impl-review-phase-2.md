<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Odzyskiwanie dostępu przez ustawienie nowego hasła

- **Plan**: context/changes/password-recovery/plan.md
- **Scope**: Phase 2 of 3
- **Reviewed phases**: 2
- **Date**: 2026-09-28
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 3 warnings, 4 observations
- **Triage**: 2026-09-28 — fixed F1–F6, skipped F7. Gates after fixes: typecheck 0 errors, lint 0 errors, `npm test` 130/130.

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | PASS    |
| Scope Discipline    | PASS    |
| Safety & Quality    | WARNING |
| Architecture        | PASS    |
| Pattern Consistency | PASS    |
| Success Criteria    | WARNING |

Automated gates re-run on 2026-09-28: `npm test` 130/130, `npm run lint` 0 errors (4 no-console warnings), `npm run typecheck` 0 errors, `npm run build` OK.

## Findings

### F1 — Password toggle is 40 px, criterion 2.7 requires more than 44 px

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: src/components/auth/PasswordToggle.tsx:20
- **Detail**: The toggle uses `size-10` (40 px). Manual criterion 2.7 ("pola i przyciski wyższe niż 44 px") is ticked. The input is `h-12` (48 px), so a 48 px toggle fits.
- **Fix**: `size-10` → `size-12` and `right-1` → `right-0` in PasswordToggle; widen `pr-12` in FormField.tsx:63 if the text runs under the icon.
- **Decision**: FIXED — toggle `size-12 right-0` (48 px, matches input height).

### F2 — `?error=` shows any text as a system alert on public pages

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/pages/auth/forgot-password.astro:8, src/pages/auth/reset-password.astro:11, src/pages/api/auth/password-reset-request.ts:21,26, src/pages/api/auth/password-update.ts:30
- **Detail**: The pages render the `error` query parameter verbatim inside `ServerError` ("Uwaga: …", `role="alert"`). React escapes it, so this is not XSS, but a crafted link such as `/auth/forgot-password?error=Twoje konto zostało zablokowane, zadzwoń pod…` shows attacker text on lekomapa.pl styled as a system warning. `/auth/forgot-password` is public. Every message the routes can send already lives in `apiErrors` in `src/lib/copy/password-recovery.ts`. Same pattern exists in the starter `signin` (out of scope, S-01).
- **Fix A ⭐ Recommended**: Routes redirect with a code (`?error=invalid_email`), pages look the text up in `apiErrors`, unknown codes are ignored.
  - Strength: Closes the spoofing path on the new screens; copy stays in one file as planned.
  - Tradeoff: Four redirects and two pages change; signin keeps the old pattern until S-01.
  - Confidence: HIGH — all messages are already enumerated in the copy module.
  - Blind spot: Starter signin/signup remain spoofable until S-01.
- **Fix B**: Accept for now, record as a rule for S-01 to fix across all auth screens at once.
  - Strength: One consistent change later instead of two patterns now.
  - Tradeoff: New public page ships with the weakness to production.
  - Confidence: MEDIUM — depends on S-01 timing.
  - Blind spot: None significant.
- **Decision**: FIXED via Fix A — routes redirect with `apiErrors` keys; pages resolve text through `apiErrorMessage()`, unknown codes render nothing. Plan lines for both routes updated. Starter signin/signup unchanged (S-01).

### F3 — Client-side field errors are not announced to screen readers

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/auth/FormField.tsx:67-79
- **Detail**: The error `<p>` has no `role="alert"`/`aria-live` and focus does not move, so submitting an invalid form gives screen-reader users no feedback. The hint (e.g. "Co najmniej 6 znaków") is not linked by `aria-describedby`; only the error id is.
- **Fix**: Add `role="alert"` to the error `<p>`; point `aria-describedby` at a hint id when no error is shown.
- **Decision**: FIXED — `role="alert"` on the field error; hint wrapped with `${id}-hint` and referenced by `aria-describedby` when no error is shown.

### F4 — Starter sign-in and sign-up changed look and language without a note

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: src/components/auth/FormField.tsx:37, ServerError.tsx:9, PasswordToggle.tsx:13-14
- **Detail**: Plan-driven (Polish defaults, tokens), so not drift. Effect on starter screens: errors read "Uwaga: Email is required", toggle aria-label is Polish next to English labels, inputs are solid `bg-background` inside the dark `bg-cosmic` card. Criterion 2.8 is ticked, so contrast was checked; the change is not named anywhere a PR reader would see.
- **Fix**: Mention the change in the PR description (S-01 translates these screens).
- **Decision**: FIXED — note for the PR description added to `change.md` (section "Do opisu PR: ekrany startera").

### F5 — Submit spinner never shows; double click sends two requests

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/auth/SubmitButton.tsx:13
- **Detail**: `useFormStatus` tracks only function actions; with `action="/api/..."` as a string `pending` stays false. Pre-existing from the starter; new forms inherit it. A second "Wyślij odnośnik" may hit the per-address rate limit (swallowed by design, so no visible error).
- **Fix**: Track submit in local state (`onSubmit` sets `submitting`) and pass it to `SubmitButton`; or leave for S-01.
- **Decision**: FIXED — `useSubmitting` hook (`src/components/hooks/useSubmitting.ts`, resets on bfcache restore) drives an optional `pending` prop on `SubmitButton` in both recovery forms. Starter signin/signup keep `useFormStatus` until S-01.

### F6 — Token pages send no `no-store` / `no-referrer` headers

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/auth/reset-password/confirm.astro, src/pages/auth/reset-password.astro
- **Detail**: `token_hash` sits in the URL (history, possibly edge logs). No external resources, so no third-party Referer leak today. Risk bounded: single use, 1 h, consumed only by POST.
- **Fix**: Set `Cache-Control: no-store` and `Referrer-Policy: no-referrer` via `Astro.response.headers` on both pages.
- **Decision**: FIXED — `Cache-Control: no-store` and `Referrer-Policy: no-referrer` set on `reset-password/confirm.astro` and `reset-password.astro`.

### F7 — `MIN_PASSWORD_LENGTH` defined twice

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/lib/copy/password-recovery.ts:6, src/components/auth/SignUpForm.tsx:8
- **Detail**: A validation rule lives in the copy module and is duplicated in SignUpForm, synced only by a comment.
- **Fix**: Leave for S-01 (SignUpForm belongs there); optionally move the constant out of the copy module.
- **Decision**: SKIPPED — left for S-01 (SignUpForm belongs there).
