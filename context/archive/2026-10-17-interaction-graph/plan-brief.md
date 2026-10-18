# Graf leków i możliwych interakcji — Plan Brief

> Full plan: `context/changes/interaction-graph/plan.md`

## What & Why

Pod listą bieżących leków na `/leki` pojawia się graf: leki jako punkty na nieregularnej „mapie”, delikatne linie między parami ze zbioru reguł, a po dotknięciu leku — podświetlone jego interakcje i ich opisy z notą. Ma pokazać cały zestaw leków jednym obrazem, bez porządkowania według podejrzenia (FR-012). Roadmapa S-10 (#113), MS-07; nowe FR-014.

## Starting Point

Funkcja bazy `medication_interactions()` już liczy pary bieżących leków z opisami, a `/leki` używa jej tylko do znacznika „Możliwa interakcja”. Oś czasu S-09 dała wzorzec: czysta funkcja z testami i SVG na kolorach z tokenów. Grafu nie ma w kodzie ani w PRD.

## Desired End State

Przy co najmniej dwóch bieżących lekach pod listą stoi graf jak na makiecie A2. Dotknięcie leku podświetla go na zielono, jego linie i partnerów na bursztynowo, a pod grafem pokazuje opisy z notą; inny lek przełącza wybór, ten sam odznacza. Lek zostaje na swoim miejscu, gdy inne leki dochodzą lub są odstawiane. „Wizyta” ma odnośnik do `/leki#graf`. Działa na telefonie i w trybie ciemnym.

## Key Decisions Made

| Decision      | Choice                                                                                             | Why (1 sentence)                                                                                                |
| ------------- | -------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Miejsce       | Pod listą na `/leki`, rozwinięty; odnośnik z „Wizyty” do `/leki#graf`                              | Ten sam zestaw leków co lista, bez nowej trasy; kotwica działa bez JS.                                          |
| Wygląd        | Makieta A2: nieregularna mapa, zakrzywione linie, punkty równej wielkości                          | Wybór autorki po pięciu makietach; równe punkty i stałe miejsca chronią FR-012.                                 |
| Linie         | Zawsze widoczne, delikatne; po dotknięciu podświetlone linie wybranego leku                        | Pełny obraz od startu, szczegół po dotknięciu.                                                                  |
| Dotknięcie    | Jeden lek naraz: inny lek przełącza, ten sam odznacza; opisy z notą pod grafem                     | Najprostsza obsługa; pełna lista interakcji leku bez przechodzenia do szczegółów.                               |
| Kolory        | Zielony: tylko wybór; delikatne linie neutralne; bursztyn: podświetlenie i partnerzy; tylko tokeny | Bursztyn = „Możliwa interakcja” jak na liście; zielona linia czytałaby się „ok” (dotyczy też linii startowych). |
| Skrajności    | 0–1 lek: zdanie zamiast grafu; wiele leków: graf rośnie w dół, bez limitu                          | Nazwy się nie nakładają, nic nie jest ukryte.                                                                   |
| Stałość mapy  | Lek trzyma miejsce; odstawiony zwalnia, nowy zajmuje wolne; liczone z historii, bez migracji       | Mapa „twoja” — lek tam, gdzie był wczoraj.                                                                      |
| Technika      | Graf renderowany na serwerze, React (`client:visible`) obsługuje wybór                             | Proste odznaczanie, klawiatura i czytnik ekranu; JS nie opóźnia listy.                                          |
| Ten sam obraz | Zawsze 3 kolumny; szerszy ekran = większy graf, nie inny układ                                     | Mapa na telefonie i komputerze wygląda tak samo.                                                                |

## Scope

**In scope:** FR-014 w PRD; czysta funkcja układu z testami (w tym niezależność położenia od interakcji); teksty z testem FR-012; komponent React; sekcja `#graf` na `/leki` z odczytem historii leków; odnośnik z „Wizyty”; E2E na 360 px; stan w galerii trybu ciemnego; pomiar LCP `/leki`.

**Out of scope:** osobna strona i menu; graf w szczegółach leku; układ siłowy; różne wielkości punktów i kolory według ważności; sprawdzanie wybranej pary; wybór wielu leków; przybliżanie; limit leków; leki zakończone na grafie; zapamiętywanie wyboru; migracja bazy.

## Architecture / Approach

`/leki` czyta (równolegle, pod RLS) bieżące leki, pary z `medication_interactions()` i historię leków konta → `buildInteractionGraph` (`src/lib/services/interaction-graph.ts`) odtwarza historię, przydziela pola siatki, liczy rozrzut i krzywe ze skrótu id, grupuje pary i opisy → `InteractionGraph.tsx` rysuje SVG i przyciski z nazwami, a po wjechaniu na ekran obsługuje wybór w stanie komponentu.

## Phases at a Glance

| Phase                            | What it delivers                                                  | Key risk                                                       |
| -------------------------------- | ----------------------------------------------------------------- | -------------------------------------------------------------- |
| 1. PRD i logika mapy             | FR-014, `buildInteractionGraph` z testami, teksty z testem FR-012 | Kolejność zdarzeń przy odtwarzaniu historii (stałość mapy)     |
| 2. Graf na liście leków          | Komponent, sekcja `#graf` na `/leki`, odnośnik z „Wizyty”         | Zgodność pozycji przycisków z SVG po skalowaniu; wygląd jak A2 |
| 3. Test przeglądarkowy i pomiary | E2E na 360 px, galeria trybu ciemnego, LCP `/leki`                | Dane E2E z parami ze zbioru; LCP przy 12 lekach                |

**Prerequisites:** S-09 zrobiona; lokalny Supabase do E2E (`.env` odsunięty — wskazuje produkcję).
**Estimated effort:** ~2–3 sesje po 4–5 h; faza 2 największa.

## Open Risks & Assumptions

- Po odstawieniu leku na mapie zostaje dziura do czasu dodania kolejnego; usunięcie leku dodanego przez pomyłkę może przesunąć mapę (tylko w oknie korekty).
- Przy kilkudziesięciu lekach graf na telefonie jest wysoki, a delikatnych linii dużo — panel pod grafem wymienia interakcje tekstem, więc nie trzeba śledzić linii.
- Bez JavaScriptu graf jest tylko obrazem (stan bez wyboru); opisy zostają w szczegółach leku i w „Wizycie”.

## Success Criteria (Summary)

- Użytkowniczka dotyka leku na grafie i widzi, z którymi lekami może wchodzić w interakcję, z opisem i notą, bez opuszczania listy.
- Położenie i wielkość leku nigdy nie zależą od jego interakcji, a lek zostaje na swoim miejscu między wizytami.
- Lista leków dalej mieści się w LCP 2,5 s na telefonie.
