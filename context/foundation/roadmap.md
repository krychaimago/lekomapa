---
project: lekomapa
version: 2
status: draft
created: 2026-09-21
updated: 2026-10-08
prd_version: 1
main_goal: speed
top_blocker: skills
milestone_id: mvp-material-na-wizyte
milestone_seq: 1
milestone_status: open
---

# Roadmap: lekomapa

> Wyprowadzona z `context/foundation/prd.md` (v1), `tech-stack.md`, bloku `## Forward: technical-roadmap` z `shape-notes.md` oraz sprawdzonego baseline'u repozytorium. Wersja 2 (2026-09-26) dołącza ustalenia z `context/changes/mvp-scope-ui-and-data-processing/frame.md` — wspólna warstwa wizualna, warstwa „prototyp” przy publicznej rejestracji, odzyskiwanie hasła, tryb ciemny. Poprzednia wersja: `context/foundation/archive/2026-09-26-roadmap-mvp-material-na-wizyte.md`.
> Edytowana w miejscu; archiwizowana, gdy przestanie obowiązywać.
> Pozycje poniżej są ułożone w kolejności zależności. Tabela „W skrócie" jest indeksem.
> Realizacja prowadzona jest w GitHub Issues (`krychaimago/lekomapa`, milestone `M-1: MVP — od leku do materiału na wizytę`); numery issue przy pozycjach, w tabeli „Backlog Handoff" i przy otwartych pytaniach. Roadmapa pozostaje źródłem prawdy o zakresie kamienia milowego.

## Milestone

**M-1: MVP — od leku do materiału na wizytę** — Status: open

- **Intent:** Użytkowniczka prowadzi w produkcie pełny zestaw leków z historią okresów dawkowania, zapisuje objawy i przed wizytą otwiera jedno miejsce z możliwymi kolizjami oraz gotowymi pytaniami do lekarza. Kamień milowy jest zakresowany wynikiem, nie datą.
- **Source materials:** `context/foundation/prd.md` (v1); `context/changes/mvp-scope-ui-and-data-processing/frame.md` wraz z rozstrzygnięciem autorki z 2026-09-26; decyzje autorki z sesji roadmapy 2026-09-26 (kolejność pracy nad UI, tryb ciemny, podział odzyskiwania hasła).
- **Done when:** każda pozycja F-NN i S-NN poniżej ma status `done`.
- **Scope anchors:** FR-001…FR-012 (wszystkie must-have), US-01…US-04, `## Non-Functional Requirements` w części dotyczącej izolacji danych per-konto, bezpowrotnego usunięcia konta, czytelności na telefonie oraz progów szybkości, błędów i dostępności, oraz punkty zakresu z opisu autorki:
  - MS-01: Wspólna warstwa wizualna powstaje przed pierwszym ekranem, a nie na końcu: nazwane kolory jasnej palety Mech zapisane w jednym miejscu (makieta jest prototypem wizualnym, więc wartości mają być wymienialne), polski język interfejsu, szkielet wnętrza z pasem bocznym na dużym ekranie i zakładkami na telefonie. Ekrany powstają w swoich plasterkach i korzystają z nazwanych kolorów, nigdy z kolorów wpisanych na sztywno.
  - MS-02: Rejestracja zostaje publiczna, więc MVP niesie minimalną warstwę „prototyp”: warunki korzystania w wersji 1 mówiące, że to prototyp certyfikacyjny, w którym nie należy wpisywać prawdziwych danych, a dane mogą zostać usunięte bez uprzedzenia, wraz z kontaktem; krótka strona prywatności (kto prowadzi serwis, jakie dane zbiera, gdzie leżą, jak usunąć konto); stały pasek „wersja demonstracyjna” na każdym ekranie.
  - MS-03: Ekrany wejściowe według makiety (`context/changes/auth-login-design/design-draft.md`), w tym odzyskiwanie hasła, którego dziś w kodzie nie ma.
  - MS-04: Tryb ciemny jako ostatnia pozycja kamienia milowego, po tym, jak powstaną ekrany głównego przepływu.

## Vision recap

Użytkowniczka przyjmuje kilka leków przepisanych przez różnych lekarzy i żaden z nich nie widzi pełnego zestawu. Produkt zbiera substancje czynne, okresy dawkowania i wpisy o samopoczuciu, a na wyjściu daje dwie rzeczy: oznaczenie możliwej kolizji przy leku oraz złożone pytanie do zadania lekarzowi. Momentem odbioru wartości jest wizyta — możliwość powiedzenia „biorę X, Y, Z, od dwóch tygodni mam objaw A, zbiega się to w czasie z Y" zamiast „coś mi nie służy". Produkt nigdy nie stwierdza przyczyny objawu i nigdy nie sugeruje zmiany leczenia.

## North star

**S-02: użytkowniczka dodaje lek po nazwie handlowej i widzi przy nim znacznik możliwej kolizji** — to pierwsze Kryterium sukcesu w PRD i jedyny przepływ, który uruchamia regułę kolizji od danych po komunikat; przy celu `speed` wszystko inne ma sens dopiero wtedy, gdy ten przepływ działa.

> Gwiazda przewodnia (north star) to tutaj najmniejszy przepływ od końca do końca, którego dowiezienie dowodzi, że główna hipoteza produktu się trzyma — dlatego stoi tak wcześnie, jak pozwalają jego wymagania wstępne.

## At a glance

| ID   | Change ID                            | Outcome (użytkowniczka może …)                                                       | Prerequisites                      | PRD refs                                   | Status      |
| ---- | ------------------------------------ | ------------------------------------------------------------------------------------ | ---------------------------------- | ------------------------------------------ | ----------- |
| F-01 | medication-schema-rls                | (fundament) schemat leków i okresów dawkowania z RLS i ścieżką weryfikacji           | —                                  | FR-003, FR-004, NFR izolacji               | done        |
| F-02 | interaction-rules-seed               | (fundament) pary kolizji na grupach ATC i rejestr leków dostarczone z produktem      | —                                  | FR-003, FR-006                             | done        |
| F-03 | symptom-catalog-seed                 | (fundament) katalog 34 objawów w 8 kategoriach ze słowami wyszukiwania               | —                                  | FR-008                                     | done        |
| F-04 | app-shell-visual-foundation          | (fundament) nazwane kolory, polski interfejs, pasek demonstracyjny, szkielet wnętrza | —                                  | MS-01, MS-02, NFR czytelności na telefonie | done        |
| F-05 | email-sender-smtp                    | (fundament) maile z odnośnikami dochodzą na adres każdej osoby, nie tylko zespołu    | —                                  | FR-001, FR-002                             | proposed    |
| F-06 | production-observability             | (fundament) błąd i przerwa w działaniu produkcji docierają do autorki mailem         | —                                  | NFR progów szybkości, błędów i dostępności | ready       |
| S-01 | terms-acceptance-on-signup           | założyć konto, akceptując warunki „prototyp”, po przeczytaniu strony prywatności     | F-04                               | FR-001, FR-002, MS-02, MS-03               | done        |
| S-10 | password-recovery                    | odzyskać dostęp do konta, ustawiając nowe hasło                                      | F-04                               | FR-002, MS-03                              | in-progress |
| S-02 | add-medication-with-interaction-flag | dodać lek po nazwie handlowej i zobaczyć znacznik możliwej kolizji                   | F-01, F-02, F-04                   | US-01, FR-003, FR-006, FR-007, FR-012      | done        |
| S-03 | dosage-period-history                | zmienić dawkowanie tak, że stary okres się zamyka, a nowy otwiera                    | S-02                               | US-04, FR-004                              | done        |
| S-04 | discontinue-medication               | zakończyć przyjmowanie leku z datą odstawienia                                       | S-02                               | FR-005                                     | done        |
| S-05 | symptom-journal-entry                | zapisać wpis o samopoczuciu z datą, godziną i objawami z listy                       | F-01, F-03, F-04                   | US-02, FR-008                              | done        |
| S-06 | symptom-question-composer            | zobaczyć po zapisaniu objawu gotowe pytanie do lekarza                               | S-03, S-05                         | US-02, FR-010, FR-012                      | done        |
| S-07 | journal-correction-window            | poprawić wpis dzienniczka w oknie korekty                                            | S-05                               | FR-009                                     | ready       |
| S-08 | doctor-visit-summary                 | otworzyć sekcję „Wizyta" przed wizytą                                                | S-02, S-06                         | US-03, FR-011, FR-012                      | planning    |
| S-09 | account-deletion-cascade             | usunąć konto tak, że wszystkie powiązane dane znikają bezpowrotnie                   | S-01, S-02, S-05, S-06             | FR-001, NFR usunięcia konta                | proposed    |
| S-11 | dark-mode                            | korzystać z produktu w trybie ciemnym                                                | S-01, S-04, S-07, S-08, S-09, S-10 | MS-04, NFR czytelności na telefonie        | proposed    |

## Streams

Pomoc nawigacyjna — grupuje pozycje dzielące łańcuch wymagań wstępnych. Kolejność obowiązująca nadal żyje w grafie zależności poniżej; ta tabela to proponowana kolejność czytania między równoległymi ścieżkami.

