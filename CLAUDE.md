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
- Endpointy: `src/pages/api/auth/{signin,signup,signout}.ts`
- Strony: `src/pages/auth/{signin,signup,confirm-email}.astro`
- Przykład strony chronionej: `src/pages/dashboard.astro`

Starter pokrywa FR-001 i FR-002 (rejestracja, logowanie, odzyskiwanie dostępu) — nie pisz warstwy auth od zera.

### Po świeżym klonie

`npx astro sync` przed pierwszym `npm run lint`. Generuje typy Astro w `.astro/`, który jest gitignorowany i nie jedzie z repozytorium. Bez tego lint zgłasza ~20 błędów `@typescript-eslint/no-unsafe-*` na w pełni poprawnym kodzie — TypeScript nie widzi typów `APIContext`, `astro:env/server` itd. To nie są prawdziwe błędy. `npm run build` woła `astro sync` sam, więc problem dotyczy wyłącznie lintu.

### Konwencje kodu

- **Alias ścieżek**: `@/*` na `./src/*` (tsconfig paths).
- **Astro vs React**: `.astro` domyślnie. React tylko dla komponentu, który trzyma stan, obsługuje zdarzenia albo woła API z przeglądarki — wzorzec: `src/components/auth/SignInForm.tsx`. React wstawiany z `.astro` zawsze z dyrektywą `client:*` (`client:load` dla formularzy auth, `client:visible` dla treści poniżej pierwszego ekranu). Komponent `.tsx` bez dyrektywy i bez rodzica-React to błąd: albo nie potrzebuje React, albo brakuje dyrektywy.
- **Klasy Tailwind**: łącz helperem `cn()` z `@/lib/utils` (clsx + tailwind-merge). Nie sklejaj stringów z klasami ręcznie.
- **shadcn/ui**: komponenty w `src/components/ui/`, wariant "new-york". Nowe przez `npx shadcn@latest add [name]`.
- **API routes**: eksporty wielkimi literami (`GET`, `POST`), `export const prerender = false`; walidacja wejścia przez zod — zod nie jest jeszcze zainstalowany, pierwsza route go dociąga (`npm i zod`).
- **Migracje Supabase**: `supabase/migrations/`, nazwy `YYYYMMDDHHmmss_short_description.sql`. Na każdej nowej tabeli włączaj RLS z politykami per-operacja i per-rola — to jest mechanizm izolacji danych zdrowotnych per-konto z wymagań niefunkcjonalnych, nie opcja do odłożenia.
- **React**: bez dyrektyw Next.js (`"use client"` itp.). Hooki wydzielaj do `src/components/hooks/`.
- **Serwisy i helpery** w `src/lib/` (logika biznesowa w `src/lib/services/`).
- **Typy współdzielone** (encje, DTO) w `src/types.ts`. Plik jeszcze nie istnieje — utwórz przy pierwszym typie, nie rozsypuj typów po komponentach.

Katalogi `src/lib/services/`, `src/components/hooks/` i `supabase/migrations/` też jeszcze nie istnieją — to docelowe miejsca, nie opis stanu repozytorium.

### Środowisko

Setup środowiska, Supabase i deploy: @README.md. Jedna rzecz, której tam nie ma:

- Node.js 22.14.0 wg `.nvmrc`. Sprawdzone na v24.13.0: mimo ostrzeżenia `EBADENGINE` przy instalacji (`astro-eslint-parser` i `eslint-plugin-astro` deklarują `^22.22.3 || ^24.16.0 || >=26.3.0`) lint i build przechodzą czysto.

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

<!-- END @przeprogramowani/10x-cli -->
