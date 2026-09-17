---
bootstrapped_at: 2026-09-16T00:00:00Z
starter_id: 10x-astro-starter
starter_name: "10x Astro Starter (Astro + Supabase + Cloudflare)"
project_name: notatnik-zdrowia
language_family: js
package_manager: npm
cwd_strategy: git-clone
bootstrapper_confidence: first-class
phase_3_status: ok
audit_command: "npm audit --json"
---

## Hand-off

Frontmatter z `context/foundation/tech-stack.md`:

```yaml
starter_id: 10x-astro-starter
package_manager: npm
project_name: notatnik-zdrowia
hints:
  language_family: js
  team_size: solo
  deployment_target: cloudflare-pages
  ci_provider: github-actions
  ci_default_flow: auto-deploy-on-merge
  bootstrapper_confidence: first-class
  path_taken: standard
  quality_override: false
  self_check_answers: null
  has_auth: true
  has_payments: false
  has_realtime: false
  has_ai: false
  has_background_jobs: false
```

### Why this stack

PRD opisuje web-app dla jednej osoby, o małej skali i małym wolumenie danych, z twardym terminem 2027-01-10 i budżetem 5 tygodni MVP realizowanych po godzinach. Przy takim budżecie największym pojedynczym kosztem poza rdzeniem produktu jest konto użytkownika: FR-001 i FR-002 wymagają rejestracji, logowania loginem i hasłem oraz odzyskiwania dostępu, a wymagania niefunkcjonalne żądają izolacji danych zdrowotnych per-konto i dostępu z wielu urządzeń. 10x-astro-starter niesie to gotowe — Supabase dostarcza PostgreSQL, uwierzytelnianie i Row Level Security, więc autorka pisze reguły kolizji i dzienniczek, a nie warstwę auth. TypeScript w całym projekcie plus jawne schematy na granicach dają agentowi kontrakty, z których może wnioskować bez uruchamiania programu, co ma znaczenie dla osoby, która jeszcze nie programuje i pracuje z agentem. Tailwind i konwencje Astro pokrywają wymóg pełnej używalności na ekranie telefonu. Cloudflare Pages to domyślny cel wdrożenia startera i najkrótsza droga do pierwszego deployu; brak zadań w tle, płatności, realtime i AI w zakresie MVP oznacza, że ograniczenia edge runtime nie dotykają tego produktu. Starter przechodzi wszystkie cztery bramki jakości dla agenta.

> Uwaga dopisana 2026-09-17: nazwa produktu została później ustalona na **lekomapa** (domena `lekomapa.pl`, repozytorium `krychaimago/lekomapa`). Pole `project_name: notatnik-zdrowia` powyżej zostaje w brzmieniu z chwili przebiegu — to log audytowy, zapisuje stan hand-offu, na którym bootstrapper faktycznie działał.

## Pre-scaffold verification

| Signal      | Value                                                        | Severity | Notes |
| ----------- | ------------------------------------------------------------ | -------- | ----- |
| npm package | not run                                                       | n/a      | `cmd_template` starts with `git clone`; no npm-distributed CLI to resolve |
| GitHub repo | `przeprogramowani/10x-astro-starter` last pushed 2026-09-12   | fresh    | from `card.docs_url`; `gh` CLI unavailable, queried via `https://api.github.com` |

## Scaffold log

**Resolved invocation**: `git clone https://github.com/przeprogramowani/10x-astro-starter .bootstrap-scaffold && cd .bootstrap-scaffold && npm install`
**Strategy**: git-clone
**Exit code**: 0
**Files moved**: 21 top-level entries (54 project files excluding `node_modules`); 653 packages installed by `npm install`
**Conflicts (.scaffold siblings)**: `CLAUDE.md.scaffold`
**.gitignore handling**: moved silently (absent in cwd before the run)
**.bootstrap-scaffold cleanup**: deleted
**Upstream .git/**: deleted before move-up, per the git-clone strategy

Install warnings captured (non-fatal, exit code 0):

```
npm warn ERESOLVE overriding peer dependency (eslint-plugin-react@7.37.5 vs eslint@10.10.0)
npm warn EBADENGINE astro-eslint-parser@3.1.0 requires node ^22.22.3 || ^24.16.0 || >=26.3.0; current v24.13.0
npm warn EBADENGINE eslint-plugin-astro@3.1.0 requires node ^22.22.3 || ^24.16.0 || >=26.3.0; current v24.13.0
```

Local Node is v24.13.0; two dev dependencies declare a floor of v24.16.0. Install succeeded anyway, but the lint toolchain may misbehave until Node is bumped. The repo ships a `.nvmrc` — check it against the local version.

## Post-scaffold audit

**Tool**: `npm audit --json`
**Summary**: 0 CRITICAL, 0 HIGH, 0 MODERATE, 0 LOW
**Direct vs transitive**: no findings to split. Tree size: 802 dependencies total (360 prod, 269 dev, 165 optional, 25 peer).

Clean tree. No advisory blocks to record.

## Hints recorded but not acted on

| Hint                    | Value                  |
| ----------------------- | ---------------------- |
| bootstrapper_confidence | first-class            |
| quality_override        | false                  |
| path_taken              | standard               |
| self_check_answers      | null                   |
| team_size               | solo                   |
| deployment_target       | cloudflare-pages       |
| ci_provider             | github-actions         |
| ci_default_flow         | auto-deploy-on-merge   |
| has_auth                | true                   |
| has_payments            | false                  |
| has_realtime            | false                  |
| has_ai                  | false                  |
| has_background_jobs     | false                  |

## Next steps

Next: a future skill will set up agent context (CLAUDE.md, AGENTS.md). For now, your project is scaffolded and verified — happy hacking.

Useful manual steps in the meantime:
- `git init` (if you have not already) to start your own repo history.
- Review `CLAUDE.md.scaffold` against the existing `CLAUDE.md` and decide what to merge — the starter ships its own agent instructions, and the project's own `CLAUDE.md` carries the product rules.
- Copy `.env.example` to `.env` and fill in the Supabase credentials before the first run.
- Check `.nvmrc` against the local Node version (currently v24.13.0; two dev dependencies want v24.16.0 or newer).
- No audit findings to address on this run.
