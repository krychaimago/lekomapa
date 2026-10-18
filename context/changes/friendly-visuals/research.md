---
date: 2026-10-18T19:42:53+02:00
researcher: Claude (Opus 5.5) for Krycha Imago
git_commit: 6e17faa06168310c746586519f2952abe2af4cef
branch: main
repository: krychaimago/lekomapa
topic: "S-08 friendly-visuals: where the 'F · Karteczki' look lands in the code and what constrains it"
tags: [research, ui, empty-states, journal-note, login, tokens, s-08]
status: complete
last_updated: 2026-10-18
last_updated_by: Claude (Opus 5.5)
---

# Research: S-08 friendly-visuals — where „F · Karteczki” lands and what constrains it

**Date**: 2026-10-18T19:42:53+02:00
**Researcher**: Claude (Opus 5.5) for Krycha Imago
**Git Commit**: 6e17faa06168310c746586519f2952abe2af4cef
**Branch**: main
**Repository**: krychaimago/lekomapa

## Research Question

Roadmap S-08 (`friendly-visuals`, issue #111): illustrations in empty states and a note look in the journal. On 18.10.2026 the author chose mockup direction **F · Karteczki** (paper notes with a strip of tape, slight rotation) for the whole product, login included. Mockups: https://claude.ai/artifact/67bdzF6SH5KYRcYrf22QbZ (boards F, F-leki, F-dziennik, F-wizyta, F-notatka).

Questions:

1. Which screens and markup does the F direction replace, and under which conditions do they render?
2. What do the mockups actually use (colours, shapes, copy), and does it map to existing tokens and copy?
3. Which gates and conventions constrain decorative visuals (tokens, dark mode, a11y, FR-012)?
4. Which tests can break when this markup changes?

## Summary

- **The F direction is CSS shapes, not drawn illustrations.** The five F boards use no image or SVG drawing beyond the existing logo. Each "note" is a `div` with a card or accent background, a 4px radius, a soft shadow, a `rotate(±1–3deg)`, and a `span` "tape" strip on top (`aria-hidden`). So the roadmap question about illustration source and licence (`roadmap.md:217`) is answered by the choice of F: there are no third-party assets.
- **Every mockup colour maps to an existing token.** Mockup `--acc` `#dce9df` = `accent`, `--acc-b` `#b9d0c0` = `accent-border`, `--side-b` `#b3ac93` = `sidebar-border`, `--card` = `card`, in both modes (values match `design-draft.md` palette tables and `src/styles/global.css`). No new token is needed. The only non-token value in the mockups is the shadow `rgba(0,0,0,0.10)`; that literal is rejected by the colour gate and must become a Tailwind shadow utility or a `var(--token)` shadow (precedent: `AuthSpreadLayout.astro:37`).
- **The mockup copy is the copy already in the repo.** Login sentences = `AUTH_COPY.spread` (`src/lib/copy/auth.ts:11-17`); empty states = `MEDICATION_COPY.list.empty`, `JOURNAL_COPY.list.empty`, `VISIT_SUMMARY_COPY.intro`; journal card links = `JOURNAL_COPY.entry.open/openClosed` (`journal.ts:34-35`). The change is visual only; FR-012 copy tests are not touched unless new text is added.
- **Target surfaces in code (inspected paths):**
  - `/leki` empty state: `src/pages/leki/index.astro:191-197`.
  - `/dzienniczek` empty state: `src/pages/dzienniczek/index.astro:205-211`.
  - `/wizyta` intro (no meds and no symptoms): `src/pages/wizyta.astro:47-58`.
  - Journal note in the list card: `src/pages/dzienniczek/index.astro:241-245`.
  - Login spread: `src/layouts/AuthSpreadLayout.astro` (shared by 6 entry pages, see below).
- **No shared EmptyState component exists**; the three empty states repeat the same inline `section` card. A shared `.astro` component is the natural seam, and is a plan decision.
- **Test risk is low and located.** No node or E2E test asserts the empty-state texts. Markup constraints that tests do hold: `li[data-entry-id]` must contain exactly one inner list of symptoms and the note text (`tests/e2e/severity-on-phone.spec.ts:111-113`, `dark-gallery.spec.ts:526-530`), and the `/wizyta` regions keep their `aria-labelledby`/`data-visit-interactions` hooks.

## Detailed Findings

### 1. Mockup F — what it consists of

Read from the artifact files `project/F*.dc.html` (version 1792344445-a22b).

- **Note ("sticky")**: `position: relative; background: var(--card)` or `var(--acc)`; `border-radius: 4px`; `box-shadow: 0 4px 12px rgba(0,0,0,0.10)`; `transform: rotate(-1.5deg … 3deg)`.
- **Tape**: absolutely positioned `span aria-hidden="true"`, ~80×22 px, `top: -11px`, centred, background `var(--acc-b)` or `var(--side-b)`, `opacity: 0.85`, sometimes its own small rotation.
- **Board F (login)**: the existing Rozkładówka layout kept. On large screens the three `points` become three notes (white, accent, white, rotated −2°, +2°, −1°) on the sidebar-coloured left page. On the phone board the heading sits on one note. The right page and the form are unchanged.
- **F-leki**: one note (card colour, −1.5°) over a second accent-coloured note rotated +3° behind it (`aria-hidden`), containing `list.empty` and the "Dodaj lek" button.
- **F-dziennik**: one accent note with ruled lines (`repeating-linear-gradient` with `--acc-b` every 30px), +1.5°, containing `list.empty` and "Nowy wpis".
- **F-wizyta**: one card-coloured note (−1°) with the intro sentence, then two small accent notes (+2°, −2°), each holding one primary button: "Dodaj lek", "Zapisz objaw". Today the second button is `variant: "outline"` (`wizyta.astro:48-58`); in the mockup both are primary. Plan must decide whether that button change is in scope.
- **F-notatka**: inside the existing white journal card, the note becomes a small accent note (−1°) with tape at its top-left; the "Notatka:" label stays, muted.
- Mockup copy on every F board equals repo copy (see Summary). The mockup nav label "Dziennik" also matches `src/lib/navigation.ts:10`.

### 2. Target surfaces and their conditions

**`/leki`** (`src/pages/leki/index.astro`)

- Empty state renders when load succeeded and `items.length === 0` (`:191`). `items` holds current medications only (`discontinued_on` null or after today, `:65`), so the same note shows for "never added" and "all ended". The "Zakończone leki (n)" link appears below it when `endedCount > 0` (`:259-263`).
- Markup `:192-197`: `section.rounded-xl.border.bg-card.p-6.shadow-sm` > `p.mb-4 {copy.empty}` + `a` with `buttonVariants()`.
- Below the empty state the interaction notes and the graph section still render (`:231-234`, `:254`); they are not part of S-08 (graph = S-10).
- Sibling: `/leki/zakonczone` empty (`src/pages/leki/zakonczone.astro:81-84`), text only, no CTA. Not in the mockups.

**`/dzienniczek`** (`src/pages/dzienniczek/index.astro`)

- Empty state when load succeeded and `entries.length === 0` (`:205`). Same markup pattern (`:206-211`), CTA to `/dzienniczek/nowy`.
- Journal card `li[data-entry-id]` (`:221-252`); note rendered at `:241-245` as `p.break-words` with a muted `noteLabel:` span. The note is max 200 characters (`JOURNAL_NOTE_MAX_LENGTH`, `src/lib/services/journal.ts:13`).
- The note is shown read-only only in this list. `/dzienniczek/[id]` passes it only as textarea `defaultValue` (`[id].astro:199`); the timeline, `/wizyta` and doctor questions do not show it (worker inspection, not exhaustive beyond those files).
- Note entry fields: `NewEntryForm.tsx:131-146`, `EditEntryForm.tsx:150-168`. The mockup F-notatka covers display only, not the textarea.

**`/wizyta`** (`src/pages/wizyta.astro`, copy `src/lib/copy/visit-summary.ts`)

- Intro replaces all sections when `summary.showIntro` (`:47`); `showIntro` is true when current-or-ended med count and symptom count are both 0 (`src/lib/services/visit-summary.ts:124-134`).
- Other per-section empty states exist (`currentMedicationsEmpty` `:80-87`, interactions 0/1/2+ `:132-148`, `noQuestions` `:177-183`). The mockups cover only the intro. PRD rule for all of them: an empty section never sounds like "all fine" (`prd.md:99-101`, FR-011 `prd.md:161`).

**Login and other entry screens** (`src/layouts/AuthSpreadLayout.astro`)

- Left page: `section.bg-sidebar.text-sidebar-foreground` (`:20`) with `BrandName`, heading, `ul.hidden.lg:flex` of three `points` (`:23-27`), privacy note.
- The layout is shared by `auth/signin`, `signup`, `confirm`, `confirm-email`, `konto-usuniete`, `warunki/akceptacja` (worker grep). Changing the left page changes all six. The four password-recovery pages use plain `Layout`, so they would not get the notes.
- Text on the sidebar must stay `sidebar-foreground` (`CLAUDE.md`, "Na pasie bocznym…"). In the mockup the notes are card/accent coloured with `--fg` text, so text on a note is `card-foreground` or `accent-foreground`, which already pass 7:1 through the automatic `X`/`X-foreground` pairs (`scripts/tokens/contrast.mjs`).

**Other empty states not in the mockups**: timeline intro and partial states (`src/components/timeline/TimelineView.astro:109-120`, `:165-172`, `:210-217`), `/leki/[id]` no interactions (`:427-431`), graph `graphTooFewMedications`. Roadmap risk (`roadmap.md:219`) limits S-08 to empty states and the note look and leaves charts to S-09/S-10. Whether the timeline intro joins is a plan scope question.

### 3. Constraints on decorative visuals

**Colour gate** (`scripts/tokens/hardcoded-colors.mjs`)

- Scans `src/` files with `.astro .ts .tsx .js .jsx .css` (`:11`); `EXCEPTIONS = []` (`:17`) and must stay empty.
- Rejects hex, `rgb(`/`rgba(`/`hsl(`/`oklch(` and other colour functions, Tailwind palette classes (also `fill-*`/`stroke-*`, `-white`, `-black`), named colours in `fill=`/`stroke=`, opacity on text tokens (`text-foreground/50`) and any `dark:` colour class. So the mockup's `rgba(0,0,0,0.10)` shadow cannot be copied.
- Allows token classes (`bg-accent`, `bg-accent-border`, `bg-sidebar-border`), opacity on non-text tokens (`bg-accent-border/85`), `currentColor`, `var(--token)` in arbitrary values (`AuthSpreadLayout.astro:37` precedent). Gate test fixture allows `<svg fill="currentColor">` (`hardcoded-colors.test.mjs:104`).
- `destructive*` and `interaction*` must not be used for the tape or paper: red is only for errors and account deletion (`scripts/tokens/destructive-scope.mjs:20-37`), amber means "possible interaction" (`CLAUDE.md`, Kolory).

**Tokens** (`src/styles/global.css` `:root` 10-56, `.dark` 58-96, `@theme inline` 98-139)

- Existing tokens cover the mockup: `card`, `accent`, `accent-border`, `sidebar`, `sidebar-border`, `secondary`.
- If a new token were still wanted (e.g. a dedicated tape colour), it needs a `#RRGGBB` value in both blocks, `@theme inline` registration, and a contrast pair only if used for text (`contrast.mjs:20-32`, `:134-189`).
- No test checks contrast of decorative fills. Visibility of an accent note on the dark canvas (`#263a2c` on `#141915`) can only be judged on screen; the dark gallery (`tests/e2e/dark-gallery.spec.ts`, opt-in `DARK_GALLERY=1`) is the existing tool for that.

**Dark mode**: server draws `class="dark"` on `<html>` (`src/layouts/Layout.astro:16-30`); tokens switch by themselves, so the notes need no second drawing. Theme-dependent elements, if any, switch by `dark:hidden` visibility only (`ThemeToggle.astro:33,53`).

**Motion and a11y**

- A static `rotate-*` class is not motion; no `motion-reduce` guard needed unless something animates. Existing convention for animated rotation is `motion-reduce:transition-none` (`SymptomPicker.tsx:166`).
- Decorative parts (tape, back note) get `aria-hidden="true"`, as in the mockup and in `BrandName.astro:26-42`. No `<img>` is used anywhere in `src/`.
- Rotated text must stay readable: mockup rotations stay within ±3°.

**FR-012 and copy**

- No new copy is required by the mockups. If any is added, it goes into `src/lib/copy/*` (strings only; FR-012 tests throw on non-string values, `scripts/fr012/auth-copy.test.mjs:12-18`) and passes `FORBIDDEN_WORDS` (`scripts/rpl/pairs.mjs:24-61`).
- Graphic rule closest to illustrations: no exclamation mark, triangle, red, amber or pharmacy cross; the mark stays neutral (`context/archive/2026-10-15-app-icon/plan.md:52`). Roadmap: illustrations must not frighten or suggest danger (`roadmap.md:219`).
- Login: `design-draft.md:172-178` forbids sample meds, symptoms, times or dates before login. The F login notes carry only the three general sentences, so this holds.

### 4. Tests that may break

- `tests/e2e/severity-on-phone.spec.ts:111-113`: `li[data-entry-id]` must have exactly one inner `listitem` (symptom · severity). The note wrapper must not add `li` or `role=listitem`.
- `tests/e2e/dark-gallery.spec.ts:526-530`: finds entries by `li[data-entry-id]` filtered by note text, so the note text stays inside the `li`. `:470` fills the textbox labelled "Notatka" (entry form, out of mockup scope).
- `tests/e2e/visit-readable.spec.ts:121,140`, `dark-gallery.spec.ts:303`, `interaction-graph.spec.ts:244`: `/wizyta` regions by `aria-labelledby` and `[data-visit-interactions]`; only touched if per-section empty states change.
- `scripts/visit-summary/visit-summary.test.mjs:144-156`: logic of `showIntro`/`interactionsEmptyState`, not markup.
- `scripts/tokens/hardcoded-colors.test.mjs`: any literal colour in new markup.
- No test asserts the empty-state texts themselves (worker grep of `tests/e2e` and `scripts`).

## Code References

- `src/pages/leki/index.astro:191-197` — `/leki` empty state
- `src/pages/leki/zakonczone.astro:81-84` — ended meds empty state (not in mockups)
- `src/pages/dzienniczek/index.astro:205-211` — journal empty state
- `src/pages/dzienniczek/index.astro:241-245` — note in the journal card
- `src/pages/wizyta.astro:47-58` — `/wizyta` intro, two buttons (second `outline`)
- `src/layouts/AuthSpreadLayout.astro:20-31` — login left page with `points`
- `src/lib/copy/auth.ts:9-20` — spread copy (same as mockup)
- `src/lib/copy/medications.ts:13`, `src/lib/copy/journal.ts:12,19,34-35`, `src/lib/copy/visit-summary.ts:12-14` — empty-state and note copy
- `src/styles/global.css:10-139` — tokens
- `scripts/tokens/hardcoded-colors.mjs:11,17` — colour gate scope, empty exceptions
- `src/components/BrandName.astro:26-42` — inline decorative SVG precedent (`aria-hidden`, token classes)
- `tests/e2e/severity-on-phone.spec.ts:111-113` — journal card structure assertion

## Architecture Insights

- UI rules live in `CLAUDE.md` (Konwencje kodu: Kolory, Tryb jasny/ciemny) and `context/changes/auth-login-design/design-draft.md`; there is no separate design-system file. `/10x-ui` expects the change to end with a rule in the agent rules file (`.claude/skills/10x-ui/SKILL.md:213-224,263`), e.g. "a paper note = the shared component X, colours accent/card, tape accent-border/sidebar-border".
- Two repeated inline patterns exist today: the empty-state card (3× on target screens, more elsewhere) and the CTA pair on intros (`wizyta.astro`, `TimelineView.astro:109-120`). One `.astro` note component (paper, optional tape, optional back sheet, optional ruled lines, rotation) covers every F board; it stays `.astro` because it holds no state (`CLAUDE.md`, Astro vs React).

## Historical Context (from prior changes)

- `context/archive/2026-09-26-app-shell-visual-foundation/plan-brief.md:31,38,43` — tokens only, red only for errors, no colour `dark:` classes. Supported, still in force.
- `context/changes/auth-login-design/design-draft.md:99-111` — Rozkładówka layout for login; on the phone the three sentences drop out. Board F keeps the layout and the phone rule (on the phone board only the heading is on a note). `:92-95` "content on white, palette only on chrome": the F login puts accent and white notes on the sidebar page, which is a deliberate departure accepted by the author on 18.10.2026; design-draft.md does not record it yet.
- `context/archive/2026-10-15-app-icon/plan.md:13,52` — gate does not scan `public/*.svg`; neutral graphics rule.
- `context/archive/2026-10-16-visit-readable-with-current-meds/plan.md:35` — in `.astro`, inline SVG in `currentColor` instead of `lucide-react`.
- `context/archive/2026-10-08-doctor-visit-summary/plan.md:21,23,130` — origin of the `/wizyta` intro and 0/1/2+ empty states.
- The 18.10.2026 decision for F is recorded only in session memory, not yet in the repo (worker search found no "Karteczki"/"taśm" mention).

## Related Research

Not applicable: no earlier `research.md` on illustrations or empty states.

## Open Questions

For `/10x-plan` (none blocks research):

1. **Record the decision**: F · Karteczki everywhere, login included, chosen 18.10.2026. Roadmap S-08 scope (`roadmap.md:207-221`) does not list login yet; `design-draft.md` needs a note on the login change.
2. **Login reach**: `AuthSpreadLayout` is shared by six pages, so all six get the notes. Is that intended, or only sign-in?
3. **Wizyta buttons**: mockup makes "Zapisz objaw" primary; today it is `outline`. In scope or not?
4. **Other empty states** (`/leki/zakonczone`, timeline intro, `/wizyta` per-section states): include in S-08 or leave? Roadmap risk argues for the mockup set only.
5. **Shadow**: Tailwind `shadow-md` vs a token-based arbitrary shadow; both pass the gate, choice is visual.
6. **Dark mode check**: accent note on the dark canvas has no automated contrast check; needs a visual check in the dark gallery or by hand.
