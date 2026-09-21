---
project: lekomapa
version: 1
status: draft
created: 2026-09-21
updated: 2026-09-21
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

**S-02: użytkowniczka dodaje lek ze słownika i widzi przy nim znacznik możliwej kolizji** — to pierwsze Kryterium sukcesu w PRD i jedyny przepływ, który uruchamia regułę kolizji od danych po komunikat; przy celu `speed` wszystko inne ma sens dopiero wtedy, gdy ten przepływ działa.

> Gwiazda przewodnia (north star) to tutaj najmniejszy przepływ od końca do końca, którego dowiezienie dowodzi, że główna hipoteza produktu się trzyma — dlatego stoi tak wcześnie, jak pozwalają jego wymagania wstępne.

## At a glance

| ID   | Change ID                            | Outcome (użytkowniczka może …)                                                 | Prerequisites | PRD refs                              | Status   |
| ---- | ------------------------------------ | ------------------------------------------------------------------------------ | ------------- | ------------------------------------- | -------- |
| F-01 | medication-schema-rls                | (fundament) schemat leków i okresów dawkowania z RLS i ścieżką weryfikacji     | —             | FR-003, FR-004, NFR izolacji          | ready    |
| F-02 | interaction-rules-seed               | (fundament) słownik substancji czynnych i pary kolizji dostarczone z produktem | —             | FR-003, FR-006                        | blocked  |
| F-03 | symptom-catalog-seed                 | (fundament) zamknięta lista objawów ze słowami wyszukiwania                    | —             | FR-008                                | blocked  |
| S-01 | terms-acceptance-on-signup           | założyć konto, świadomie akceptując warunki korzystania                        | —             | FR-001, FR-002                        | ready    |
| S-02 | add-medication-with-interaction-flag | dodać lek ze słownika i zobaczyć znacznik możliwej kolizji                     | F-01, F-02    | US-01, FR-003, FR-006, FR-007, FR-012 | proposed |
| S-03 | dosage-period-history                | zmienić dawkowanie tak, że stary okres się zamyka, a nowy otwiera              | S-02          | US-04, FR-004                         | proposed |
| S-04 | discontinue-medication               | zakończyć przyjmowanie leku z datą odstawienia                                 | S-02          | FR-005                                | proposed |
| S-05 | symptom-journal-entry                | zapisać wpis o samopoczuciu z datą, godziną i objawami z listy                 | F-01, F-03    | US-02, FR-008                         | proposed |
| S-06 | symptom-question-composer            | zobaczyć po zapisaniu objawu gotowe pytanie do lekarza                         | S-03, S-05    | US-02, FR-010, FR-012                 | proposed |
| S-07 | journal-correction-window            | poprawić wpis dzienniczka w oknie korekty                                      | S-05          | FR-009                                | blocked  |
| S-08 | doctor-visit-summary                 | otworzyć sekcję „Do omówienia z lekarzem" przed wizytą                         | S-02, S-06    | US-03, FR-011, FR-012                 | proposed |
| S-09 | account-deletion-cascade             | usunąć konto tak, że wszystkie powiązane dane znikają bezpowrotnie             | S-02, S-05    | FR-001, NFR usunięcia konta           | proposed |

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
- **Status:** ready

### F-02: Słownik substancji czynnych i pary kolizji

- **Outcome:** (fundament) zbiór reguł dostarczony razem z produktem jest w bazie: słownik substancji czynnych do wyboru przy dodawaniu leku oraz pary substancji oddziałujących negatywnie, wspólne dla produktu i tylko do odczytu dla użytkownika.
- **Change ID:** `interaction-rules-seed`
- **Issue:** #10
- **PRD refs:** FR-003, FR-006, `## Business Logic` (dwa zbiory reguł dostarczone z produktem), `## Access Control` (brak roli administratora reguł)
- **Unlocks:** S-02 — bez słownika nie ma czego wybrać przy dodawaniu leku, a bez par kolizji nie ma czego oznaczyć.
- **Prerequisites:** —
- **Parallel with:** F-01, F-03, S-01
- **Blockers:** —
- **Unknowns:**
  - Ile par substancji czynnych trafia do zbioru i z jakiego źródła zostaną przepisane? — Owner: użytkowniczka. Block: yes. Issue: #2.
