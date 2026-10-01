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

QA, nie programuje jeszcze, ~8h tygodniowo, termin 10.01.2027.

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
- Endpointy: `src/pages/api/auth/{signin,signup,signout}.ts`; odzyskiwanie dostępu: `src/pages/api/auth/{password-reset-request,password-reset-verify,password-update}.ts`
- Strony: `src/pages/auth/{signin,signup,confirm-email}.astro`; odzyskiwanie dostępu: `src/pages/auth/forgot-password.astro`, `src/pages/auth/forgot-password/sent.astro`, `src/pages/auth/reset-password/confirm.astro`, `src/pages/auth/reset-password.astro`
- Sesja z odnośnika do zmiany hasła: reguła w `src/lib/auth/recovery-session.ts`. Rozpoznawana po podpisanym `amr` (metoda spoza `NORMAL_SESSION_METHODS`), nie po ciasteczku. Taka sesja dociera wyłącznie do ekranu nowego hasła i jego endpointów — middleware przekierowuje ją z każdej innej trasy.
- Szablon maila z odnośnikiem: `supabase/templates/recovery.html` działa tylko lokalnie. Produkcja ma własną kopię w panelu Supabase — przy każdej zmianie pliku przenieś temat i treść ręcznie do panelu (kroki w `README.md`, sekcja Supabase).
- Przykład strony chronionej: `src/pages/dashboard.astro`

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
  - Bramka: `scripts/tokens/hardcoded-colors.mjs` w `npm test` odrzuca kolor wpisany na sztywno w `src/`. Lista `EXCEPTIONS` obejmuje wyłącznie ekrany wejściowe startera; S-01 i S-10 zdejmują z niej swoje pliki. Nie dopisuj tam nowych plików.
- **Ekrany wnętrza**: przez `src/layouts/AppLayout.astro`. Pozycja menu przez `NAV_ITEMS` w `src/lib/navigation.ts` — trasa z menu jest chroniona automatycznie. Trasa wnętrza spoza menu wymaga ręcznego wpisu w `PROTECTED_ROUTES` w `src/middleware.ts`.
- **API routes**: eksporty wielkimi literami (`GET`, `POST`), `export const prerender = false`; walidacja wejścia przez zod — zod nie jest jeszcze zainstalowany, pierwsza route go dociąga (`npm i zod`).
- **Migracje Supabase**: `supabase/migrations/`, nazwy `YYYYMMDDHHmmss_short_description.sql`. Na każdej nowej tabeli włączaj RLS z politykami per-operacja i per-rola i `revoke truncate` od `anon`/`authenticated` — to jest mechanizm izolacji danych zdrowotnych per-konto z wymagań niefunkcjonalnych, nie opcja do odłożenia. Pełna checklista: `context/foundation/test-plan.md` §6.4.
- **React**: bez dyrektyw Next.js (`"use client"` itp.). Hooki wydzielaj do `src/components/hooks/`.
- **Serwisy i helpery** w `src/lib/` (logika biznesowa w `src/lib/services/`).
- **Typy współdzielone** (encje, DTO) w `src/types.ts`. Plik jeszcze nie istnieje — utwórz przy pierwszym typie, nie rozsypuj typów po komponentach.

Katalogi `src/lib/services/`, `src/components/hooks/` i `supabase/migrations/` też jeszcze nie istnieją — to docelowe miejsca, nie opis stanu repozytorium.

### Środowisko

Setup środowiska, Supabase i deploy: @README.md. Dwie rzeczy, których tam nie ma:

- Node.js 22.14.0 wg `.nvmrc`. Sprawdzone na v24.13.0: mimo ostrzeżenia `EBADENGINE` przy instalacji (`astro-eslint-parser` i `eslint-plugin-astro` deklarują `^22.22.3 || ^24.16.0 || >=26.3.0`) lint i build przechodzą czysto.
- **`@emnapi/core` i `@emnapi/runtime` w `devDependencies` są celowe — nie usuwaj.** Żaden kod ich nie importuje. Są tam, żeby trafiły do `package-lock.json`: wymagają ich warianty `wasm32` pakietów `sharp` i `@tailwindcss/oxide`, których npm na macOS nie wybiera, a npm na Linuksie tak. Bez nich `npm ci` w CI odmawia instalacji komunikatem `Missing: @emnapi/runtime from lock file`, a lokalnie wszystko wygląda poprawnie.

### CI

