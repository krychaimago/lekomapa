<!-- BEGIN @przeprogramowani/10x-cli -->

## 10xDevs AI Toolkit — Module 1, Lesson 4

Onboard the agent to the project you scaffolded in Lesson 3 with the **agent-context chain**:

```
(/10x-init  →  /10x-shape  →  /10x-prd  →  /10x-tech-stack-selector  →  /10x-bootstrapper)  →  /10x-agents-md  →  /10x-rule-review  →  /10x-lesson
```

The PRD → tech-stack → bootstrap chain ships from Lessons 1–3 (re-included so you can fix the project mid-flight). `/10x-agents-md`, `/10x-rule-review`, and `/10x-lesson` are the lesson's main topics. The chain extends in Lesson 5 to the infra/deploy step.

### Task Router — Where to start

| Skill | Use it when |
| --- | --- |
| **Agent context (lesson focus)** | |
| `/10x-agents-md` | The repo is scaffolded but the agent has no project-specific onboarding. Inspects the repo (package manifest, README, scripts, lint/test config, layout, commit history) and writes a concise, ordered "Repository Guidelines" to `AGENTS.md` (or, when invoked from a subdirectory, a directory-level `AGENTS.md` reframed around local conventions and the dominant unit). Use as an alternative to the host's built-in `/init` or as a fallback for tools without one. Repo-level body targets ~200 lines; directory-level guides target 120–250 words. |
| `/10x-rule-review <path>` | You have a rules-for-AI file (`AGENTS.md`, `CLAUDE.md`, `.cursor/rules/*.mdc`, `.github/copilot-instructions.md`, `.windsurfrules`, nested per-area files) and want a 5-axis scorecard: length, embedded code/config snippets, precision of language, redundancy with public knowledge, and rule ordering. Tool-agnostic — scores the artifact's condition, not the project. Default output is read-only; only Check 5 (reorder) may edit, and only with explicit approval. |
| `/10x-lesson [seed]` | You spotted a recurring rule worth surfacing for future runs of `/10x-frame`, `/10x-research`, `/10x-plan`, `/10x-plan-review`, `/10x-implement`, and `/10x-impl-review`. Appends a single entry (Context / Problem / Rule / Applies to) to `context/foundation/lessons.md`. Self-bootstraps the file with the canonical `# Lessons Learned` header on first use. Append-only — never reorders or rewrites prior entries. |
| **Re-run upstream if needed** | |
| `/10x-init` / `/10x-shape` / `/10x-prd` / `/10x-tech-stack-selector` / `/10x-bootstrapper` / `/10x-stack-assess` / `/10x-health-check` | Bundled so you can fix the PRD, swap the stack, or re-scaffold mid-flight. If `/10x-rule-review` flags a `FAIL` you can't shrink your way out of, that often points back to ambiguous PRD or stack decisions — re-run the upstream skill rather than padding `AGENTS.md` with corrections. |

### How the chain hands off

- `/10x-agents-md` writes (or surgically updates) `AGENTS.md` at the resolved scope. Repo-level scope = the file lives at the repo root and frames the project as a whole; directory-level scope = the file lives next to the code it governs and reframes around the local unit, dropping repo-wide framing entirely. The skill never silently overwrites — it switches to an update flow when the target exists.
- `/10x-rule-review` reads any rules-for-AI markdown file you point it at and prints a 5-check scorecard (`OK` / `WARN` / `FAIL`) with concrete fixes. It does not depend on `/10x-agents-md` having run; you can review `.cursor/rules/`, copilot instructions, or a hand-written `CLAUDE.md` the same way.
- `/10x-lesson` self-bootstraps `context/foundation/lessons.md` on first use, then appends one Context/Problem/Rule/Applies-to entry per invocation. The file is consumed as a prior by the planning- and review-phase skills introduced later in the workflow — `/10x-frame`, `/10x-research`, `/10x-plan`, `/10x-plan-review`, `/10x-implement`, `/10x-impl-review`.

