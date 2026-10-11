# Tryb ciemny (S-11) — plan wdrożenia

## Overview

Użytkowniczka może korzystać z lekomapy w trybie ciemnym na wszystkich ekranach M-1. Domyślnie produkt idzie za ustawieniem systemu (telefonu, komputera). Wybór „jasny / ciemny / jak w systemie” jest w zakładce Konto, a ikona we wnętrzu szybko przełącza na tryb przeciwny do widocznego. Wybór zapamiętuje ciasteczko na urządzeniu. Na koniec wszystkie ekrany przechodzą przegląd w trybie ciemnym na galerii zrzutów.

Roadmapa: S-11 (`context/foundation/roadmap.md`), PRD `## Non-Functional Requirements` — tryb ciemny zachowuje czytelność trybu jasnego i znaczenie kolorów funkcjonalnych, możliwa kolizja nie wygląda w nim jak alarm.

## Current State Analysis

- Ciemna paleta jest gotowa: blok `.dark` w `src/styles/global.css:54` ma te same nazwy kolorów co `:root`, wartości zaakceptowane na makiecie w F-04. Wariant `@custom-variant dark (&:is(.dark *))` jest w `global.css:4`.
- Kontrast każdej pary tekstu ≥ 7 : 1 w obu trybach pilnuje `scripts/tokens/contrast.mjs` (w `npm test`).
- Kolorów wpisanych na sztywno nie ma: lista `EXCEPTIONS` w `scripts/tokens/hardcoded-colors.mjs:17` jest pusta, skaner odrzuca też kolorowe klasy `dark:` (`dark:hidden` jest dozwolone — `scripts/tokens/hardcoded-colors.test.mjs:121`).
- Nic nie ustawia klasy `dark` na `<html>` (`src/layouts/Layout.astro`) i nie ma przełącznika. Tryb ciemny da się dziś zobaczyć tylko przez narzędzia przeglądarki.
- Ekrany: 31 stron w `src/pages` (bez `api/`) — 22 wnętrza przez `src/layouts/AppLayout.astro`, reszta to wejście (`AuthSpreadLayout.astro`), strony publiczne (`/prywatnosc`, `/warunki`, `/`) i `dashboard`.
- Konto: `src/pages/konto.astro` (S-09), teksty w `src/lib/copy/account.ts`, filtrowane przez `scripts/account/account-copy.test.mjs`.
- Strona prywatności mówi „Używamy wyłącznie ciasteczek potrzebnych do logowania” (`src/lib/copy/terms.ts:88`, `PRIVACY_COPY`). To nie jest tekst warunków (`TERMS_V1`), więc poprawka nie wymaga wersji 2 warunków.
- Playwright jest skonfigurowany (`playwright.config.ts`, `context/foundation/test-stack.md`): build + preview, lokalny Supabase, sesja z `tests/e2e/auth.setup.ts`.
- `zod` jest zainstalowany (`package.json:42`).

## Desired End State

- Bez żadnego wyboru lekomapa jest ciemna, gdy system jest ciemny, i jasna, gdy jasny — także na ekranach logowania i rejestracji. Zmiana ustawienia systemu przy otwartej stronie przełącza tryb bez przeładowania.
- W Konto sekcja „Wygląd” z trzema opcjami: Jasny, Ciemny, Jak w systemie. Zaznaczona jest bieżąca. Zapis wraca na Konto.
- We wnętrzu (pas boczny na komputerze, nagłówek na telefonie) ikona przełącza na tryb przeciwny do widocznego i wraca na ten sam ekran.
- Wybór „jasny” i „ciemny” serwer rysuje od razu — strona nie mignie innym trybem przy wczytaniu ani przy przejściu między ekranami.
- Pola daty i godziny, paski przewijania i inne elementy przeglądarki są w trybie ciemnym ciemne.
- Strona prywatności wymienia ciasteczko trybu.
- Autorka zaakceptowała galerię zrzutów wszystkich ekranów w trybie ciemnym (telefon i komputer).

