// @ts-check
import { defineConfig, envField } from "astro/config";

import react from "@astrojs/react";
import sitemap from "@astrojs/sitemap";
import tailwindcss from "@tailwindcss/vite";
import cloudflare from "@astrojs/cloudflare";

// https://astro.build/config
export default defineConfig({
  site: "https://lekomapa.pl",
  output: "server",
  // The former start screen. 302, not 301: browsers cache a 301 permanently, so if /dashboard ever returned as a
  // screen, old browsers would keep fleeing it. Served by Cloudflare from _redirects before the Worker runs.
  redirects: {
    "/dashboard": { status: 302, destination: "/leki" },
  },
  integrations: [react(), sitemap()],
  vite: {
    plugins: [tailwindcss()],
  },
  adapter: cloudflare(),
  env: {
    schema: {
      SUPABASE_URL: envField.string({ context: "server", access: "secret", optional: true }),
      SUPABASE_KEY: envField.string({ context: "server", access: "secret", optional: true }),
      // No value means the error is only logged, never a failure.
      SENTRY_DSN: envField.string({ context: "server", access: "secret", optional: true }),
      // Production sets nothing; the developer machine sets "local" in .dev.vars. Secret, so it is read at runtime like
      // the cron task reads it, never baked into the bundle by the build.
      SENTRY_ENVIRONMENT: envField.string({
        context: "server",
        access: "secret",
        optional: true,
        default: "production",
      }),
    },
  },
});
