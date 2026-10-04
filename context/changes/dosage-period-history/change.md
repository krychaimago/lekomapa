---
change_id: dosage-period-history
title: Historia okresów dawkowania — zmiana dawki zamyka stary okres i otwiera nowy
status: implementing
created: 2026-10-04
updated: 2026-10-04
archived_at: null
---

## Notes

<!-- Free-form notes for this change: links, ad-hoc context, decisions that don't belong in research/frame/plan. -->

### Pomiar wariantów w rejestrze (faza 2, 2026-10-04, lokalna baza po `db reset`)

- Skład porównywany jak w `change_dosage`: zbiór kodów ATC + zbiór nazw substancji bez kodu (bez wielkości liter i spacji na brzegach).
- 3273 produkty, 1095 nazw.
- 686 nazw ma więcej niż jeden wariant.
- Tylko 1 nazwa ma warianty o różnym składzie: **Sartesta**.
  - 5 mg + 80 mg, 5 mg + 160 mg, 10 mg + 160 mg: amlodypina + walsartan (C08CA01, C09CA03).
  - 24 mg + 26 mg, 49 mg + 51 mg, 97 mg + 103 mg: walsartan (C09CA03) + sakubitryl bez kodu.
- Wniosek: reguła „inny skład → nowy lek” (`DP005`) zadziała w praktyce rzadko — przy przejściu między tymi dwiema grupami Sartesty. Wynik nie zmienia decyzji.
- Ten sam wynik przy porównaniu surowych nazw substancji (z wielkością liter).