Weryfikacja: `npm test`, `npm run typecheck`, `npm run lint`, `npx playwright test`, przegląd galerii.

### Key Discoveries:

- `src/styles/global.css:4` — tryb ciemny to klasa `dark` na przodku; podmiana wartości tokenów, nie nowa architektura.
- `scripts/tokens/hardcoded-colors.test.mjs:121` — `dark:hidden` nie jest naruszeniem. Pozwala pokazać właściwą ikonę bez JavaScriptu także przy „jak w systemie”.
- `src/layouts/AppLayout.astro:47-60` — wzorzec przycisku w pasku: formularz POST (`Wyloguj się`), bez React. Ikona idzie tym samym wzorcem.
- `src/pages/api/auth/signout.ts` — wzorzec trasy POST z przekierowaniem.
- `src/middleware.ts:17,60` — chronione są tylko trasy z `PROTECTED_ROUTES`; nowa trasa `/api/preferences/theme` nie wymaga logowania i sama niczego nie czyta z bazy. Jak każde `/api/*` przechodzi przez bramkę warunków (`src/lib/auth/terms-gate.ts:30`): dla zalogowanej osoby middleware pyta `terms_acceptances`, a bez akceptacji bieżącej wersji zwraca 403. Zamierzone — ikona jest tylko we wnętrzu, a ekran akceptacji (`AuthSpreadLayout`) jej nie ma. `EXEMPT_PATHS` bez zmian.
- `src/lib/copy/terms.ts:54,88` — `PRIVACY_COPY` jest edytowalny (Sentry w roadmapie też go zmienia).

## What We're NOT Doing

- Zapisu wyboru na koncie (tabela w bazie, wspólny tryb na wszystkich urządzeniach) — wybór jest per urządzenie.
- Ikony na ekranach wejściowych, stronach publicznych i na pasku „wersja demonstracyjna” — tam tryb idzie za systemem albo za wyborem zapamiętanym na urządzeniu.
- Trzeciego stanu w ikonie — powrót do „jak w systemie” tylko w Konto.
- „Jak w systemie” bez JavaScriptu — przy wyłączonym JavaScripcie ta opcja pokazuje tryb jasny. Wybór „ciemny” działa bez JavaScriptu.
- Zmian wartości tokenów „na zapas” — tylko poprawki wynikłe z przeglądu galerii.
- Zmian układu ekranów — usterka z przeglądu, której nie da się poprawić tokenem, trafia do osobnej zmiany.
- Stałego porównywania zrzutów w CI (wzorce wyglądu) — galeria to przegląd jednorazowy.
- Trybu wydruku (podsumowanie wizyty) — dziś nie ma stylów druku.

## Implementation Approach

Preferencja (`light` / `dark` / `system`) żyje w ciasteczku. `Layout.astro` — wspólny dla wszystkich 31 ekranów — czyta ciasteczko na serwerze i rysuje `<html>` od razu z klasą `dark` albo bez niej. Dla `system` mały skrypt w `<head>` ustawia klasę przed narysowaniem strony i słucha zmian ustawienia systemu.

Oba przełączniki to zwykłe formularze POST do jednej trasy, która zapisuje ciasteczko i wraca na ekran, z którego przyszło żądanie. Ikona ma dwa przyciski — „Włącz tryb ciemny” widoczny w trybie jasnym, „Włącz tryb jasny” w ciemnym — przełączane klasami `dark:hidden` / `hidden dark:…`, więc działa poprawnie także przy „jak w systemie”, bez wiedzy serwera o ustawieniu systemu.

## Critical Implementation Details

