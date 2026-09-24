# lekomapa

Osobisty dzienniczek leków i objawów. Użytkowniczka zapisuje przyjmowane preparaty (po substancji czynnej) wraz z historią okresów dawkowania oraz wpisy o samopoczuciu, a produkt zestawia jedno z drugim w czasie i składa z tego pytania do zadania lekarzowi.

**Produkt informuje, nie diagnozuje.** Nigdy nie stwierdza, że lek powoduje objaw — wyłącznie „może mieć związek". Nie sugeruje odstawienia leku ani zmiany dawki. Zbiór reguł jest z założenia niepełny, więc brak ostrzeżenia nie oznacza, że połączenie jest bezpieczne.

Pełne wymagania: [`context/foundation/prd.md`](context/foundation/prd.md). Ustalenia z sesji planistycznej wraz z odrzuconymi wariantami: [`context/foundation/shape-notes.md`](context/foundation/shape-notes.md). Reguły dla agentów AI pracujących w repozytorium: [`CLAUDE.md`](CLAUDE.md) (`AGENTS.md` to symlink do tego samego pliku).

Status: wersja pierwsza w budowie. Gotowa jest warstwa uwierzytelniania ze startera (FR-001, FR-002); logika leków, dzienniczka i kolizji dopiero powstaje.

## Stack

Astro 7 (SSR + API routes) · React 19 (wyspy interaktywne) · TypeScript · Tailwind 4 · shadcn/ui · Supabase (PostgreSQL + auth + RLS) · deploy na Cloudflare Workers.

