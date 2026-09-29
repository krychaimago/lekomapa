---
change_id: testing-language-guard
title: Strażnik języka FR-012 — rollout fazy 3 planu testów
status: archived
created: 2026-09-29
updated: 2026-09-29
archived_at: 2026-09-29T18:55:49Z
---

## Notes

Open a change folder for rollout Phase 3 of context/foundation/test-plan.md: "Strażnik języka FR-012".
Risks covered: #2 (komunikat o kolizji stwierdza przyczynę, sugeruje odstawienie lub zmianę dawki albo pozwala odczytać brak znacznika jako „bezpieczne”). Test types planned: unit + smoke step.
Risk response intent:

- #2: prove każdy tekst o kolizji zawiera „może mieć związek” i nie zawiera formuł przyczynowych ani zaleceń; przy każdej kolizji jest nota poglądowa; produkt mówi, że brak ostrzeżenia nie znaczy „bezpieczne”. Challenge „nie ma zakazanego słowa, więc tekst jest poprawny”. Avoid wyrocznia skopiowana z walidatora — oczekiwane frazy biorą się z FR-012, nie z kodu.
