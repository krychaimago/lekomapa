<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Czytelna „Wizyta” z listą bieżących leków

- **Plan**: context/changes/visit-readable-with-current-meds/plan.md
- **Scope**: Full plan
- **Reviewed phases**: 1, 2, 3
- **Date**: 2026-10-16
- **Verdict**: APPROVED
- **Findings**: 0 critical, 2 warnings, 4 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | PASS    |
| Scope Discipline    | PASS    |
| Safety & Quality    | WARNING |
| Architecture        | PASS    |
| Pattern Consistency | WARNING |
| Success Criteria    | PASS    |

Automated checks re-run during the review: `npm run typecheck` (0 errors), `npm run lint` (0 errors, 10 warnings in `src/lib/observability/*`, none in this change), `npm test` (502/502), `npm run build` (OK). `npm run smoke` was not re-run (they need `.env` moved aside for the local Supabase); evidence is the green status recorded in Progress (d2b74b5, 2c1062b).

## Findings

### F1 — Heading inside `<summary>` may vanish for screen readers

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/pages/wizyta.astro:84-106
- **Detail**: `<summary>` is exposed as a button, and ARIA buttons have presentational children. Some screen readers (VoiceOver/Safari, NVDA in places) flatten the `<h2>`, so "Możliwe interakcje (N)" drops out of heading navigation. The toggle's accessible name is also the title plus the whole `INTERACTION_COPY.note`, so it is read as one long sentence. The E2E `getByRole("heading")` passes because Playwright computes roles itself; it does not prove what assistive tech exposes. The structure follows the plan contract (h2 in summary), so this is a plan-level issue.
- **Fix A ⭐ Recommended**: Check in VoiceOver (Safari, macOS) first: heading list (VO+U) and how the toggle is announced; restructure only if the heading is missing.
  - Strength: Lessons rule "zmierz, zanim wdrożysz poprawkę" — no rework if the heading survives.
  - Tradeoff: Manual check, about 10 minutes.
  - Confidence: MED — behaviour differs between screen readers and versions.
  - Blind spot: NVDA/JAWS on Windows not available for the check.
- **Fix B**: Move `<h2>` and the note above `<details>`; `<summary>` holds only a short toggle label ("Pokaż/Zwiń karty") with the chevron.
  - Strength: Heading and note stay in plain document flow for every reader; the note is always visible by construction.
  - Tradeoff: Visible layout change, new copy (FR-012 filter), dark gallery and E2E selectors to update.
  - Confidence: HIGH — standard disclosure pattern.
  - Blind spot: Author has not yet seen the alternative layout.
- **Decision**: NO_CHANGE_NEEDED via Fix A — author checked in VoiceOver (Safari, macOS, 2026-10-16) on local /wizyta: heading present and toggle announcement acceptable. NVDA/JAWS not checked.

### F2 — Two empty states and two identical "Dodaj lek" links

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/wizyta.astro:71-77, 129-136
- **Detail**: With symptoms but no current medications (showIntro false), the page shows "Na liście nie ma bieżących leków." + "Dodaj lek", then in the interactions section "Nie masz bieżących leków. …" + a second "Dodaj lek" to the same address. Two links with the same name and target, repeated information. The plan asked for both ("pusty stan interakcji jak dotąd"), so the duplication comes from the plan. No test covers this state.
- **Fix**: In the `noMedications` branch of the interactions section, drop the link and keep the message (the link stays in the list section above).
- **Decision**: FIXED — second "Dodaj lek" link removed from the interactions empty state; message kept

### F3 — Sort not fully independent of input order

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/services/visit-summary.ts:105-107
- **Detail**: Tie-break is name → since → doseText. Two medications with the same name, start date and dose but a different variant keep the database row order, against the plan contract "wynik niezależny od kolejności tablic wejściowych". Rare in practice.
- **Fix**: Add a last key comparing `currentMedicationText(a)` and `currentMedicationText(b)`, plus a test with two rows differing only by variant.
- **Decision**: FIXED — last sort key is the whole line (variant included); test "two medications that differ only by variant…" failed before the fix, passes after

### F4 — Hard-coded Polish UI strings in E2E selectors

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: tests/e2e/dark-gallery.spec.ts:247, tests/e2e/visit-readable.spec.ts:59-60
- **Detail**: Gallery clicks `getByText(/^Możliwe interakcje \(\d+\)$/)`; the readable spec uses literals "Data i godzina", "Zapisz wpis". Plan contract: selectors from `src/lib/copy/*`. A copy change breaks the tests with a misleading "element not found".
- **Fix**: Build the gallery matcher from `VISIT_SUMMARY_COPY.interactionsHeadingCount` (as `visit-readable.spec.ts` does) and import the form labels from the journal copy module.
- **Decision**: FIXED — visit-readable.spec.ts takes form labels from JOURNAL_COPY.form; dark gallery clicks the `<summary>` inside the interactions section, no text matcher

### F5 — Remaining `.replace` on `withoutQuestion`

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/pages/wizyta.astro:162
- **Detail**: Pre-existing, unchanged. Values are symptom names from the closed catalog, so `$&` is not reachable today; inconsistent with the `fill` now used everywhere else on the page.
- **Fix**: `fill(copy.withoutQuestion, { objawy: summary.withoutQuestion.join(", ") })`.
- **Decision**: FIXED — `.replace` swapped for `fill`

### F6 — LCP check marked done without a recorded value

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: context/changes/visit-readable-with-current-meds/plan.md (Progress 2.12)
- **Detail**: 2.12 "LCP ≤ 2,5 s" is `[x]` but no measured value appears in the plan, commits or change notes. Other manual items are visual and need no artifact; this one is a number.
- **Fix**: Add the measured LCP (and account size) to `change.md` notes.
- **Decision**: FIXED — measured locally (Lighthouse 12.6.1 Mobile, preview build, local Supabase, 7 medications / 3 entries): LCP 1.4 s in three runs; recorded in change.md notes

## Triage (2026-10-16)

- No change needed: F1 (VoiceOver check by the author)
- Fixed: F2, F3, F4, F5, F6
- After fixes: `npm test` 503/503, `npm run typecheck` 0 errors, `npx playwright test` 11 passed / 6 skipped (gallery), `DARK_GALLERY=1 npx playwright test tests/e2e/dark-gallery.spec.ts` 7 passed — all against local Supabase with `.env` moved aside.
