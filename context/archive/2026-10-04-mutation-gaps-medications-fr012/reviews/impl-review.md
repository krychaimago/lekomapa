<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Luki w testach wskazane przez Strykera — leki i filtr FR-012

- **Plan**: context/changes/mutation-gaps-medications-fr012/plan.md
- **Scope**: Full plan (phases 1–3 committed, plus uncommitted triage fixes from the previous review)
- **Reviewed phases**: 1, 2, 3
- **Date**: 2026-10-04
- **Verdict**: APPROVED
- **Findings**: 0 critical, 1 warning, 3 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | WARNING |
| Scope Discipline    | PASS    |
| Safety & Quality    | PASS    |
| Architecture        | PASS    |
| Pattern Consistency | PASS    |
| Success Criteria    | PASS    |

Evidence: `npm test` 291/291, `npm run lint` 0 errors (13 warnings, none in changed files), `npm run typecheck` 0. Full `npm run test:mutation` re-run on the working tree (4.10.2026): 88.64 % overall (558 killed, 4 timeout, 72 survived); `medications.ts` 8, `pairs.mjs` 28, `contrast.mjs` 32, `navigation.ts` 4. Survivor lines match the rows in `surviving-mutants.md` one to one (`pairs.mjs:207:45`, the former #231, is gone). Production code unchanged: `git diff c974d8f -- src scripts/rpl/pairs.mjs` is empty. `TZ = "UTC"` verified to take effect: `todayInWarsaw` builds its formatter per call, and Node 24 resets the ICU zone on assignment.

## Findings

### F1 — Measurement cites a commit that does not contain the measured code

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: context/changes/mutation-gaps-medications-fr012/surviving-mutants.md:3, plan.md (Progress 3.1–3.4)
- **Detail**: The header says "kod na commicie `0fdb5cd` z poprawką F1", and Progress 3.1–3.4 are stamped `0fdb5cd`. But `0fdb5cd` holds the pre-F1 test and the pre-F1 numbers (29 / 73 / 88,49 %). The F1 fix, the 28 / 72 / 88,64 % numbers and the test-plan update exist only in the working tree; `scripts/rpl/pairs.test.mjs` is half-staged (F1 staged, `tempDir` unstaged). Anyone checking out `0fdb5cd` gets a different measurement than the one recorded.
- **Fix**: Commit all triage edits together, then point the header (and Progress 3.x) at the new SHA.
- **Decision**: FIXED — triage edits committed as `47f464b` (exactly the measured code, without the later F3 timeout); `surviving-mutants.md` header and Progress 3.1–3.4 point at `47f464b`.

### F2 — Exit-1 tests without an argument and with a missing file still pass on a crash

- **Severity**: 💡 OBSERVATION
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: scripts/rpl/pairs.test.mjs:306-313
- **Detail**: The previous F1 fixed only the row-error test. The two other exit-1 tests check `status` alone, so the same gap from lesson „Bramka musi odróżnić blokadę od niewykonania” remains there: 7 `main()` survivors (#216–#224) live because a crash also gives 1. They are documented with a measured reason and covered by the author's decision "exit code only". The row-error and exit-0 tests already catch a script that crashes on start, so the residual risk is "wrong branch refuses", not "nothing refuses".
- **Fix A ⭐ Recommended**: Skip — the reason in `surviving-mutants.md` is honest and measured.
  - Strength: Respects the author's decision; no re-measurement.
  - Tradeoff: 7 survivors stay.
  - Confidence: HIGH — measured 4.10.2026, both paths exit 1.
  - Blind spot: None significant.
- **Fix B**: Assert `/Usage:/` (no argument) and `/No pairs file/` (missing file) in stderr.
  - Strength: Proves the handled branch ran; likely kills most of #216–#224.
  - Tradeoff: Checks message text, which the plan and test-plan §6.1 deliberately avoid (messages are not a stable contract); needs a Stryker re-run and table update.
  - Confidence: MED — not measured which mutants would die.
  - Blind spot: Message wording becomes a test contract.
- **Decision**: SKIPPED via Fix A — the 7 `main()` survivors stay documented in `surviving-mutants.md`; exit-code-only decision kept (author, 4.10.2026).

### F3 — `spawnSync` in CLI tests has no timeout

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: scripts/rpl/pairs.test.mjs:304 (`runScript`)
- **Detail**: A mutant or bug that hangs the CLI blocks `npm test` until Stryker's own timeout (or forever outside Stryker). No hang seen in today's run.
- **Fix**: Add `timeout: 10_000` to the `spawnSync` options.
- **Decision**: FIXED — `runScript` passes `timeout: 10_000` to `spawnSync`; a hang gives `status: null` and fails the test. `node --test scripts/rpl/pairs.test.mjs` 27/27. Stryker not re-run; noted in `surviving-mutants.md`.

### F4 — Scope addition from the previous triage not reflected in the plan

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: plan.md (Phase 2 §3, "What We're NOT Doing")
- **Detail**: The plan says printed lines are not checked; the row-error test now checks `[missing_required_wording]`. The exception is explained in the test comment and in `surviving-mutants.md`, but not in `plan.md` or `change.md`, which a later reader treats as the source of decisions.
- **Fix**: One line in `change.md` Notes: author approved the reason-code exception in impl-review triage (4.10.2026).
- **Decision**: FIXED — paragraph in `change.md` Notes records the reason-code exception (P1) and that F2 was skipped.

## Previous review (phases 1, 2) — triaged

### P1 — CLI test for a row error passes on any crash

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
- **Decision**: FIXED — `runScript` returns the whole `spawnSync` result; the row-error test also asserts `[missing_required_wording]` in stderr. Break-check: script throwing before validation turns the test red. Stryker re-run: #231 killed, `pairs.mjs` 28 survivors; `surviving-mutants.md` and test-plan §5 updated.

### P2 — Criterion 1.4 checked while it said "exactly 6"

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: context/changes/mutation-gaps-medications-fr012/plan.md (Phase 1, Success Criteria)
- **Detail**: 8 mutants survived, not 6. The deviation and the author's decision are in `change.md` and both extra mutants are in `surviving-mutants.md` with a reason, so the intent is met. Only the plan text still says 6.
- **Fix**: None needed — `change.md` and `surviving-mutants.md` carry the record.
- **Decision**: SKIPPED — the record in `change.md` and `surviving-mutants.md` is enough (author, 4.10.2026).

### P3 — Temporary directories from `mkdtemp` are not removed

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: scripts/rpl/pairs.test.mjs:283-321
- **Detail**: Four new tests create a directory in the system temp folder and leave it. Same as the existing `loadPairs` test, so it follows the file's pattern; with Stryker each run repeats the full suite, so leftovers multiply. Measured 4.10.2026: 5221 `pairs-*` directories in the system temp folder after today's runs.
- **Fix**: Remove each directory with `t.after(() => rm(dir, { recursive: true, force: true }))`, or skip as consistent with the existing tests.
- **Decision**: FIXED — `tempDir(t, prefix)` in `scripts/rpl/pairs.test.mjs` removes the directory after each new test (`t.after` + `rm`). The older `loadPairs` test keeps its `mkdtemp` (scope: new tests only). Measured: one `npm test` of the file leaves one directory instead of five. Mutant outcomes unaffected (cleanup only), Stryker not re-run.
