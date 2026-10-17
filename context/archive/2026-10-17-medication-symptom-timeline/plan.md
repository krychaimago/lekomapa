# Oś czasu leków i objawów — plan wdrożenia

## Overview

Nowa strona `/wizyta/os-czasu`: okresy dawkowania wszystkich leków jako paski na jednej osi czasu oraz wpisy jednego wybranego objawu jako znaczniki pod nimi. Użytkowniczka sama wybiera objaw (lista rozwijana, na start żaden) i może zawęzić leki (wiele z wielu). Pod wykresem lista tekstowa z tymi samymi, przefiltrowanymi danymi. Wykres rysowany na serwerze jako SVG, bez biblioteki; filtry działają samym CSS, bez JavaScriptu i bez parametrów w adresie. Roadmapa: S-09 (#112), MS-03; wymaga nowego FR-013 w PRD.

## Current State Analysis

- Oś czasu jest w PRD tylko drugorzędnym kryterium sukcesu (`context/foundation/prd.md:44`); brak FR. Ostatni numer to FR-012, więc nowy to FR-013. Wzorzec jawnej zmiany PRD: S-05, FR-011 (`context/archive/2026-10-16-visit-readable-with-current-meds/plan.md:66-72`, commit `61dcb33`).
- Leki z okresami (także zakończone) czyta `loadQuestionMedications` (`src/lib/services/doctor-question-data.ts:89-118`), zwraca `DoctorQuestionMedication` (`src/types.ts:331-346`): `{id, name, discontinuedOn, periods:[{startedOn, endedOn (wyłącznie), doseText, …}]}`. Okresy zapisane jako `[started_on, ended_on)` (`supabase/migrations/20260922120000_medication_schema.sql:81`), ostatni widoczny dzień to `ended_on − 1` (`lastDayOfPeriod`, `src/lib/services/medications.ts:123`).
- Objawy: `symptom_occurrences()` (`supabase/migrations/20261008120000_symptom_occurrences.sql`) zwraca jeden wiersz na objaw z tablicą dat — wzorzec omijania `max_rows = 1000` (`supabase/config.toml:18`), ale bez nasilenia. Nasilenie leży w `symptom_entry_items.severity` (`'mild'|'moderate'|'severe'|null`, `20261005130000_symptom_journal.sql:80-89`).
- Lek usunięty jako dodany przez pomyłkę znika fizycznie (`delete_medication`, kaskada), więc nie trafia na oś bez żadnej dodatkowej logiki.
- Czyste moduły (`src/lib/services/{medications,journal,doctor-question,visit-summary}.ts`) nie importują przez `@/`, więc ładuje je `node --test`; moduły `*-data.ts` czytają z Supabase i wołają `reportError` (para wzorcowa: `visit-summary-data.ts` + `visit-summary.ts`).
- Daty: `formatIsoDate` (`medications.ts:98`), `todayInWarsaw` (`medications.ts:48`), dzień polski z chwili — konwersja używana w `doctor-question.ts` i `journal.ts:178` (`toWarsawLocal`).
- Nawigacja: `/wizyta/os-czasu` pasuje prefiksem do `/wizyta` (`src/lib/navigation.ts:23-25`), więc jest chroniona, objęta kontrolą warunków i podświetla „Wizytę” bez zmian w `NAV_ITEMS` i ich teście.
- Kolory: brak tokenów `chart-*` (usunięte w `context/archive/2026-09-26-app-shell-visual-foundation/plan.md:64`). Bramka `scripts/tokens/hardcoded-colors.mjs` odrzuca hex i `rgb(`, przepuszcza `var(--primary)`, `currentColor` i klasy `fill-primary` pisane w całości.
- Brak nagłówka CSP w aplikacji (sprawdzone grepem w `src/`, `public/`, `astro.config.mjs`) — wygenerowany na serwerze blok `<style>` z regułami filtrów zadziała.
- Strażnicy stron: `scripts/pages/page-title.test.mjs` (tytuł tylko z `src/lib/copy/*`), `scripts/pages/url-params.test.mjs` (żaden nowy parametr), `scripts/auth/route-coverage.test.mjs` (trasa pokryta przez `INTERIOR_ROUTES`). Teksty o zdrowiu: jeden test na moduł copy w `scripts/fr012/*-copy.test.mjs`.
- Ryzyko z rejestru: limit 10 ms CPU na żądanie w Cloudflare (`context/foundation/infrastructure.md:59,115`), lokalnie niewidoczny. Wykrywanie po wdrożeniu: zadanie `cron.exceeded-cpu` w `src/worker.ts`.

## Desired End State

Na `/wizyta/os-czasu`, od góry:

1. Tytuł i krótkie wprowadzenie, przełącznik okresu „90 dni / rok / całość” (domyślnie 90 dni, czyli dzisiaj i 89 dni wstecz), lista rozwijana „Objaw” z pozycją „— wybierz objaw —” na start i objawami konta w kolejności alfabetycznej, zwinięty panel „Pokaż leki” z polem wyboru przy każdym leku (wszystkie zaznaczone).
2. Wykres:
   - **Leki** w kolejności daty rozpoczęcia pierwszego okresu, od najstarszego; przy tej samej dacie alfabetycznie. Każdy lek mający okres w wybranym zakresie dostaje wiersz. Okresy to odcinki paska z wąską przerwą przy zmianie dawki; dawka napisana w odcinku, gdy się mieści. Pasek leku trwającego sięga dzisiaj, zakończonego urywa się po ostatnim dniu brania.
   - Pod lekami linijka „N leków zakończonych przed tym okresem…”, gdy są takie leki.
   - **Objaw**: bez wyboru — podpowiedź „Wybierz objaw…”; po wyborze — jeden wiersz znaczników. Jeden dzień (polski czas) to jeden znacznik z najsilniejszym nasileniem z tego dnia. Na telefonie zawsze kreski (wysokość = nasilenie); na komputerze kropki przy 90 dniach (wypełnienie = nasilenie), kreski przy „rok” i „całość”. Objaw bez wpisów w zakresie: „Brak wpisów … Wybierz dłuższy zakres.”
   - Oś miesięcy na dole, pionowe linie miesięcy przez cały wykres, znacznik „dziś”. Nazwy nad paskiem na telefonie, w kolumnie po lewej na komputerze.
   - Legenda znaczników, stała nota: oś pokazuje daty, nie związki; o każdy lek i objaw można zapytać lekarza lub farmaceutę.
3. Gdy jakiś lek jest odznaczony: „Część leków jest ukryta.” z przyciskiem „Pokaż wszystkie” (przywraca leki, nie rusza wybranego objawu).
4. Zwijana lista „Te same dane jako tekst”: tylko widoczne leki (z okresami i dawkami, daty DD.MM.YYYY) i wybrany objaw (daty z nasileniem); bez objawu — same leki i podpowiedź.
5. Puste stany: brak leków i wpisów — wprowadzenie z drogą do dodania leku i zapisania objawu; brak leków, są wpisy — wykres samego objawu; są leki, brak wpisów — lista objawów pusta z informacją, skąd się biorą.

Odnośnik „Zobacz na osi czasu” stoi w wierszu tytułu listy bieżących leków w „Wizycie” i przy liście wpisów w „Dzienniku”. Po odświeżeniu wybór wraca do stanu startowego.

Weryfikacja: testy jednostkowe logiki osi i FR-012 na tekstach, sprawdzenia SQL nowej funkcji, test E2E na telefonie 360 px, galeria trybu ciemnego, pomiar czasu składania osi i renderu całej strony na ciężkim koncie przed merge'em, LCP ≤ 2,5 s na ciężkim koncie, po wdrożeniu brak przekroczeń limitu CPU.

### Key Discoveries:

- `<select>` daje się filtrować samym CSS: `#f:has(#sym option[value="<id>"]:checked) [data-s="<id>"]` — sprawdzone w makiecie `os-czasu-filtry.html` (scratchpad sesji planowania).
- Przycisk `type="reset"` w osobnym `<form>` z polami leków przywraca leki bez JavaScriptu i nie rusza listy objawu, o ile lista stoi poza tym formularzem.
- Liczników CSS (`counter()`) nie da się użyć do „Pokazane 6 z 10”, bo pola w zwiniętym `<details>` nie są renderowane i licznik daje 0 — dlatego sam tekst „Część leków jest ukryta.” na `:has(input:not(:checked))`.
- Reguła ukrywająca `[data-s]` musi mieć wyższą specyficzność niż reguła układu wiersza na komputerze (`grid`), inaczej wszystkie wiersze objawów zostają widoczne (błąd wyłapany w makiecie).
- Kropki o średnicy 10 px przy 90 dniach na telefonie (~3,6 px na dzień) zlewają się przy codziennych wpisach — stąd kreski na telefonie przy każdym zakresie.

## What We're NOT Doing

- Bez piątej zakładki i bez zmian w `NAV_ITEMS` (decyzja z planowania; „Przegląd” z osią i grafem to osobna, przyszła decyzja).
- Bez łączenia objawu z lekiem w obrazie: żadnych kropek na paskach leków, pionowych linii od objawu przez leki, wyróżniania leków trwających w dniu objawu ani okna 90 dni z FR-010 na wykresie (FR-012, roadmapa).
- Bez znaczników zdarzeń (start, zmiana, odstawienie) z datami — przyciągały wzrok do zbieżności z objawami.
- Dawka nie zmienia grubości ani koloru paska.
- Bez kilku objawów naraz na wykresie — jeden objaw z listy.
- Bez zapamiętywania wyboru po odświeżeniu (ciasteczko, `localStorage`).
- Bez parametrów w adresie, także dla zakresu — żaden wpis w `ALLOWED_URL_PARAMS`.
- Bez przybliżania, przesuwania palcem i dymków; bez biblioteki wykresów i bez JavaScriptu w przeglądarce.
- Bez kolejności leków według kolizji, liczby objawów czy czegokolwiek poza datą rozpoczęcia i nazwą.
- Bez notatki z wpisu na osi (notatka nie uczestniczy w regule, FR-008) i bez odnośników ze znaczników do wpisów.
- Bez zmiany progu LCP w NFR — ekran mierzony i zapisany jak w S-05, NFR bez zmian.
- Graf interakcji (S-10) poza zakresem; S-10 korzysta z tej samej techniki rysowania.

## Implementation Approach

Kolejność jak w S-05: PRD przed kodem, potem dane, czysta logika z testami, ekran, na końcu test przeglądarkowy i pomiary. Czysta funkcja zwraca wyłącznie geometrię (liczby, etykiety, identyfikatory), a SVG rysują komponenty `.astro` — Astro sam ucieka nazwy leków i dawki wpisane przez użytkowniczkę, więc nie składamy SVG ze stringów. Strona renderuje od razu wszystkie trzy zakresy i wszystkie wiersze; CSS pokazuje jedną kombinację. Reguły filtrów (zależne od identyfikatorów leków i objawów konta) powstają na serwerze w jednym bloku `<style>`.

## Critical Implementation Details

- **Identyfikatory w CSS i atrybutach**: w selektorach i `data-*` wyłącznie uuid (leki konta pod RLS, objawy z katalogu) — nigdy nazwa. To HTML strony, nie adres, więc reguła „żadnej nazwy w URL” nie jest naruszona; tytuł strony stały z `src/lib/copy/timeline.ts`.
- **Dzień objawu**: znacznik stoi w dniu polskiego czasu z `occurred_at` (wpis o 00:30 w Polsce to ten dzień, choć w UTC poprzedni). Test z `process.env.TZ = "UTC"`, jak `scripts/doctor-question/doctor-question.test.mjs`.
- **Specyficzność ukrywania**: patrz Key Discoveries — reguły pokazujące wybrany objaw mają `#id`, reguła bazowa ukrywająca musi przebić `.desk .row`.
- **Limit CPU**: trzy zakresy × dwa układy (telefon, komputer) × wiersze wszystkich objawów (lista rozwijana filtruje CSS-em, więc każdy objaw jest w HTML) plus lista tekstowa — przy 1000 wpisów rząd 6000+ elementów SVG, ok. 6× pracy jednego widoku. Kosztem jest render Astro, nie logika. Dwa pomiary przed merge'em: logika w fazie 2 (dolna granica), render całej strony na ciężkim koncie w fazie 3 (próg z zapasem do 10 ms). Przekroczenie progu to stop i decyzja autorki (rysowanie w przeglądarce, jedna geometria, płatny próg) przed wdrożeniem, nie cicha zmiana techniki ani wykrycie po awarii (`context/foundation/infrastructure.md:115`).

## Faza 1: PRD i dane

### Overview

Jawne FR-013 w PRD, funkcja bazy zwracająca wpisy objawów z nasileniem odporna na `max_rows`, sprawdzenia SQL i moduł danych osi. Ekran jeszcze nie istnieje.

### Changes Required:

#### 1. PRD

**File**: `context/foundation/prd.md`

**Intent**: Oś czasu przestaje być tylko kryterium drugorzędnym — dostaje własne wymaganie, zapisane jawnie z datą i numerem roadmapy, z wypisanymi granicami, których nie narusza.

**Contract**: Nowy punkt `FR-013` w nowej podsekcji `### Oś czasu` po `### Podsumowanie na wizytę` (po FR-011): strona otwierana z „Wizyty” i „Dziennika”; okresy dawkowania wszystkich leków na wspólnej osi, kolejność według daty rozpoczęcia (przy remisie alfabetycznie), nigdy według kolizji ani objawów; jeden objaw wybierany przez użytkowniczkę, na start żaden; leki zawężalne, z widoczną informacją o ukryciu; zakres 90 dni / rok / całość; lista tekstowa tych samych danych; stała nota „oś pokazuje daty, nie związki”. Adnotacja „Dodane 17.10.2026, S-09 (#112); wcześniej kryterium drugorzędne (`## Success Criteria`)”. „Nienaruszone: FR-012 (oś nie łączy objawu z lekiem w obrazie, nie wyróżnia zbieżności), FR-004 i FR-005 (historia okresów bez zmian, ekran tylko czyta), FR-010 (pytania bez zmian), dane wyłącznie z konta pod RLS, żadna nazwa leku ani objawu w adresie”. `Priority: nice-to-have` (autorka: „ciekawy dodatek dla zainteresowanych”, nie podstawowa funkcja). Kryterium drugorzędne w `## Success Criteria` dostaje odwołanie „(FR-013)”.

#### 2. Funkcja bazy z wpisami objawów

**File**: `supabase/migrations/<YYYYMMDDHHmmss>_symptom_timeline.sql`

**Intent**: Oś potrzebuje dat i nasilenia każdego wpisu każdego objawu konta; zwykły select ucinałby wynik na 1000 wierszach. Agregat per objaw daje najwyżej tyle wierszy, ile objawów w katalogu.

**Contract**: `public.symptom_timeline() returns table (symptom_id uuid, symptom_name text, occurred_at timestamptz[], severities text[])` — dwie tablice równoległe, ułożone rosnąco po `occurred_at` (ta sama kolejność w obu `array_agg`), `severities` z `null` dla wpisu bez nasilenia. `language sql stable security invoker set search_path = ''`, filtr `where e.user_id = (select auth.uid())` jak w `symptom_occurrences`, `comment on function` z przykładem i zdaniem o FR-012, `revoke execute … from public, anon`, `grant execute … to authenticated`. Bez nowej tabeli.

#### 3. Sprawdzenia SQL

**File**: `supabase/tests/symptom_timeline_checks.sql`

**Intent**: Dowód, że funkcja zwraca komplet dat z nasileniem w dobrej kolejności, że konto B nie widzi wpisów konta A, i że `anon` nie wykona funkcji.

**Contract**: Struktura i reguły jak `supabase/tests/symptom_occurrences_checks.sql` (role przełączane na górnym poziomie bloku, nazwane błędy zamiast `when others`, transakcja z `rollback`, własna pula uuid, końcowy `GATE_COMPLETE symptom_timeline_checks`). Bloki: TIMELINE 1 (wpisy wstawione poza kolejnością wracają rosnąco, `severities[i]` należy do `occurred_at[i]`, w tym `null`); TIMELINE 2 (izolacja z warunkiem wstępnym, że A widzi swoje wiersze); TIMELINE 3 (uprawnienia: kod błędu `anon` zmierzony przed ustawieniem warunku).

#### 4. Typy i moduł danych

**File**: `src/types.ts`, `src/lib/services/timeline-data.ts`

**Intent**: Jedno wejście danych dla strony, w kształcie gotowym dla czystej logiki z fazy 2.

**Contract**: Typ `TimelineSymptomEntries = { symptomId: string; name: string; entries: { occurredAt: string; severity: SymptomSeverity | null }[] }`. `loadTimelineData(supabase): Promise<{ medications: DoctorQuestionMedication[]; symptoms: TimelineSymptomEntries[] } | { error: true }>` — równolegle `loadQuestionMedications` i `rpc("symptom_timeline")` (wynik rzutowany ręcznie, jak `visit-summary-data.ts:41`); błąd zgłaszany `reportError("timeline.load", { code, route })` ze stałą etykietą, bez treści błędu.

### Success Criteria:

#### Automated Verification:

- Migracja wchodzi na czystą bazę: `npx supabase db reset`
- Sprawdzenia SQL przechodzą, w tym `GATE_COMPLETE symptom_timeline_checks`: `npm run db:check`
- Testy i bramki repozytorium przechodzą: `npm test`
- Typy przechodzą: `npm run typecheck`
- Lint przechodzi: `npm run lint`

#### Manual Verification:

- Autorka zatwierdza FR-013 w PRD

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Faza 2: Logika osi

### Overview

Czysta funkcja, która z danych konta, dzisiejszej daty i zakresu liczy całą geometrię wykresu. Bez wyglądu, bez Supabase. Nadaje się na `/10x-tdd`.

### Changes Required:

#### 1. Logika osi

**File**: `src/lib/services/timeline.ts`

**Intent**: Wszystkie reguły z „Desired End State” w jednym testowalnym miejscu: zakresy, kolejność leków, odcinki, scalanie wpisów dnia, znaczniki miesięcy. Bez importów przez `@/`.

**Contract**: `buildTimeline(input: { medications: DoctorQuestionMedication[]; symptoms: TimelineSymptomEntries[]; today: string /* YYYY-MM-DD, polski dzień */ }): TimelineModel`, gdzie `TimelineModel` zawiera dla każdego z trzech zakresów (`"90d" | "year" | "all"`) granice `[from, to)` w dniach, listę wierszy leków (id, nazwa, odcinki z ułamkowym położeniem 0–1 początku i końca, tekst dawki, daty do listy tekstowej), liczbę leków zakończonych przed zakresem, wiersze objawów (id, nazwa, znaczniki: dzień, położenie 0–1, nasilenie) i znaczniki miesięcy (położenie, skrót miesiąca). Położenia ułamkowe, nie piksele — szerokość zależy od widoku (telefon, komputer) i przelicza ją komponent. Osobno lista objawów do listy rozwijanej (alfabetycznie, `localeCompare(…, "pl")`) i lista leków do pól wyboru (kolejność wykresu). Reguły:

- „90 dni” = `[today − 89, today + 1)`, „rok” = `[today − 364, today + 1)`, „całość” = od najwcześniejszego z: początku pierwszego okresu, pierwszego wpisu objawu.
- Lek w zakresie, gdy któryś okres przecina zakres; kolejność: `startedOn` pierwszego okresu rosnąco, remis alfabetycznie (`pl`).
- Odcinek przycięty do zakresu; okres trwający kończy się na `today + 1`. Odcinek, którego koniec nie leży po początku (okres z przyszłą datą rozpoczęcia — blokuje ją tylko trasa `src/pages/api/medications/index.ts:33-35`, nie baza), jest pomijany; lek bez żadnego odcinka w zakresie nie dostaje wiersza.
- Wpisy objawu zamieniane na dzień polskiego czasu; kilka wpisów jednego dnia → jeden znacznik z najsilniejszym nasileniem (`severe` > `moderate` > `mild` > brak).
- Helper `labelFits(segmentWidthPx, text)` (przybliżona szerokość znaku) używany przez komponent.
- `buildFilterCss(model): string` składa reguły filtrów dla strony (zakres, objaw, leki, podpowiedź, „Część leków jest ukryta.”). Wstawia wyłącznie identyfikatory pasujące do wzorca uuid; każdy inny pomija. Wynik idzie do `set:html`, który omija zabezpieczenie Astro, więc ta funkcja jest jedyną bramką przed wstrzyknięciem treści do strony.

#### 2. Testy logiki

**File**: `scripts/timeline/timeline.test.mjs`

**Intent**: Asercje na obserwowalnym wyniku, z PRD i decyzji planowania, nie z kodu.

**Contract**: Przypadki co najmniej: kolejność leków (data, remis alfabetyczny, nigdy kolejność wejścia); lek zakończony przed zakresem poza wierszami i policzony; zmiana dawki daje dwa odcinki stykające się w dniu zmiany; lek zakończony urywa się na `ended_on` (wyłącznie); granice „90 dni” (dzień `today − 89` w środku, `today − 90` poza); wpis o 23:30 UTC liczony do następnego polskiego dnia (`TZ=UTC`); trzy wpisy jednego dnia → jeden znacznik z najsilniejszym nasileniem, w tym `null` przegrywa z `mild`; objaw bez wpisów w zakresie ma pusty wiersz, a nie znika z listy rozwijanej; lista rozwijana alfabetyczna niezależnie od kolejności wejścia; „całość” zaczyna się od wcześniejszego z pierwszego okresu i pierwszego wpisu; okres trwający z `startedOn` po `today` nie daje odcinka; `buildFilterCss` z identyfikatorem spoza wzorca uuid (np. `x"]</style><script>`) nie zawiera go w wyniku ani znaków `<`, a poprawne uuid trafiają do reguł.

#### 3. Pomiar czasu

**File**: `scripts/timeline/bench.mjs`

**Intent**: Zmierzyć przed ekranem, czy samo składanie osi zostawia zapas w limicie 10 ms CPU. To dolna granica — koszt całej strony mierzy faza 3 (pomiar renderu).

**Contract**: Skrypt (poza `npm test`, żeby nie dawać fałszywych błędów na wolnym CI) generuje 20 leków po 3 okresy i 1000 wpisów rozłożonych na 8 objawów w ciągu roku, wywołuje `buildTimeline` 200 razy i wypisuje medianę i 95. percentyl w ms. Próg: mediana ≤ 2 ms (logika to ułamek pracy żądania, reszta to render Astro). Wynik zapisany w `change.md` → `## Notes`.

### Success Criteria:

#### Automated Verification:

- Testy logiki osi przechodzą: `npm test`
- Pomiar wypisuje medianę ≤ 2 ms: `node --experimental-strip-types scripts/timeline/bench.mjs`
- Typy przechodzą: `npm run typecheck`
- Lint przechodzi: `npm run lint`

#### Manual Verification:

- Wynik pomiaru (mediana, 95. percentyl) zapisany w `change.md`

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Faza 3: Ekran osi czasu

### Overview

Strona `/wizyta/os-czasu` z wykresem SVG, filtrami CSS, listą tekstową i pustymi stanami; teksty w module copy z testem FR-012; odnośniki z „Wizyty” i „Dziennika”.

### Changes Required:

#### 1. Teksty

**File**: `src/lib/copy/timeline.ts`, `scripts/fr012/timeline-copy.test.mjs`

**Intent**: Każdy tekst ekranu w jednym module, przepuszczony przez filtr słów zakazanych FR-012.

**Contract**: `TIMELINE_COPY` (same stringi): tytuł strony i nagłówek, wprowadzenie, etykiety zakresów, etykieta i pozycja startowa listy objawu, „Pokaż leki”, „Część leków jest ukryta.”, „Pokaż wszystkie”, nagłówki „Leki” i „Objaw”, podpowiedź bez objawu, „brak wpisów w tym okresie”, szablon „N leków zakończonych przed tym okresem…” (z odmianą), legenda kropek i kresek, nota („Oś pokazuje daty, nie związki. O każdy lek i objaw możesz zapytać lekarza lub farmaceutę.”), „Te same dane jako tekst”, puste stany, `loadError`, etykieta odnośnika „Zobacz na osi czasu”, opis wykresu dla czytników ekranu. Test jak `scripts/fr012/visit-summary-copy.test.mjs`: `collectTexts` + `forbiddenWordsIn(text)` = `[]` + lista wymaganych kluczy. Wstawianie liczb i nazw w szablony jednym przebiegiem (`fill` z `doctor-question.ts`), nie łańcuchem `.replace`.

#### 2. Komponenty wykresu

**File**: `src/components/timeline/TimelineChart.astro` (oraz drobniejsze komponenty wiersza, jeśli czytelniej)

**Intent**: Rysuje model z fazy 2 dla jednego zakresu i jednego widoku jako wiersze HTML z wąskim SVG w każdym — dzięki temu ukrycie wiersza skraca wykres, a nazwy są zwykłym tekstem (zawijają się zamiast ucinania).

**Contract**: Wiersz leku: `data-m="<medication uuid>"`, nazwa w HTML, SVG z odcinkami `fill="var(--primary)"`, dawka `fill="var(--primary-foreground)"` gdy `labelFits`. Wiersz objawu: `data-s="<symptom uuid>"`, znaczniki w `var(--foreground)` (brak nasilenia: `var(--muted-foreground)` / kontur przerywany). Linie miesięcy `var(--border)`, oś `var(--muted-foreground)`. Żadnego hexa, `rgb(`, klas palety ani `dark:`; tryb ciemny przez tokeny. Dwa warianty geometrii (telefon i komputer) przełączane `hidden`/`lg:` w CSS, jak reszta aplikacji; na telefonie zawsze kreski, na komputerze kropki tylko przy „90 dni”. SVG `role="img"` z `aria-label` ze stałego tekstu copy; dane dla czytników daje lista tekstowa.

#### 3. Strona

**File**: `src/pages/wizyta/os-czasu.astro`

**Intent**: Składa dane, model i komponenty; filtry bez JavaScriptu.

**Contract**: Frontmatter jak `src/pages/wizyta.astro`: komentarz z S-09/FR-013 i regułami FR-012 i URL, `createClient`, `loadTimelineData`, przy błędzie status 500 i `copy.loadError` w `role="alert"`, `todayInWarsaw()`, `buildTimeline`. `<AppLayout title={copy.title}>` (tytuł stały). Kontrolki: radio zakresu (domyślnie „90 dni”), `<select>` objawu (pierwsza opcja `value=""` zaznaczona), osobny `<form method="POST">` z polami leków w `<details>` i `<button type="reset">` — bez przycisku wysyłania i bez pól tekstowych, więc nic go nie wyśle (Enter też nie); `method="POST"` wymaga `scripts/pages/url-params.test.mjs:193-199`. Radio zakresu i `<select>` objawu stoją poza tym formularzem (reset przywraca wszystkie pola swojego formularza, więc inaczej „Pokaż wszystkie” cofałby też zakres i objaw). Przycisk „Pokaż wszystkie” stoi przy komunikacie „Część leków jest ukryta.”, poza `<details>`, i należy do formularza leków przez atrybut `form="<id formularza leków>"`. Wszystkie trzy zakresy wyrenderowane, widoczny jeden. Jeden blok `<style is:inline set:html={buildFilterCss(model)}>` (zwykły `<style>` Astro kompiluje przy buildzie i nie przyjmie wyrażeń) z regułami `:has()`: zakres → `.rng-<klucz>`, objaw → `[data-s]` (w wykresie i w liście tekstowej), lek → `[data-m]`, podpowiedź bez objawu, „Część leków jest ukryta.” Bazowa reguła ukrywająca `[data-s]` o specyficzności wyższej niż układ wiersza. Lista tekstowa w `<details>` z tymi samymi `data-m`/`data-s`. Bez formularza GET i bez parametrów adresu. Strona tylko ładuje dane i liczy model; całe ciało (kontrolki, `<style>`, wykresy, lista tekstowa) leży w `src/components/timeline/TimelineView.astro` z propsami `{ model }`, żeby pomiar renderu dało się wykonać bez Supabase.

#### 4. Odnośniki

**File**: `src/pages/wizyta.astro`, `src/pages/dzienniczek/index.astro`

**Intent**: Dwa wejścia na oś tam, gdzie są dane, bez przeładowania ekranów.

**Contract**: W „Wizycie” sekcja `data-visit-current-medications` ma dziś samo `<h2>` (`wizyta.astro:62-64`): owinąć je w nowy wiersz `flex flex-wrap items-center justify-between gap-4` (wzorzec: wiersz tytułu z „Dodaj” w `dzienniczek/index.astro:160-165`), odnośnik `timelineLink` do `/wizyta/os-czasu` po prawej, na wąskim ekranie zawija się pod tytuł; `<h2>` zachowuje `id` dla `aria-labelledby`. W „Dzienniku” lista wpisów nie ma nagłówka: ten sam odnośnik stoi tuż nad `<ul>` (`dzienniczek/index.astro:212`), wyłącznie w gałęzi z wpisami — nie w pustym stanie (`:205-211`) ani przy błędzie ładowania; oś z samymi lekami otwiera się z „Wizyty”. Etykieta z `TIMELINE_COPY`.

#### 5. Pomiar renderu całej strony

**File**: `scripts/timeline/render-bench.mjs`

**Intent**: Zmierzyć przed merge'em to, co faktycznie może przebić limit 10 ms CPU: render całego ciała strony z wszystkimi zakresami, oboma układami i wierszami wszystkich objawów, na koncie ciężkim, nie testowym.

**Contract**: Skrypt poza `npm test`. Generuje te same dane co `bench.mjs` (20 leków po 3 okresy, 1000 wpisów na 8 objawów w ciągu roku; generator wspólny, nie skopiowany), liczy `buildTimeline` i renderuje `TimelineView.astro` przez Astro Container API (`experimental_AstroContainer` z `astro/container`), uruchomione w Vite, bo `node` sam nie ładuje `.astro`. 200 renderów po rozgrzewce, mediana i 95. percentyl w ms (logika + render). Próg: mediana ≤ 7 ms (decyzja autorki 17.10.2026, `change.md`) — zapas na Supabase, middleware i różnicę Node ↔ workerd (niezmierzoną). Przekroczenie progu albo brak możliwości uruchomienia Container API = stop i decyzja autorki przed wdrożeniem, bez cichej zmiany techniki. Wynik i rozmiar HTML w `change.md` → `## Notes`.

### Success Criteria:

#### Automated Verification:

- Testy, w tym FR-012 nowego modułu copy, tytuł strony, parametry adresu, pokrycie tras i bramka kolorów: `npm test`
- Typy przechodzą: `npm run typecheck`
- Lint przechodzi: `npm run lint`
- Build przechodzi: `npm run build`
- Pomiar renderu całej strony na ciężkim koncie wypisuje medianę ≤ 7 ms (decyzja autorki 17.10.2026, `change.md`): `node scripts/timeline/render-bench.mjs`

#### Manual Verification:

- Na telefonie (360 px) i komputerze, w trybie jasnym i ciemnym: przełącznik zakresu, wybór objawu, ukrycie leku i „Pokaż wszystkie” działają bez przeładowania, lista tekstowa pokazuje tylko wybrane leki i objaw
- Odnośnik „Zobacz na osi czasu” w „Wizycie” i „Dzienniku” prowadzi na oś, a w menu podświetla się „Wizyta”
- Puste stany (konto bez danych, same leki, same wpisy) mówią, skąd bierze się brak treści
- Autorka akceptuje brzmienie tekstów ekranu, w tym noty

Sprawdzenie telefonu w pierwszym kroku ręcznym obejmuje Safari na iPhonie (WebKit). Playwright ma tylko projekt `chromium` (`playwright.config.ts:25-32`), a filtry stoją na `:has()` z `option:checked`, sprawdzonych w makiecie w jednej przeglądarce.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Faza 4: Test przeglądarkowy i pomiary

### Overview

Test E2E na ryzyku „filtr ukrywa dane, a obraz pokazany lekarzowi jest niepełny bez ostrzeżenia”, stan osi w galerii trybu ciemnego, pomiar LCP i sprawdzenie limitu CPU po wdrożeniu.

### Changes Required:

#### 1. Test E2E

**File**: `tests/e2e/medication-symptom-timeline.spec.ts`

**Intent**: Przeglądarka dowodzi, że filtry działają na wyrenderowanym ekranie telefonu i że ukrycie leków jest zawsze widoczne.

**Contract**: Wzorzec `tests/e2e/medication-interactions-compact.spec.ts`: świeże konto przez HTTP na test, sprzątanie w `afterEach`, `viewport: { width: 360, height: 740 }`, lokatory `getByRole`, objawy przez `pickSymptom` z `tests/e2e/journal-helpers.ts`. Dane: dwa leki (jeden ze zmianą dawki), dwa objawy z wpisami z ostatnich 14 dni. Asercje: na start brak wiersza objawu i jest podpowiedź; po wyborze objawu widać jego wiersz, a drugiego nie; po odznaczeniu leku jego wiersz i pozycja w liście tekstowej znikają i pojawia się „Część leków jest ukryta.”; „Pokaż wszystkie” przywraca lek i zostawia wybrany objaw oraz zakres przełączony wcześniej na „rok”; adres strony przez cały test równy `/wizyta/os-czasu` (bez parametrów, bez nazw); odnośnik z „Wizyty” prowadzi na oś. Weryfikacja, że test pada, gdy ryzyko wystąpi (np. usunięta reguła tekstu o ukryciu).

#### 2. Galeria trybu ciemnego

**File**: `tests/e2e/dark-gallery.spec.ts`

**Intent**: Oś w obu trybach i obu szerokościach trafia do galerii, w której autorka przegląda wygląd.

**Contract**: Wpis jest obowiązkowy — test „every page in src/pages has an entry” (`tests/e2e/dark-gallery.spec.ts:373-383`) jest czerwony bez niego. Dwa wpisy w `ENTRIES`, w istniejących widokach `phone` i `desktop`: `{ page: "wizyta/os-czasu", session: true, path: () => "/wizyta/os-czasu" }` (stan startowy: wszystkie leki, podpowiedź bez objawu) oraz stan `symptom-selected`, w którym `prepare` wybiera objaw z listy (`selectOption` na `getByRole("combobox", { name: … })`) i czeka na widoczny wiersz objawu — wzorzec `interactions-collapsed` (`dark-gallery.spec.ts:272-281`). Dane galerii (3 leki sprzed 2 dni, 1 wpis jednego objawu) nie pokazują gęstości znaczników, kilku miesięcy ani zakresów „rok” i „całość” — te sprawdza krok ręczny 3.6, nie galeria.

#### 3. Pomiary

**File**: `context/changes/medication-symptom-timeline/change.md`

**Intent**: Zapisane liczby zamiast deklaracji, jak w impl-review S-05 (F6).

**Contract**: W `## Notes`: mediana LCP z 3 przebiegów Lighthouse Mobile na `/wizyta/os-czasu` (build + `astro preview` na lokalnym Supabase, jak S-05) na ciężkim koncie — 20 leków, 1000 wpisów, 8 objawów, wypełnionym skryptem `scripts/timeline/seed-heavy.mjs` (ten sam generator co pomiary; odmawia pracy, gdy adres Supabase nie jest lokalny — lesson „Lokalne bramki sprawdź…”), wyniki pomiarów z fazy 2 i 3, a po wdrożeniu — wynik sprawdzenia przekroczeń limitu CPU (Sentry `cron.exceeded-cpu` / Workers Analytics) z datą.

### Success Criteria:

#### Automated Verification:

- Test E2E osi przechodzi na lokalnym Supabase: `npx playwright test tests/e2e/medication-symptom-timeline.spec.ts`
- Galeria trybu ciemnego przechodzi: `npx playwright test tests/e2e/dark-gallery.spec.ts`
- Testy, typy i lint przechodzą: `npm test && npm run typecheck && npm run lint`

#### Manual Verification:

- Test E2E pada po celowym usunięciu reguły „Część leków jest ukryta.” i przechodzi po jej przywróceniu
- Mediana LCP z 3 przebiegów Lighthouse Mobile ≤ 2,5 s na ciężkim koncie, zapisana w `change.md`
- Autorka przegląda stan osi w galerii trybu ciemnego (telefon i komputer)
- Po wdrożeniu i otwarciu osi na produkcji brak przekroczeń limitu CPU, wynik zapisany w `change.md`

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Testing Strategy

### Unit Tests:

- Logika osi (`scripts/timeline/timeline.test.mjs`): kolejność leków, granice zakresów, odcinki przy zmianie dawki i odstawieniu, dzień polskiego czasu, scalanie wpisów dnia z najsilniejszym nasileniem, lista rozwijana alfabetyczna, „całość”.
- Teksty (`scripts/fr012/timeline-copy.test.mjs`): filtr słów zakazanych na każdym stringu, wymagane klucze.
- Istniejące strażniki obejmują nową stronę same: tytuł, parametry adresu, pokrycie tras, bramka kolorów, nazwa „Dziennik”.

### Integration Tests:

- SQL (`supabase/tests/symptom_timeline_checks.sql`): kolejność i parowanie nasilenia, izolacja kont, uprawnienia.
- E2E (`tests/e2e/medication-symptom-timeline.spec.ts`): filtry, widoczność ukrycia, brak parametrów w adresie, odnośnik z „Wizyty”.

### Manual Testing Steps:

1. Zaloguj się kontem z kilkoma lekami (jeden ze zmianą dawki, jeden zakończony) i wpisami dwóch objawów; otwórz „Wizytę” i kliknij „Zobacz na osi czasu”.
2. Sprawdź start: wszystkie leki, brak objawu, podpowiedź; przełącz „rok” i „całość”.
3. Wybierz objaw, odznacz jeden lek, rozwiń „Te same dane jako tekst” — tylko widoczne leki i wybrany objaw.
4. Kliknij „Pokaż wszystkie” — leki wracają, objaw zostaje.
5. Powtórz w trybie ciemnym i na szerokości 360 px; odśwież stronę — wybór wraca do startu.

## Performance Considerations

Strona renderuje trzy zakresy w dwóch układach i wszystkie objawy naraz, więc praca serwera rośnie ok. sześciokrotnie względem jednego widoku. Pomiary przed merge'em na ciężkim koncie (20 leków, 1000 wpisów, 8 objawów): logika w fazie 2 (mediana ≤ 2 ms), render całej strony w fazie 3 (mediana ≤ 7 ms, decyzja autorki 17.10.2026, `change.md`), LCP w fazie 4. Po wdrożeniu istniejące zadanie `cron.exceeded-cpu` jest siatką bezpieczeństwa, nie pierwszym pomiarem. Przekroczenie progu to stop i nowa decyzja autorki (np. rysowanie w przeglądarce, które czysta funkcja umożliwia bez przepisywania), nie cicha zmiana techniki.

## Migration Notes

Jedna nowa funkcja bazy, bez nowej tabeli i bez zmian danych. Po merge'u: `npx supabase db push` i sprawdzenie listy migracji (lesson „Po merge'u migracji wykonaj db push”) — bez tego strona na produkcji zwróci błąd ładowania mimo zielonego CI.

## References

- Roadmapa: `context/foundation/roadmap.md` — S-09 (#112), S-10
- PRD: `context/foundation/prd.md:44` (kryterium drugorzędne), FR-010–FR-012
- Wzorzec zmiany PRD i ekranu: `context/archive/2026-10-16-visit-readable-with-current-meds/plan.md`
- Wzorzec funkcji odpornej na `max_rows`: `supabase/migrations/20261008120000_symptom_occurrences.sql`, `context/archive/2026-10-08-doctor-visit-summary/plan.md:34`
- Dane leków: `src/lib/services/doctor-question-data.ts:89-118`
- Ryzyko CPU: `context/foundation/infrastructure.md:59,115`
- Makiety z planowania (scratchpad sesji, poza repozytorium): `os-czasu-makieta.html`, `os-czasu-gesto.html`, `os-czasu-filtry.html`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: PRD i dane

#### Automated

- [x] 1.1 Migracja wchodzi na czystą bazę: `npx supabase db reset` — a5b06e2
- [x] 1.2 Sprawdzenia SQL przechodzą, w tym `GATE_COMPLETE symptom_timeline_checks`: `npm run db:check` — a5b06e2
- [x] 1.3 Testy i bramki repozytorium przechodzą: `npm test` — a5b06e2
- [x] 1.4 Typy przechodzą: `npm run typecheck` — a5b06e2
- [x] 1.5 Lint przechodzi: `npm run lint` — a5b06e2

#### Manual

- [x] 1.6 Autorka zatwierdza FR-013 w PRD — a5b06e2

### Phase 2: Logika osi

#### Automated

- [x] 2.1 Testy logiki osi przechodzą: `npm test` — 815e49d
- [x] 2.2 Pomiar wypisuje medianę ≤ 2 ms: `node --experimental-strip-types scripts/timeline/bench.mjs` — 815e49d
- [x] 2.3 Typy przechodzą: `npm run typecheck` — 815e49d
- [x] 2.4 Lint przechodzi: `npm run lint` — 815e49d

#### Manual

- [x] 2.5 Wynik pomiaru (mediana, 95. percentyl) zapisany w `change.md` — 815e49d

### Phase 3: Ekran osi czasu

#### Automated

- [x] 3.1 Testy, w tym FR-012 nowego modułu copy, tytuł strony, parametry adresu, pokrycie tras i bramka kolorów: `npm test` — 95116eb
- [x] 3.2 Typy przechodzą: `npm run typecheck` — 95116eb
- [x] 3.3 Lint przechodzi: `npm run lint` — 95116eb
- [x] 3.4 Build przechodzi: `npm run build` — 95116eb
- [x] 3.5 Pomiar renderu całej strony na ciężkim koncie wypisuje medianę ≤ 5 ms: `node scripts/timeline/render-bench.mjs` — 95116eb

#### Manual

- [x] 3.6 Na telefonie (360 px) i komputerze, w trybie jasnym i ciemnym: przełącznik zakresu, wybór objawu, ukrycie leku i „Pokaż wszystkie” działają bez przeładowania, lista tekstowa pokazuje tylko wybrane leki i objaw — 95116eb
- [x] 3.7 Odnośnik „Zobacz na osi czasu” w „Wizycie” i „Dzienniku” prowadzi na oś, a w menu podświetla się „Wizyta” — 95116eb
- [x] 3.8 Puste stany (konto bez danych, same leki, same wpisy) mówią, skąd bierze się brak treści — 95116eb
- [x] 3.9 Autorka akceptuje brzmienie tekstów ekranu, w tym noty — 95116eb

### Phase 4: Test przeglądarkowy i pomiary

#### Automated

- [x] 4.1 Test E2E osi przechodzi na lokalnym Supabase: `npx playwright test tests/e2e/medication-symptom-timeline.spec.ts` — a2e7c09
- [x] 4.2 Galeria trybu ciemnego przechodzi: `npx playwright test tests/e2e/dark-gallery.spec.ts` — a2e7c09
- [x] 4.3 Testy, typy i lint przechodzą: `npm test && npm run typecheck && npm run lint` — a2e7c09

#### Manual

- [x] 4.4 Test E2E pada po celowym usunięciu reguły „Część leków jest ukryta.” i przechodzi po jej przywróceniu — a2e7c09
- [x] 4.5 Mediana LCP z 3 przebiegów Lighthouse Mobile ≤ 2,5 s na ciężkim koncie, zapisana w `change.md` — a2e7c09
- [x] 4.6 Autorka przegląda stan osi w galerii trybu ciemnego (telefon i komputer) — a2e7c09
- [ ] 4.7 Po wdrożeniu i otwarciu osi na produkcji brak przekroczeń limitu CPU, wynik zapisany w `change.md`
