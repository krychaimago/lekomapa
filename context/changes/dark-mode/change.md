---
change_id: dark-mode
title: Dark mode
status: impl_reviewed
created: 2026-10-11
updated: 2026-10-11
archived_at: null
---

## Notes

<!-- Free-form notes for this change: links, ad-hoc context, decisions that don't belong in research/frame/plan. -->

- 2026-10-11 — Phase 3 dark-mode gallery (42 screen states × phone/desktop) accepted by the author without remarks: no token fixes, no defects outside tokens. Gallery: https://claude.ai/artifact/9sfwxDwr9ya79JSn5BuWAP
- 2026-10-11 — Outside the plan: during screenshots the gallery puts the phone tab bar and the desktop sidebar into the page flow (FULL_PAGE_LAYOUT_CSS in tests/e2e/dark-gallery.spec.ts), because a full-page shot drew the fixed tab bar over a form error. The app is unchanged. The gallery therefore reviews colours, not layout: it cannot show a fixed bar covering content in real use.
