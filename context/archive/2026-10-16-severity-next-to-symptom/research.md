---
date: 2026-10-16T12:09:52+0200
researcher: Claude (Opus 5.5) for Krycha Imago
git_commit: 568f81a
branch: main
repository: krychaimago/lekomapa
topic: "S-06: severity next to the ticked symptom, also on a phone — audit of SymptomPicker"
tags: [research, ui, journal, SymptomPicker, severity, mobile]
status: complete
last_updated: 2026-10-16
last_updated_by: Claude (Opus 5.5)
---

# Research: severity next to the ticked symptom (S-06)

**Date**: 2026-10-16T12:09:52+0200
**Researcher**: Claude (Opus 5.5) for Krycha Imago
**Git Commit**: 568f81a
**Branch**: main
**Repository**: krychaimago/lekomapa

## Research Question

Two-way UI audit (`/10x-ui`) of the journal symptom picker: why the per-symptom severity is off-screen on a phone, what constrains moving it, what tests and design-system pieces are involved, and 3–5 charges with file:line and user effect. Roadmap S-06, issue #109, MS-06, FR-008 (`context/foundation/roadmap.md:177-190`).

## Summary

- The problem is layout, not tokens. Hardcoded-value scan on the 5 view files: 0 hits. The view reads tokens and imports `Button`, `Input`, `Label` from `src/components/ui/` (`SymptomPicker.tsx:3-5`).
- Severity buttons sit in the "Wybrane objawy" block, rendered **above** the search field and the list (`SymptomPicker.tsx:105-143` before `:145-189`). Under the grouped view (empty query) the list has 34 symptoms in 8 categories, one column below `sm` (`:177`), each row `min-h-12` (`:30`). The last row ("spadek libido") is roughly 2.2–2.4k px below the block (estimate from classes, not measured).
- This placement was a deliberate fix: impl-review F5 of the original journal change moved the buttons out of the list so that severity stays reachable when a search hides the ticked symptom (`context/archive/2026-10-05-symptom-journal-entry/reviews/impl-review.md:105-113`). S-06 and F5 pull in opposite directions; the plan must satisfy both.
- No existing test touches severity controls in a browser. Two E2E specs tick symptoms with `getByRole("checkbox", { name, exact: true })`, so severity must stay **outside** the `<label>`, or the checkbox accessible name changes and both specs break.
- No mobile Playwright project exists; a phone viewport appears only in the opt-in `dark-gallery.spec.ts` (390×844).

## Charges

### C1 — Severity appears far from where the user ticked (accidental architecture)

- **Where**: `src/components/journal/SymptomPicker.tsx:105-143` (severity inside the "selected" block), `:166-189` (list below), `:80-97` (list row has only the checkbox).
- **User effect**: On a phone she ticks a symptom near the end of the list and nothing near her finger offers severity; the buttons appear ~2k px above, off-screen, so she either saves without severity or does not know it exists.
- **Evidence**: block order in JSX; 34 rows from `supabase/migrations/20260926120100_symptom_catalog_seed.sql:26-59`; category order `src/types.ts:239-253`.
- **Status**: rozwiązany w fazie 2 — nasilenie stoi pod zaznaczonym objawem, w tym samym wierszu listy; ryzyko na telefonie pilnuje `tests/e2e/severity-on-phone.spec.ts` (faza 3).

### C2 — Ticking a symptom shifts the list under the finger (accidental architecture, inference)

- **Where**: `SymptomPicker.tsx:112-141`. Each ticked symptom adds a card with a name row, the "Nasilenie (opcjonalne)" caption and a row of `h-12` buttons (`button.tsx` size `sm` = `h-12`) **above** the search field and list.
- **User effect**: After each tick the whole list moves down by the height of the new card (roughly 100px+), so the row she wanted to tap next slides away and the next tap can land on a different symptom.
- **Evidence (research)**: inferred from the DOM order; not yet observed in a browser. Verify on a phone width before planning on it.
- **Status**: rozwiązany w fazie 2 — nad listą nie ma już bloku, który rośnie po każdym zaznaczeniu; podsumowanie „Wybrane objawy” stoi pod listą, więc lista nad palcem się nie przesuwa.