- **Skrypt trybu systemowego musi być `is:inline` i stać w `<head>` przed arkuszem stylów lub zaraz po nim.** Zwykły `<script>` w Astro jest pakowany jako moduł i odpala się po narysowaniu — strona mignęłaby jasnym trybem. Skrypt jest renderowany tylko przy preferencji `system`.
- **Ikona nie może zależeć od tego, co serwer wie o trybie.** Przy `system` serwer nie zna ustawienia systemu, dlatego oba przyciski są w kodzie strony, a widoczność przełącza CSS. Ukryty przycisk (`display: none`) znika z drzewa dostępności, więc czytnik ekranu słyszy jeden.
- **Adres powrotu to tylko ścieżka wewnątrz lekomapy.** Wartość spoza wzorca (`//…`, `/\…`, pełny adres, pusta) → `/`. Inaczej trasa byłaby otwartym przekierowaniem na obcą stronę. Ścieżka bez części `?…` — parametry nie wracają (lesson „Żadna nazwa leku ani dawka w adresie URL”).

## Faza 1: Mechanizm trybu

### Overview

Ciasteczko, odczyt preferencji, klasa `dark` ustawiana przez serwer, skrypt dla „jak w systemie”, `color-scheme` i trasa zapisu. Po tej fazie tryb działa (da się go ustawić żądaniem POST), ale użytkowniczka nie ma jeszcze przełącznika.

### Changes Required:

#### 1. Reguły preferencji

**File**: `src/lib/theme.ts` (nowy)

**Intent**: Jedno miejsce z nazwą ciasteczka, dozwolonymi wartościami i dwiema czystymi funkcjami, które da się przetestować bez przeglądarki.

**Contract**:

- `THEME_COOKIE = "lekomapa-theme"`, `type ThemePreference = "light" | "dark" | "system"`, `THEME_PREFERENCES` (lista trzech wartości).
- `parseThemePreference(value: string | undefined): ThemePreference` — dokładnie jedna z trzech wartości (wielkość liter ma znaczenie), wszystko inne i brak → `"system"`.
- `safeReturnPath(value: unknown): string` — zwraca wartość tylko wtedy, gdy to string zaczynający się od pojedynczego `/`, bez `//`, bez `\`, bez `?` i `#`, bez znaków sterujących; w każdym innym przypadku `"/"`.
- Atrybuty ciasteczka jako stała: `path: "/"`, `sameSite: "lax"`, `httpOnly: true`, `maxAge` 1 rok; `secure` ustawia trasa wg protokołu żądania (lokalny podgląd chodzi po `http`).

#### 2. `<html>` rysowane w wybranym trybie

**File**: `src/layouts/Layout.astro`

**Intent**: Każdy ekran od pierwszego bajtu ma właściwy tryb. Przy `dark` serwer dopisuje klasę `dark`, przy `light` nic, przy `system` skrypt `is:inline` w `<head>` dopisuje klasę wg `matchMedia("(prefers-color-scheme: dark)")` i reaguje na zdarzenie `change`.

**Contract**: `<html lang="pl" class="dark"?` + `data-theme="<preferencja>">`. Preferencja z `Astro.cookies.get(THEME_COOKIE)?.value` przez `parseThemePreference`. Skrypt obecny w HTML wyłącznie przy `system`.

#### 3. Elementy przeglądarki w trybie ciemnym

**File**: `src/styles/global.css`

**Intent**: Pola daty i godziny w dzienniczku, paski przewijania i lista podpowiedzi przeglądarki idą za trybem.

**Contract**: `color-scheme: light` dla `:root` i `color-scheme: dark` dla `.dark`. Jeśli parser tokenów (`scripts/tokens/contrast.mjs`) albo skaner (`hardcoded-colors.mjs`) nie przyjmuje właściwości bez `--` w blokach tokenów, osobna reguła po blokach — `npm test` rozstrzyga. Żadnych wartości kolorów poza tokenami.

#### 4. Trasa zapisu wyboru

**File**: `src/pages/api/preferences/theme.ts` (nowy)

