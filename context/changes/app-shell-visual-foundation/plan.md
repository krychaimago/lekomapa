# Wspólna warstwa wizualna i szkielet wnętrza — plan wdrożenia

## Overview

Fundament F-04 z `context/foundation/roadmap.md`, issue #35. Daje wspólne podłoże, na którym stają ekrany plasterków:

- **jedna lista nazwanych kolorów (tokenów)** w `src/styles/global.css`, każdy z wartością jasną i ciemną,
- polski dokument (`lang="pl"`) i reguły czytelności z makiety,
- stały pasek „wersja demonstracyjna” na każdym ekranie, także przed zalogowaniem,
- pusty szkielet wnętrza: pas boczny na dużym ekranie, zakładki u dołu na telefonie,
- bramka w `npm test`, która nie przepuszcza koloru wpisanego na sztywno.

Przykład, na którym oparto decyzję o tokenach: przycisk nie mówi „bądź `#2C4A33`”, tylko „bądź w kolorze `primary`”. `primary` ma w jednym pliku wartość jasną i ciemną. Zmiana palety to zmiana jednej linijki, a wszystkie przyciski idą za nią same.

Odblokowuje S-01 i S-10 (ekrany wejściowe w palecie), S-02 (pierwszy ekran wnętrza), S-05 i S-11.

## Current State Analysis

- **Tokeny to domyślne szarości shadcn** (`src/styles/global.css:6-73`), w `oklch`. Mechanizm dwóch trybów już jest: blok `:root`, blok `.dark` i wariant `@custom-variant dark (&:is(.dark *))` (`global.css:4`).
- **Kolory na sztywno ma 15 plików w `src/`** (pomiar `grep` na hex, `rgb(`, klasy palety Tailwinda):
  - starter do usunięcia: `Welcome.astro`, `Topbar.astro`, `ui/LibBadge.astro` (nigdzie nieimportowany),
  - do przepięcia na tokeny: `pages/dashboard.astro`, `components/Banner.astro` (hexy w `<style>`), `ui/button.tsx` (`text-white` w wariancie `destructive`),
  - ekrany wejściowe, które przebudowują S-01 i S-10: `pages/auth/{signin,signup,confirm-email}.astro`, `components/auth/{SubmitButton,PasswordToggle,FormField,ServerError,SignUpForm}.tsx`, oraz utility `bg-cosmic` (`global.css:113-115`).
- **Dokument po angielsku**: `Layout.astro:14` `lang="en"`, domyślny tytuł „10x Astro Starter” (`Layout.astro:10`).
- **Przycisk shadcn łamie reguły czytelności**: `h-9` (36 px) i `text-sm` (14 px) w `ui/button.tsx`.
- **Strona główna to kosmiczny ekran startera** (`pages/index.astro` → `Welcome.astro` → `Topbar.astro`), po angielsku.
- **`/dashboard`** jest jedyną trasą w `PROTECTED_ROUTES` (`middleware.ts:4`). Smoke sprawdza kody HTTP: `/` musi zwrócić 200 (`scripts/smoke.mjs:415`, krok „home renders”), `/dashboard` 302 lub 200 zależnie od sesji (`:416`, `:428`, `:430`). Logowanie i wylogowanie przekierowują na `/` (`:426`, `:429`; `api/auth/signin.ts:21`, `signout.ts:11`).
- **CI** uruchamia `npm test` = `node --test "scripts/**/*.test.mjs"` (`.github/workflows/ci.yml:21`, `package.json`). Nowy test w `scripts/` wchodzi do bramki bez zmiany CI.
- **Pomiar kontrastu palety Mech** (wzór WCAG 2):
  - tekst przygaszony `#5A6259`: 6,31 : 1 na bieli, 5,92 na płótnie, 3,81 na pasie bocznym — poniżej progu 7 : 1 z makiety,
  - `#4C534C`: 7,93 na bieli, 7,43 na płótnie,
  - pozostałe pary tekstu z makiety: 7,85–15,82 : 1,
  - przykładowa czerwień błędu `#7F2A22`: 9,31 na bieli, 8,72 na płótnie, 7,92 na tle `#FBE9E4`.

## Desired End State

