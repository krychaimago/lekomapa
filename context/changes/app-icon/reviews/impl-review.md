<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Ikona lekomapy

- **Plan**: context/changes/app-icon/plan.md
- **Scope**: Full plan
- **Reviewed phases**: 1, 2, 3
- **Date**: 2026-10-15
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 3 warnings, 3 observations

Phase 2 has its code complete; its manual rows 2.7 and 2.8 (home screen icon on iPhone and Android) stay open until after deploy, as the plan allows. The phase 2 code was reviewed in full.

## Triage (2026-10-15)

Fixed: F1, F2 (Fix A), F3 (Fix A + opacity test), F4, F5, F6 (follow-up for the PR description). Skipped: none.

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | PASS    |
| Scope Discipline    | PASS    |
| Safety & Quality    | WARNING |
| Architecture        | PASS    |
| Pattern Consistency | WARNING |
| Success Criteria    | WARNING |

Automated criteria re-run on HEAD (4bd4ca0): `npm run icons` leaves `public/` unchanged, `npm test` 488/488, `dist/client/` contains `favicon.svg`, `apple-touch-icon.png` and `manifest.webmanifest`. `npm run typecheck`, `npm run lint` (0 errors, 10 pre-existing `no-console` warnings in other files) and `npm run build` passed on the same code before the epilogue commit.

Minor drifts accepted without a finding: `proposals.html` has two rounds (A–C rejected, D–F) instead of one round of A–C; phone icons fill the middle 64% instead of "~80%" (inside the maskable safe zone, so the intent holds); `buildIconSvg` takes `colors` as a parameter (still pure). The roadmap diff is the S-04 status flip plus column re-padding.

## Findings

### F1 — `sharp` used by scripts but not declared in package.json

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: scripts/icons/generate-icons.mjs:11, scripts/icons/icons.test.mjs:10
- **Detail**: `sharp` reaches `node_modules` only transitively (pinned `0.35.4` by miniflare via `@astrojs/cloudflare`, optional for `astro`; `package-lock.json:11071`). CI installs it today. A bump of miniflare or astro can drop or move it, and `npm test` plus `npm run icons` would then fail with a cause that is not visible in the diff — the same class of trap as the `@emnapi` lesson. The plan's Current State noted this and accepted it for a one-off script, but the test now depends on it too, and the test runs in CI.
- **Fix**: Add `"sharp": "0.35.4"` to `devDependencies` (the version already in the lock), `npm install --package-lock-only`, and add one line to CLAUDE.md that it is there for `scripts/icons/`.
- **Decision**: FIXED — `"sharp": "0.35.4"` in devDependencies (exact pin, same as miniflare, no second copy in lock), lock regenerated with `--package-lock-only`, note in CLAUDE.md `### Środowisko`.

### F2 — Phone header may overflow at 320 px width

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/layouts/AppLayout.astro:60-69, src/components/BrandName.astro:25
- **Detail**: Estimated from classes, not measured. At 320 px the header has 288 px of space. The right group (`shrink-0`: theme button 48 + gap 8 + "Wyloguj się" ~110) plus header `gap-4` takes ~180 px. BrandName with `whitespace-nowrap` is ~125 px (mark 25 + gap 8 + bold "lekomapa" at 20 px ~90). Before the mark it fitted (~280 px); with the mark the total is ~310 px, so the page could scroll sideways. Manual check 3.6 covers this, but only at the phone width it was checked on.
- **Fix A ⭐ Recommended**: Measure first at 320 px in the preview (DevTools device mode), fix only if it overflows — e.g. hide the name text below a small breakpoint and keep the mark, or the reverse.
  - Strength: Follows the "measure before fixing" lesson; the estimate of text width is rough.
  - Tradeoff: Needs a signed-in interior screen, and the preview runs against production Supabase (`.env`).
  - Confidence: MED — arithmetic is close to the edge either way.
  - Blind spot: Actual font metrics of the bold name.
- **Fix B**: Add `min-w-0` and truncation to BrandName in the header now, without measuring.
  - Strength: Removes the risk regardless of fonts.
  - Tradeoff: Can cut the product name to "lekom…" on narrow phones.
  - Confidence: MED — safe but possibly unnecessary.
  - Blind spot: Whether truncation is acceptable to the author.