**Intent**: Przyjmuje formularz z ikony i z Konto, zapisuje ciasteczko i wraca na ekran, z którego przyszło żądanie.

**Contract**: `export const prerender = false`, `POST`. Pola formularza: `theme` (walidacja zod: jedna z `THEME_PREFERENCES`), `returnTo` (przez `safeReturnPath`). Poprawny `theme` → `cookies.set(THEME_COOKIE, …)`; niepoprawny → bez zmiany ciasteczka. W obu przypadkach przekierowanie 303 na `safeReturnPath(returnTo)`. Trasa bez wymogu logowania (nie w `PROTECTED_ROUTES`), sama nie woła Supabase; bramka warunków w middleware działa na niej jak na każdym `/api/*` (Key Discoveries).

#### 5. Testy jednostkowe

**File**: `scripts/theme/theme.test.mjs` (nowy; uruchamiany przez `npm test`)

**Intent**: Pilnują dwóch reguł, których złamanie nie jest widoczne na ekranie: nieznana wartość ciasteczka nie psuje strony, a adres powrotu nie wypuszcza poza lekomapę.

**Contract**: `parseThemePreference` — `undefined`, `""`, `"DARK"`, `"blue"` → `"system"`; `"light"`, `"dark"`, `"system"` bez zmian. `safeReturnPath` — `"/leki"` i `"/leki/<uuid>/zmiana-dawki"` bez zmian; `"//example.com"`, `"/\\example.com"`, `"https://example.com"`, `"leki"`, `"/leki?q=x"`, `""`, `undefined`, `42` → `"/"`.

### Success Criteria:

#### Automated Verification:

- Testy jednostkowe trybu przechodzą: `npm test`
- Typy bez błędów: `npm run typecheck`
- Lint bez błędów: `npm run lint`
- Build przechodzi: `npm run build`

#### Manual Verification:

- Z ciasteczkiem `lekomapa-theme=dark` ustawionym w narzędziach przeglądarki strona logowania i `/leki` są ciemne od pierwszego narysowania (bez mignięcia przy przeładowaniu i przejściu między ekranami)
- Bez ciasteczka przełączenie ustawienia systemu (lub emulacja `prefers-color-scheme` w narzędziach przeglądarki) przełącza tryb otwartej strony bez przeładowania
- Pole daty w `/dzienniczek/nowy` ma ciemny wybierak w trybie ciemnym

**Implementation Note**: Po automatycznej weryfikacji pauza na potwierdzenie sprawdzeń ręcznych przed fazą 2.

---

## Faza 2: Przełączniki

### Overview

Sekcja „Wygląd” w Konto, ikona we wnętrzu, teksty, poprawka strony prywatności, test Playwright ścieżek przełączania.

### Changes Required:

#### 1. Teksty

**File**: `src/lib/copy/appearance.ts` (nowy)

**Intent**: Wszystkie teksty wyglądu w jednym module, przepuszczane przez filtr słów zakazanych FR-012 jak `account.ts`.

**Contract**: `APPEARANCE_COPY` z polami wyłącznie typu string: nagłówek sekcji („Wygląd”), legenda grupy, etykiety opcji („Jasny”, „Ciemny”, „Jak w systemie”), przycisk zapisu („Zapisz”), etykiety ikony („Włącz tryb ciemny”, „Włącz tryb jasny”). Ostateczne brzmienie do akceptacji autorki przy bramce manualnej. Test filtra: `scripts/theme/appearance-copy.test.mjs` na wzór `scripts/account/account-copy.test.mjs`.

#### 2. Sekcja „Wygląd” w Konto

**File**: `src/pages/konto.astro`

**Intent**: Pełny wybór trzech opcji. Zaznaczona bieżąca preferencja (z ciasteczka). Zapis wraca na `/konto`.

