---
project: lekomapa
version: 1
status: draft
created: 2026-09-21
updated: 2026-09-22
prd_version: 1
main_goal: speed
top_blocker: skills
milestone_id: mvp-material-na-wizyte
milestone_seq: 1
milestone_status: open
---

# Roadmap: lekomapa

> Wyprowadzona z `context/foundation/prd.md` (v1), `tech-stack.md`, bloku `## Forward: technical-roadmap` z `shape-notes.md` oraz sprawdzonego baseline'u repozytorium.
> Edytowana w miejscu; archiwizowana, gdy przestanie obowiązywać.
> Pozycje poniżej są ułożone w kolejności zależności. Tabela „W skrócie" jest indeksem.
> Realizacja prowadzona jest w GitHub Issues (`krychaimago/lekomapa`, milestone `M-1: MVP — od leku do materiału na wizytę`); numery issue przy pozycjach, w tabeli „Backlog Handoff" i przy otwartych pytaniach. Roadmapa pozostaje źródłem prawdy o zakresie kamienia milowego.

## Milestone

**M-1: MVP — od leku do materiału na wizytę** — Status: open

- **Intent:** Użytkowniczka prowadzi w produkcie pełny zestaw leków z historią okresów dawkowania, zapisuje objawy i przed wizytą otwiera jedno miejsce z możliwymi kolizjami oraz gotowymi pytaniami do lekarza. Kamień milowy jest zakresowany wynikiem, nie datą.
- **Source materials:** `context/foundation/prd.md` (v1)
- **Done when:** każda pozycja F-NN i S-NN poniżej ma status `done`.
- **Scope anchors:** FR-001…FR-012 (wszystkie must-have), US-01…US-04, `## Non-Functional Requirements` w części dotyczącej izolacji danych per-konto i bezpowrotnego usunięcia konta.

## Vision recap

Użytkowniczka przyjmuje kilka leków przepisanych przez różnych lekarzy i żaden z nich nie widzi pełnego zestawu. Produkt zbiera substancje czynne, okresy dawkowania i wpisy o samopoczuciu, a na wyjściu daje dwie rzeczy: oznaczenie możliwej kolizji przy leku oraz złożone pytanie do zadania lekarzowi. Momentem odbioru wartości jest wizyta — możliwość powiedzenia „biorę X, Y, Z, od dwóch tygodni mam objaw A, zbiega się to w czasie z Y" zamiast „coś mi nie służy". Produkt nigdy nie stwierdza przyczyny objawu i nigdy nie sugeruje zmiany leczenia.

## North star

**S-02: użytkowniczka dodaje lek po nazwie handlowej i widzi przy nim znacznik możliwej kolizji** — to pierwsze Kryterium sukcesu w PRD i jedyny przepływ, który uruchamia regułę kolizji od danych po komunikat; przy celu `speed` wszystko inne ma sens dopiero wtedy, gdy ten przepływ działa.

> Gwiazda przewodnia (north star) to tutaj najmniejszy przepływ od końca do końca, którego dowiezienie dowodzi, że główna hipoteza produktu się trzyma — dlatego stoi tak wcześnie, jak pozwalają jego wymagania wstępne.

## At a glance

| ID   | Change ID                            | Outcome (użytkowniczka może …)                                                  | Prerequisites | PRD refs                              | Status   |
| ---- | ------------------------------------ | ------------------------------------------------------------------------------- | ------------- | ------------------------------------- | -------- |
| F-01 | medication-schema-rls                | (fundament) schemat leków i okresów dawkowania z RLS i ścieżką weryfikacji      | —             | FR-003, FR-004, NFR izolacji          | done     |
| F-02 | interaction-rules-seed               | (fundament) pary kolizji na grupach ATC i rejestr leków dostarczone z produktem | —             | FR-003, FR-006                        | ready    |
| F-03 | symptom-catalog-seed                 | (fundament) katalog 34 objawów w 8 kategoriach ze słowami wyszukiwania          | —             | FR-008                                | ready    |
| S-01 | terms-acceptance-on-signup           | założyć konto, świadomie akceptując warunki korzystania                         | —             | FR-001, FR-002                        | ready    |
| S-02 | add-medication-with-interaction-flag | dodać lek po nazwie handlowej i zobaczyć znacznik możliwej kolizji              | F-01, F-02    | US-01, FR-003, FR-006, FR-007, FR-012 | proposed |
| S-03 | dosage-period-history                | zmienić dawkowanie tak, że stary okres się zamyka, a nowy otwiera               | S-02          | US-04, FR-004                         | proposed |
| S-04 | discontinue-medication               | zakończyć przyjmowanie leku z datą odstawienia                                  | S-02          | FR-005                                | proposed |
| S-05 | symptom-journal-entry                | zapisać wpis o samopoczuciu z datą, godziną i objawami z listy                  | F-01, F-03    | US-02, FR-008                         | proposed |
| S-06 | symptom-question-composer            | zobaczyć po zapisaniu objawu gotowe pytanie do lekarza                          | S-03, S-05    | US-02, FR-010, FR-012                 | proposed |
| S-07 | journal-correction-window            | poprawić wpis dzienniczka w oknie korekty                                       | S-05          | FR-009                                | blocked  |
| S-08 | doctor-visit-summary                 | otworzyć sekcję „Do omówienia z lekarzem" przed wizytą                          | S-02, S-06    | US-03, FR-011, FR-012                 | proposed |
| S-09 | account-deletion-cascade             | usunąć konto tak, że wszystkie powiązane dane znikają bezpowrotnie              | S-02, S-05    | FR-001, NFR usunięcia konta           | proposed |

