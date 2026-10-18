# Graf leków w jednej kolumnie — Plan Brief

> Full plan: `context/changes/graph-narrow-column/plan.md`

## What & Why

Issue #126: na telefonie węższym niż 360 px i przy powiększonym tekście przyciski leków na grafie nachodzą na siebie, więc łatwo dotknąć niewłaściwego leku. Dodajemy trzeci układ grafu — jedną kolumnę leków z łukami par — który włącza się tylko wtedy, gdy brakuje miejsca.

## Starting Point

Graf ma dwa układy (telefon „C” i komputer „10”), które skalują się z szerokością karty, podczas gdy przycisk ma stałą wysokość w px. Progi przełączania są w pikselach, więc nie widzą powiększonego tekstu.

## Desired End State

Przy wąskim ekranie albo dużym tekście graf pokazuje kolumnę: leki alfabetycznie, punkt przy nazwie, pary jako łuki po lewej. Przy zwykłym tekście na telefonie ≥ 360 px i na komputerze nikt nie widzi zmiany. Żadne przyciski nie nachodzą na siebie przy 320 / 360 px i tekście 100–150%.

## Key Decisions Made

| Decision             | Choice                                             | Why (1 sentence)                                                         | Source                               |
| -------------------- | -------------------------------------------------- | ------------------------------------------------------------------------ | ------------------------------------ |
| Kierunek             | Trzeci układ tylko przy braku miejsca              | Dzisiejsze punkty obecnych użytkowniczek się nie przesuwają              | Rozmowa 18.10.2026                   |
| Wygląd               | Wersja 8 makiety: kolumna z łukami po lewej        | Najczytelniejsza przy dużym tekście                                      | Makieta                              |
| Kolejność w kolumnie | Alfabetycznie                                      | Kolejność Tab = kolejność na ekranie, bez dziur po zakończonych lekach   | Rozmowa                              |
| Progi                | Oba w rem: kolumna < 18,375 rem, komputer ≥ 30 rem | Przy zwykłym tekście te same px co dziś, przy dużym tekście rosną z nim  | Rozmowa                              |
| Wiersze              | Równe, na nazwę w dwóch liniach                    | Łuki trafiają w punkty bez JS i mierzenia tekstu; nazwa nie jest ucinana | Plan                                 |
| Wielkość nazwy       | 14 px (`text-sm`)                                  | Układ jest dla osób, które powiększają tekst                             | Plan (makieta poprawiona 18.10.2026) |
| Ryzyko CPU (#127)    | Pomiar jako bramka fazy 2                          | Przekroczenie 7 ms przy 12 + 0 albo 20 + 20 zatrzymuje pracę             | Rozmowa                              |

## Scope

**In scope:**

- Trzeci układ w serwisie grafu i jego testy jednostkowe
- Trzecia scena w komponencie, progi w rem
- Pomiar czasu procesora przed i po
- Test E2E przy 320 px i tekście 125%, nowe brzmienie komentarzy o progach

**Out of scope:**

- Zmiany układów „C” i „10” i przyspieszenie odtwarzania historii (#127)
- Mierzenie tekstu w przeglądarce, ucinanie nazw
- Rozplątywanie łuków przy wielu parach
- Nowe teksty w UI

## Architecture / Approach

Kolumna ma własne jednostki: 1 jednostka = 1/16 rem. Wiersz 48 jednostek (3 rem), pas łuków 56 (3,5 rem). Serwis liczy punkty (i-ty lek w i-tym wierszu) i łuki wyginane w lewo. Komponent rysuje SVG i wiersze-przyciski w rem, więc całość rośnie razem z tekstem w tej samej proporcji. Kolumna nie korzysta z historii ani szukania miejsca — to najtańszy z trzech układów.

## Phases at a Glance

| Phase                                 | What it delivers                       | Key risk                                           |
| ------------------------------------- | -------------------------------------- | -------------------------------------------------- |
| 1. Układ kolumny w serwisie           | Trzeci układ w modelu, testy kontraktu | Kontrakt łuków niejasny dla testu                  |
| 2. Kolumna w komponencie, progi w rem | Widoczna kolumna, pomiar CPU           | Pomiar > 7 ms; kolejność wariantów container query |
| 3. Testy E2E i komentarze             | Ochrona przed regresem 320 px / 125%   | Próg w rem nie odróżniony od px w teście           |

**Prerequisites:** PR #131 zamknięty jako zastąpiony przed fazą 1; lokalny Supabase do E2E.
**Estimated effort:** ok. 1–1,5 sesji, 3 fazy.

## Open Risks & Assumptions

- Render trzeciej sceny dokłada czas procesora; konto 30 + 60 już dziś przekracza próg (#127).
- Tailwind 4 musi ułożyć warianty `@min-[18.375rem]` i `@min-[30rem]` we właściwej kolejności — potwierdza to test E2E.
- Przy wielu parach łuki nachodzą na siebie (przesądzone w makiecie).

## Success Criteria (Summary)

- Na telefonie 320 px i przy powiększonym tekście żaden przycisk leku nie nachodzi na inny.
- Przy zwykłym tekście na telefonie ≥ 360 px i na komputerze graf wygląda jak przed zmianą.
- Mediana pomiaru dla kont 12 + 0 i 20 + 20 ≤ 7 ms.