**Contract**: Karta tym samym stylem co pozostałe (`cardClass`), między adresem e-mail a usunięciem konta. Formularz POST na `/api/preferences/theme`, `<fieldset>` z `<legend>` i trzema polami `radio` `name="theme"` (każde pole z etykietą, cel kliknięcia ≥ 44 px), ukryte `returnTo="/konto"`, przycisk zapisu. Bez React — ekran nie trzyma stanu.

#### 3. Ikona we wnętrzu

**File**: `src/components/ThemeToggle.astro` (nowy), `src/layouts/AppLayout.astro`

**Intent**: Szybkie przełączenie na tryb przeciwny do widocznego, na każdym ekranie wnętrza, bez wchodzenia w Konto.

**Contract**: Formularz POST na `/api/preferences/theme` z ukrytym `returnTo` = bieżąca ścieżka (`Astro.url.pathname`, bez parametrów). Dwa przyciski `type="submit" name="theme"`: `value="dark"` z ikoną księżyca i `aria-label` „Włącz tryb ciemny”, widoczny tylko w trybie jasnym (`dark:hidden`); `value="light"` z ikoną słońca i `aria-label` „Włącz tryb jasny”, widoczny tylko w ciemnym (`hidden dark:inline-flex`). Ikony jako SVG z `currentColor` (bez React; `lucide-react` wymagałby wyspy). Rozmiar ≥ 44 px, kolory paska bocznego jak przycisk „Wyloguj się” (`sidebar*`). Wstawiona w pasie bocznym obok „Wyloguj się” i w nagłówku telefonu przed nim.

#### 4. Strona prywatności

**File**: `src/lib/copy/terms.ts` (`PRIVACY_COPY`, sekcja „Ciasteczka”)

**Intent**: Strona prywatności mówi prawdę o ciasteczkach po dodaniu ciasteczka trybu.

**Contract**: Punkt zmieniony na wymienienie ciasteczka logowania i ciasteczka zapamiętującego wybrany wygląd (jasny, ciemny lub jak w systemie), z zachowaniem „Nie ma reklam ani statystyk odwiedzin”. `TERMS_V1` bez zmian. Brzmienie do akceptacji autorki.

#### 5. Test Playwright

**File**: `tests/e2e/theme.spec.ts` (nowy)

**Intent**: Dowodzi w prawdziwej przeglądarce, że ścieżki przełączania działają i że serwer rysuje tryb bez mignięcia.

**Contract**: Każdy test we własnym kontekście (ciasteczko trybu nie przecieka). Przypadki:

- Konto: wybór „Ciemny” + zapis → URL `/konto`, `<html>` ma klasę `dark`, opcja „Ciemny” zaznaczona; surowy HTML odpowiedzi na `/leki` (żądanie z tym samym ciasteczkiem) ma `class="dark"` na `<html>` — dowód rysowania przez serwer.
- Ikona: przy trybie ciemnym na `/leki` przycisk „Włącz tryb jasny” → URL `/leki`, `<html>` bez klasy `dark`; widoczny jest dokładnie jeden przycisk ikony.
- System: bez ciasteczka, `emulateMedia({ colorScheme: "dark" })` → `<html>` ma `dark`; zmiana na `light` przy otwartej stronie → bez `dark`.
- Wejście: kontekst bez sesji z ciasteczkiem `dark` → `/auth/signin` ma `dark`.
- Konto „Jak w systemie” po wcześniejszym „Ciemny” przy emulacji `light` → `<html>` bez `dark`.

#### 6. Dokumenty

**File**: `CLAUDE.md` (`### Konwencje kodu`)

**Intent**: Następny agent wie, gdzie żyje tryb, i nie dokłada drugiego mechanizmu.

**Contract**: Jeden punkt: preferencja w ciasteczku `lekomapa-theme` (`src/lib/theme.ts`), `<html>` rysuje `Layout.astro`, zapis przez `/api/preferences/theme`; element zależny od trybu przełączać `dark:hidden` / `hidden dark:…`, nigdy kolorową klasą `dark:`.

