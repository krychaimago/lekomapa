# Czytelna „Wizyta” z listą bieżących leków — Plan Brief

> Full plan: `context/changes/visit-readable-with-current-meds/plan.md`
> Frame brief: `context/changes/visit-readable-with-current-meds/frame.md`

## What & Why

Przy rosnącej liczbie objawów „Wizyta” powtarza pod każdym pytaniem ten sam blok zdarzeń leków i pokazuje wszystkie pytania rozwinięte, więc ekran rośnie o ~10 linijek na objaw, z których większość już jest wyżej. Do tego brakuje jednego miejsca z bieżącymi lekami i dawkami (MS-11). Roadmapa S-05, issue #108, gwiazda przewodnia M-2.

## Starting Point

`src/pages/wizyta.astro` ma dwie sekcje: karty możliwych interakcji (nota przy każdej) i pytania do lekarza (wszystkie rozwinięte). Leki z okresami dawkowania i wariantem są już wczytywane dla pytań — lista nie wymaga nowego zapytania ani migracji.

## Desired End State

Od góry: **Bieżące leki** (alfabetycznie; nazwa, moc i postać, od kiedy bieżąca dawka, dawka) → **Możliwe interakcje (N)** — sekcja zwijana chevronem, domyślnie rozwinięta, nota pod tytułem widoczna także po zwinięciu → **Pytania do lekarza** — najnowszy objaw rozwinięty, reszta zwinięta do nagłówka.

## Key Decisions Made

| Decision                       | Choice                                                         | Why (1 sentence)                                                                  | Source |
| ------------------------------ | -------------------------------------------------------------- | --------------------------------------------------------------------------------- | ------ |
| Główne źródło długości         | Pytania, nie nota                                              | Codzienne wpisy nie dodają kart; rośnie liczba objawów (≤ 34).                    | Frame  |
| Nota przy każdej kolizji       | Zostaje; FR-007 bez zmian                                      | Świadoma decyzja z shape-notes i PRD, potwierdzona przez autorkę.                 | Frame  |
| Układ pytań                    | Najnowsze rozwinięte, reszta zwinięta                          | Ten sam wzorzec co w dzienniku; +1 linijka na objaw zamiast ~10.                  | Plan   |
| Paginacja / spis z odnośnikami | Odrzucone                                                      | Przełączanie stron przy lekarzu; spis nie skraca ekranu.                          | Plan   |
| Treść karty pytania            | Bez zmian                                                      | Pytanie mówi o lekach z czasu objawu, nie bieżących; karta wspólna z dziennikiem. | Plan   |
| Kolejność listy leków          | Alfabetycznie (pl)                                             | Zgodne z resztą ekranu; nigdy według kolizji (FR-012).                            | Plan   |
| Wiersz listy                   | Nazwa, moc i postać (gdy znane), od kiedy bieżąca dawka, dawka | „1 tabletka” bez mocy niewiele mówi; dane już są (lekcja: nie zawężaj danych).    | Plan   |
| Sekcja interakcji              | Cała zwijana chevronem, domyślnie rozwinięta                   | Można schować przy omawianiu pytań, nie przeoczyć po wejściu.                     | Plan   |
| Liczba w tytule                | „Możliwe interakcje (N)” + nota zawsze pod tytułem             | Liczba to informacja o kolizji — nota nie może być wtedy zwinięta.                | Plan   |
| Kolejność sekcji               | Leki → interakcje → pytania                                    | Interakcje i pytania mówią o tych lekach.                                         | Plan   |
| Szukanie objawu po dniu        | Poza zakresem                                                  | Należy do „Dziennika”, w `## Parked`.                                             | Frame  |

## Scope

**In scope:**

- zmiana FR-011 w PRD,
- funkcja listy bieżących leków + testy + nowe teksty,
- układ `/wizyta`: lista, zwijane interakcje z liczbą i notą, pytania zwinięte poza najnowszym,
- smoke, galeria trybu ciemnego, test E2E.

**Out of scope:**

- zmiana noty i FR-007, treści karty pytania, znacznika kart pytań,
- scalanie objawów, paginacja, spis z odnośnikami,
- zapamiętywanie stanu zwinięcia, szukanie po dniu, migracje.

## Architecture / Approach

Czysta funkcja `currentMedications` w `visit-summary.ts` (te same dane i ta sama reguła „bieżący” co interakcje), wiersz tekstu budowany jednym przebiegiem przez `fill`. `loadVisitSummary` dokłada pole do `VisitSummary`. Ekran tylko układa: `<details>` bez JavaScriptu, chevron SVG w kolorze tekstu.

## Phases at a Glance

| Phase               | What it delivers                                    | Key risk                                                |
| ------------------- | --------------------------------------------------- | ------------------------------------------------------- |
| 1. PRD i dane listy | FR-011 rozszerzone, funkcja listy z testami, teksty | Nowe teksty przez filtr FR-012; brzmienie do akceptacji |
| 2. Ekran „Wizyta”   | Nowy układ trzech sekcji                            | Nota przy zwiniętej sekcji; wąski ekran 320 px; LCP     |
| 3. Test E2E         | Test „wiele leków i objawów”                        | Dane testowe w lokalnym Supabase, sprzątanie            |

**Prerequisites:** lokalny Supabase i konto E2E (`context/foundation/test-stack.md`).
**Estimated effort:** ~3 sesje, po jednej na fazę.

## Open Risks & Assumptions

- Nota w `<summary>` wydłuża nazwę dostępną przycisku zwijania — akceptowane, nota ma być czytana razem z liczbą; sprawdzenie klawiaturą w fazie 2.
- Na ekranie dwa style znacznika zwijania (chevron sekcji, znacznik przeglądarki na kartach pytań) — świadomie, żeby nie ruszać dziennika.
- Zakładamy, że każdy lek ma co najmniej jeden okres dawkowania; funkcja i tak pomija lek bez okresu.

## Success Criteria (Summary)

- Przy 10 objawach i 6 parach „Wizyta” mieści pytania w jednolinijkowych nagłówkach poza najnowszym.
- Bieżące leki z dawkami widoczne raz, na górze.
- Liczba możliwych interakcji nigdy nie stoi bez noty, także po zwinięciu sekcji.
