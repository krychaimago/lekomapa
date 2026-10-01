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