### C3 — The same choice shown twice in two styles (missing shared component)

- **Where**: list row selected style `SymptomPicker.tsx:29-32` (`has-[:checked]:border-primary ring-2 ring-primary`) and selected card `:117-120` (`border-primary`, no ring).
- **User effect**: With a symptom ticked, the screen shows it twice — as a ringed row in the list and as a card at the top — and it is not obvious that they are one thing or where to act.
- **Note**: whichever variant the plan picks, one "ticked symptom" presentation should own the severity control; the other becomes a short summary or disappears.
- **Status**: rozwiązany w fazie 2 — jedno miejsce wyboru nasilenia (wiersz objawu); podsumowanie na dole pokazuje tylko „nazwa · nasilenie” i przycisk usunięcia, bez przycisków nasilenia.

### C4 — Severity caption repeated per symptom; note reuses the severity copy key (copy, low)

- **Where**: `SymptomPicker.tsx:53-55` renders "Nasilenie (opcjonalne)" inside every selected card; `NewEntryForm.tsx:133` labels the note with `copy.severityOptional`.
- **User effect**: With several symptoms ticked the same caption repeats per card and adds height (feeds C2). The note label is correct text today, but under a severity key — a later wording change for severity would silently change the note label.
- **Proposal**: candidate for **deferred** unless the chosen variant already touches these lines.
- **Status**: rozwiązany w fazie 2 — notatka ma własny klucz `noteOptional`. Podpis „Nasilenie (opcjonalne)” przy każdym zaznaczonym objawie zostaje świadomie: stoi teraz przy objawie, nie w stosie kart nad listą.

## Detailed Findings

### Component and its hosts

- `SymptomPicker` is one component used on two screens: `NewEntryForm.tsx:123-129` (`/dzienniczek/nowy`) and `EditEntryForm.tsx:214-220` (correction of an entry while the window is open). Both hold `selected: SelectedSymptom[]` and pass `onToggle` / `onSeverityChange`; order of `selected` = order of ticking (`NewEntryForm.tsx:39-45`).
- Severity is optional and clears on a second press (`SymptomPicker.tsx:67-70`); labels from `SYMPTOM_SEVERITIES` (`src/types.ts:292-301`): łagodne, umiarkowane, silne.
- The severity group has `role="group"` and `aria-label="Nasilenie: <name>"`; buttons use `aria-pressed` (`SymptomPicker.tsx:52,65`).
- Search: non-empty query switches to a flat alphabetical list from `filterSymptoms` (`src/lib/services/journal.ts:31-53`); a ticked symptom that does not match disappears from the list. That is the F5 case.

### Design system

- Variant: existing design system. Tokens `src/styles/global.css` (`:root` / `.dark` → `@theme inline`); components `src/components/ui/` (button, input, label, card, badge).
- Focus-visible: global rule `global.css:175-178` gives every `input`/`button` a 2px `--color-ring` outline; `Button` and `Input` add their own ring (`button.tsx:8`, `input.tsx:9-10`). Native checkbox uses `accent-primary` (`SymptomPicker.tsx:91`).
- Gate `scripts/tokens/hardcoded-colors.mjs` (`EXCEPTIONS = []`, `:17`) already blocks literal colours and `dark:` colour classes in `src/`.

### Tests and gates touching the view

- `tests/e2e/visit-readable.spec.ts:56-63` and `tests/e2e/dark-gallery.spec.ts:390` tick symptoms by checkbox role and exact name; both wait for hydration (`astro-island[ssr]` count 0) because input before hydration is lost.
- `dark-gallery.spec.ts:215-225` screenshots `/dzienniczek/nowy` (empty and no-symptom error) at 390×844 and 1280×800 when `DARK_GALLERY=1`; no state with a ticked symptom and severity; no `toHaveScreenshot` baselines in the repo.
- `playwright.config.ts`: projects `setup` and `chromium` (Desktop Chrome) only.
- `scripts/smoke.mjs:243-245,1359-1362,1427` saves severities via API/RPC only; `scripts/journal/journal.test.mjs:46-90` tests the pure helpers; no axe checks in the repo.

