<!-- BEGIN @przeprogramowani/10x-cli -->

## 10xDevs AI Toolkit — Module 1, Lesson 3

Scaffold the project for the stack you picked in Lesson 2, with the **bootstrap chain**:

```
(/10x-init  →  /10x-shape  →  /10x-prd)  →  /10x-tech-stack-selector  →  /10x-bootstrapper
```

The PRD chain ships from Lesson 1 and the tech-stack-selector ships from Lesson 2 — both re-included in this lesson so you can fix the PRD or swap the stack mid-flight. `/10x-bootstrapper` is the lesson's main topic. The chain ends here in v1; a future Lesson 4 will set up agent context (`CLAUDE.md`, `AGENTS.md`).

### Task Router — Where to start

| Skill | Use it when |
| --- | --- |
| **Bootstrap (lesson focus)** | |
| `/10x-bootstrapper` | You have a hand-off at `context/foundation/tech-stack.md` (written by `/10x-tech-stack-selector`) and you are ready to scaffold the project into the current directory. The skill reads the hand-off, looks up the chosen card in the starter registry, runs its CLI through one of three cwd strategies (scaffold into a temp directory then move files up; scaffold directly into the current directory; clone a starter repo without keeping its git history), preserves `context/` always, sidelines other clashes as `.scaffold` siblings, runs a light pre-scaffold recency check and a deeper post-scaffold audit, and writes a verification log to `context/changes/bootstrap-verification/verification.md`. Use AFTER `/10x-tech-stack-selector`. |
| **Re-run upstream if needed** | |
| `/10x-init` / `/10x-shape` / `/10x-prd` / `/10x-tech-stack-selector` | Bundled so you can fix the PRD or swap the stack mid-flight. If `/10x-bootstrapper` surfaces a registry-drift refusal or you change your mind on the starter, re-run `/10x-tech-stack-selector` to regenerate `tech-stack.md` and re-invoke. |

### How the chain hands off

- `/10x-tech-stack-selector` (Lesson 2) writes `context/foundation/tech-stack.md` with a 4-key frontmatter (`starter_id`, `package_manager`, `project_name`, `hints`) plus a one-paragraph `## Why this stack` body.
- `/10x-bootstrapper` reads that file FULLY (no fallback to conversation history). If it is absent, the skill refuses with a one-sentence redirect to `/10x-tech-stack-selector` and stops — no inline mini-handoff, no standalone-mode in v1.
- The chosen `starter_id` is looked up in `/skills/10x-tech-stack-selector/references/starter-registry.yaml`. The skill consumes that registry; it does not own it. A CI validator (`scripts/validate-starter-registry-sync.mjs`) prevents bootstrapper from referencing a `starter_id` absent from the registry.
- The skill writes `context/changes/bootstrap-verification/verification.md` as the audit-trail log for the run. Schema in `/skills/10x-bootstrapper/references/verification-log-schema.md`.

### What bootstrapper captures (and what it does NOT)