| Stream | Theme                   | Chain                                        | Note                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ------ | ----------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A      | Leki i kolizje          | `F-01` → `F-02` → `S-02` → `S-03` → `S-04`   | Ścieżka gwiazdy przewodniej; przy celu `speed` ma pierwszeństwo. `S-02` dołącza do D przy `F-04`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| B      | Dzienniczek objawów     | `F-03` → `S-05` → `S-07`                     | Startuje równolegle do A; `S-05` dołącza do D przy `F-04`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| C      | Materiał na wizytę      | `S-06` → `S-08`                              | Dołącza do A przy `S-03` i do B przy `S-05`; niczego nie liczy od nowa, składa gotowe treści.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| D      | Wejście, konto i wygląd | `F-04` → (`S-01` ∥ `S-10`) → `S-09` → `S-11` | `F-04` jest wspólnym podłożem także dla A i B. `F-05` (nadawca maili) nie blokuje żadnego plasterka, ale bez niego maile z `S-01` i `S-10` dochodzą wyłącznie do członków zespołu projektu Supabase. `S-01` i `S-10` są wzajemnie niezależne (∥ = równolegle); `S-09` czeka na `S-01` i dołącza do A przy `S-02`, do B przy `S-05` i do C przy `S-06`, a od `S-10` nie zależy; `S-11` zamyka kamień milowy, gdy istnieją wszystkie ekrany. `F-06` (śledzenie błędów i monitor dostępności) też nie blokuje żadnego plasterka; Sentry na stronie prywatności dopisuje `F-06` przy wdrożeniu — `S-01` wymienia tylko to, co już działa. |

## Baseline