- **Risk:** To praca poza kodem, wliczona w budżet czasu, i jedyna rzecz blokująca gwiazdę przewodnią. Zbiór jest z założenia niepełny — konsekwencją jest bariera z PRD mówiąca wprost, że brak ostrzeżenia nie oznacza bezpieczeństwa; ta bariera jest częścią S-02, nie tego fundamentu.
- **Status:** blocked

### F-03: Zamknięta lista objawów

- **Outcome:** (fundament) zamknięta lista objawów jest w bazie wraz z potocznymi określeniami użytymi jako słowa wyszukiwania przy pozycjach listy.
- **Change ID:** `symptom-catalog-seed`
- **Issue:** #11
- **PRD refs:** FR-008, `## Business Logic` (znane działania niepożądane przypisane substancjom)
- **Unlocks:** S-05 — bez listy nie ma z czego zaznaczyć objawu we wpisie dzienniczka.
- **Prerequisites:** —
- **Parallel with:** F-01, F-02, S-01
- **Blockers:** —
- **Unknowns:**
  - Ile pozycji liczy lista objawów i skąd pochodzi? Przyjęto rząd 15–20 wraz z potocznymi określeniami, konkretna lista nieustalona. — Owner: użytkowniczka. Block: yes. Issue: #3.
- **Risk:** Lista za wąska sprawi, że użytkowniczka nie znajdzie tego, co faktycznie czuje. PRD łagodzi to notatką własnymi słowami, która nie uczestniczy w regule — ale notatka jest częścią S-05, więc sama lista musi trafić w typowe objawy przyjmowanych leków.
- **Status:** blocked

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

### S-02: Dodanie leku ze słownika ze znacznikiem możliwej kolizji

- **Outcome:** Użytkowniczka może dodać przyjmowany preparat, wybierając substancję czynną ze słownika i podając dawkowanie z datą rozpoczęcia, a przy nowo dodanej pozycji widzi dyskretny znacznik możliwej kolizji z pełną treścią w szczegółach leku.
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

| Roadmap ID | Change ID                              | Suggested issue title                                    | Ready for `/10x-plan` | Notes                                          | Issue |
| ---------- | -------------------------------------- | -------------------------------------------------------- | --------------------- | ---------------------------------------------- | ----- |
| F-01       | `medication-schema-rls`                | Schemat leków i okresów dawkowania z RLS                 | yes                   | Uruchom `/10x-plan medication-schema-rls`      | #9    |
| F-02       | `interaction-rules-seed`               | Słownik substancji czynnych i pary kolizji               | no                    | Czeka na zbiór par i jego źródło               | #10   |
| F-03       | `symptom-catalog-seed`                 | Zamknięta lista objawów ze słowami wyszukiwania          | no                    | Czeka na konkretną listę objawów               | #11   |
| S-01       | `terms-acceptance-on-signup`           | Akceptacja warunków korzystania przy zakładaniu konta    | yes                   | Uruchom `/10x-plan terms-acceptance-on-signup` | #12   |
| S-02       | `add-medication-with-interaction-flag` | Dodanie leku ze słownika ze znacznikiem możliwej kolizji | no                    | Wymaga F-01 i F-02                             | #13   |
| S-03       | `dosage-period-history`                | Zmiana dawkowania zamyka okres i otwiera nowy            | no                    | Wymaga S-02                                    | #14   |
| S-04       | `discontinue-medication`               | Zakończenie przyjmowania leku z datą odstawienia         | no                    | Wymaga S-02                                    | #15   |
| S-05       | `symptom-journal-entry`                | Wpis o samopoczuciu z datą, godziną i objawami           | no                    | Wymaga F-01 i F-03                             | #16   |
| S-06       | `symptom-question-composer`            | Złożone pytanie do lekarza po zapisaniu objawu           | no                    | Wymaga S-03 i S-05                             | #17   |
| S-07       | `journal-correction-window`            | Okno korekty wpisu dzienniczka                           | no                    | Czeka na miarę okna korekty                    | #18   |
| S-08       | `doctor-visit-summary`                 | Sekcja „Do omówienia z lekarzem"                         | no                    | Wymaga S-02 i S-06                             | #19   |
| S-09       | `account-deletion-cascade`             | Usunięcie konta kasuje wszystkie powiązane dane          | no                    | Wymaga S-02 i S-05                             | #20   |

