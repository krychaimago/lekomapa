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

### Pomiar renderu całej strony (faza 3, 17.10.2026)

- Skrypt: `node scripts/timeline/render-bench.mjs`, dane z `scripts/timeline/heavy-fixture.mjs` (te same co w fazie 2): 20 leków po 3 okresy, 1000 wpisów na 8 objawów w ciągu roku.
- Mierzy `buildTimeline` + render `TimelineView.astro` przez Astro Container API: trzy zakresy, oba układy (telefon, komputer), wiersze wszystkich objawów, lista tekstowa. Komponent ładowany przez serwer Vite z konfiguracją Astro bez pliku `astro.config.mjs` — adapter Cloudflare przenosi środowisko serwera do workerd, skąd Vite nie poda modułu temu procesowi.
- 50 przebiegów rozgrzewki, potem 200 mierzonych, Node 24.13.0 na macOS (maszyna autorki).
- Mediana 5,88–6,01 ms, 95. percentyl 7,16–7,46 ms (3 biegi). Próg: mediana ≤ 5 ms — **niespełniony**. Logika (`buildTimeline`) to z tego ok. 1 ms (pomiar fazy 2).
- HTML ciała strony: 249,2 KiB (27,0 KiB po gzip), ok. 1770 elementów.
- Pierwsza wersja (jeden element SVG na każdy znacznik i każdą linię miesiąca): mediana 17,3 ms, 424,6 KiB, ok. 7270 elementów. Obecna rysuje każdą grupę znaczników i linie miesięcy jednym `<path>` (same liczby) i formatuje datę dnia objawu raz dla wszystkich zakresów — technika bez zmian (SVG z serwera, filtry CSS, wszystkie zakresy i oba układy w HTML).
- Node to nie workerd, różnica niezmierzona.
- **Decyzja autorki (17.10.2026):** próg podniesiony z ≤ 5 ms do ≤ 7 ms (wariant najszybszy). Twardy limit to 10 ms; 5 ms był zapasem przyjętym w planie. Odrzucone: jeden układ zamiast dwóch (ok. pół dnia, jeden styl znaczników), płatny plan Workers (5 USD/mies.). Przesądza: mniejszy zapas — konto cięższe niż 8 objawów i 1000 wpisów może przebić limit, wyłapie to `cron.exceeded-cpu` po wdrożeniu (faza 4, krok 4.7). Krok 3.5 w `## Progress` zachowuje brzmienie „≤ 5 ms”, bramką jest próg ze skryptu.
