# Śledzenie błędów i monitor dostępności (F-06) — plan wdrożenia

## Overview

Każdy nieoczekiwany błąd serwera na produkcji ma docierać do autorki mailem przez Sentry. Dotyczy to wywrotki, odpowiedzi 5xx, błędu bazy zamienionego w ekran „nie udało się wczytać” i przerwania przez limit CPU (1102). Przerwa w działaniu ma docierać mailem w ciągu 15 minut, a darmowe Supabase nie może usnąć z braku ruchu. Raport błędu nie niesie danych o zdrowiu: wysyłamy wyłącznie pola z listy dozwolonych, a pilnuje tego test.

Źródło wymagań: `context/foundation/roadmap.md` F-06 (#74), `context/foundation/prd.md` `## Non-Functional Requirements` i `## Open Questions` pytanie 6.

## Current State Analysis

- Brak śledzenia błędów. `wrangler.jsonc` ma `observability.enabled`, ale logi darmowego planu żyją 3 dni i nic z nich nie powiadamia.
- Błędy bazy kod łapie sam. Trasy JSON zwracają kod z 500 (`src/pages/api/journal/index.ts:82-95`), trasy formularzy przekierowują z `?error=<kod>` (`src/pages/api/medications/index.ts:200-218`), a strony ustawiają `loadFailed` i oddają 200 (`src/pages/leki/index.astro:51-61`). Sam wyjątek z wywrotki nigdy tych miejsc nie opuszcza.
- Około 57 wywołań `console.error` w `src/`. Każde loguje tylko `{code}`, `{status}` albo `{name}`. Wyjątek: `src/pages/dzienniczek/[id].astro:104-106` i `src/pages/dzienniczek/nowy.astro:42-44` logują `error.message`, czyli nazwę kategorii objawu z katalogu.
- Wywrotkę zamieniłoby w 500 wyłącznie coś nieopakowane, np. `supabase.auth.getUser()` w `src/middleware.ts:28`. Nie ma `src/pages/500.astro`.
- Brak publicznej strony kontrolnej. Żadna migracja nie nadaje niczego roli `anon`, wszystkie granty idą do `authenticated`.
- Sekrety deklaruje `env.schema` w `astro.config.mjs` (`SUPABASE_URL`, `SUPABASE_KEY`), a czyta je `astro:env/server`. Deploy w CI nie ustawia sekretów, robi się to ręcznie przez `npx wrangler secret put`.
- `PRIVACY_COPY` w `src/lib/copy/terms.ts:53-77` wymienia Supabase, Cloudflare i Brevo. Komentarz przy :53 zapowiada dopisanie Sentry w F-06.

## Desired End State

- Wywrotka we frontmatterze strony, w trasie API albo w middleware oraz odpowiedź 5xx dowolnej trasy dają zgłoszenie w Sentry z nazwą trasy według wzorca (`/leki/[id]`). Nowy rodzaj błędu daje mail.
- Każde dawne miejsce `console.error` woła wspólną funkcję `reportError`, która loguje jak dotąd i wysyła zgłoszenie. Goły `console.error` w `src/` wywraca `npm test`.
- Zgłoszenie zawiera wyłącznie: rodzaj błędu, kod, etykietę miejsca, wzorzec trasy, ślad w kodzie (plik, funkcja, linia) i środowisko. Nie zawiera treści błędu, adresu, parametrów, nagłówków, ciasteczek, treści żądania, IP ani śladu działań.
- `GET /api/health` odpowiada `200 {"status":"ok"}`, gdy baza odpowiada, i `503 {"status":"unavailable"}`, gdy nie. Nie zwraca żadnych danych.
- Monitor dostępności Sentry sprawdza `/api/health` co 5 minut. Po 2 nieudanych próbach z rzędu wysyła mail.
- Zadanie Workera co 15 minut pyta statystyki Cloudflare o żądania przerwane limitem CPU. Jeśli takie były, zgłasza 1102 do Sentry. Każdy bieg melduje się w Sentry Crons, więc zadanie, które przestało działać, też daje mail.
- Strona `/prywatnosc` wymienia Sentry z informacją, że raporty błędów nie zawierają danych o zdrowiu.
- Pomiar LCP listy leków i zapisu objawu na produkcji zapisany w folderze zmiany.

### Key Discoveries:

- `@astrojs/cloudflare` eksportuje `./handler` (`node_modules/@astrojs/cloudflare/package.json`, `dist/utils/handler.js`). Domyślny `entrypoints/server.js` to tylko `{ fetch: handle }`, więc własny plik startowy może dołożyć `scheduled` bez utraty zachowania adaptera.
- Adapter wkłada do `locals.cfContext` kontekst wykonania Workera (`dist/utils/cf-helpers.js:23`). Zmienne środowiska czyta się przez `import { env } from "cloudflare:workers"`, `Astro.locals.runtime.env` zostało usunięte.
- Kontekst Astro ma `routePattern` (`node_modules/astro/dist/types/public/context.d.ts:583`), czyli trasę bez wartości parametrów.
- Wspierane przez Sentry połączenie Astro z Cloudflare wymaga dwóch paczek SDK i domyślnie zbiera adres z parametrami, nagłówki, ciasteczka, treść żądania i IP (docs.sentry.io, `cloudflare/data-management/data-collected`). Dlatego wysyłka idzie przez własną funkcję.
- Błędu 1102 nie da się zgłosić z wnętrza Workera, bo izolat zostaje zabity. Tail Workers i Logpush są tylko na planie płatnym. Darmowy plan ma Cron Triggers i API statystyk (GraphQL), więc stąd idzie odczyt.
- Darmowy Sentry: 1 monitor dostępności (odstęp 1–60 min, liczba porażek do alarmu do ustawienia), 5 tys. zgłoszeń miesięcznie, region EU wybierany wyłącznie przy zakładaniu organizacji.
- Supabase usypia projekt przy braku aktywności bazy przez tydzień. Wystarczy zapytanie przez PostgREST dochodzące do Postgresa (supabase.com/docs/guides/platform/free-project-pausing).
- `scripts/db-checks.mjs` sam bierze każdy `supabase/tests/*.sql`, więc nowy plik testu SQL nie wymaga rejestracji.

## What We're NOT Doing

- Sentry w przeglądarce. Odrzucone w PRD, pytanie 6.
- Paczki `@sentry/astro` i `@sentry/cloudflare`. Wybrana własna funkcja z listą dozwolonych pól.
- Śledzenie wydajności (spany, `tracesSampleRate`), ślad działań (breadcrumbs), dane użytkownika i wersja wdrożenia (`release`) w zgłoszeniu.
- Wysyłanie map źródeł do Sentry. Ślad dotyczy zbudowanego pliku.
- Zgłaszanie oczekiwanych błędów: walidacja, zamknięte okno korekty, brak dostępu, nieprawidłowe logowanie. To odpowiedzi na ruch użytkowniczki, nie awarie. Zgłaszane są tylko miejsca, które dziś mają `console.error`.
- Wywrotka komponentu podrzędnego w trakcie strumieniowania strony. Status 200 jest już wysłany, błąd idzie do `controller.error` (`astro/dist/runtime/server/render/astro/render.js:62-73`) i nie odrzuca `next()`, więc warstwa middleware go nie widzi. Do `/10x-observability-audit`.
- Przeszukiwanie cichych ścieżek bez żadnego logu (np. `src/pages/api/auth/signin.ts:21-22`). To zadanie `/10x-observability-audit`, osobno.
- Mail przy każdym wystąpieniu i reguła na skok liczby zgłoszeń.
- Płatny plan Workers, Tail Worker i Logpush.
- Lighthouse w CI. Pomiar jest jednorazowy i ręczny. Ekran z S-08 mierzy S-08.
- Krok smoke z fałszywym odbiorcą Sentry i trasą testową.
- Poprawki szybkości. Jeśli pomiar przekroczy 2,5 s, powstaje nowa pozycja roadmapy.

## Implementation Approach

Mały moduł `src/lib/observability/` dzieli się na część czystą (składanie zgłoszenia, przetwarzanie DSN, koperta Sentry, okno czasowe zadania 1102), testowaną w `node --test`, i cienką część runtime, która czyta `SENTRY_DSN` i oddaje wysyłkę do `waitUntil`. Middleware dostaje zewnętrzną warstwę przez `sequence()`, więc łapie także wywrotkę w obecnej logice middleware. Kolejność faz: najpierw kod bez produkcyjnego efektu (bez `SENTRY_DSN` nic nie wychodzi), potem strona kontrolna i zadanie 1102, na końcu ręczne wdrożenie w ustalonej kolejności: strona prywatności przed pierwszym sekretem.

## Critical Implementation Details

- **Kolejność przy wdrożeniu**: strona prywatności z Sentry trafia na produkcję przed `wrangler secret put SENTRY_DSN`. Bez DSN funkcja niczego nie wysyła, więc kod z faz 1–4 może wejść wcześniej, a strona mówi prawdę w każdej chwili. Migracja z fazy 3 musi przejść przez `db push` przed włączeniem monitora, inaczej monitor od razu zobaczy 503.
- **Zgłoszenie nie blokuje odpowiedzi**: wysyłka idzie przez `waitUntil` i nigdy nie rzuca. Błąd wysyłki kończy się `console.warn` bez treści. Wywrotka w raportowaniu nie może zamienić działającej odpowiedzi w 500.
- **Opóźnienie statystyk Cloudflare**: dane trafiają do API z kilkuminutowym opóźnieniem. Okno zadania 1102 jest przesunięte wstecz o stały margines i wyrównane do harmonogramu, żeby kolejne okna nie miały luk ani nakładek.
- **Podwójne zgłoszenie przy 500 z trasy JSON**: trasa woła `reportError` i zwraca 500, a middleware zgłasza ten sam 500 jako odpowiedź 5xx. Przyjęte świadomie: oba trafiają do osobnych grup w Sentry (różny `fingerprint`), mail przychodzi raz na grupę. Deduplikacja przez stan żądania byłaby większym kodem niż zysk.

## Phase 1: Funkcja zgłaszająca i middleware

### Overview

Funkcja składająca zgłoszenie z listy dozwolonych pól, wysyłka do Sentry i zewnętrzna warstwa middleware łapiąca wywrotki i odpowiedzi 5xx. Bez `SENTRY_DSN` wszystko kończy się na logu.

### Changes Required:

#### 0. Typy runtime Workera

**File**: `worker-configuration.d.ts`, `package.json`

**Intent**: Dać TypeScriptowi typy `cloudflare:workers` i globali `ExportedHandler`, `Env`, `ExecutionContext`. Bez nich `npm run typecheck` pada na `TS2307: Cannot find module 'cloudflare:workers'` (zmierzone w plan-review F1).

**Contract**:

- Plik generowany przez `npx wrangler types`, commitowany do repozytorium.
- `tsconfig.json` bez zmian: `"include": ["**/*"]` obejmuje plik w katalogu głównym.
- Nowy skrypt `"cf-typegen": "wrangler types"` w `package.json`.
- Przegenerowanie po każdej zmianie zmiennych, sekretów albo `compatibility_date` w `wrangler.jsonc` — w tej zmianie po fazie 4 (nowe sekrety i `main`).

#### 1. Składanie i wysyłka zgłoszenia (część czysta)

**File**: `src/lib/observability/error-report.ts`

**Intent**: Złożyć zdarzenie Sentry wyłącznie z pól dozwolonych i wysłać je kopertą. Treść błędu nie wchodzi nigdy, bo może zawierać nazwę leku, substancji, dawkę albo wartości wiersza z komunikatu Postgresa.

**Contract**:

- `buildErrorEvent(input: { where: string; code?: string | number; error?: unknown; route?: string; environment: string; now: Date; eventId: string }): SentryEvent`.
- Klucze najwyższego poziomu dokładnie: `event_id`, `timestamp`, `platform`, `level`, `environment`, `tags`, `fingerprint`, `exception`.
- `tags` zawiera wyłącznie `where`, `code`, `route`.
- `exception.values[0]` ma `type` (nazwa klasy błędu albo `"NonError"`), stałe `value: "redacted"` i `stacktrace.frames`, w którym każda ramka ma wyłącznie `filename` (bez części zapytania), `function`, `lineno` i `colno`.
- `fingerprint` to `[where, String(code ?? ""), type, route ?? ""]`. Trasa w grupie sprawia, że ten sam błąd na innej trasie otwiera nową grupę i daje mail.
- `parseDsn(dsn: string): { host, projectId, publicKey } | null`.
- `buildEnvelope(event, dsn): { url, headers, body }`. Adres `https://<host>/api/<projectId>/envelope/`, nagłówek `X-Sentry-Auth` z `sentry_key`.
- `sendEvent(envelope, fetchImpl): Promise<void>` nigdy nie odrzuca.
- Moduł nie importuje `astro:*` ani `cloudflare:*`, żeby `node --test` go ładował.

#### 2. Część runtime

**File**: `src/lib/observability/report.ts`

**Intent**: Jeden punkt, który woła reszta kodu. Loguje jak dotychczas i, gdy jest `SENTRY_DSN`, wysyła zgłoszenie w tle.

**Contract**:

- `reportError(where: string, details?: { code?: string | number; status?: number; error?: unknown; route?: string }): void`.
- Loguje `console.error(where, { code, status, name })`. To jedyne dozwolone `console.error` w `src/`.
- Do `buildErrorEvent` przekazuje `code: details.code ?? details.status`. Osobnego pola `status` w zgłoszeniu nie ma.
- Wysyłkę oddaje do `waitUntil` z `cloudflare:workers`. Jeśli ten eksport nie istnieje w używanej wersji runtime, użyć `locals.cfContext.waitUntil` przekazywanego w `details`; implementer rozstrzyga pomiarem przy buildzie.
- `environment` pochodzi z `SENTRY_ENVIRONMENT` (sekcja #3). Nie z `import.meta.env.DEV`: `npm run preview` uruchamia zbudowaną aplikację, gdzie `DEV` to `false`, więc lokalne zgłoszenie trafiłoby do Sentry jako produkcyjne.
- `where` to etykieta stała, np. `"medications.create"`.

#### 3. Sekret DSN

**File**: `astro.config.mjs`

**Intent**: Zadeklarować DSN jak pozostałe sekrety.

**Contract**:

- `SENTRY_DSN: envField.string({ context: "server", access: "secret", optional: true })`. Brak wartości oznacza tylko log, nigdy błąd.
- `SENTRY_ENVIRONMENT: envField.string({ context: "server", access: "public", optional: true, default: "production" })`. Produkcja nie ustawia nic. Lokalnie `SENTRY_ENVIRONMENT=local` w `.dev.vars` i w `.env.example` (z komentarzem, że to wartość dla maszyny deweloperskiej).

#### 4. Warstwa middleware

**File**: `src/middleware.ts`

**Intent**: Złapać każdą wywrotkę i każdą odpowiedź 5xx, także z obecnej logiki middleware (`auth.getUser()` bez try/catch).

**Contract**:

- Obecna funkcja staje się nazwaną warstwą, a eksport to `onRequest = sequence(reportServerErrors, <obecna logika>)`.
- `reportServerErrors` przy wyjątku z `next()` woła `reportError("request.exception", { error, route: context.routePattern })` i rzuca dalej, żeby Astro oddał swoją odpowiedź 500.
- Przy `response.status >= 500` woła `reportError("request.5xx", { status, route })`, z wyjątkiem `context.routePattern === "/api/health"`: jej 503 to zamierzony sygnał dla monitora dostępności (faza 3), a drugi mail o tej samej awarii byłby szumem. Wywrotka tej trasy (wyjątek z `next()`) jest zgłaszana jak każda inna.
- Nie czyta `context.url`, nagłówków, ciasteczek ani treści żądania.

#### 5. Test prywatności zgłoszenia

**File**: `scripts/observability/error-report.test.mjs`

**Intent**: Dowieść, że nazwa leku nie wychodzi w żadnym polu i że zgłoszenie nie ma pól spoza listy (wymóg roadmapy: test, nie komentarz).

**Contract**:

- Wejście: błąd z treścią `"Ibuprofen 400 mg"`, błąd z własnym polem `details` zawierającym tę nazwę, ślad z `filename` zawierającym `?q=Ibuprofen`, `route: "/leki/[id]"`.
- Asercje:
  - zserializowana koperta nie zawiera `Ibuprofen` ani `400 mg`,
  - klucze najwyższego poziomu, `tags` i ramek równe dokładnie liście dozwolonych,
  - `value === "redacted"`,
  - wartość niebędąca `Error` (string, `null`) daje `type: "NonError"`,
  - ten sam `where`, `code` i typ błędu z `route: "/leki"` i `route: "/dzienniczek"` dają różne `fingerprint`,
  - `code: 503` ląduje w `tags.code` i w `fingerprint`,
  - `parseDsn` odrzuca niepoprawny DSN i zwraca `null` zamiast rzucać,
  - `sendEvent` z `fetch`, które rzuca albo zwraca 500, kończy się bez odrzucenia.

### Success Criteria:

#### Automated Verification:

- Test zgłoszenia przechodzi: `node --experimental-strip-types --test scripts/observability/error-report.test.mjs`
- Pełny zestaw testów przechodzi: `npm test`
- Typy przechodzą: `npm run typecheck`
- Lint przechodzi: `npm run lint`
- Build przechodzi: `npm run build`

#### Manual Verification:

- Lokalnie (`npm run preview` po `npx astro preview stop`) bez `SENTRY_DSN` aplikacja działa jak dotąd: logowanie, lista leków, zapis objawu

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Phase 2: Podmiana console.error na reportError

### Overview

Każde dawne `console.error` w `src/` zgłasza błąd. Test pilnuje, że nowy kod nie ominie zgłaszania i że etykieta miejsca nie niesie danych.

### Changes Required:

#### 1. Podmiana wywołań

**File**: wszystkie pliki z `console.error` w `src/` poza `src/lib/observability/`. Lista około 57 miejsc w `src/middleware.ts`, `src/lib/services/*`, `src/pages/leki/**`, `src/pages/dzienniczek/**`, `src/pages/api/**`.

**Intent**: Zamienić `console.error("<opis>", { code })` na `reportError("<obszar>.<czynność>", { code, route })`, zachowując przekazywane dziś pola.

**Contract**:

- Pierwszy argument to literał tekstowy, kropkowa etykieta po angielsku.
- Pola przekazywane: wyłącznie `code`, `status` i `error`.
- Żadne wywołanie `reportError` w module importowanym przez `scripts/**` (dziś żaden z plików z `console.error` nim nie jest). Granica zapisana w `CLAUDE.md` w fazie 5.
- `src/pages/dzienniczek/[id].astro:104-106` i `src/pages/dzienniczek/nowy.astro:42-44` przestają przekazywać `error.message` i przekazują `error`, z którego `buildErrorEvent` bierze tylko typ i ślad.
- Zachowanie widoczne dla użytkowniczki (przekierowania, `loadFailed`, kody JSON) bez zmian.
- Jedno nowe miejsce zgłoszenia, wyjątek od reguły „tylko dawne `console.error`”: `supabase.auth.getUser()` w `src/middleware.ts:26-28` dziś ignoruje `error`. Przy awarii usługi logowania nie rzuca, tylko zwraca `AuthRetryableFetchError`, a zalogowana osoba ląduje po cichu na ekranie logowania. Dopisać `reportError("auth.get-user", { code: error.code, status: error.status })`, gdy `isAuthRetryableFetchError(error)` albo `error.status >= 500`. Nie zgłaszać `AuthSessionMissingError` ani 4xx (wygasła albo nieważna sesja to zwykły ruch, nie awaria). Zachowanie (przekierowanie na logowanie) bez zmian.

#### 2. Test zakazu

**File**: `scripts/observability/report-usage.test.mjs`

**Intent**: Goły `console.error` w `src/` i etykieta niebędąca literałem wywracają `npm test`. Wzorzec skanowania przez TypeScript compiler API jak w `scripts/pages/url-params.test.mjs`.

**Contract**:

- Brak wywołań `console.error` w `src/**/*.{ts,tsx,astro}` poza `src/lib/observability/`.
- Każde wywołanie `reportError` ma pierwszy argument będący literałem tekstowym (nie szablonem z `${}`) pasującym do `^[a-z][a-z0-9-]*(\.[a-z0-9-]+)+$`.
- Test ma przypadek negatywny na wbudowanym fragmencie kodu, żeby dowieść, że skaner wykrywa naruszenie (lesson „Bramka musi odróżnić blokadę od niewykonania”).

### Success Criteria:

#### Automated Verification:

- Test zakazu przechodzi: `node --experimental-strip-types --test scripts/observability/report-usage.test.mjs`
- `grep -rn "console.error" src --include='*.ts' --include='*.tsx' --include='*.astro' | grep -v src/lib/observability` nic nie zwraca (wzorce w cudzysłowie: zsh przerywa niecytowane `*.ts` błędem `no matches found` i pusty wynik udaje PASS)
- Pełny zestaw testów przechodzi: `npm test`
- Typy, lint i build przechodzą: `npm run typecheck && npm run lint && npm run build`
- Smoke przechodzi przeciw lokalnemu Supabase: `npm run smoke` (po odsunięciu `.env` i zatrzymaniu starego podglądu)

#### Manual Verification:

- Przygotowanie, w tej kolejności: (1) odsuń `.env` (wskazuje produkcję i przykrywa `.dev.vars`), (2) `npx astro preview stop` i nowy `npm run preview`, (3) zaloguj się i potwierdź świeży wiersz w lokalnym `auth.users`. Potem: po lokalnym `revoke select on public.medications from authenticated` (psql do lokalnego kontenera, przywrócenie przez `npx supabase db reset`) wejście na `/leki` pokazuje „nie udało się wczytać”, a log podglądu zawiera etykietę `reportError` z kodem, bez nazw leków. Zatrzymanie całego Supabase tu nie działa: middleware nie odczyta sesji i przekieruje na logowanie

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: Strona kontrolna

### Overview

Publiczna trasa dotykająca bazy bez sesji i bez tabel. Cel monitora dostępności i ruch utrzymujący Supabase przy życiu.

### Changes Required:

#### 1. Funkcja w bazie

**File**: `supabase/migrations/20261013120000_health_ping.sql`

**Intent**: Dać roli `anon` jedno zapytanie, które dochodzi do Postgresa i nie czyta żadnej tabeli. Katalog objawów i rejestr nie dostają polityk dla `anon` (roadmapa F-06, Unknowns).

**Contract**:

- `public.health_ping() returns integer`, `language sql`, `stable`, `security invoker`, `set search_path = ''`, ciało `select 1`.
- `revoke execute ... from public`, `grant execute ... to anon, authenticated`.
- Nowa tabela nie powstaje, więc RLS nie dotyczy.

#### 2. Test SQL

**File**: `supabase/tests/health_ping_checks.sql`

**Intent**: Bramka, że `anon` może wywołać funkcję, a funkcja nie daje więcej niż stałą.

**Contract**:

- Jako `anon` `select public.health_ping()` zwraca `1`.
- Funkcja ma `prosecdef = false`.
- `pg_depend` nie wiąże funkcji z żadną relacją.
- Kończy się markerem `GATE_COMPLETE health_ping` zgodnie z `scripts/db-checks.mjs`.

#### 3. Trasa

**File**: `src/pages/api/health.ts`

**Intent**: Odpowiedzieć stanem bez danych.

**Contract**:

- `export const prerender = false`, `export const GET`.
- Klient Supabase bez ciasteczek sesji woła `rpc("health_ping")`.
- Odpowiedź `200 {"status":"ok"}` albo `503 {"status":"unavailable"}` (także gdy Supabase nie jest skonfigurowane), `content-type: application/json`, `cache-control: no-store`.
- Bez parametrów adresu.
- Porażki nie zgłasza przez `reportError`, bo alarm daje monitor i drugi mail o tym samym byłby szumem.
- Trasa nie trafia do `INTERIOR_ROUTES`.

#### 4. Krok smoke

**File**: `scripts/smoke.mjs`

**Intent**: Dowieść publicznej dostępności i braku danych w odpowiedzi.

**Contract**:

- Krok bez sesji: `GET /api/health` zwraca 200, treść dokładnie `{"status":"ok"}`, nagłówek `cache-control` zawiera `no-store`.
- Dopisany do `steps` jak pozostałe grupy.

### Success Criteria:

#### Automated Verification:

- Migracja wchodzi czysto: `npx supabase db reset`
- Bramki SQL przechodzą, w tym nowa: `npm run db:check`
- Smoke przechodzi z nowym krokiem: `npm run smoke`
- Pełny zestaw testów, typy, lint i build przechodzą: `npm test && npm run typecheck && npm run lint && npm run build`

#### Manual Verification:

- Przy zatrzymanym lokalnym Supabase `curl -i http://localhost:4321/api/health` zwraca 503 z `{"status":"unavailable"}`

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 4: Zadanie 1102

### Overview

Najpierw pomiar, czy darmowy plan daje odczyt statystyk. Od wyniku zależy, czy faza idzie dalej. Potem własny plik startowy Workera z zadaniem co 15 minut.

### Changes Required:

#### 0. Pomiar przed kodem (bramka fazy)

**Intent**: Potwierdzić na koncie autorki, że GraphQL Analytics API zwraca liczbę wywołań Workera `lekomapa` według statusu, w tym `exceededResources`, z tokenem o samym prawie „Account Analytics: Read”.

**Contract**:

- Jedno zapytanie `curl` do `https://api.cloudflare.com/client/v4/graphql` o `workersInvocationsAdaptive` z filtrem `scriptName` i zakresem czasu, grupowane po `status`.
- Token przekazuje autorka przez `!` w sesji, nie zapisujemy go w repozytorium.
- **Jeśli zapytanie jest niedostępne na darmowym planie, faza zatrzymuje się i decyzja o 1102 wraca do autorki.**

#### 1. Logika zadania (część czysta)

**File**: `src/lib/observability/exceeded-cpu.ts`

**Intent**: Policzyć okno, złożyć zapytanie i rozstrzygnąć, co zgłosić.

**Contract**:

- `checkWindow(scheduledTime: number): { start: Date; end: Date }`. Okno 15 minut wyrównane do harmonogramu, przesunięte wstecz o 5 minut opóźnienia danych. Kolejne okna przylegają bez luk.
- `buildQuery(accountId, scriptName, window)` składa zapytanie GraphQL.
- `decide(result): { kind: "exceeded"; count: number } | { kind: "none" } | { kind: "check-failed"; code: string }`.
- Błąd HTTP, `errors` w odpowiedzi GraphQL albo brak oczekiwanego pola to `check-failed`, nigdy `none` (lesson „Bramka musi odróżnić blokadę od niewykonania”).
- `buildCheckInEnvelope(input: { slug: string; status: "in_progress" | "ok" | "error"; checkInId: string; environment: string; duration?: number }, dsn): { url, headers, body }`. Element koperty typu `check_in`; ładunek ma wyłącznie `check_in_id`, `monitor_slug`, `status`, `environment` i opcjonalnie `duration`. Bez `monitor_config`: monitor nie powstaje sam przy pierwszym meldunku, zakłada go autorka (faza 5 krok 5). Adres i nagłówek `X-Sentry-Auth` jak w `buildEnvelope` z fazy 1.

#### 2. Plik startowy Workera

**File**: `src/worker.ts`, `wrangler.jsonc`

**Intent**: Zachować obsługę żądań adaptera i dołożyć zadanie zaplanowane.

**Contract**:

- `export default { fetch: handle, scheduled }`, gdzie `handle` pochodzi z `@astrojs/cloudflare/handler`.
- `scheduled` przez `ctx.waitUntil`: zapytanie, a potem:
  - `exceeded` daje `buildErrorEvent({ where: "cron.exceeded-cpu", code: 1102 })` z liczbą w tagu `count`; to jedyne dodatkowe pole, dopisane do listy dozwolonych i testu z fazy 1,
  - `check-failed` daje `where: "cron.exceeded-cpu-check-failed"`.
- Każdy bieg wysyła przez `buildCheckInEnvelope` check-in Sentry Crons (`in_progress`, potem `ok` albo `error` z tym samym `checkInId`) dla monitora `exceeded-cpu-check`, żeby zadanie, które przestało działać, dało mail. Darmowy Sentry ma 1 monitor Crons; jeśli w fazie 5 okaże się niedostępny, check-in pozostaje bez skutku i nie wywraca zadania.
- Sekrety czytane z parametru `env`: `SENTRY_DSN`, `CLOUDFLARE_ANALYTICS_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`.
- `wrangler.jsonc`: `main: "./src/worker.ts"`, `triggers: { crons: ["*/15 * * * *"] }`.

#### 3. Testy

**File**: `scripts/observability/exceeded-cpu.test.mjs`

**Intent**: Pokryć okno, decyzję i kopertę check-in.

**Contract**:

- Dwa kolejne wywołania `checkWindow` dla czasów oddalonych o 15 minut dają przylegające okna.
- Wynik z liczbą 0 daje `none`, z liczbą 3 daje `exceeded` z `count: 3`.
- Odpowiedź z `errors`, odpowiedź bez pola i błąd sieci dają `check-failed`.
- `buildCheckInEnvelope`: klucze ładunku równe dokładnie liście dozwolonych (z `duration` i bez), brak `monitor_config`, `monitor_slug === "exceeded-cpu-check"`.

### Success Criteria:

#### Automated Verification:

- Testy zadania przechodzą: `node --experimental-strip-types --test scripts/observability/exceeded-cpu.test.mjs`
- Pełny zestaw testów, typy, lint i build przechodzą: `npm test && npm run typecheck && npm run lint && npm run build`
- Zbudowany `dist/server/wrangler.json` ma `triggers.crons` z `*/15 * * * *`
- Smoke przechodzi na buildzie z nowym plikiem startowym: `npm run smoke`

#### Manual Verification:

- Pomiar z kroku 0 pokazał dostępność `workersInvocationsAdaptive` z podziałem na `status` na darmowym planie
- `npm run preview` (po `npx astro preview stop`) z fałszywym `CLOUDFLARE_ANALYTICS_TOKEN` w `.dev.vars` i `curl "http://localhost:4321/cdn-cgi/local/scheduled"` kończy się logiem `cron.exceeded-cpu-check-failed`, nie `none`. Projekt działa przez `@cloudflare/vite-plugin`, więc `wrangler dev --test-scheduled` i `/__scheduled` tu nie dotyczą

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 5: Wdrożenie produkcyjne

### Overview

Kroki poza kodem plus wpis na stronie prywatności. Kolejność ma znaczenie i jest zapisana w krokach poniżej.

### Changes Required:

#### 1. Strona prywatności

**File**: `src/lib/copy/terms.ts`

**Intent**: Wymienić Sentry jako odbiorcę raportów błędów, zanim dostanie pierwsze zgłoszenie.

**Contract**:

- Nowy punkt w sekcji „Gdzie leżą dane” (`PRIVACY_COPY`): raporty błędów serwera trafiają do Sentry (region UE, Frankfurt) i nie zawierają danych o zdrowiu, adresów stron ani danych konta.
- Usunięty komentarz zapowiadający F-06 (:53).
- Tekst neutralny (lesson o filtrze języka); jeśli `scripts/` ma test treści strony prywatności, aktualizowany razem.

#### 2. Kroki ręczne, w tej kolejności

**Intent**: Uruchomić odbiór zgłoszeń i alarmy, mierząc każdy krok zamiast sprawdzać samą obecność ustawienia.

**Contract**:

1. Merge faz 1–5 (kod), deploy przez CI. Strona `/prywatnosc` na produkcji wymienia Sentry.
2. `npx supabase db push`, potem `npx supabase migration list` pokazuje `20261013120000` po obu stronach (lesson „Po merge'u migracji wykonaj db push”). `curl -i https://lekomapa.pl/api/health` zwraca 200.
3. Konto Sentry: organizacja w regionie **EU** (nie da się zmienić później), projekt platformy JavaScript. W ustawieniach organizacji włączone „Data Scrubber” i „Prevent Storing of IP Addresses”.
4. Sprawdzenie prywatności na prawdziwym zgłoszeniu:
   - przygotowanie, w tej kolejności: (1) odsuń `.env` — wskazuje produkcję i przykrywa `.dev.vars`, więc bez tego nazwa leku trafiłaby do produkcyjnej bazy, a `revoke` na lokalnej nic by nie zmienił, (2) `npx astro preview stop`, (3) potwierdź świeży wiersz w lokalnym `auth.users` po zalogowaniu (lesson „Lokalne bramki sprawdź…”),
   - lokalny `npm run preview` z `SENTRY_DSN` w `.dev.vars` i lokalnym `revoke insert on public.medications from authenticated` (przywrócenie przez `npx supabase db reset`),
   - dodanie leku o nazwie „Ibuprofen 400 mg” przez formularz, co kończy się błędem zapisu i `reportError`,
   - w Sentry zgłoszenie z `environment: local`, a jego JSON (przycisk „JSON”) nie zawiera nazwy, adresu, nagłówków ani IP,
   - wynik zapisany w `context/changes/production-observability/verification.md`,
   - na koniec `npx supabase db reset`, usunięcie `SENTRY_DSN` z `.dev.vars` i przywrócenie `.env`.
5. Monitor Crons `exceeded-cpu-check` założony ręcznie w Sentry (harmonogram `*/15 * * * *`, UTC), zanim zadanie zacznie meldować — kod nie wysyła `monitor_config`, więc meldunek do nieistniejącego monitora przepada. Token Cloudflare z samym prawem „Account Analytics: Read”. `npx wrangler secret put` dla `SENTRY_DSN`, `CLOUDFLARE_ANALYTICS_TOKEN` i `CLOUDFLARE_ACCOUNT_ID`.
6. Potwierdzenie niepustych wartości w runtime (lesson o sekretach): w ciągu 30 minut w Sentry Crons pojawia się check-in `ok` z produkcji. Obecność sekretu na liście nie jest dowodem.
7. Monitor dostępności: `GET https://lekomapa.pl/api/health`, co 5 minut, alarm po 2 porażkach z rzędu, mail do autorki.
8. Reguła maili: nowe zgłoszenie (new issue) i zgłoszenie powracające (regression), akcja e-mail. Alarm monitora Crons (założonego w kroku 5) przy pominiętym albo nieudanym check-inie.
9. Narzut CPU: w panelu Cloudflare (Workers → lekomapa → Metrics) mediana i p99 czasu CPU z 24 godzin przed i po wdrożeniu, zapisane w `verification.md`. Wzrost p99 powyżej 10 ms to sygnał do decyzji, nie poprawka w tej zmianie.

#### 3. Dokumentacja

**File**: `context/foundation/infrastructure.md`, `README.md`, `CLAUDE.md`

**Intent**: Zapisać nowe sekrety, plik startowy Workera i regułę `reportError`, żeby następna zmiana jej nie ominęła.

**Contract**:

- `infrastructure.md`: wiersz ryzyka uśpienia Supabase (:120) i 1102 (:113) z opisem działającego mechanizmu; sekcja logów z Sentry i cotygodniowym przeglądem.
- `README.md` (sekcja sekretów przy :240): trzy nowe sekrety.
- `CLAUDE.md` `### Konwencje kodu`: nieoczekiwany błąd zgłaszaj przez `reportError` z `@/lib/observability/report`, etykieta stała, nigdy treść błędu. `reportError` wyłącznie w trasach (`src/pages/**`), middleware i serwisach `*-data` — `report.ts` importuje `cloudflare:workers`, którego `node --test` nie ładuje, więc wywołanie w module importowanym przez `scripts/**` (np. `src/lib/services/journal.ts`, `src/lib/navigation.ts`) wywraca `npm test` i smoke. `wrangler.jsonc` `main` wskazuje `src/worker.ts`. Po zmianie zmiennych, sekretów albo `compatibility_date` w `wrangler.jsonc` uruchom `npm run cf-typegen` i commituj `worker-configuration.d.ts`.

### Success Criteria:

#### Automated Verification:

- Pełny zestaw testów, typy, lint i build przechodzą: `npm test && npm run typecheck && npm run lint && npm run build`
- `npx supabase migration list` pokazuje `20261013120000` lokalnie i zdalnie
- `curl -s https://lekomapa.pl/api/health` zwraca `{"status":"ok"}`

#### Manual Verification:

- `/prywatnosc` na produkcji wymienia Sentry przed ustawieniem `SENTRY_DSN`
- Organizacja Sentry w regionie EU, Data Scrubber i ochrona IP włączone
- JSON prawdziwego zgłoszenia z nazwą leku w formularzu nie zawiera nazwy, adresu, nagłówków ani IP (zapis w `verification.md`)
- Check-in `ok` z produkcji widoczny w Sentry Crons
- Monitor dostępności ustawiony (5 minut, 2 porażki) i mail przychodzi przy wymuszonej porażce, np. tymczasowo błędny adres monitora
- Reguła maili: nowe i powracające zgłoszenie
- Narzut CPU zmierzony i zapisany w `verification.md`

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 6: Pomiar szybkości

### Overview

Jednorazowy pomiar progu LCP ≤ 2,5 s z PRD na dwóch ekranach należących do F-06.

### Changes Required:

#### 1. Wynik pomiaru

**File**: `context/changes/production-observability/performance.md`

**Intent**: Zapisać dowód progu albo jego przekroczenia.

**Contract**:

- Lighthouse w Chrome DevTools, tryb Mobile, na produkcji, zalogowane konto z danymi przykładowymi (co najmniej 5 leków, 10 wpisów).
- Ekrany: `/leki` i `/dzienniczek/nowy`.
- Po 3 pomiary na ekran, zapisana mediana LCP, data i wersja wdrożenia.
- Przekroczenie 2,5 s to nowa pozycja roadmapy, bez poprawki w tej zmianie.

### Success Criteria:

#### Manual Verification:

- LCP `/leki` zmierzony i zapisany w `performance.md`
- LCP `/dzienniczek/nowy` zmierzony i zapisany w `performance.md`
- Przy przekroczeniu 2,5 s dopisana pozycja w `context/foundation/roadmap.md`

---

## Testing Strategy

### Unit Tests:

- `error-report.test.mjs`: lista dozwolonych pól, brak nazwy leku w kopercie, `NonError`, odporność `parseDsn` i `sendEvent`.
- `report-usage.test.mjs`: zakaz gołego `console.error`, etykieta jako literał, przypadek negatywny skanera.
- `exceeded-cpu.test.mjs`: przyleganie okien, trzy wyniki decyzji, `check-failed` zamiast `none` przy każdej porażce odczytu.

### Integration Tests:

- `supabase/tests/health_ping_checks.sql`: `anon` wywołuje funkcję, funkcja nie zależy od żadnej relacji.
- Krok smoke `/api/health`: 200, dokładna treść, `no-store`.

### Manual Testing Steps:

1. Lokalnie bez DSN aplikacja działa jak przed zmianą.
2. Lokalnie odebrane prawo odczytu `medications`: `/leki` pokazuje „nie udało się wczytać”, log zawiera etykietę i kod. Zatrzymane lokalne Supabase: `/api/health` zwraca 503.
3. Prawdziwe zgłoszenie z nazwą leku w formularzu ogląda się w JSON w Sentry.
4. Wymuszona porażka monitora daje mail.

## Performance Considerations

- Zgłoszenie nie dokłada pracy przy zwykłym żądaniu: składanie tylko przy błędzie, wysyłka w `waitUntil`, bez SDK ładowanego przy starcie.
- Warstwa middleware to jedno porównanie statusu na żądanie.
- Zadanie 1102 to jedno zapytanie co 15 minut, czyli 96 biegów dziennie.
- Monitor to ok. 290 żądań dziennie.
- Łącznie poniżej 0,4% dziennego limitu 100 tys.

## Migration Notes

- `20261013120000_health_ping.sql` dodaje tylko funkcję i grant. Wycofanie: `drop function public.health_ping()`.
- Wycofanie całości:
  - usunąć sekret `SENTRY_DSN`, wtedy zostaje sam log,
  - przywrócić `main` adaptera w `wrangler.jsonc`, wtedy znika zadanie,
  - wyłączyć monitor w Sentry,
  - usunąć punkt z `PRIVACY_COPY`.

## References

- Roadmapa: `context/foundation/roadmap.md` F-06 (#74)
- PRD: `context/foundation/prd.md` `## Non-Functional Requirements`, `## Open Questions` pytanie 6
- Infrastruktura: `context/foundation/infrastructure.md:59`, `:113`, `:120`
- Wzorzec testu skanującego kod: `scripts/pages/url-params.test.mjs`
- Wzorzec bramki SQL: `scripts/db-checks.mjs`, `supabase/tests/*.sql`
- Adapter: `node_modules/@astrojs/cloudflare/dist/utils/handler.js`, `dist/utils/cf-helpers.js:23`
- Sentry: docs.sentry.io/platforms/javascript/guides/cloudflare/data-management/data-collected/, docs.sentry.io/product/uptime-monitoring/, docs.sentry.io/organization/data-storage-location/
- Cloudflare: developers.cloudflare.com/workers/platform/limits/, developers.cloudflare.com/workers/observability/logs/tail-workers/
- Supabase: supabase.com/docs/guides/platform/free-project-pausing

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Funkcja zgłaszająca i middleware

#### Automated

- [x] 1.1 Test zgłoszenia przechodzi
- [x] 1.2 Pełny zestaw testów przechodzi
- [x] 1.3 Typy przechodzą
- [x] 1.4 Lint przechodzi
- [x] 1.5 Build przechodzi

#### Manual

- [x] 1.6 Lokalnie bez SENTRY_DSN aplikacja działa jak dotąd

### Phase 2: Podmiana console.error na reportError

#### Automated

- [ ] 2.1 Test zakazu przechodzi
- [ ] 2.2 Brak console.error w src poza src/lib/observability
- [ ] 2.3 Pełny zestaw testów przechodzi
- [ ] 2.4 Typy, lint i build przechodzą
- [ ] 2.5 Smoke przechodzi przeciw lokalnemu Supabase

#### Manual

- [ ] 2.6 Przy odebranym prawie odczytu /leki pokazuje błąd, log ma etykietę i kod bez nazw leków

### Phase 3: Strona kontrolna

#### Automated

- [ ] 3.1 Migracja wchodzi czysto
- [ ] 3.2 Bramki SQL przechodzą, w tym nowa
- [ ] 3.3 Smoke przechodzi z nowym krokiem
- [ ] 3.4 Pełny zestaw testów, typy, lint i build przechodzą

#### Manual

- [ ] 3.5 Przy zatrzymanym Supabase /api/health zwraca 503

### Phase 4: Zadanie 1102

#### Automated

- [ ] 4.1 Testy zadania przechodzą
- [ ] 4.2 Pełny zestaw testów, typy, lint i build przechodzą
- [ ] 4.3 Zbudowany wrangler.json ma harmonogram co 15 minut
- [ ] 4.4 Smoke przechodzi na buildzie z nowym plikiem startowym

#### Manual

- [ ] 4.5 Pomiar dostępności statystyk na darmowym planie
- [ ] 4.6 Zadanie z fałszywym tokenem kończy się check-failed

### Phase 5: Wdrożenie produkcyjne

#### Automated

- [ ] 5.1 Pełny zestaw testów, typy, lint i build przechodzą
- [ ] 5.2 Migracja health_ping widoczna lokalnie i zdalnie
- [ ] 5.3 Produkcyjne /api/health zwraca status ok

#### Manual

- [ ] 5.4 Strona prywatności wymienia Sentry przed ustawieniem DSN
- [ ] 5.5 Organizacja Sentry w EU z ochroną danych
- [ ] 5.6 JSON prawdziwego zgłoszenia bez danych o zdrowiu
- [ ] 5.7 Check-in ok z produkcji w Sentry Crons
- [ ] 5.8 Monitor dostępności ustawiony i mail przychodzi
- [ ] 5.9 Reguła maili dla nowych i powracających zgłoszeń
- [ ] 5.10 Narzut CPU zmierzony i zapisany

### Phase 6: Pomiar szybkości

#### Manual

- [ ] 6.1 LCP /leki zmierzony i zapisany
- [ ] 6.2 LCP /dzienniczek/nowy zmierzony i zapisany
- [ ] 6.3 Przekroczenie progu dopisane do roadmapy
