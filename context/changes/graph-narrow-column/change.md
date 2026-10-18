---
change_id: graph-narrow-column
title: Graf leków w jednej kolumnie, gdy brakuje miejsca (#126)
status: implementing
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