Definicja: @.github/workflows/ci.yml. Trzy joby: `ci` (lint, typy, build), `smoke` (ścieżka auth przeciw lokalnemu Supabase) i `deploy` na Cloudflare Workers po zielonych obu poprzednich, wyłącznie przy pushu do `main`.

Warunki, których z pliku nie widać: `ci` nie zbuduje się bez sekretów repozytorium `SUPABASE_URL` i `SUPABASE_KEY`, a `deploy` bez `CLOUDFLARE_API_TOKEN` i `CLOUDFLARE_ACCOUNT_ID`. Merge do `main` wdraża na produkcję — to jedyna bramka, nie ma osobnego zatwierdzenia.

### Kontekst projektu

`context/foundation/` — PRD, shape-notes, tech-stack, lessons. `context/changes/` — zmiany w toku.

Skille nie zapisują do `context/archive/`. Zarchiwizowane zmiany są niezmienne — jeśli docelowa ścieżka zaczyna się od `context/archive/`, przerwij i otwórz nową zmianę przez `/10x-new`.
<!-- BEGIN @przeprogramowani/10x-cli -->

## Moduł 1, Lekcja 5 — infrastruktura i pierwszy deploy

Platforma wybrana i wdrożona: **Cloudflare Workers**, ścieżka `npx wrangler deploy` — nigdy `wrangler pages deploy`. Decyzja, historia operacyjna, zasady dostępu agenta do produkcji i rejestr ryzyk: `context/foundation/infrastructure.md`. Zatwierdzony plan pierwszego wdrożenia: `context/deployment/deploy-plan.md`.

Materiał lekcyjny (router zadań, pięć kryteriów agent-friendly, cross-check antybiasowy): `docs/10xdevs/m1l5-infra.md` — treść jednorazowa, nie kontrakt projektu.

## Moduł 2, Lekcja 1 — roadmapa MVP

`/10x-roadmap` czyta `context/foundation/prd.md` (plus `tech-stack.md`, `infrastructure.md`, `context/deployment/deploy-plan.md`, jeśli są) i pisze `context/foundation/roadmap.md`. Odpalaj przed zakładaniem folderów zmian — `/10x-new` przychodzi w kolejnej lekcji.