## Open Roadmap Questions

1. (#2) **Ile par substancji czynnych i z jakiego źródła trafia do zbioru reguł?** — Owner: użytkowniczka. Block: F-02, a przez nie S-02 (gwiazda przewodnia), S-03, S-04, S-08, S-09.
2. (#3) **Ile pozycji liczy zamknięta lista objawów i skąd pochodzi?** — Owner: użytkowniczka. Block: F-03, a przez nie S-05, S-06, S-07, S-08, S-09.
3. (#4) **Jak długo trwa okno korekty wpisu dzienniczka?** — Owner: użytkowniczka. Block: S-07.
4. (#5) **Jak długie jest okno czasowe poprzedzające objaw (około 30 dni roboczo)?** — Owner: użytkowniczka. Block: nie blokuje planowania S-06; wartość do potwierdzenia przed wdrożeniem.
5. (#6) **Jakie mierzalne progi obowiązują dla czasu odpowiedzi i dostępności?** — Owner: użytkowniczka. Block: roadmap-wide w tym sensie, że bez progów nie da się zakresować obserwowalności (patrz `## Parked`).
6. (#7) **Czy kryteria akceptacji historii US-01…US-04 zostały zaakceptowane?** — Owner: użytkowniczka. Block: nie blokuje sekwencji; kryteria wymagają przeglądu, zanim posłużą za podstawę testów.
7. (#8) **Jak brzmi treść warunków korzystania?** — Owner: użytkowniczka. Block: nie blokuje planowania S-01; treść potrzebna przed wdrożeniem.

## Parked

- **Eksport własnych danych z aplikacji** — Why parked: uznany za potrzebny, świadomie odłożony poza pierwszą wersję (`shape-notes.md`, `## Forward: technical-roadmap`).
- **Oś czasu: objawy i leki zestawione wizualnie lub jako raport** — Why parked: Kryterium sukcesu drugorzędne, a cel sekwencjonowania to `speed`; struktura okresów dawkowania z S-03 jest pod to gotowa.
- **Integracja z zewnętrzną bazą interakcji** — Why parked: PRD `## Non-Goals`; reguły pochodzą wyłącznie ze zbioru dostarczonego z produktem.
- **Rozpoznawanie nazw handlowych leków** — Why parked: PRD `## Non-Goals`; użytkowniczka podaje substancję czynną odczytaną z ulotki.
- **Przypomnienia o przyjęciu dawki** — Why parked: PRD `## Non-Goals`; produkt służy rozumieniu zestawu leków, nie pilnowaniu rutyny.
- **Zdalne udostępnianie danych lekarzowi** — Why parked: PRD `## Non-Goals`; sekcja na wizytę jest do pokazania na ekranie.
- **Reguła niedoborów mikro- i makroskładników** — Why parked: PRD `## Non-Goals`; przeniesiona do wersji drugiej.
- **Interfejs dodawania kilku substancji czynnych w jednym preparacie** — Why parked: PRD `## Non-Goals`; struktura danych gotowa od MVP, interfejs później.
- **Działanie bez połączenia z siecią** — Why parked: PRD `## Non-Goals` niefunkcjonalne.
- **Formalna zgodność ze standardami dostępności** — Why parked: PRD `## Non-Goals`; czytelność na telefonie tak, certyfikowana dostępność nie w tej wersji.
- **Wiele profilów w jednym koncie** — Why parked: PRD `## Non-Goals`; jedno konto to jedna osoba.
- **Obserwowalność: logger, śledzenie błędów, metryki** — Why parked: baseline zgłasza `absent`, a PRD nie ma mierzalnych progów czasu odpowiedzi i dostępności (Otwarte pytanie 5). Przy celu `speed` fundament bez progu do spełnienia byłby zgadywaniem zakresu.

## Milestone History

(Pusta — M-1 jest pierwszym kamieniem milowym.)

## Done

(Pusta przy pierwszym wygenerowaniu. `/10x-archive` dopisuje tu wpis i przestawia status pozycji na `done`, gdy zarchiwizowana zmiana ma pasujący Change ID.)