- `src/styles/global.css` zawiera kompletną listę tokenów. Każdy ma wartość jasną w `:root` i ciemną w `.dark`, zapisaną w hex. Oba bloki mają identyczny zestaw nazw.
- Test kontrastu dowodzi, że każda para tekst–tło z listy par ma co najmniej 7 : 1 w obu trybach.
- Test kolorów dowodzi, że w `src/` nie ma koloru wpisanego na sztywno poza plikami z listy wyjątków. Każdy wyjątek ma wskazany plasterek, który go usuwa.
- Każda strona ma `lang="pl"` i pasek „wersja demonstracyjna” u góry.
- Zalogowana osoba wchodząca na `/` trafia do szkieletu wnętrza, niezalogowana do logowania.
- `/dashboard` pokazuje szkielet: pas boczny z nazwą produktu i wylogowaniem na dużym ekranie, nagłówek z wylogowaniem na telefonie, pustą kartę treści. Menu jest puste; zakładki na telefonie pojawią się przy pierwszej pozycji.
- Tryb ciemny da się obejrzeć, dopisując klasę `dark` do `<html>` w narzędziach przeglądarki. Przełącznika dla użytkowniczki nie ma (S-11).
- `CLAUDE.md`, `design-draft.md` i roadmapa opisują nowe reguły.

Weryfikacja: `npm test`, `npm run lint`, `npm run typecheck`, `npm run build`, zrzuty ekranu szkieletu w obu trybach na szerokości telefonu i dużego ekranu.

### Key Discoveries:

- Mechanizm `.dark` + `@custom-variant dark` już istnieje (`global.css:4`, `:41`) — tryb ciemny to podmiana wartości, nie nowa architektura. Strategia klasy zostawia S-11 wolny wybór między przełącznikiem ręcznym a ustawieniem systemu.
- Komponenty shadcn czytają nazwy `primary`, `accent`, `muted`, `destructive`, `sidebar-*` (`ui/button.tsx:8-22`). Zachowanie tych nazw sprawia, że każdy dodany później komponent shadcn od razu jest w palecie.
- `bg-cosmic` z hexami siedzi w pliku tokenów (`global.css:113-115`), a używają go wyłącznie ekrany wejściowe.
- `Banner` ma trzy warianty, ale używany jest tylko `error` (`Layout.astro:23`).

## What We're NOT Doing

- **Ekranów domenowych** — leki, dzienniczek i wizyta powstają w swoich plasterkach, one też dopinają pozycje menu.
- **Przebudowy ekranów wejściowych** (logowanie, rejestracja, potwierdzenie adresu, Rozkładówka) — S-01 i S-10. Ich kolory na sztywno zostają na liście wyjątków.
- **Przełącznika trybu ciemnego** i decyzji „ręcznie czy za systemem” — S-11.
- **Noty o prywatności na pasie bocznym i odnośnika na pasku demonstracyjnym** — treść nieustalona; dopina S-01 razem ze stroną prywatności.
- **Wyboru kroju pisma** — zostaje systemowy.
- **Formalnej zgodności ze standardem dostępności** — PRD `## Non-Goals`. Plan mierzy kontrast, nie certyfikuje.
- **Zmiany adresu `/dashboard`** — middleware i smoke zostają bez zmian.
- **Tokenów wykresów (`chart-*`)** — nic ich nie używa; usuwane. Komponent shadcn, który ich potrzebuje, doda je z powrotem.

## Implementation Approach

Kolejność idzie od kontraktu do pikseli. Najpierw lista tokenów z pomiarem, bo wszystko dalej z niej korzysta. Potem wspólny dokument (dotyczy każdej strony), potem szkielet wnętrza. Bramka na kolory na końcu, gdy starter jest już posprzątany, a lista wyjątków zawiera wyłącznie pliki S-01 i S-10.