### Success Criteria:

#### Automated Verification:

- Testy jednostkowe i filtr tekstów przechodzą: `npm test`
- Typy bez błędów: `npm run typecheck`
- Lint bez błędów: `npm run lint`
- Test przełączania przechodzi przeciw lokalnemu Supabase: `npx playwright test tests/e2e/theme.spec.ts`
- Pozostałe testy E2E bez regresji: `npx playwright test`

#### Manual Verification:

- Autorka zaakceptowała brzmienie tekstów sekcji „Wygląd”, etykiet ikony i punktu o ciasteczkach
- Na telefonie ikona w nagłówku mieści się obok „Wyloguj się” i nie zasłania nazwy produktu
- Czytnik ekranu (VoiceOver) czyta jeden przycisk ikony z etykietą zgodną z widocznym trybem
- Na stronie `/prywatnosc` widać nowy punkt o ciasteczkach

**Implementation Note**: Przed biegiem Playwright zatrzymaj stary podgląd (`npx astro preview stop`) i potwierdź, że bieg idzie do lokalnego Supabase (lessons). Po automatycznej weryfikacji pauza na potwierdzenie sprawdzeń ręcznych przed fazą 3.

---

## Faza 3: Przegląd ekranów

### Overview

Playwright robi zrzuty wszystkich 31 ekranów w trybie ciemnym na telefonie i komputerze, także w stanach z danymi. Zrzuty trafiają na jedną prywatną stronę do akceptacji autorki. Usterki poprawiane wyłącznie w tokenach.

### Changes Required:

#### 1. Skrypt galerii

**File**: `tests/e2e/dark-gallery.spec.ts` (nowy)

**Intent**: Jedno polecenie robi komplet zrzutów, powtarzalny po każdej poprawce. Nie należy do zwykłego biegu testów.

**Contract**:

- Uruchamiany tylko przy `DARK_GALLERY=1` (`test.skip` w przeciwnym razie), więc `npx playwright test` go pomija.
- Ciasteczko `lekomapa-theme=dark`; dwa rozmiary: telefon 390×844, komputer 1280×800; zrzut całej strony.
- Ekrany wnętrza z sesji testowej, ekrany wejściowe i publiczne w kontekście bez sesji.
- Stany z danymi, tworzone przez interfejs w lokalnym Supabase: lek ze znacznikiem „Możliwa interakcja” (para z `scripts/rpl/pairs.mjs`), lek zakończony, wpis dzienniczka, złożone pytanie do lekarza na `/wizyta`, błąd formularza (np. pusty formularz leku, błędne hasło na logowaniu). Trasy z `[id]` biorą identyfikatory z utworzonych danych.
- Dane galerii z unikalnym znacznikiem biegu w nazwie (np. sygnatura czasu), usuwane w `afterAll` przez interfejs, w oknie korekty. Kolejny bieg zaczyna od tego samego stanu konta, więc zrzuty po poprawce da się porównać z poprzednimi.
- Ekrany, których nie da się otworzyć bez specjalnego stanu (np. `/auth/reset-password` bez sesji z odnośnika, `/warunki/akceptacja` dla konta z akceptacją), zrzucane w stanie, który faktycznie widać, z dopiskiem w nazwie pliku; nie omijane po cichu.
- Zrzuty do `test-results/dark-gallery/` (gitignorowane), nazwa pliku: `<trasa>--<rozmiar>.png`.

#### 2. Strona galerii

**File**: strona HTML w katalogu roboczym sesji, opublikowana jako prywatny Artifact

**Intent**: Autorka przegląda wszystkie zrzuty w jednym miejscu, pogrupowane wg ekranu, telefon obok komputera.

