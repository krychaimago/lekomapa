<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Wyróżniony przycisk „Usuń konto”

- **Plan**: context/changes/delete-account-button-emphasis/plan.md
- **Scope**: Full plan
- **Reviewed phases**: 1, 2
- **Date**: 2026-10-14
- **Verdict**: APPROVED
- **Findings**: 0 critical, 1 warning, 1 observation

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | PASS    |
| Scope Discipline    | PASS    |
| Safety & Quality    | WARNING |
| Architecture        | PASS    |
| Pattern Consistency | PASS    |
| Success Criteria    | PASS    |

Notes:

- Plan Adherence: every planned change matches. The test is stricter than planned: each account screen must have exactly one red button of its own variant, where the plan asked for at least one.
- Scope Discipline: `context/foundation/roadmap.md` changes only the S-01 status. Prettier widened the table column, so the other rows show in the diff with unchanged values.
- Contrast: rest state `destructive`/`background`, hover `destructive`/`destructive-surface` and full red `destructive-foreground`/`destructive` are all covered by existing pairs. Focus ring same as the `outline` variant.
- Success Criteria: `npm test` 475/475, `npm run typecheck` 0 errors, `npm run lint` exit 0, `npm run build` complete (re-run 14.10.2026). Manual checks 1.5–1.8 and 2.6 confirmed by the author in session; break checks 2.2 and 2.3 went red and were restored.

## Findings

### F1 — Scanner misses a conditional red variant

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: scripts/tokens/destructive-scope.mjs:31
- **Detail**: `VARIANT_PICK` requires the quote right after `variant:` / `variant=`. Measured: `buttonVariants({ variant: cond ? "destructive" : "outline" })` and `<Button variant={x ? "destructive" : "ghost"}>` return 0 matches. A conditional red button on a medication screen would pass the gate.
- **Fix**: Match any quoted `"destructive"` / `"destructive-outline"` string literal (any quote style) instead of the `variant` prefix; add both ternary forms to the "every way" test. Today no such literal exists in src/ outside the allowed files.
- **Decision**: FIXED — any quoted "destructive"/"destructive-outline" literal is matched; two conditional cases added to the test; break check with a conditional red variant on the medication deletion screen went red and was restored.

### F2 — Hand-written red outline not detected

- **Severity**: 💡 OBSERVATION
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: scripts/tokens/destructive-scope.mjs:33
- **Detail**: `class="border border-destructive text-destructive"` reproduces the `destructive-outline` look and returns 0 matches. Bare `border-destructive` is used legitimately in `src/components/auth/FormField.tsx:64` for an invalid input, and `text-destructive` in every error message, so the classes alone cannot tell a button from an error. Within the plan's contract, which named only variant picks and `bg-destructive`.
- **Fix A ⭐ Recommended**: Name the limit in the scanner's header comment
  - Strength: Nobody reads the gate as complete; zero risk of false failures on error messages.
  - Tradeoff: The hand-written case stays unguarded; only the rule in CLAUDE.md covers it.
  - Confidence: HIGH — one comment, no behavior change.
  - Blind spot: An agent building a medication button by hand may not read the comment.
- **Fix B**: Also flag `border-destructive` outside an `error ?` condition, with FormField.tsx on a separate list
  - Strength: Closes the gap for the outline look.
  - Tradeoff: More regex logic and a second list to maintain; risk of false failures on future error styling.
  - Confidence: MED — depends on how future error states are written.
  - Blind spot: Not checked how S-05/S-07 plan to style validation errors.
- **Decision**: FIXED (Fix A) — the limit is named in the header comment of scripts/tokens/destructive-scope.mjs.
