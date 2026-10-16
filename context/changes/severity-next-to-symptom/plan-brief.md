# Nasilenie przy samym objawie — Plan Brief

> Full plan: `context/changes/severity-next-to-symptom/plan.md`
> Research: `context/changes/severity-next-to-symptom/research.md`

## What & Why

Na telefonie przyciski nasilenia stoją nad wyszukiwarką i listą 34 objawów — po zaznaczeniu objawu z końca listy są ok. 2 tys. px wyżej, poza ekranem. Użytkowniczka zapisuje wpis bez nasilenia albo nie wie, że może je podać. S-06 (#109), MS-06, FR-008.

## Starting Point

Jeden komponent `SymptomPicker.tsx` na ekranie nowego wpisu i poprawy wpisu. Górny blok „Wybrane objawy” z przyciskami powstał celowo (F5): wyszukiwanie chowa niepasujący zaznaczony objaw, a nasilenie miało zostać osiągalne.

## Desired End State

Kategorie objawów zwinięte chevronem, z licznikiem wybranych. Zaznaczony objaw ma przyciski nasilenia pod sobą. Wyszukiwanie pokazuje zaznaczone objawy na początku wyników. Na dole, przed notatką, krótkie podsumowanie „Wybrane objawy” (nazwa · nasilenie, ✕). Szkic: https://claude.ai/artifact/L5jhQNDmyiGkNTUUEox8Ex

## Key Decisions Made

| Decision                 | Choice                                                      | Why (1 sentence)                                                 | Source               |
| ------------------------ | ----------------------------------------------------------- | ---------------------------------------------------------------- | -------------------- |
| Miejsce nasilenia        | Pod zaznaczonym objawem                                     | Przyciski są tam, gdzie palec                                    | Plan                 |
| Lista wybranych          | Na dole jako podsumowanie przed zapisem                     | Przegląd zostaje, a nic nie przesuwa listy pod palcem            | Plan                 |
| Kategorie                | Zwijane chevronem, na start zwinięte, licznik przy nagłówku | Widok był nieczytelny; lista mieści się na 1–2 ekranach telefonu | Plan                 |
| Wyszukiwanie             | Zaznaczone na początku wyników, z przyciskami               | Zostaje gwarancja F5 bez górnego bloku                           | Research (F5) / Plan |
| Test telefonu            | Szerokość 390 px w samym pliku testu                        | Jeden nowy plik, konfiguracja bez zmian                          | Research / Plan      |
| C4                       | Osobny tekst „(opcjonalne)” dla notatki                     | Kilka linijek w zmienianych plikach                              | Research / Plan      |
| Kolor / kreski nasilenia | Poza zakresem                                               | Dotyka listy wpisów i „Wizyty”; czerwień zakazana przy objawach  | Plan                 |
| Zwijanie                 | Przycisk z `aria-expanded` + `hidden`, bez nowej biblioteki | Stan potrzebny i tak przez wyszukiwanie; brak komponentu w `ui/` | Plan                 |

## Scope

**In scope:**

- `searchSymptoms` i `selectedCountLabel` w `journal.ts` z testami
- przebudowa `SymptomPicker`, nowe teksty, poprawka C4
- wspólny krok `pickSymptom` i naprawa dwóch testów E2E
- test E2E na telefonie, stan w galerii trybu ciemnego, reguła w `CLAUDE.md`

**Out of scope:**

- baza, API, FR-008
- kolory i kreski nasilenia
- zapamiętywanie zwinięcia
- przenoszenie komunikatu błędu formularza
- projekt „telefon” w Playwright

## Architecture / Approach

Logika (przypinanie, odmiana licznika) jako czyste funkcje w `src/lib/services/journal.ts`, testowane `node --test`. Widok zostaje jednym komponentem React z tym samym kontraktem props, więc oba ekrany dostają zmianę bez dotykania stanu gospodarzy. Testy E2E zaznaczają objaw przez wyszukiwarkę, niezależnie od zwinięcia.

## Phases at a Glance

| Phase                                        | What it delivers                               | Key risk                                                           |
| -------------------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------ |
| 1. Logika wyszukiwania i licznika            | `searchSymptoms`, `selectedCountLabel`, testy  | Odmiana 12–14 i kolejność przypiętych                              |
| 2. Widok wyboru objawów                      | Nowy układ, C4, naprawione testy E2E           | Nasilenie wewnątrz `<label>` zmieni nazwę pola i wywróci selektory |
| 3. Stany, bramka wizualna, test na telefonie | Test 390 px, galeria, reguła, statusy zarzutów | Bieg E2E przeciw produkcji zamiast lokalnemu Supabase              |

**Prerequisites:** lokalny Supabase, `.env.e2e`, `npx astro sync` po świeżym klonie.
**Estimated effort:** ~2–3 sesje w 3 fazach.

## Open Risks & Assumptions

- Zwinięte grupy wymagają wiedzy, w której kategorii jest objaw — wyszukiwarka zostaje drogą zapasową.
- Zakładamy, że po hydratacji układ nie skacze (lista renderowana serwerowo w stanie zwiniętym).

## Success Criteria (Summary)

- Na telefonie po zaznaczeniu „spadek libido” przyciski nasilenia są widoczne bez przewijania i nasilenie się zapisuje.
- Podczas wyszukiwania nasilenie zaznaczonego objawu da się zmienić.
- Przed zapisem widać w jednym miejscu wszystkie wybrane objawy z nasileniem.
