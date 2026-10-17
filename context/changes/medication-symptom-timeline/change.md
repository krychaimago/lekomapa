---
change_id: medication-symptom-timeline
title: Medication symptom timeline
status: implementing
created: 2026-10-17
updated: 2026-10-17
archived_at: null
---

## Notes

<!-- Free-form notes for this change: links, ad-hoc context, decisions that don't belong in research/frame/plan. -->

### Pomiar logiki osi (faza 2, 17.10.2026)

- Skrypt: `node --experimental-strip-types scripts/timeline/bench.mjs`, dane z `scripts/timeline/heavy-fixture.mjs`: 20 leków po 3 okresy, 1000 wpisów na 8 objawów w ciągu roku.
- 50 przebiegów rozgrzewki, potem 200 mierzonych przebiegów `buildTimeline`, Node na macOS (maszyna autorki).
- Mediana 0,98–0,99 ms, 95. percentyl 1,15–1,18 ms (4 biegi). Próg: mediana ≤ 2 ms — spełniony.
- To dolna granica: render Astro mierzy faza 3 (`render-bench.mjs`). Node to nie workerd, różnica niezmierzona.
- Pierwsza wersja (dzień polski przez `Intl` przy każdym wpisie) dawała ok. 1,58 ms. Obecna czyta przesunięcie strefy raz na dzień UTC; porównana z `todayInWarsaw` co 15 minut w latach 2024–2028 bez różnic.