- **Decision**: FIXED via Fix A — measured with Playwright on a local build against local Supabase: at 320 px the header content needed 342 px (document `scrollWidth` 327, "Wyloguj się" clipped); 360 and 375 px fitted. Fix: `BrandName` got a `nameClass` prop; the phone header passes `max-[359px]:sr-only`, so below 360 px only the mark shows and screen readers still read the name. Re-measured: `scrollWidth` equals viewport at 320, 360 and 375 px.

### F3 — PNG icons are not checked against the shape and tokens

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Success Criteria
- **Location**: scripts/icons/icons.test.mjs:48-73, scripts/icons/generate-icons.mjs:2-3
- **Detail**: The plan's end state says the test fails when files in `public/` drift from the shape or the tokens. That holds only for `favicon.svg`. PNGs are checked for size and (two of them) corner opacity. A stale or hand-edited PNG passes. The opacity test also passes by construction, since `removeAlpha()` drops the channel and the test calls `ensureAlpha()`. In practice the gap is narrow: any shape or token change breaks the SVG test, and `npm run icons` rewrites all files together. The file header comment claims more than the test does.
- **Fix A ⭐ Recommended**: Add a tolerant pixel check per PNG: the corner pixel equals `--primary`, the pixel at the center of the filled capsule half equals `--primary-foreground`.
  - Strength: Catches stale PNGs after a token change without byte equality, which would be fragile across sharp/libvips versions.
  - Tradeoff: ~20 lines of test; the "inside the mark" point depends on the shape and must move if the shape changes.
  - Confidence: MED — needs a point that is safely inside the mark at 32 px.
  - Blind spot: Anti-aliasing at 32 px.
- **Fix B**: Reword the header comment to say the test pins `favicon.svg` and checks PNGs for size and opacity only.
  - Strength: One-line, honest.
  - Tradeoff: Gap stays.
  - Confidence: HIGH.
  - Blind spot: None significant.
- **Decision**: FIXED via Fix A, plus the opacity test — each PNG is now checked at one pixel inside the filled half of the mark (`--primary-foreground`) and one on the background (`--primary`), tolerance 8 per channel; the always-true corner-opacity test is replaced by `hasAlpha === false` for the full-background phone icons; header comment rewritten to match. `MARK_BOX` exported from `generate-icons.mjs`. Proven red: a stale background color, a missing mark and an added alpha channel in `icon-512.png` each fail the right test; restored from git, 15/15 green.

### F4 — Tile geometry duplicated between BrandName and the icon script

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/components/BrandName.astro:17-19, scripts/icons/generate-icons.mjs:19-26
- **Detail**: `MARK_BOX = 24`, `PADDING = 0.1`, `CORNER_RADIUS = 3` live in both files; no test catches drift. The plan's intent was "zmiana znaku to jedna edycja". The shape itself is shared via `BRAND_MARK`; only inset and corner radius are duplicated.
- **Fix**: Move the tab tile geometry (box, padding, corner radius) into `src/lib/brand-mark.ts` next to `BRAND_MARK` and import it in both places.
- **Decision**: FIXED — `BRAND_TILE` (box, padding, cornerRadius) added to `src/lib/brand-mark.ts`; `BrandName.astro` and `generate-icons.mjs` import it. `npm run icons` leaves `public/` byte-identical; lint, typecheck and `npm test` (493/493) green.

### F5 — Product name comes from two sources

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/components/BrandName.astro:15, src/layouts/AuthSpreadLayout.astro:21
- **Detail**: Entry screens pass `AUTH_COPY.spread.productName`; the interior relies on the `"lekomapa"` default literal in BrandName. Before this change the interior also had the literal in `AppLayout.astro`, so this is not new duplication, only moved.
- **Fix**: Use `AUTH_COPY.spread.productName` (or a shared constant) as BrandName's default.
- **Decision**: FIXED — `BrandName` defaults `name` to `AUTH_COPY.spread.productName`; `AuthSpreadLayout` still passes it explicitly. Lint, typecheck and build green.

### F6 — Change marked implemented with two phone checks open

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: context/changes/app-icon/plan.md (Progress 2.7, 2.8)
- **Detail**: The plan allows moving the phone checks to after the merge. They must not get lost: `/10x-archive` will list them as pending.
- **Fix**: State in the PR description that 2.7 and 2.8 are checked on `lekomapa.pl` after deploy.
- **Decision**: FIXED — PR description text and post-deploy steps for 2.7 and 2.8 queued in `context/changes/app-icon/follow-ups/review-fixes.md`.
