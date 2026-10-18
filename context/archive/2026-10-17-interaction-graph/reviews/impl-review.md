<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Graf leków i możliwych interakcji

- **Plan**: context/changes/interaction-graph/plan.md
- **Scope**: Full plan
- **Reviewed phases**: 1, 2, 3
- **Date**: 2026-10-18
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 4 warnings, 4 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | WARNING |
| Scope Discipline    | WARNING |
| Safety & Quality    | WARNING |
| Architecture        | PASS    |
| Pattern Consistency | PASS    |
| Success Criteria    | WARNING |

Automated checks run on 2026-10-18: `npm test` 556/556 pass, `npm run typecheck` 0 errors, `npm run lint` 0 errors (10 warnings, none in changed files), `npm run build` pass, `npx playwright test tests/e2e/interaction-graph.spec.ts` 2/2 pass (local Supabase, `.env` not loaded by the Playwright config).

Checked and fine: FR-012 in the layout (interactions read only for edges and partners; node order by name, ties by id), history replay on `discontinued_at` with the planned tie-breaks, no medication names in URLs or titles, `data-graph-node` instead of `data-medication-id`, colours only via tokens, no XSS surface (paths built from numbers only), no hydration mismatch (model computed only on the server), only one of the two layouts in the accessibility tree, seed script refuses non-local databases.

## Findings

### F1 — Graph layout cost on /leki never measured against the 10 ms CPU limit

- **Severity**: ⚠️ WARNING
- **Impact**: 🔬 HIGH — architectural stakes; think carefully before deciding
- **Dimension**: Safety & Quality
- **Location**: src/pages/leki/index.astro:133-145, src/lib/services/interaction-graph.ts (curve search and ring search)
- **Detail**: The whole layout (both phone and wide) is computed in SSR on every `/leki` request — the start page after sign-in. Risk #1 in `context/foundation/infrastructure.md:59,115` (10 ms CPU per request on the free tier, error 1102, invisible locally) requires a decision before implementing a heavy visualisation; S-09 measured logic and full-page render against a threshold before merge. This plan only states the work is small (Performance Considerations) and measured LCP, which does not measure CPU. Local measurement of `buildInteractionGraph` alone (M-series Mac, Workers CPUs usually slower): 12 current meds — 4.7 ms cold / 1.6 ms warm; 20 current + 20 ended — 6.4 / 3.3 ms; 30 + 60 — 22.6 / 20.1 ms; 60 + 200 — 181 / 170 ms. Page render and React SSR of the island come on top. A failure takes down the whole medication list, not just the graph.
- **Fix A ⭐ Recommended**: Measure as in S-09 — full `/leki` render on a heavy account (e.g. 12, 20, 30 current meds) with a threshold, then the author decides (move the layout to the browser, cap the work, or paid tier 5 USD/month) before merge.
  - Strength: Follows the risk-register rule and the S-09 precedent; decision based on numbers, not a guess.
  - Tradeoff: About half a day of measuring; may still end in Fix B.
  - Confidence: HIGH — the S-09 measuring script and method already exist.
  - Blind spot: Real Workers CPU speed versus the local machine is not known.
- **Fix B**: Compute the layout in the browser — the island gets only history, current meds and interaction rows; SSR shows a placeholder or uses `client:only`.
  - Strength: Removes the CPU risk on the server regardless of account size.
  - Tradeoff: Graph not visible without JavaScript; layout code shipped to the browser; hydration and E2E need rework; heavy accounts still slow on weak phones.
  - Confidence: MED — moves the cost rather than removing it.
  - Blind spot: Size of the extra bundle and phone CPU at 30+ meds.
- **Decision**: FIXED via Fix A (measured) + ACCEPTED — `scripts/medications/graph-render-bench.mjs`: median 1.6 ms (12 current), 3.2 ms (20+20), 7.0 ms (20+60), 9.5–10.1 ms (30+60, above 7 ms). Cost grows with ended medications. Author accepted the limit without code change (18.10.2026), relying on `cron.exceeded-cpu`; recorded in change.md.

### F2 — Plan and change notes describe a layout that no longer exists

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Plan Adherence
- **Location**: context/changes/interaction-graph/plan.md:49,54,79,95,128; context/changes/interaction-graph/change.md:14-25,50,52,62
- **Detail**: The layout changes in phase 3 were approved by the author and are mostly recorded in `change.md` Notes, but the plan still states as fact: "always 3 columns, same picture on every screen" (:54), "place from order and id only" (:49), the old model shape `nodes{x,y}`, `edges{path}` and "rows ~90" (:79; now `phone` and `wide` layouts), "13 meds → 5 rows" (:95), "one button per medication" (:128; now two, one hidden). In `change.md`: the zigzag note (:14-25, row 130, "12 meds = 585 units", a test name that no longer exists) is superseded by layout C; the seed rename is still listed as a to-do though done (:52); the switch is described as 480 px of card width while the container query sits on the card with `px-4` and a border, so it switches at about 514 px (:50); the measurement email `graf-komputer@example.test` (:62) differs from the seed default `graph-heavy@example.test`. A later review or archive reading the plan as ground truth would see false drift.
- **Fix**: Add a short "Zmiany po fazie 3" addendum to plan.md pointing at the superseding notes, mark the zigzag note as superseded, remove the done to-do, correct 480 → ~514 px (or move `@container` to an element without padding), state which email the measurement used.
  - Strength: Keeps the plan usable as source of truth for archive and later changes.
  - Tradeoff: Docs only; the 480/514 px choice may need a decision about which value is intended.
  - Confidence: HIGH — every stale line verified.
  - Blind spot: None significant.
