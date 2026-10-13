// Worker entry file. Requests go to the Astro adapter's handler exactly as with its default entry
// (`@astrojs/cloudflare/entrypoints/server` is just `{ fetch: handle }`); `scheduled` adds the 15-minute check for
// runs killed for exceeding the CPU limit (src/lib/observability/exceeded-cpu.ts, cron in wrangler.jsonc).

import { handle } from "@astrojs/cloudflare/handler";

import { runExceededCpuCheck } from "./lib/observability/exceeded-cpu.ts";
import type { CronEnv } from "./lib/observability/exceeded-cpu.ts";

export default {
  fetch: handle,
  // Secrets come from `env`, not `astro:env`: the scheduled handler runs outside an Astro request.
  scheduled(controller: ScheduledController, env: Env & CronEnv, ctx: ExecutionContext): void {
    ctx.waitUntil(runExceededCpuCheck({ env, scheduledTime: controller.scheduledTime, fetchImpl: fetch }));
  },
} satisfies ExportedHandler<Env & CronEnv>;
