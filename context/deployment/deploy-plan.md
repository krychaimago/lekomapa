# Plan pierwszego wdrożenia — lekomapa na Cloudflare Workers

## Kontekst

`context/foundation/infrastructure.md` rozstrzygnął platformę: **Cloudflare Workers**, ścieżka `wrangler deploy`, nie `wrangler pages deploy`. `context/foundation/tech-stack.md` ustala stack: Astro 7.3 SSR, React 19, TypeScript 6, Supabase jako baza i auth.

Repozytorium jest pod tę platformę zescaffoldowane, ale **nigdy nie było wdrożone**. Brakuje trzech rzeczy: autoryzacji wranglera, sekretów po stronie Workera i adresu produkcyjnego wpiętego w konfigurację auth Supabase. Cel planu: działający publiczny adres, na którym przechodzi pełna ścieżka rejestracja → logowanie → dashboard → wylogowanie.

Zakres świadomie wąski — pierwsze wdrożenie ręczne z laptopa. Job wdrożeniowy w CI i poprawki z rejestru ryzyk są poza zakresem (patrz sekcja końcowa).

## Stan zastany (zweryfikowany)

| Element                       | Stan                                                                                                                                       |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `astro.config.mjs:17`         | `adapter: cloudflare()` bez opcji, `output: "server"`, `site: "https://lekomapa.pl"`                                                       |
| `astro.config.mjs:18-23`      | `env.schema` deklaruje `SUPABASE_URL` i `SUPABASE_KEY` jako `context: "server", access: "secret", optional: true`                          |
| `wrangler.jsonc`              | `name: "lekomapa"`, `main` na entrypoint adaptera, `assets` binding, `observability: true`. Brak `routes`, `vars`, `account_id`, środowisk |
| `src/lib/supabase.ts:3`       | czyta sekrety przez `astro:env/server` — nie przez `locals.runtime.env`, nie przez `process.env`                                           |
| `src/lib/config-status.ts:14` | `configured: Boolean(SUPABASE_URL && SUPABASE_KEY)` steruje banerem „Supabase nie jest skonfigurowany"                                     |
| `.github/workflows/ci.yml`    | joby `ci` i `smoke`, zero odwołań do Cloudflare — nic się samo nie wdroży                                                                  |
| `scripts/smoke.mjs:4-6`       | `BASE_URL` z env, 8 asercji, tworzy konto `smoke-<timestamp>@example.com`                                                                  |
| Baza                          | hostowany projekt Supabase istnieje                                                                                                        |

Konsekwencja `optional: true` plus `access: "secret"`: build przechodzi bez sekretów, a aplikacja wdrożona bez nich **wstaje i pokazuje baner zamiast się wywalić**. To pozwala rozdzielić wdrożenie od konfiguracji sekretów i zweryfikować każdy krok osobno.

## Kroki

### 1. Autoryzacja wranglera — **człowiek**

```
npx wrangler login
```

Otwiera przeglądarkę, OAuth do konta Cloudflare. Wrangler jest w `devDependencies` — nie instaluj globalnie. W tej sesji wpisz to jako `! npx wrangler login`.

Weryfikacja: `npx wrangler whoami` wypisuje konto i identyfikator.

### 2. Kontrola buildu przed wdrożeniem — agent

```
npx astro sync && npm run build
```

Musi przejść czysto. Jeśli build się wywróci, wdrożenie nie ma sensu — `dist/` jest tym, co binding `assets` serwuje.

### 3. Pierwsze wdrożenie — agent

```
npx wrangler deploy
```

Nigdy `wrangler pages deploy` — to osobna ścieżka i utworzyłaby drugi projekt z własnym zestawem sekretów (ryzyko nr 2 z rejestru).

Wynik: adres `https://lekomapa.<subdomena>.workers.dev`. Zapisz go — kolejne kroki go używają.

Oczekiwany stan aplikacji na tym etapie: strona wstaje, widoczny baner „Supabase nie jest skonfigurowany", auth nie działa. To jest poprawne, nie awaria.

### 4. Sekrety produkcyjne — **człowiek**

```
npx wrangler secret put SUPABASE_URL
npx wrangler secret put SUPABASE_KEY
```

Każda komenda pyta o wartość interaktywnie. Wartości bierzesz z panelu Supabase (Project Settings → API): URL projektu i klucz `anon` / `publishable`. **Nie klucz `service_role`** — ten omija RLS i nie ma prawa znaleźć się w kodzie serwowanym z edge'a.

Wpisz je sama — wartości nie powinny przejść przez historię powłoki ani przez rozmowę.

`wrangler secret put` tworzy nową wersję Workera i od razu ją wdraża, więc **nie trzeba ponownie odpalać `wrangler deploy`**.

