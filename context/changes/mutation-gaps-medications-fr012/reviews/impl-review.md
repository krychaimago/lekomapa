<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Luki w testach wskazane przez Strykera — leki i filtr FR-012

- **Plan**: context/changes/mutation-gaps-medications-fr012/plan.md
- **Scope**: Full plan (completed phases only — phase 3 staged, not committed, 3.4 pending)
- **Reviewed phases**: 1, 2
- **Date**: 2026-10-04
- **Verdict**: APPROVED
- **Findings**: 0 critical, 1 warning, 2 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | PASS    |
| Scope Discipline    | PASS    |
| Safety & Quality    | WARNING |
| Architecture        | PASS    |
| Pattern Consistency | PASS    |
| Success Criteria    | PASS    |

Evidence: `npm test` 291/291, `npm run lint` 0, `npm run typecheck` 0. Full `npm run test:mutation` (4.10.2026, same scope as the first measurement): `medications.ts` 8 survivors — the 6 planned plus the 2 accepted by the author in phase 1 (`change.md`); in `pairs.mjs` #56, #79, #206 and #234–#237 are killed, the 29 survivors are the 17 from `research.md` plus 12 in `main()`. No production code changed (`git diff c974d8f..67d070e` touches only test files and the change folder).

## Findings

### F1 — CLI test for a row error passes on any crash

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: scripts/rpl/pairs.test.mjs:307
- **Detail**: The test "the CLI exits with 1 for a file with a row error" checks only the exit code. Any failure gives 1: phase 3 measured that `main()` with its error branch removed still exits 1 through an uncaught exception, and 7 `main()` mutants survive for that reason. The test cannot tell "validation rejected the row" from "the script crashed before validating" — the case the lesson „Bramka musi odróżnić blokadę od niewykonania” names. The exit-0 test guards against a script that never starts, but not against a crash in the validation path.
- **Fix**: Also assert that stderr contains the stable reason code `[missing_required_wording]` (`runScript` returns the whole `spawnSync` result).
  - Strength: The reason code is the stable contract used everywhere else in the tests ("Nazwany wynik", test-plan §6.1); it is not the message text the plan excluded.
  - Tradeoff: Slightly widens the author's decision "exit code only" — needs her OK.
  - Confidence: HIGH — `main()` prints `[${entry.reason}]` for every error (`pairs.mjs:207`).
  - Blind spot: Would change the survivor count in `surviving-mutants.md` (#231 might die), so phase 3 would need a re-run.
- **Decision**: PENDING

### F2 — Criterion 1.4 checked while it said "exactly 6"

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: context/changes/mutation-gaps-medications-fr012/plan.md (Phase 1, Success Criteria)
- **Detail**: 8 mutants survived, not 6. The deviation and the author's decision are in `change.md` and both extra mutants are in `surviving-mutants.md` with a reason, so the intent is met. Only the plan text still says 6.
- **Fix**: None needed — `change.md` and `surviving-mutants.md` carry the record.
- **Decision**: PENDING

### F3 — Temporary directories from `mkdtemp` are not removed

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: scripts/rpl/pairs.test.mjs:283-321
- **Detail**: Four new tests create a directory in the system temp folder and leave it. Same as the existing `loadPairs` test, so it follows the file's pattern; with Stryker each run repeats the full suite, so leftovers multiply. Measured 4.10.2026: 5221 `pairs-*` directories in the system temp folder after today's runs.
- **Fix**: Remove each directory with `t.after(() => rm(dir, { recursive: true, force: true }))`, or skip as consistent with the existing tests.
- **Decision**: PENDING
