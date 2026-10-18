# Graf leków i możliwych interakcji — plan wdrożenia

## Overview

Pod listą bieżących leków na `/leki` pojawia się graf: każdy bieżący lek to punkt na nieregularnej „mapie”, a delikatna linia łączy leki, których para jest w zbiorze reguł. Dotknięcie leku podświetla jego linie i leki, z którymi może wchodzić w interakcję, a pod grafem pokazuje opisy tych interakcji z notą poglądową. Roadmapa S-10 (#113), MS-07; wymaga nowego FR-014 w PRD. Wygląd zatwierdzony na makiecie A2 (https://claude.ai/artifact/CFSpf28soNs35iiXE1JJ7J).

## Current State Analysis

- Pary liczy funkcja bazy `public.medication_interactions()` (`supabase/migrations/20260930120000_medication_write_and_interactions.sql:289-330`): tylko bieżące leki konta (`discontinued_on is null or > dziś` w czasie polskim), pełny skład preparatu, wynik symetryczny (A→B i B→A), a jedna para leków może dać kilka wierszy, gdy pasuje do kilku reguł. Zwraca id obu leków, `pair_id` i polski `description`.
- `/leki` (`src/pages/leki/index.astro`) już woła tę funkcję i z jej wyniku robi tylko zbiór oznaczonych leków (znacznik „Możliwa interakcja”). Pod listą stoją nota (`INTERACTION_COPY.note`) i „Brak oznaczenia nie znaczy, że połączenie jest bezpieczne.” Lista czyta wyłącznie bieżące leki; liczba zakończonych to osobne zapytanie, którego błąd tylko ukrywa link.
- Zwijanie par w „Wizycie” jest w `src/pages/wizyta.astro:87-128`; dane z `loadVisitSummary` (`src/lib/services/visit-summary-data.ts`), który już zna liczbę bieżących leków.
- Teksty o interakcjach: `src/lib/copy/interactions.ts`, pilnowane przez `scripts/fr012/interaction-copy.test.mjs` (wyjątek na rdzeń `bezpieczn` tylko dla `noWarningIsNotSafe`).
- Wzorzec komponentu React: formularze w `src/components/medications/*.tsx`, wstawiane z `client:load`. `/leki` nie ma dziś żadnego Reacta.
- S-09 (oś czasu) rysuje SVG na serwerze z kolorami przez `var(--token)` i trzyma logikę w czystej funkcji testowanej `node --test` (`src/lib/services/timeline.ts`, `scripts/timeline/timeline.test.mjs`).
- Brak jakiegokolwiek grafu. W PRD graf nie występuje.

## Desired End State

Na `/leki`, pod listą i notą, przy co najmniej dwóch bieżących lekach stoi sekcja `#graf` z grafem jak na makiecie A2. Na starcie widać wszystkie leki i delikatne linie wszystkich par. Dotknięcie leku: lek wypełniony kolorem głównym z poświatą, jego linie i leki-partnerzy w bursztynie, pozostałe przygaszone, a pod grafem opisy interakcji z notą. Dotknięcie innego leku przełącza wybór, ponowne dotknięcie tego samego odznacza. Lek zachowuje swoje miejsce, gdy inny lek zostanie dodany albo odstawiony. Przy 0–1 leku zamiast grafu stoi jedno zdanie. „Wizyta” ma odnośnik do `/leki#graf`. Działa na telefonie 360 px i w trybie ciemnym; w adresie tylko kotwica.

Weryfikacja: testy jednostkowe układu (w tym niezależność położenia od interakcji i stałość mapy), test FR-012 na tekstach, E2E na 360 px, stan w galerii trybu ciemnego, LCP `/leki` ≤ 2,5 s.

### Key Discoveries:

- Wynik `medication_interactions()` jest symetryczny i może mieć kilka wierszy na tę samą parę leków (`...20260930120000...sql:327-329`) — graf grupuje po nieuporządkowanej parze id i zbiera wszystkie różne opisy; `uniqueInteractions` w `src/lib/services/visit-summary.ts:59-77` robi podobną deduplikację dla „Wizyty”.
- Reguła „bieżący lek” istnieje w trzech miejscach (SQL, `isCurrentMedication` w `visit-summary.ts:79-83`, zapytanie w `leki/index.astro`); graf bierze leki z tego samego zapytania co lista, więc oba pokazują ten sam zestaw.
- `reportError` wolno wołać tylko w trasach i modułach `*-data` — czysta logika grafu nie może go importować (`report.ts` importuje `cloudflare:workers`, CLAUDE.md, Konwencje kodu).
- S-09: kolory SVG przez atrybuty z `var(--…)`, nie klasy palety; bramka `scripts/tokens/hardcoded-colors.mjs` odrzuca hex/`rgb(`/`oklch(` w `src/`.
- `tests/e2e/medication-interactions-compact.spec.ts` ma gotowy zestaw leków z parami ze zbioru (ibuprofen + acenokumarol, ramipryl, sertralina) i wzorzec konta jednorazowego usuwanego w `afterEach`.
- `tests/e2e/dark-gallery.spec.ts:145` ma wpis `leki/index` `with-interaction`; nowy stan dopisuje się obok.

## What We're NOT Doing

- Osobnej strony grafu ani pozycji w menu; grafu w szczegółach leku ani w „Wizycie” (tam tylko odnośnik).
- Układu siłowego (leki „same się rozkładają”) ani żadnego położenia zależnego od liczby lub rodzaju interakcji (FR-012).
- Różnej wielkości punktów, kolorów linii według ważności, zieleni jako koloru interakcji, czerwieni gdziekolwiek w grafie.
- Sprawdzania wybranej pary dwóch leków (tryb „dotknij drugi lek, zobacz wynik pary”) — drugi lek przełącza wybór.
- Wyboru wielu leków naraz, przybliżania, przesuwania i animowanego układu.
- Limitu liczby leków na grafie ani ukrywania leków.
- Leków zakończonych na grafie (nie są porównywane, `INTERACTION_COPY.endedNotCompared`).
- Zapamiętywania wyboru po odświeżeniu; parametrów w adresie poza kotwicą `#graf`.
- Nowej kolumny ani migracji do przechowywania miejsc na mapie.
- Zmiany kolejności listy leków, znacznika „Możliwa interakcja” ani treści w szczegółach leku.

## Implementation Approach

Czysta funkcja `buildInteractionGraph` (`src/lib/services/interaction-graph.ts`) dostaje historię leków konta, bieżące leki i wiersze `medication_interactions()`, a zwraca gotową geometrię: punkty, krzywe linii, wymiary i opisy par. Strona `/leki` dokłada jedno lekkie zapytanie o historię (id, `created_at`, `discontinued_at` wszystkich leków konta), składa model i przekazuje go komponentowi `InteractionGraph.tsx` z `client:visible`. React renderuje graf na serwerze (widać go od razu, także bez JavaScriptu, w stanie bez wyboru), a po wjechaniu na ekran obsługuje wybór w stanie komponentu.

Stała mapa bez zapisu w bazie: miejsca liczone są przy każdym wyświetleniu przez odtworzenie historii — leki „przychodzą” w kolejności dodania i zajmują najniższe wolne pole siatki, odstawione je zwalniają. Rozrzut w obrębie pola i wygięcie linii wynikają z id leku (stały skrót), nigdy z interakcji ani nazwy.

## Critical Implementation Details

- **Stała mapa — kolejność zdarzeń**: zdarzenia odtwarza się chronologicznie po wszystkich lekach konta (także zakończonych): przyjście = `created_at`, odejście = `discontinued_at` (chwila zapisu odstawienia, stemplowana przez bazę), gdy nie jest null — nigdy `discontinued_on`, bo tę datę można wpisać do 14 dni wstecz i lek dodany później przeskoczyłby na zwolnione pole. Przy równym czasie odejście idzie przed przyjściem, remis przyjść rozstrzyga `id`. Skutek przyjęty świadomie: po odstawieniu zostaje dziura do czasu dodania kolejnego leku; lek usunięty jako dodany przez pomyłkę znika z historii, więc mapa może się wtedy przesunąć; anulowanie odstawienia w oknie 24 h działa tak samo (mapa może się przesunąć).
- **Ten sam obraz na każdym ekranie**: siatka ma zawsze 3 kolumny, a współrzędne liczone są w stałym układzie (`viewBox` szerokości 360); na szerszym ekranie graf się skaluje (z górnym limitem szerokości), nie zmienia układu. Przyciski z nazwami leków pozycjonowane w procentach tego samego układu, żeby zgadzały się z SVG po skalowaniu.
- **FR-012 w układzie**: wejście `interactions` nie może wpływać na `x`, `y` ani rozmiar punktu — pilnuje tego test porównujący układ z interakcjami i bez nich.

## Phase 1: PRD i logika mapy

### Overview

Jawna zmiana PRD (FR-014), czysta funkcja układu grafu z testami oraz teksty z testem FR-012. Bez zmian w UI.

### Changes Required:

#### 1. PRD

**File**: `context/foundation/prd.md`

**Intent**: Dopisać FR-014, bo graf jest nową funkcją, której PRD nie zna (roadmapa S-10, Risk).

**Contract**: Nowa podsekcja `### Graf interakcji` po `### Oś czasu` z FR-014: pod listą bieżących leków graf — każdy bieżący lek jako punkt tej samej wielkości, delikatna linia między lekami, których para jest w zbiorze reguł; dotknięcie leku podświetla jego linie i leki-partnerów oraz pokazuje opisy z notą (FR-007), dotknięcie innego przełącza, ponowne odznacza; miejsce leku wynika z kolejności dodania i jego identyfikatora, nigdy z interakcji (FR-012), i zostaje stałe, gdy inne leki dochodzą lub są odstawiane; kolory: wybór w kolorze głównym, interakcja w kolorze znacznika „Możliwa interakcja”, nigdy kolor sugerujący bezpieczeństwo ani alarm; graf mówi, że brak linii nie oznacza bezpieczeństwa; przy mniej niż dwóch lekach zdanie zamiast grafu; odnośnik z „Wizyty”. Adnotacja: dodane 18.10.2026, S-10 (#113), nienaruszone FR-006, FR-007, FR-012, dane wyłącznie z konta pod RLS, żadna nazwa leku w adresie. Priority: nice-to-have.

#### 2. Logika grafu

**File**: `src/lib/services/interaction-graph.ts` (nowy)

**Intent**: Policzyć cały model grafu w jednym czystym miejscu, testowalnym bez przeglądarki i bazy.

**Contract**: `buildInteractionGraph(input) → InteractionGraphModel | null`, gdzie `input` = `{ history: { id, createdAt, discontinuedAt }[], current: { id, name }[], interactions: MedicationInteraction[], today: string }`. `null`, gdy bieżących leków jest mniej niż 2. Model: `width` (stałe 360), `height` (rośnie z liczbą rzędów zajętych pól), `nodes: { id, name, x, y }[]` w kolejności alfabetycznej (locale `pl`), `edges: { a, b, path }[]` (krzywa kwadratowa jako tekst `d`, sama liczba i litery), `partners: Record<id, { id, name, descriptions: string[] }[]>` (partnerzy alfabetycznie, opisy bez powtórzeń). Siatka: 3 kolumny, rząd ok. 90 jednostek, przesunięcie co drugiego rzędu i rozrzut w polu ze stałego skrótu id; pole leku (`x` ± pół szerokości kolumny) mieści się w `width`, a długość nazwy nie wpływa na układ (tekstu nie mierzy funkcja, tylko CSS w komponencie). Moduł bez importu `report.ts` i bez `Intl` w pętli. Typy modelu w `src/types.ts`.

#### 3. Teksty

**File**: `src/lib/copy/interactions.ts`

**Intent**: Wszystkie nowe napisy grafu w module pilnowanym przez filtr FR-012.

**Contract**: Nowe klucze `INTERACTION_COPY` (same stringi, znaczniki `{nazwa}`): tytuł sekcji („Interakcje na grafie”), podpowiedź („Dotknij leku, żeby zobaczyć jego możliwe interakcje z pozostałymi lekami.”), etykieta grafu dla czytnika ekranu, „Nie wybrano leku.”, „Możliwa interakcja z: {nazwa}”, zdanie przy 0–1 leku („Graf pojawi się, gdy na liście będą co najmniej dwa leki.”), „Brak linii nie znaczy, że połączenie jest bezpieczne.”, błąd wczytania grafu (lista działa dalej), odnośnik z „Wizyty” („Zobacz leki na grafie”). Brak partnerów: istniejące `noInteractionsForMedication`.

#### 4. Testy

**File**: `scripts/medications/interaction-graph.test.mjs` (nowy), `scripts/fr012/interaction-copy.test.mjs`

**Intent**: Pilnować FR-012 w układzie, stałości mapy i grupowania par; nowe teksty przez filtr.

**Contract**: Przypadki z ręcznie wpisanymi oczekiwaniami (dziś 18.10.2026): mniej niż 2 bieżące → `null`; ten sam układ (`x`, `y`) z pustymi i pełnymi `interactions`; dodanie leku nie zmienia `x`, `y` istniejących; odstawienie leku zwalnia pole, a następny dodany je zajmuje; odstawienie z datą wstecz (`discontinued_on` przed `created_at` leku dodanego później, `discontinued_at` po nim) nie przesuwa leku dodanego później; dwa leki nigdy w tym samym polu; 13 leków → 5 rzędów i większe `height`; para z dwoma wierszami reguł → jedna krawędź, dwa opisy; wiersze symetryczne → jedna krawędź; partnerzy alfabetycznie; lek zakończony nie jest węzłem; dla każdego węzła `x` ± pół szerokości kolumny w granicach `width`. W teście tekstów nowy wyjątek na rdzeń `bezpieczn` wyłącznie dla zdania o braku linii i wymagane niepuste klucze grafu.

### Success Criteria:

#### Automated Verification:

- Testy jednostkowe i FR-012 przechodzą: `npm test`
- Typy przechodzą: `npm run typecheck`
- Lint przechodzi: `npm run lint`

#### Manual Verification:

- Autorka czyta FR-014 w PRD i akceptuje brzmienie
- Autorka czyta nowe teksty w `src/lib/copy/interactions.ts` i akceptuje brzmienie

**Implementation Note**: Po automatycznej weryfikacji zatrzymaj się na ręczne potwierdzenie autorki przed fazą 2.

---

## Phase 2: Graf na liście leków

### Overview

Komponent grafu, wpięcie pod listą na `/leki` z odczytem historii leków, stany brzegowe i odnośnik z „Wizyty”.

### Changes Required:

#### 1. Komponent grafu

**File**: `src/components/medications/InteractionGraph.tsx` (nowy)

**Intent**: Narysować model jak makieta A2 i obsłużyć wybór jednego leku.

**Contract**: Props: tylko `model: InteractionGraphModel`; teksty importowane bezpośrednio z `INTERACTION_COPY` (wzorzec `SymptomPicker.tsx`). Stan: id wybranego leku albo brak. Kontener o proporcjach `width:height`, SVG `aria-hidden` z krzywymi (delikatne: neutralne `var(--input)` — nie zielone, bo każda linia to para ze zbioru reguł; podświetlone: szeroka `var(--interaction-border)` pod cienką `var(--interaction-foreground)`) i kółkami (zwykłe: tło karty i obwódka `var(--input)`; partner: `var(--interaction)` z obwódką `var(--interaction-foreground)`; wybrany: `var(--primary)` z poświatą `var(--accent)`; reszta przygaszona). Linie grupowane w kilka elementów `path` według stanu, nie po jednym na parę. Każdy lek to `<button type="button" aria-pressed>` z nazwą, w kolejności alfabetycznej w DOM, pozycjonowany w procentach, cel dotyku ≥ 44 px, szerokość najwyżej szerokość kolumny, nazwa najwyżej w 2 liniach z wielokropkiem (`line-clamp-2`); pełna nazwa w panelu pod grafem po wyborze. Pod grafem panel z `aria-live="polite"`: brak wyboru / nazwa wybranego + karty „Możliwa interakcja z: …” z opisami (zwijane jak na makiecie) i notą / `noInteractionsForMedication`; zawsze „Brak linii nie znaczy…”. Wyłącznie tokeny, łączenie klas przez `cn()`, bez `dark:` z kolorem. Węzeł oznaczony `data-graph-node={id}` — nigdy `data-medication-id` (smoke szuka listy po pierwszym takim atrybucie, `scripts/smoke.mjs:826-836`) ani atrybut `title=` z nazwą leku (`scripts/pages/page-title.test.mjs`).

#### 2. Wpięcie na `/leki`

**File**: `src/pages/leki/index.astro`

**Intent**: Dołożyć dane do grafu i pokazać sekcję pod listą i notą.

**Contract**: Czwarte zapytanie w tym samym `Promise.all`: wszystkie leki konta, tylko `id, created_at, discontinued_at` (RLS). Jego błąd: `reportError("medications.graph-history", …)` i zamiast grafu tekst błędu grafu — lista działa dalej. Model z `buildInteractionGraph` z już wczytanych bieżących leków i wierszy interakcji. Sekcja `<section id="graf" aria-labelledby=…>` z tytułem i podpowiedzią, `<InteractionGraph client:visible />` przy modelu, zdanie przy 0–1 leku, nic przy błędzie wczytania listy. Komentarz w nagłówku pliku zaktualizowany.

#### 3. Odnośnik z „Wizyty”

**File**: `src/pages/wizyta.astro` (liczba bieżących leków już jest: `summary.currentMedications.length`)

**Intent**: Prowadzić z sekcji możliwych interakcji do grafu.

**Contract**: Link `href="/leki#graf"` z `INTERACTION_COPY` w sekcji `data-visit-interactions` (rozwinięta lista i stan „brak pary”), tylko przy co najmniej 2 bieżących lekach.

### Success Criteria:

#### Automated Verification:

- Testy przechodzą, w tym bramka kolorów i testy tytułów i parametrów adresu: `npm test`
- Typy przechodzą: `npm run typecheck`
- Lint przechodzi: `npm run lint`
- Build przechodzi: `npm run build`

#### Manual Verification:

- Na telefonie (360 px) graf wygląda jak makieta A2: mapa, delikatne neutralne linie (nie zielone), zielony wybór, bursztynowe podświetlenie
- Dotknięcie leku, przełączenie na inny i odznaczenie działają; panel pokazuje opisy z notą
- Lek zostaje w tym samym miejscu po dodaniu nowego leku
- Tryb ciemny: graf czytelny, delikatne linie widoczne na tle karty, interakcja nie wygląda jak alarm
- Przy jednym leku zamiast grafu stoi zdanie
- Odnośnik z „Wizyty” prowadzi do grafu
- Klawiatura: Tab przechodzi po lekach alfabetycznie, Enter/spacja wybiera i odznacza

**Implementation Note**: Po automatycznej weryfikacji zatrzymaj się na ręczne potwierdzenie autorki przed fazą 3.

---

## Phase 3: Test przeglądarkowy i pomiary

### Overview

Test E2E na telefonie, stan w galerii trybu ciemnego i pomiar szybkości `/leki`.

### Changes Required:

#### 1. Test E2E

**File**: `tests/e2e/interaction-graph.spec.ts` (nowy)

**Intent**: Pilnować ryzyka „graf pokazuje interakcję bez opisu i noty albo myli wybór”, przechodząc przez auth, bazę, funkcję interakcji i React.

**Contract**: Viewport 360×740, konto jednorazowe usuwane w `afterEach`, leki z parami ze zbioru jak w `medication-interactions-compact.spec.ts` plus jeden lek bez pary i jeden lek z długą nazwą wpisaną ręcznie (ok. 80 znaków); nazwy wyłącznie w treści POST. Kroki: dotknięcie ibuprofenu → `aria-pressed="true"`, panel z opisem pary (dokładny tekst ze zbioru) i notą; dotknięcie leku bez pary → przełączenie i `noInteractionsForMedication`; ponowne dotknięcie → brak wyboru; odnośnik z „Wizyty” → adres `/leki#graf` i widoczny graf; prostokąty (`boundingBox`) przycisków leków na siebie nie nachodzą; adres nigdy nie zawiera nazwy leku. Lokalny Supabase, `.env` odsunięty.

#### 2. Galeria trybu ciemnego

**File**: `tests/e2e/dark-gallery.spec.ts`

**Intent**: Zrzut grafu z wybranym lekiem w obu trybach.

**Contract**: Nowy wpis `leki/index`, stan `graph-selected`, `prepare` dotyka leku z parą przez `getByRole("button", { name })`.

#### 3. Pomiar

**File**: `context/changes/interaction-graph/change.md`

**Intent**: Zapisać, że graf nie psuje progu szybkości listy leków.

**Contract**: W `## Notes`: mediana LCP z 3 przebiegów Lighthouse Mobile na `/leki` (build + `astro preview`, lokalny Supabase) na koncie z 12 bieżącymi lekami i co najmniej 4 parami, z datą. Ustawienia jak w S-09 (`context/archive/2026-10-17-medication-symptom-timeline/change.md`, „Pomiar LCP”): Lighthouse 12.8.2, Chromium z Playwrighta, sesja w nagłówku `Cookie`, lokalne proxy z kompresją brotli przed `astro preview` (produkcja kompresuje HTML; bez proxy wynik jest zawyżony). Konto tworzy skrypt seed z adresem bazy z `.dev.vars`, odmawiający pracy na adresie nielokalnym; ścieżka skryptu i wynik bez kompresji (dla porównania) też w `## Notes`.

### Success Criteria:

#### Automated Verification:

- Test E2E przechodzi na lokalnym Supabase: `npx playwright test tests/e2e/interaction-graph.spec.ts`
- Test E2E pada, gdy panel nie pokazuje noty (sprawdzone celowym zepsuciem i cofnięciem)
- Galeria generuje zrzuty grafu: `DARK_GALLERY=1 npx playwright test tests/e2e/dark-gallery.spec.ts`
- Pełne testy przechodzą: `npm test`

#### Manual Verification:

- Autorka przegląda zrzuty grafu w trybie jasnym i ciemnym
- Mediana LCP `/leki` ≤ 2,5 s, zapisana w `change.md`

---

## Testing Strategy

### Unit Tests:

- Układ niezależny od interakcji (FR-012), stałość mapy przy dodaniu i odstawieniu, brak kolizji pól, wzrost wysokości, grupowanie par i opisów, partnerzy alfabetycznie, tylko bieżące leki.
- Teksty grafu przez filtr FR-012.

### Integration Tests:

- E2E na 360 px: wybór, przełączenie, odznaczenie, opis z notą, odnośnik z „Wizyty”, brak nazw w adresie.

### Manual Testing Steps:

1. Konto z 5 lekami, w tym 2 parami: graf jak makieta A2, linie delikatne na starcie.
2. Dotknij leku z parą → podświetlenie i opis z notą; dotknij innego → przełączenie; dotknij go ponownie → odznaczenie.
3. Dodaj nowy lek → stare leki na tych samych miejscach.
4. Odstaw jeden lek → jego miejsce puste; dodaj kolejny → zajmuje je.
5. Przełącz tryb ciemny i powtórz krok 2.
6. Konto z jednym lekiem → zdanie zamiast grafu.

## Performance Considerations

Graf to kilkanaście–kilkadziesiąt elementów (linie zgrupowane w kilka `path`), więc praca serwera jest mała w porównaniu z osią czasu S-09. React dołącza się dopiero przy przewinięciu do grafu (`client:visible`), więc nie wpływa na pierwszy widok listy; jego paczka jest zwykle już w pamięci przeglądarki z innych ekranów. Dodatkowe zapytanie o historię leków idzie równolegle z istniejącymi. Pomiar LCP w fazie 3.

## Migration Notes

Brak migracji bazy: graf czyta istniejące kolumny pod istniejącym RLS.

## References

- Roadmapa: `context/foundation/roadmap.md` (S-10)
- PRD: FR-006, FR-007, FR-012, FR-013 w `context/foundation/prd.md`
- Makiety (A2 zatwierdzona): https://claude.ai/artifact/CFSpf28soNs35iiXE1JJ7J
- Wzorzec techniki i pomiarów: `context/archive/2026-10-17-medication-symptom-timeline/plan.md`
- Funkcja par: `supabase/migrations/20260930120000_medication_write_and_interactions.sql:289-330`
- Deduplikacja par: `src/lib/services/visit-summary.ts:59-77`
- Wzorzec E2E z parami: `tests/e2e/medication-interactions-compact.spec.ts`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: PRD i logika mapy

#### Automated

- [x] 1.1 Testy jednostkowe i FR-012 przechodzą: `npm test`
- [x] 1.2 Typy przechodzą: `npm run typecheck`
- [x] 1.3 Lint przechodzi: `npm run lint`

#### Manual

- [x] 1.4 Autorka czyta FR-014 w PRD i akceptuje brzmienie
- [x] 1.5 Autorka czyta nowe teksty w `src/lib/copy/interactions.ts` i akceptuje brzmienie

### Phase 2: Graf na liście leków

#### Automated

- [ ] 2.1 Testy przechodzą, w tym bramka kolorów i testy tytułów i parametrów adresu: `npm test`
- [ ] 2.2 Typy przechodzą: `npm run typecheck`
- [ ] 2.3 Lint przechodzi: `npm run lint`
- [ ] 2.4 Build przechodzi: `npm run build`

#### Manual

- [ ] 2.5 Na telefonie (360 px) graf wygląda jak makieta A2: mapa, delikatne neutralne linie (nie zielone), zielony wybór, bursztynowe podświetlenie
- [ ] 2.6 Dotknięcie leku, przełączenie na inny i odznaczenie działają; panel pokazuje opisy z notą
- [ ] 2.7 Lek zostaje w tym samym miejscu po dodaniu nowego leku
- [ ] 2.8 Tryb ciemny: graf czytelny, delikatne linie widoczne na tle karty, interakcja nie wygląda jak alarm
- [ ] 2.9 Przy jednym leku zamiast grafu stoi zdanie
- [ ] 2.10 Odnośnik z „Wizyty” prowadzi do grafu
- [ ] 2.11 Klawiatura: Tab przechodzi po lekach alfabetycznie, Enter/spacja wybiera i odznacza

### Phase 3: Test przeglądarkowy i pomiary

#### Automated

- [ ] 3.1 Test E2E przechodzi na lokalnym Supabase: `npx playwright test tests/e2e/interaction-graph.spec.ts`
- [ ] 3.2 Test E2E pada, gdy panel nie pokazuje noty (sprawdzone celowym zepsuciem i cofnięciem)
- [ ] 3.3 Galeria generuje zrzuty grafu: `DARK_GALLERY=1 npx playwright test tests/e2e/dark-gallery.spec.ts`
- [ ] 3.4 Pełne testy przechodzą: `npm test`

#### Manual

- [ ] 3.5 Autorka przegląda zrzuty grafu w trybie jasnym i ciemnym
- [ ] 3.6 Mediana LCP `/leki` ≤ 2,5 s, zapisana w `change.md`
