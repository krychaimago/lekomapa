# Zwarte kolizje w szczegółach leku — Plan Brief

> Full plan: `context/changes/medication-interactions-compact/plan.md`

## What & Why

S-07 (#110, MS-04): szczegóły leku mają być czytelne także przy wielu możliwych kolizjach. Lek z grupy ibuprofenu może mieć 11 i więcej kart, a każda zajmuje ok. 7 linijek na telefonie, więc przegląd wymaga długiego przewijania.

## Starting Point

Karty kolizji są wpisane bezpośrednio w `src/pages/leki/[id].astro:373-402`. Każda pokazuje „z lekiem X” z linkiem, pełny opis pary (144–322 znaki) i notę. „Wizyta” (S-05) ma już zwijaną sekcję z tytułem z liczbą i nie jest częścią tej zmiany.

## Desired End State

Tytuł sekcji to „Możliwe interakcje (N)”. Każda karta jest zwinięta do „z lekiem X” z chevronem i notą pod spodem. Kliknięcie albo klawiatura pokazuje opis i link „Przejdź do leku X”. Karta zajmuje ok. 2 linijki zamiast 7, a nota jest widoczna przy każdej kolizji jak dotąd.

## Key Decisions Made

| Decision                                      | Choice                                        | Why (1 sentence)                                                            | Source |
| --------------------------------------------- | --------------------------------------------- | --------------------------------------------------------------------------- | ------ |
| Nota przy każdej kolizji                      | Zostaje; FR-007 bez zmian                     | Spójne z decyzją z S-05; skrót bierzemy z opisów, nie z noty.               | Plan   |
| Układ                                         | Każda karta zwijana, tytuł z liczbą           | Widać od razu, z którymi lekami są pary, opis po kliknięciu.                | Plan   |
| Stan po wejściu                               | Wszystkie zwinięte, także przy jednej kolizji | Jeden wygląd; żadna karta nie wyróżnia się (FR-012).                        | Plan   |
| „Wizyta”                                      | Bez zmian, bez wspólnego komponentu           | Najmniejszy zakres; przy lekarzu opisy lepiej widoczne od razu.             | Plan   |
| Link do drugiego leku                         | Z nagłówka do rozwiniętej części karty        | Link w `<summary>` to element klikalny w klikalnym; czytnik ekranu go gubi. | Plan   |
| Miejsce noty w znacznikach                    | Poza `<details>`, w karcie                    | Zwinięcie nie może schować noty (FR-007).                                   | Plan   |
| Grupowanie identycznych opisów, próg zwijania | Odrzucone                                     | Grupowanie pomaga rzadko; próg to druga stała i różny wygląd ekranu.        | Plan   |

## Scope

**In scope:**

- dwa nowe teksty w `src/lib/copy/interactions.ts` (tytuł z liczbą, link do drugiego leku),
- zwijane karty w `src/pages/leki/[id].astro`,
- test E2E w widoku telefonu: nota widoczna po zwinięciu, opis po rozwinięciu.

**Out of scope:**

- zmiana FR-007 i nota raz przy tytule,
- „Wizyta” i wspólny komponent,
- zwijanie całej sekcji,
- przesuwanie sekcji na ekranie,
- zmiana kolejności, danych lub bazy.

## Architecture / Approach

Wyłącznie znaczniki `.astro`, bez React i JavaScriptu: każda karta to `<li>` z `<details>` (nagłówek i chevron w `<summary>`, w środku opis i link) oraz notą jako rodzeństwem `<details>`. Wzorzec zwijania i chevronu jest wzięty z `src/pages/wizyta.astro:83-106`. Teksty z `INTERACTION_COPY`, liczba wstawiana przez `fill`, kolory z istniejących tokenów `interaction*`.

## Phases at a Glance

| Phase                                  | What it delivers                                  | Key risk                                    |
| -------------------------------------- | ------------------------------------------------- | ------------------------------------------- |
| 1. Zwinięte karty kolizji              | Karty zwinięte, tytuł z liczbą, nota przy każdej  | Nota trafi do wnętrza `<details>` i zniknie |
| 2. Test E2E — zwinięcie nie chowa noty | Spec w widoku telefonu, pada przy schowanej nocie | Dobór substancji obecnych w słowniku ulotki |

**Prerequisites:** lokalne Supabase dla E2E; S-05 zamknięte (bez zależności w kodzie).
**Estimated effort:** ok. 1 sesja na fazę 1, ok. 1 sesja na fazę 2.

## Open Risks & Assumptions

- Zakładamy, że link do drugiego leku po rozwinięciu karty wystarczy. Dziś jest od razu w nagłówku, więc przejście kosztuje jedno kliknięcie więcej.
- Dwa wyglądy karty kolizji (szczegóły zwinięte, „Wizyta” rozwinięta) mogą się rozjeżdżać przy kolejnych zmianach. Wspólny komponent jest możliwy później, bez przeróbki danych.
- S-10 (graf interakcji) może później przejąć część roli tej listy. S-07 na niego nie czeka.

## Success Criteria (Summary)

- Przy 11 kolizjach użytkowniczka przegląda listę na telefonie bez długiego przewijania i widzi, z którymi lekami są pary.
- Nota stoi przy każdej kolizji także po zwinięciu, a test E2E to pilnuje.
- „Wizyta”, pusty stan i kolejność kolizji bez zmian.
