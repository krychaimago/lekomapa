# Zamknięta lista objawów — Plan Brief

> Full plan: `context/changes/symptom-catalog-seed/plan.md`

## What & Why

Do bazy trafia katalog 34 objawów w ośmiu kategoriach układów, z potocznymi słowami wyszukiwania. Bez niego S-05 nie ma z czego zaznaczyć objawu we wpisie o samopoczuciu. Fundament F-03, issue #11.

## Starting Point

Treść listy jest gotowa w issue #3 (rozstrzygnięcie Q-2). Wzorzec tabel wspólnych tylko do odczytu istnieje z F-02: RLS z jedną polityką `SELECT`, odebrane prawa zapisu, sprawdzenia w `rls_checks.sql` i krok w `smoke.mjs`. Tabel katalogu objawów nie ma.

## Desired End State

Zalogowane konto czyta 34 objawy i ich słowa wyszukiwania, nie może niczego w nich zmienić, a bez sesji nic nie widzi. Lista w bazie to lista przejrzana i zatwierdzona przez autorkę. S-05 ma gotowe typy i polskie etykiety kategorii w `src/types.ts`.

## Key Decisions Made

| Decision                 | Choice                                                                   | Why (1 sentence)                                                             | Source          |
| ------------------------ | ------------------------------------------------------------------------ | ---------------------------------------------------------------------------- | --------------- |
| Identyfikator objawu     | Stały angielski `key`, np. `nausea`                                      | Polska nazwa będzie się zmieniać; kolejne migracje odwołują się do klucza.   | Plan            |
| Kategoria                | 8 angielskich wartości w bazie, polskie etykiety w `src/types.ts`        | Kod po angielsku; zmiana etykiety nie wymaga migracji.                       | Roadmapa + Plan |
| Kod źródłowy             | Dwie puste kolumny: `source_vocabulary` + `source_code`, obie albo żadna | Kod bez nazwy słownika jest niejednoznaczny.                                 | Roadmapa + Plan |
| Słowa wyszukiwania       | Zostają, w osobnej tabeli                                                | Autorka rozważyła rezygnację i wybrała zgodność z roadmapą i S-05.           | Plan            |
| Notatka własnymi słowami | Nigdzie nie mapowana                                                     | Już obowiązuje wg FR-008; plan tylko to potwierdza.                          | PRD             |
| Przegląd listy           | Bramka ręczna przed migracją z danymi                                    | Kolejność „od najczęstszych” i słownictwo ustala autorka, nie numer z issue. | Plan            |
| Seed                     | Migracja pisana ręcznie, bezpieczna przy ponownym uruchomieniu           | 34 wiersze nie uzasadniają generatora jak w F-02.                            | Plan            |

## Scope

**In scope:**

- Tabele `symptoms` i `symptom_search_terms` z RLS w tej samej migracji
- Typy i stała kategorii w `src/types.ts`
- CHECK 15–18 w `rls_checks.sql`, dwa wpisy w `smoke.mjs`
- Roboczy plik listy do przeglądu i migracja z danymi

**Out of scope:**

- UI wyboru objawu i wyszukiwarka (S-05)
- Słowa dopisywane przez użytkowniczkę w aplikacji
- Mapowanie notatki na objaw, pozycja „inny objaw”
- Wypełnianie kodu źródłowego (wersja 2)

## Architecture / Approach

Najpierw schemat z RLS i sprawdzeniami na pustych tabelach. Potem roboczy plik `symptom-list.md` z listą z issue #3, przegląd autorki, i dopiero z zatwierdzonej listy migracja z danymi, która wiąże słowa z objawem po `key`. Kolejność w kategorii chroniona ograniczeniem unikalności sprawdzanym przy zatwierdzeniu, żeby późniejsze przestawienie pozycji nie wymagało obejść.

## Phases at a Glance

| Phase                     | What it delivers                            | Key risk                                         |
| ------------------------- | ------------------------------------------- | ------------------------------------------------ |
| 1. Schemat katalogu z RLS | Dwie puste tabele, RLS, typy, CHECK 15–17   | Ograniczenie, które nie łapie tego, co deklaruje |
| 2. Przegląd listy i dane  | Zatwierdzona lista w bazie, CHECK 18, smoke | Rozjazd migracji z zatwierdzonym plikiem         |

**Prerequisites:** lokalne Supabase (Docker), dostęp do issue #3.
**Estimated effort:** ~2 sesje; przegląd listy ~10–30 min pracy autorki.

## Open Risks & Assumptions

- Lista za wąska: użytkowniczka nie znajdzie swojego objawu. Łagodzi to notatka (S-05) i doładowanie wierszy kolejną migracją.
- Migracja przepisuje plik ręcznie: CHECK 18 porównuje liczności, a autorka porównuje próbkę pozycji.

## Success Criteria (Summary)

- 34 objawy i ich słowa w bazie, zgodne z zatwierdzoną listą
- Zapis z aplikacji zablokowany, odczyt bez sesji pusty — potwierdzone sprawdzeniami SQL i smoke
- S-05 może zaplanować wybór objawu bez zmian w schemacie
