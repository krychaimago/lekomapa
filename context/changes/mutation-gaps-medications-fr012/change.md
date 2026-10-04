---
change_id: mutation-gaps-medications-fr012
title: Luki w testach wskazane przez Strykera — leki i filtr FR-012
status: implementing
created: 2026-10-04
updated: 2026-10-04
archived_at: null
---

## Notes

Wariant „optymalny” wybrany przez autorkę 4.10.2026: przegląd przeżyłych mutantów i dopisanie testów w dwóch modułach.

- `src/lib/services/medications.ts` — 62,50 %, 39 przeżyłych (najsłabszy wynik; m.in. sortowanie substancji: `a.position - b.position` → `+` nie pada).
- `scripts/rpl/pairs.mjs` (filtr języka FR-012) — 82,40 %, 41 przeżyłych.

Poza zakresem: `scripts/tokens/contrast.mjs` (32) i `src/lib/navigation.ts` (4).

Pierwszy pomiar: `npm run test:mutation`, łącznie 81,70 % (516 zabitych, 116 przeżyłych), konfiguracja z PR #61.

Nie każdy przeżyły mutant wymaga testu (np. treść komunikatu błędu w skrypcie). Pomijane świadomie, z zapisanym powodem — tak jak findingi w impl-review. Oczekiwane wartości w testach z PRD, nie z kodu (test-plan §6.1).

Faza 1 (4.10.2026): `medications.ts` 92,31 %, 8 przeżyłych zamiast planowanych 6. Dodatkowe dwa to `ConditionalExpression` → `true` w `sharedPrefixLength` (`medications.ts:96`, kolumny 10 i 31; w research #623, #625). Research przewidywał pętlę bez końca; w rzeczywistości drugie sprawdzenie długości i tak ją zatrzymuje (zmierzone: 81 par napisów, zero różnic). Autorka zdecydowała: pominąć jako równoważne, wpisać do `surviving-mutants.md` w fazie 3.