**Contract**: Na każdy ekran: nazwa trasy, dwa zrzuty, miejsce na uwagę. Na górze lista, na co patrzeć: znacznik „Możliwa interakcja” nie wygląda jak alarm ani czerwień, błąd formularza odróżnia się od bursztynu, tekst przygaszony czytelny, pasek „wersja demonstracyjna” widoczny, pola formularzy odróżniają się od tła. Na zrzutach wyłącznie dane konta testowego z lokalnego Supabase. Zrzuty publikowane jako osobne pliki obok strony (mapa `files` Artifactu), nie wklejone w HTML jako `data:` — komplet PNG przekroczyłby limit 16 MB strony.

#### 3. Poprawki z przeglądu

**File**: `src/styles/global.css` (blok `.dark`), w razie potrzeby `scripts/tokens/contrast.mjs` (`EXPLICIT_PAIRS`)

**Intent**: Usterki z przeglądu poprawione tak, żeby objęły wszystkie ekrany naraz i zostały pod kontrolą testu kontrastu.

**Contract**: Wyłącznie zmiany wartości w `.dark` albo nowy token w obu blokach z parą w teście kontrastu. Każda poprawka → ponowny zrzut ekranu, którego dotyczyła. Usterka wymagająca zmiany układu lub komponentu → wpis w `## Notes` w `change.md` i osobna zmiana, nie poprawka w tej fazie.

### Success Criteria:

#### Automated Verification:

- Galeria powstaje bez błędów: `DARK_GALLERY=1 npx playwright test tests/e2e/dark-gallery.spec.ts`
- Każda strona z `src/pages` poza `api/` ma ≥ 1 wpis na liście w skrypcie (wpis = ekran w jednym stanie); liczba zrzutów = 2 × liczba wpisów
- Kontrast i skaner kolorów przechodzą po poprawkach: `npm test`
- Zwykły bieg E2E pomija galerię: `npx playwright test`

#### Manual Verification:

- Autorka zaakceptowała galerię wszystkich ekranów w trybie ciemnym na telefonie i komputerze
- Znacznik „Możliwa interakcja” w trybie ciemnym nie wygląda jak alarm ani jak błąd (czerwień)
- Usterki spoza tokenów (jeśli są) zapisane w `change.md` jako osobne zmiany

**Implementation Note**: Przed biegiem zatrzymaj stary podgląd i potwierdź lokalny Supabase. Galeria publikowana jako prywatny Artifact; link do autorki.

---

## Testing Strategy

### Unit Tests:

- `parseThemePreference` — nieznane i puste wartości dają `system`.
- `safeReturnPath` — tylko ścieżki wewnętrzne, bez parametrów; każda próba wyjścia poza lekomapę daje `/`.
- Filtr słów zakazanych na `APPEARANCE_COPY` i zmienionym `PRIVACY_COPY`.

### Integration Tests:

- `tests/e2e/theme.spec.ts` — Konto, ikona, system, ekran wejściowy, powrót do systemu; dowód rysowania przez serwer z surowego HTML.
- `tests/e2e/dark-gallery.spec.ts` — przegląd, nie bramka.

### Manual Testing Steps:

1. Telefon w trybie ciemnym, nowa przeglądarka bez ciasteczek: otwórz lekomapę — ekran logowania jest ciemny.
2. Zaloguj się, wejdź w Konto, wybierz „Jasny”, zapisz — wnętrze jasne mimo ciemnego systemu.
3. Na `/leki` dotknij ikony — ekran ciemny, nadal `/leki`.
4. W Konto wybierz „Jak w systemie”, przełącz system na jasny — lekomapa jasna bez przeładowania.
5. Dodaj wpis w dzienniczku w trybie ciemnym — wybierak daty ciemny i czytelny.

## Performance Considerations

Skrypt dla „jak w systemie” to kilka linijek w `<head>`, bez dodatkowego żądania. Odczyt ciasteczka po stronie serwera nie dodaje zapytania do bazy. Bez wpływu na próg LCP 2,5 s.

## Migration Notes