Projekt zescaffoldowany z [`10x-astro-starter`](https://github.com/przeprogramowani/10x-astro-starter); log scaffoldu w [`context/changes/bootstrap-verification/verification.md`](context/changes/bootstrap-verification/verification.md).

## Wymagania wstępne

- Node.js **22.14.0** (`.nvmrc` — `nvm use`)
- [Docker](https://www.docker.com/) i ~7 GB RAM, jeśli chcesz uruchomić Supabase lokalnie

## Uruchomienie

```bash
git clone https://github.com/krychaimago/lekomapa.git
cd lekomapa
npm install
npx astro sync        # generuje typy Astro w .astro/ — bez tego lint sypie fałszywymi błędami
```

Następnie skonfiguruj Supabase (niżej) i:

```bash
npm run dev           # http://localhost:4321
```

## Komendy

| Komenda                     | Opis                                                   |
| --------------------------- | ------------------------------------------------------ |
| `npm run dev`               | serwer deweloperski na runtime Cloudflare workerd      |
| `npm run build`             | build produkcyjny (SSR przez `@astrojs/cloudflare`)    |
| `npm run preview`           | podgląd buildu produkcyjnego                           |
| `npm run lint` / `lint:fix` | ESLint z regułami type-checked                         |
| `npm run typecheck`         | `astro check` — bramka typów, ta sama co w CI          |
| `npm run format`            | Prettier                                               |
| `npm run smoke`             | test dymny ścieżki auth przeciw działającemu serwerowi |
| `npm test`                  | testy jednostkowe skryptów RPL (`node --test`)         |

Pre-commit (husky + lint-staged) uruchamia `eslint --fix` na `*.{ts,tsx,astro}` i `prettier --write` na `*.{json,css,md}`.

## Supabase

Repozytorium zawiera już `supabase/config.toml` — `npx supabase init` nie jest potrzebne.

### Lokalnie

```bash
cp .env.example .env
npx supabase start          # pierwsze uruchomienie pobiera obrazy Dockera
```

Dane wypisane przez CLI przepisz do `.env` (Node) i `.dev.vars` (lokalny runtime Cloudflare, gitignorowany):

```
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_KEY=<anon key z wyjścia CLI>
```

Studio: `http://localhost:54323`. Zatrzymanie stosu: `npx supabase stop`.

Aby logować się od razu po rejestracji, bez klikania linku potwierdzającego: **Authentication → Email → Confirm email → off**.

### Projekt w chmurze

Te same dwie zmienne, wartości z panelu Supabase → Settings → API (`Project URL` oraz klucz `anon`).

### Migracje

Pliki w `supabase/migrations/`, nazwy `YYYYMMDDHHmmss_krotki_opis.sql`. **Każda nowa tabela wymaga włączonego RLS z politykami per-operacja i per-rola** — to mechanizm izolacji danych zdrowotnych per-konto z wymagań niefunkcjonalnych PRD, nie opcja do odłożenia na później.

**Każda nowa tabela dokłada też swój zestaw sprawdzeń izolacji do `scripts/smoke.mjs`** — cztery kroki na tabelę: konto widzi wyłącznie własne wiersze, nie odczyta cudzego wiersza po identyfikatorze, nie zmieni go ani nie usunie, a sam klucz publiczny bez sesji nie zwraca nic. Polityka opisana w migracji jest deklaracją; dopiero te kroki robią z niej fakt sprawdzany w CI.

Sprawdzenia SQL z `supabase/tests/rls_checks.sql` uruchamiasz przeciw lokalnemu Supabase:

```bash
docker exec -i $(docker ps -qf name=supabase_db) psql -U postgres -d postgres -f - < supabase/tests/rls_checks.sql
```

Plik sprawdza też dane z migracji rejestru i par: tabele nie są puste, każdy produkt mieści się w zakresie którejś pary, a żaden produkt nie ma zdublowanego wiersza substancji.

### Dane rejestru leków i par kolizji

Rejestr leków (`registry_products`, `registry_substances`) i pary kolizji (`interaction_pairs`) to dane wspólne, tylko do odczytu. Trafiają do bazy wyłącznie migracjami wygenerowanymi skryptem, nigdy importem — lokalnie, w CI i na produkcji jest ten sam stan, a stan bazy wynika z repozytorium.

Skąd biorą się dane:

- **RPL** — Rejestr Produktów Leczniczych, plik XML v6.0.0. Surowy plik (~74 MB) leży w `.cache/rpl/` i nie trafia do repozytorium. W repozytorium jest manifest `supabase/seed-data/rpl-snapshot.json` z datą `stanNaDzien` i skrótem `sha256`. Każdy skrypt odmawia pracy na pliku o innym skrócie, bo RPL zmienia się codziennie.
- **Pary** — `supabase/seed-data/interaction_pairs.csv`. Do migracji trafia tylko para z datą sprawdzenia (`verified_on`) wpisaną przez autorkę.
- **Poprawki substancji** — `supabase/seed-data/substance-corrections.csv` (opis niżej).

Kolejność pracy:

```bash
node scripts/rpl/download.mjs                                   # pobiera RPL i zapisuje manifest (--refresh nadpisuje istniejący)
node scripts/rpl/measure.mjs --groups C09CA,M01AE               # raport liczb dla roboczej listy grup
node scripts/rpl/pairs.mjs supabase/seed-data/interaction_pairs.csv   # walidacja par
node scripts/rpl/generate.mjs --timestamp YYYYMMDDHHmmss        # dwie migracje danych + odświeżony raport
npx supabase db reset                                           # lokalnie: stosuje migracje od zera
```

Generator:

- bierze grupy z par sprawdzonych przez autorkę (`group_a` i `group_b`) i wczytuje z RPL tylko produkty z tych grup. Zakres to filtr przy generowaniu — w bazie nie ma flagi „w zakresie”,
- pisze `<timestamp>_registry_seed.sql` i `<timestamp + 1 min>_interaction_pairs_seed.sql`. Nagłówek każdej migracji podaje źródło, `stanNaDzien`, skrót, grupy, liczby i odrzucone kody ATC,
- odświeża raport `context/changes/interaction-rules-seed/registry-measurement.md`,
- odmawia pracy, gdy plik par albo poprawek ma błędy, gdy w pliku poprawek jest wiersz bez `verified_on` albo gdy znacznik czasu nie jest późniejszy od ostatniej migracji.

**Nowa grupa = nowa migracja dogrywająca, bez edycji istniejącej.** Po dodaniu pary z nową grupą uruchom generator z nowym znacznikiem czasu. Nowa migracja dogrywa brakujące produkty (`on conflict (rpl_id) do nothing`) i nie rusza produktów wgranych wcześniej — substancje wstawia tylko dla produktów wstawionych w tej samej migracji. Istniejącej migracji danych nie edytuj ani nie generuj ponownie: na produkcji już się nie wykona.

Z tego samego powodu poprawka substancji dla produktu, który już jest w bazie, nie przejdzie przez generator. Taka poprawka to osobna, ręcznie pisana migracja, a źródłem pozostaje ten sam wiersz w pliku poprawek.

#### Plik poprawek substancji

`supabase/seed-data/substance-corrections.csv` domyka luki, których RPL sam nie domyka. Format: UTF-8, separator `;`, pola w cudzysłowach, kolumny `kind;rpl_id;substance;target;source;note;verified_on`.

| `kind`                   | Do czego służy                                                                                             |
| ------------------------ | ---------------------------------------------------------------------------------------------------------- |
| `alias`                  | nazwa substancji normalizuje się do innej nazwy (literówki, nazwy polskie, zapisy soli spoza listy)        |
| `substance_code`         | kod ATC dla substancji, która nie ma w RPL leku jednoskładnikowego                                         |
| `product_substance_code` | kod tej substancji w tym jednym produkcie (remis kodów, błąd źródła)                                       |
| `index_exclude`          | produkt nie zasila słownika kodów (błędny kod w źródle)                                                    |
| `product_composition`    | substancja dla produktu bez składu, gdy automatyczne uzupełnienie nie wystarczyło                          |
| `confirmed_unmatched`    | potwierdzenie, że substancja nie ma własnego kodu — zmienia tylko raport                                   |
| `confirmed_ambiguous`    | potwierdzenie, że remis kodów w produkcie zostaje świadomie (uzasadnienie w `note`) — zmienia tylko raport |

Zasady:

- **Każdy wiersz ma źródło i datę sprawdzenia.** `source` wskazuje konkretny dokument (ChPL lub ulotka w RPL z punktem, wyszukiwarka ATC WHO z datą dostępu). `verified_on` wpisuje autorka po sprawdzeniu — nigdy agent. Wiersz bez daty nie działa, a generator odmawia pracy, dopóki taki wiersz jest w pliku.
- **Poprawka nie zmienia surowych danych RPL.** Działa na wczytanych produktach. Treść źródłowa zostaje w `source_payload` bez zmian, a pochodzenie kodu i składu opisują kolumny `atc_source` i `composition_source`.

#### Licencja danych RPL

Dane rejestru pochodzą z [Rejestru Produktów Leczniczych](https://dane.gov.pl/pl/dataset/397,rejestr-produktow-leczniczych) udostępnianego na licencji [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/deed.pl). Źródło: Rejestr Produktów Leczniczych, `https://rejestry.ezdrowie.gov.pl/api/rpl/medicinal-products/public-pl-report/6.0.0/overall.xml`, stan na dzień z manifestu `supabase/seed-data/rpl-snapshot.json`. Licencja wymaga podania źródła przy każdym wykorzystaniu danych. Wzmianka w interfejsie należy do S-02.

## Testy

Testy jednostkowe skryptów RPL (`scripts/**/*.test.mjs`, wbudowany `node --test`, bez bazy i bez sieci):

```bash
npm test
```

Obejmują normalizację nazw substancji, wyprowadzanie kodów ATC, filtr zakresu, plik poprawek, walidację par i budowanie SQL migracji. W CI chodzą w jobie `ci`.

Test dymny to `scripts/smoke.mjs` — skrypt przechodzący po HTTP ścieżkę auth (rejestracja, logowanie, strona chroniona, wylogowanie), a następnie sprawdzający izolację danych między kontami bezpośrednio przez `@supabase/supabase-js`. Wymaga osiągalnego Supabase oraz zmiennych `SUPABASE_URL` i `SUPABASE_KEY` (pusta wartość liczy się jak brak — skrypt kończy się błędem z nazwą zmiennej zamiast po cichu pominąć sprawdzenia).

```bash
npm run dev                             # albo: npm run build && npm run preview
BASE_URL=http://localhost:4321 npm run smoke
```

Skrypt ma dwa tryby, wybierane przez zmienne środowiskowe:

| Zmienna                         | Znaczenie                                                                                                                     |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `BASE_URL`                      | adres działającego serwera, domyślnie `http://localhost:4321`                                                                 |
| `SMOKE_EMAIL`, `SMOKE_PASSWORD` | dane potwierdzonego konta testowego; ustawione razem przełączają skrypt w tryb istniejącego konta i pomijają krok rejestracji |
| `SMOKE_EMAIL_DOMAIN`            | domena jednorazowego adresu, domyślnie `example.com` — do podmiany, gdy Supabase odrzuca ten adres                            |
| `SMOKE_ALLOW_REMOTE_WRITES`     | `1` pozwala uruchomić sprawdzenia izolacji przeciw bazie spoza `localhost`; domyślnie są wtedy pomijane                       |

- **Konto jednorazowe** (domyślnie) — rejestruje świeży adres, potem się loguje. Działa tylko tam, gdzie potwierdzanie e-maila jest wyłączone, czyli lokalnie i w CI.
  `npm run smoke` ładuje `.env`, jeśli istnieje (`node --env-file-if-exists`), więc te zmienne można trzymać tam zamiast podawać w wierszu poleceń. `.env` jest gitignorowany — hasło konta testowego nigdy nie trafia do repozytorium. Szablon bez wartości: `.env.example`.

- **Istniejące konto** — `SMOKE_EMAIL` i `SMOKE_PASSWORD` wskazują konto już potwierdzone, więc krok rejestracji odpada. To tryb do uruchomienia przeciw produkcji: przechodzi mimo włączonego potwierdzania e-maila i nie zostawia nowych kont w bazie. Konto testowe zakładasz raz, ręcznie. Ustawienie tylko jednej z tych zmiennych kończy się błędem — skrypt nie zgaduje, którego trybu chcesz.

Sprawdzenia izolacji działają **wyłącznie w trybie konta jednorazowego i wyłącznie przeciw lokalnemu Supabase** (`SUPABASE_URL` na `localhost` albo `127.0.0.1`); w każdym innym wypadku wypisywany jest wiersz `SKIP` z powodem. Świadome uruchomienie ich przeciw zdalnej bazie wymaga jawnego `SMOKE_ALLOW_REMOTE_WRITES=1` — o adresie decyduje `SUPABASE_URL`, nie obecność `SMOKE_EMAIL`, bo ta zmienna nic o docelowej bazie nie mówi. Potrzebują dwóch świeżych kont i zapisania przy każdym zmyślonego leku — na produkcji drugiego konta nie da się założyć, a zmyślone dane zdrowotne nie mają czego szukać w prawdziwym koncie. CI chodzi w trybie jednorazowym, więc bramka pozostaje w mocy. Nowa tabela z danymi konta dokłada tu swoje cztery kroki (opis w sekcji [Migracje](#migracje)).

W tym samym trybie chodzą kroki dla tabel wspólnych (`registry_products`, `registry_substances`, `interaction_pairs`). Zalogowane konto czyta co najmniej jeden wiersz. Próba wstawienia, zmiany i usunięcia kończy się zmierzonym błędem `42501` („permission denied for table …”), a ponowny odczyt pokazuje wiersz bez zmian. Sam klucz publiczny bez sesji nie zwraca nic.

To sanity check po aktualizacji zależności, nie zestaw testów. Logika okresów dawkowania i zestawiania objawów w czasie wymaga własnych testów jednostkowych — do dopisania razem z pierwszym serwisem w `src/lib/services/`.

## CI

`.github/workflows/ci.yml`, push i PR do `main`:

- **ci** — `npm ci`, `astro sync`, lint, testy jednostkowe (`npm test`), `astro check`, build. Build wymaga sekretów repozytorium `SUPABASE_URL` i `SUPABASE_KEY`.
- **smoke** — podnosi lokalne Supabase przez CLI, buduje, serwuje podgląd produkcyjny i uruchamia `npm run smoke`. Bez sekretów.

## Deploy

Cloudflare Workers (worker `lekomapa`, konfiguracja w `wrangler.jsonc`):

```bash
npm run build
npx wrangler deploy
```

`SUPABASE_URL` i `SUPABASE_KEY` ustaw jako sekrety w panelu Cloudflare albo przez `npx wrangler secret put`.
