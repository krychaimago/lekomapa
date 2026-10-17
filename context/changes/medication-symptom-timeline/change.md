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

### Pomiar LCP i limit CPU (faza 4)

Konto ciężkie (lokalne Supabase):

- Wypełnienie: `node --experimental-strip-types scripts/timeline/seed-heavy.mjs` — wymaga `npx supabase start`. Adres bazy z `.dev.vars`, nigdy z `.env`; skrypt odmawia pracy, gdy adres nie jest lokalny.
- Dane z `scripts/timeline/heavy-fixture.mjs` (ten sam generator co pomiary fazy 2 i 3): 20 leków po 3 okresy, 1000 wpisów, 8 objawów w ciągu roku. „Dziś” generatora to wczorajszy dzień polski, żeby żaden wpis nie wypadł w przyszłości.
- Konto: `timeline-heavy@example.test` (inne przez `HEAVY_EMAIL` i `HEAVY_PASSWORD`).
- Wpisy sprzed więcej niż 14 dni i daty zakończenia leków w przeszłości blokują strażnicy historii. Skrypt wyłącza na czas tych zapisów tylko trzy nazwane wyzwalacze: `symptom_entries_guard_occurred_at`, `medications_guard_core`, `medications_sync_discontinuation`. Włącza je z powrotem w tej samej transakcji i przed zatwierdzeniem sprawdza, że wszystkie są włączone.

LCP — Lighthouse Mobile na `/wizyta/os-czasu`, build + `astro preview` na lokalnym Supabase, jak S-05:

- Data pomiaru: 17.10.2026. Lighthouse 12.8.2, Chromium z Playwrighta (headless), sesja konta ciężkiego w nagłówku `Cookie`. Po wypełnieniu wszystkie trzy wyzwalacze sprawdzone w `pg_trigger` jako włączone.
- Bez kompresji (sam `astro preview`): 2,57 / 2,58 / 2,56 s, mediana **2,57 s — ponad próg**. Element LCP to akapit wprowadzenia; czas zjada pobranie 267 KB HTML na symulowanym wolnym 4G. Podgląd nie kompresuje odpowiedzi.
- Produkcja kompresuje HTML (`content-encoding: br` na `https://lekomapa.pl/auth/signin`, sprawdzone 17.10.2026). Dlatego drugi pomiar szedł przez lokalne proxy z kompresją brotli przed podglądem (skrypt w scratchpadzie sesji, poza repozytorium). Dokument miał wtedy 21 KB.
- Z kompresją: 1,11 / 1,11 / 1,11 s, mediana **1,11 s** (próg: ≤ 2,5 s) — spełniony. Wynik wydajności 0,98–1.
- Dla porównania `/wizyta` na tym samym koncie, bez kompresji: 1,52 s.
- Przesądza: wynik zależy od kompresji po stronie Cloudflare. Gdyby ją wyłączyć, oś na ciężkim koncie przekroczy próg.

Wyniki pomiarów z faz 2 i 3 (szczegóły wyżej):

- Logika `buildTimeline`: mediana 0,98–0,99 ms (próg ≤ 2 ms).
- Render całej strony: mediana 5,88–6,01 ms (próg ≤ 7 ms po decyzji autorki z 17.10.2026).

Limit CPU po wdrożeniu (Sentry `cron.exceeded-cpu` / Workers Analytics):

- Data sprawdzenia: TODO
- Wynik: TODO
