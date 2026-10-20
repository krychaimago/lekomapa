# CLAUDE.md

Reguły dla agentów AI pracujących w tym repozytorium. `AGENTS.md` to symlink do tego pliku.

## Twarde reguły

Trzy rzeczy, których naruszenie kosztuje najwięcej. Kanoniczne brzmienie: @context/foundation/lessons.md — przy rozbieżności obowiązuje tamten plik, poniżej jest tylko skrót.

1. **Produkt informuje, nie diagnozuje** — nigdy „lek powoduje objaw", nigdy sugestia odstawienia lub zmiany dawki, nigdy porządkowanie leków wg podejrzenia. Szczegóły: `### Zasady komunikatów`.
2. **Historia nie kłamie** — zmiana dawki zamyka okres i otwiera nowy, rdzeń wpisu niemodyfikowalny poza oknem korekty, lek się kończy z datą odstawienia zamiast znikać. Szczegóły: `### Nienaruszalność historii`.
3. **RLS na każdej nowej tabeli** — polityki per-operacja i per-rola, od pierwszej migracji. To mechanizm izolacji danych zdrowotnych per-konto, nie opcja do odłożenia. Szczegóły: `### Konwencje kodu`.

## Projekt

Osobisty dzienniczek leków i objawów. Dokumenty źródłowe: `context/foundation/prd.md` (wymagania) i `context/foundation/shape-notes.md` (ustalenia z sesji planistycznej wraz z odrzuconymi wariantami). Przeczytaj PRD przed pracą nad funkcją — poniżej są tylko rzeczy, których w nim nie widać albo których naruszenie kosztuje najwięcej.

Nazwa produktu: **lekomapa**. Docelowy adres: `lekomapa.pl` (ustawiony jako `site` w `astro.config.mjs`). Repozytorium: `krychaimago/lekomapa`.

### Język

Ustalenia, dokumenty i rozmowa po polsku. Jedno źródło dokumentu — bez równoległych wersji językowych do pilnowania.

Kod wyłącznie po angielsku: nazwy zmiennych, funkcji, plików, komentarze, nazwy testów, komunikaty w konsoli skryptów. Po polsku zostaje tylko:
- tekst widoczny dla użytkowniczki (UI, komunikaty błędów, które mogą do niej trafić),
- dokumenty generowane dla autorki (np. raport `registry-measurement.md`),
- dane przepisane ze źródła bez zmian — nazwy pól i wartości z RPL (`produktLeczniczy`, `BRAK`). Nie tłumacz ich i nie zamieniaj na „ładniejsze” odpowiedniki: test ma pilnować tego, co naprawdę przychodzi ze źródła.

Kod F-01 sprzed tej reguły ma polskie komentarze (`src/types.ts`, migracja schematu leków) — do przetłumaczenia osobną decyzją, nie przy okazji.

### Zasady komunikatów (FR-012, nienegocjowalne)

Produkt informuje, nie diagnozuje:
- nigdy „lek powoduje objaw" — wyłącznie „może mieć związek",
- nigdy sugestia odstawienia leku ani zmiany dawki,
- nigdy porządkowanie leków według stopnia podejrzenia,
- przy każdej informacji o kolizji stała nota o charakterze poglądowym,
- brak ostrzeżenia nie oznacza „bezpieczne" i produkt musi to mówić wprost.

Powód: zbiór reguł jest z założenia niepełny, a zbieżność w czasie nie jest przyczynowością.

### Nienaruszalność historii

Zestawianie objawów z lekami działa na osi czasu, więc historia nie może kłamać:
- lek ma historię okresów dawkowania od–do; zmiana dawki zamyka okres i otwiera nowy zamiast nadpisywać poprzedni,
- rdzeń wpisu (substancja, dawka, data rozpoczęcia; w dzienniczku: data, godzina, objawy, nasilenie) jest niemodyfikowalny poza oknem korekty,
- lek się kończy z datą odstawienia, nie usuwa; trwałe usunięcie tylko dla pozycji dodanych przez pomyłkę.

### Jak pracować z autorką

QA, nie programuje jeszcze, ok. 4–5 h dziennie. Termin oddania 04.11.2026, zapasowe 06.12.2026 i 10.01.2027. `main` zawsze w stanie do oddania — każda pozycja M-2 osobnym PR-em, dopiero gdy skończona.