### What the lesson's skills capture (and what they do NOT)

- **`/10x-agents-md` captures**: project structure, build/test/lint commands actually present in scripts, commit conventions inferred from history, repo-specific tripwires the agent would otherwise miss, references to canonical files via `@`-paths instead of pasting their content. Directory-level scope additionally captures: local naming/layout patterns inferred from siblings, allowed/forbidden imports, the test pattern used by neighbours, and tripwires visible in the immediate area.
- **`/10x-agents-md` does NOT** paste in the contents of `tsconfig.json` / `eslint.config` / framework docs the agent already knows; it does NOT generate generic "write clean code" intentions; it does NOT replace the host's built-in `/init` when one exists — it's positioned as an alternative or fallback, not a default.
- **`/10x-rule-review` captures**: a length verdict (OK ≤ 200 non-empty lines, WARN 201–500, FAIL 501+), code/config blocks that should be `@`-references instead, vague-intention language, redundancy with framework docs the agent already has from training, and a Check 5 reorder proposal that surfaces critical rules to the top.
- **`/10x-rule-review` does NOT** edit the file by default; it does NOT score project content (architecture, stack choices) — it scores the rule artifact's condition; it does NOT generate a "fixed version" of the file (Check 5 may move sections with explicit approval, never rewrite rule wording).
- **`/10x-lesson` captures**: one entry per invocation with a short imperative H2 title (the title IS the rule), Context (subsystem / phase / file pattern, specific enough to pattern-match), Problem (what concretely breaks without the rule, ideally with a past incident), Rule (1–2 imperative sentences pasteable verbatim into a future review finding), Applies to (subset of `frame`, `research`, `plan`, `plan-review`, `implement`, `impl-review`, or `all`).
- **`/10x-lesson` does NOT** edit or remove existing lessons — the file is append-only by design (rewriting recurring rules without thought is the failure mode this convention prevents); it does NOT batch multiple rules per invocation; it does NOT pre-fill fields proactively (the user does the writing — that's the price of capturing rules outside a structured review).

### The inclusion test (the filter for AGENTS.md / CLAUDE.md)

Before you add a rule to any rules-for-AI file, ask: *could the agent know this without this file? Could public training data — books, blogs, repos in this stack — have prepared it for this?* If yes, drop it. If no, keep it. The file is onboarding for an agent that already knows TypeScript / Python / your framework but does NOT know your local conventions.

Belongs:
- non-obvious project conventions (error-response shape, file naming, allowed import paths)
- project-specific traps and "embarrassing" workarounds tied to history or dependency bugs
- referenced canonical files via `@`-paths (e.g. `@src/features/users/user.service.ts` as a pattern reference, not pasted code)

Does NOT belong:
- mainstream framework documentation
- README content the agent will read anyway (link with `@README.md`)
- popular generic advice ("use TypeScript strict mode") that's already enforced by config
- intention statements ("write clean code", "follow good practices") — convert to a checkable behaviour or drop

### U-shaped attention and granular rules

LLMs attend most strongly to the start and end of context (Lost-in-the-Middle / U-shaped attention). A long monolithic `CLAUDE.md` puts its middle rules in the weakest attention zone. Two practical consequences:

1. **Most important rules go to the top** of any rule file.
2. **Per-area rules belong next to their code** — nested `AGENTS.md` / `CLAUDE.md` inside `src/api/`, `.cursor/rules/*.mdc` with file globs, etc. Granular files are loaded selectively and arrive whole near the start of their own section, instead of being buried at line 400 of one big file.

`/10x-rule-review` Check 5 (reorder) operationalizes consequence (1); the inclusion test plus directory-level `/10x-agents-md` operationalizes consequence (2).

### The five-pattern calibration drill

Before writing a rule, validate that the agent actually breaks the convention without it. Pick one pattern from your project (error-response shape, file naming, import style, module structure, date handling). Then:

1. Ask the agent to implement against the pattern 3–5 times from a clean state, no rule.
2. Note where it broke the convention; capture run time, files explored, and visible cost/tokens if the host surfaces them.
3. Add a 1–3-sentence rule to the appropriate scope (root or area-level).
4. Re-run the same task in a fresh session and compare convention adherence, time, files, and iterations.

If the agent already trends toward the convention without the rule, you don't need the rule. If it systematically picks the wrong pattern, you've found a high-leverage rule to add. This drill is what "earning a rule from a recurring failure" actually looks like.

### Hierarchy and tool interop

- **Claude Code** loads `CLAUDE.md` from the user dir (`~/.claude/CLAUDE.md`), the repo root, and any subdirectory the agent works under. Deeper files override or supplement higher ones.
- **Codex** and **GitHub Copilot** load `AGENTS.md` from the current directory upward — closest file wins.
- One canonical file is preferable to three duplicates. A common pattern: `AGENTS.md` as source of truth, `CLAUDE.md` as a thin Claude-Code shim with `@AGENTS.md` import, `.github/copilot-instructions.md` only if Copilot needs its own additions. Symlink (`ln -s AGENTS.md CLAUDE.md`) is the simplest deduplication when tools require both names.
- Auto-memory (e.g. Claude Code's `~/.claude/projects/<dir-with-slashes-as-dashes>/memory/MEMORY.md`) is local to the machine and not a substitute for `AGENTS.md`. Team-binding rules live in the repo; auto-memory is a personal cache, periodically reviewable.

### Inner-loop hooks (deterministic feedback without prompting)

Mechanical, non-pickable checks belong in hooks (e.g. Claude Code's `PostToolUse`), not in the rule file. The agent finishes an edit; a formatter or fast lint runs; the result feeds back without you reminding it. Settings template (`settings.json.template`) ships in the lesson pack as the wiring entry point. Keep procedural workflows (deeper review, release checklist, deploy on sandbox) in skills, and reserve hooks for deterministic tool signals.

### Foundation paths used by this lesson

- `AGENTS.md` / `CLAUDE.md` (and per-area variants) — `/10x-agents-md` output
- `context/foundation/lessons.md` — `/10x-lesson` output (append-only register, consumed by future planning/review skills)
- `context/foundation/prd.md`, `context/foundation/tech-stack.md` — inputs from earlier lessons, still present
- `docs/reference/contract-surfaces.md` — load-bearing names registry (scaffolded by `/10x-init`)

### Universal language

The shipped skills carry no 10xDevs / cohort / certification references. `/10x-agents-md` discovers from the repo it's invoked in; `/10x-rule-review` is tool-agnostic and treats every file as "a rules-for-AI artifact"; `/10x-lesson` writes one entry shape regardless of project domain. The 5-pattern calibration drill is illustrative — substitute patterns from your own stack.

Skills must not write to `context/archive/`. Archived changes are immutable; if a resolved target path starts with `context/archive/`, abort with: "This change is archived. Open a new change with `/10x-new` instead."

<!-- END @przeprogramowani/10x-cli -->

## Twarde reguły

Trzy rzeczy, których naruszenie kosztuje najwięcej. Pełne brzmienie w sekcjach niżej.

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

- Pisz zwięźle, najważniejsze rzeczy w bulletach. Długie bloki prozy rozbijają skupienie i kosztują zrozumienie — to nie preferencja stylu.
- Przy decyzjach projektowych podawaj warianty z kosztem (najszybszy / optymalny / najlepszy) zamiast jednego rozwiązania.
- Nazywaj, co dany wybór przesądza na później.

## Stack

Projekt zescaffoldowany z `10x-astro-starter`: Astro 7 (SSR + API routes), React 19 (wyspy interaktywne), TypeScript, Tailwind 4, Supabase (PostgreSQL + auth + RLS), shadcn/ui, deploy na Cloudflare Workers. Log scaffoldu: `context/changes/bootstrap-verification/verification.md`.

`AGENTS.md` to symlink do tego pliku — jedno źródło reguł dla obu narzędzi.

`README.md` opisuje lekomapę (setup, komendy, Supabase, CI, deploy) i linkuje do PRD. Źródłem prawdy o wymaganiach pozostaje PRD — przy rozbieżności popraw README.

### Komendy

- `npm run dev` — serwer deweloperski (runtime Cloudflare workerd)
- `npm run build` — build produkcyjny (SSR przez `@astrojs/cloudflare`)
- `npm run preview` — podgląd buildu produkcyjnego
- `npm run lint` / `npm run lint:fix` — ESLint z regułami type-checked
- `npm run format` — Prettier (z `prettier-plugin-astro` i `prettier-plugin-tailwindcss`)
- `npm run typecheck` — `astro check`. CI ma to jako osobną bramkę, odpal przed pushem.
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
- **API routes**: eksporty wielkimi literami (`GET`, `POST`), `export const prerender = false`; walidacja wejścia przez zod — zod nie jest jeszcze zainstalowany, pierwsza route go dociąga (`npm i zod`).
- **Migracje Supabase**: `supabase/migrations/`, nazwy `YYYYMMDDHHmmss_short_description.sql`. Na każdej nowej tabeli włączaj RLS z politykami per-operacja i per-rola — to jest mechanizm izolacji danych zdrowotnych per-konto z wymagań niefunkcjonalnych, nie opcja do odłożenia.
- **React**: bez dyrektyw Next.js (`"use client"` itp.). Hooki wydzielaj do `src/components/hooks/`.
- **Serwisy i helpery** w `src/lib/` (logika biznesowa w `src/lib/services/`).
- **Typy współdzielone** (encje, DTO) w `src/types.ts`. Plik jeszcze nie istnieje — utwórz przy pierwszym typie, nie rozsypuj typów po komponentach.

Katalogi `src/lib/services/`, `src/components/hooks/` i `supabase/migrations/` też jeszcze nie istnieją — to docelowe miejsca, nie opis stanu repozytorium.

### Środowisko

- Node.js 22.14.0 wg `.nvmrc`. Sprawdzone na v24.13.0: mimo ostrzeżenia `EBADENGINE` przy instalacji (`astro-eslint-parser` i `eslint-plugin-astro` deklarują `^22.22.3 || ^24.16.0 || >=26.3.0`) lint i build przechodzą czysto.
- Zmienne: `SUPABASE_URL`, `SUPABASE_KEY`. Skopiuj `.env.example` do `.env` (Node) albo `.dev.vars` (lokalny Cloudflare, gitignorowany).
- Lokalne Supabase: `npx supabase start` (wymaga Dockera).
- Deploy: `npx wrangler deploy` (wymaga konta Cloudflare i autoryzacji `wrangler`).

### CI

`.github/workflows/ci.yml`, push i PR do `main`, dwa joby:

- `ci` — `npm ci`, `npx astro sync`, `npm run lint`, `npx astro check`, `npm run build`. Build wymaga sekretów repozytorium `SUPABASE_URL` i `SUPABASE_KEY`.
- `smoke` — podnosi lokalne Supabase (`supabase start`), buduje, `npm run preview` na porcie 4321, `npm run smoke`.

## Blok CLI powyżej

Treść między znacznikami BEGIN i END @przeprogramowani/10x-cli (komentarze HTML otwierające i zamykające górną część pliku) należy do CLI i jest nadpisywana przez `10x get` / `10x sync`. Zmiany własne dopisuj wyłącznie poniżej znacznika zamykającego — i nie cytuj tych znaczników dosłownie, bo CLI liczy je w całym pliku i odmówi pracy przy duplikacie.