### 7-state matrix — current state of the view

- default: tokens + ui components — yes.
- hover: `Button` variants have hover; list rows have no hover style (`SymptomPicker.tsx:29-32`).
- focus-visible: global ring — yes.
- disabled: no disabled controls in the picker; N/A unless the plan adds one.
- error: "Wybierz co najmniej jeden objaw." via `ServerError` at the top of the form (`NewEntryForm.tsx:54-56,100`), not next to the picker.
- empty: `noneSelected` text (`SymptomPicker.tsx:109-110`) and `noMatch` (`:181-184`).
- loading: no hydration placeholder; ticks before hydration are lost (spec comment `visit-readable.spec.ts:51`).

## Code References

- `src/components/journal/SymptomPicker.tsx:29-32` — list row classes, selected ring
- `src/components/journal/SymptomPicker.tsx:49-78` — severity group
- `src/components/journal/SymptomPicker.tsx:105-143` — "Wybrane objawy" block above the list
- `src/components/journal/SymptomPicker.tsx:145-189` — search field and list
- `src/components/journal/NewEntryForm.tsx:39-49,123-133` — state, picker, note label
- `src/components/journal/EditEntryForm.tsx:214-220` — second host
- `src/lib/services/journal.ts:31-53,69-82` — filter and grouping
- `src/types.ts:239-253,288-301` — category order, severities
- `supabase/migrations/20260926120100_symptom_catalog_seed.sql:26-59` — 34 symptoms
- `tests/e2e/dark-gallery.spec.ts:31-34,215-225,390` — phone viewport, screenshots

## Architecture Insights

- Constraint set any variant must keep:
  1. Severity reachable while a search hides the ticked symptom (F5).
  2. Severity visible next to the tap on a phone, also for the last symptom (S-06, MS-06 `roadmap.md:35`).
  3. Severity controls outside the checkbox `<label>` (E2E selectors, accessible name).
  4. No symptom text in URL or request outside the POST body (lesson „Żadna nazwa leku ani dawka w adresie URL”); the picker already filters in the browser (`SymptomPicker.tsx:34-36`).
  5. Database, API and FR-008 unchanged (`roadmap.md:187`).
- Candidate variants for `/10x-plan` (not decided here):
  - **A — inline under the ticked row, top block reduced to a summary** (names + chosen severity + remove, no buttons). Search mode keeps ticked symptoms in the results (pinned above matches), so F5 holds with one set of controls.
  - **B — inline under the ticked row, top block keeps its buttons too.** Two controls bound to the same state; smallest code change, but two groups with the same accessible name and the duplication of C3 grows.
  - **C — dropdown (`select`) in the row.** Roadmap's alternative; native select on a phone opens a system picker; needs a "brak" option for optional severity and a label outside the checkbox label.
- C2 is solved by A and C only if the top block stops growing by a button row per symptom.

## Historical Context (from prior changes)

- `context/archive/2026-10-05-symptom-journal-entry/plan.md:345` — plan: "Zaznaczone objawy widoczne nad listą z wyborem nasilenia (3 przyciski, opcjonalne, możliwe do odznaczenia)". Supported by current code.
- Commit ed15d94 — first build put severity under the ticked row in the list. Superseded by 0738895.
- `context/archive/2026-10-05-symptom-journal-entry/reviews/impl-review.md:105-113` — F5, FIXED: buttons moved to "Wybrane objawy" so a search cannot hide them; phone check left to criterion 3.6. Supported (commit 0738895, comment at `SymptomPicker.tsx:49-50`).
- `context/archive/2026-10-08-doctor-visit-summary/change.md:15` — severity stays optional, FR-008 unchanged. Supported.

## Related Research

- Not applicable — no earlier `research.md` on the picker layout.

## Open Questions

- Variant A / B / C — product choice for `/10x-plan` (roadmap leaves it open, non-blocking).
- C2 (list jump) needs one observation at 390px before it becomes a plan phase.
- Should a phone-viewport E2E test (tick the last symptom, choose severity, save, see it on the list) live in a new mobile project in `playwright.config.ts` or via `browser.newContext({ viewport })` in the spec, as `dark-gallery.spec.ts` does?
