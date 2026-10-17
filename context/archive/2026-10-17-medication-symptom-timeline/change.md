---
change_id: medication-symptom-timeline
title: Medication symptom timeline
status: archived
created: 2026-10-17
updated: 2026-10-17
archived_at: 2026-10-17T20:06:21Z
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

- Data sprawdzenia: nie sprawdzono przed archiwizacją (17.10.2026, decyzja autorki).
- Wynik: brak. Krok 4.7 zostaje otwarty; siatką bezpieczeństwa jest zadanie `cron.exceeded-cpu` w `src/worker.ts`, które zgłasza przekroczenie do Sentry.

### Przyjęte ograniczenie: przeglądarki bez `:has()` (impl-review F2, 17.10.2026)

- Filtry osi (zakres, objaw, leki, komunikat o ukryciu leków) działają wyłącznie przez selektor `:has()`.
- Przeglądarka bez `:has()` (Firefox < 121, Safari < 15.4) pokazuje trzy zakresy w obu układach i wszystkie objawy jeden pod drugim, a kontrolki nic nie zmieniają.
- Żadne dane nie znikają — ryzyko ukrycia danych bez ostrzeżenia nie zachodzi. Ekran jest tylko mało czytelny.
- Przyjęte bez widoku zastępczego. Przesądza: jeśli kiedyś dojdzie `@supports not selector(:has(*))`, potrzebny będzie tekst z testem FR-012 i ponowny pomiar renderu.

### Sprawdzenie ręczne: komunikat o ukrytych lekach w VoiceOver (impl-review F3)

Komunikat „Część leków jest ukryta.” ma `role="status"`, ale pojawia się przez zmianę `display` w CSS. Część czytników ekranu nie ogłasza regionu, który był ukryty od początku. Test E2E sprawdza tylko widoczność.

Kroki (iPhone, Safari, po wdrożeniu — razem z krokiem 4.7):

1. Włącz VoiceOver (Ustawienia → Dostępność → VoiceOver).
2. Otwórz `/wizyta/os-czasu` na koncie, które ma co najmniej dwa leki.
3. Odznacz jeden lek w filtrze leków.
4. Posłuchaj, czy VoiceOver sam odczyta „Część leków jest ukryta.” bez przesuwania palcem do komunikatu.

- Data sprawdzenia: 17.10.2026 (autorka, iPhone, Safari).
- Wynik: komunikat nie jest odczytywany. Po odznaczeniu leku VoiceOver czyta tylko przycisk „Pokaż wszystkie”.
- Decyzja: zaparkowane (wersja demonstracyjna; PRD `## Non-Goals` — formalna zgodność ze standardami dostępności). Pozycja w `## Parked` roadmapy z wariantami powrotu.

### Kroki po merge'u (impl-review F9)

Kolejność ma znaczenie — oś czyta funkcję `symptom_timeline()` z migracji, więc przed krokiem 1 ekran na produkcji pokaże błąd ładowania mimo zielonego CI.

1. Po zielonym deployu uruchom `npx supabase db push` (migracja `20261017120000_symptom_timeline.sql`).
2. Sprawdź listę migracji (`npx supabase migration list`) i potwierdź, że ta migracja jest po stronie zdalnej.
3. Otwórz `/wizyta/os-czasu` na produkcji i potwierdź, że oś się ładuje.
4. Uzupełnij wyżej wynik limitu CPU (krok 4.7) i sprawdzenia VoiceOver (F3).

Wykonanie 17.10.2026: kroki 1–2 zrobione po deployu `aaeb4be` (migracja widoczna lokalnie i zdalnie); krok 3 — trasa odpowiada przekierowaniem 302 na logowanie, ekran po zalogowaniu sprawdza autorka; krok 4 — VoiceOver wpisany, limit CPU nie sprawdzony przed archiwizacją.

Uwaga na później: `scripts/timeline/render-bench.mjs` nie jest w CI, a zapas do progu 7 ms to ok. 1 ms (mediana 5,98 ms po poprawkach z przeglądu, 17.10.2026). Każda zmiana `TimelineView.astro` albo `TimelineChart.astro` wymaga ręcznego biegu pomiaru.