## Streams

Pomoc nawigacyjna — grupuje pozycje dzielące łańcuch wymagań wstępnych. Kolejność obowiązująca nadal żyje w grafie zależności poniżej; ta tabela to proponowana kolejność czytania między równoległymi ścieżkami.

| Stream | Theme               | Chain                                      | Note                                                                                                      |
| ------ | ------------------- | ------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| A      | Leki i kolizje      | `F-01` → `F-02` → `S-02` → `S-03` → `S-04` | Ścieżka gwiazdy przewodniej; przy celu `speed` ma pierwszeństwo. `F-01` i `F-02` są wzajemnie niezależne. |
| B      | Dzienniczek objawów | `F-03` → `S-05` → `S-07`                   | Startuje równolegle do A, bo dzieli z nią tylko konwencję migracji z `F-01`.                              |
| C      | Materiał na wizytę  | `S-06` → `S-08`                            | Dołącza do A przy `S-03` i do B przy `S-05`; niczego nie liczy od nowa, składa gotowe treści.             |
| D      | Cykl życia konta    | `S-01` → `S-09`                            | Bez wymagań wstępnych na starcie; `S-09` dołącza do A przy `S-02` i do B przy `S-05`.                     |

## Baseline

Co jest już w repozytorium na dzień `2026-09-21` (sprawdzone w kodzie, potwierdzone przez autorkę). Fundamenty poniżej zakładają, że to istnieje, i tego nie budują od nowa.

- **Frontend:** present — Astro 5 w pełnym SSR, React tylko dla formularzy, Tailwind 4, shadcn/ui (`src/layouts/Layout.astro`, `src/components/ui/`).
- **Backend / API:** partial — trasy API istnieją wyłącznie dla auth (`src/pages/api/auth/signin.ts`, `signup.ts`, `signout.ts`); brak tras domenowych, zod jeszcze niezainstalowany.
- **Data:** partial — klient Supabase SSR wpięty (`src/lib/supabase.ts`), `supabase/config.toml` jest; brak `supabase/migrations/`, brak tabel, brak `src/types.ts`.
- **Auth:** present — `@supabase/ssr`, sesje w ciasteczkach, `src/middleware.ts` z `PROTECTED_ROUTES`, strony `src/pages/auth/*`. Pokrywa rejestrację, logowanie i odzyskiwanie dostępu.
- **Deploy / infra:** present — Cloudflare Workers przez `wrangler.jsonc`, `.github/workflows/ci.yml` z bramkami lint/typy/build oraz testem dymnym, auto-deploy po merge do `main`.
- **Observability:** absent — brak loggera, śledzenia błędów i metryk. Świadomie odłożone (patrz `## Parked`), bo progi liczbowe pozostają nierozstrzygnięte.

## Foundations

### F-01: Schemat leków i okresów dawkowania z RLS

