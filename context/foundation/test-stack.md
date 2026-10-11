# Test stack

## E2E

<!-- Written by /10x-e2e-setup. Re-run it to change this section; other skills only read it. -->

- runner: Playwright Test, @playwright/test 1.63.0
- config: playwright.config.ts
- single-spec command: npx playwright test tests/e2e/<name>.spec.ts
- full-suite command: npx playwright test
- base URL: http://localhost:4321
- port: 4321 (detected from the Astro preview default — no port in astro.config.mjs or package.json; detected default 4321, override with E2E_PORT in .env.e2e)
- web server command: npm run build && npm run preview -- --port $E2E_PORT (env ASTRO_PREVIEW_BACKGROUND=1, CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV=false, so the preview reads .dev.vars with the local Supabase instead of .env with production); reuseExistingServer outside CI
- auth setup project: setup (tests/e2e/auth.setup.ts), credentials from E2E_USERNAME / E2E_PASSWORD in .env.e2e (gitignored; the user exists only in the local Supabase and disappears after `npx supabase db reset`)
- storageState: playwright/.auth/user.json (gitignored)
- seed: tests/e2e/seed.spec.ts — protects auth-gate-roundtrip (close to test-plan risk #1): a signed-out visitor opening /leki lands on /auth/signin and sees no interior screen
- browser CLI: npx -y @playwright/cli (global install not permitted on this machine), command skill at .claude/skills/playwright-cli/SKILL.md
- updated: 2026-10-01

## Konto testowe E2E

Projekt `setup` loguje się kontem z `.env.e2e` (`E2E_USERNAME`, `E2E_PASSWORD`). To konto istnieje wyłącznie w lokalnym Supabase i znika po `npx supabase db reset`. Bez niego setup pada na `toPass()` po 30 s, a komunikat nie mówi, że konta brakuje.

Konto musi mieć zaakceptowaną bieżącą wersję warunków. Bez tego middleware przekierowuje je na `/warunki/akceptacja` i setup nie widzi przycisku „Wyloguj się”. Rejestracja przez formularz z zaznaczonym polem warunków zapisuje akceptację sama (wyzwalacz z `20261007130000_terms_acceptance.sql`). Lokalnie potwierdzenie adresu jest wyłączone (`enable_confirmations = false` w `supabase/config.toml`), więc konto działa od razu.

Jak założyć konto po resecie bazy:

1. Uruchom lokalny Supabase: `npx supabase start`.
2. Zatrzymaj stary podgląd: `npx astro preview stop`. Sprawdź, że port 4321 (albo `E2E_PORT`) jest wolny — inaczej rejestracja trafi do starego procesu.
3. Zbuduj aplikację: `npm run build`.
4. Uruchom podgląd na lokalnej bazie: `CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV=false npm run preview -- --port 4321`. Bez tej zmiennej podgląd czyta `.env`, czyli produkcyjne Supabase, i konto powstanie na produkcji.
5. Otwórz `http://localhost:4321/auth/signup` i zarejestruj się adresem i hasłem z `.env.e2e`, z zaznaczonym polem warunków.
6. Potwierdź, że konto powstało lokalnie: `docker exec supabase_db_10x-astro-starter psql -U postgres -Atc "select u.email, a.version from auth.users u join public.terms_acceptances a on a.user_id = u.id"`. Wynik ma zawierać adres z `.env.e2e` i bieżącą wersję warunków.
7. Zatrzymaj podgląd: `npx astro preview stop`.
8. Uruchom testy: `npx playwright test`.

Po podniesieniu `CURRENT_TERMS_VERSION` istniejące konto testowe trzeba raz przeprowadzić przez `/warunki/akceptacja` albo założyć od nowa po resecie bazy.