- Pisz zwięźle, najważniejsze rzeczy w bulletach. Długie bloki prozy rozbijają skupienie i kosztują zrozumienie — to nie preferencja stylu. Wyjątek: ostrzeżenia o operacjach nieodwracalnych oraz sekwencje wielokrokowe, gdzie skrót grozi pomyleniem kolejności — tam pisz pełnymi zdaniami i nie kompresuj.
- Przy decyzjach projektowych podawaj warianty z kosztem (najszybszy / optymalny / najlepszy) zamiast jednego rozwiązania.
- Nazywaj, co dany wybór przesądza na później.

## Stack

Lista technologii, setup, komendy, Supabase, CI i deploy: @README.md. Log scaffoldu ze startera `10x-astro-starter`: `context/changes/bootstrap-verification/verification.md`.

`AGENTS.md` to symlink do tego pliku — jedno źródło reguł dla obu narzędzi.

`README.md` opisuje lekomapę (setup, komendy, Supabase, CI, deploy) i linkuje do PRD. Źródłem prawdy o wymaganiach pozostaje PRD — przy rozbieżności popraw README.

### Komendy

Pełna lista: @package.json. Dwie rzeczy, których stamtąd nie widać:

- `npm run typecheck` odpal przed pushem — CI ma to jako osobną bramkę i wywróci się później niż ty.
- `npm run smoke` uruchamiaj po każdej aktualizacji zależności. Wymaga osiągalnego Supabase.

### Renderowanie

Pełny SSR (`output: "server"` w `astro.config.mjs`). Każda strona renderowana serwerowo.

API routes eksportują `export const prerender = false` mimo że przy `output: "server"` to i tak jest domyślne. Marker jest jawny celowo: gdyby `output` kiedykolwiek się zmieniło, trasy operujące na sesji i bazie zaczęłyby się prerenderować po cichu, a błąd wyszedłby dopiero na produkcji jako zwrócony z bufora stan cudzej sesji.

### Auth

- `src/lib/supabase.ts` — klient Supabase SSR (`@supabase/ssr`), sesje w ciasteczkach. `SUPABASE_URL` i `SUPABASE_KEY` przez `astro:env/server` (sekrety server-only zadeklarowane w `env.schema` w `astro.config.mjs`).
- `src/middleware.ts` — działa na każdym żądaniu, ustala użytkownika, wpina go w `context.locals.user`, przekierowuje niezalogowanych z tras z `PROTECTED_ROUTES`.
- Endpointy: `src/pages/api/auth/{signin,signup,signout}.ts`; potwierdzenie adresu: `src/pages/api/auth/{email-confirm,email-resend}.ts`; odzyskiwanie dostępu: `src/pages/api/auth/{password-reset-request,password-reset-verify,password-update}.ts`
- Strony: `src/pages/auth/{signin,signup,confirm-email}.astro`; potwierdzenie adresu: `src/pages/auth/confirm.astro`; odzyskiwanie dostępu: `src/pages/auth/forgot-password.astro`, `src/pages/auth/forgot-password/sent.astro`, `src/pages/auth/reset-password/confirm.astro`, `src/pages/auth/reset-password.astro`
- Sesja z odnośnika do zmiany hasła: reguła w `src/lib/auth/recovery-session.ts`. Rozpoznawana po podpisanym `amr` (metoda spoza `NORMAL_SESSION_METHODS`), nie po ciasteczku. Taka sesja dociera wyłącznie do ekranu nowego hasła i jego endpointów — middleware przekierowuje ją z każdej innej trasy.
- Potwierdzenie adresu z maila wylogowuje powstałą sesję (`amr: otp`) i prosi o logowanie hasłem. Nie dopisuj `otp` do `NORMAL_SESSION_METHODS` — otworzyłoby to wnętrze także sesji z odnośnika resetu hasła.
- Kontrola wersji warunków: middleware po regułach sesji pyta `terms_acceptances` i wykonuje decyzję z `src/lib/auth/terms-gate.ts` (przekierowanie na `/warunki/akceptacja` albo 403 `termsNotAccepted` na `/api/*`). Bieżąca wersja to `CURRENT_TERMS_VERSION` w `src/lib/copy/terms.ts`; wersja 2 = nowy plik `context/foundation/terms-of-use-v2.md`, nowy wiersz `terms_versions` w migracji i zmiana stałej.
- Usunięcie konta (S-09): ekran `src/pages/konto.astro`, potwierdzenie hasłem `src/pages/konto/usun.astro`, trasa `src/pages/api/account/delete.ts`, publiczna strona po usunięciu `src/pages/auth/konto-usuniete.astro`. Trasa sprawdza hasło przez `signInWithPassword`, potem woła funkcję `delete_own_account` (migracja `20261010120000_delete_own_account.sql`), która kasuje wiersz `auth.users` i przez kaskadę wszystkie dane konta.
- `delete_own_account` żąda świeżego (do 60 sekund) wpisu `password` w `amr` tokenu. Nowa metoda logowania nie daje prawa do usunięcia konta bez osobnej decyzji — nie dopisuj jej do warunku funkcji przy okazji wpisu w `NORMAL_SESSION_METHODS`.
- Ręczne usuwanie konta w panelu Supabase zostaje drogą awaryjną (osoba nie może się zalogować albo nie akceptuje nowej wersji warunków — kontakt mailowy na `/prywatnosc`) i drogą sprzątania kont smoke.
- Szablony maili z odnośnikiem: `supabase/templates/{recovery,confirmation}.html` działają tylko lokalnie. Produkcja ma własną kopię w panelu Supabase — przy każdej zmianie pliku przenieś temat i treść ręcznie do panelu (kroki w `README.md`, sekcja Supabase).
- Przykład strony chronionej: `src/pages/leki/index.astro`
- Start po zalogowaniu to `/leki` (`src/pages/index.astro`); `/dashboard` to wyłącznie przekierowanie 302 w `astro.config.mjs`, obsługiwane przez Cloudflare z `_redirects` przed Workerem (middleware go nie widzi) — nie przywracaj ekranu ani nie dopisuj tam sprawdzeń.