- **Outcome:** (fundament) istnieje pierwsza migracja z tabelami leku i okresu dawkowania, RLS włączone w tej samej migracji z politykami per-operacja i per-rola, typy encji w `src/types.ts`, oraz sprawdzona ścieżka weryfikacji izolacji — drugie konto nie widzi cudzych wierszy.
- **Change ID:** `medication-schema-rls`
- **Issue:** #9
- **PRD refs:** FR-003, FR-004, `## Non-Functional Requirements` (izolacja danych per-konto), `## Access Control` (płaski model, jedno konto = jedna osoba)
- **Unlocks:** S-02 (gwiazda przewodnia), S-05 — a także konwencję migracji i RLS, z której korzysta każda późniejsza tabela; ścieżka weryfikacji izolacji jest tu ustalana raz dla całego produktu.
- **Prerequisites:** —
- **Parallel with:** F-02, F-03, S-01
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Główne ryzyko kamienia milowego to `skills`, a migracje i RLS są warstwą jeszcze niepisaną samodzielnie — stąd fundament jawny, a nie migracja przemycona w plasterku. Zakres zamknięty na leki i okresy dawkowania: tabele dzienniczka powstają dopiero w S-05, razem z pierwszym ekranem, który ich potrzebuje. Realne zagrożenie: RLS odłożone „na później" — wtedy przy jednym koncie testowym nic nie ujawni wycieku.
- **Status:** done

### F-02: Pary kolizji na grupach ATC i rejestr leków