Co jest już w repozytorium na dzień `2026-09-26` (sprawdzone w kodzie; w wersji 1 z 2026-09-21 potwierdzone przez autorkę, poprawki z frame'a `mvp-scope-ui-and-data-processing`). Fundamenty poniżej zakładają, że to istnieje, i tego nie budują od nowa.

- **Frontend:** partial — szkielet jest: Astro 5 w pełnym SSR, React tylko dla formularzy, Tailwind 4, shadcn/ui (`src/layouts/Layout.astro`, `src/components/ui/`). Brak wspólnej warstwy wizualnej: kolory to domyślne wartości shadcn (`src/styles/global.css`), ekrany startera mają kolory wpisane na sztywno (`SubmitButton.tsx`, `signin.astro`, `dashboard.astro`), dokument ma `lang="en"`, teksty auth są po angielsku, nie ma nawigacji wnętrza.
- **Backend / API:** partial — trasy API istnieją wyłącznie dla auth (`src/pages/api/auth/signin.ts`, `signup.ts`, `signout.ts`); brak tras domenowych, zod jeszcze niezainstalowany.
- **Data:** partial — klient Supabase SSR wpięty (`src/lib/supabase.ts`); cztery migracje z F-01 i F-02 (`supabase/migrations/`), sprawdzenia RLS i wyzwalaczy w `supabase/tests/rls_checks.sql`, typy encji w `src/types.ts`. Brak tabel dzienniczka i katalogu objawów.
- **Auth:** partial — `@supabase/ssr`, sesje w ciasteczkach, `src/middleware.ts` z `PROTECTED_ROUTES`, strony `src/pages/auth/{signin,signup,confirm-email}.astro`. Pokrywa rejestrację i logowanie. Odzyskiwania dostępu nie ma — w `src/` brak jakiejkolwiek trasy resetu hasła (wersja 1 roadmapy błędnie podawała je jako obecne).
- **Deploy / infra:** present — Cloudflare Workers przez `wrangler.jsonc`, `.github/workflows/ci.yml` z bramkami lint/typy/build oraz testem dymnym, auto-deploy po merge do `main`.
- **Observability:** absent — brak loggera, śledzenia błędów i metryk. Świadomie odłożone (patrz `## Parked`), bo progi liczbowe pozostają nierozstrzygnięte. Aktualizacja 2026-10-06: progi rozstrzygnięte (#6), realizacja w F-06. Logi Cloudflare są włączone (`observability.enabled` w `wrangler.jsonc`), ale nikt ich nie przegląda i nic z nich nie powiadamia.

## Foundations

### F-01: Schemat leków i okresów dawkowania z RLS

- **Outcome:** (fundament) istnieje pierwsza migracja z tabelami leku i okresu dawkowania, RLS włączone w tej samej migracji z politykami per-operacja i per-rola, typy encji w `src/types.ts`, oraz sprawdzona ścieżka weryfikacji izolacji — drugie konto nie widzi cudzych wierszy.
- **Change ID:** `medication-schema-rls`
- **Issue:** #9
- **PRD refs:** FR-003, FR-004, `## Non-Functional Requirements` (izolacja danych per-konto), `## Access Control` (płaski model, jedno konto = jedna osoba)
- **Unlocks:** S-02 (gwiazda przewodnia), S-05 — a także konwencję migracji i RLS, z której korzysta każda późniejsza tabela; ścieżka weryfikacji izolacji jest tu ustalana raz dla całego produktu.
- **Prerequisites:** —
- **Parallel with:** F-02, F-03, F-04
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
- **Parallel with:** F-01, F-03, F-04
- **Blockers:** —
- **Unknowns:** — (Q-1 rozstrzygnięte 2026-09-21, issue #2)
- **Risk:** Zbieranie par to praca poza kodem, wliczona w budżet czasu, nieusuwalna i niezlecalna agentowi — to dane zdrowotne, każda para wymaga sprawdzenia przy ulotce albo charakterystyce produktu leczniczego. Drugie ryzyko to jakość danych rejestru: nazwa leku bywa zlepiona z dawką i opakowaniem, substancje zapisywane niejednolicie. Dlatego pierwszym krokiem jest pobranie próbki i zmierzenie, jak te dane wyglądają, zanim powstanie migracja. Zbiór reguł jest z założenia niepełny — konsekwencją jest bariera z PRD mówiąca wprost, że brak ostrzeżenia nie oznacza bezpieczeństwa; ta bariera jest częścią S-02, nie tego fundamentu.
- **Wymogi projektowe:** pary trzymane na kodach ATC, nie na tekstowych nazwach substancji. Przy leku zapisywany pełny skład, także substancje spoza wybranych grup. Zawężenie rejestru jest filtrem przy wczytywaniu, nigdy flagą na leku — inaczej późniejsze rozszerzenie na pełny rejestr wymaga przeliczenia wszystkiego zamiast doładowania wierszy. Każda para z polami źródła i daty sprawdzenia. RLS w tej samej migracji: polityka `SELECT` dla roli zalogowanej, brak polityk zapisu.
- **Status:** done

### F-03: Zamknięta lista objawów

- **Outcome:** (fundament) katalog objawów jest w bazie: 34 pozycje w ośmiu kategoriach układów, każda z potocznymi określeniami użytymi jako słowa wyszukiwania i z kolumną na kod źródłowy, pustą w tej wersji. Zbiór wspólny dla produktu i tylko do odczytu dla użytkownika.
- **Change ID:** `symptom-catalog-seed`
- **Issue:** #11
- **PRD refs:** FR-008, `## Business Logic` (katalog objawów jako trzeci zbiór dostarczony z produktem), `## Access Control` (brak roli edytującej zbiory wspólne)
- **Unlocks:** S-05 — bez listy nie ma z czego zaznaczyć objawu we wpisie dzienniczka.
- **Prerequisites:** —
- **Parallel with:** F-04, S-01, S-02, S-10
- **Blockers:** —
- **Unknowns:** — (Q-2 rozstrzygnięte 2026-09-21, issue #3)
- **Risk:** Lista za wąska sprawi, że użytkowniczka nie znajdzie tego, co faktycznie czuje. PRD łagodzi to notatką własnymi słowami, która nie uczestniczy w regule — ale notatka jest częścią S-05, więc sama lista musi trafić w typowe objawy przyjmowanych leków. Osiem kategorii i 34 pozycje to ryzyko zmniejszają, ale otwierają drugie: przy tej długości płaska lista na telefonie jest nie do przewinięcia, więc grupowanie i wyszukiwanie po słowach potocznych przestają być udogodnieniem i stają się warunkiem użyteczności — to wymóg dla S-05, nie dla tego fundamentu. Trzecie ryzyko: nazwy pozycji powstają bez źródła referencyjnego i będą dopracowywane w użyciu, więc niczego nie wolno wiązać z polską nazwą jako identyfikatorem.
- **Wymogi projektowe:** nazwa polska, kategoria układu (osiem stałych wartości zapisanych przy wierszu, bez osobnej tabeli słownikowej), pole porządkujące do wyświetlania w kolejności od najczęstszych, kolumna na kod źródłowy dopuszczająca pustą wartość. Słowa wyszukiwania w osobnej tabeli powiązanej, nie jako tekst z przecinkami — po nich idzie główna droga wyboru w S-05. Kod źródłowy zostaje pusty w tej wersji, ale kolumna powstaje od pierwszej migracji: zaparkowany zbiór działań niepożądanych będzie się łączył po niej, nie po polskiej nazwie. Zawężenie zbioru stosowane jako filtr przy wczytywaniu, nigdy jako flaga w bazie — rozszerzenie listy to doładowanie wierszy. RLS w tej samej migracji: polityka `SELECT` dla roli zalogowanej, brak polityk zapisu. Typy encji w `src/types.ts`.
- **Status:** done

### F-04: Wspólna warstwa wizualna i szkielet wnętrza

- **Outcome:** (fundament) istnieje wspólne podłoże, na którym stają ekrany plasterków: nazwane kolory palety Mech zapisane w jednym miejscu, każdy z wartością jasną i ciemną (ciemne wartości zaakceptowane na makiecie, bez przełącznika — ten należy do S-11), rola czerwieni dla błędów formularzy i techniki, polski język dokumentu, stały pasek „wersja demonstracyjna” widoczny na każdym ekranie — także przed zalogowaniem — oraz pusty szkielet wnętrza z pasem bocznym na dużym ekranie i zakładkami u dołu na telefonie. Żadnego ekranu domenowego.
- **Change ID:** `app-shell-visual-foundation`
- **Issue:** #35
- **PRD refs:** MS-01, MS-02 (pasek), `## Non-Functional Requirements` (czytelność i pełna używalność na telefonie)
- **Unlocks:** S-01 i S-10 (ekrany wejściowe w palecie), S-02 (gwiazda przewodnia — pierwszy ekran wnętrza), S-05 (drugi ekran wnętrza), S-11 (tryb ciemny: ciemne wartości nazwanych kolorów już są, zostaje przełącznik i przegląd ekranów).
- **Prerequisites:** —
- **Parallel with:** F-03
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Stoi przed gwiazdą przewodnią, choć sam nie daje nic widocznego, z dwóch powodów. Produkcja jest publiczna z otwartą rejestracją, więc pasek „wersja demonstracyjna” musi być na miejscu przed pierwszym ekranem, na którym ktoś obcy może wpisać dane. Ekran, który powstanie z kolorami wpisanymi na sztywno, trzeba potem przerabiać przy każdej zmianie palety i przy trybie ciemnym. Zagrożenie odwrotne: fundament rozrasta się w „cały UI”. Zakres jest zamknięty: żadnych ekranów domenowych i żadnego przerabiania ekranów wejściowych (to S-01 i S-10). Pozycje menu dopina plasterek, który tworzy dany ekran.
- **Wymogi projektowe:** paleta Mech z `design-draft.md` jest prototypem wizualnym — liczy się nazwana rola koloru (płótno, karta, akcent, akcent jasny, możliwa interakcja), nie konkretna wartość. Kolory funkcjonalne z makiety wchodzą jako role od początku, łącznie z bursztynem dla możliwej interakcji. Czerwień (decyzja 2026-09-26) ma rolę wyłącznie dla błędów formularzy i techniki, nigdy dla możliwej interakcji ani treści o zdrowiu. Ciemne wartości tych samych nazwanych kolorów powstają tutaj, każda para tekstu z pomiarem ≥ 7 : 1 w obu trybach; przełącznik trybu nie. Kolor wpisany na sztywno w `src/` odrzuca skaner w `npm test`, z listą wyjątków dla ekranów wejściowych startera. Reguły czytelności z makiety przyjęte jako baza: najmniejszy tekst 15 px na telefonie i 17 px na dużym ekranie, kontrast tekstu co najmniej 7 : 1, pola i przyciski wyższe niż 44 px. Pasek w tym fundamencie bez odnośnika — strona prywatności powstaje w S-01, który go dopina.
- **Status:** done

### F-05: Własny nadawca maili

- **Outcome:** (fundament) maile wysyłane przez produkt — potwierdzenie adresu po rejestracji i odnośnik do ustawienia nowego hasła — dochodzą na adres każdej osoby, a nie tylko członków zespołu projektu Supabase, z nadawcą z domeny `lekomapa.pl`.
- **Change ID:** `email-sender-smtp`
- **Issue:** #44
- **PRD refs:** FR-001, FR-002
- **Unlocks:** pełne działanie S-01 (potwierdzenie adresu) i S-10 (odzyskiwanie dostępu) dla osób spoza zespołu. Bez tego oba plasterki działają na produkcji tylko dla konta autorki.
- **Prerequisites:** — (domena `lekomapa.pl` kupiona 2026-09-19; jej konfiguracja odłożona do finalizacji, a wpisy DNS dla poczty są jej częścią)
- **Parallel with:** S-01, S-10, S-02, S-05
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Dopisane 2026-09-27 przy planowaniu S-10: produkcja używa domyślnego nadawcy Supabase, który dostarcza maile wyłącznie na adresy członków zespołu projektu i ma limit kilku maili na godzinę. Objaw nie wychodzi przy testach na koncie autorki, więc wygląda to na działający produkt, a obca osoba nie dostaje ani potwierdzenia rejestracji, ani odnośnika resetu. Praca prawie w całości poza kodem: konto u dostawcy poczty (np. Resend), potwierdzenie domeny wpisami DNS (SPF, DKIM), dane SMTP i adres nadawcy w panelu produkcyjnego Supabase (Authentication → SMTP), podniesienie limitu maili na godzinę. Zamyka się dopiero sprawdzeniem, że mail doszedł na adres spoza zespołu. Musi być `done` przed wpuszczeniem innych osób, niezależnie od kolejności plasterków.
- **Status:** proposed

### F-06: Śledzenie błędów i monitor dostępności

- **Outcome:** (fundament) każdy błąd serwera na produkcji (5xx, przekroczenie limitu CPU 1102) dociera do autorki mailem przez Sentry, przerwa w działaniu dociera mailem w ciągu 15 minut, a baza Supabase nie usypia z braku ruchu.
- **Change ID:** `production-observability`
- **Issue:** #74
- **PRD refs:** `## Non-Functional Requirements` (progi szybkości, błędów i dostępności), `## Open Questions` pytanie 6
- **Unlocks:** pomiar progów z PRD; zdejmuje ryzyko uśpienia bazy darmowego Supabase po 7 dniach bez ruchu, które przy pokazywaniu prototypu bliskim jest scenariuszem częstym.
- **Prerequisites:** —
- **Parallel with:** każda pozycja M-1
- **Blockers:** —
- **Unknowns:**
  - Jakim zapytaniem strona kontrolna dotyka bazy bez sesji? Katalog objawów i rejestr nie mają polityk dla `anon` i mają ich nie dostać. Kierunek: funkcja zwracająca stałą wartość, udostępniona `anon`, bez dostępu do tabel. — Owner: plan. Block: no.
- **Risk:** Dopisane 2026-10-06 (#6). Sentry wyłącznie po stronie serwera — po stronie przeglądarki dokładałby JavaScript ważący na progu 2,5 s i drugie miejsce, w którym trzeba wycinać dane o zdrowiu. Konto Sentry zakładane od razu w regionie EU, bo wyboru regionu nie da się później zmienić. Raport błędu nie niesie adresu z parametrami, treści żądania, ciasteczek ani śladu działań; pilnuje tego test, który wywołuje błąd z nazwą leku i sprawdza, że nazwa nie wychodzi — nie komentarz. Klucz Sentry jako sekret Workera: po ustawieniu potwierdzić, że runtime widzi niepustą wartość (lesson o sekretach). SDK dokłada pracy przy każdym żądaniu, więc narzut CPU mierzony po podpięciu wobec limitu 10 ms. Strona kontrolna (np. `/api/health`) jest publiczna i zwraca wyłącznie stan, bez danych. Monitor dostępności Sentry odpytuje ją co 5–15 minut — ok. 100–300 żądań dziennie przy limicie 100 tys. Pomiar progu szybkości (Lighthouse Mobile, LCP ≤ 2,5 s) dla listy leków i zapisu objawu należy do tej pozycji; ekran z S-08 mierzony w S-08. Narzut: 2–3 wieczory jednorazowo, ~15 minut tygodniowo na przegląd zgłoszeń. Ping z GitHub Actions odrzucony — GitHub wyłącza zaplanowane zadania po 60 dniach bez aktywności w repozytorium. Przy wdrożeniu dopisuje Sentry do `/prywatnosc` (`src/lib/copy/terms.ts`, `PRIVACY_COPY`) z informacją, że raporty błędów nie zawierają danych o zdrowiu — `S-01` wymienia tylko to, co już działa.
- **Status:** ready

## Slices

### S-01: Konto z akceptacją warunków korzystania

- **Outcome:** Użytkowniczka może przed założeniem konta przeczytać krótką stronę prywatności, założyć konto, świadomie akceptując warunki korzystania w wersji 1 „prototyp”, i zalogować się loginem i hasłem — na ekranach wejściowych w układzie z makiety.
- **Change ID:** `terms-acceptance-on-signup`
- **Issue:** #12
- **PRD refs:** FR-001, FR-002, MS-02, MS-03, `## Access Control` (zapis daty i wersji zaakceptowanego dokumentu)
- **Prerequisites:** F-04
- **Parallel with:** F-03, S-02, S-05, S-10
- **Blockers:** —
- **Unknowns:**
  - ~~Jak brzmi treść warunków korzystania?~~ — Rozstrzygnięte 2026-10-06 (#8): treść w `context/foundation/terms-of-use-v1.md`, przenoszona do aplikacji bez zmian. Wymogi dla tego plasterka: każda wersja warunków jest niezmiennym tekstem (wersja 2 to nowy tekst, nie edycja); przy logowaniu porównanie wersji zaakceptowanej z bieżącą i ekran ponownej akceptacji przed wejściem do wnętrza, z zapisem daty i wersji; warunki na osobnej stronie, przy polu akceptacji odnośnik.
  - ~~Jakie podmioty zewnętrzne wymienia strona prywatności?~~ — Rozstrzygnięte 2026-10-06 (#6): poza Supabase i Cloudflare także Sentry (F-06), z informacją, że raporty błędów nie zawierają danych o zdrowiu. Strona mówi prawdę o tym, co jest wdrożone w chwili publikacji.
  - Kto prowadzi serwis na stronie prywatności? Propozycja autorki: jednoosobowa działalność „testFit Anna Kryśko”, kontakt krysko.anna@gmail.com. — Owner: użytkowniczka. Block: no — do potwierdzenia przy planowaniu S-01.
  - ~~Czy komunikaty zdradzają, że konto o danym adresie istnieje?~~ — Rozstrzygnięte 2026-10-06 (#34): wariant bezpieczniejszy. Wymogi dla tego plasterka: rejestracja nie przekazuje na ekran surowego błędu Supabase (dziś `src/pages/api/auth/signup.ts` przepuszcza `error.message` do adresu) i dla istniejącego adresu kończy się tym samym ekranem „sprawdź skrzynkę” co dla nowego, z podpowiedzią „nie dostałaś maila? Może masz już konto — odzyskaj dostęp”; nieudane logowanie pokazuje jeden stały komunikat „nieprawidłowy e-mail lub hasło”. Przed planem zmierzyć, czy produkcyjne Supabase ma włączone potwierdzanie adresu — od tego zależy, czy `signUp` dla istniejącego adresu zwraca błąd „User already registered”, czy udawany sukces (lokalnie `enable_confirmations = false`).
- **Risk:** Rejestracja i logowanie są w baseline'ie obecne, więc plasterek dokłada treść i ekrany, nie mechanizm logowania: akceptację warunków z zapisem daty i wersji dokumentu, stronę prywatności, odnośnik do niej na pasku z F-04 oraz ekrany logowania, rejestracji i potwierdzenia adresu w układzie Rozkładówki. Strona prywatności mówi prawdę o tym, co jest, także to, że e-mail konta jest daną osobową przetwarzaną niezależnie od komunikatu o prototypie. Zagrożenie odwrotne do zwykłego: pisanie warstwy auth od zera zamiast oparcia się na tym, co starter już niesie. Napisy z makiety są robocze i nie trafiają do kodu bez osobnej decyzji. Plasterek zdejmuje swoje pliki z listy wyjątków skanera kolorów (`EXCEPTIONS` w `scripts/tokens/hardcoded-colors.mjs`) — test wywraca się, gdy plik na liście nie ma już koloru na sztywno.
- **Status:** done

### S-10: Odzyskiwanie dostępu przez ustawienie nowego hasła

- **Outcome:** Użytkowniczka, która nie pamięta hasła, może poprosić o odnośnik na adres e-mail konta, ustawić nowe hasło i zalogować się nim; wygasły odnośnik kończy się zrozumiałym komunikatem z drogą do nowego.
- **Change ID:** `password-recovery`
- **Issue:** #36
- **PRD refs:** FR-002, MS-03
- **Prerequisites:** F-04
- **Parallel with:** F-03, S-01, S-02, S-05
- **Blockers:** —
- **Unknowns:**
  - ~~Czy ekran potwierdzenia wysłania zdradza, że konto o danym adresie istnieje?~~ — Rozstrzygnięte 2026-10-06 (#34): wariant bezpieczniejszy, już wdrożony — każdy wynik prośby kończy się tym samym ekranem (`src/pages/api/auth/password-reset-request.ts`). Wymóg na przyszłość: żadna zmiana tego plasterka nie rozróżnia komunikatu po istnieniu konta.
- **Risk:** Wersja 1 roadmapy uznała odzyskiwanie dostępu za obecne w starterze, a w kodzie go nie ma — FR-002 (konieczne) był niepokryty. Wydzielony z S-01, bo to osobna czynność użytkowniczki z własnym ryzykiem: odnośnik resetujący, który nie wygasa albo działa wielokrotnie, jest drogą do cudzych danych o zdrowiu. Trzy ekrany (prośba o adres, potwierdzenie wysłania, nowe hasło) w palecie z F-04. Nowe ekrany nie trafiają na listę wyjątków skanera kolorów (`EXCEPTIONS` w `scripts/tokens/hardcoded-colors.mjs`). Jeśli plasterek przepina na tokeny wspólne komponenty formularza z tej listy (np. `FormField`, `SubmitButton`), zdejmuje je z niej — test wywraca się, gdy plik na liście nie ma już koloru na sztywno. Nadawca maili poza zakresem (decyzja 2026-09-27): do czasu F-05 odnośnik resetu dochodzi wyłącznie na adresy członków zespołu projektu Supabase.
- **Status:** in-progress

### S-02: Dodanie leku po nazwie handlowej ze znacznikiem możliwej kolizji

- **Outcome:** Użytkowniczka może dodać przyjmowany preparat, wpisując jego nazwę handlową i podając dawkowanie z datą rozpoczęcia; przy nowo dodanej pozycji widzi dyskretny znacznik możliwej kolizji, a w szczegółach leku pełną treść informacji wraz ze składem preparatu. Preparat spoza rejestru dodaje, wskazując substancję czynną z ulotki, i uczestniczy w regułach tak samo.
- **Change ID:** `add-medication-with-interaction-flag`
- **Issue:** #13
- **PRD refs:** US-01, FR-003, FR-006, FR-007, FR-012
- **Prerequisites:** F-01, F-02, F-04
- **Parallel with:** S-01, S-05, S-10
- **Blockers:** —
- **Unknowns:** —
- **Risk:** To gwiazda przewodnia i jedyne miejsce, w którym produkt mógłby wyrządzić szkodę. Język komunikatu podlega sprawdzeniu, nie jest wytyczną: „może wchodzić w interakcję", nigdy zakaz łączenia, nigdy porządkowanie leków według stopnia podejrzenia, stała nota o charakterze poglądowym przy każdej informacji. Brak znacznika nie może wyglądać jak potwierdzenie bezpieczeństwa. Sekwencjonowane najwcześniej, jak pozwalają wymagania wstępne, bo cała reszta roadmapy zakłada zapisane leki.
- **Dług przejęty z F-02:** migracja tego plasterka musi dodać na `medications` wyzwalacz na UPDATE, który po zamknięciu okna korekty blokuje zmianę `registry_medication_id` i `composition_source`, oraz kontrolę spójności `composition_source = 'registry'` ⇔ `registry_medication_id is not null`, ze sprawdzeniem w `supabase/tests/rls_checks.sql`. Powód: reguła z S-03 — zmiana substancji czynnej to zakończenie leku i dodanie nowego — jest dziś pilnowana tylko na `medication_substances`; przepięcie samego leku pod inny produkt rejestru ją omija. Do rozstrzygnięcia w planie: czy `product_name` należy do rdzenia wpisu. Źródło: `context/archive/2026-09-23-interaction-rules-seed/reviews/impl-review.md`, F2.
- **Decyzja przejęta z F-02:** klucz unikalny `medication_substances (medication_id, substance_name, atc_code)` przepuszcza ten sam kod pod różną pisownią nazwy („Ibuprofenum” / „ibuprofenum”), więc jedna substancja może zostać policzona podwójnie. Plan S-02 wybiera: normalizacja nazwy przy zapisie albo częściowy indeks `(medication_id, atc_code) where atc_code is not null`. Zmierzone 2026-09-26: w rejestrze nie ma produktu z dwiema różnymi substancjami o tym samym kodzie; ścieżki z ulotki nie zmierzono. Źródło: impl-review F7.
  - **Poprawka pomiaru (2026-09-30):** zdanie z 2026-09-26 jest nieprawdziwe. 4 produkty mają ten sam kod ATC dwa razy: Ibuprofen Zentiva 400 mg (dwa razy „Ibuprofenum” / M01AE01 — kopia 1:1 łamie istniejący klucz), Dexak (M01AE17) i dwa warianty Coroswera („Rosuvastatinum” i „Rosuvastatinum calicum”, C10AA07).
  - **Wybrany wariant:** częściowy indeks unikalny `medication_substances_medication_id_atc_code_key` na `(medication_id, atc_code) where atc_code is not null` oraz deduplikacja przy kopiowaniu składu z rejestru (jeden wiersz na kod). Stary klucz zostaje dla wierszy bez kodu. Migracja: `supabase/migrations/20260930120000_medication_write_and_interactions.sql`.
- **Uwaga do makiety:** ekran dodawania leku w `design-draft.md` jest sprzed rewizji FR-003 — zakłada wybór substancji czynnej ze słownika. Obowiązuje wejście po nazwie handlowej z rejestru, a substancja z ulotki tylko dla leku spoza rejestru. Z makiety zostają paleta, kolor możliwej interakcji i dwa objaśnienia („Dawka ma historię”, „Substancji nie podmienisz”). Ekran jest pierwszym ekranem wnętrza: używa nazwanych kolorów z F-04 i dopina swoją pozycję menu.
- **Kontrakt z fazy 3 planu testów:** faza 3 (`testing-language-guard`) dowiodła języka opisów par w walidatorze i w bazie; teksty, które powstają dopiero w tym plasterku, muszą trafić w zasięg testu. Brzmienie noty rozstrzyga ten plasterek — kontrakt wymaga tylko, żeby istniała i była sprawdzana.
  1. Nota poglądowa i zdanie „brak ostrzeżenia nie oznacza, że połączenie jest bezpieczne” żyją w jednym module copy (wzorzec: `src/lib/copy/password-recovery.ts`), nie rozsypane po komponentach.
  2. Test w `scripts/` importuje ten moduł i `scripts/fr012/corpus.mjs` i dowodzi, że: każdy tekst z modułu przechodzi przez `forbiddenWordsIn` z `scripts/rpl/pairs.mjs` bez trafień (nie porównanie z listą zdań korpusu — takie porównanie przechodzi zawsze); nota i zdanie o bezpieczeństwie istnieją i nie są puste. Zdanie o bezpieczeństwie jest jedynym jawnym wyjątkiem: test sprawdza je bez rdzenia `bezpieczn`, bo PRD go wymaga (`prd.md:67`, guardrail `prd.md:49`). Wyjątek jest nazwany w teście, nie w walidatorze.
  3. Jeden krok smoke sprawdza, że widok z kolizją zawiera notę.
  4. Kolejność leków na liście nie zależy od kolizji — ranking według podejrzenia to własność listy, której walidator tekstu nie widzi (FR-012).
- **Status:** done

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
- **Status:** done

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
  Dług z S-02: strażnik `medications_guard_core` przepuszcza dziś każdą zmianę `discontinued_on`, także po zamknięciu okna korekty. S-04 musi to domknąć: po zamknięciu okna raz ustawiona data odstawienia nie może zostać wyczyszczona ani przesunięta (z testem w `supabase/tests/`).
  Dług z S-03 (impl-review F6b): `change_dosage` przyjmuje zmianę leku z datą odstawienia w przyszłości, a nowy okres zostaje otwarty (`ended_on` puste) i trwa dalej niż data odstawienia. Przykład: odstawienie ustawione na 20.10, zmiana dawki 10.10 — okres od 10.10 nie ma końca. S-04 musi przy ustawianiu daty odstawienia zamykać każdy okres otwarty po tej dacie, także ten powstały po ustawieniu daty (z testem w `supabase/tests/`).
- **Status:** done

### S-05: Wpis o samopoczuciu z datą, godziną i objawami

- **Outcome:** Użytkowniczka może dodać wpis o samopoczuciu z datą i godziną wypełnionymi domyślnie na moment zapisu i możliwymi do cofnięcia, zaznaczając jeden lub więcej objawów z zamkniętej listy, opcjonalnie podając nasilenie i własną notatkę.
- **Change ID:** `symptom-journal-entry`
- **Issue:** #16
- **PRD refs:** US-02, FR-008
- **Prerequisites:** F-01, F-03, F-04
- **Parallel with:** S-01, S-02, S-03, S-04, S-10
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Wpisy powstają głównie na telefonie i często wieczorem o porannym objawie — zła godzina fałszowałaby zbieżność z okresem dawkowania w S-06, więc możliwość cofnięcia czasu jest wymogiem, nie udogodnieniem. Notatka własnymi słowami nie uczestniczy w regule; wciągnięcie jej do reguły byłoby zmianą zakresu.
- **Wymogi projektowe:** katalog z F-03 liczy 34 pozycje, więc lista jest grupowana po ośmiu kategoriach układów, a wyszukiwanie po słowach potocznych jest główną drogą wyboru, nie udogodnieniem. Płaski scroll całego katalogu jest niedopuszczalny. Wyszukiwanie ignoruje wielkość liter i polskie znaki — „nudnosci” znajduje „nudności”, bo na telefonie często pisze się bez ogonków; słowa w bazie są zapisane małymi literami (F-03), więc przy wielkości liter wystarczy zmienić wpisany tekst, a polskie znaki trzeba pominąć po obu stronach porównania. Objaw nieujęty w katalogu użytkowniczka zapisuje w notatce — pozycji „inny objaw" na liście nie ma (Q-2, issue #3). Klucz obcy wpisu dzienniczka do `symptoms` musi być `on delete restrict` (jak `medications_registry_medication_id_fkey`), nie kaskadą: kaskada objaw → słowa wyszukiwania z F-03 dotyczy wyłącznie danych wspólnych, a usunięcie objawu z katalogu nie może skasować historii wpisów. Do rozstrzygnięcia przy planie: czy dawny wpis pokazuje bieżącą nazwę objawu (nazwy w F-03 mogą być dopracowywane), czy nazwę z chwili zapisu. Wyszukiwanie sprowadza wpisany tekst do postaci słów w bazie (małe litery, NFC, pojedyncze spacje) przed porównaniem. Lista kategorii istnieje dwa razy — `SymptomCategory` i `SYMPTOM_CATEGORIES` w `src/types.ts` oraz `symptoms_category_check` w bazie — i nic ich nie wiąże: kategoria spoza `SYMPTOM_CATEGORIES` odczytana z bazy ma dać widoczny błąd, nie objaw bez nagłówka kategorii.
- **Dług przejęty z F-01:** migracja tego plasterka musi podmienić treść `public.medication_correction_window_open()` na regułę czasową: 24 h od chwili zapisu wpisu, zegarem serwera (rozstrzygnięcie Q-3, 2026-10-05 — warunek zdarzeniowy „istnieje wpis objawu po dacie rozpoczęcia” odpadł). Do rozstrzygnięcia w planie: od zapisu czego liczy się okno — leku, każdego okresu dawkowania osobno, daty odstawienia (S-04) — i czy funkcja zostaje jedna na lek. W F-01 funkcja jest zaślepką zwracającą `true`, więc wszystkie wyzwalacze niemodyfikowalności historii — na `medications`, `medication_substances` i `dosage_periods` — są do tego czasu bezczynne. Dopóki podmiana nie nastąpi, gwarancja „rdzeń wpisu niemodyfikowalny poza oknem korekty" nie obowiązuje, mimo że sprawdzenia w `supabase/tests/rls_checks.sql` przechodzą (podmieniają funkcję u siebie). Funkcja nie ma `EXECUTE` dla `anon` ani `authenticated` (testing-schema-invariants, INVARIANT 7), bo nie sprawdza właściciela leku — jeśli ekran potrzebuje stanu okna w przeglądarce, S-05 dodaje osobne RPC ze sprawdzeniem `auth.uid()`, a nie przywraca uprawnienia.
- **Dług przejęty z S-03 (impl-review F6a):** pomyłki w zmianie dawki nie da się dziś cofnąć. Przykład: „2 tabletki” zapisane dziś zamiast „1 tabletka” — druga zmiana z dzisiejszą datą kończy się `DP002`, więc zostaje tylko zmiana od jutra, a w historii jednodniowy okres z dawką, której nikt nie brał. S-05 definiuje prawdziwe okno korekty (24 h od zapisu, wspólne z dzienniczkiem); razem z nim musi powstać droga poprawy świeżo zapisanej zmiany w tym oknie (poprawa treści okresu albo cofnięcie zmiany), inaczej fałszywy okres trafi do zestawienia w S-06. Przy okazji wyrównać limit 14 dni wstecz (`c_max_days_back` w `change_dosage` i `DOSAGE_CHANGE_MAX_DAYS_BACK`) z oknem korekty i rozstrzygnąć drogę dla zmiany starszej niż 14 dni — dziś jej nie ma.
- **Informacja o oknie korekty (Q-3, 2026-10-05):** po zapisie wpisu — i analogicznie leku oraz zmiany dawki — użytkowniczka widzi, do kiedy może go poprawić, jako konkretną datę i godzinę („do jutra, 21:14”), nie „24 h”. Ta sama informacja przy wpisie na liście, dopóki okno jest otwarte. Godzinę wylicza serwer, żeby zgadzała się z blokadą w bazie. Tekst w module copy, przez filtr słów zakazanych.
- **Status:** done

### S-06: Złożone pytanie do lekarza po zapisaniu objawu

- **Outcome:** Użytkowniczka po zapisaniu objawu widzi gotowe pytanie do lekarza, zestawiające ten objaw z okresami dawkowania przyjmowanych leków, z pierwszeństwem dla leków rozpoczętych, zmienionych lub odstawionych w oknie czasowym objawu (od 90 dni przed pierwszym wpisem tego objawu do bieżącego wpisu); pozostałe leki zostają dostępne pod zwinięciem.
- **Change ID:** `symptom-question-composer`
- **Issue:** #17
- **PRD refs:** US-02, FR-010, FR-012
- **Prerequisites:** S-03, S-05
- **Parallel with:** S-07
- **Blockers:** —
- **Unknowns:**
  - ~~Jak długie jest okno czasowe poprzedzające objaw?~~ — Rozstrzygnięte 2026-10-06 (#5). Wymogi dla tego plasterka: okno od 90 dni przed pierwszym wpisem danego objawu do bieżącego wpisu; 90 dni jako jedna stała w kodzie, nie ustawienie użytkowniczki; zdarzeniem w oknie jest rozpoczęcie, zmiana dawki i odstawienie (`discontinued_on`), nie usunięcie pozycji dodanej przez pomyłkę; leki w oknie ułożone według dat zdarzeń, nigdy według podejrzenia; zdanie o odstawieniu wyłącznie informuje („Od 03.03.2026 nie biorę leku X.”; brzmienie „nie przyjmuję” zmienione przy planie S-06, bo trafia w rdzeń filtra FR-012 `nie przyjmuj`). Szczegóły: `prd.md`, `## Open Questions`, pytanie 4.
  - ~~Co daje wpis z kilkoma objawami?~~ — Rozstrzygnięte 2026-10-06 (#7): osobne pytanie dla każdego objawu, bo każdy ma własne okno czasowe; objawy nie są łączone we wspólne pytanie. Na ekranie po zapisie pierwsze pytanie rozwinięte, pozostałe zwinięte pod nazwą objawu. Wpis bez leków zapisuje się, ale pytanie nie powstaje.
  - ~~Czy złożone pytanie przelicza się przy każdym wyświetleniu, czy zapisuje się w chwili złożenia?~~ — Rozstrzygnięte 2026-10-07 (plan S-06): przeliczane przy każdym wyświetleniu z bieżących danych, bez tabeli w bazie. Poprawka wpisu w oknie korekty (S-07) i cofnięcie zmiany dawki trafiają do pytania same, a S-09 nie ma czego dodatkowo kasować. Koszt przyjęty świadomie: zmiana stałej okna przestawia kolejność leków także w starych pytaniach.
- **Risk:** Drugie miejsce, w którym produkt mógłby wyrządzić szkodę. Wynikiem ma być zdanie do rozmowy z lekarzem, nie lista podejrzanych leków ani ocena ryzyka. Zestawienie trafiające zawsze przestaje cokolwiek znaczyć — okno czasowe oparte na okresach dawkowania z S-03 usuwa większość szumu, dlatego S-03 jest wymaganiem wstępnym, a nie równoległym plasterkiem.
- **Dług przejęty z S-05 (plan-review F5):** nie ma drogi cofnięcia zmiany dawki. Przykład: zmiana zapisana przy złym leku — poprawa w oknie korekty może tylko przywrócić poprzednią dawkę, a wtedy w historii zostają dwa kolejne okresy z tą samą dawką i data „zmiany”, której nie było. S-05 odrzuca taką poprawę kodem `DP010`, więc fałszywa zmiana zostaje widoczna jako zmiana. S-06 daje pierwszeństwo lekom zmienionym w oknie przed objawem, więc taki lek dostałby pierwszeństwo bez powodu. Przed wdrożeniem S-06 trzeba rozstrzygnąć cofnięcie zmiany (scalenie okresów w oknie korekty) albo pomijanie zmian bez różnicy dawki. **Zamknięty 2026-10-07 w S-06 (faza 1):** najnowszy okres powstały ze zmiany dawki da się cofnąć w jego oknie korekty (`undo_dosage_change`); poprzedni okres trwa dalej bez daty końca. `DP010` zostaje i wskazuje cofnięcie zmiany.
- **Status:** done

### S-07: Okno korekty wpisu dzienniczka

- **Outcome:** Użytkowniczka może poprawić wpis dzienniczka w oknie korekty; po jego zamknięciu rdzeń wpisu — data, godzina, objawy, nasilenie — jest niemodyfikowalny, a edytowalna zostaje notatka. Usunięcie wpisu zarezerwowane dla pozycji dodanych przez pomyłkę.
- **Change ID:** `journal-correction-window`
- **Issue:** #18
- **PRD refs:** FR-009
- **Prerequisites:** S-05
- **Parallel with:** S-06, S-08
- **Blockers:** —
- **Unknowns:**
  - ~~Jak długo trwa okno korekty wpisu dzienniczka?~~ — rozstrzygnięte 2026-10-05 (issue #4): 24 h od chwili zapisu, zegarem serwera, wspólne z lekami. Szczegóły: `prd.md`, `## Open Questions`, pytanie 5.
- **Risk:** Swobodna edycja po fakcie daje obraz ładniejszy niż prawdziwy, a dzienniczek jest wart tyle, ile jego kompletność. Samo okno powstaje w S-05 (reguła w bazie i informacja „do kiedy” po zapisie i na liście); S-07 dokłada ekran poprawy i usunięcia wpisu w oknie oraz edycję notatki po jego zamknięciu. Poprawka w oknie zmienia wpis, który zasilił już złożone pytanie z S-06 — pytanie musi iść za poprawionym wpisem. Spełnione przez S-06: pytanie jest przeliczane przy każdym wyświetleniu, więc S-07 nie musi go aktualizować.
- **Status:** ready

### S-08: Sekcja „Wizyta"

- **Outcome:** Użytkowniczka może przed wizytą otworzyć sekcję „Wizyta" i zobaczyć w jednym miejscu wykryte możliwe kolizje oraz złożone pytania o zbieżność objawów z okresami dawkowania.
- **Change ID:** `doctor-visit-summary`
- **Issue:** #19
- **PRD refs:** US-03, FR-011, FR-012
- **Prerequisites:** S-02, S-06
- **Parallel with:** S-07, S-09
- **Blockers:** —
- **Unknowns:**
  - ~~Ile pytań pokazuje sekcja dla objawu zapisanego wiele razy?~~ — Rozstrzygnięte 2026-10-06 (#7): jedno aktualne pytanie na objaw, złożone z najnowszego wpisu tego objawu. Bez tego objaw zapisany 30 razy dałby 30 prawie identycznych pytań. Zależy od rozstrzygnięcia w S-06, czy pytanie jest zapisywane, czy przeliczane — S-06 rozstrzygnęło: przeliczane.
  - Sposób odczytu danych do pytań — ustali plan S-08. S-08 zbiera objawy z różnych wpisów, a `loadDoctorQuestions` z S-06 (`src/lib/services/doctor-question-data.ts`) czyta jeden wpis; wspólne są typy i składanie pytania (`composeDoctorQuestion`). Uwaga dla planu: zapytanie o wszystkie wpisy obcina limit `max_rows = 1000` (`supabase/config.toml:18`); przy sortowaniu od najnowszego odpada najstarszy wpis, który wyznacza początek okna 90 dni (plan-review S-06, F3). — Owner: plan S-08. Block: no.
  - ~~Co pokazuje pusta sekcja?~~ — Rozstrzygnięte 2026-10-06 (#7): bez leków i bez wpisów — jedno wprowadzenie zamiast dwóch pustych części („tu zbiorą się możliwe kolizje i pytania do lekarza”) z przyciskami „Dodaj lek” i „Zapisz objaw”. W pozostałych przypadkach każda część ma własny pusty stan. Kolizje zależnie od liczby bieżących leków: 0 — brak leków i odnośnik do dodania; 1 — pary sprawdzane są przy co najmniej dwóch lekach; 2+ — „wśród bieżących leków nie znaleziono sprawdzanej pary” z notą o niepełnym zbiorze par (teksty istnieją w `src/lib/copy/interactions.ts`). Rozróżnienie jest konieczne, bo „nie znaleziono pary” przy zerze lub jednym leku jest nieprawdą. Pytania: pojawiają się po zapisaniu objawu, z odnośnikiem do dzienniczka. Zawsze widoczna zachęta, że o każdy lek i objaw można zapytać lekarza lub farmaceutę. Nowe teksty przechodzą filtr FR-012.
- **Risk:** Sekcja nie wylicza niczego ponad to, co powstało w S-02 i S-06 — zbiera gotowe treści. Przeliczanie czegokolwiek od nowa rozjechałoby ją z treściami widocznymi przy lekach. To jednocześnie moment odbioru wartości całego produktu, więc język informacyjny musi się tu utrzymać bez wyjątku. Próg szybkości z PRD (#6): główna treść sekcji widoczna w ≤ 2,5 s (Lighthouse Mobile, LCP) — pomiar należy do tego plasterka.
- **Status:** planning

### S-09: Usunięcie konta kasuje wszystkie dane

- **Outcome:** Użytkowniczka może usunąć konto, co bezpowrotnie kasuje wszystkie powiązane dane — leki, okresy dawkowania, wpisy o samopoczuciu i złożone pytania — bez kopii zachowanej „na wszelki wypadek".
- **Change ID:** `account-deletion-cascade`
- **Issue:** #20
- **PRD refs:** FR-001, `## Non-Functional Requirements` (bezpowrotne skasowanie danych po usunięciu konta)
- **Prerequisites:** S-01, S-02, S-05, S-06
- **Parallel with:** S-07, S-08
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Operacja nieodwracalna, a zakres kasowania rośnie z każdą nową tabelą — dlatego sekwencjonowana po tym, jak powstały wszystkie tabele z danymi konta (S-01 dla zapisu akceptacji warunków, S-02 dla leków i okresów, S-05 dla dzienniczka, S-06 dla złożonych pytań). S-01 i S-06 dopisane 2026-09-26: wcześniej brakowało ich w wymaganiach wstępnych, choć obie tworzą dane przypisane do konta. Zaplanowana wcześniej przeoczyłaby dane dodane później i zostawiła sieroty, czego samo przejście ścieżki nie ujawni. Przy publicznej rejestracji to także jedyna droga, którą strona prywatności z S-01 może wskazać jako „jak usunąć konto” — do czasu S-09 strona musi mówić, jak zrobić to inaczej.
- **Status:** proposed

### S-11: Tryb ciemny

- **Outcome:** Użytkowniczka może korzystać z produktu w trybie ciemnym na wszystkich ekranach M-1, z czytelnością na tym samym poziomie co w trybie jasnym.
- **Change ID:** `dark-mode`
- **Issue:** #37
- **PRD refs:** MS-04, `## Non-Functional Requirements` (czytelność na telefonie)
- **Prerequisites:** S-01, S-04, S-07, S-08, S-09, S-10 (czyli wszystkie ekrany kamienia milowego)
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:**
  - ~~Jak wygląda ciemna paleta?~~ — rozstrzygnięte w F-04 (2026-09-26): ciemne wartości tokenów zaakceptowane na makiecie i zapisane w bloku `.dark` w `src/styles/global.css`, opis w `design-draft.md` `## Paleta ciemna`. W S-11 zostaje przełącznik, decyzja „ręcznie czy za systemem” i przegląd ekranów w trybie ciemnym.
  - Czy tryb wybiera się ręcznie, idzie za ustawieniem systemu, czy jedno i drugie? — Owner: użytkowniczka. Block: no.
- **Risk:** Ostatni, bo nie wnosi nic do głównego przepływu, a przegląd ma sens dopiero na ekranach, które istnieją — to praca w trybie poprawiania istniejących widoków, nie budowania nowych. Tani tylko wtedy, gdy plasterki trzymały się nazwanych kolorów z F-04; każdy kolor wpisany na sztywno wychodzi tutaj jako ekran do przeróbki. Kolory funkcjonalne muszą zachować znaczenie: bursztyn możliwej interakcji w ciemnej wersji nadal nie może wyglądać jak alarm ani jak czerwień.
- **Status:** proposed

## Backlog Handoff

| Roadmap ID | Change ID                              | Suggested issue title                                     | Ready for `/10x-plan` | Notes                                                  | Issue |
| ---------- | -------------------------------------- | --------------------------------------------------------- | --------------------- | ------------------------------------------------------ | ----- |
| F-01       | `medication-schema-rls`                | Schemat leków i okresów dawkowania z RLS                  | —                     | done                                                   | #9    |
| F-02       | `interaction-rules-seed`               | Pary kolizji na grupach ATC i rejestr leków               | —                     | done                                                   | #10   |
| F-03       | `symptom-catalog-seed`                 | Zamknięta lista objawów ze słowami wyszukiwania           | —                     | done                                                   | #11   |
| F-04       | `app-shell-visual-foundation`          | Wspólna warstwa wizualna i szkielet wnętrza               | —                     | done                                                   | #35   |
| F-05       | `email-sender-smtp`                    | Własny nadawca maili (SMTP na domenie lekomapa.pl)        | yes                   | Przed wpuszczeniem innych osób; praca w panelach i DNS | #44   |
| F-06       | `production-observability`             | Śledzenie błędów i monitor dostępności (Sentry)           | yes                   | Uruchom `/10x-plan production-observability`           | #74   |
| S-01       | `terms-acceptance-on-signup`           | Warunki „prototyp”, strona prywatności i ekrany wejściowe | yes                   | Uruchom `/10x-plan terms-acceptance-on-signup`         | #12   |
| S-10       | `password-recovery`                    | Odzyskiwanie dostępu przez ustawienie nowego hasła        | —                     | in-progress; zostały kroki ręczne 3.7–3.8              | #36   |
| S-02       | `add-medication-with-interaction-flag` | Dodanie leku po nazwie handlowej ze znacznikiem kolizji   | —                     | done                                                   | #13   |
| S-03       | `dosage-period-history`                | Zmiana dawkowania zamyka okres i otwiera nowy             | —                     | done                                                   | #14   |
| S-04       | `discontinue-medication`               | Zakończenie przyjmowania leku z datą odstawienia          | —                     | done                                                   | #15   |
| S-05       | `symptom-journal-entry`                | Wpis o samopoczuciu z datą, godziną i objawami            | —                     | done                                                   | #16   |
| S-06       | `symptom-question-composer`            | Złożone pytanie do lekarza po zapisaniu objawu            | yes                   | Uruchom `/10x-plan symptom-question-composer`          | #17   |
| S-07       | `journal-correction-window`            | Okno korekty wpisu dzienniczka                            | yes                   | Uruchom `/10x-plan journal-correction-window`          | #18   |
| S-08       | `doctor-visit-summary`                 | Sekcja „Wizyta"                                           | no                    | Wymaga S-02 i S-06                                     | #19   |
| S-09       | `account-deletion-cascade`             | Usunięcie konta kasuje wszystkie powiązane dane           | no                    | Wymaga S-01, S-02, S-05 i S-06                         | #20   |
| S-11       | `dark-mode`                            | Tryb ciemny                                               | no                    | Ostatnia pozycja M-1                                   | #37   |

## Open Roadmap Questions

Brak otwartych pytań.

Rozstrzygnięte:

- (#7) ~~**Czy kryteria akceptacji historii US-01…US-04 zostały zaakceptowane?**~~ — 2026-10-06: przejrzane i zestawione z kodem S-02…S-05. Do historii przeniesione reguły, które kod już miał (znacznik przy obu lekach z pary, daty najwyżej 14 dni wstecz i nie z przyszłości, wpis dzienniczka bez wymogu leków). Kryterium US-01 o leku z ulotki poprawione do stanu kodu: substancja nierozpoznana nie jest objęta żadną parą i produkt to mówi. Wymogi dopisane do S-06 (osobne pytanie na każdy objaw wpisu) i S-08 (jedno aktualne pytanie na objaw, pusty stan zależny od liczby leków, wprowadzenie przy braku leków i objawów); stała lista bieżących leków w sekcji w `## Parked`. Zmienia US-01…US-04, FR-008, FR-010 i FR-011 w PRD.

- (#6) ~~**Jakie mierzalne progi obowiązują dla czasu odpowiedzi i dostępności?**~~ — 2026-10-06: trzy progi zamiast procentu dostępności. Szybkość: LCP ≤ 2,5 s (Lighthouse Mobile) na liście leków, zapisie objawu i sekcji „Do omówienia z lekarzem”. Błędy: każdy 5xx i 1102 dociera do autorki mailem przez Sentry, wyłącznie po stronie serwera. Dostępność: przerwa dociera mailem w ciągu 15 minut, a monitor Sentry odpytujący stronę kontrolną utrzymuje darmowy Supabase przy życiu. Nowa pozycja F-06 (#74); wymogi dopisane do S-01 (Sentry na stronie prywatności) i S-08 (pomiar szybkości). Zmienia `## Non-Functional Requirements` w PRD.
- (#5) ~~**Jak długie jest okno czasowe poprzedzające objaw?**~~ — 2026-10-06: od 90 dni przed pierwszym wpisem danego objawu do bieżącego wpisu, stała w kodzie; zdarzeniem jest rozpoczęcie, zmiana dawki i odstawienie leku. Powód punktu odniesienia: przy długim czekaniu na wizytę okno liczone od bieżącego wpisu spychałoby pod zwinięcie lek, po którym objaw się zaczął. Wymogi dopisane do S-06; zmienia brzmienie US-02 i FR-010 w PRD.
- (#33) ~~**Gdzie leżą prawdziwe dane autorki?**~~ — 2026-10-06: autorka korzysta z publicznej instancji demonstracyjnej z danymi przykładowymi, jak wszyscy. Nie przyjmuje leków, więc nie ma prawdziwych danych do ochrony; osobna instancja odrzucona jako koszt bez potrzeby. Bez nowych pozycji w roadmapie.
- (#8) ~~**Jak brzmi treść warunków korzystania?**~~ — 2026-10-06: treść wersji 1 w `context/foundation/terms-of-use-v1.md`, z podziałem na część stałą i blok „Na czas prototypu”, żeby wyjście z prototypu kosztowało nową treść, a nie przebudowę. Rozszerza zakres S-01: wersje warunków niezmienne, porównanie wersji przy logowaniu z ekranem ponownej akceptacji, warunki na osobnej stronie z odnośnikiem przy polu akceptacji (PRD `## Access Control`).
- (#34) ~~**Czy komunikaty ekranów wejściowych zdradzają, że konto o danym adresie istnieje?**~~ — 2026-10-06: wariant bezpieczniejszy. Rejestracja zawsze kończy się ekranem „sprawdź skrzynkę” z podpowiedzią o odzyskaniu dostępu, prośba o odzyskanie zawsze „jeśli konto istnieje, wysłaliśmy wiadomość”, nieudane logowanie zawsze „nieprawidłowy e-mail lub hasło”; surowe komunikaty Supabase nie trafiają na ekran. Powód: fakt prowadzenia dzienniczka leków jest daną o zdrowiu. Wymogi dopisane do S-01 i S-10; wariant z mailem do właściciela adresu w `## Parked` (po F-05).
- (#4) ~~**Jak długo trwa okno korekty wpisu dzienniczka?**~~ — 2026-10-05: 24 h od chwili zapisu, zegarem serwera, nie od daty objawu; usunięcie wpisu tylko w oknie; użytkowniczka widzi konkretną datę i godzinę końca okna. To samo okno obowiązuje leki i okresy dawkowania — warunek zdarzeniowy odpadł (zamyka dług F6a z S-03). Odblokowało S-07; zmienia zakres S-05 (reguła okna dla leków i dzienniczka).
- ~~**PRD do uzupełnienia o publiczność MVP**~~ — 2026-09-26: PRD przejęło prototyp certyfikacyjny na publicznym adresie z otwartą rejestracją (`## User & Persona`), warstwę „prototyp” (`## Access Control`), polski interfejs w trybie jasnym i ciemnym (`## Non-Functional Requirements`) oraz odłożenie pełnej warstwy prawnej z wypisanymi granicami (`## Non-Goals`). Punkty MS-01…MS-04 mają od tej chwili odpowiednik w PRD. Bez issue — rozstrzygnięte w tej samej sesji.
- (#2) ~~**Ile par substancji czynnych i z jakiego źródła trafia do zbioru reguł?**~~ — 2026-09-21: około 20 par na grupach ATC (10–14 grup, wynikowo ~40 substancji), zbierane ręcznie z ulotek i charakterystyk produktów leczniczych. Nazwy handlowe i skład z Rejestru Produktów Leczniczych, zawężonego do wybranych grup. Użytkownik wpisuje nazwę handlową; lek spoza rejestru dodawany przez wskazanie substancji z ulotki. Odblokowało F-02, a przez nie S-02, S-03, S-04, S-08, S-09.
- (#3) ~~**Ile pozycji liczy zamknięta lista objawów i skąd pochodzi?**~~ — 2026-09-21: 34 pozycje w ośmiu kategoriach układów, dobrane jako objawy zauważalne przez pacjenta i opisane w ulotkach jako bardzo częste i częste. Źródłem jest zbiór ustalony w sesji rozstrzygania, nie obchód ulotek ani słownik kodowany — katalog nie jest wejściem reguły, bo zestawianie objawu z lekami idzie wyłącznie po osi czasu. Przy pozycji potoczne określenia jako słowa wyszukiwania oraz kolumna na kod źródłowy, pusta w M-1. Objaw nieujęty w katalogu zostaje w notatce własnymi słowami. Odblokowało F-03, a przez nie S-05, S-06, S-07, S-08, S-09.

## Parked

- **Lista bieżących leków z dawkami w sekcji „Wizyta”** — Why parked: sekcja nigdy nie byłaby pusta, a lista „biorę X, Y, Z” to dokładnie to, co pada na wizycie. Rozszerza jednak FR-011 poza zbieranie gotowych treści, więc wymaga zmiany PRD. Odłożone 2026-10-06 przy przeglądzie kryteriów (#7).
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
- **Pełna warstwa prawna przetwarzania danych (RODO)** — Why parked: rozstrzygnięcie autorki 2026-09-26 (frame `mvp-scope-ui-and-data-processing`). Poza M-1: podstawa przetwarzania i osobna zgoda na dane o zdrowiu (art. 9), lista podmiotów przetwarzających, zasady retencji, pełna polityka prywatności. Warunek powrotu: wyjście z fazy prototypu — bez tej warstwy produkt nie może zapraszać do wpisywania prawdziwych danych o zdrowiu. W M-1 zostają nienaruszone: izolacja danych per-konto (F-01, done), bezpowrotne usunięcie konta (S-09), akceptacja warunków z datą i wersją (S-01), warstwa „prototyp” — warunki wersja 1, strona prywatności, stały pasek (F-04, S-01). Komunikat o prototypie zmniejsza ryzyko, że ktoś wpisze prawdziwe dane o zdrowiu, ale go nie wyklucza, a e-mail konta jest daną osobową niezależnie od komunikatu.
- **Techniczne ograniczenia prototypu: automatyczne czyszczenie kont, rejestracja z zaproszeniem** — Why parked: wariant „najlepszy” z frame'a odrzucony jako koszt ponad potrzebę prototypu; automatyczne czyszczenie kont kolidowałoby z nienaruszalnością historii.
- **Mail do właściciela adresu przy próbie ponownej rejestracji** — Why parked: wariant „najlepszy” z rozstrzygnięcia #34 (2026-10-06). Usuwa koszt wariantu bezpieczniejszego — osoba, która zapomniała o koncie, dostaje maila „ktoś próbował założyć konto na twój adres; jeśli to ty, zaloguj się albo odzyskaj dostęp”. Wymaga własnego nadawcy maili i własnej logiki wysyłki (czy Supabase ma to wbudowane — niesprawdzone). Warunek powrotu: F-05 `done`. Issue: #67.
- **Obserwowalność: logger, śledzenie błędów, metryki** — Why parked: baseline zgłasza `absent`, a PRD nie ma mierzalnych progów czasu odpowiedzi i dostępności (Otwarte pytanie 5). Przy celu `speed` fundament bez progu do spełnienia byłby zgadywaniem zakresu.

## Milestone History

(Pusta — M-1 jest pierwszym kamieniem milowym.)

## Done

(Pusta przy pierwszym wygenerowaniu. `/10x-archive` dopisuje tu wpis i przestawia status pozycji na `done`, gdy zarchiwizowana zmiana ma pasujący Change ID.)

- **F-01: (fundament) schemat leków i okresów dawkowania z RLS i ścieżką weryfikacji** — Archived 2026-09-22 → `context/archive/2026-09-22-medication-schema-rls/`. Lesson: —.
- **F-02: (fundament) pary kolizji na grupach ATC i rejestr leków dostarczone z produktem** — Archived 2026-09-26 → `context/archive/2026-09-23-interaction-rules-seed/`. Lesson: —.
- **F-03: (fundament) katalog 34 objawów w 8 kategoriach ze słowami wyszukiwania** — Archived 2026-09-27 → `context/archive/2026-09-26-symptom-catalog-seed/`. Lesson: —.
- **F-04: (fundament) nazwane kolory, polski interfejs, pasek demonstracyjny, szkielet wnętrza** — Archived 2026-09-27 → `context/archive/2026-09-26-app-shell-visual-foundation/`. Lesson: —.
- **S-02: Użytkowniczka może dodać przyjmowany preparat, wpisując jego nazwę handlową i podając dawkowanie z datą rozpoczęcia; przy nowo dodanej pozycji widzi dyskretny znacznik możliwej kolizji, a w szczegółach leku pełną treść informacji wraz ze składem preparatu. Preparat spoza rejestru dodaje, wskazując substancję czynną z ulotki, i uczestniczy w regułach tak samo.** — Archived 2026-10-01 → `context/archive/2026-09-29-add-medication-with-interaction-flag/`. Lesson: —.
- **S-03: Użytkowniczka może zmienić dawkowanie leku, przez co bieżący okres dawkowania zostaje zamknięty, a nowy otwarty; lek zostaje jedną pozycją na liście z historią okresów od–do.** — Archived 2026-10-05 → `context/archive/2026-10-04-dosage-period-history/`. Lesson: —.
- **S-05: Użytkowniczka może dodać wpis o samopoczuciu z datą i godziną wypełnionymi domyślnie na moment zapisu i możliwymi do cofnięcia, zaznaczając jeden lub więcej objawów z zamkniętej listy, opcjonalnie podając nasilenie i własną notatkę.** — Archived 2026-10-05 → `context/archive/2026-10-05-symptom-journal-entry/`. Lesson: —.
- **S-04: Użytkowniczka może zakończyć przyjmowanie leku z datą odstawienia — lek znika z listy aktualnych, ale zostaje w historii i nadal tłumaczy dawne wpisy; trwałe usunięcie pozycji zarezerwowane dla pozycji dodanych przez pomyłkę.** — Archived 2026-10-06 → `context/archive/2026-10-05-discontinue-medication/`. Lesson: —.
- **S-06: Użytkowniczka po zapisaniu objawu widzi gotowe pytanie do lekarza, zestawiające ten objaw z okresami dawkowania przyjmowanych leków, z pierwszeństwem dla leków rozpoczętych, zmienionych lub odstawionych w oknie czasowym objawu (od 90 dni przed pierwszym wpisem tego objawu do bieżącego wpisu); pozostałe leki zostają dostępne pod zwinięciem.** — Archived 2026-10-07 → `context/archive/2026-10-06-symptom-question-composer/`. Lesson: —.
- **S-01: Użytkowniczka może przed założeniem konta przeczytać krótką stronę prywatności, założyć konto, świadomie akceptując warunki korzystania w wersji 1 „prototyp”, i zalogować się loginem i hasłem — na ekranach wejściowych w układzie z makiety.** — Archived 2026-10-08 → `context/archive/2026-10-07-terms-acceptance-on-signup/`. Lesson: —.
