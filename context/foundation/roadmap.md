---
project: lekomapa
version: 3
status: draft
created: 2026-09-21
updated: 2026-10-17
prd_version: 1
main_goal: quality
top_blocker: time
milestone_id: szlif-i-czytelnosc-ekranow
milestone_seq: 2
milestone_status: open
---

# Roadmap: lekomapa

> Wyprowadzona z opisu autorki z 14.10.2026 (lista pozycji na M-2), `context/foundation/prd.md` (v1) dla pozycji odłożonych w M-1 oraz sprawdzonego stanu repozytorium. Pełna treść M-1 (pozycje, długi, rozstrzygnięcia) zostaje w historii gita: `context/foundation/roadmap.md` w commicie `68a936b`.
> Edytowana w miejscu; archiwizowana, gdy przestanie obowiązywać.
> Pozycje poniżej są ułożone w kolejności zależności. Tabela „At a glance” jest indeksem.
> Realizacja prowadzona jest w GitHub Issues (`krychaimago/lekomapa`, milestone `M-2: Szlif i czytelność ekranów`, #104–#114 i #120); numery issue przy pozycjach i w tabeli „Backlog Handoff”. Roadmapa pozostaje źródłem prawdy o zakresie kamienia milowego.

## Milestone

**M-2: Szlif i czytelność ekranów** — Status: open

- **Intent:** Aplikacja z M-1 jest gotowa do oddania; M-2 poprawia to, co już jest — czytelność ekranów przy dużej ilości danych, wygoda na telefonie, rozpoznawalny wygląd — a dopiero potem dokłada nowe funkcje. Każda pozycja to dodatek: wchodzi osobnym PR-em, dopiero gdy jest skończona, więc `main` przez cały czas zostaje w stanie do oddania.
- **Source materials:** opis autorki z 14.10.2026 (punkty zakresu poniżej); `context/foundation/prd.md` (v1) — `## Success Criteria` (oś czasu jako kryterium drugorzędne) i pozycje `## Parked` z M-1 (lista bieżących leków w „Wizycie”, oś czasu, eksport).
- **Done when:** każda pozycja S-NN poniżej ma status `done` albo została decyzją autorki przeniesiona do `## Parked`. Termin oddania 04.11.2026; pozycje oznaczone „zapasowy” mogą przejść na 06.12.2026 albo 10.01.2027 — kamień milowy zamyka się wynikiem, nie datą.
- **Scope anchors:** punkty z opisu autorki (w nawiasie numer z jej listy; pozycja 1, błąd w konsoli, zamknięta — to rozszerzenie przeglądarki, nie aplikacja):
  - MS-01 (2): przycisk „Usuń konto” wyróżniony jako akcja nieodwracalna; wymaga jawnego wyjątku w regule `destructive*`.
  - MS-02 (3): zakładka „Dzienniczek” przemianowana na „Dziennik”, żeby mieściła się na małym ekranie.
  - MS-03 (4): oś czasu — leki i objawy zestawione graficznie z danych, które aplikacja już ma; podlega FR-012.
  - MS-04 (5a): szczegóły leku czytelne przy wielu interakcjach.
  - MS-05 (5b): „Wizyta” czytelna przy wielu lekach i objawach — bez powtarzania noty przy każdej karcie i tych samych leków w każdym pytaniu.
  - MS-06 (6): wybór nasilenia przy samym zaznaczonym objawie, widoczny na telefonie.
  - MS-07 (7): graf leków i ich możliwych interakcji — leki jako punkty, linia między parą; podlega FR-012.
  - MS-08 (8): po zalogowaniu ekran z treścią zamiast pustego `/dashboard` ze startera.
  - MS-09 (9): ikona lekomapy — rozpoznawalny znak aplikacji.
  - MS-10 (10): elementy graficzne, żeby ekrany nie były puste; ilustracje nie straszą i nie sugerują zagrożenia (FR-012).
  - MS-11 (11): lista bieżących leków z dawkami w „Wizycie”; rozszerza FR-011.
  - MS-12 (12): eksport własnych danych — opcjonalnie, tylko jeśli zostanie czas.
  - MS-13 (zgłoszenie autorki z 15.10.2026, #120): na telefonie nagłówek z „Wyloguj się” i przełącznikiem trybu zostaje na ekranie przy przewijaniu, tak jak pasek wersji demonstracyjnej.

## Vision recap

Użytkowniczka przyjmuje kilka leków przepisanych przez różnych lekarzy i żaden z nich nie widzi pełnego zestawu. Produkt zbiera substancje czynne, okresy dawkowania i wpisy o samopoczuciu, a na wyjściu daje oznaczenie możliwej kolizji przy leku oraz złożone pytanie do lekarza. Momentem odbioru wartości jest wizyta — dlatego w M-2 to ekran „Wizyta” ma być czytelny także wtedy, gdy danych jest dużo. Produkt nigdy nie stwierdza przyczyny objawu i nigdy nie sugeruje zmiany leczenia.

## North star

**S-05: użytkowniczka czyta „Wizytę” przy wielu lekach i objawach, z listą bieżących leków z dawkami** — przy celu `quality` to poprawa w miejscu, w którym produkt daje wartość: lista „biorę X, Y, Z” to dokładnie to, co pada w gabinecie, a dziś przy wielu danych właśnie ten ekran jest nieczytelny.

> Gwiazda przewodnia (north star) to tutaj ta pozycja, której dowiezienie najbardziej dowodzi, że kamień milowy się udał — dlatego stoi zaraz po szybkich poprawkach, choć niczego od nich nie wymaga.

## At a glance

| ID   | Change ID                        | Outcome (użytkowniczka może …)                                                    | Prerequisites | PRD refs                     | Status   |
| ---- | -------------------------------- | --------------------------------------------------------------------------------- | ------------- | ---------------------------- | -------- |
| S-01 | delete-account-button-emphasis   | od razu rozpoznać „Usuń konto” jako akcję nieodwracalną                           | —             | MS-01, FR-001                | done     |
| S-02 | journal-tab-rename               | widzieć w menu krótką zakładkę „Dziennik”                                         | —             | MS-02                        | done     |
| S-03 | dashboard-landing                | po zalogowaniu trafić od razu na listę leków                                      | —             | MS-08                        | done     |
| S-04 | app-icon                         | rozpoznać lekomapę po ikonie w karcie, na pasku bocznym i na ekranie telefonu     | —             | MS-09                        | done     |
| S-05 | visit-readable-with-current-meds | przeczytać „Wizytę” przy wielu danych, z listą bieżących leków z dawkami          | —             | MS-05, MS-11, FR-011, FR-007 | done     |
| S-06 | severity-next-to-symptom         | wybrać nasilenie przy samym objawie, także na telefonie                           | —             | MS-06, FR-008                | done     |
| S-07 | medication-interactions-compact  | przejrzeć wiele możliwych kolizji leku bez długiego przewijania                   | —             | MS-04, FR-006, FR-007        | done     |
| S-08 | friendly-visuals                 | korzystać z ekranów, które nie są puste, z ilustracjami i wyglądem notatek        | S-03, S-05    | MS-10                        | proposed |
| S-09 | medication-symptom-timeline      | zobaczyć leki i objawy na jednej osi czasu                                        | S-05          | MS-03                        | proposed |
| S-10 | interaction-graph                | zobaczyć leki jako punkty i linie między parami, które mogą wchodzić w interakcję | S-09          | MS-07, FR-006, FR-007        | proposed |
| S-11 | data-export                      | pobrać własne dane z aplikacji                                                    | —             | MS-12                        | blocked  |
| S-12 | mobile-header-sticky             | na telefonie mieć „Wyloguj się” i przełącznik trybu zawsze w zasięgu              | —             | MS-13                        | done     |

## Streams

Pomoc nawigacyjna — grupuje pozycje dzielące łańcuch wymagań wstępnych albo temat. Kolejność obowiązująca nadal żyje w grafie zależności poniżej. ∥ = pozycje wzajemnie niezależne.

| Stream | Theme                 | Chain                                      | Note                                                                                                                      |
| ------ | --------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| A      | Szybkie poprawki      | `S-01` ∥ `S-02` ∥ `S-03` ∥ `S-04` ∥ `S-12` | Pierwsze, bo małe i widoczne od razu; każda osobnym PR-em. `S-12` dopisana 15.10.2026 ze zgłoszenia #120.                 |
| B      | Wizyta i wizualizacje | `S-05` → `S-09` → `S-10`                   | Gwiazda przewodnia, potem nowe funkcje; `S-09` wybiera sposób rysowania, `S-10` z niego korzysta.                         |
| C      | Czytelność ekranów    | `S-06` ∥ `S-07` → `S-08`                   | `S-06` i `S-07` niezależne; `S-08` dołącza do A przy `S-03` i do B przy `S-05`, bo ilustracje trafiają w ich puste stany. |
| D      | Dane na zewnątrz      | `S-11`                                     | Tylko jeśli zostanie czas; zablokowane do rozstrzygnięcia zasady z PRD o danych, które „nie opuszczają produktu”.         |

## Baseline

Co jest w repozytorium na dzień `2026-10-14` (sprawdzone w kodzie, potwierdzone przez autorkę). Cały przepływ M-1 działa na produkcji; poniżej tylko to, co dotyczy pozycji M-2.

- **Frontend:** present — Astro 5 SSR, React dla formularzy, Tailwind 4, shadcn/ui, tokeny kolorów w `src/styles/global.css` z trybem jasnym i ciemnym. Brak biblioteki wykresów i jakiegokolwiek wykresu SVG (jedyne `<svg>` to ikony trybu w `src/components/ThemeToggle.astro`); ikony z `lucide-react`. Brak ilustracji (`src/assets` nie istnieje; `public/template.png` ze startera nieużywany). Paginacji nie ma nigdzie.
- **Backend / API:** present — trasy domenowe leków, dzienniczka, konta, preferencji i `/api/health`. Brak eksportu danych (żadnego pobierania pliku).
- **Data:** present — leki z okresami dawkowania, dzienniczek z nasileniem zapisywanym osobno dla każdego objawu (`symptom_entry_items.severity`). Do osi czasu nadają się `loadQuestionMedications` (`src/lib/services/doctor-question-data.ts`, wszystkie leki konta z okresami) i `rpc("symptom_occurrences")` (daty wpisów każdego objawu); pełnych wpisów w czasie (nasilenie, notatka) nic jeszcze nie czyta.
- **Auth:** present — po zalogowaniu `/` → `/dashboard` (`src/pages/index.astro:6`); `/dashboard` to pusty ekran ze startera, wpisany w `INTERIOR_ROUTES` (`src/lib/navigation.ts:18`), z ok. 12 odwołaniami w smoke, testach i e2e.
- **Deploy / infra:** present — Cloudflare Workers, CI z bramkami lint/typy/build/smoke, wdrożenie po merge'u do `main`.
- **Observability:** present — Sentry po stronie serwera, monitor dostępności i strona kontrolna (F-06 z M-1).
- **Testy E2E:** Playwright skonfigurowany (`tests/e2e/`): logowanie, podwójne kliknięcie, tryb jasny/ciemny, galeria ciemnych ekranów. Brak testów leków, dzienniczka i „Wizyty” — autorka dopisuje je przy kolejnych pozycjach.

## Foundations

Brak. Wspólne podłoże osi czasu i grafu — sposób rysowania — wybiera `S-09`, pierwsza pozycja, która go potrzebuje, a `S-10` z niego korzysta. Osobny fundament bez widocznego efektu kosztowałby czas, który przy głównym ryzyku `time` jest najcenniejszy.

## Slices

### S-01: Wyróżniony przycisk „Usuń konto”

- **Outcome:** Użytkowniczka może od razu rozpoznać „Usuń konto” jako akcję nieodwracalną — na ekranie konta (przycisk prowadzący do potwierdzenia) i na ekranie potwierdzenia hasłem (przycisk, który faktycznie usuwa).
- **Change ID:** `delete-account-button-emphasis`
- **Issue:** #104
- **PRD refs:** MS-01, FR-001
- **Prerequisites:** —
- **Parallel with:** S-02, S-03, S-04, S-05, S-06, S-07
- **Blockers:** —
- **Unknowns:**
  - Wariant wyglądu — Owner: użytkowniczka przy planie. Block: no. Najszybszy: oba przyciski na pełnej czerwieni (przesądza: czerwień staje się także kolorem akcji). Optymalny: na `src/pages/konto.astro` czerwone obramowanie i tekst, na `src/pages/konto/usun.astro` pełna czerwień — czerwień pełna tylko tam, gdzie kliknięcie faktycznie usuwa; wymaga nowego wariantu przycisku i pary kontrastu 7 : 1 w `EXPLICIT_PAIRS`. Najlepszy: optymalny plus ikona i zdanie o skutku przy przycisku.
- **Risk:** Zmienia regułę projektu, nie tylko wygląd: `CLAUDE.md` i komentarz w `src/styles/global.css:31` mówią „`destructive*` wyłącznie dla błędów formularzy i techniki”, a komentarze przy obu przyciskach to powtarzają. Wyjątek musi być wąski — „nieodwracalna akcja na koncie” — i jawnie wpisany w obu miejscach, nigdy otwarcie czerwieni dla treści o lekach i objawach.
- **Termin:** konieczne przed 04.11.2026.
- **Status:** done

### S-02: Zakładka „Dziennik”

- **Outcome:** Użytkowniczka może widzieć w menu krótszą nazwę „Dziennik”, która mieści się na małym ekranie.
- **Change ID:** `journal-tab-rename`
- **Issue:** #105
- **PRD refs:** MS-02
- **Prerequisites:** —
- **Parallel with:** S-01, S-03, S-04, S-05, S-06, S-07
- **Blockers:** —
- **Unknowns:**
  - Zakres zmiany nazwy: tylko etykieta menu (`src/lib/navigation.ts:11`) i tytuł ekranu (`src/lib/copy/journal.ts:10`), czy także pozostałe teksty („Dzienniczek leków i samopoczucia” w `src/lib/copy/auth.ts:11`, wzmianki w `src/pages/wizyta.astro`). — Owner: plan. Block: no.
- **Risk:** Adresy `/dzienniczek/*` zostają — zmiana adresu psułaby zakładki, smoke i testy bez zysku dla użytkowniczki. PRD i dokumenty mówią dalej „dzienniczek”; zmiana dotyczy tekstu widocznego w interfejsie.
- **Termin:** konieczne przed 04.11.2026.
- **Status:** done

### S-03: Start na liście leków zamiast pustego `/dashboard`

- **Outcome:** Użytkowniczka może po zalogowaniu trafić od razu na listę leków; pusty ekran ze startera znika.
- **Change ID:** `dashboard-landing`
- **Issue:** #106
- **PRD refs:** MS-08
- **Prerequisites:** —
- **Parallel with:** S-01, S-02, S-04, S-05, S-06, S-07
- **Blockers:** —
- **Unknowns:**
  - Co z adresem `/dashboard` z zakładek i historii: przekierowanie na `/leki` czy brak strony. — Owner: plan. Block: no.
- **Risk:** Rozstrzygnięte 14.10.2026: usunąć i startować na `/leki` (najszybszy wariant). Odrzucone: start na `/wizyta` (czekałby na S-05) i osobny ekran „Start” (piąta zakładka na telefonie, trzecia kopia listy leków). Przesądza: produkt nie ma osobnego ekranu startowego; dodanie go później to nowa trasa, bez przeróbek. Zmiana dotyka drogi po zalogowaniu i kontroli warunków (`INTERIOR_ROUTES`), a odwołania do `/dashboard` w `scripts/smoke.mjs`, `scripts/auth/terms-gate.test.mjs` i `tests/e2e/dark-gallery.spec.ts` trzeba przepiąć — inaczej bramki padną albo przestaną sprawdzać to, co deklarują. Kandydat na test E2E: logowanie kończy się na liście leków.
- **Termin:** konieczne przed 04.11.2026.
- **Status:** done

### S-04: Ikona lekomapy

- **Outcome:** Użytkowniczka może rozpoznać lekomapę po ikonie — w karcie przeglądarki, na pasku bocznym obok nazwy i na ekranie telefonu po dodaniu skrótu.
- **Change ID:** `app-icon`
- **Issue:** #107
- **PRD refs:** MS-09
- **Prerequisites:** —
- **Parallel with:** S-01, S-02, S-03, S-05, S-06, S-07
- **Blockers:** —
- **Unknowns:**
  - Źródło znaku — Owner: użytkowniczka. Block: no. Najszybszy: prosty znak SVG zaproponowany przez agenta. Optymalny: wybór autorki z 2–3 propozycji. Najlepszy: projekt zewnętrzny — wtedy pozycja dostaje bloker (czekanie na projekt).
  - Miejsca: favicon (dziś `public/favicon.png` ze startera), pasek boczny (dziś sam tekst, `src/layouts/AppLayout.astro:27,60`), ikona na ekranie telefonu (brak `apple-touch-icon` i pliku `manifest`). — Owner: plan. Block: no.
- **Risk:** Ikona w karcie i na ekranie telefonu ma stały kolor, niezależny od trybu jasnego i ciemnego — to przesądza wybór kolorów znaku. Znak na pasku bocznym korzysta z tokenów. Znak nie może kojarzyć się z ostrzeżeniem (FR-012).
- **Termin:** konieczne przed 04.11.2026.
- **Status:** done

### S-05: Czytelna „Wizyta” z listą bieżących leków

- **Outcome:** Użytkowniczka może przeczytać „Wizytę” także przy wielu lekach i objawach: widzi listę bieżących leków z dawkami, notę poglądową bez powtórek przy każdej karcie, a pytania do lekarza bez tych samych leków powtarzanych w każdym z nich.
- **Change ID:** `visit-readable-with-current-meds`
- **Issue:** #108
- **PRD refs:** MS-05, MS-11, FR-011, FR-007
- **Prerequisites:** —
- **Parallel with:** S-01, S-02, S-03, S-04, S-06, S-07
- **Blockers:** —
- **Unknowns:**
  - Układ ekranu — Owner: plan (`/10x-ui`). Block: no. Najszybszy: nota raz nad listą kolizji, pytania zwinięte poza pierwszym. Optymalny: do tego lista bieżących leków pokazana raz, a pytania pokazują tylko leki ze zmianą w oknie 90 dni. Najlepszy: do tego podział na części z odnośnikami na górze ekranu. Paginacja odradzana: przy pokazywaniu ekranu lekarzowi trzeba by przełączać strony.
  - Kolejność na liście bieżących leków (np. alfabetycznie albo według daty rozpoczęcia) — Owner: plan. Block: no. Nigdy według kolizji (FR-012).
- **Risk:** Wymaga jawnej zmiany PRD przed implementacją. FR-011 dostaje listę bieżących leków z dawkami — sekcja przestaje tylko zbierać gotowe treści. FR-007 („nota przy każdej informacji o kolizji”) — tylko jeśli nota ma się pokazywać raz. Granice nienaruszone: sekcja niczego nie liczy od nowa; jedno aktualne pytanie na objaw; pusty stan nie brzmi jak potwierdzenie bezpieczeństwa; nota zawsze w tym samym widoku co informacja o kolizji, nigdy pod zwinięciem; pytanie po zapisaniu objawu (FR-010) bez zmian. Próg szybkości z PRD (LCP ≤ 2,5 s) obowiązuje ten ekran — pomiar po zmianie. Kandydat na test E2E: przy wielu lekach i objawach nota i lista bieżących leków są widoczne.
- **Termin:** konieczne przed 04.11.2026 (gwiazda przewodnia).
- **Status:** done

### S-06: Nasilenie przy samym objawie

- **Outcome:** Użytkowniczka może wybrać nasilenie tuż przy zaznaczonym objawie i widzi ten wybór na telefonie także wtedy, gdy zaznaczyła objaw z końca listy.
- **Change ID:** `severity-next-to-symptom`
- **Issue:** #109
- **PRD refs:** MS-06, FR-008
- **Prerequisites:** —
- **Parallel with:** S-01, S-02, S-03, S-04, S-05, S-07
- **Blockers:** —
- **Unknowns:**
  - Forma: przyciski nasilenia rozwijane przy polu wyboru objawu czy rozwijana lista. — Owner: plan (`/10x-ui`). Block: no.
- **Risk:** Zmiana samego układu: nasilenie jest już zapisywane osobno dla każdego objawu, w bazie i w interfejsie, ale przyciski stoją w sekcji „zaznaczone” nad wyszukiwarką i listą (`src/components/journal/SymptomPicker.tsx`), więc na telefonie są poza ekranem. Baza i FR-008 bez zmian. Objaw wychodzi wyłącznie na wąskim ekranie — kandydat na test E2E w widoku telefonu.
- **Termin:** konieczne przed 04.11.2026.
- **Status:** done

### S-07: Zwarte kolizje w szczegółach leku

- **Outcome:** Użytkowniczka może przejrzeć wiele możliwych kolizji leku bez długiego przewijania.
- **Change ID:** `medication-interactions-compact`
- **Issue:** #110
- **PRD refs:** MS-04, FR-006, FR-007
- **Prerequisites:** —
- **Parallel with:** S-01, S-02, S-03, S-04, S-05, S-06
- **Blockers:** —
- **Unknowns:**
  - Układ (zwinięcie opisów, lista zamiast kart, jedna nota dla listy) — Owner: plan (`/10x-ui`). Block: no. Nota pokazana raz wymaga tej samej zmiany FR-007 co S-05; jeśli S-05 ją wprowadzi, S-07 z niej korzysta.
- **Risk:** Karty są dziś wpisane bezpośrednio w `src/pages/leki/[id].astro` i każda powtarza notę; „Wizyta” robi to samo osobno. Wspólny element dla obu ekranów zmniejsza dryf, ale zwiększa zakres — decyzja w planie. Kolejność kolizji nie może zależeć od ich „wagi” (FR-012). Graf z S-10 może później przejąć część tej roli; S-07 nie czeka na niego, bo graf jest na terminie zapasowym.
- **Termin:** przed 04.11.2026, jeśli zostanie czas.
- **Status:** done

### S-08: Ekrany, które nie są puste

- **Outcome:** Użytkowniczka może korzystać z ekranów z ilustracjami w pustych stanach i z wyglądem notatek w dzienniku, zamiast pustych kart z samym tekstem.
- **Change ID:** `friendly-visuals`
- **Issue:** #111
- **PRD refs:** MS-10
- **Prerequisites:** S-03, S-05
- **Parallel with:** S-06, S-07, S-09
- **Blockers:** —
- **Unknowns:**
  - Źródło ilustracji i ich licencja (własne SVG, zestaw na wolnej licencji). — Owner: użytkowniczka. Block: no.
  - Które ekrany: puste stany listy leków, dziennika i „Wizyty”, wygląd notatki we wpisie. — Owner: plan (`/10x-ui`). Block: no.
- **Risk:** Ryzyko rozrostu — „elementy graficzne” łatwo staje się przebudową wszystkich ekranów; zakres zamyka się na pustych stanach i wyglądzie notatek, a wykresy należą do S-09 i S-10. Po S-03 i S-05, bo te dwa ekrany jeszcze się zmienią. Ilustracja nie może straszyć ani sugerować zagrożenia (FR-012); kolory wyłącznie z tokenów, w obu trybach.
- **Termin:** zapasowy.
- **Status:** proposed

### S-09: Oś czasu leków i objawów

- **Outcome:** Użytkowniczka może zobaczyć na jednej osi czasu okresy dawkowania swoich leków i wpisy objawów.
- **Change ID:** `medication-symptom-timeline`
- **Issue:** #112
- **PRD refs:** MS-03
- **Prerequisites:** S-05
- **Parallel with:** S-06, S-07, S-08
- **Blockers:** —
- **Unknowns:**
  - Sposób rysowania, wspólny z S-10 — Owner: plan. Block: no. Najszybszy: HTML/CSS (paski okresów) — przesądza, że S-10 zmieni technikę, bo tak nie narysuje linii grafu. Optymalny (polecany): SVG rysowane na serwerze, bez bibliotek — tryb ciemny przez tokeny działa sam, graf da się narysować tą samą techniką. Najlepszy: biblioteka wykresów w React — przybliżanie i przesuwanie, kosztem JavaScriptu i nowej zależności.
  - Gdzie oś czasu stoi: osobny ekran z pozycją w menu czy część istniejącego ekranu. — Owner: użytkowniczka przy planie. Block: no. Piąta zakładka na telefonie zderza się z powodem S-02.
- **Risk:** Nowa funkcja — wymaga jawnej zmiany PRD: oś czasu jest dziś drugorzędnym Kryterium sukcesu, bez wymagania funkcjonalnego, więc dochodzi nowe FR. Granice nienaruszone: FR-012 (oś nie wyróżnia zbieżności objawu z lekiem, nie podpowiada związku, nie porządkuje leków według podejrzenia — kolejność np. według daty rozpoczęcia), historia okresów bez zmian, dane wyłącznie z konta pod RLS, żadnej nazwy leku ani objawu w adresie. Po S-05, bo przy celu `quality` szlif istniejących ekranów ma pierwszeństwo. Odczyt wszystkich wpisów konta trafia na limit `max_rows = 1000` (`supabase/config.toml`) — do uwzględnienia w planie.
- **Termin:** zapasowy.
- **Status:** proposed

### S-10: Graf leków i możliwych interakcji

- **Outcome:** Użytkowniczka może zobaczyć swoje bieżące leki jako punkty, z linią między każdą parą, która może wchodzić w interakcję.
- **Change ID:** `interaction-graph`
- **Issue:** #113
- **PRD refs:** MS-07, FR-006, FR-007
- **Prerequisites:** S-09
- **Parallel with:** S-08
- **Blockers:** —
- **Unknowns:**
  - Miejsce grafu: szczegóły leku, „Wizyta” czy osobny ekran. — Owner: użytkowniczka przy planie. Block: no.
- **Risk:** Nowa funkcja — wymaga jawnej zmiany PRD (nowe FR; graf nie występuje w PRD). FR-012 dotyczy tu samego układu, nie tylko tekstu: ani wielkość, ani położenie punktu nie mogą zależeć od liczby kolizji. Najszybszy i zgodny z FR-012 układ: punkty na okręgu w stałej kolejności alfabetycznej. Odrzucony układ siłowy (punkty same się rozkładają) — lek z największą liczbą kolizji ląduje na środku, a to jest porządkowanie według podejrzenia. Nota poglądowa przy grafie (FR-007); brak linii nie oznacza bezpieczeństwa i graf musi to mówić. Korzysta ze sposobu rysowania z S-09.
- **Termin:** zapasowy.
- **Status:** proposed

### S-11: Eksport własnych danych

- **Outcome:** Użytkowniczka może pobrać swoje leki z okresami dawkowania i wpisy dzienniczka jako plik.
- **Change ID:** `data-export`
- **Issue:** #114
- **PRD refs:** MS-12
- **Prerequisites:** —
- **Parallel with:** każda pozycja M-2
- **Blockers:** —
- **Unknowns:**
  - Czy zasada z PRD „dane nie opuszczają produktu” (`## Success Criteria`, Guardrails) dopuszcza pobranie danych przez właścicielkę konta? — Owner: użytkowniczka. Block: yes. Propozycja brzmienia: „nie opuszczają produktu bez działania właścicielki konta”.
  - Format — Owner: plan. Block: no. Najszybszy: JSON. Optymalny: CSV. Najlepszy: PDF do pokazania lekarzowi.
- **Risk:** Nowa funkcja — wymaga nowego FR i zmiany zasady z PRD. Granice nienaruszone: brak zdalnego udostępniania lekarzowi (`## Non-Goals` — plik powstaje na urządzeniu właścicielki, bez wysyłki), izolacja danych per-konto, bezpowrotne usunięcie konta, nazwa pliku i adres bez nazwy leku czy objawu. Tylko jeśli zostanie czas.
- **Termin:** tylko jeśli zostanie czas.
- **Status:** blocked

### S-12: Przyklejony nagłówek na telefonie

- **Outcome:** Użytkowniczka może na telefonie przewijać treść ekranu, a nagłówek ze znakiem, przełącznikiem trybu i „Wyloguj się” zostaje na górze ekranu, pod paskiem wersji demonstracyjnej.
- **Change ID:** `mobile-header-sticky`
- **Issue:** #120
- **PRD refs:** MS-13
- **Prerequisites:** —
- **Parallel with:** S-05, S-06, S-07
- **Blockers:** —
- **Unknowns:**
  - Przesunięcie nagłówka pod paskiem demo: pasek ma stałą wysokość (`--demo-bar-height`) tylko od `lg`, na telefonie zawija się do dwóch wierszy. Najszybszy: oba paski w jednym przyklejonym kontenerze. Optymalny: stała wysokość paska demo także na telefonie. — Owner: plan. Block: no.
- **Risk:** Zmiana wyłącznie układu na telefonie (`src/layouts/AppLayout.astro`, `src/components/DemoBar.astro`); duży ekran działa poprawnie i nie może się zmienić. Na górze dwa przyklejone paski, na dole przyklejone menu — treść nie może chować się pod żadnym z nich, a przy 320 px zostaje mniej miejsca na treść. Sprawdzić przy 320, 360 i 375 px, w obu trybach. Kandydat na test E2E w widoku telefonu: po przewinięciu „Wyloguj się” jest widoczne.
- **Termin:** konieczne przed 04.11.2026.
- **Status:** done

## Backlog Handoff

| Roadmap ID | Change ID                          | Suggested issue title                            | Ready for `/10x-plan` | Notes                                                                | Issue |
| ---------- | ---------------------------------- | ------------------------------------------------ | --------------------- | -------------------------------------------------------------------- | ----- |
| S-01       | `delete-account-button-emphasis`   | Wyróżniony przycisk „Usuń konto”                 | yes                   | przed 04.11; zmiana reguły `destructive*`                            | #104  |
| S-02       | `journal-tab-rename`               | Zakładka „Dziennik” zamiast „Dzienniczek”        | yes                   | przed 04.11                                                          | #105  |
| S-03       | `dashboard-landing`                | Start na liście leków zamiast pustego /dashboard | yes                   | przed 04.11                                                          | #106  |
| S-04       | `app-icon`                         | Ikona lekomapy                                   | yes                   | przed 04.11                                                          | #107  |
| S-05       | `visit-readable-with-current-meds` | Czytelna „Wizyta” z listą bieżących leków        | yes                   | przed 04.11; gwiazda przewodnia; zmiana FR-011 (i FR-007); `/10x-ui` | #108  |
| S-06       | `severity-next-to-symptom`         | Nasilenie przy samym objawie                     | yes                   | przed 04.11; `/10x-ui`                                               | #109  |
| S-07       | `medication-interactions-compact`  | Zwarte kolizje w szczegółach leku                | yes                   | przed 04.11, jeśli zostanie czas; `/10x-ui`                          | #110  |
| S-08       | `friendly-visuals`                 | Ilustracje w pustych stanach i wygląd notatek    | no                    | zapasowy; czeka na S-03, S-05                                        | #111  |
| S-09       | `medication-symptom-timeline`      | Oś czasu leków i objawów                         | no                    | zapasowy; czeka na S-05; nowe FR                                     | #112  |
| S-10       | `interaction-graph`                | Graf leków i możliwych interakcji                | no                    | zapasowy; czeka na S-09; nowe FR                                     | #113  |
| S-11       | `data-export`                      | Eksport własnych danych                          | no                    | tylko jeśli zostanie czas; zablokowane pytaniem 1                    | #114  |
| S-12       | `mobile-header-sticky`             | Przyklejony nagłówek na telefonie                | yes                   | przed 04.11; błąd zgłoszony 15.10.2026                               | #120  |

## Open Roadmap Questions

1. **Czy eksport danych przez właścicielkę konta mieści się w zasadzie „dane nie opuszczają produktu”?** — Owner: użytkowniczka. Block: S-11 (#114).

## Parked

- **Osobny ekran „Start” po zalogowaniu** — Why parked: odrzucony 14.10.2026 przy S-03; piąta zakładka na telefonie i trzecia kopia listy leków. Dodanie później to nowa trasa, bez przeróbek.
- **Integracja z zewnętrzną bazą interakcji** — Why parked: PRD `## Non-Goals`; reguły pochodzą wyłącznie ze zbioru dostarczonego z produktem.
- **Przypomnienia o przyjęciu dawki** — Why parked: PRD `## Non-Goals`; produkt służy rozumieniu zestawu leków, nie pilnowaniu rutyny.
- **Zdalne udostępnianie danych lekarzowi** — Why parked: PRD `## Non-Goals`; sekcja na wizytę jest do pokazania na ekranie.
- **Reguła niedoborów mikro- i makroskładników** — Why parked: PRD `## Non-Goals`; przeniesiona do wersji drugiej.
- **Zbiór znanych działań niepożądanych przypisanych substancjom** — Why parked: PRD `## Non-Goals`; zestawianie objawu z lekami działa wyłącznie na osi czasu.
- **Odświeżanie rejestru leków** — Why parked: PRD `## Non-Goals`; rejestr wgrany raz razem z produktem.
- **Rozszerzenie rejestru na wszystkie leki** — Why parked: wymaga decyzji, jak komunikować lek z rejestru pozostający poza zakresem reguł.
- **Interfejs dodawania kilku substancji czynnych w jednym preparacie** — Why parked: PRD `## Non-Goals`; struktura danych gotowa, interfejs później.
- **Działanie bez połączenia z siecią** — Why parked: PRD `## Non-Goals` niefunkcjonalne.
- **Formalna zgodność ze standardami dostępności** — Why parked: PRD `## Non-Goals`.
- **Wiele profilów w jednym koncie** — Why parked: PRD `## Non-Goals`; jedno konto to jedna osoba.
- **Pełna warstwa prawna przetwarzania danych (RODO)** — Why parked: PRD `## Non-Goals`; warunek powrotu: wyjście z fazy prototypu.
- **Techniczne ograniczenia prototypu: automatyczne czyszczenie kont, rejestracja z zaproszeniem** — Why parked: PRD `## Non-Goals`; koszt ponad potrzebę prototypu.
- **Szukanie objawu z konkretnego dnia w „Dzienniku”** (filtr albo skok po dacie) — Why parked: wydzielone 16.10.2026 z S-05 (`context/changes/visit-readable-with-current-meds/frame.md`); „Wizyta” jest ułożona według objawów, nie dni, a potrzeba wróci przy codziennych wpisach. Nazwa objawu nigdy w URL; parametr daty wymaga świadomego wpisu w `ALLOWED_URL_PARAMS`.
- **Pole z fokusem pod dolnym menu na telefonie** — Why parked: wydzielone 17.10.2026 z S-12 (impl-review `mobile-header-sticky`, F2). Luka sprzed S-12: pole wybrane Tabem albo nasilenie przy objawie na dole ekranu może stanąć pod dolnym menu (pomiar przed zmianą: ok. 40 px). `scroll-padding-bottom` wypychał nasilenie objawu poza ekran (`severity-on-phone.spec.ts`), więc potrzebne inne rozwiązanie.
- **Górny blok zajmuje większość ekranu przy powiększonym tekście** — Why parked: wydzielone 17.10.2026 z S-12 (impl-review `mobile-header-sticky`, F1). Pomiar: przy 320 px i tekście 200% przyklejony pasek demo z nagłówkiem ma 392 z 568 px wysokości ekranu, na treść zostaje 176 px. Kierunek do rozważenia: pasek demo nieprzyklejony albo zwinięty na telefonie.

## Milestone History

- **M-1: MVP — od leku do materiału na wizytę** (`mvp-material-na-wizyte`) — closed 2026-10-14. Pełny przepływ od dodania leku ze znacznikiem możliwej kolizji, przez dzienniczek i pytania do lekarza, po sekcję „Wizyta”, wraz z kontem, odzyskiwaniem dostępu, trybem ciemnym, własnym nadawcą maili i śledzeniem błędów — 6 fundamentów i 11 plasterków `done`. Treść roadmapy M-1: commit `68a936b`.

## Done

(Pusta na starcie M-2. `/10x-archive` dopisuje tu wpis i przestawia status pozycji na `done`, gdy zarchiwizowana zmiana ma pasujący Change ID.)

- **S-01: Użytkowniczka może od razu rozpoznać „Usuń konto” jako akcję nieodwracalną — na ekranie konta (przycisk prowadzący do potwierdzenia) i na ekranie potwierdzenia hasłem (przycisk, który faktycznie usuwa).** — Archived 2026-10-14 → `context/archive/2026-10-14-delete-account-button-emphasis/`. Lesson: —.
- **S-02: Użytkowniczka może widzieć w menu krótszą nazwę „Dziennik”, która mieści się na małym ekranie.** — Archived 2026-10-15 → `context/archive/2026-10-15-journal-tab-rename/`. Lesson: —.
- **S-03: Użytkowniczka może po zalogowaniu trafić od razu na listę leków; pusty ekran ze startera znika.** — Archived 2026-10-15 → `context/archive/2026-10-15-dashboard-landing/`. Lesson: —.
- **S-04: Użytkowniczka może rozpoznać lekomapę po ikonie — w karcie przeglądarki, na pasku bocznym obok nazwy i na ekranie telefonu po dodaniu skrótu.** — Archived 2026-10-15 → `context/archive/2026-10-15-app-icon/`. Lesson: —.
- **S-05: Użytkowniczka może przeczytać „Wizytę” także przy wielu lekach i objawach: widzi listę bieżących leków z dawkami, notę poglądową bez powtórek przy każdej karcie, a pytania do lekarza bez tych samych leków powtarzanych w każdym z nich.** — Archived 2026-10-16 → `context/archive/2026-10-16-visit-readable-with-current-meds/`. Lesson: —.
- **S-06: Użytkowniczka może wybrać nasilenie tuż przy zaznaczonym objawie i widzi ten wybór na telefonie także wtedy, gdy zaznaczyła objaw z końca listy.** — Archived 2026-10-16 → `context/archive/2026-10-16-severity-next-to-symptom/`. Lesson: —.
- **S-07: Użytkowniczka może przejrzeć wiele możliwych kolizji leku bez długiego przewijania.** — Archived 2026-10-16 → `context/archive/2026-10-16-medication-interactions-compact/`. Lesson: —.
- **S-12: Użytkowniczka może na telefonie przewijać treść ekranu, a nagłówek ze znakiem, przełącznikiem trybu i „Wyloguj się” zostaje na górze ekranu, pod paskiem wersji demonstracyjnej.** — Archived 2026-10-17 → `context/archive/2026-10-16-mobile-header-sticky/`. Lesson: —.