Brak migracji. Osoby bez ciasteczka dostają „jak w systemie” — dotychczas zawsze widziały tryb jasny, więc przy ciemnym systemie zobaczą zmianę bez własnego wyboru. To zamierzone (decyzja planu).

## References

- Roadmapa: `context/foundation/roadmap.md` — S-11
- Paleta ciemna: `context/changes/auth-login-design/design-draft.md` `## Paleta ciemna`, makieta https://claude.ai/artifact/Ha6A6SV4aPjtwMsreZLu3n
- Fundament tokenów: `context/archive/2026-09-26-app-shell-visual-foundation/plan.md`
- Wzorzec formularza POST w pasku: `src/layouts/AppLayout.astro:47-60`, `src/pages/api/auth/signout.ts`
- Wzorzec testu tekstów: `scripts/account/account-copy.test.mjs`
- Konfiguracja E2E: `playwright.config.ts`, `context/foundation/test-stack.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Mechanizm trybu

#### Automated

- [x] 1.1 Testy jednostkowe trybu przechodzą: `npm test` — 771c8d3
- [x] 1.2 Typy bez błędów: `npm run typecheck` — 771c8d3
- [x] 1.3 Lint bez błędów: `npm run lint` — 771c8d3
- [x] 1.4 Build przechodzi: `npm run build` — 771c8d3

#### Manual

- [x] 1.5 Z ciasteczkiem `lekomapa-theme=dark` strona logowania i `/leki` są ciemne od pierwszego narysowania — 771c8d3
- [x] 1.6 Bez ciasteczka zmiana ustawienia systemu przełącza tryb otwartej strony bez przeładowania — 771c8d3
- [x] 1.7 Pole daty w `/dzienniczek/nowy` ma ciemny wybierak w trybie ciemnym — 771c8d3

### Phase 2: Przełączniki

#### Automated

- [x] 2.1 Testy jednostkowe i filtr tekstów przechodzą: `npm test` — 3f954c0
- [x] 2.2 Typy bez błędów: `npm run typecheck` — 3f954c0
- [x] 2.3 Lint bez błędów: `npm run lint` — 3f954c0
- [x] 2.4 Test przełączania przechodzi przeciw lokalnemu Supabase: `npx playwright test tests/e2e/theme.spec.ts` — 3f954c0
- [x] 2.5 Pozostałe testy E2E bez regresji: `npx playwright test` — 3f954c0

#### Manual

- [x] 2.6 Autorka zaakceptowała brzmienie tekstów sekcji „Wygląd”, etykiet ikony i punktu o ciasteczkach — 3f954c0
- [x] 2.7 Na telefonie ikona w nagłówku mieści się obok „Wyloguj się” i nie zasłania nazwy produktu — 3f954c0
- [x] 2.8 Czytnik ekranu czyta jeden przycisk ikony z etykietą zgodną z widocznym trybem — 3f954c0
- [x] 2.9 Na stronie `/prywatnosc` widać nowy punkt o ciasteczkach — 3f954c0

### Phase 3: Przegląd ekranów

#### Automated

- [x] 3.1 Galeria powstaje bez błędów: `DARK_GALLERY=1 npx playwright test tests/e2e/dark-gallery.spec.ts`
- [x] 3.2 Każda strona z `src/pages` poza `api/` ma ≥ 1 wpis na liście; zrzutów = 2 × liczba wpisów
- [x] 3.3 Kontrast i skaner kolorów przechodzą po poprawkach: `npm test`
- [x] 3.4 Zwykły bieg E2E pomija galerię: `npx playwright test`

#### Manual

- [x] 3.5 Autorka zaakceptowała galerię wszystkich ekranów w trybie ciemnym na telefonie i komputerze
- [x] 3.6 Znacznik „Możliwa interakcja” w trybie ciemnym nie wygląda jak alarm ani jak błąd
- [x] 3.7 Usterki spoza tokenów (jeśli są) zapisane w `change.md` jako osobne zmiany
