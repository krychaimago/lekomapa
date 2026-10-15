# Review fixes — dashboard-landing

Source: `reviews/impl-review.md`

## F1 — measure the redirect on production (after merge and deploy)

- [ ] `curl -sI https://lekomapa.pl/dashboard` returns `302` with `location: /leki`
- [ ] Same check while signed out in a browser: `/dashboard` ends on the sign-in screen
