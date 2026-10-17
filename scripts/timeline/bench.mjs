// How long buildTimeline takes on the heavy account (S-09): the lower bound of the page's CPU time, measured before the
// screen exists. Cloudflare Workers allow 10 ms of CPU per request; the logic is a fraction of the request, the rest is
// the Astro render. Outside `npm test` on purpose, so a slow CI machine gives no false failure.
//
// Run: node --experimental-strip-types scripts/timeline/bench.mjs — exits 1 when the median is above THRESHOLD_MS.

import { performance } from "node:perf_hooks";

import { buildTimeline } from "../../src/lib/services/timeline.ts";
import { heavyAccount } from "./heavy-fixture.mjs";

const WARM_UP_RUNS = 50;
const RUNS = 200;
const THRESHOLD_MS = 2;

const input = heavyAccount();

for (let i = 0; i < WARM_UP_RUNS; i += 1) buildTimeline(input);

const times = [];
for (let i = 0; i < RUNS; i += 1) {
  const started = performance.now();
  buildTimeline(input);
  times.push(performance.now() - started);
}
times.sort((a, b) => a - b);

const percentile = (p) => times[Math.min(times.length - 1, Math.ceil((p / 100) * times.length) - 1)];
const median = (times[RUNS / 2 - 1] + times[RUNS / 2]) / 2;
const p95 = percentile(95);

const entries = input.symptoms.reduce((sum, symptom) => sum + symptom.entries.length, 0);
console.log(
  `buildTimeline: ${input.medications.length} medications, ${entries} entries, ${input.symptoms.length} symptoms, ${RUNS} runs`,
);
console.log(`median ${median.toFixed(3)} ms, p95 ${p95.toFixed(3)} ms (threshold: median <= ${THRESHOLD_MS} ms)`);

if (median > THRESHOLD_MS) {
  console.error(`FAIL: median ${median.toFixed(3)} ms is above ${THRESHOLD_MS} ms`);
  process.exit(1);
}
console.log("PASS");
