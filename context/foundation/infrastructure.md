---
project: lekomapa
researched_at: 2026-09-18
recommended_platform: Cloudflare Workers
runner_up: Vercel
context_type: mvp
tech_stack:
  language: TypeScript 6
  framework: Astro 7.3 (SSR) + React 19
  runtime: workerd (Cloudflare Workers) via @astrojs/cloudflare 14.3
---

## Rekomendacja

**Wdrażamy na Cloudflare Workers.**

Cloudflare jest jedyną platformą z pełnym kompletem pięciu kryteriów agent-friendly: każda operacja ma komendę w `wrangler` (deploy, rollback, tail, sekrety), dokumentacja jest serwowana jako markdown i `llms.txt`, a oficjalny serwer MCP jest GA. Repozytorium jest już pod nią zescaffoldowane — `@astrojs/cloudflare`, `wrangler.jsonc` i CI istnieją, więc koszt przesiadki wynosi zero, a pierwsze wdrożenie jest kwestią sekretów i tokenu, nie przebudowy projektu. Przy jednej użytkowniczce i qps poniżej jedności decydującym parametrem operacyjnym jest brak zimnego startu (izolaty V8 startują natychmiast), co wyklucza platformy kontenerowe usypiające darmowe instancje. Darmowy próg 100 tys. żądań dziennie jest dwa rzędy wielkości powyżej realnego ruchu.

Decyzja została podjęta po cross-checku antybiasowym, który wykazał jedno ryzyko wymagające planu awaryjnego (limit 10 ms CPU na żądanie) — patrz rejestr ryzyk.

## Porównanie platform

| Platforma          | CLI-first | Managed | Dokumentacja dla agenta | API deployu | MCP     | Suma  |
| ------------------ | --------- | ------- | ----------------------- | ----------- | ------- | ----- |
| Cloudflare Workers | Pass      | Pass    | Pass                    | Pass        | Pass    | 5 / 5 |
| Vercel             | Pass      | Pass    | Pass                    | Pass        | Partial | 4,5   |
| Railway            | Partial   | Pass    | Pass                    | Pass        | Pass    | 4     |
| Render             | Partial   | Pass    | Pass                    | Pass        | Pass    | 4     |
| Netlify            | Partial   | Pass    | Pass                    | Pass        | Pass    | 4     |
| Fly.io             | Partial   | Partial | Pass                    | Pass        | Pass    | 3,5   |

Uzasadnienia ocen:

