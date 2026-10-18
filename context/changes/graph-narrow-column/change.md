---
change_id: graph-narrow-column
title: Graf leków w jednej kolumnie, gdy brakuje miejsca (#126)
status: implemented
created: 2026-10-18
updated: 2026-10-18
archived_at: null
---

## Notes

Issue #126: przyciski leków na grafie nachodzą na siebie przy ekranie węższym niż 360 px i przy powiększonym tekście.

Ustalenia z autorką (18.10.2026):

- Kierunek: trzeci układ grafu, włączany tylko przy braku miejsca. Dzisiejsze układy (telefon „C”, komputer „10”) zostają bez zmian.
- Wygląd: makieta `prototype/graf-luzny-uklad.html`, wersja 8 — jedna kolumna, nazwa obok punktu, pary rysowane łukami po lewej stronie punktów.
- Kolejność w kolumnie: alfabetycznie, tak jak kolejność przycisków przy klawiszu Tab. Przesądza: dodanie leku przesuwa wiersze poniżej; kolejność nadal nie zależy od interakcji (FR-012).
- Progi w jednostkach tekstu (rem), oba: kolumna poniżej ok. 294 px treści karty przy zwykłym tekście, układ komputera od 480 px przy zwykłym tekście (przy 125% od ok. 600 px). Komentarze z #128 do ponownej poprawki.
- Ryzyko czasu procesora (#127): pierwsza faza planu to pomiar `scripts/medications/graph-render-bench.mjs`. Przekroczenie progu 7 ms przy koncie 20 + 20 = stop i rozmowa z autorką przed dalszą pracą.
- Szerokość pasa łuków w kolumnie (sprawdzenie ręczne fazy 2, 18.10.2026): 5 rem (`GRAPH_COLUMN_GUTTER = 80`) zamiast 3,5 rem z planu — przy 3,5 rem łuki były spłaszczone. Wariant 2 z makiety `prototype/kolumna-szerokosc-pasa.html`. Przesądza: mniej miejsca na nazwę, dłuższe nazwy zawijają się do drugiej linii (zaakceptowane).

## Pomiar czasu procesora

`node scripts/medications/graph-render-bench.mjs` — mediana z 100 przebiegów (model grafu, render wyspy, serializacja). Przed: 18.10.2026, dwa układy. Po: 18.10.2026, faza 2 — trzy układy (z kolumną), dwa biegi.

| Konto (bieżące + zakończone) | Przed          | Po (bieg 1 / bieg 2)           | Próg 7 ms                   |
| ---------------------------- | -------------- | ------------------------------ | --------------------------- |
| 12 + 0                       | 1,61 ms        | 1,04 / 1,02 ms (HTML 31,5 KiB) | PASS                        |
| 20 + 20                      | 3,23 ms        | 3,44 / 3,33 ms (HTML 51,1 KiB) | PASS                        |
| 30 + 60                      | 9,88 ms (FAIL) | 9,01 / 8,68 ms (HTML 75,9 KiB) | FAIL — przyjęte ryzyko #127 |

- Kolumna dokłada mniej, niż wynosi rozrzut między biegami: przy 20 + 20 ok. 0,1–0,2 ms, przy 12 + 0 i 30 + 60 wynik po zmianie wyszedł niższy niż przed (szum maszyny, nie przyspieszenie).
- Konto 30 + 60 nadal przekracza próg — koszt to `replayHistory` (#127), nie kolumna.