Starter pokrywa FR-001 i FR-002 (rejestracja, logowanie, odzyskiwanie dostępu) — nie pisz warstwy auth od zera.

### Po świeżym klonie

`npx astro sync` przed pierwszym `npm run lint`. Generuje typy Astro w `.astro/`, który jest gitignorowany i nie jedzie z repozytorium. Bez tego lint zgłasza ~20 błędów `@typescript-eslint/no-unsafe-*` na w pełni poprawnym kodzie — TypeScript nie widzi typów `APIContext`, `astro:env/server` itd. To nie są prawdziwe błędy. `npm run build` woła `astro sync` sam, więc problem dotyczy wyłącznie lintu.

### Konwencje kodu

- **Alias ścieżek**: `@/*` na `./src/*` (tsconfig paths).
- **Astro vs React**: `.astro` domyślnie. React tylko dla komponentu, który trzyma stan, obsługuje zdarzenia albo woła API z przeglądarki — wzorzec: `src/components/auth/SignInForm.tsx`. React wstawiany z `.astro` zawsze z dyrektywą `client:*` (`client:load` dla formularzy auth, `client:visible` dla treści poniżej pierwszego ekranu). Komponent `.tsx` bez dyrektywy i bez rodzica-React to błąd: albo nie potrzebuje React, albo brakuje dyrektywy.
- **Klasy Tailwind**: łącz helperem `cn()` z `@/lib/utils` (clsx + tailwind-merge). Nie sklejaj stringów z klasami ręcznie.
- **shadcn/ui**: komponenty w `src/components/ui/`, wariant "new-york". Nowe przez `npx shadcn@latest add [name]`. Nowy komponent oczyść z kolorowych klas `dark:` (np. `dark:bg-input/30`) — tryb ciemny należy wyłącznie do tokenów.
- **Kolory**: wyłącznie tokeny z `src/styles/global.css`, przez klasy typu `bg-primary`, `text-muted-foreground`. Żadnego hexa, `rgb(`, `oklch(` ani klasy palety Tailwinda (`bg-purple-600`, `text-white`).
  - Nowy kolor = nowy token w obu blokach (`:root` i `.dark`), zarejestrowany w `@theme inline`. Jeśli to tekst, dopisz jego parę tekst–tło do `EXPLICIT_PAIRS` w `scripts/tokens/contrast.mjs` (próg 7 : 1); `X-foreground` z `X` łączy się sam.
  - Na pasie bocznym tekst wyłącznie `sidebar-foreground` — `muted-foreground` nie trzyma tam 7 : 1, a test tego nie wyłapie.
  - `destructive*` wyłącznie dla błędów formularzy i techniki, nigdy dla treści o lekach i objawach. Możliwa interakcja ma bursztynowe `interaction*`.
  - Jedyny wyjątek: przycisk nieodwracalnej akcji na koncie — dziś wyłącznie usunięcie konta (`src/pages/konto.astro` wariant `destructive-outline`, `src/pages/konto/usun.astro` wariant `destructive`). Pełna czerwień tylko na przycisku, który faktycznie wykonuje akcję. Usuwanie leku i każda inna akcja nie dostaje czerwieni. Listę dozwolonych plików trzyma test `scripts/tokens/destructive-scope.test.mjs`; nowy wpis wymaga osobnej decyzji autorki.
  - Bramka: `scripts/tokens/hardcoded-colors.mjs` w `npm test` odrzuca kolor wpisany na sztywno w `src/`. Lista `EXCEPTIONS` obejmuje wyłącznie ekrany wejściowe startera; S-01 i S-10 zdejmują z niej swoje pliki. Nie dopisuj tam nowych plików.
