// How long the whole body of /wizyta/os-czasu takes on the heavy account (S-09): buildTimeline plus the render of
// TimelineView.astro — every range, both layouts, the rows of every symptom and the text list. This, not the logic
// alone (scripts/timeline/bench.mjs), is what can break the 10 ms CPU limit of Cloudflare Workers. Outside `npm test`
// on purpose, so a slow CI machine gives no false failure.
//
// `node` does not load .astro files, so the script starts a Vite dev server with the project's Astro config (no HTTP
// listener) and loads the component through it, without the Cloudflare adapter; the render goes through the Astro Container API. Node is not workerd
// — the difference is not measured, which is why the threshold leaves room below 10 ms for Supabase, the middleware
// and the runtime.
//
// Run: node scripts/timeline/render-bench.mjs — exits 1 when the median is above THRESHOLD_MS.

import { Buffer } from "node:buffer";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { gzipSync } from "node:zlib";

import { getViteConfig } from "astro/config";
import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { createServer } from "vite";

import { heavyAccount } from "./heavy-fixture.mjs";

const WARM_UP_RUNS = 50;
const RUNS = 200;
const THRESHOLD_MS = 7; // raised from 5 ms by the author on 17.10.2026 (change.md, phase 3 notes); hard limit is 10 ms

const root = path.join(import.meta.dirname, "../..");

const viteConfig = await getViteConfig(
  { root, logLevel: "error", server: { middlewareMode: true, hmr: false, watch: null } },
  // Without astro.config.mjs: the Cloudflare adapter moves the server environment into workerd, where Vite cannot
  // load a module for this process. The component needs nothing from that config — no integration, no astro:env.
  { root, logLevel: "error", configFile: false },
)({ mode: "development", command: "serve" });
// Own cache dir: the default node_modules/.vite is shared with `astro dev`, and a dependency pre-bundle written here
// with a different config left the dev server requesting files that no longer existed.
const server = await createServer({
  ...viteConfig,
  configFile: false,
  cacheDir: path.join(root, "node_modules/.vite-render-bench"),
});

let exitCode = 0;
try {
  const { buildTimeline } = await server.ssrLoadModule("/src/lib/services/timeline.ts");
  const { default: TimelineView } = await server.ssrLoadModule("/src/components/timeline/TimelineView.astro");
  const container = await AstroContainer.create();

  const input = heavyAccount();
  const renderPage = () => container.renderToString(TimelineView, { props: { model: buildTimeline(input) } });

  let html = "";
  for (let i = 0; i < WARM_UP_RUNS; i += 1) html = await renderPage();

  const times = [];
  for (let i = 0; i < RUNS; i += 1) {
    const started = performance.now();
    await renderPage();
    times.push(performance.now() - started);
  }
  times.sort((a, b) => a - b);

  const percentile = (p) => times[Math.min(times.length - 1, Math.ceil((p / 100) * times.length) - 1)];
  const median = (times[RUNS / 2 - 1] + times[RUNS / 2]) / 2;
  const p95 = percentile(95);

  const entries = input.symptoms.reduce((sum, symptom) => sum + symptom.entries.length, 0);
  const bytes = Buffer.byteLength(html, "utf8");
  const gzipped = gzipSync(html).length;
  console.log(
    `buildTimeline + TimelineView render: ${input.medications.length} medications, ${entries} entries, ` +
      `${input.symptoms.length} symptoms, ${RUNS} runs`,
  );
  console.log(`HTML ${(bytes / 1024).toFixed(1)} KiB (gzip ${(gzipped / 1024).toFixed(1)} KiB)`);
  console.log(`median ${median.toFixed(3)} ms, p95 ${p95.toFixed(3)} ms (threshold: median <= ${THRESHOLD_MS} ms)`);

  if (median > THRESHOLD_MS) {
    console.error(`FAIL: median ${median.toFixed(3)} ms is above ${THRESHOLD_MS} ms`);
    exitCode = 1;
  } else {
    console.log("PASS");
  }
} finally {
  await server.close();
}
process.exit(exitCode);
