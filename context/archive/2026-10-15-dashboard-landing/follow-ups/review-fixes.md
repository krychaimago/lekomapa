# Review fixes — dashboard-landing

Source: `reviews/impl-review.md`

## F1 — measure the redirect on production (after merge and deploy)

- [x] `curl -sI https://lekomapa.pl/dashboard` returns `302` with `location: /leki` — measured 2026-10-15 after deploy of 4422c51
- [x] Same check while signed out: `/dashboard` → `/leki` → `/auth/signin` (curl, each hop 302) — measured 2026-10-15