- **Tryb jasny/ciemny**: preferencja w ciasteczku `lekomapa-theme` (`src/lib/theme.ts`), klasę `dark` na `<html>` rysuje serwer w `src/layouts/Layout.astro`, zapis wyłącznie przez `POST /api/preferences/theme`. Ikona w nagłówku wysyła ten sam `POST` w tle i przełącza klasę bez przeładowania (`src/lib/theme-toggle.ts`), żeby nie kasować niezapisanych formularzy; bez JavaScriptu działa zwykły formularz. Nie dokładaj drugiego mechanizmu (localStorage, React). Element zależny od trybu przełączaj widocznością `dark:hidden` / `hidden dark:…` (wzorzec: `src/components/ThemeToggle.astro`), nigdy kolorową klasą `dark:`.
- **Ekrany wnętrza**: przez `src/layouts/AppLayout.astro`. Pozycja menu przez `NAV_ITEMS` w `src/lib/navigation.ts` — trasa z menu jest chroniona automatycznie. Trasa wnętrza spoza menu wymaga ręcznego wpisu w `INTERIOR_ROUTES` w `src/lib/navigation.ts` — ta lista daje i ochronę przed niezalogowanymi, i kontrolę akceptacji warunków. Wpis tylko w `PROTECTED_ROUTES` w `src/middleware.ts` ominąłby kontrolę warunków.
- **Zwijanie i wybór objawów**: zwijana sekcja w React to `Button` z `aria-expanded` i lista z atrybutem `hidden` (wzorzec: `src/components/journal/SymptomPicker.tsx`), w `.astro` — `<details>` ze strzałką `src/components/CollapseChevron.astro` jako pierwszym dzieckiem `<summary>` (wzorzec: `src/pages/wizyta.astro`). Strzałka zawsze `›` po lewej, obrót o 90° po rozwinięciu — nie wracaj do `⌄` po prawej ani do trójkąta przeglądarki. Nasilenie objawu stoi zawsze pod zaznaczonym objawem, poza jego `<label>` — nie wracaj do bloku z przyciskami nad listą. Nasilenie zostaje osiągalne przy wyszukiwaniu, bo `searchSymptoms` w `src/lib/services/journal.ts` przypina zaznaczone objawy na początku wyników (impl-review F5). W E2E objaw zaznaczaj przez `pickSymptom` z `tests/e2e/journal-helpers.ts`, nie selektorem z listy — schowanego wiersza zwiniętej grupy nie da się zaznaczyć.
- **Karteczki (S-08)**: karteczka = `src/components/PaperNote.astro` — nie kopiuj jej klas. Papier `card` albo `accent`, taśma `accent-border` albo `sidebar-border`, kolor taśmy wg makiety (na dużej karteczce `accent` taśma `sidebar`, inaczej znika; mała karteczka `accent` we wpisie dzienniczka ma celowo taśmę `accent` — makieta F-notatka), obrót do ±3°, taśma i tylna kartka `aria-hidden`. Tekst na karteczce w kolorze papieru (`card-foreground` / `accent-foreground`), także na pasie bocznym. Nowy pusty stan albo nowa powierzchnia w tym wyglądzie wymaga najpierw makiety.
- **API routes**: eksporty wielkimi literami (`GET`, `POST`), `export const prerender = false`; walidacja wejścia przez zod — zod nie jest jeszcze zainstalowany, pierwsza route go dociąga (`npm i zod`).
- **Migracje Supabase**: `supabase/migrations/`, nazwy `YYYYMMDDHHmmss_short_description.sql`. Na każdej nowej tabeli włączaj RLS z politykami per-operacja i per-rola i `revoke truncate` od `anon`/`authenticated` — to jest mechanizm izolacji danych zdrowotnych per-konto z wymagań niefunkcjonalnych, nie opcja do odłożenia. Pełna checklista: `context/foundation/test-plan.md` §6.4.
- **Błędy serwera**: nieoczekiwany błąd zgłaszaj przez `reportError` z `@/lib/observability/report` — etykieta stała (`"medications.create"`), nigdy treść błędu. Wołaj go wyłącznie w modułach, których nie importuje `scripts/**`: trasy (`src/pages/**`), middleware, serwisy `*-data`, `src/lib/services/registry-search.ts`, `src/lib/services/terms-acceptance.ts`. Powód: `report.ts` importuje `cloudflare:workers`, którego `node --test` nie ładuje, więc wywołanie w module importowanym przez `scripts/**` (np. `src/lib/services/journal.ts`, `src/lib/navigation.ts`) wywraca `npm test` i smoke.
- **Plik startowy Workera**: `main` w `wrangler.jsonc` wskazuje `src/worker.ts` (`fetch` z adaptera Astro plus `scheduled` dla zadania 1102). Po zmianie zmiennych, sekretów albo `compatibility_date` w `wrangler.jsonc` uruchom `npm run cf-typegen` i commituj `worker-configuration.d.ts`.
- **React**: bez dyrektyw Next.js (`"use client"` itp.). Hooki wydzielaj do `src/components/hooks/`.
- **Serwisy i helpery** w `src/lib/` (logika biznesowa w `src/lib/services/`).
- **Typy współdzielone** (encje, DTO) w `src/types.ts`. Plik jeszcze nie istnieje — utwórz przy pierwszym typie, nie rozsypuj typów po komponentach.

