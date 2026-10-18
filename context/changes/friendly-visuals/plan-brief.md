# S-08 Ekrany, które nie są puste — Plan Brief

> Full plan: `context/changes/friendly-visuals/plan.md`
> Research: `context/changes/friendly-visuals/research.md`

## What & Why

Puste ekrany i notatka w dzienniczku to dziś białe karty z samym tekstem. S-08 (issue #111, MS-10) daje im wygląd **F · Karteczki** — papierowa karteczka z paskiem taśmy i lekkim obrotem — wybrany przez autorkę 18.10.2026 na makietach. Ten sam wygląd trafia na lewą stronę ekranów logowania, bo tylko F był spójny we wszystkich widokach.

## Starting Point

Trzy puste stany (`/leki`, `/dzienniczek`, wstęp `/wizyta`) powtarzają ten sam blok karty bez wspólnego komponentu. Notatka we wpisie to zwykły akapit. Rozkładówka `AuthSpreadLayout.astro` pokazuje trzy zdania listą na pasie bocznym, wspólna dla 6 ekranów wejściowych.

## Desired End State

Puste stany leków, dzienniczka i Wizyty, notatka we wpisie oraz lewa strona wszystkich 6 ekranów rozkładówki wyglądają jak plansze F, w trybie jasnym i ciemnym. Na pustej Wizycie oba przyciski są pełne. Karteczka to jeden komponent `PaperNote.astro`, a reguła w `CLAUDE.md` każe go używać.

## Key Decisions Made

| Decision                | Choice                               | Why (1 sentence)                                               | Source               |
| ----------------------- | ------------------------------------ | -------------------------------------------------------------- | -------------------- |
| Kierunek wizualny       | F · Karteczki wszędzie, z logowaniem | Jedyny spójny we wszystkich widokach; nie otwierać na nowo     | Research (change.md) |
| Źródło ilustracji       | Kształty CSS, bez obrazków i SVG     | Zamyka pytanie o licencję — brak zasobów zewnętrznych          | Research             |
| Kolory                  | Istniejące tokeny, cień `shadow-md`  | Makiety mapują się na tokeny; `rgba` odrzuca bramka            | Research / Plan      |
| Zasięg rozkładówki      | Wszystkie 6 ekranów                  | Jeden układ, jeden wygląd, najmniej kodu                       | Plan                 |
| Przyciski pustej Wizyty | Oba pełne                            | Zgodnie z zaakceptowaną makietą                                | Plan                 |
| Inne puste stany        | Poza zakresem                        | Każdy wymaga własnej makiety; ryzyko rozrostu z roadmapy       | Plan                 |
| Komponent               | Jeden `PaperNote.astro` z wariantami | Pięć powierzchni bez kopiowania klas; bez stanu, więc `.astro` | Plan                 |

## Scope

**In scope:**

- Komponent `src/components/PaperNote.astro`
- Pusty stan `/leki`, `/dzienniczek`, wstęp `/wizyta`
- Notatka w karcie wpisu na `/dzienniczek`
- Lewa strona `AuthSpreadLayout.astro` (6 ekranów)
- Reguła w `CLAUDE.md`, notki w `design-draft.md` i roadmapie

**Out of scope:**

- `/leki/zakonczone`, oś czasu, puste sekcje Wizyty, `/leki/[id]` bez kolizji
- Pole notatki w formularzach wpisu
- Ekrany odzyskiwania hasła
- Nowe tokeny, nowe teksty, animacje, wykresy (S-09, S-10)

## Architecture / Approach

Bezstanowy komponent `.astro` z propsami: papier (`card`/`accent`), taśma (`accent-border`/`sidebar-border`, środek albo lewy róg), obrót do ±3°, linie zeszytu, tylna kartka. Dekoracja `aria-hidden`. Strony podmieniają swoje bloki na złożenia tego komponentu; teksty i warunki renderowania bez zmian.

## Phases at a Glance

| Phase                                       | What it delivers                                                               | Key risk                                                                           |
| ------------------------------------------- | ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------- |
| 1. Karteczki we wnętrzu                     | `PaperNote` + puste stany leków, dzienniczka, Wizyty + notatka we wpisie       | Akcentowa karteczka słabo widoczna w trybie ciemnym; struktura `li[data-entry-id]` |
| 2. Karteczki na rozkładówce i zapis decyzji | 3 zdania i nagłówek na karteczkach na 6 ekranach; reguła i notki w dokumentach | Formularz rozjechany na którymś z 6 ekranów                                        |

**Prerequisites:** S-03 i S-05 zrobione; lokalny Supabase do E2E.
**Estimated effort:** ok. 2 sesje, po jednej na fazę.

## Open Risks & Assumptions

- Widoczności karteczki na ciemnym tle nie sprawdza żaden test — tylko oko autorki (ręczne kryteria 1.7, 2.6).
- Etykieta „Notatka:” zostaje wyciszona tylko, jeśli para kontrastu przejdzie 7 : 1; inaczej zmienia kolor na `accent-foreground`.

## Success Criteria (Summary)

- Pusty ekran i notatka wyglądają jak zaakceptowane plansze F w obu trybach, na komputerze i telefonie.
- Bramki `npm test`, lint, typecheck, build i istniejące E2E zielone.
- Kolejny agent znajduje w `CLAUDE.md`, że karteczka = `PaperNote.astro`.