Ciemna paleta powstaje przed zapisaniem wartości: najpierw strona z makietą do akceptacji autorki (jak przy jasnej wersji — https://claude.ai/artifact/FLPkn5HvqMUHPjr5zg6apn), dopiero potem kod.

## Critical Implementation Details

- **Wartości tokenów w hex, nie w `oklch`.** Test kontrastu czyta je z `global.css` prostym parserem. Wartość w innym formacie ma wywrócić test, a nie zostać pominięta — inaczej para bez pomiaru wygląda jak zmierzona (lekcja „Bramka musi odróżnić blokadę od niewykonania”).
- **Tekst przygaszony nie ma pary z pasem bocznym.** Na chromie 7 : 1 wymaga koloru praktycznie równego tekstowi głównemu, więc na pasie bocznym stoi wyłącznie `sidebar-foreground`. Komentarz przy tokenie i reguła w `CLAUDE.md` to mówią, bo test tego nie wyłapie.
- **Token błędu nie służy treściom o zdrowiu.** Możliwa interakcja ma własny token bursztynowy. Czerwień wyłącznie dla błędów formularzy i techniki.

## Faza 1: Tokeny i pomiar kontrastu

### Overview

Makieta ciemnej palety do akceptacji, potem kompletna lista tokenów w obu trybach i test, który mierzy kontrast każdej pary.

### Changes Required:

#### 1. Makieta ciemnej palety

**File**: artefakt (poza repozytorium), podlinkowany w `design-draft.md` w fazie 4

**Intent**: Autorka akceptuje ciemne wartości, zanim trafią do kodu. Na stronie szkielet wnętrza w obu trybach obok siebie, bursztyn możliwej interakcji i czerwień błędu obok siebie, kontrast każdej pary.

**Contract**: Ciemny bursztyn nie wygląda jak alarm ani jak czerwień (PRD `## Non-Functional Requirements`). Czerwień błędu i bursztyn są od siebie wyraźnie różne w obu trybach. Każda para tekstu ≥ 7 : 1. Bez akceptacji wartości ciemne nie trafiają do `global.css`.

#### 2. Lista tokenów

**File**: `src/styles/global.css`

**Intent**: Podmienić szarości shadcn na paletę Mech i dopisać role, których shadcn nie ma. Jedno miejsce dla wszystkich kolorów produktu w obu trybach.

**Contract**:

- Nazwy shadcn zostają, z wartościami Mech (jasne): `background` = płótno `#F7F8F4`, `card`/`popover` = `#FFFFFF`, `foreground` = `#1E241F`, `muted-foreground` = `#4C534C`, `primary` = akcent `#2C4A33`, `primary-foreground` = `#FFFFFF`, `accent` = akcent jasny `#DCE9DF`, `border` = `#E3E5DC`, `input` = ramka pola `#CBD2C7`, `ring` = akcent, `sidebar` = chrom `#CFC9B4`, `sidebar-border` = `#B3AC93`, pozostałe `sidebar-*` i `secondary`/`muted` wyprowadzone z tych samych wartości.
- Nowe role: `accent-border` (`#B9D0C0`), `interaction` / `interaction-foreground` / `interaction-border` (bursztyn `#FBEBC8` / `#5A3F08` / `#E6CE96`), `demo-bar` / `demo-bar-foreground` / `demo-bar-border` (akcent jasny, tekst, kreska akcentu jasnego), `destructive` / `destructive-foreground` / `destructive-surface` / `destructive-border` (czerwień ceglasta, np. `#7F2A22` na `#FBE9E4` — ostateczny odcień z makiety).
- Każdy nowy token zarejestrowany w `@theme inline` jako `--color-<nazwa>`, żeby działały klasy `bg-interaction`, `text-demo-bar-foreground` itd.
- `chart-*` usunięte. `bg-cosmic` przeniesione do `src/styles/starter-auth.css`, importowanego z `global.css` — plik tokenów zostaje wolny od kolorów poza deklaracjami tokenów.
- Wszystkie wartości w hex. `:root` i `.dark` mają identyczny zestaw nazw kolorów.

#### 3. Test kontrastu

**File**: `scripts/tokens/contrast.test.mjs` (nowy), pomocniczo `scripts/tokens/contrast.mjs`

**Intent**: Dowód, że paleta trzyma próg czytelności w obu trybach i że żaden tryb nie ma luki w nazwach.

**Contract**:

- Parser wyciąga z `global.css` deklaracje `--<nazwa>: <wartość>` osobno z `:root` i `.dark`.
- Asercje: oba bloki mają ten sam zestaw nazw; każda wartość koloru to hex (inna wartość = porażka z nazwą tokenu); każda para z listy ma ≥ 7 : 1 w każdym trybie.
- Pary (tekst / tło) liczone mechanicznie: każdy token `X-foreground` z tokenem `X` (np. `primary-foreground`/`primary`, `sidebar-accent-foreground`/`sidebar-accent`, `interaction-foreground`/`interaction`, `demo-bar-foreground`/`demo-bar`, `destructive-foreground`/`destructive`). Nowy token `*-foreground` dostaje test bez dopisywania.
- Plus jawna lista par, których nazwa nie zdradza: `foreground`/`background`, `foreground`/`card`, `muted-foreground`/`background`, `muted-foreground`/`card`, `muted-foreground`/`muted`, `primary`/`background`, `primary`/`card` (odnośniki, podpisy), `primary`/`accent` (liczniki), `destructive`/`background`, `destructive`/`card`, `destructive`/`destructive-surface`.
- Token `X-foreground` bez tokenu `X` = porażka z nazwą (literówka nie może wyłączyć pary).
- Test ma przypadek kontrolny: para o znanym kontraście (`#5A6259` na `#FFFFFF` = 6,31) musi zostać odrzucona — dowód, że funkcja liczy, a nie przepuszcza wszystko.

### Success Criteria:

#### Automated Verification:

- Test kontrastu przechodzi w obu trybach: `npm test`
- Przypadek kontrolny `#5A6259` na bieli odrzucony w teście: `npm test`
- Lint przechodzi: `npm run lint`
- Typy przechodzą: `npm run typecheck`
- Build przechodzi: `npm run build`

#### Manual Verification:

- Autorka zaakceptowała makietę ciemnej palety przed zapisaniem wartości ciemnych
- Tymczasowa zamiana wartości `muted-foreground` na `#5A6259` wywraca `npm test` z nazwą pary w komunikacie (zmiana cofnięta)

**Implementation Note**: Po automatycznej weryfikacji zatrzymaj się na potwierdzenie autorki, zanim ruszysz fazę 2.

---

## Faza 2: Wspólny dokument

### Overview

Rzeczy, które dotyczą każdej strony: język, pasek demonstracyjny, rozmiary tekstu i przycisków, komponenty współdzielone na tokenach.

### Changes Required:

#### 1. Layout dokumentu

**File**: `src/layouts/Layout.astro`

**Intent**: Polski dokument z paskiem demonstracyjnym na każdej stronie, przed zalogowaniem i po.

**Contract**: `<html lang="pl">`, domyślny tytuł „lekomapa”. Pasek renderowany w `Layout`, nad slotem i nad `Banner` braku konfiguracji. Każda strona, także ekrany wejściowe, dostaje go bez zmian we własnym pliku.

#### 2. Pasek demonstracyjny

**File**: `src/components/DemoBar.astro` (nowy)

**Intent**: Stały komunikat, że to prototyp i nie należy wpisywać prawdziwych danych o zdrowiu.

**Contract**: Treść robocza: „**Wersja demonstracyjna.** Nie wpisuj prawdziwych danych o zdrowiu.” Kolory wyłącznie z tokenów `demo-bar*`. Przyklejony do góry okna (`sticky`), z `role="note"`. Bez odnośnika — dopina go S-01.

#### 3. Reguły czytelności

**File**: `src/styles/global.css`, `src/components/ui/button.tsx`

**Intent**: Reguły z makiety działają od pierwszego ekranu, bez pilnowania ich w każdym plasterku.

**Contract**:

- Żadna klasa rozmiaru tekstu Tailwinda nie renderuje poniżej 15 px na telefonie i 17 px od punktu `lg` — nadpisanie skali `--text-*` w `@theme` (albo rozmiaru bazowego), do wyboru implementującego.
- Warianty rozmiaru przycisku mają co najmniej 48 px wysokości; `icon` co najmniej 48 × 48 px.
- `text-white` w wariancie `destructive` zamienione na `text-destructive-foreground`.
- Kolorowe klasy z wariantem `dark:` usunięte (`dark:bg-destructive/60`, `dark:bg-input/30`, `dark:hover:bg-input/50`, `dark:hover:bg-accent/50`, `dark:border-input`, `dark:focus-visible:ring-destructive/40`, `dark:aria-invalid:ring-destructive/40` — `button.tsx:8-18`). Tokeny same zmieniają wartość z trybem; klasa `dark:` z kolorem zmieniałaby efektywny kolor poza zasięgiem testu kontrastu.
- Widoczny obrys fokusu w kolorze `ring` na elementach interaktywnych.

#### 4. Banner braku konfiguracji

**File**: `src/components/Banner.astro`

**Intent**: Jedyny komunikat błędu, który istnieje dziś, przechodzi na tokeny błędu.

**Contract**: Zostaje wyłącznie wariant `error` (jedyny używany); kolory z `destructive-surface`, `destructive`, `destructive-border`. Błąd rozpoznawalny także bez koloru — słowo „Uwaga:” zostaje w treści (`Layout.astro:22`). Bez hexów w `<style>`.

### Success Criteria:

#### Automated Verification:

- Wszystkie testy przechodzą: `npm test`
- Lint przechodzi: `npm run lint`
- Typy przechodzą: `npm run typecheck`
- Build przechodzi: `npm run build`
- Zbudowana strona logowania ma `lang="pl"` i tekst paska: `npm run build && npm run preview`, potem `curl -s http://localhost:4321/auth/signin` zawiera `lang="pl"` i `Wersja demonstracyjna`

#### Manual Verification:

- Pasek widoczny na stronie logowania, rejestracji i potwierdzenia adresu na telefonie i dużym ekranie
- Najmniejszy tekst na stronie logowania ma co najmniej 15 px na telefonie i 17 px na dużym ekranie (narzędzia przeglądarki)

**Implementation Note**: Przed `npm run preview` zatrzymaj stary podgląd (`npx astro preview stop`) — lekcja „Zatrzymaj stary podgląd”. Po weryfikacji zatrzymaj się na potwierdzenie autorki.

---

## Faza 3: Szkielet wnętrza

### Overview

Pusty szkielet, do którego plasterki dopinają ekrany i pozycje menu. Sprzątanie ekranów startera.

### Changes Required:

#### 1. Lista pozycji menu

**File**: `src/lib/navigation.ts` (nowy)

**Intent**: Jedno miejsce, w którym plasterek dopisuje swój ekran do menu.

**Contract**: Eksport `NAV_ITEMS: readonly NavItem[]`, gdzie `NavItem = { href: string; label: string }`. W F-04 lista jest pusta. Pozycja pasuje, gdy ścieżka równa się `href` albo zaczyna się od `href` + `/` (`/leki` pasuje do `/leki/nowe`, nie do `/leki-archiwum`). Przy kilku trafieniach aktywna jest ta z najdłuższym `href` — zawsze najwyżej jedna.

#### 2. Layout wnętrza

**File**: `src/layouts/AppLayout.astro` (nowy)

**Intent**: Wspólna rama ekranów po zalogowaniu, według makiety.

**Contract**:

- Opakowuje `Layout.astro` (dziedziczy pasek i `lang`). Przyjmuje `title` i slot na treść.
- Duży ekran (`lg`): pas boczny ok. 22 % szerokości w `sidebar`, z nazwą produktu u góry, menu z `NAV_ITEMS` i przyciskiem „Wyloguj się” na dole; treść na `background`.
- Telefon: nagłówek z nazwą produktu i przyciskiem „Wyloguj się”; zakładki u dołu z `NAV_ITEMS` renderowane wyłącznie, gdy lista nie jest pusta.
- Aktywna pozycja: tło `sidebar-accent`, pogrubienie i ciemna kreska (`primary`) — rozpoznawalna bez rozróżniania barw. `aria-current="page"`.
- Wylogowanie to formularz `POST /api/auth/signout`, jak dziś w `dashboard.astro:17`.
- Na pasie bocznym wyłącznie `sidebar-foreground` — bez tekstu przygaszonego.
- Wyłącznie klasy tokenów; żadnego React (brak stanu i zdarzeń).

#### 3. Ekran startowy wnętrza

**File**: `src/pages/dashboard.astro`

**Intent**: `/dashboard` staje się pustym szkieletem zamiast kosmicznej karty startera.

**Contract**: Używa `AppLayout`, tytuł „lekomapa”. Treść: nagłówek i biała karta z roboczym zdaniem „Tu pojawią się ekrany aplikacji.” Adres i ochrona w middleware bez zmian.

#### 4. Strona główna

**File**: `src/pages/index.astro`

**Intent**: Publiczny adres nie pokazuje już ekranu startera.

**Contract**: Przekierowanie 302: zalogowana osoba (`Astro.locals.user`) → `/dashboard`, pozostali → `/auth/signin`.

#### 5. Ochrona tras z menu

**File**: `src/middleware.ts`

**Intent**: Plasterek, który dopisze ekran do menu, nie może zapomnieć o ochronie — szkielet wnętrza nie pokazuje się niezalogowanej osobie.

**Contract**: Chronione ścieżki = `/dashboard` + każde `href` z `NAV_ITEMS`, dopasowane tak samo jak aktywna pozycja menu (równość albo `href` + `/`). Trasa wnętrza spoza menu nadal wymaga ręcznego wpisu — reguła w `CLAUDE.md` (faza 4).

#### 6. Smoke dla strony głównej

**File**: `scripts/smoke.mjs`

**Intent**: Krok „home renders” (`:415`) oczekuje 200 i wywróciłby CI po przekierowaniu `/`.

**Contract**: Krok zamieniony na „home redirects anonymous user”: 302 z `location` `/auth/signin`. Kroki `:426` i `:429` (przekierowanie na `/` po logowaniu i wylogowaniu) bez zmian.

#### 7. Usunięcie plików startera

**File**: `src/components/Welcome.astro`, `src/components/Topbar.astro`, `src/components/ui/LibBadge.astro`

**Intent**: Nic ich nie będzie importować; zostawione zostałyby jako kolory na sztywno na liście wyjątków.

**Contract**: Pliki usunięte; `grep` nie znajduje ich importów.

### Success Criteria:

#### Automated Verification:

- Wszystkie testy przechodzą: `npm test`
- Lint przechodzi: `npm run lint`
- Typy przechodzą: `npm run typecheck`
- Build przechodzi: `npm run build`
- Smoke przechodzi przeciw lokalnemu Supabase: `npm run smoke`
- Niezalogowane żądanie `/` zwraca 302 na `/auth/signin`: `curl -s -o /dev/null -w "%{http_code} %{redirect_url}" http://localhost:4321/`

#### Manual Verification:

- Po zalogowaniu `/` prowadzi do szkieletu wnętrza
- Duży ekran: pas boczny z nazwą produktu i „Wyloguj się”, pusta karta treści; wylogowanie działa
- Telefon (ok. 390 px): nagłówek z „Wyloguj się”, brak paska zakładek, bez poziomego przewijania
- Tymczasowa pozycja w `NAV_ITEMS` pokazuje zakładki na telefonie i aktywną pozycję z pogrubieniem i kreską (zmiana cofnięta przed commitem)
- Szkielet w trybie ciemnym (klasa `dark` na `<html>` w narzędziach przeglądarki) czytelny, pasek i karty w ciemnych wartościach
- Tymczasowa pozycja w `NAV_ITEMS` z własną stroną: żądanie bez sesji przekierowuje na `/auth/signin` (zmiana cofnięta)

**Implementation Note**: Przed smoke i przed pierwszym ręcznym krokiem z logowaniem (3.7–3.10, 3.12) sprawdź, do której bazy idzie aplikacja — wszystkie idą do lokalnego Supabase (lekcja „Lokalne bramki sprawdź pod kątem tego, do której bazy faktycznie idą”). Ten worktree nie ma `.env`, ale główna kopia repozytorium ma `.env` wskazujący produkcję. Zatrzymaj stary podgląd. Po weryfikacji zatrzymaj się na potwierdzenie autorki.

---

## Faza 4: Bramka i dokumenty

### Overview

Automatyczna ochrona reguły „tylko tokeny” i zapis decyzji tam, gdzie przeczyta je następny agent.

### Changes Required:

#### 1. Skaner kolorów

**File**: `scripts/tokens/hardcoded-colors.mjs` (nowy), `scripts/tokens/hardcoded-colors.test.mjs` (nowy)

**Intent**: CI odrzuca kolor wpisany na sztywno w każdym nowym pliku w `src/`.

**Contract**:

- Skanuje `src/**/*.{astro,ts,tsx,js,jsx,css}`.
- Wykrywa: hex (`#` + 3, 4, 6 lub 8 znaków szesnastkowych, bez encji HTML `&#…`), funkcje `rgb(`/`rgba(`/`hsl(`/`hsla(`/`oklch(`, klasy palety Tailwinda (`bg-`, `text-`, `border-`, `ring-`, `outline-`, `from-`, `via-`, `to-`, `fill-`, `stroke-`, `shadow-`, `divide-`, `placeholder-`, `caret-`, `decoration-` + nazwa palety Tailwinda lub `white`/`black`, z opcjonalnym `/<krycie>`), klasy koloru z wariantem `dark:` — także na tokenach (`dark:bg-input/30`), bo tryb ciemny należy wyłącznie do tokenów.
- W `src/styles/global.css` kolor dozwolony wyłącznie jako wartość deklaracji `--<nazwa>:` w blokach tokenów.
- Lista wyjątków w module: ścieżka, powód i plasterek, który ją usuwa (S-01 lub S-10). Na starcie: 8 plików ekranów wejściowych i `src/styles/starter-auth.css`.
- Test na prawdziwym `src/`: zero naruszeń poza wyjątkami; liczba przeskanowanych plików większa od zera i nie mniejsza niż liczba plików `.astro`/`.tsx` w `src/` — dowód, że skan się wykonał.
- Test nieaktualnych wyjątków: każdy plik z listy istnieje i nadal ma naruszenie. Plasterek, który posprząta plik, musi go zdjąć z listy.
- Przypadki jednostkowe: każdy wzorzec wykryty w próbce tekstu; `bg-primary`, `text-muted-foreground`, `href="#main"` i `&#123;` nie są naruszeniem; `dark:bg-primary` i `dark:hover:bg-accent/50` są naruszeniem, `dark:hidden` nie jest.

#### 2. Reguły dla agentów

**File**: `CLAUDE.md`, sekcja `### Konwencje kodu`

**Intent**: Agent zna regułę, zanim napisze kod; CI łapie, gdy zapomni.

**Contract**: Nowy punkt „Kolory”: wyłącznie tokeny z `src/styles/global.css` (klasy typu `bg-primary`, `text-muted-foreground`); nowy kolor = nowy token w obu blokach, z parą w teście kontrastu, jeśli to tekst; na pasie bocznym tylko `sidebar-foreground`; `destructive*` wyłącznie dla błędów formularzy i techniki, nigdy dla treści o lekach i objawach — możliwa interakcja ma `interaction*`; ekrany wnętrza przez `AppLayout`, pozycja menu przez `NAV_ITEMS` — trasa z menu jest chroniona automatycznie, trasa wnętrza spoza menu wymaga wpisu w `PROTECTED_ROUTES`; nowy komponent shadcn oczyszczony z kolorowych klas `dark:`. Dopisek o nieistniejących katalogach aktualizowany, jeśli zmienia się stan.

#### 3. Zapis decyzji w makiecie

**File**: `context/changes/auth-login-design/design-draft.md`

**Intent**: Decyzje z tego planu nie mogą zostać cofnięte jako pomyłka.

**Contract**: W `## Paleta: Mech` — tekst przygaszony `#4C534C` z pomiarem i powodem; nowa sekcja paleta ciemna z wartościami i linkiem do makiety z fazy 1; w `## Kolory funkcjonalne` wiersz czerwieni zmieniony: czerwień dla błędów formularzy i techniki, nigdy dla możliwej interakcji ani treści o zdrowiu, z datą decyzji 2026-09-26; tabela mapująca role z makiety na nazwy tokenów; link do strony porównania jasnej wersji.

#### 4. Roadmapa

**File**: `context/foundation/roadmap.md`

**Intent**: Roadmapa mówi prawdę o podziale pracy między F-04 i S-11.

**Contract**: F-04 `Outcome` i `Wymogi projektowe` — ciemne wartości tokenów i czerwień błędu wchodzą tu. S-11 — pytanie „Jak wygląda ciemna paleta?” rozstrzygnięte w F-04; zostaje przełącznik, decyzja „ręcznie czy za systemem” i przegląd ekranów. S-01 i S-10 — w `Risk` dopisek, że plasterek zdejmuje swoje pliki z listy wyjątków skanera kolorów. Pola `Status` bez zmian (należą do `/10x-implement` i `/10x-archive`).

### Success Criteria:

#### Automated Verification:

- Wszystkie testy przechodzą, w tym skaner kolorów: `npm test`
- Lint przechodzi: `npm run lint`
- Typy przechodzą: `npm run typecheck`
- Build przechodzi: `npm run build`

#### Manual Verification:

- Tymczasowe `bg-purple-600` w `AppLayout.astro` wywraca `npm test` z nazwą pliku i klasy (zmiana cofnięta)
- Tymczasowe usunięcie jednego pliku z listy wyjątków wywraca `npm test`, a dopisanie wyjątku dla czystego pliku też go wywraca (zmiany cofnięte)
- Autorka przeczytała nowe reguły w `CLAUDE.md` i zapis w `design-draft.md`

**Implementation Note**: Po weryfikacji zatrzymaj się na potwierdzenie autorki przed merge'em.

---

## Testing Strategy

### Unit Tests:

- Kontrast: funkcja liczy wzorem WCAG 2; przypadek kontrolny 6,31 : 1 odrzucony; brak wartości hex = porażka z nazwą tokenu; niezgodne zestawy nazw w `:root` i `.dark` = porażka.
- Skaner: każdy wzorzec wykryty; tokeny, kotwice `#main` i encje HTML nie są naruszeniem; deklaracje `--x: #…` w `global.css` dozwolone, hex poza nimi nie.

### Integration Tests:

- Skaner na prawdziwym `src/` z dowodem wykonania (liczba plików) i kontrolą nieaktualnych wyjątków.
- `npm run smoke` — ścieżka auth i przekierowania `/dashboard` bez zmian.

### Manual Testing Steps:

1. Otwórz `/` bez sesji — ląduje na logowaniu z paskiem demonstracyjnym u góry.
2. Zaloguj się — ląduje w szkielecie wnętrza; sprawdź pas boczny na dużym ekranie i nagłówek na telefonie.
3. Wyloguj się z pasa bocznego i z nagłówka na telefonie.
4. Dopisz klasę `dark` do `<html>` — szkielet, pasek i karta w ciemnych wartościach, tekst czytelny.
5. Dopisz tymczasową pozycję do `NAV_ITEMS` — zakładki na telefonie, aktywna pozycja z pogrubieniem i kreską. Cofnij.

## Performance Considerations

Brak istotnych. `AppLayout` to czysty `.astro` bez JavaScriptu w przeglądarce; tokeny to zmienne CSS.

## Migration Notes

Brak zmian w bazie. Po merge'u produkcja pokazuje przekierowanie zamiast strony startera i pasek demonstracyjny na ekranach wejściowych. Ekrany wejściowe zachowują kosmiczne tło do S-01 i S-10.

## References

- Roadmapa: `context/foundation/roadmap.md` (F-04, S-01, S-10, S-11)
- Frame: `context/changes/mvp-scope-ui-and-data-processing/frame.md`
- Makieta: `context/changes/auth-login-design/design-draft.md` (paleta, reguły czytelności, kolory funkcjonalne, układ wnętrza)
- Porównanie jasnej wersji przed i po: https://claude.ai/artifact/FLPkn5HvqMUHPjr5zg6apn
- PRD: `context/foundation/prd.md` `## Non-Functional Requirements`, `## Non-Goals`
- Lekcje: `context/foundation/lessons.md` („Bramka musi odróżnić blokadę od niewykonania”, „Zatrzymaj stary podgląd”, „Lokalne bramki sprawdź pod kątem tego, do której bazy faktycznie idą”)
- Kod: `src/styles/global.css:4-115`, `src/layouts/Layout.astro:10-31`, `src/components/ui/button.tsx:8-28`, `src/middleware.ts:4`, `scripts/smoke.mjs:415-430`, `.github/workflows/ci.yml:21`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Tokeny i pomiar kontrastu

#### Automated

- [x] 1.1 Test kontrastu przechodzi w obu trybach — e6af4e8
- [x] 1.2 Przypadek kontrolny #5A6259 na bieli odrzucony w teście — e6af4e8
- [x] 1.3 Lint przechodzi — e6af4e8
- [x] 1.4 Typy przechodzą — e6af4e8
- [x] 1.5 Build przechodzi — e6af4e8

#### Manual

- [x] 1.6 Autorka zaakceptowała makietę ciemnej palety przed zapisaniem wartości ciemnych — e6af4e8
- [x] 1.7 Tymczasowa zamiana muted-foreground na #5A6259 wywraca npm test z nazwą pary — e6af4e8

### Phase 2: Wspólny dokument

#### Automated

- [x] 2.1 Wszystkie testy przechodzą — 5c65404
- [x] 2.2 Lint przechodzi — 5c65404
- [x] 2.3 Typy przechodzą — 5c65404
- [x] 2.4 Build przechodzi — 5c65404
- [x] 2.5 Zbudowana strona logowania ma lang="pl" i tekst paska — 5c65404

#### Manual

- [x] 2.6 Pasek widoczny na ekranach wejściowych na telefonie i dużym ekranie — 5c65404
- [x] 2.7 Najmniejszy tekst co najmniej 15 px na telefonie i 17 px na dużym ekranie — 5c65404

### Phase 3: Szkielet wnętrza

#### Automated

- [x] 3.1 Wszystkie testy przechodzą — aad73e8
- [x] 3.2 Lint przechodzi — aad73e8
- [x] 3.3 Typy przechodzą — aad73e8
- [x] 3.4 Build przechodzi — aad73e8
- [x] 3.5 Smoke przechodzi przeciw lokalnemu Supabase — aad73e8
- [x] 3.6 Niezalogowane żądanie / zwraca 302 na /auth/signin — aad73e8

#### Manual

- [x] 3.7 Po zalogowaniu / prowadzi do szkieletu wnętrza — aad73e8
- [x] 3.8 Duży ekran: pas boczny, pusta karta, wylogowanie działa — aad73e8
- [x] 3.9 Telefon: nagłówek z wylogowaniem, brak zakładek, bez poziomego przewijania — aad73e8
- [x] 3.10 Tymczasowa pozycja menu pokazuje zakładki i aktywną pozycję — aad73e8
- [x] 3.11 Szkielet w trybie ciemnym czytelny — aad73e8
- [x] 3.12 Trasa z NAV_ITEMS przekierowuje niezalogowaną osobę — aad73e8

### Phase 4: Bramka i dokumenty

#### Automated

- [x] 4.1 Wszystkie testy przechodzą, w tym skaner kolorów — c4baa89
- [x] 4.2 Lint przechodzi — c4baa89
- [x] 4.3 Typy przechodzą — c4baa89
- [x] 4.4 Build przechodzi — c4baa89

#### Manual

- [x] 4.5 Tymczasowe bg-purple-600 w AppLayout wywraca npm test — c4baa89
- [x] 4.6 Usunięcie wyjątku i dopisanie wyjątku dla czystego pliku wywracają npm test — c4baa89
- [x] 4.7 Autorka przeczytała reguły w CLAUDE.md i zapis w design-draft.md — c4baa89