Katalogi `src/lib/services/`, `src/components/hooks/` i `supabase/migrations/` też jeszcze nie istnieją — to docelowe miejsca, nie opis stanu repozytorium.

### Środowisko

Setup środowiska, Supabase i deploy: @README.md. Dwie rzeczy, których tam nie ma:

- Node.js 22.14.0 wg `.nvmrc`. Sprawdzone na v24.13.0: mimo ostrzeżenia `EBADENGINE` przy instalacji (`astro-eslint-parser` i `eslint-plugin-astro` deklarują `^22.22.3 || ^24.16.0 || >=26.3.0`) lint i build przechodzą czysto.
- **`@emnapi/core` i `@emnapi/runtime` w `devDependencies` są celowe — nie usuwaj.** Żaden kod ich nie importuje. Są tam, żeby trafiły do `package-lock.json`: wymagają ich warianty `wasm32` pakietów `sharp` i `@tailwindcss/oxide`, których npm na macOS nie wybiera, a npm na Linuksie tak. Bez nich `npm ci` w CI odmawia instalacji komunikatem `Missing: @emnapi/runtime from lock file`, a lokalnie wszystko wygląda poprawnie.
- **`sharp` w `devDependencies` jest celowy — nie usuwaj.** Importują go `scripts/icons/generate-icons.mjs` (`npm run icons`) i `scripts/icons/icons.test.mjs` (w `npm test`). Wcześniej był tylko zależnością pośrednią miniflare; aktualizacja miniflare albo astro mogła go usunąć i wywrócić `npm test` w CI. Wersja przypięta do tej z miniflare, żeby nie było drugiej kopii.

### CI

Definicja: @.github/workflows/ci.yml. Trzy joby: `ci` (lint, typy, build), `smoke` (ścieżka auth przeciw lokalnemu Supabase) i `deploy` na Cloudflare Workers po zielonych obu poprzednich, wyłącznie przy pushu do `main`.

Warunki, których z pliku nie widać: `ci` nie zbuduje się bez sekretów repozytorium `SUPABASE_URL` i `SUPABASE_KEY`, a `deploy` bez `CLOUDFLARE_API_TOKEN` i `CLOUDFLARE_ACCOUNT_ID`. Merge do `main` wdraża na produkcję — to jedyna bramka, nie ma osobnego zatwierdzenia.