Weryfikacja: `npx wrangler secret list` pokazuje oba klucze (bez wartości — są nieodczytywalne po zapisie).

### 5. Konfiguracja auth w Supabase — **człowiek**

W panelu Supabase, Authentication → URL Configuration:

- **Site URL**: adres z kroku 3
- **Redirect URLs**: dopisz adres z kroku 3

Bez tego linki potwierdzające w mailach będą wskazywać na `localhost` i potwierdzenie konta nie zadziała z żadnego innego urządzenia.

Przy okazji sprawdź Authentication → Providers → Email, ustawienie **Confirm email**. Determinuje wynik następnego kroku:

- **włączone** — krok 5 testu dymnego („signin accepts correct password") wywróci się, bo konto nie jest potwierdzone. To nie jest błąd wdrożenia.
- **wyłączone** — wszystkie 8 kroków powinno przejść.

### 6. Test dymny przeciw produkcji — agent

```
BASE_URL=<adres-z-kroku-3> npm run smoke
```

Osiem asercji: renderowanie strony głównej, przekierowanie anonima z `/dashboard`, rejestracja, odrzucenie złego hasła, logowanie, dashboard zalogowanego, wylogowanie, ponowne przekierowanie.

Test **zakłada realne konto** `smoke-<timestamp>@example.com` w produkcyjnej bazie. Decyzja świadoma — sprzątanie w kroku 8.

Interpretacja wyniku: kroki 1, 2, 4 zielone oznaczają, że Worker działa i middleware chroni trasy. Krok 3 zielony oznacza, że sekrety dotarły. Kroki 5–8 zależą od ustawienia potwierdzania maila ze sprawdzenia w kroku 5.

### 7. Podgląd logów — agent

```
npx wrangler tail --status error
```

Obserwowalność jest już włączona w `wrangler.jsonc`. Puść równolegle z testem dymnym albo bezpośrednio po, żeby zobaczyć ewentualne błędy runtime. Retencja na darmowym progu jest krótka — czytaj na bieżąco.

### 8. Sprzątanie — **człowiek**

Panel Supabase → Authentication → Users → usuń konto `smoke-<timestamp>@example.com`.

## Weryfikacja końcowa

Ręcznie, z telefonu (PRD wymaga pełnej używalności na ekranie telefonu):

1. Wejdź na adres produkcyjny — strona się renderuje, brak banera o niezkonfigurowanym Supabase.
2. Zarejestruj własne konto — mail potwierdzający przychodzi i jego link prowadzi na adres produkcyjny, nie na `localhost`.
3. Zaloguj się — `/dashboard` się otwiera.
4. Wyloguj — `/dashboard` przekierowuje na `/auth/signin`.

Dopiero przejście tych czterech punktów oznacza wdrożenie zamknięte.

## Wycofanie

```
npx wrangler deployments list     # historia wersji
npx wrangler rollback             # powrót do poprzedniej
npx wrangler rollback <VERSION_ID>  # powrót do konkretnej
```

Czas powrotu: sekundy. Zastrzeżenie z rejestru ryzyk — rollback cofa kod, nie schemat bazy. Dziś nieistotne (`supabase/migrations/` nie istnieje, brak własnych tabel), zacznie obowiązywać przy pierwszej migracji.

## Bramki wyłącznie dla człowieka

Zgodnie z historią operacyjną w `infrastructure.md`:

- logowanie do Cloudflare (krok 1),
- wpisanie wartości sekretów (krok 4),
- zmiany konfiguracji w panelu Supabase (krok 5),
- usunięcie konta testowego (krok 8).

Agent wykonuje kroki 2, 3, 6, 7 i może cofnąć wdrożenie bez pytania.

## Poza zakresem tego planu

Świadomie pominięte, do osobnej decyzji:

- **Job wdrożeniowy w CI** — wymagałby `CLOUDFLARE_API_TOKEN` zawężonego do edycji Workers tego jednego projektu w sekretach repozytorium.
- **Poprawka `deployment_target` w `tech-stack.md`** (`cloudflare-pages` → `cloudflare-workers`) — ryzyko nr 2 z rejestru zostaje otwarte, dopóki tego nie zrobisz.
- **`export const prerender = false` w trasach API** — konwencja z `CLAUDE.md`, dziś bez skutku przy `output: "server"`, ale marker nie istnieje w żadnej z trzech tras auth.
- **Domena `lekomapa.pl`** — `astro.config.mjs:11` już ją deklaruje jako `site`, więc sitemap będzie wskazywać na nią, a nie na adres `workers.dev`. Bez skutku dla działania aplikacji.
- **Osobny projekt Supabase na podglądy wdrożeń** — dopóki podglądy nie istnieją, nie ma czego izolować.