- **Captured (v1)**: scaffold via the chosen card's `cmd_template` (CLI delegation, not inline file generation), three cwd strategies dispatched from `bootstrapper-config.yaml` (`subdir-then-move`, `native-cwd`, `git-clone`), strict conflict policy producing `.scaffold` siblings + always preserving `context/`, two verification slots (light pre-scaffold recency check + deep post-scaffold language-aware audit), severity-tiered audit summary, full verification log on disk.
- **NOT captured in v1 (deliberate)**: `AGENTS.md` / `CLAUDE.md` generation (deferred to a future Lesson 4 — "Memory Architecture"); per-starter cert-element placement overlays (live with the future agent-context skill, not here); CI workflow files; AI-as-bridge fallback for stacks outside the registry (deferred to v2 — in v1 chain-mode tech-stack-selector already gates on the registry, so the case cannot arise); standalone-mode where the user names a stack inline without a hand-off (deferred to v2); compensation actions for `bootstrapper_confidence: best-effort` or `quality_override: true` (surfaced in conversation but no automated follow-up — that, too, is the future memory-architecture skill's job).

### The conflict policy

When the skill moves files from a temp scaffold directory up into your current working directory, it applies a strict matrix:

- **`context/**`** — anything the scaffold tried to write under `context/` is **dropped**. Your `context/` is the source of truth for the bootstrap chain (PRD, tech-stack hand-off, plans, frames) and is never overwritten.
- **`.gitignore`** — append-merged: your existing lines stay in order, then the scaffold's lines are de-duped against your set and appended with a separator comment. Git's ignore semantics are additive, so combining is safe.
- **`package.json`, `README.md`, `CLAUDE.md`, `AGENTS.md`, root-level `*.md`** — your existing file wins; the scaffold's copy lands as `<filename>.scaffold` sibling. You can `diff README.md README.md.scaffold` to see what the starter shipped vs what you had.
- **Anything else** — moves silently if no conflict, sidelined as `<filename>.scaffold` if there is one. The matrix never deletes user files.

For the `git-clone` strategy (10x-astro-starter and similar): the cloned `.git/` is deleted before move-up, so the upstream starter's history does not leak into your repo. You initialise your own history afterwards (`git init`).

### Verification log

Every run writes `context/changes/bootstrap-verification/verification.md`. Sections:

- **`## Hand-off`** — verbatim copy of the tech-stack.md frontmatter and `## Why this stack` body.
- **`## Pre-scaffold verification`** — recency findings table (npm package version + `time.modified` for JS starters; GitHub `pushed_at` for any starter with a GitHub `docs_url`).
- **`## Scaffold log`** — the resolved CLI invocation, exit code, files moved, conflicts surfaced as `.scaffold` siblings, `.gitignore` handling.
- **`## Post-scaffold audit`** — full per-language audit output (`npm audit --json` for JS, `pip-audit` for Python, `cargo audit` for Rust, etc.). Severity-tiered: CRITICAL and HIGH surfaced inline in chat, MODERATE and LOW log-only. Direct-vs-transitive split where the tool supports it.
- **`## Hints recorded but not acted on`** — every hint from the hand-off bootstrapper read but did not act on in v1. Audit-trail completeness for the future memory-architecture skill.
- **`## Next steps`** — pointer text. v1 names "your project is scaffolded and verified — happy hacking" and flags the future Lesson 4 skill as the next chain link.

The folder (`context/changes/bootstrap-verification/`) deliberately has no `change.md`. Bootstrap runs are one-shot artifacts, not tracked workflow changes — the folder hosts the log and nothing else. Re-runs apply a warn-and-confirm guard before overwriting; the escape hatch is `verification-v2.md` (and so on).

### Foundation paths used by this lesson

- `context/foundation/tech-stack.md` — input (from Lesson 2)
- `context/changes/bootstrap-verification/verification.md` — output (the audit-trail log)
- `context/foundation/lessons.md` — recurring rules & pitfalls
- `docs/reference/contract-surfaces.md` — load-bearing names registry

### Universal language

The shipped skill carries no 10xDevs / cohort / certification references. The post-scaffold audit dispatches by `language_family` against a small lookup table; cohorts whose stack lands in `java`, `php`, `dart`, or a multi-language combination see a "no built-in audit tool for this ecosystem" log line and a recommended external tool, not a fake "0 findings" record.

Skills must not write to `context/archive/`. Archived changes are immutable; if a resolved target path starts with `context/archive/`, abort with: "This change is archived. Open a new change with `/10x-new` instead."

<!-- END @przeprogramowani/10x-cli -->

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

QA, nie programuje jeszcze, ~8h tygodniowo, termin 10.01.2027. Przy decyzjach projektowych podawaj warianty z kosztem (najszybszy / optymalny / najlepszy) zamiast jednego rozwiązania i nazywaj, co dany wybór przesądza na później.

## Stack

Projekt zescaffoldowany z `10x-astro-starter`: Astro 7 (SSR + API routes), React 19 (wyspy interaktywne), TypeScript, Tailwind 4, Supabase (PostgreSQL + auth + RLS), shadcn/ui, deploy na Cloudflare Workers. Log scaffoldu: `context/changes/bootstrap-verification/verification.md`.

`AGENTS.md` to symlink do tego pliku — jedno źródło reguł dla obu narzędzi.

### Komendy

- `npm run dev` — serwer deweloperski (runtime Cloudflare workerd)
- `npm run build` — build produkcyjny (SSR przez `@astrojs/cloudflare`)
- `npm run preview` — podgląd buildu produkcyjnego
- `npm run lint` / `npm run lint:fix` — ESLint z regułami type-checked
- `npm run format` — Prettier (z `prettier-plugin-astro` i `prettier-plugin-tailwindcss`)
- `npm run smoke` — test dymny ścieżki auth (`scripts/smoke.mjs`) przeciw działającemu serwerowi, zmienna `BASE_URL` (domyślnie `http://localhost:4321`). Uruchamiaj po aktualizacji zależności.

Pre-commit: husky + lint-staged uruchamia `eslint --fix` na `*.{ts,tsx,astro}` i `prettier --write` na `*.{json,css,md}`.

### Renderowanie

Pełny SSR (`output: "server"` w `astro.config.mjs`). Każda strona renderowana serwerowo. API routes muszą eksportować `const prerender = false`.

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
- **Astro** dla treści statycznej i layoutu; **React** tylko tam, gdzie potrzebna interaktywność.
- **Klasy Tailwind**: łącz helperem `cn()` z `@/lib/utils` (clsx + tailwind-merge). Nie sklejaj stringów z klasami ręcznie.
- **shadcn/ui**: komponenty w `src/components/ui/`, wariant "new-york". Nowe przez `npx shadcn@latest add [name]`.
- **API routes**: eksporty wielkimi literami (`GET`, `POST`); walidacja wejścia przez zod.
- **Migracje Supabase**: `supabase/migrations/`, nazwy `YYYYMMDDHHmmss_short_description.sql`. Na każdej nowej tabeli włączaj RLS z politykami per-operacja i per-rola — to jest mechanizm izolacji danych zdrowotnych per-konto z wymagań niefunkcjonalnych, nie opcja do odłożenia.
- **React**: bez dyrektyw Next.js (`"use client"` itp.). Hooki wydzielaj do `src/components/hooks/`.
- **Serwisy i helpery** w `src/lib/` (logika biznesowa w `src/lib/services/`).
- **Typy współdzielone** (encje, DTO) w `src/types.ts`.

### Środowisko

- Node.js 22.14.0 wg `.nvmrc`. Sprawdzone na v24.13.0: mimo ostrzeżenia `EBADENGINE` przy instalacji (`astro-eslint-parser` i `eslint-plugin-astro` deklarują `^22.22.3 || ^24.16.0 || >=26.3.0`) lint i build przechodzą czysto.
- Zmienne: `SUPABASE_URL`, `SUPABASE_KEY`. Skopiuj `.env.example` do `.env` (Node) albo `.dev.vars` (lokalny Cloudflare, gitignorowany).
- Lokalne Supabase: `npx supabase start` (wymaga Dockera).
- Deploy: `npx wrangler deploy` (wymaga konta Cloudflare i autoryzacji `wrangler`).

### CI

`.github/workflows/ci.yml` uruchamia lint + build na każdym pushu i PR do gałęzi `master`. Build wymaga sekretów repozytorium `SUPABASE_URL` i `SUPABASE_KEY`. Jeśli przemianujesz gałąź główną na `main`, popraw też te dwa miejsca w workflow.

## Blok CLI powyżej

Treść między znacznikami BEGIN i END @przeprogramowani/10x-cli (komentarze HTML otwierające i zamykające górną część pliku) należy do CLI i jest nadpisywana przez `10x get` / `10x sync`. Zmiany własne dopisuj wyłącznie poniżej znacznika zamykającego — i nie cytuj tych znaczników dosłownie, bo CLI liczy je w całym pliku i odmówi pracy przy duplikacie.
