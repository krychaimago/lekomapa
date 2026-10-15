# Ikona lekomapy — plan wdrożenia

## Overview

S-04 z roadmapy (issue #107, MS-09): lekomapa dostaje własny znak. Widać go w karcie przeglądarki, obok nazwy „lekomapa” na pasku bocznym, w nagłówku na telefonie i na ekranach logowania, a także na ekranie telefonu po dodaniu skrótu. Znak wybiera autorka spośród 2–3 propozycji agenta.

## Current State Analysis

- Karta przeglądarki: `public/favicon.png` (32×32) ze startera, podpięty w `src/layouts/Layout.astro:32`.
- Nazwa „lekomapa” jest samym tekstem w trzech miejscach: pasek boczny (`src/layouts/AppLayout.astro:27`), nagłówek wnętrza na telefonie (`src/layouts/AppLayout.astro:60`), lewa strona ekranów wejściowych (`src/layouts/AuthSpreadLayout.astro:20`, tekst z `AUTH_COPY.spread.productName` w `src/lib/copy/auth.ts:10`).
- Ekran telefonu: brak `apple-touch-icon` i brak pliku `manifest`. Telefon robi skrót ze zrzutu strony albo z litery.
- `public/` trafia do `dist/`, a Cloudflare podaje te pliki przez binding `ASSETS` (`wrangler.jsonc:7-11`) bez udziału Workera. Middleware ich nie widzi, więc ani logowanie, ani kontrola warunków ich nie blokuje.
- Bramka `scripts/tokens/hardcoded-colors.mjs` sprawdza wyłącznie pliki `.astro/.ts/.tsx/.js/.jsx/.css` w `src/` (`SCANNED_EXTENSIONS`, linia 11). Stałe kolory w `public/*.svg` jej nie dotyczą. Kod w `src/` nie może mieć ani jednego koloru wpisanego na sztywno.
- Tokeny marki: `--primary` jasny `#2c4a33`, `--primary-foreground` jasny `#ffffff`, w trybie ciemnym `#b4d6bc` / `#13201a` (`src/styles/global.css:20-21,66-67`). Odczyt tokenów: `loadTokenBlocks()` w `scripts/tokens/contrast.mjs:191`.
- `sharp` jest w `node_modules` jako zależność Astro (nie bezpośrednia). Wystarcza do jednorazowego skryptu generującego PNG.
- Strona nie ma nagłówka CSP, więc `manifest` i ikony nie wymagają zmian w nagłówkach.

## Desired End State

- Karta przeglądarki pokazuje wybrany znak: jasny znak na ciemnozielonym kwadracie marki, taki sam przy jasnym i ciemnym motywie przeglądarki.
- Pasek boczny, nagłówek na telefonie i 6 ekranów wejściowych pokazują znak obok nazwy „lekomapa”. Znak bierze kolory z tokenów, więc zmienia się z trybem jasnym i ciemnym.
- „Dodaj do ekranu początkowego” na iPhonie i Androidzie daje ikonę lekomapy z nazwą „lekomapa”. Stuknięcie otwiera zwykłą kartę przeglądarki na `/`.
- Kształt znaku jest zapisany w jednym miejscu. Test pada, gdy pliki w `public/` rozjadą się z tym kształtem albo z tokenami.

### Key Discoveries:

- Wspólne źródło nazwy na ekranach wejściowych: `src/lib/copy/auth.ts:10`. Wnętrze ma nazwę wpisaną w `AppLayout.astro`, więc komponent przyjmuje wielkość tekstu z miejsca użycia.
- Pas boczny: tekst wyłącznie `sidebar-foreground` (`CLAUDE.md`, Kolory). Znak to grafika, nie tekst, więc na kwadracie `bg-primary` z `text-primary-foreground` mieści się w istniejącej parze tokenów.
- Testy: `node --test` na `scripts/**/*.test.mjs` z `--experimental-strip-types` (`package.json:15`), więc test i skrypt mogą importować plik `.ts` z `src/lib/`.

## What We're NOT Doing

- Tryb „jak osobna aplikacja” (`display: standalone`): osobne logowanie na iPhonie, odnośniki z maili poza aplikacją, brak przycisku wstecz. Decyzja autorki: skrót otwiera kartę przeglądarki.
- Ikona w karcie, która zmienia się z trybem jasnym i ciemnym. Decyzja: jedna stała wersja.
- `theme-color` (kolor paska przeglądarki) — nie było w zakresie.
- Projekt zewnętrzny znaku.
- Usuwanie `public/template.png` ze startera — osobna rzecz.
- Praca offline, service worker, powiadomienia.

## Implementation Approach

Najpierw wybór znaku, potem pliki. Geometria znaku żyje w jednym module bez kolorów: `src/lib/brand-mark.ts`. Z niej:

- skrypt w `scripts/icons/` buduje `public/favicon.svg` i pliki PNG ze stałymi kolorami odczytanymi z jasnych tokenów,
- komponent `.astro` rysuje ten sam kształt klasami tokenów.

Test porównuje pliki w `public/` z tym, co skrypt wygenerowałby teraz. Dzięki temu zmiana kształtu albo tokenu bez ponownego generowania wywraca `npm test`.

## Critical Implementation Details

- **Znak w rozmiarze 16 px**: propozycje muszą być czytelne w karcie przeglądarki. Bez cienkich linii i bez detali poniżej ok. 1/8 szerokości. Strona porównawcza pokazuje rozmiar 16 px obok większych.
- **FR-012 w znaku**: bez wykrzyknika, trójkąta, czerwieni i bursztynu (`interaction*` to kolor możliwej interakcji). Bez krzyża apteki, który sugeruje poradę medyczną. Znak ma być neutralny.
- **iPhone nie przycina rogów sam** dla `apple-touch-icon`. Plik 180×180 ma pełne kwadratowe tło bez przezroczystości, a znak mieści się w środkowych ~80%. To samo dotyczy `icon-512.png` z `purpose: "maskable"` na Androidzie (bezpieczna strefa: środkowe 80%).

## Faza 1: Propozycje znaku

### Overview

Agent rysuje 2–3 proste znaki i pokazuje je na jednej stronie porównawczej. Autorka wybiera, a wybór trafia do `change.md`. Bez zmian w `src/` i `public/`.

### Changes Required:

#### 1. Strona porównawcza

**File**: `context/changes/app-icon/proposals.html`

**Intent**: Pokazać każdą propozycję we wszystkich miejscach, w których znak się pojawi, żeby wybór nie opierał się na jednym dużym obrazku.

**Contract**: Samodzielny plik HTML otwierany lokalnie w przeglądarce. Dla każdej propozycji (A, B, C):

- ikona w karcie: 16 i 32 px na jasnym i na ciemnym pasku kart,
- ikona na telefonie: 180 px z zaokrąglonymi rogami, jak na ekranie iPhone'a,
- znak obok nazwy „lekomapa” na tle `sidebar`, jasnym i ciemnym,
- jedno zdanie, co znak przedstawia.

Kolory skopiowane z `global.css` (plik leży poza `src/`, więc bramka kolorów go nie sprawdza). Każdy znak jako SVG w kwadracie `viewBox="0 0 24 24"` z jednym kolorem wypełnienia.

#### 2. Zapis wyboru

**File**: `context/changes/app-icon/change.md`

**Intent**: Utrwalić decyzję autorki, żeby faza 2 miała jedno źródło.

**Contract**: Sekcja `## Notes`: litera i opis wybranej propozycji, data z rokiem, ewentualne poprawki zgłoszone przez autorkę.

### Success Criteria:

#### Automated Verification:

- `context/changes/app-icon/proposals.html` istnieje i zawiera 2–3 propozycje

#### Manual Verification:

- Autorka obejrzała propozycje w rozmiarze 16 px, 180 px i na pasku bocznym w obu trybach
- Żadna propozycja nie kojarzy się z ostrzeżeniem ani poradą medyczną (FR-012)
- Wybór zapisany w `change.md`

**Implementation Note**: Po fazie 1 stop do wyboru autorki. Faza 2 nie startuje bez zapisanego wyboru.

---

## Faza 2: Ikona w karcie i na telefonie

### Overview

Wybrany kształt trafia do kodu. Skrypt generuje pliki ikon, `Layout.astro` je podpina, a test pilnuje zgodności plików z kształtem i tokenami.

### Changes Required:

#### 1. Kształt znaku

**File**: `src/lib/brand-mark.ts`

**Intent**: Jedno źródło geometrii znaku dla plików w `public/` i dla komponentu.

**Contract**: Eksport `BRAND_MARK` z `viewBox` (string) i listą ścieżek SVG (`d`). Bez kolorów, bez importów z `cloudflare:*`, bez `reportError`, bo moduł importuje `scripts/**`.

#### 2. Skrypt generujący

**File**: `scripts/icons/generate-icons.mjs` (+ wpis `"icons": "node --experimental-strip-types scripts/icons/generate-icons.mjs"` w `package.json`)

**Intent**: Zbudować pliki ikon ze stałymi kolorami z kształtu i jasnych tokenów, powtarzalnie.

**Contract**: Czysta funkcja `buildIconSvg({ padding, rounded })` zwracająca tekst SVG (`rounded: true` tylko dla `favicon.svg` i `favicon.png`; ikony telefonu mają pełne kwadratowe tło) (kwadrat `--primary`, znak `--primary-foreground`, kolory z `loadTokenBlocks()` dla trybu jasnego). Uruchomiony skrypt zapisuje:

- `public/favicon.svg` — pełny kwadrat z lekko zaokrąglonymi rogami,
- `public/favicon.png` 32×32 (nadpisuje plik startera),
- `public/apple-touch-icon.png` 180×180 — pełne tło, bez przezroczystości, znak w środkowych ~80%,
- `public/icon-192.png`, `public/icon-512.png` — pełne tło, znak w strefie bezpiecznej.

PNG przez `sharp` z wygenerowanego SVG. Komunikaty skryptu po angielsku.

#### 3. Manifest

**File**: `public/manifest.webmanifest`

**Intent**: Nazwa i ikona przy „Dodaj do ekranu początkowego” na Androidzie.

**Contract**: `name` i `short_name` „lekomapa”, `start_url: "/"`, `display: "browser"`, `lang: "pl"`, `icons`: 192 (`purpose: "any"`), 512 (`purpose: "any"`), 512 (`purpose: "maskable"`). Bez `theme_color`. Żadnych danych zdrowotnych w adresach.

#### 4. Linki w nagłówku strony

**File**: `src/layouts/Layout.astro`

**Intent**: Podpiąć ikony i manifest na każdej stronie.

**Contract**: W `<head>` zamiast obecnej linii 32:

- `<link rel="icon" href="/favicon.svg" type="image/svg+xml">`,
- `<link rel="icon" href="/favicon.png" type="image/png" sizes="32x32">` jako zapas,
- `<link rel="apple-touch-icon" href="/apple-touch-icon.png">`,
- `<link rel="manifest" href="/manifest.webmanifest">`,
- `<meta name="apple-mobile-web-app-title" content="lekomapa">` — nazwa pod ikoną na iPhonie niezależna od tytułu strony.

#### 5. Test plików

**File**: `scripts/icons/icons.test.mjs`

**Intent**: Wywrócić `npm test`, gdy pliki ikon rozjadą się z kształtem albo tokenami, albo gdy manifest straci ustalone pola.

**Contract**: Asercje na obserwowalnych plikach:

- `public/favicon.svg` jest identyczny z wynikiem `buildIconSvg` dla bieżącego `BRAND_MARK` i tokenów,
- wymiary PNG odczytane z nagłówka pliku: 32, 180, 192, 512,
- `apple-touch-icon.png` i `icon-512.png` nie mają przezroczystych narożników (przez `sharp`, piksel w rogu ma alfa 255),
- manifest: `display === "browser"`, `start_url === "/"`, `name === "lekomapa"`, każda ścieżka z `icons` istnieje w `public/`, jest wpis `maskable`,
- `Layout.astro` zawiera cztery linki z punktu 4.

### Success Criteria:

#### Automated Verification:

- `npm run icons` generuje pliki bez błędów, a ponowny bieg nie zmienia ich zawartości (`git status` czysty)
- `npm test` przechodzi, w tym `scripts/icons/icons.test.mjs`
- `npm run typecheck` przechodzi
- `npm run lint` przechodzi
- `npm run build` przechodzi, a `dist/` zawiera `favicon.svg`, `apple-touch-icon.png` i `manifest.webmanifest`

#### Manual Verification:

- Karta w Chrome i Safari pokazuje nowy znak przy jasnym i ciemnym motywie przeglądarki
- Na iPhonie „Do ekranu początkowego” daje ikonę lekomapy z podpisem „lekomapa”, a stuknięcie otwiera Safari
- Na Androidzie „Dodaj do ekranu głównego” daje ikonę lekomapy bez obciętego znaku, a stuknięcie otwiera kartę przeglądarki
- Znak ze zmiany zgadza się z propozycją wybraną w fazie 1

**Implementation Note**: Sprawdzenie na telefonie wymaga wdrożenia (adres `lekomapa.pl`) albo dostępu do podglądu z sieci lokalnej. Jeśli wdrożenie jest jedyną drogą, sprawdzenie na telefonie przechodzi do weryfikacji po merge'u i jest zaznaczone w PR.

---

## Faza 3: Znak obok nazwy

### Overview

Wspólny komponent znaku z nazwą, na tokenach, w trzech miejscach, w których dziś stoi sam tekst.

### Changes Required:

#### 1. Komponent znaku z nazwą

**File**: `src/components/BrandName.astro`

**Intent**: Jedno miejsce, które rysuje znak i nazwę. Zmiana znaku to jedna edycja.

**Contract**: Komponent `.astro` (bez React — nie ma stanu ani zdarzeń). Propsy: `class` na element zewnętrzny (wielkość tekstu z miejsca użycia, łączona przez `cn()`), tekst nazwy przez slot albo prop. Znak to inline SVG z `BRAND_MARK`: kwadrat `bg-primary`/`fill` przez klasę tokenu, znak `text-primary-foreground` z `fill="currentColor"`. Wysokość znaku zależna od wielkości tekstu (`1em`–`1.25em`). SVG z `aria-hidden="true"`, bo nazwa obok jest tekstem. Żadnej klasy `dark:` z kolorem i żadnego koloru wpisanego na sztywno.

#### 2. Wnętrze aplikacji

**File**: `src/layouts/AppLayout.astro`

**Intent**: Znak obok nazwy na pasku bocznym i w nagłówku na telefonie.

**Contract**: Linie 27 i 60 — `<p>` z tekstem zastąpione `BrandName` z tymi samymi klasami wielkości (`text-2xl font-bold`, `text-xl font-bold`). Nazwa zostaje w kolorze `sidebar-foreground`.

#### 3. Ekrany wejściowe

**File**: `src/layouts/AuthSpreadLayout.astro`

**Intent**: Ten sam znak od pierwszego ekranu.

**Contract**: Linia 20 — `BrandName` z nazwą z `copy.productName` i klasami `text-2xl font-bold lg:text-3xl`.

### Success Criteria:

#### Automated Verification:

- `npm test` przechodzi, w tym `scripts/tokens/hardcoded-colors.mjs` (brak koloru na sztywno w `BrandName.astro`)
- `npm run typecheck` przechodzi
- `npm run lint` przechodzi
- `npm run build` przechodzi

#### Manual Verification:

- Pasek boczny na dużym ekranie: znak obok nazwy, w trybie jasnym i ciemnym
- Nagłówek wnętrza na telefonie: znak obok nazwy, bez zawijania wiersza i bez wypychania przełącznika trybu
- Ekran logowania (telefon i duży ekran): znak obok nazwy w obu trybach
- Czytnik ekranu czyta „lekomapa” raz, bez opisu grafiki

---

## Testing Strategy

### Unit Tests:

- `scripts/icons/icons.test.mjs`: zgodność `favicon.svg` z kształtem i tokenami, wymiary PNG, pełne tło ikon telefonu, pola manifestu, linki w `Layout.astro`.
- Istniejąca bramka kolorów obejmuje `BrandName.astro` i `brand-mark.ts`.

### Integration Tests:

- Brak nowych. Pliki z `public/` nie przechodzą przez Workera, więc smoke i E2E nie mają tu czego sprawdzać.

### Manual Testing Steps:

1. Otwórz `proposals.html`, wybierz znak, zapisz wybór.
2. Po fazie 2: `npm run build && npm run preview` (wcześniej `npx astro preview stop`), sprawdź kartę w Chrome i Safari w obu motywach.
3. Na iPhonie i Androidzie dodaj skrót do ekranu, sprawdź ikonę, podpis i to, że otwiera się karta przeglądarki.
4. Po fazie 3: pasek boczny, nagłówek na telefonie i ekran logowania w obu trybach.

## Performance Considerations

Brak istotnych. Ikony to kilka małych plików statycznych, a inline SVG w nagłówku ma kilkaset bajtów.

## Migration Notes

Brak migracji bazy. Przeglądarki trzymają stary favicon w pamięci — po wdrożeniu może być potrzebne twarde odświeżenie.

## References

- Roadmapa: `context/foundation/roadmap.md` (S-04, MS-09), issue #107
- Tokeny: `src/styles/global.css:20-21,66-67`, odczyt `scripts/tokens/contrast.mjs:191`
- Bramka kolorów: `scripts/tokens/hardcoded-colors.mjs:11`
- Miejsca nazwy: `src/layouts/AppLayout.astro:27,60`, `src/layouts/AuthSpreadLayout.astro:20`
- Obecny favicon: `src/layouts/Layout.astro:32`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Propozycje znaku

#### Automated

- [x] 1.1 `context/changes/app-icon/proposals.html` istnieje i zawiera 2–3 propozycje — 92c69a0

#### Manual

- [x] 1.2 Autorka obejrzała propozycje w rozmiarze 16 px, 180 px i na pasku bocznym w obu trybach — 92c69a0
- [x] 1.3 Żadna propozycja nie kojarzy się z ostrzeżeniem ani poradą medyczną (FR-012) — 92c69a0
- [x] 1.4 Wybór zapisany w `change.md` — 92c69a0

### Phase 2: Ikona w karcie i na telefonie

#### Automated

- [x] 2.1 `npm run icons` generuje pliki bez błędów, a ponowny bieg nie zmienia ich zawartości (`git status` czysty) — ee46819
- [x] 2.2 `npm test` przechodzi, w tym `scripts/icons/icons.test.mjs` — ee46819
- [x] 2.3 `npm run typecheck` przechodzi — ee46819
- [x] 2.4 `npm run lint` przechodzi — ee46819
- [x] 2.5 `npm run build` przechodzi, a `dist/` zawiera `favicon.svg`, `apple-touch-icon.png` i `manifest.webmanifest` — ee46819

#### Manual

- [x] 2.6 Karta w Chrome i Safari pokazuje nowy znak przy jasnym i ciemnym motywie przeglądarki — ee46819
- [x] 2.7 Na iPhonie „Do ekranu początkowego” daje ikonę lekomapy z podpisem „lekomapa”, a stuknięcie otwiera Safari
- [x] 2.8 Na Androidzie „Dodaj do ekranu głównego” daje ikonę lekomapy bez obciętego znaku, a stuknięcie otwiera kartę przeglądarki
- [x] 2.9 Znak ze zmiany zgadza się z propozycją wybraną w fazie 1 — ee46819

### Phase 3: Znak obok nazwy

#### Automated

- [x] 3.1 `npm test` przechodzi, w tym `scripts/tokens/hardcoded-colors.mjs` (brak koloru na sztywno w `BrandName.astro`) — 94a495f
- [x] 3.2 `npm run typecheck` przechodzi — 94a495f
- [x] 3.3 `npm run lint` przechodzi — 94a495f
- [x] 3.4 `npm run build` przechodzi — 94a495f

#### Manual

- [x] 3.5 Pasek boczny na dużym ekranie: znak obok nazwy, w trybie jasnym i ciemnym — 94a495f
- [x] 3.6 Nagłówek wnętrza na telefonie: znak obok nazwy, bez zawijania wiersza i bez wypychania przełącznika trybu — 94a495f
- [x] 3.7 Ekran logowania (telefon i duży ekran): znak obok nazwy w obu trybach — 94a495f
- [x] 3.8 Czytnik ekranu czyta „lekomapa” raz, bez opisu grafiki — 94a495f