- **Decision**: FIXED — docs only: "Zmiany po fazie 3" addendum in plan.md, zigzag note marked superseded, seed to-do marked done, measurement account explained. Author kept the switch at ~514 px card width (480 px content), code unchanged.

### F3 — Non-text contrast of graph lines and points below 3:1

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/components/medications/InteractionGraph.tsx:94-101,134-143
- **Detail**: Unhighlighted lines and outlines of unselected points use `var(--input)`: light `#cbd2c7` on card `#ffffff` ≈ 1.55:1, dark `#4a534a` on `#1c221d` ≈ 2:1; after a selection non-partner lines also get opacity 0.5. The line carries information ("this pair is checked"); WCAG 1.4.11 asks 3:1 for graphics needed to understand content. The same information is reachable as text in the panel, which arguably meets the exception. The plan and mockup A2 deliberately chose "delikatne" neutral lines, and the token tests do not check SVG strokes.
- **Fix A ⭐ Recommended**: Record the decision that the panel is the accessible text equivalent (note in change.md), keep the look.
  - Strength: Respects the approved mockup; no visual change.
  - Tradeoff: Low-vision users without a screen reader may not see lines at all.
  - Confidence: MED — the exception is arguable, not certain.
  - Blind spot: No test with real low-vision users.
- **Fix B**: New line token ≥ 3:1 in `:root` and `.dark`, registered in `@theme inline`, after a mockup accepted by the author.
  - Strength: Meets 1.4.11 outright.
  - Tradeoff: Lines less "delikatne" than approved A2; mockup round needed first.
  - Confidence: HIGH — standard token procedure.
  - Blind spot: Whether a 3:1 line still reads as calm, not alarming.
- **Decision**: FIXED via Fix A — decision recorded in change.md: the panel under the graph is the text equivalent; look unchanged.

### F4 — Planned unit test "more medications → taller graph" missing

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: scripts/medications/interaction-graph.test.mjs (plan.md:95)
- **Detail**: The plan lists "13 meds → 5 rows and larger height". No test checks that height grows with more medications; :341 only checks each button fits inside `height`. Not mentioned in the notes.
- **Fix**: Add a test: layout of 13 (or 24) meds has a larger `height` than 6, in both layouts.
- **Decision**: FIXED — test "more medications give a taller graph, in both layouts" (6 vs 24 meds); fails when `height` is a constant, passes on the real code.

### F5 — Live region reads the whole panel, note repeated per partner

- **Severity**: 💬 OBSERVATION
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/components/medications/InteractionGraph.tsx:219-240
- **Detail**: `aria-live="polite"` wraps the whole panel and the section is re-keyed per selection, so each press announces the name, every partner card, the note once per partner and the closing sentence. With 3 partners a screen reader reads the note 3 times on every press.
- **Fix**: Keep in the live region only a short status (name and partner count); move the cards outside it.
- **Decision**: FIXED — live region is now a visually hidden `role="status"` with the name and partner count (`graphStatusOne` / `graphStatusMany`, no-pair case reuses `noInteractionsForMedication`); cards and visible panel outside it, look unchanged. Copy test and E2E extended; `npm test` 557/557, typecheck 0 errors, E2E 2/2.

### F6 — Unrelated S-11 roadmap edit in this change

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: context/foundation/roadmap.md (S-11 row, stream D, issue line)
- **Detail**: Commit 22a46cf also parks S-11 (blocked → parked, issue #114 removed, stream D text, dated 17.10.2026). Belongs to another decision; harmless but mixed into this change's history.
- **Fix**: Accept as is and mention it in the PR description.
- **Decision**: ACCEPTED — left as is; mention the S-11 parking (commit 22a46cf) in the PR description.

### F7 — Overlap check assumes default text size and ≥ 360 px

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/services/interaction-graph.ts:46-50 vs src/components/medications/InteractionGraph.tsx:164-174
- **Detail**: Collision avoidance uses a fixed 90 × 88-unit button. Larger browser text or 320 px screens (already noted as unverified in change.md) can make buttons overlap. Computed, not rendered.
- **Fix**: Record as known limit; check once at 320 px and 125% text in the browser.
- **Decision**: ACCEPTED — checked once: 360 px/100% 0 overlaps; 320 px/100% 3–5 pairs (3–6 px); 360 px/125% 8 pairs (up to 18 px); 320 px/125% 10 pairs (up to 28 px); no clipped text. Recorded in change.md as a known limit; a fix would be a separate change with a mockup.

### F8 — History read without order

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/leki/index.astro:69-72
- **Detail**: No `.order()` and no limit; PostgREST `max_rows = 1000` would cut the result in an undefined order, so the map could change between requests. Unreachable for a personal diary in practice.
- **Fix**: Add `.order("created_at")` so a cut is at least deterministic.
- **Decision**: FIXED — `.order("created_at").order("id")` on the history read.
