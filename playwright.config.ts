import { existsSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";

// E2E_USERNAME, E2E_PASSWORD (and an optional E2E_PORT) come from the gitignored .env.e2e.
// .env is never loaded here: it points at the production Supabase.
if (existsSync(".env.e2e")) process.loadEnvFile(".env.e2e");

// 4321 is the Astro preview default (no port set in astro.config.mjs or package.json).
// E2E_PORT overrides it when that port is taken on this machine.
const PORT = Number(process.env.E2E_PORT ?? 4321);
const baseURL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "html",
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "setup", testMatch: /.*\.setup\.ts/ },
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], storageState: "playwright/.auth/user.json" },
      dependencies: ["setup"],
    },
  ],
  webServer: {
    // Production-like build + preview, on the port above.
    command: `npm run build && npm run preview -- --port ${PORT}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: {
      // Astro 7 moves `astro preview` into a background daemon when it detects an agent; keep it in the foreground.
      ASTRO_PREVIEW_BACKGROUND: "1",
      // The Cloudflare preview runtime would otherwise read .env (production Supabase) over .dev.vars (local).
      // Measured 2026-10-01: with this flag a sign-in from the preview reaches the local auth container.
      CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV: "false",
    },
  },
});
