<!-- PLAN-REVIEW-REPORT -->

# Plan Review: Oś czasu leków i objawów

- **Plan**: context/changes/medication-symptom-timeline/plan.md
- **Mode**: Deep
- **Date**: 2026-10-17
- **Verdict**: REVISE → SOUND po triage'u (8/8 FIXED)
- **Findings**: 2 critical, 4 warnings, 2 observations

## Verdicts

| Dimension             | Verdict |
| --------------------- | ------- |
| End-State Alignment   | PASS    |
| Lean Execution        | PASS    |
| Architectural Fitness | FAIL    |
| Blind Spots           | FAIL    |
| Plan Completeness     | WARNING |

## Grounding

12/12 paths ✓, 6/6 symbols ✓ (`toWarsawLocal`, `fill`, `loadQuestionMedications`, `todayInWarsaw`, `lastDayOfPeriod`, `formatIsoDate`), brief↔plan ✓, Progress↔fazy ✓

## Findings

### F1 — Formularz leków bez method="POST" wywróci `npm test`

- **Severity**: ❌ CRITICAL
- **Impact**: 🏃 LOW — szybka decyzja, poprawka oczywista i wąska
- **Dimension**: Architectural Fitness
- **Location**: Faza 3 — Strona (`src/pages/wizyta/os-czasu.astro`)
- **Detail**: `scripts/pages/url-params.test.mjs:193-199` zgłasza każdy `<form>` w `.astro` bez `method="POST"` (wyjątek tylko dla `.tsx` z `onSubmit`). Plan opisuje „osobny `<form>` z polami leków i `<button type="reset">`” bez metody — krok 3.1 będzie czerwony.
- **Fix**: W kontrakcie strony: `<form method="POST">` bez przycisku wysyłania i bez pól tekstowych (żadnego wysłania przez Enter); jedyny przycisk to `type="reset"`.
- **Decision**: FIXED

### F2 — Pomiar CPU mierzy nie to, co przebije limit

- **Severity**: ❌ CRITICAL
- **Impact**: 🔬 HIGH — stawka architektoniczna, przemyśl przed decyzją
- **Dimension**: Blind Spots
- **Location**: Faza 2 (pomiar), Faza 4 (LCP, CPU), Performance Considerations
- **Detail**: `bench.mjs` mierzy tylko `buildTimeline`, a kosztem jest render Astro: 3 zakresy × 2 geometrie (telefon/komputer) × wiersze wszystkich objawów (lista rozwijana filtruje CSS-em, więc każdy objaw jest w HTML) + lista tekstowa — przy 1000 wpisów rząd 6000+ elementów SVG; to ok. 6×, nie 3×, jak mówi plan. LCP mierzone na koncie z testu E2E (2 leki, wpisy z 14 dni) nie pokaże przypadku ciężkiego. Limit 10 ms sprawdzany dopiero po wdrożeniu, gdy użytkowniczka już widzi błąd 1102, a `cron.exceeded-cpu` liczy per skrypt i nie wskaże trasy. `context/foundation/infrastructure.md:115`: decyzja (render w przeglądarce albo płatny próg) „zapada przed pierwszą implementacją wykresu, nie po awarii”.
- **Fix A ⭐ Recommended**: Pomiar renderu całej strony na ciężkim koncie (20 leków, 1000 wpisów, 8 objawów) przez Astro Container API w Node, w fazie 3 przed merge'em; próg z zapasem (np. ≤ 5 ms); przekroczenie = stop i decyzja autorki przed wdrożeniem. LCP też na ciężkim koncie.
  - Strength: Mierzy faktyczny koszt; zgodne z lesson „Zmierz, zanim wdrożysz poprawkę na produkcję”.
  - Tradeoff: Nowy skrypt pomiarowy (w repozytorium żadnego nie ma); Node to nie workerd, liczba przybliżona.
  - Confidence: MED — Container API jest w Astro 5, ale nieużywane w repozytorium.
  - Blind spot: Rozbieżność CPU między Node a workerd niezmierzona.
- **Fix B**: Zmniejszyć pracę i zdecydować o progu teraz — jedna geometria (SVG z `viewBox` i `preserveAspectRatio="none"`, położenia i tak są ułamkowe; kropka/kreska przełączana CSS-em) plus jawna decyzja autorki o płatnym progu 5 USD/mies. jako siatce bezpieczeństwa.
  - Strength: Połowa pracy renderu; ryzyko 1102 zamknięte decyzją.
  - Tradeoff: Koszt miesięczny; kropki w skalowanym `viewBox` wymagają `vector-effect` albo kółek w HTML.
  - Confidence: MED — skalowanie kropek niesprawdzone w makiecie.
  - Blind spot: Czy `labelFits` (piksele) działa bez znanej szerokości.
- **Decision**: FIXED via Fix A (render-bench w fazie 3, próg ≤ 5 ms, LCP na ciężkim koncie)