Granice roadmapy:
- domyślnie pionowe plasterki: efekt widoczny dla użytkowniczki, przecinający UI, dane, logikę i integracje,
- praca pozioma tylko jako ograniczony enabler, który nazywa odblokowywany kamień milowy,
- żadnych sierocych zadań poziomych („zbuduj całą bazę", „wszystkie endpointy", „cały UI") przed pierwszym przepływem widocznym dla użytkowniczki,
- roadmapa to nie kalendarz — bez dat, story pointów i prędkości sprintu, chyba że poprosisz o osobny artefakt planistyczny.

Materiał lekcyjny (router zadań, pełna lista ścieżek): `docs/10xdevs/m2l1-roadmap.md` — treść jednorazowa, nie kontrakt projektu.

## Moduł 2, Lekcja 2 — od roadmapy do pierwszego strumienia

Łańcuch zmiany: `/10x-roadmap` → `/10x-new` → `/10x-plan` → `/10x-plan-review` → `/10x-implement` → (po merge'u) `/10x-archive`.

- `/10x-new <change-id>` — po wybraniu pozycji z roadmapy, przed planowaniem. Tworzy `context/changes/<change-id>/change.md`: jedna tożsamość dla planu, implementacji, commitów i późniejszego review.
- `/10x-plan <change-id>` — czyta roadmapę, dokumenty z `context/foundation/` i kod; pisze `plan.md` (fazy, kontrakty plików, kryteria sukcesu, `## Progress`) oraz `plan-brief.md`.
- `/10x-plan-review <change-id>` — bramka przed dotknięciem kodu: brak stanu końcowego, słabe kontrakty, zepsuty `## Progress`, dryf zakresu.
- `/10x-implement <change-id> phase <n>` — jedna faza naraz: weryfikacja, bramka manualna, commit, wpis SHA do `## Progress`.

Granice:
- `/10x-plan` jest domyślnym startem po wyborze pozycji z roadmapy. `/10x-frame` i `/10x-research` to ścieżki eskalacji przy niejasnym problemie albo blokującym braku wiedzy — nie rytuał na każdą zmianę.
- Ta lekcja nie jest budową całego produktu. Wystarczy jeden strumień zaplanowany i częściowo wdrożony.
- Review wdrożonego diffa należy do lekcji 3 (`/10x-impl-review`).

Materiał lekcyjny (router zadań, pełna lista ścieżek): `docs/10xdevs/m2l2-implementation.md` — treść jednorazowa, nie kontrakt projektu. Wymieniony tam `docs/reference/contract-surfaces.md` nie istnieje w tym repozytorium.

## Moduł 2, Lekcja 3 — przegląd wdrożonego kodu

Pełny łańcuch zmiany z lekcją 3: `/10x-roadmap` → `/10x-new` → `/10x-plan` → `/10x-plan-review` → `/10x-implement` → **`/10x-impl-review`** → (po merge'u) `/10x-archive`.

- `/10x-impl-review <change-id>` — bramka po implementacji, przed merge'em. Zestawia wdrożony diff z planem i wystawia scorecard w sześciu wymiarach: zgodność z planem, dyscyplina zakresu, bezpieczeństwo i jakość, architektura, spójność wzorców, kryteria sukcesu. Potem triage finding po findingu.
- Zakres: pojedyncza faza (`phase <n>`) albo cały plan. Bez argumentu bierze najnowszą zmianę o statusie `implementing` lub `implemented`.
- Raport ląduje w `context/changes/<change-id>/reviews/impl-review.md`, a `change.md` dostaje `status: impl_reviewed`. Dzieje się to niezależnie od tego, czy triage odbędzie się od razu — dlatego `/10x-archive` i `/10x-status` widzą przegląd.
- Triage wznawia się podaniem ścieżki raportu: `/10x-impl-review context/changes/<change-id>/reviews/impl-review.md`. Findingi z `Decision: PENDING` czekają.

Granice:
- Świadome pominięcie findingu jest pełnoprawnym wynikiem przeglądu, nie porażką. Waga (jak źle, jeśli zignorować) i wpływ (ile uwagi wymaga decyzja) to dwie różne osie.
- „Zapisz jako regułę projektu" jest trzecim wyjściem obok naprawy i pominięcia — trafia do `context/foundation/lessons.md` przez `/10x-lesson`.
- Przegląd sam z siebie nie zmienia kodu. Edycje powstają wyłącznie w triage'u, na wyraźny wybór naprawy.
- Wyniki podagentów i raportu są hipotezami do sprawdzenia, nie faktami. Przy F-01 jeden finding okazał się przeceniony (usuwanie leku jest w zakresie FR-005, brakowało tylko ograniczenia oknem korekty), a proponowana naprawa drugiego wywróciłaby bramkę — pomiar pokazał, że RLS w PostgREST nie zwraca błędu, tylko pusty wynik.

Materiał lekcyjny: CLI nie wgrał pliku do `docs/10xdevs/` dla tej lekcji — w katalogu są tylko m1l5, m2l1 i m2l2.

## Moduł 3, Lekcja 2 — od planu testów do testów

Faza z `context/foundation/test-plan.md` idzie zwykłym łańcuchem: `/10x-test-plan` → `/10x-new` → `/10x-research` → `/10x-plan` → `/10x-implement` albo `/10x-tdd`.

- `/10x-tdd <change-id> phase <n>` — wariant `/10x-implement` z testem pisanym przed kodem (red → green → refactor). Czyta ten sam `plan.md`, zapisuje ten sam `## Progress`, kończy fazę tym samym commitem. Fazy obu skilli można przeplatać.
- Kiedy `/10x-tdd`: faza, dla której da się z góry nazwać pierwszą padającą asercję, a kodu produkcyjnego jeszcze nie ma. Konfiguracja, szkielet, wygląd, infrastruktura oraz faza z już napisanym kodem idą przez `/10x-implement`. Skill sam przerywa, gdy implementacja istnieje.
- `.claude/prompts/m3l2-ad-hoc-testing.md` — testy pojedynczego pliku poza pełnym łańcuchem. Oczekiwany wynik ustalany z PRD i tech-stacku, nie z kodu; przy niejasności prompt każe pytać zamiast zgadywać.

Granice:
- `/10x-tdd` nie instaluje runnera ani nie konfiguruje CI. W repozytorium runnerem jest wbudowany `node --test` (`npm test`, pliki `scripts/**/*.test.mjs`) — Vitest nie jest zainstalowany.
- Asercja sprawdza obserwowalny wynik, nie wewnętrzne wywołania i nie wartość policzoną tą samą logiką co testowany kod. Pokrycie linii nie dowodzi, że test złapie regresję.
- Testy mutacyjne (Stryker) z lekcji są bramką jakości asercji. W repozytorium nie są skonfigurowane — dodanie to osobna decyzja z kosztem, nie przy okazji.

Materiał lekcyjny: CLI nie wgrał pliku do `docs/10xdevs/` dla tej lekcji.

## Moduł 3, Lekcja 3 — hooki agenta

`/10x-configure-hook` zamienia bramki z sekcji „Quality Gates” w `context/foundation/test-plan.md` na hooki Claude Code, które odpalają się w trakcie pracy agenta. Odpalaj po `/10x-test-plan`.

- Moment wg szybkości: po każdej edycji (sprawdza tylko edytowany plik) → koniec tury (cały projekt, np. `npm run typecheck`) → pre-commit → pre-push → CI.
- Hook ma sens tylko wtedy, gdy jego komunikat dociera do agenta kanałem, który harness czyta dla tego zdarzenia. Skill uruchamia każdy skrypt na celowo zepsutym pliku i na czystym, zanim go odda.
- Istniejąca konfiguracja w `.claude/settings.json` jest scalana, nie nadpisywana; diff pokazany przed zapisem.

Granice:
- Skill nie zmienia hooków gita. Pre-commit to `.husky/pre-commit` z `lint-staged` (`eslint --fix`, prettier) — zostaje bez zmian.
- Hook końca tury nie może blokować na czystym drzewie. Po świeżym klonie `npx astro sync` przed pierwszym biegiem (patrz `### Po świeżym klonie`), inaczej lint i typecheck są czerwone bez powodu.

Materiał lekcyjny: CLI nie wgrał pliku do `docs/10xdevs/` dla tej lekcji. Reguła `CLAUDE-m3l3-hooks` pominięta przez CLI (lokalne zmiany w tym pliku) — ta sekcja ją zastępuje.

## Moduł 3, Lekcja 4 — testy E2E (Playwright)

Testy przeglądarkowe łapią to, czego nie widzą hooki i testy jednostkowe: dane, które nie przetrwają pełnej ścieżki, zepsutą nawigację, regresje tylko w wyrenderowanym UI.

- `/10x-e2e-setup` — jednorazowo, ponowne uruchomienie niczego nie zmienia. Instaluje `@playwright/test`, pisze `playwright.config.ts` (`webServer` na build + preview, projekt `setup` logujący raz do `storageState`), zielony test seed dla prawdziwego ryzyka, podpina `playwright-cli`, zapisuje ustalenia w `context/foundation/test-stack.md`.
- `/10x-e2e <change-id> [phase <n>] | <risk-id>` — rodzeństwo `/10x-implement` i `/10x-tdd`: ten sam `plan.md` i `## Progress`. Jedno ryzyko naraz: plan → generowanie → przegląd → weryfikacja, że test pada, gdy ryzyko wystąpi.
- Zaczynaj od ryzyka, nie od stron: 2–3 ryzyka z `test-plan.md` przecinające kilka granic (auth, routing, API, baza). Resztę zostaw testom jednostkowym i smoke.
- Reguły jakości testów E2E (`getByRole` zamiast CSS/XPath, izolowane testy z unikalnymi danymi i sprzątaniem, czekanie na stan zamiast `waitForTimeout`, asercje biznesowe) żyją w `references/e2e-quality-rules.md` skilli — nie dopisuj ich do tego pliku.

Granice:
- Przed biegiem zatrzymaj stary podgląd i sprawdź, że port jest wolny — przy `reuseExistingServer` Playwright po cichu testuje stary build (patrz lesson „Zatrzymaj stary podgląd”).
- Bieg idzie do lokalnego Supabase, nigdy do produkcji — `.env` wskazuje produkcję (patrz lesson „Lokalne bramki sprawdź…”). Żadnych nazw leków ani dawek w URL także w testach.
- Nie commituj `playwright/.auth/` ani pliku env z `E2E_USERNAME` / `E2E_PASSWORD`.

Materiał lekcyjny: CLI nie wgrał pliku do `docs/10xdevs/` dla tej lekcji. Reguła `CLAUDE-m3l4` pominięta przez CLI (lokalne zmiany w tym pliku) — ta sekcja ją zastępuje.

<!-- END @przeprogramowani/10x-cli -->
