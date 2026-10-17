# Oś czasu leków i objawów — Plan Brief

> Full plan: `context/changes/medication-symptom-timeline/plan.md`

## What & Why

Strona `/wizyta/os-czasu` pokazuje okresy dawkowania wszystkich leków na jednej osi czasu, a pod nimi wpisy jednego objawu, który użytkowniczka sama wybierze. Ma pomóc zapytać lekarza „czy ten objaw może mieć związek z tym lekiem” — oś pokazuje wyłącznie daty, związek zostaje pytaniem do lekarza (FR-012). Roadmapa S-09 (#112), MS-03; to dodatek dla zainteresowanych, nie podstawowa funkcja.

## Starting Point

Aplikacja ma już wszystkie dane: okresy dawkowania czyta `loadQuestionMedications`, daty objawów — funkcja bazy `symptom_occurrences()` (bez nasilenia). Brak jakiegokolwiek wykresu i biblioteki wykresów; w PRD oś jest tylko kryterium drugorzędnym, bez FR.

## Desired End State

Z „Wizyty” (przy liście bieżących leków) albo z „Dziennika” użytkowniczka otwiera oś: widzi wszystkie leki jako paski z dawką w odcinkach, przełącza „90 dni / rok / całość”, wybiera z listy jeden objaw, może ukryć część leków (z widoczną informacją „Część leków jest ukryta.” i „Pokaż wszystkie”) i rozwija listę tekstową tych samych, przefiltrowanych danych. Działa na telefonie i w trybie ciemnym, bez JavaScriptu i bez nazw w adresie.

## Key Decisions Made

| Decision         | Choice                                                                                                      | Why (1 sentence)                                                           |
| ---------------- | ----------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Miejsce          | Osobna strona `/wizyta/os-czasu`, odnośniki z „Wizyty” i „Dziennika”                                        | Bez piątej zakładki (powód S-02), a oś jest widoczna tam, gdzie są dane.   |
| Rysowanie        | SVG na serwerze, bez biblioteki, z pomiarem przed scaleniem                                                 | Tryb ciemny przez tokeny, zero JS, S-10 narysuje graf tą samą techniką.    |
| Zakres           | 90 dni (domyślnie) / rok / całość, przełącznik na stronie                                                   | 90 dni = okno pytań do lekarza; bez przeładowania wybór nie ginie.         |
| Objaw            | Lista rozwijana, jeden objaw, na start żaden, alfabetycznie                                                 | Użytkowniczka sama decyduje, co ją niepokoi; jeden objaw = czytelny obraz. |
| Leki             | Wszystkie widoczne, zawężalne (wiele z wielu), ukrycie zawsze sygnalizowane                                 | Obraz pokazany lekarzowi nie może być niepełny bez ostrzeżenia.            |
| Kolejność leków  | Data rozpoczęcia, od najstarszego; remis alfabetycznie                                                      | Schodki pokazują, jak leki dochodziły; nigdy według kolizji (FR-012).      |
| Okresy           | Odcinki z wąską przerwą przy zmianie dawki, dawka w środku gdy się mieści                                   | Zmiana dawki widoczna bez znaczników, które podpowiadałyby związek.        |
| Znaczniki objawu | Telefon: kreski (wysokość = nasilenie); komputer przy 90 dniach: kropki (wypełnienie); 1 dzień = 1 znacznik | Kropki na telefonie zlewały się przy codziennych wpisach (makieta).        |
| Lista tekstowa   | Zwijana, tylko wybrane leki i wybrany objaw                                                                 | Dokładne daty bez celowania w znacznik; czytniki ekranu.                   |
| Po odświeżeniu   | Wybór wraca do startu                                                                                       | Zapamiętywanie kosztowałoby ciasteczko i trasę API.                        |

## Scope

**In scope:** FR-013 w PRD; funkcja bazy `symptom_timeline()` z sprawdzeniami SQL; czysta logika osi z testami i pomiarem czasu; pomiar renderu całej strony na ciężkim koncie przed merge'em; strona z wykresem, filtrami CSS, listą tekstową i pustymi stanami; teksty z testem FR-012; dwa odnośniki; test E2E na 360 px; stan w galerii trybu ciemnego; LCP i kontrola limitu CPU po wdrożeniu.

**Out of scope:** piąta zakładka; kropki objawów na paskach, pionowe linie od objawu, znaczniki zdarzeń z datą; kilka objawów naraz; zapamiętywanie wyboru; parametry w adresie; przybliżanie i biblioteka wykresów; notatki z wpisów; zmiana NFR o LCP; graf interakcji (S-10).

## Architecture / Approach

Moduł danych (`timeline-data.ts`) czyta leki i nową funkcję bazy pod RLS konta → czysta funkcja `buildTimeline` (`timeline.ts`) liczy dla trzech zakresów geometrię w ułamkach 0–1 → komponenty `.astro` rysują wiersze HTML z wąskim SVG w każdym (Astro ucieka nazwy). Strona renderuje wszystkie zakresy i wiersze naraz; jeden blok `<style>` z regułami `:has()` na identyfikatorach (uuid, nigdy nazwy) pokazuje wybraną kombinację.

## Phases at a Glance

| Phase            | What it delivers                                                          | Key risk                                                            |
| ---------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| 1. PRD i dane    | FR-013, `symptom_timeline()`, sprawdzenia SQL, moduł danych               | Parowanie nasilenia z datą w dwóch tablicach                        |
| 2. Logika osi    | `buildTimeline` z testami, pomiar czasu (próg 2 ms)                       | Dzień polskiego czasu przy wpisach koło północy                     |
| 3. Ekran         | Strona, wykres, filtry CSS, teksty, odnośniki, pomiar renderu (próg 5 ms) | Specyficzność CSS ukrywania wierszy; render 6× pracy jednego widoku |
| 4. E2E i pomiary | Test na 360 px, galeria, LCP na ciężkim koncie, limit CPU po wdrożeniu    | Różnica Node ↔ workerd w pomiarze renderu                           |

**Prerequisites:** S-05 zrobiona; lokalny Supabase do `db:check` i E2E (`.env` odsunięty — wskazuje produkcję).
**Estimated effort:** ~3–4 sesje po 4–5 h; faza 3 największa.

## Open Risks & Assumptions

- Trzy zakresy w dwóch układach i wszystkie objawy renderowane naraz to ok. 6× pracy serwera; pomiar renderu przed merge'em, a przekroczenie progu to nowa decyzja autorki przed wdrożeniem.
- Filtry wymagają `:has()` — obsługiwane przez aktualne przeglądarki; starsza przeglądarka pokaże wszystkie wiersze (dane dalej prawdziwe, tylko bez filtra).
- Po merge'u trzeba wykonać `npx supabase db push`, inaczej oś na produkcji pokaże błąd ładowania.

## Success Criteria (Summary)

- Użytkowniczka otwiera oś z „Wizyty” lub „Dziennika”, wybiera objaw i widzi jego wpisy pod okresami dawkowania swoich leków, bez sugestii związku.
- Ukrycie leków jest zawsze widoczne i odwracalne jednym przyciskiem; lista tekstowa zgadza się z wykresem.
- Strona mieści się w LCP 2,5 s na telefonie i nie przekracza limitu CPU na produkcji.