- **Cloudflare Workers** — `wrangler deploy`, `wrangler rollback`, `wrangler tail`, `wrangler secret put` pokrywają całą pętlę operacyjną z terminala. Serverless bez dostępu do systemu operacyjnego. `developers.cloudflare.com/llms.txt`, `llms-full.txt` per produkt oraz negocjacja treści zwracająca markdown zamiast HTML (funkcja „Markdown for Agents", GA od 2026-02-11). Oficjalne zdalne serwery MCP z OAuth (`cloudflare-docs` oraz serwer API). Brak jakiejkolwiek operacji wymagającej panelu poza założeniem konta i wygenerowaniem tokenu.
- **Vercel** — jedyna platforma z rollbackiem jako pierwszorzędną komendą CLI (`vercel rollback`, `vercel promote`). Dokumentacja jako `.md` na każdej stronie plus `llms.txt`. Serwer MCP istnieje, ale jest w becie — stąd Partial. Adapter `@astrojs/vercel` v11 deklaruje zgodność z Astro 7.
- **Railway** — Railpack buduje aplikację Node bez Dockerfile'a, MCP jest GA, dokumentacja ma `llms.txt` i dedykowany punkt wejścia dla agentów. Partial na CLI: komenda rollbacku nie istnieje, powrót do starszego wdrożenia jest operacją panelową.
- **Render** — najlepsza dokumentacja dla agentów w całej stawce (`llms.txt`, `llms-full.txt`, wyszukiwarka dokumentacji po HTTP, instalowalne skille, OpenAPI). Partial na CLI: brak komendy rollbacku, a `services update` nie przyjmuje zmiennych środowiskowych, więc ich edycja wraca do panelu.
- **Netlify** — komplet CLI poza rollbackiem, który jest wyłącznie panelowy (skryptowalnie tylko przez surowe REST API). MCP oficjalny i GA.
- **Fly.io** — Partial na managed: `fly launch` wygeneruje Dockerfile, ale jego utrzymanie i łatanie obrazu bazowego zostaje po stronie zespołu. To PaaS kontenerowy, nie serverless. Brak komendy rollbacku; powrót to ponowne wdrożenie starego obrazu po sumie kontrolnej.

### Platformy na krótkiej liście

#### 1. Cloudflare Workers (rekomendacja)

Wygrywa trzema rzeczami naraz. Po pierwsze — zerowy koszt przesiadki: starter `10x-astro-starter` jest skonfigurowany pod tę platformę, `wrangler.jsonc` już istnieje i ma włączoną obserwowalność. Po drugie — brak zimnego startu, co przy ruchu rzędu kilku wejść dziennie jest różnicą między aplikacją, która odpowiada natychmiast, a taką, która budzi się przez minutę. Po trzecie — pełna operowalność z terminala plus serwer MCP, czyli agent może wdrożyć, cofnąć wdrożenie i przeczytać logi bez ani jednego kliknięcia.

#### 2. Vercel

Najlepsza wygoda pracy w stawce i jedyny pierwszorzędny rollback w CLI. Region funkcji `fra1` (Frankfurt) jest wybieralny nawet na darmowym planie Hobby, więc odległość do Supabase w EU nie jest problemem. Dwie rzeczy oddzielają go od rekomendacji: serwer MCP jest w becie (sygnał realny, ale miękki), a plan Hobby jest licencyjnie ograniczony do zastosowań niekomercyjnych — dla dzienniczka osobistego to warunek spełniony, ale każda zmiana modelu na zarobkowy wymusza plan Pro rozliczany za miejsce w zespole (20 USD za osobę miesięcznie).

#### 3. Railway

Pełne środowisko Node bez ograniczeń edge — żaden pakiet npm nie wysypie się z powodu braku API Node'a, co eliminuje całą klasę ryzyk obecnych na Cloudflare. Brak usypiania przy domyślnych ustawieniach, MCP w wersji GA. Odpada z rekomendacji z trzech powodów: nie ma darmowego progu (minimum 5 USD miesięcznie), rollback wymaga panelu, a jedyny region europejski to Amsterdam bez redundancji.

## Cross-check antybiasowy: Cloudflare Workers

### Adwokat diabła — słabości

1. **Limit 10 ms CPU na żądanie na darmowym progu.** Operacje wejścia/wyjścia się nie liczą, więc opóźnienie Supabase jest nieistotne — ale renderowanie SSR wysp React tak. Oś czasu zestawiająca objawy z okresami dawkowania, czyli drugorzędne kryterium sukcesu z PRD, jest dokładnie tym rodzajem obciążenia, które ten limit przebije. Objawia się błędem 1102 w produkcji, przy czym lokalne środowisko deweloperskie limitu nie ma i problemu nie pokaże.
2. **Środowisko deweloperskie i prerender działają w workerd, nie w Node.** Od wersji 14 adaptera dotyczy to także buildu. Każda biblioteka npm zakładająca API Node'a wysypie się już na etapie budowania — dotyczy to bibliotek dat i wszystkiego, co mogłoby zostać wciągnięte do reguł kolizji.
3. **Brak połączenia TCP do Postgresa.** Supabase przez HTTP działa bez zastrzeżeń, ale każde narzędzie zakładające klienta `pg` — migracje odpalane z poziomu aplikacji, skrypty wypełniające słownik substancji czynnych — nie zadziała bez usługi Hyperdrive. Migracje przez CLI Supabase pozostają bez zmian, bo nie przechodzą przez Workera.
4. **Rozjazd Pages kontra Workers już istnieje w repozytorium.** `context/foundation/tech-stack.md` deklaruje `deployment_target: cloudflare-pages`, podczas gdy `wrangler.jsonc` jest konfiguracją Workers (`main` plus binding `assets`). Agent idący za deklaracją z tech-stacku odpali `wrangler pages deploy` i utworzy drugi, pusty projekt z osobnym zestawem sekretów.
5. **`compatibility_date` przypięta na 2026-05-08.** Aktualizacja wranglera jej nie przesuwa. Zachowanie środowiska uruchomieniowego jest zamrożone, nowe API pozostają niewidoczne, a diagnoza rozbieżności między dokumentacją a zachowaniem Workera nie jest oczywista dla osoby, która nie zna tego mechanizmu.

### Pre-mortem — jak to mogło się zawalić

Minęło pół roku. Wdrożenie poszło gładko, bo starter był przygotowany pod Cloudflare, więc nikt nie przyjrzał się, co ta platforma naprawdę narzuca. Pierwsze tygodnie to dzienniczek i reguły kolizji — proste zapytania, wszystko mieści się w 10 ms CPU. Problem wszedł bokiem, przy osi czasu. Wykres zestawiający okresy dawkowania z objawami renderował się serwerowo i przy trzecim miesiącu danych zaczął przekraczać limit. Nie w środowisku deweloperskim, gdzie limitu nie ma — dopiero w produkcji, nieregularnie, tylko przy dłuższej historii. Diagnoza zajęła dwa wieczory z ośmiu dostępnych w miesiącu, bo błąd 1102 nie wskazuje trasy, która go wywołała.

Równolegle narósł drugi dług. Część pracy szła przez `wrangler pages deploy`, bo tak mówił `tech-stack.md`. Powstały dwa projekty, sekrety rozjechały się między nimi, a produkcja przez tydzień chodziła na nieaktualnym `SUPABASE_KEY`. Termin 10 stycznia przesunął się nie dlatego, że produkt okazał się za duży, tylko dlatego, że trzy z pięciu tygodni MVP zjadła infrastruktura, która miała być decyzją domyślną i bezkosztową.

### Nieznane niewiadome

- Darmowy próg to **100 tys. żądań dziennie, nie miesięcznie** — resetuje się codziennie. Przy jednej użytkowniczce nieosiągalny, ale ruch botów indeksujących zjada go szybciej, niż podpowiada intuicja.
- Płatny próg kosztuje **5 USD miesięcznie i podnosi limit z 10 ms CPU na żądanie do 30 mln CPU-ms miesięcznie**. To jest realna cena wyjścia z ryzyka nr 1 i warto ją znać z góry, zamiast odkrywać ją pod presją terminu.
- **Sesje Astro na Workers automatycznie provisionują KV z eventual consistency do 60 sekund globalnie.** Warstwa auth ze startera idzie przez ciasteczka `@supabase/ssr`, więc dziś to nie boli — ale przejście czegokolwiek na `Astro.session` da niedeterministyczne wylogowania.
- **Sekrety żyją w dwóch miejscach**: `wrangler secret put` dla produkcji i `.dev.vars` lokalnie. Żaden mechanizm nie pilnuje ich zgodności. Rozjazd objawia się jako „działa lokalnie, 500 na produkcji".
- **Podglądy wdrożeń na Workers to wersje, nie gałęzie.** `wrangler versions upload` zwraca URL per wersja — inny model niż podglądy per-PR znane z Pages i Vercela. Trzeba go świadomie wpiąć w CI, sam się nie pojawi.
- `observability.enabled` jest już ustawione na `true` w `wrangler.jsonc`, więc logi produkcyjne będą zbierane od pierwszego wdrożenia. Retencja na darmowym progu jest krótka — logi trzeba czytać na bieżąco, nie tydzień po incydencie.

## Historia operacyjna

- **Podglądy wdrożeń**: `npx wrangler versions upload` tworzy wersję z własnym URL-em podglądu bez przełączania ruchu produkcyjnego. Podglądy nie powstają automatycznie dla pull requestów — wymaga to kroku w GitHub Actions. URL podglądu jest publiczny; ochrona wymagałaby Cloudflare Access, co przy jednym użytkowniku testowym jest przesadą, ale przy danych zdrowotnych w podglądzie przestaje nią być, gdy tylko do podglądu trafi realna baza.
- **Sekrety**: produkcja przez `npx wrangler secret put SUPABASE_URL` i `SUPABASE_KEY` (przechowywane zaszyfrowane po stronie Cloudflare, nieodczytywalne po zapisie). Lokalnie w `.dev.vars`, plik jest gitignorowany. CI używa sekretów repozytorium GitHub plus `CLOUDFLARE_API_TOKEN` zawężonego do edycji Workers dla tego jednego projektu. Rotacja: zmiana w Supabase, potem `wrangler secret put` i ponowne wdrożenie.
- **Rollback**: `npx wrangler rollback` wraca do poprzedniej wersji, `npx wrangler deployments list` pokazuje historię, a `npx wrangler rollback <VERSION_ID>` cofa do konkretnej. Czas powrotu to sekundy. Zastrzeżenie: rollback cofa kod, nie migracje bazy. Migracja Supabase, która zmieniła schemat, zostanie na miejscu — cofnięcie wymaga osobnej migracji odwracającej.
- **Zatwierdzanie**: wdrożenie na produkcję jest automatyczne po merge'u do `main`, pod warunkiem przejścia obu bramek jakości (`ci` i `smoke`). Bramką ludzką jest sam merge, nie osobne kliknięcie — świadomy wybór zapisany 2026-09-18: przy jednej osobie pracującej 8 godzin tygodniowo drugie potwierdzenie tej samej decyzji kosztuje uwagę, a nic nie wnosi. Warunkiem tego wyboru jest to, że zielony `smoke` faktycznie przechodzi pełną ścieżkę auth; gdyby przestał, automat trzeba cofnąć. Tylko człowiek: rotacja `SUPABASE_KEY`, usunięcie Workera, każda operacja destrukcyjna na bazie Supabase.
- **Logi**: `npx wrangler tail` dla strumienia na żywo, `npx wrangler tail --status error` dla samych błędów, `npx wrangler tail --search <fraza>` do filtrowania. Obserwowalność jest już włączona w `wrangler.jsonc`. Do zapytań strukturalnych zamiast parsowania wyjścia CLI służy serwer MCP Cloudflare.

## Dostęp agenta do produkcji

### CLI czy MCP

Dwie drogi rozmowy z działającą platformą, komplementarne, nie konkurencyjne.

**CLI** (`wrangler`) — jawne i audytowalne, wyjście zostaje w terminalu, zerowy koszt kontekstu, bo żadne schematy narzędzi nie są ładowane z góry. Agent musi znać komendę, a te są wypisane w sekcji operacyjnej wyżej.

**MCP** — oficjalne zdalne serwery Cloudflare z OAuth wystawiają ustrukturyzowane narzędzia zamiast tekstu do parsowania. Każdy podłączony serwer dokłada definicje narzędzi do okna kontekstu, więc koszt kumuluje się przy wielu serwerach.

Wybór dla lekomapy: **zaczynamy od CLI**. Przy jednej aplikacji, jednym Workerze i kilku komendach obsługujących całą pętlę operacyjną MCP nie zarabia jeszcze na swój koszt kontekstu. Próg przesiadki: powtarzalny wzorzec, w którym agent przechodzi po `wrangler --help`, żeby odpowiedzieć na klasę pytań — najpewniej pojawi się przy diagnozowaniu logów, gdy zacznie ich być więcej niż da się przeczytać strumieniem.

### Uprawnienia i operacje zastrzeżone

- **Token dla CI jest zawężony.** Gdy powstanie job wdrożeniowy, `CLOUDFLARE_API_TOKEN` ma obejmować edycję Workers dla projektu `lekomapa` i nic poza tym — bez DNS, bez sekretów innych projektów, bez billingu. Token OAuth z `wrangler login` używany lokalnie ma uprawnienia znacznie szersze (`workers`, `d1`, `pages`, `ssl_certs`, wszystko `write`) i nie nadaje się do CI.
- **Tokeny żyją w zmiennych środowiskowych i sekretach repozytorium**, nigdy w pliku wrzuconym do gita ani w treści rozmowy z agentem.
- **Operacje destrukcyjne wykonuje człowiek.** Usunięcie Workera, rotacja `SUPABASE_KEY`, każda destrukcyjna zmiana w bazie Supabase — ręcznie, w panelu, nawet jeśli agent je zaproponuje. Kliknięcie kosztuje pół minuty; sprzątanie po automatycznej pomyłce w danych zdrowotnych kosztuje godziny i może naruszyć nienaruszalność historii.

To postawa na MVP. Naturalna ewolucja wraz z dojrzewaniem projektu: pełny dostęp agenta na środowisku testowym, tylko odczyt na produkcji.

## Rejestr ryzyk

| Ryzyko                                                                                                        | Źródło                | Prawdopodobieństwo | Skutek | Przeciwdziałanie                                                                                                                                                                                                                               |
| ------------------------------------------------------------------------------------------------------------- | --------------------- | ------------------ | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Oś czasu przekracza limit 10 ms CPU, błąd 1102 w produkcji                                                    | Adwokat diabła        | Ś                  | W      | Renderuj oś czasu po stronie klienta (wyspa React z `client:visible`) zamiast w SSR. Jeśli to nie wystarczy, przejdź na płatny próg 5 USD/mies. — decyzja zapada przed pierwszą implementacją wykresu, nie po awarii.                          |
| `tech-stack.md` deklaruje Pages, repozytorium jest na Workers; agent tworzy drugi projekt i rozjeżdża sekrety | Adwokat diabła        | W                  | W      | Popraw `deployment_target` w `tech-stack.md` na `cloudflare-workers` przed pierwszym wdrożeniem. Zapisz w `CLAUDE.md`, że obowiązuje `wrangler deploy`, nigdy `wrangler pages deploy`.                                                         |
| Biblioteka npm zakładająca API Node'a wysypuje build w workerd                                                | Adwokat diabła        | Ś                  | Ś      | Przed dodaniem zależności do reguł kolizji sprawdź jej zgodność z workerd. `nodejs_compat` jest już włączone i pokrywa większość modułów `node:*`.                                                                                             |
| Rozjazd sekretów między `.dev.vars` a produkcją — „działa lokalnie, 500 na produkcji"                         | Nieznane niewiadome   | W                  | Ś      | Po każdej zmianie sekretu odpal `npx wrangler secret list` i porównaj klucze z `.env.example`. Test dymny `npm run smoke` przeciw produkcji po wdrożeniu.                                                                                      |
| Rollback kodu nie cofa migracji bazy                                                                          | Historia operacyjna   | Ś                  | W      | Każda migracja zmieniająca schemat dostaje migrację odwracającą albo jest pisana addytywnie (nowa kolumna zamiast zmiany istniejącej). Dotyczy to zwłaszcza tabel z historią dawkowania, gdzie utrata danych narusza nienaruszalność historii. |
| Podgląd wdrożenia z realnymi danymi zdrowotnymi pod publicznym URL-em                                         | Historia operacyjna   | N                  | W      | Podglądy wyłącznie przeciw osobnemu projektowi Supabase z danymi syntetycznymi. Nigdy nie kieruj podglądu na produkcyjną bazę.                                                                                                                 |
| Zamrożona `compatibility_date` powoduje rozbieżność z dokumentacją                                            | Adwokat diabła        | N                  | N      | Przy aktualizacji wranglera lub adaptera sprawdź datę zgodności i przesuń świadomie, z odczytaniem listy zmian.                                                                                                                                |
| Cloudflare Pages przestaje dostawać nowe funkcje                                                              | Ustalenie z researchu | W                  | N      | Nie dotyczy — projekt idzie ścieżką Workers, która jest kierunkiem rozwoju platformy. Ryzyko odnotowane, bo dokumentacja i poradniki w sieci wciąż mieszają obie ścieżki.                                                                      |

Legenda prawdopodobieństwa i skutku: N — niskie, Ś — średnie, W — wysokie.

## Pierwsze kroki

Komendy zweryfikowane względem wersji przypiętych w `package.json` (Astro 7.3, `@astrojs/cloudflare` 14.3, wrangler 4.131), nie względem ogólnych poradników.

1. **Popraw rozjazd w tech-stacku.** Zmień `deployment_target` w `context/foundation/tech-stack.md` z `cloudflare-pages` na `cloudflare-workers`. To jednolinijkowa poprawka, która zamyka ryzyko nr 2 z rejestru, zanim agent zdąży pójść złą ścieżką.
2. **Zaloguj wranglera**: `npx wrangler login`. Wrangler jest już w `devDependencies`, nie instaluj go globalnie.
3. **Ustaw sekrety produkcyjne**: `npx wrangler secret put SUPABASE_URL`, potem `npx wrangler secret put SUPABASE_KEY`. Wartości bierz z panelu projektu Supabase.
4. **Zbuduj i wdróż**: `npm run build`, potem `npx wrangler deploy`. Nie używaj `wrangler pages deploy` — to inna ścieżka i utworzy osobny projekt.
5. **Zweryfikuj**: `npx wrangler tail` w jednym oknie, wejście na zwrócony URL w drugim. Następnie `BASE_URL=<adres-produkcyjny> npm run smoke`, żeby sprawdzić ścieżkę auth przeciw działającemu wdrożeniu.

Uwaga wersyjna: `npm run dev` (czyli `astro dev`) uruchamia się od wersji 14 adaptera w środowisku workerd, więc **nie potrzebujesz osobnej komendy `wrangler dev`** do wierności środowiska. Poradniki opisujące `wrangler dev` jako obowiązkowy krok dla Astro pochodzą sprzed tej zmiany.

## Poza zakresem

W tym researchu nie oceniano:

- konfiguracji obrazów Dockera,
- budowy potoku CI/CD (istniejący `.github/workflows/ci.yml` pokrywa bramki jakości; krok wdrożeniowy powstanie w Plan Mode),
- architektury w skali produkcyjnej (wiele regionów, wysoka dostępność, odtwarzanie po awarii).