### Kontekst projektu

`context/foundation/` — PRD, shape-notes, tech-stack, lessons. `context/changes/` — zmiany w toku.

Skille nie zapisują do `context/archive/`. Zarchiwizowane zmiany są niezmienne — jeśli docelowa ścieżka zaczyna się od `context/archive/`, przerwij i otwórz nową zmianę przez `/10x-new`.

### Deploy

Cloudflare Workers, wyłącznie `npx wrangler deploy` — nigdy `wrangler pages deploy`. Decyzja, historia operacyjna, zasady dostępu agenta do produkcji i rejestr ryzyk: `context/foundation/infrastructure.md`. Plan pierwszego wdrożenia: `context/deployment/deploy-plan.md`.

### Przepływ zmiany

Łańcuch: `/10x-roadmap` → `/10x-new` → `/10x-plan` → `/10x-plan-review` → `/10x-implement` (albo `/10x-tdd`, `/10x-e2e`) → `/10x-impl-review` → po merge'u `/10x-archive`.

- Roadmapa (`context/foundation/roadmap.md`) to pionowe plasterki widoczne dla użytkowniczki, bez dat i story pointów. Praca pozioma tylko jako enabler, który nazywa odblokowywany kamień milowy.
- `/10x-plan` jest domyślnym startem. `/10x-frame` i `/10x-research` tylko przy niejasnym problemie albo blokującym braku wiedzy.
- `/10x-tdd` dla fazy, w której da się z góry nazwać pierwszą padającą asercję, a kodu produkcyjnego jeszcze nie ma. Konfiguracja, wygląd, infrastruktura i faza z istniejącym kodem idą przez `/10x-implement`.
- Raport `/10x-impl-review` ląduje w `context/changes/<change-id>/reviews/impl-review.md`. Przegląd sam nie zmienia kodu — edycje wyłącznie w triage'u, na wyraźny wybór naprawy. Świadome pominięcie findingu jest pełnoprawnym wynikiem; „zapisz jako regułę” idzie przez `/10x-lesson`.
- Wyniki podagentów i raportów to hipotezy do sprawdzenia, nie fakty. Przy F-01 jeden finding był przeceniony, a proponowana naprawa drugiego wywróciłaby bramkę — RLS w PostgREST nie zwraca błędu, tylko pusty wynik.

### Testy

- Runner: wbudowany `node --test` (`npm test`, pliki `scripts/**/*.test.mjs`). Vitest nie jest zainstalowany.
- Asercja sprawdza obserwowalny wynik, nie wewnętrzne wywołania i nie wartość policzoną tą samą logiką co testowany kod. Pokrycie linii nie dowodzi, że test złapie regresję.
- Testy mutacyjne (Stryker): `npm run test:mutation`, lokalnie i ręcznie, zakres `mutate` w `stryker.config.json`. Nie są bramką CI.
- Testy pojedynczego pliku poza łańcuchem zmiany: `.claude/prompts/m3l2-ad-hoc-testing.md`. Oczekiwany wynik z PRD i tech-stacku, nie z kodu.
- Hooki agenta: `.claude/settings.json` (konfiguracja przez `/10x-configure-hook`, scalana, nie nadpisywana). Hooki gita to `.husky/pre-commit` z `lint-staged` — bez zmian. Hook końca tury nie może blokować na czystym drzewie.

### Testy E2E (Playwright)

Testy w `tests/e2e/`, ustalenia w `context/foundation/test-stack.md`. Nowy test przez `/10x-e2e`, jedno ryzyko z `context/foundation/test-plan.md` naraz — wyłącznie ryzyko, które przecina kilka granic (auth, routing, API, baza). Reguły jakości testów żyją w `references/e2e-quality-rules.md` skilli — nie dopisuj ich tutaj.

- Przed biegiem zatrzymaj stary podgląd i sprawdź, że port jest wolny — przy `reuseExistingServer` Playwright po cichu testuje stary build.
- Bieg idzie do lokalnego Supabase, nigdy do produkcji — `.env` wskazuje produkcję. Żadnych nazw leków ani dawek w URL także w testach.
- Nie commituj `playwright/.auth/` ani pliku env z `E2E_USERNAME` / `E2E_PASSWORD`.

<!-- BEGIN @przeprogramowani/10x-cli -->
<!-- END @przeprogramowani/10x-cli -->
