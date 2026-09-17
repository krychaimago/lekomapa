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

## Testy

Na razie jedynym testem jest `scripts/smoke.mjs` — bezzależnościowy skrypt przechodzący całą ścieżkę auth (rejestracja, logowanie, strona chroniona, wylogowanie) po HTTP. Wymaga osiągalnego Supabase z wyłączonym potwierdzaniem e-maila.

```bash
npm run dev                             # albo: npm run build && npm run preview
BASE_URL=http://localhost:4321 npm run smoke
```

To sanity check po aktualizacji zależności, nie zestaw testów. Logika okresów dawkowania i zestawiania objawów w czasie wymaga własnych testów jednostkowych — do dopisania razem z pierwszym serwisem w `src/lib/services/`.

## CI

`.github/workflows/ci.yml`, push i PR do `main`:

- **ci** — `npm ci`, `astro sync`, lint, `astro check`, build. Build wymaga sekretów repozytorium `SUPABASE_URL` i `SUPABASE_KEY`.
- **smoke** — podnosi lokalne Supabase przez CLI, buduje, serwuje podgląd produkcyjny i uruchamia `npm run smoke`. Bez sekretów.

## Deploy

Cloudflare Workers (worker `lekomapa`, konfiguracja w `wrangler.jsonc`):

```bash
npm run build
npx wrangler deploy
```

`SUPABASE_URL` i `SUPABASE_KEY` ustaw jako sekrety w panelu Cloudflare albo przez `npx wrangler secret put`.