- **Outcome:** (fundament) dane dostarczone razem z produktem są w bazie: około 20 par kolizji zapisanych na poziomie grup ATC oraz rejestr leków — nazwy handlowe ze składem i kodami ATC, przepisane z Rejestru Produktów Leczniczych i zawężone do wybranych grup. Oba zbiory wspólne dla produktu i tylko do odczytu dla użytkownika.
- **Change ID:** `interaction-rules-seed`
- **Issue:** #10
- **PRD refs:** FR-003, FR-006, `## Business Logic` (zbiór reguł plus rejestr leków), `## Access Control` (brak roli administratora reguł)
- **Unlocks:** S-02 — bez rejestru leków nie ma czego wpisać przy dodawaniu leku, a bez par kolizji nie ma czego oznaczyć.
- **Prerequisites:** —
- **Parallel with:** F-01, F-03, S-01
- **Blockers:** —
- **Unknowns:** — (Q-1 rozstrzygnięte 2026-09-21, issue #2)
- **Risk:** Zbieranie par to praca poza kodem, wliczona w budżet czasu, nieusuwalna i niezlecalna agentowi — to dane zdrowotne, każda para wymaga sprawdzenia przy ulotce albo charakterystyce produktu leczniczego. Drugie ryzyko to jakość danych rejestru: nazwa leku bywa zlepiona z dawką i opakowaniem, substancje zapisywane niejednolicie. Dlatego pierwszym krokiem jest pobranie próbki i zmierzenie, jak te dane wyglądają, zanim powstanie migracja. Zbiór reguł jest z założenia niepełny — konsekwencją jest bariera z PRD mówiąca wprost, że brak ostrzeżenia nie oznacza bezpieczeństwa; ta bariera jest częścią S-02, nie tego fundamentu.
- **Wymogi projektowe:** pary trzymane na kodach ATC, nie na tekstowych nazwach substancji. Przy leku zapisywany pełny skład, także substancje spoza wybranych grup. Zawężenie rejestru jest filtrem przy wczytywaniu, nigdy flagą na leku — inaczej późniejsze rozszerzenie na pełny rejestr wymaga przeliczenia wszystkiego zamiast doładowania wierszy. Każda para z polami źródła i daty sprawdzenia. RLS w tej samej migracji: polityka `SELECT` dla roli zalogowanej, brak polityk zapisu.
- **Status:** ready

### F-03: Zamknięta lista objawów

- **Outcome:** (fundament) katalog objawów jest w bazie: 34 pozycje w ośmiu kategoriach układów, każda z potocznymi określeniami użytymi jako słowa wyszukiwania i z kolumną na kod źródłowy, pustą w tej wersji. Zbiór wspólny dla produktu i tylko do odczytu dla użytkownika.
- **Change ID:** `symptom-catalog-seed`
- **Issue:** #11
- **PRD refs:** FR-008, `## Business Logic` (katalog objawów jako trzeci zbiór dostarczony z produktem), `## Access Control` (brak roli edytującej zbiory wspólne)
- **Unlocks:** S-05 — bez listy nie ma z czego zaznaczyć objawu we wpisie dzienniczka.
- **Prerequisites:** —
- **Parallel with:** F-01, F-02, S-01
- **Blockers:** —
- **Unknowns:** — (Q-2 rozstrzygnięte 2026-09-21, issue #3)
- **Risk:** Lista za wąska sprawi, że użytkowniczka nie znajdzie tego, co faktycznie czuje. PRD łagodzi to notatką własnymi słowami, która nie uczestniczy w regule — ale notatka jest częścią S-05, więc sama lista musi trafić w typowe objawy przyjmowanych leków. Osiem kategorii i 34 pozycje to ryzyko zmniejszają, ale otwierają drugie: przy tej długości płaska lista na telefonie jest nie do przewinięcia, więc grupowanie i wyszukiwanie po słowach potocznych przestają być udogodnieniem i stają się warunkiem użyteczności — to wymóg dla S-05, nie dla tego fundamentu. Trzecie ryzyko: nazwy pozycji powstają bez źródła referencyjnego i będą dopracowywane w użyciu, więc niczego nie wolno wiązać z polską nazwą jako identyfikatorem.
- **Wymogi projektowe:** nazwa polska, kategoria układu (osiem stałych wartości zapisanych przy wierszu, bez osobnej tabeli słownikowej), pole porządkujące do wyświetlania w kolejności od najczęstszych, kolumna na kod źródłowy dopuszczająca pustą wartość. Słowa wyszukiwania w osobnej tabeli powiązanej, nie jako tekst z przecinkami — po nich idzie główna droga wyboru w S-05. Kod źródłowy zostaje pusty w tej wersji, ale kolumna powstaje od pierwszej migracji: zaparkowany zbiór działań niepożądanych będzie się łączył po niej, nie po polskiej nazwie. Zawężenie zbioru stosowane jako filtr przy wczytywaniu, nigdy jako flaga w bazie — rozszerzenie listy to doładowanie wierszy. RLS w tej samej migracji: polityka `SELECT` dla roli zalogowanej, brak polityk zapisu. Typy encji w `src/types.ts`.
- **Status:** ready

## Slices

### S-01: Konto z akceptacją warunków korzystania

- **Outcome:** Użytkowniczka może założyć konto, świadomie akceptując warunki korzystania, i zalogować się loginem i hasłem, z działającą ścieżką odzyskiwania dostępu.
- **Change ID:** `terms-acceptance-on-signup`
- **Issue:** #12
- **PRD refs:** FR-001, FR-002, `## Access Control` (zapis daty i wersji zaakceptowanego dokumentu)
- **Prerequisites:** —
- **Parallel with:** F-01, F-02, F-03
- **Blockers:** —
- **Unknowns:**
  - Jak brzmi treść warunków korzystania? Rola, moment akceptacji i sens komunikatu są ustalone, sama treść nie. — Owner: użytkowniczka. Block: no — mechanizm i wersjonowanie dają się zaplanować przy treści zastępczej. Issue: #8.
- **Risk:** Rejestracja, logowanie i odzyskiwanie dostępu są w baseline'ie obecne, więc plasterek jest wąski: dokłada akceptację warunków z zapisem daty i wersji dokumentu. Zagrożenie odwrotne do zwykłego — pisanie warstwy auth od zera zamiast oparcia się na tym, co starter już niesie.
- **Status:** ready

### S-02: Dodanie leku po nazwie handlowej ze znacznikiem możliwej kolizji

- **Outcome:** Użytkowniczka może dodać przyjmowany preparat, wpisując jego nazwę handlową i podając dawkowanie z datą rozpoczęcia; przy nowo dodanej pozycji widzi dyskretny znacznik możliwej kolizji, a w szczegółach leku pełną treść informacji wraz ze składem preparatu. Preparat spoza rejestru dodaje, wskazując substancję czynną z ulotki, i uczestniczy w regułach tak samo.
- **Change ID:** `add-medication-with-interaction-flag`
- **Issue:** #13
- **PRD refs:** US-01, FR-003, FR-006, FR-007, FR-012
- **Prerequisites:** F-01, F-02
- **Parallel with:** S-01, S-05
- **Blockers:** —
- **Unknowns:** —
- **Risk:** To gwiazda przewodnia i jedyne miejsce, w którym produkt mógłby wyrządzić szkodę. Język komunikatu podlega sprawdzeniu, nie jest wytyczną: „może wchodzić w interakcję", nigdy zakaz łączenia, nigdy porządkowanie leków według stopnia podejrzenia, stała nota o charakterze poglądowym przy każdej informacji. Brak znacznika nie może wyglądać jak potwierdzenie bezpieczeństwa. Sekwencjonowane najwcześniej, jak pozwalają wymagania wstępne, bo cała reszta roadmapy zakłada zapisane leki.
- **Status:** proposed

### S-03: Zmiana dawkowania zamyka okres i otwiera nowy

- **Outcome:** Użytkowniczka może zmienić dawkowanie leku, przez co bieżący okres dawkowania zostaje zamknięty, a nowy otwarty; lek zostaje jedną pozycją na liście z historią okresów od–do.
- **Change ID:** `dosage-period-history`
- **Issue:** #14
- **PRD refs:** US-04, FR-004
- **Prerequisites:** S-02
- **Parallel with:** S-04, S-05
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Rdzeń produktu. Nadpisanie okresu zamiast zamknięcia go sprawia, że wcześniejsze zestawienia objawów przestają być prawdziwe, a błąd wychodzi dopiero przy S-06, gdy złożone pytanie zacznie mówić nieprawdę. Substancja czynna zostaje niemodyfikowalna — jej zmiana to zakończenie leku i dodanie nowego, nie zmiana dawkowania.
- **Status:** proposed

### S-04: Zakończenie przyjmowania leku z datą odstawienia

- **Outcome:** Użytkowniczka może zakończyć przyjmowanie leku z datą odstawienia — lek znika z listy aktualnych, ale zostaje w historii i nadal tłumaczy dawne wpisy; trwałe usunięcie pozycji zarezerwowane dla pozycji dodanych przez pomyłkę.
- **Change ID:** `discontinue-medication`
- **Issue:** #15
- **PRD refs:** FR-005
- **Prerequisites:** S-02
- **Parallel with:** S-03, S-05
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Pokusa zrobienia zwykłego usuwania, bo jest prostsze. Usunięcie kasuje kontekst dla wcześniejszych objawów i psuje S-06 tak samo jak nadpisanie okresu w S-03. Dwie ścieżki muszą być tu rozdzielone w interfejsie, żeby odstawienie nie wyglądało jak kasowanie.
- **Status:** proposed

### S-05: Wpis o samopoczuciu z datą, godziną i objawami

- **Outcome:** Użytkowniczka może dodać wpis o samopoczuciu z datą i godziną wypełnionymi domyślnie na moment zapisu i możliwymi do cofnięcia, zaznaczając jeden lub więcej objawów z zamkniętej listy, opcjonalnie podając nasilenie i własną notatkę.
- **Change ID:** `symptom-journal-entry`
- **Issue:** #16
- **PRD refs:** US-02, FR-008
- **Prerequisites:** F-01, F-03
- **Parallel with:** S-02, S-03, S-04
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Wpisy powstają głównie na telefonie i często wieczorem o porannym objawie — zła godzina fałszowałaby zbieżność z okresem dawkowania w S-06, więc możliwość cofnięcia czasu jest wymogiem, nie udogodnieniem. Notatka własnymi słowami nie uczestniczy w regule; wciągnięcie jej do reguły byłoby zmianą zakresu.
- **Wymogi projektowe:** katalog z F-03 liczy 34 pozycje, więc lista jest grupowana po ośmiu kategoriach układów, a wyszukiwanie po słowach potocznych jest główną drogą wyboru, nie udogodnieniem. Płaski scroll całego katalogu jest niedopuszczalny. Objaw nieujęty w katalogu użytkowniczka zapisuje w notatce — pozycji „inny objaw" na liście nie ma (Q-2, issue #3).
- **Dług przejęty z F-01:** migracja tego plasterka musi podmienić treść `public.medication_correction_window_open()` na sprawdzenie, czy dla danego leku istnieje wpis objawu po dacie rozpoczęcia. W F-01 funkcja jest zaślepką zwracającą `true`, więc wszystkie wyzwalacze niemodyfikowalności historii — na `medications`, `medication_substances` i `dosage_periods` — są do tego czasu bezczynne. Dopóki podmiana nie nastąpi, gwarancja „rdzeń wpisu niemodyfikowalny poza oknem korekty" nie obowiązuje, mimo że sprawdzenia w `supabase/tests/rls_checks.sql` przechodzą (podmieniają funkcję u siebie).
- **Status:** proposed

### S-06: Złożone pytanie do lekarza po zapisaniu objawu

- **Outcome:** Użytkowniczka po zapisaniu objawu widzi gotowe pytanie do lekarza, zestawiające ten objaw z okresami dawkowania przyjmowanych leków, z pierwszeństwem dla leków rozpoczętych lub zmienionych w oknie czasowym poprzedzającym objaw; pozostałe leki zostają dostępne pod zwinięciem.
- **Change ID:** `symptom-question-composer`
- **Issue:** #17
- **PRD refs:** US-02, FR-010, FR-012
- **Prerequisites:** S-03, S-05
- **Parallel with:** S-07
- **Blockers:** —
- **Unknowns:**
  - Jak długie jest okno czasowe poprzedzające objaw? Przyjęto roboczo około 30 dni, wartość do potwierdzenia. — Owner: użytkowniczka. Block: no — wartość robocza wystarcza do zaplanowania i jest nastawialna. Issue: #5.
- **Risk:** Drugie miejsce, w którym produkt mógłby wyrządzić szkodę. Wynikiem ma być zdanie do rozmowy z lekarzem, nie lista podejrzanych leków ani ocena ryzyka. Zestawienie trafiające zawsze przestaje cokolwiek znaczyć — okno czasowe oparte na okresach dawkowania z S-03 usuwa większość szumu, dlatego S-03 jest wymaganiem wstępnym, a nie równoległym plasterkiem.
- **Status:** proposed

### S-07: Okno korekty wpisu dzienniczka

- **Outcome:** Użytkowniczka może poprawić wpis dzienniczka w oknie korekty; po jego zamknięciu rdzeń wpisu — data, godzina, objawy, nasilenie — jest niemodyfikowalny, a edytowalna zostaje notatka. Usunięcie wpisu zarezerwowane dla pozycji dodanych przez pomyłkę.
- **Change ID:** `journal-correction-window`
- **Issue:** #18
- **PRD refs:** FR-009
- **Prerequisites:** S-05
- **Parallel with:** S-06, S-08
- **Blockers:** —
- **Unknowns:**
  - Jak długo trwa okno korekty wpisu dzienniczka? Zasada jest przesądzona i wspólna z lekami, nieustalona pozostaje sama miara. Przy leku warunek jest zdarzeniowy, przy wpisie dzienniczka musi być czasowy, bo wpis zasila złożone pytanie natychmiast. — Owner: użytkowniczka. Block: yes. Issue: #4.
- **Risk:** Swobodna edycja po fakcie daje obraz ładniejszy niż prawdziwy, a dzienniczek jest wart tyle, ile jego kompletność. Bez rozstrzygnięcia miary okna nie da się zaplanować, gdzie rdzeń wpisu przestaje być modyfikowalny — stąd status `blocked`, a nie zgadywana wartość.
- **Status:** blocked

### S-08: Sekcja „Do omówienia z lekarzem"

- **Outcome:** Użytkowniczka może przed wizytą otworzyć sekcję „Do omówienia z lekarzem" i zobaczyć w jednym miejscu wykryte możliwe kolizje oraz złożone pytania o zbieżność objawów z okresami dawkowania.
- **Change ID:** `doctor-visit-summary`
- **Issue:** #19
- **PRD refs:** US-03, FR-011, FR-012
- **Prerequisites:** S-02, S-06
- **Parallel with:** S-07, S-09
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Sekcja nie wylicza niczego ponad to, co powstało w S-02 i S-06 — zbiera gotowe treści. Przeliczanie czegokolwiek od nowa rozjechałoby ją z treściami widocznymi przy lekach. To jednocześnie moment odbioru wartości całego produktu, więc język informacyjny musi się tu utrzymać bez wyjątku.
- **Status:** proposed

### S-09: Usunięcie konta kasuje wszystkie dane

- **Outcome:** Użytkowniczka może usunąć konto, co bezpowrotnie kasuje wszystkie powiązane dane — leki, okresy dawkowania, wpisy o samopoczuciu i złożone pytania — bez kopii zachowanej „na wszelki wypadek".
- **Change ID:** `account-deletion-cascade`
- **Issue:** #20
- **PRD refs:** FR-001, `## Non-Functional Requirements` (bezpowrotne skasowanie danych po usunięciu konta)
- **Prerequisites:** S-02, S-05
- **Parallel with:** S-06, S-07, S-08
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Operacja nieodwracalna, a zakres kasowania rośnie z każdą nową tabelą — dlatego sekwencjonowana po tym, jak powstały wszystkie tabele rdzenia (S-02 dla leków i okresów, S-05 dla dzienniczka). Zaplanowana wcześniej przeoczyłaby dane dodane później i zostawiła sieroty, czego samo przejście ścieżki nie ujawni.
- **Status:** proposed

## Backlog Handoff

| Roadmap ID | Change ID                              | Suggested issue title                                   | Ready for `/10x-plan` | Notes                                          | Issue |
| ---------- | -------------------------------------- | ------------------------------------------------------- | --------------------- | ---------------------------------------------- | ----- |
| F-01       | `medication-schema-rls`                | Schemat leków i okresów dawkowania z RLS                | yes                   | Uruchom `/10x-plan medication-schema-rls`      | #9    |
| F-02       | `interaction-rules-seed`               | Pary kolizji na grupach ATC i rejestr leków             | yes                   | Uruchom `/10x-plan interaction-rules-seed`     | #10   |
| F-03       | `symptom-catalog-seed`                 | Zamknięta lista objawów ze słowami wyszukiwania         | yes                   | Uruchom `/10x-plan symptom-catalog-seed`       | #11   |
| S-01       | `terms-acceptance-on-signup`           | Akceptacja warunków korzystania przy zakładaniu konta   | yes                   | Uruchom `/10x-plan terms-acceptance-on-signup` | #12   |
| S-02       | `add-medication-with-interaction-flag` | Dodanie leku po nazwie handlowej ze znacznikiem kolizji | no                    | Wymaga F-01 i F-02                             | #13   |
| S-03       | `dosage-period-history`                | Zmiana dawkowania zamyka okres i otwiera nowy           | no                    | Wymaga S-02                                    | #14   |
| S-04       | `discontinue-medication`               | Zakończenie przyjmowania leku z datą odstawienia        | no                    | Wymaga S-02                                    | #15   |
| S-05       | `symptom-journal-entry`                | Wpis o samopoczuciu z datą, godziną i objawami          | no                    | Wymaga F-01 i F-03                             | #16   |
| S-06       | `symptom-question-composer`            | Złożone pytanie do lekarza po zapisaniu objawu          | no                    | Wymaga S-03 i S-05                             | #17   |
| S-07       | `journal-correction-window`            | Okno korekty wpisu dzienniczka                          | no                    | Czeka na miarę okna korekty                    | #18   |
| S-08       | `doctor-visit-summary`                 | Sekcja „Do omówienia z lekarzem"                        | no                    | Wymaga S-02 i S-06                             | #19   |
| S-09       | `account-deletion-cascade`             | Usunięcie konta kasuje wszystkie powiązane dane         | no                    | Wymaga S-02 i S-05                             | #20   |

## Open Roadmap Questions

1. (#4) **Jak długo trwa okno korekty wpisu dzienniczka?** — Owner: użytkowniczka. Block: S-07.
2. (#5) **Jak długie jest okno czasowe poprzedzające objaw (około 30 dni roboczo)?** — Owner: użytkowniczka. Block: nie blokuje planowania S-06; wartość do potwierdzenia przed wdrożeniem.
3. (#6) **Jakie mierzalne progi obowiązują dla czasu odpowiedzi i dostępności?** — Owner: użytkowniczka. Block: roadmap-wide w tym sensie, że bez progów nie da się zakresować obserwowalności (patrz `## Parked`).
4. (#7) **Czy kryteria akceptacji historii US-01…US-04 zostały zaakceptowane?** — Owner: użytkowniczka. Block: nie blokuje sekwencji; kryteria wymagają przeglądu, zanim posłużą za podstawę testów.
5. (#8) **Jak brzmi treść warunków korzystania?** — Owner: użytkowniczka. Block: nie blokuje planowania S-01; treść potrzebna przed wdrożeniem.

Rozstrzygnięte:

- (#2) ~~**Ile par substancji czynnych i z jakiego źródła trafia do zbioru reguł?**~~ — 2026-09-21: około 20 par na grupach ATC (10–14 grup, wynikowo ~40 substancji), zbierane ręcznie z ulotek i charakterystyk produktów leczniczych. Nazwy handlowe i skład z Rejestru Produktów Leczniczych, zawężonego do wybranych grup. Użytkownik wpisuje nazwę handlową; lek spoza rejestru dodawany przez wskazanie substancji z ulotki. Odblokowało F-02, a przez nie S-02, S-03, S-04, S-08, S-09.
- (#3) ~~**Ile pozycji liczy zamknięta lista objawów i skąd pochodzi?**~~ — 2026-09-21: 34 pozycje w ośmiu kategoriach układów, dobrane jako objawy zauważalne przez pacjenta i opisane w ulotkach jako bardzo częste i częste. Źródłem jest zbiór ustalony w sesji rozstrzygania, nie obchód ulotek ani słownik kodowany — katalog nie jest wejściem reguły, bo zestawianie objawu z lekami idzie wyłącznie po osi czasu. Przy pozycji potoczne określenia jako słowa wyszukiwania oraz kolumna na kod źródłowy, pusta w M-1. Objaw nieujęty w katalogu zostaje w notatce własnymi słowami. Odblokowało F-03, a przez nie S-05, S-06, S-07, S-08, S-09.

## Parked

- **Eksport własnych danych z aplikacji** — Why parked: uznany za potrzebny, świadomie odłożony poza pierwszą wersję (`shape-notes.md`, `## Forward: technical-roadmap`).
- **Oś czasu: objawy i leki zestawione wizualnie lub jako raport** — Why parked: Kryterium sukcesu drugorzędne, a cel sekwencjonowania to `speed`; struktura okresów dawkowania z S-03 jest pod to gotowa.
- **Integracja z zewnętrzną bazą interakcji** — Why parked: PRD `## Non-Goals`; reguły pochodzą wyłącznie ze zbioru dostarczonego z produktem.
- **Przypomnienia o przyjęciu dawki** — Why parked: PRD `## Non-Goals`; produkt służy rozumieniu zestawu leków, nie pilnowaniu rutyny.
- **Zdalne udostępnianie danych lekarzowi** — Why parked: PRD `## Non-Goals`; sekcja na wizytę jest do pokazania na ekranie.
- **Reguła niedoborów mikro- i makroskładników** — Why parked: PRD `## Non-Goals`; przeniesiona do wersji drugiej.
- **Zbiór znanych działań niepożądanych przypisanych substancjom** — Why parked: PRD wymieniał go jako drugi zbiór reguł dostarczony z produktem, ale zestawianie objawu z lekami (FR-010, S-06) działa wyłącznie na osi czasu — porównuje datę objawu z okresami dawkowania. Nic w M-1 tego zbioru nie czyta. Rozstrzygnięte 2026-09-21 razem z Q-1 (#2); PRD poprawione.
- **Odświeżanie rejestru leków** — Why parked: rejestr wgrywany raz razem z produktem i starzejący się. Aktualizacja wymagałaby procesu, którego M-1 nie potrzebuje; lek spoza rejestru ma ścieżkę zapasową przez wskazanie substancji z ulotki.
- **Rozszerzenie rejestru na wszystkie leki** — Why parked: M-1 wgrywa wyłącznie leki z wybranych grup ATC. Rozszerzenie to wyłączenie filtra przy wczytywaniu, bez zmiany schematu — ale wymaga osobnej decyzji o tym, jak komunikować lek znaleziony w rejestrze i pozostający poza zakresem reguł, bo pozycja bez znacznika wygląda wtedy jak sprawdzona.
- **Interfejs dodawania kilku substancji czynnych w jednym preparacie** — Why parked: PRD `## Non-Goals`; struktura danych gotowa od MVP, interfejs później.
- **Działanie bez połączenia z siecią** — Why parked: PRD `## Non-Goals` niefunkcjonalne.
- **Formalna zgodność ze standardami dostępności** — Why parked: PRD `## Non-Goals`; czytelność na telefonie tak, certyfikowana dostępność nie w tej wersji.
- **Wiele profilów w jednym koncie** — Why parked: PRD `## Non-Goals`; jedno konto to jedna osoba.
- **Obserwowalność: logger, śledzenie błędów, metryki** — Why parked: baseline zgłasza `absent`, a PRD nie ma mierzalnych progów czasu odpowiedzi i dostępności (Otwarte pytanie 5). Przy celu `speed` fundament bez progu do spełnienia byłby zgadywaniem zakresu.

## Milestone History

(Pusta — M-1 jest pierwszym kamieniem milowym.)

## Done

(Pusta przy pierwszym wygenerowaniu. `/10x-archive` dopisuje tu wpis i przestawia status pozycji na `done`, gdy zarchiwizowana zmiana ma pasujący Change ID.)

- **F-01: (fundament) schemat leków i okresów dawkowania z RLS i ścieżką weryfikacji** — Archived 2026-09-22 → `context/archive/2026-09-22-medication-schema-rls/`. Lesson: —.
