# Start na liście leków zamiast pustego `/dashboard` — plan wdrożenia

## Overview

Po zalogowaniu użytkowniczka trafia od razu na listę leków (`/leki`) zamiast na pusty ekran `/dashboard` ze startera. Plik `/dashboard` znika, a stary adres (zakładki, historia przeglądarki) przekierowuje na `/leki`. Pozycja roadmapy S-03 (MS-08, issue #106).

## Current State Analysis

- Wszystkie drogi po zalogowaniu kończą się na `/`: logowanie (`src/pages/api/auth/signin.ts:25`), akceptacja warunków (`src/pages/api/terms/accept.ts:27`, `src/pages/warunki/akceptacja.astro:21`). Dopiero `src/pages/index.astro:6` wysyła zalogowaną osobę na `/dashboard`.
- `src/pages/dashboard.astro` to pusty ekran ze startera („Tu pojawią się ekrany aplikacji.”).
- `/dashboard` jest wpisany ręcznie w `INTERIOR_ROUTES` (`src/lib/navigation.ts:18`). Ta lista daje ochronę przed niezalogowanymi i kontrolę akceptacji warunków w middleware.
- Odwołania do `/dashboard` w bramkach:
  - `scripts/smoke.mjs:1914, 2188, 2226–2227, 2688, 2691–2692, 2713, 2718` — kroki sprawdzają ochronę wnętrza (niezalogowana, sesja z odnośnika resetu hasła, kontrola warunków, po wylogowaniu), nie sam ekran,
  - `scripts/auth/terms-gate.test.mjs:26, 70`,
  - `tests/e2e/dark-gallery.spec.ts:135–140` — galeria ma test „every page in src/pages has an entry” (`:330`), więc wpis musi zniknąć razem z plikiem.
- `CLAUDE.md:90` podaje `src/pages/dashboard.astro` jako przykład strony chronionej.
- Projekt nie ma własnej strony 404. `astro.config.mjs` nie ma dziś sekcji `redirects`.

## Desired End State

- Zalogowana osoba otwierająca `/` (także po logowaniu i po akceptacji warunków) trafia na `/leki`.
- `src/pages/dashboard.astro` nie istnieje. `/dashboard` odpowiada przekierowaniem 302 na `/leki`; niezalogowaną osobę `/leki` odsyła dalej do logowania, a konto bez akceptacji warunków — na `/warunki/akceptacja`.
- Każdy krok bramki, który sprawdzał ochronę na `/dashboard`, sprawdza ją na istniejącej trasie wnętrza. Smoke ma kroki „`/` → `/leki`” i „`/dashboard` → `/leki`”.
- Test E2E potwierdza w przeglądarce, że logowanie przez formularz kończy się na liście leków.

### Key Discoveries:

- Jedno miejsce decyduje o ekranie startowym: `src/pages/index.astro:6`.
- Kroki smoke z `/dashboard` to bramki ochrony wnętrza — usunięcie zamiast przepięcia osłabiłoby smoke (lekcja „Bramka musi odróżnić blokadę od niewykonania”).
- `/leki` jest już w `INTERIOR_ROUTES` przez `NAV_ITEMS`, więc przekierowanie na nią nie omija ochrony ani kontroli warunków.
- Logowanie formularzem w E2E: wzorzec z `toPass()` w `tests/e2e/auth.setup.ts` (wyspa React traci wpisany tekst przed hydracją).

## What We're NOT Doing

- Własna strona 404 — osobna decyzja.
- Osobny ekran „Start” ani start na `/wizyta` — odrzucone w roadmapie 14.10.2026.
- Zmiany w trasach API logowania i akceptacji warunków — dalej kierują na `/`.
- Poprawka pozostałych nieaktualnych zdań w `CLAUDE.md` („`src/types.ts` … jeszcze nie istnieje” itd.) — poza zakresem, zanotowane w `m2-handoff.md`.

## Implementation Approach

Zmiana celu w `index.astro`, usunięcie pliku ekranu, przekierowanie w konfiguracji Astro zamiast pliku strony (nie trzeba go chronić ani trzymać w galerii). Potem przepięcie wszystkich bramek z `/dashboard` na trasy wnętrza i nowe kroki pilnujące nowego zachowania. Test E2E osobną fazą, bo wymaga lokalnego Supabase i konta testowego.

## Critical Implementation Details

- **Kod przekierowania**: 302, nie 301. 301 przeglądarka zapamiętuje na stałe — gdyby `/dashboard` miał kiedyś wrócić jako ekran, stare przeglądarki dalej by z niego uciekały. Zmierz w smoke, jaki kod i `Location` przychodzą naprawdę, zanim ustawisz oczekiwanie na sztywno.
- **Gdzie działa przekierowanie**: adapter Cloudflare zamienia `redirects` z `astro.config.mjs` na plik `dist/client/_redirects`. Cloudflare (i `npm run preview`) odpowiada z niego 302, zanim ruszy Worker — middleware, Sentry ani nagłówki aplikacji nie widzą `/dashboard`. Ochronę zapewnia dopiero `/leki`. Sprawdzenie po stronie aplikacji dopisane kiedyś do `/dashboard` nigdy by się nie wykonało.
- **`/dashboard.html`**: nie ma go w `_redirects`, odpowie 404 (dziś 302 tylko dzięki dopasowaniu `.html` w middleware). Akceptowalne — adres `.html` trafia tylko z `astro dev`.
- **Bieg smoke i E2E**: przeciw lokalnemu Supabase, `.env` odsunięty, stary podgląd zatrzymany (`npx astro preview stop`) — lekcje „Zatrzymaj stary podgląd…” i „Lokalne bramki sprawdź…”.

## Faza 1: Start na `/leki` i sprzątanie `/dashboard`

### Overview

Zalogowana osoba startuje na `/leki`, `/dashboard` znika jako ekran i przekierowuje, bramki sprawdzają ochronę na istniejących trasach.

### Changes Required:

#### 1. Ekran startowy

**File**: `src/pages/index.astro`

**Intent**: Zalogowaną osobę kierować na `/leki` zamiast `/dashboard`; komentarz w pliku dopasować.

**Contract**: `Location` dla zalogowanej = `/leki`, dla niezalogowanej bez zmian (`/auth/signin`), status 302.

#### 2. Usunięcie ekranu i przekierowanie

**File**: `src/pages/dashboard.astro` (usunięty), `astro.config.mjs`

**Intent**: Pusty ekran znika; stary adres z zakładek prowadzi na listę leków.

**Contract**: `redirects: { "/dashboard": { status: 302, destination: "/leki" } }` w `defineConfig`, z krótkim komentarzem dlaczego 302.

#### 3. Lista tras wnętrza

**File**: `src/lib/navigation.ts`

**Intent**: Usunąć `/dashboard` z `INTERIOR_ROUTES` — trasa nie ma już ekranu, a cel przekierowania jest chroniony przez `NAV_ITEMS`.

**Contract**: `INTERIOR_ROUTES = [...NAV_ITEMS.map((item) => item.href)]`; komentarz o ręcznych wpisach zostaje.

#### 4. Smoke

**File**: `scripts/smoke.mjs`

**Intent**: Każdy krok sprawdzający ochronę na `/dashboard` przenieść na trasę wnętrza; dodać kroki pilnujące nowego startu i przekierowania.

**Contract**:

- `:1914` kontrola warunków: `/dashboard` → `/wizyta` (lista ma dalej trzy różne trasy),
- `:2188` sesja z odnośnika resetu: `/dashboard` → `/leki`,
- `:2226–2227` po zmianie hasła: `/dashboard` → `/leki`, nazwa kroku bez „dashboard”,
- `:2688` niezalogowana: zastąpić krokiem „`/dashboard` przekierowuje na `/leki`” (302, `location: "/leki"`, `exact: true`),
- `:2691–2692` wariant `.html`: `/dashboard.html` → `/leki.html`,
- `:2713` zastąpić dwoma krokami: „`/` kieruje zalogowaną na `/leki`” (302, `location: "/leki"`, `exact: true`) i „`/leki` renderuje się dla zalogowanej” (200),
- `:2718` po wylogowaniu: `/dashboard` → `/leki`.

#### 5. Test kontroli warunków

**File**: `scripts/auth/terms-gate.test.mjs`

**Intent**: Usunąć `/dashboard` z list ścieżek wnętrza i wariantów `.html`, zastępując je istniejącą trasą wnętrza.

**Contract**: `INTERIOR_PATHS`: `/dashboard` → `/wizyta`; pętla wariantów: `/dashboard.html` → `/wizyta.html`.

#### 6. Galeria trybu ciemnego

**File**: `tests/e2e/dark-gallery.spec.ts`

**Intent**: Usunąć wpis `dashboard`; nazwy stanów mówiące o przekierowaniu na dashboard zmienić na `/leki`.

**Contract**: brak wpisu `page: "dashboard"`; stany `signed-in-redirects-to-leki` i `accepted-account-redirects-to-leki`.

#### 7. Reguły dla agentów

**File**: `CLAUDE.md`

**Intent**: Przykład strony chronionej wskazuje istniejący plik; zapisane, skąd bierze się start na `/leki` i czemu `/dashboard` przekierowuje — żeby nikt go nie przywrócił.

**Contract**: linia 90 (sekcja `### Auth`): przykład `src/pages/leki/index.astro`; jedno zdanie: start po zalogowaniu = `/leki` (`src/pages/index.astro`), `/dashboard` to wyłącznie przekierowanie 302 w `astro.config.mjs`, obsługiwane przez Cloudflare z `_redirects` przed Workerem (middleware go nie widzi).

### Success Criteria:

#### Automated Verification:

- Testy jednostkowe przechodzą: `npm test`
- Lint przechodzi: `npm run lint`
- Typy przechodzą: `npm run typecheck`
- Build przechodzi: `npm run build`
- Build zawiera regułę przekierowania: `grep -F "/dashboard /leki 302" dist/client/_redirects`
- Smoke przechodzi przeciw lokalnemu Supabase: `npm run smoke`
- Żadnego odwołania do `/dashboard` poza przekierowaniem, krokiem smoke i `CLAUDE.md`: `grep -rn dashboard src scripts tests astro.config.mjs CLAUDE.md`
- Test pokrycia galerii przechodzi: `DARK_GALLERY=1 npx playwright test tests/e2e/dark-gallery.spec.ts -g "every page in src/pages has an entry"`

#### Manual Verification:

- Logowanie w przeglądarce kończy się na liście leków
- Zakładka z `/dashboard` (zalogowana) otwiera listę leków
- `/dashboard` po wylogowaniu prowadzi do ekranu logowania

**Implementation Note**: Po zielonych bramkach automatycznych zatrzymaj się na potwierdzenie testów ręcznych przez autorkę.

---

## Faza 2: Test E2E — logowanie kończy się na liście leków

### Overview

Test w przeglądarce sprawdza całą drogę: formularz logowania → `/api/auth/signin` → `/` → `/leki`.

### Changes Required:

#### 1. Nowy test

**File**: `tests/e2e/signin-lands-on-medications.spec.ts`

**Intent**: Osoba bez zapisanej sesji loguje się przez formularz kontem z `.env.e2e` i widzi listę leków.

**Contract**: `test.use({ storageState: { cookies: [], origins: [] } })`; logowanie wzorcem `toPass()` z `tests/e2e/auth.setup.ts`; asercje: adres `/leki$`, nagłówek `h1` „Leki” (`getByRole("heading", { name: "Leki", level: 1 })`). Test nie tworzy danych, więc nie sprząta. Nagłówek komentarza nazywa ryzyko, jak w `seed.spec.ts`.

### Success Criteria:

#### Automated Verification:

- Test przechodzi przeciw lokalnemu Supabase: `npx playwright test tests/e2e/signin-lands-on-medications.spec.ts`
- Test pada, gdy `src/pages/index.astro` kieruje zalogowaną na inną trasę (zmiana tymczasowa, cofnięta przed commitem)
- Pełny zestaw E2E przechodzi: `npx playwright test`

#### Manual Verification:

- Autorka czyta test i potwierdza, że sprawdza to, co mówi jego nazwa

**Implementation Note**: Po zielonych bramkach automatycznych zatrzymaj się na potwierdzenie przez autorkę.

---

## Testing Strategy

### Unit Tests:

- `scripts/auth/terms-gate.test.mjs` — kontrola warunków na trasach wnętrza bez `/dashboard`.

### Integration Tests:

- Smoke: `/` → `/leki` dla zalogowanej, `/dashboard` → `/leki`, ochrona wnętrza (niezalogowana, `.html`, sesja z odnośnika resetu, po wylogowaniu, konto bez warunków) na istniejących trasach.
- E2E: logowanie formularzem kończy się na `/leki`.

### Manual Testing Steps:

1. Zaloguj się w przeglądarce — oczekiwany ekran: lista leków.
2. Wpisz `/dashboard` w pasek adresu — oczekiwany ekran: lista leków.
3. Wyloguj się i wpisz `/dashboard` — oczekiwany ekran: logowanie.

## References

- Roadmapa: `context/foundation/roadmap.md` — S-03
- Notatka przekazania M-2: `context/changes/m2-handoff.md`
- Wzorzec logowania w E2E: `tests/e2e/auth.setup.ts`
- Wzorzec testu ryzyka: `tests/e2e/seed.spec.ts`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Start na `/leki` i sprzątanie `/dashboard`

#### Automated

- [x] 1.1 Testy jednostkowe przechodzą: `npm test` — 5ce9a6f
- [x] 1.2 Lint przechodzi: `npm run lint` — 5ce9a6f
- [x] 1.3 Typy przechodzą: `npm run typecheck` — 5ce9a6f
- [x] 1.4 Build przechodzi: `npm run build` — 5ce9a6f
- [x] 1.5 Build zawiera regułę przekierowania: `grep -F "/dashboard /leki 302" dist/client/_redirects` — 5ce9a6f
- [x] 1.6 Smoke przechodzi przeciw lokalnemu Supabase: `npm run smoke` — 5ce9a6f
- [x] 1.7 Żadnego odwołania do `/dashboard` poza przekierowaniem, krokiem smoke i `CLAUDE.md` — 5ce9a6f
- [x] 1.8 Test pokrycia galerii przechodzi — 5ce9a6f

#### Manual

- [x] 1.9 Logowanie w przeglądarce kończy się na liście leków — 5ce9a6f
- [x] 1.10 Zakładka z `/dashboard` (zalogowana) otwiera listę leków — 5ce9a6f
- [x] 1.11 `/dashboard` po wylogowaniu prowadzi do ekranu logowania — 5ce9a6f

### Phase 2: Test E2E — logowanie kończy się na liście leków

#### Automated

- [x] 2.1 Test przechodzi przeciw lokalnemu Supabase
- [x] 2.2 Test pada, gdy `src/pages/index.astro` kieruje zalogowaną na inną trasę
- [x] 2.3 Pełny zestaw E2E przechodzi: `npx playwright test`

#### Manual

- [x] 2.4 Autorka czyta test i potwierdza, że sprawdza to, co mówi jego nazwa
