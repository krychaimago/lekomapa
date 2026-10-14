# Pomiar szybkości F-06

Próg z PRD: LCP ≤ 2,5 s.

## Warunki

- Data: 14.10.2026, wieczorem (przed 20:35 CEST).
- Wersja wdrożenia: `e545acb` (merge PR #102, 13.10.2026).
- Produkcja `https://lekomapa.pl`, zalogowane konto z danymi przykładowymi.
- Chrome DevTools → Lighthouse, tryb Mobile, kategoria Performance, okno incognito.
- Po 3 pomiary na ekran; zapisana mediana.

## Wyniki

| Ekran               | Pomiar 1 | Pomiar 2 | Pomiar 3 | Mediana LCP |
| ------------------- | -------- | -------- | -------- | ----------- |
| `/leki`             | 0,9 s    | 0,9 s    | 0,8 s    | **0,9 s**   |
| `/dzienniczek/nowy` | 1,0 s    | 1,0 s    | 1,0 s    | **1,0 s**   |

## Wniosek

Oba ekrany mieszczą się w progu 2,5 s z dużym zapasem. Brak przekroczenia, więc roadmapa nie dostaje nowej pozycji (krok 6.3 bez zmian w `roadmap.md`).
