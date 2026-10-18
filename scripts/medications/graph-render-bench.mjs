// How long the interaction graph adds to the server render of /leki (S-10, impl-review F1): buildInteractionGraph plus
// the server render of the InteractionGraph island (both layouts, every button and line) plus the serialisation of its
// props, which Astro writes into the HTML for `client:visible`. This is the part of /leki that grows with the number of
// medications and can break the 10 ms CPU limit of Cloudflare Workers; the list itself is plain markup. Outside
// `npm test` on purpose, so a slow CI machine gives no false failure.
//
// Same method as scripts/timeline/render-bench.mjs: a Vite dev server with the project's Astro config (no HTTP
// listener, no Cloudflare adapter) loads the TypeScript modules for this process. Node is not workerd — the difference
// is not measured, which is why the threshold leaves room below 10 ms for Supabase, the middleware and the runtime.
//
// Run: node scripts/medications/graph-render-bench.mjs — exits 1 when any account's median is above THRESHOLD_MS.

import { Buffer } from "node:buffer";
import path from "node:path";
import { performance } from "node:perf_hooks";

import { getViteConfig } from "astro/config";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { createServer } from "vite";

const WARM_UP_RUNS = 30;
const RUNS = 100;
// The threshold the timeline page (S-09) holds after the author's decision of 17.10.2026; hard limit is 10 ms.
const THRESHOLD_MS = 7;
const TODAY = "2026-10-18";

// [current, ended]: the account sizes from impl-review F1.
const ACCOUNTS = [
  [12, 0],
  [20, 20],
  [30, 60],
];

const root = path.join(import.meta.dirname, "../..");

const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

// `current` medications still taken and `ended` ones, interleaved in time as a long diary would hold them: one a day
// from 01.01.2025, every ended one discontinued 30 days after it was added. About one pair per two current medications,
// with the description length of the real pairs.
function account(current, ended) {
  const total = current + ended;
  const endedEvery = ended === 0 ? 0 : total / ended;
  const history = [];
  const currentRows = [];
  let endedSoFar = 0;
  for (let i = 0; i < total; i += 1) {
    const n = i + 1;
    const createdAt = new Date(Date.UTC(2025, 0, 1 + i, 8)).toISOString();
    const isEnded = endedEvery > 0 && endedSoFar < ended && (i + 1) % endedEvery < 1;
    if (isEnded) endedSoFar += 1;
    history.push({
      id: id(n),
      createdAt,
      discontinuedAt: isEnded ? new Date(Date.UTC(2025, 0, 31 + i, 8)).toISOString() : null,
    });
    if (!isEnded) currentRows.push({ id: id(n), name: `Lek testowy ${String(n)} 20 mg` });
  }
  const description =
    "Jednoczesne stosowanie tych leków może mieć związek z większym ryzykiem krwawienia. Warto porozmawiać o tym z lekarzem.";
  const interactions = [];
  for (let i = 0; i + 1 < currentRows.length; i += 2) {
    const [a, b] = [currentRows[i].id, currentRows[(i + 3) % currentRows.length].id];
    if (a === b) continue;
    interactions.push(
      {
        medication_id: a,
        other_medication_id: b,
        pair_id: `pair-${String(i)}`,
        group_a: "M01A",
        group_b: "B01AA",
        description,
      },
      {
        medication_id: b,
        other_medication_id: a,
        pair_id: `pair-${String(i)}`,
        group_a: "B01AA",
        group_b: "M01A",
        description,
      },
    );
  }
  return { history, current: currentRows, interactions, today: TODAY };
}

const viteConfig = await getViteConfig(
  { root, logLevel: "error", server: { middlewareMode: true, hmr: false, watch: null } },
  { root, logLevel: "error", configFile: false },
)({ mode: "development", command: "serve" });
const server = await createServer({
  ...viteConfig,
  configFile: false,
  cacheDir: path.join(root, "node_modules/.vite-render-bench"),
});

let exitCode = 0;
try {
  const { buildInteractionGraph } = await server.ssrLoadModule("/src/lib/services/interaction-graph.ts");
  const { default: InteractionGraph } = await server.ssrLoadModule("/src/components/medications/InteractionGraph.tsx");

  for (const [current, ended] of ACCOUNTS) {
    const input = account(current, ended);
    const run = () => {
      const model = buildInteractionGraph(input);
      return JSON.stringify(model) + renderToString(createElement(InteractionGraph, { model }));
    };

    let html = "";
    for (let i = 0; i < WARM_UP_RUNS; i += 1) html = run();

    const times = [];
    for (let i = 0; i < RUNS; i += 1) {
      const started = performance.now();
      run();
      times.push(performance.now() - started);
    }
    times.sort((a, b) => a - b);
    const median = (times[RUNS / 2 - 1] + times[RUNS / 2]) / 2;
    const p95 = times[Math.ceil(0.95 * RUNS) - 1];
    const verdict = median > THRESHOLD_MS ? "FAIL" : "PASS";
    if (verdict === "FAIL") exitCode = 1;
    console.log(
      `${String(current)} current + ${String(ended)} ended, ${String(input.interactions.length / 2)} pairs: ` +
        `median ${median.toFixed(2)} ms, p95 ${p95.toFixed(2)} ms, max ${times.at(-1).toFixed(2)} ms, ` +
        `HTML ${(Buffer.byteLength(html, "utf8") / 1024).toFixed(1)} KiB — ${verdict} (median <= ${String(THRESHOLD_MS)} ms)`,
    );
  }
} finally {
  await server.close();
}
process.exit(exitCode);