### F3 — Dynamiczny `<style>` wymaga `is:inline set:html`

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — szybka decyzja, poprawka oczywista i wąska
- **Dimension**: Architectural Fitness
- **Location**: Faza 3 — Strona
- **Detail**: Astro kompiluje `<style>` przy buildzie — wyrażeń w środku nie obsłuży. W `src/` nie ma żadnego dynamicznego stylu (nowy wzorzec). Działa `<style is:inline set:html={css}>`, które omija escapowanie Astro, więc wstawiane wartości muszą być pewne.
- **Fix**: Kontrakt: `<style is:inline set:html={css}>`; CSS budowany przez funkcję, która przepuszcza wyłącznie identyfikatory pasujące do wzorca uuid (inne pomija), z testem jednostkowym.
- **Decision**: FIXED (`buildFilterCss` w fazie 2 z testem, `is:inline set:html` w fazie 3)

### F4 — Bramka „każda strona ma wpis w galerii” jest obowiązkowa

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — szybka decyzja, poprawka oczywista i wąska
- **Dimension**: Plan Completeness
- **Location**: Faza 4 — Galeria trybu ciemnego
- **Detail**: `tests/e2e/dark-gallery.spec.ts:373-383` wymaga wpisu w `ENTRIES` dla każdej strony w `src/pages` — plan traktuje go jak dodatek. Dane galerii to 3 leki sprzed 2 dni i 1 wpis jednego objawu, więc stan „z wybranym objawem” pokaże jedną kreskę, nic o gęstości ani miesiącach.
- **Fix**: Kontrakt: wpis `{ page: "wizyta/os-czasu", … }` (stan startowy) plus stan z `prepare` wybierającym objaw (`selectOption`, wzorzec `interactions-collapsed`); jawnie zapisać, że galeria nie pokazuje gęstych danych.
- **Decision**: FIXED

### F5 — Filtry CSS niesprawdzone w Safari na iPhonie

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — szybka decyzja, poprawka oczywista i wąska
- **Dimension**: Blind Spots
- **Location**: Faza 3 Manual 3.6 (przed F2: 3.5), Faza 4 E2E
- **Detail**: Playwright ma tylko projekt `chromium` (`playwright.config.ts:25-32`). Cały mechanizm stoi na `:has()` + `option:checked` w `<select>`, a makieta była sprawdzona w jednej przeglądarce. Telefon to główny widok, a iPhone to WebKit.
- **Fix**: W bloku fazy 3 dopisać notkę, że 3.6 obejmuje Safari na iPhonie (tytuł kroku w Progress bez zmian).
- **Decision**: FIXED

### F6 — Miejsca odnośników opisane niezgodnie z kodem

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — szybka decyzja, poprawka oczywista i wąska
- **Dimension**: Plan Completeness
- **Location**: Faza 3 — Odnośniki
- **Detail**: `src/pages/wizyta.astro:62-64` ma samo `<h2>`, bez wiersza tytułu — trzeba go zbudować. `src/pages/dzienniczek/index.astro` nie ma nagłówka listy wpisów (h1 z „Dodaj” :160-165, sekcja pytań :174-194, pusty stan :205-211, `<ul>` :212), więc „przy nagłówku listy wpisów” wskazuje nieistniejące miejsce.
- **Fix**: Wizyta: owinąć h2 w wiersz flex z odnośnikiem. Dziennik: odnośnik nad `<ul>` z :212 (gałąź z wpisami), nie w pustym stanie.
- **Decision**: FIXED

### F7 — Okres z datą w przyszłości daje ujemny odcinek

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — szybka decyzja, poprawka oczywista i wąska
- **Dimension**: Blind Spots
- **Location**: Faza 2 — reguły `buildTimeline`
- **Detail**: Przyszłą datę blokuje tylko trasa (`src/pages/api/medications/index.ts:33-35`); RPC `add_medication_from_registry` i baza jej nie blokują. Reguła „okres trwający kończy się na `today + 1`” przy `startedOn > today` daje koniec < początek.
- **Fix**: Odcinek z końcem ≤ początkiem pomijany; przypadek testowy w `scripts/timeline/timeline.test.mjs`.
- **Decision**: FIXED

### F8 — Nie ustalono, gdzie stoi przełącznik zakresu i „Pokaż wszystkie”

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — szybka decyzja, poprawka oczywista i wąska
- **Dimension**: Blind Spots
- **Location**: Faza 3 — Strona
- **Detail**: Reset czyści wszystko w swoim formularzu — jeśli radio zakresu trafi do formularza leków, „Pokaż wszystkie” przestawi też zakres na 90 dni. Przycisk stoi przy komunikacie „Część leków jest ukryta.”, a pola leków w `<details>` — musi należeć do formularza (w środku albo przez `form="…"`).
- **Fix**: Kontrakt: radio zakresu i `<select>` poza formularzem leków; „Pokaż wszystkie” z atrybutem `form="<id formularza leków>"`; asercja E2E, że zakres zostaje po resecie.
- **Decision**: FIXED
