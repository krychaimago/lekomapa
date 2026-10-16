---
change_id: severity-next-to-symptom
title: Severity next to symptom
status: implemented
created: 2026-10-16
updated: 2026-10-16
archived_at: null
---

## Notes

Roadmap S-06, issue #109 (MS-06, FR-008). Change runs through `/10x-ui`.

**View (one):** symptom picker of the journal entry form — `src/components/journal/SymptomPicker.tsx`, rendered on `/dzienniczek/nowy` (`NewEntryForm.tsx`) and on entry correction `/dzienniczek/[id]` (`EditEntryForm.tsx`). Same component, two screens.

**Design-system variant:** existing design system — extend, do not fork. Values: `:root` / `.dark` in `src/styles/global.css`, published via `@theme inline`. Components: `src/components/ui/` (shadcn new-york: button, input, label, card, badge). Rules: `CLAUDE.md` (`AGENTS.md` symlink), section "Konwencje kodu" → "Kolory".

**Pre-audit (16.10.2026):**

- hardcoded-value scan on the view files: 0 hits (gate `scripts/tokens/hardcoded-colors.mjs` already enforces it repo-wide).
- token classes: SymptomPicker 15, NewEntryForm 4, EditEntryForm 4; ui imports: 3 each.
- So the charge is not missing tokens — it is layout / accidental architecture: severity buttons live in the "selected" block above search and list, off-screen on a phone after ticking a symptom near the end of the list.

**Audit brief for /10x-research:** two-way audit of the view; 3–5 charges (file:line + user effect) in `research.md` under `## Charges`. Open question from roadmap: inline severity buttons expanding at the ticked option vs a dropdown. Database and FR-008 unchanged. Narrow screen is the failing case — candidate for a mobile-viewport E2E test (Playwright set up in `tests/e2e/`).
