// Seeds the measurement account of the interaction graph (S-10, phase 3 of context/changes/interaction-graph/plan.md)
// into the LOCAL Supabase, for the Lighthouse LCP runs on /leki: 12 current medications, every one saved from a coded
// dictionary substance, so medication_interactions() finds at least 4 checked pairs among them.
//
// Run (needs `npx supabase start`; the target is .dev.vars, never .env, which points at production):
//
//   node --experimental-strip-types scripts/medications/seed-graph-heavy.mjs
//
// Optional environment: GRAPH_EMAIL, GRAPH_PASSWORD (the account to create; defaults below), SUPABASE_URL and
// SUPABASE_KEY (default: read from .dev.vars). The script refuses to run when SUPABASE_URL is not a local address.
// Sign in with the printed address afterwards. Remove the account through /konto/usun (or the Supabase panel of the
// local instance) before seeding it again: the script refuses an account that already holds medications.
//
// How the data gets in, and why:
//   - The account is created through Supabase Auth (signUp with the current terms version), as the app does; local
//     sign-ups need no e-mail confirmation (supabase/config.toml), so the script signs in with the password right away.
//   - Every medication goes in as the signed-in account through add_medication_from_leaflet, the same function the
//     leaflet route calls, so RLS and every history guard stay on. Start date 2 days back, inside what the app allows.
//   - Afterwards psql in the local database container (the one scripts/db-checks.mjs uses) checks that the account
//     and its 12 medications are in THIS database: a write that went to another Supabase fails the run.
//   - The pair count is read back through medication_interactions() as the account, never assumed from the list.

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { createClient } from "@supabase/supabase-js";

import { CURRENT_TERMS_VERSION } from "../../src/lib/copy/terms.ts";
import { CONFIG_PATH, containerName, parseProjectId } from "../db-checks.mjs";

const REPO_ROOT = path.resolve(import.meta.dirname, "../..");
const DEV_VARS_PATH = path.join(REPO_ROOT, ".dev.vars");
const EMAIL = process.env.GRAPH_EMAIL ?? "graph-heavy@example.test";
const PASSWORD = process.env.GRAPH_PASSWORD ?? "Heavy-Graph-Passw0rd!";
const MIN_PAIRS = 4;

// 12 coded dictionary names (registry_substances.normalized_name with one ATC code each). Pairs among them in
// supabase/seed-data/interaction_pairs.csv include M01AE with B01AA, C09AA, C09CA, N06AB and B01AC; C09AA with C09CA;
// C07AB with C08CA; C08CA with C10AA. Omeprazole, paracetamol and indapamide are in no pair. Product names are
// realistic and distinct from the first word on, so names cut to two lines on the graph's buttons stay distinguishable
// (local test data; the name is only saved, the substance alone decides the pairs). "Apap", not "Apap Extra": the
// script saves one substance, and Apap Extra also holds caffeine.
const MEDICATIONS = [
  { name: "Ibuprom Max", substance: "ibuprofenum" }, // M01AE
  { name: "Acenocumarol WZF 4 mg", substance: "acenocoumarolum" }, // B01AA
  { name: "Ramipril Polpharma", substance: "ramiprilum" }, // C09AA
  { name: "Asertin 50", substance: "sertralinum" }, // N06AB
  { name: "Valsacor 160", substance: "valsartanum" }, // C09CA
  { name: "Areplex", substance: "clopidogrelum" }, // B01AC
  { name: "Amlozek 5", substance: "amlodipinum" }, // C08CA
  { name: "Atorvasterol 20", substance: "atorvastatinum" }, // C10AA
  { name: "Bisocard 5", substance: "bisoprololum" }, // C07AB
  { name: "Polprazol 20", substance: "omeprazolum" }, // A02BC
  { name: "Apap", substance: "paracetamolum" }, // N02BE
  { name: "Indapen SR", substance: "indapamidum" }, // C03BA
];

function fail(message) {
  console.error(message);
  process.exit(1);
}

// KEY=VALUE lines of .dev.vars; comments and blank lines skipped, surrounding quotes removed.
function readDevVars() {
  if (!existsSync(DEV_VARS_PATH)) return {};
  const vars = {};
  for (const line of readFileSync(DEV_VARS_PATH, "utf8").split(/\r?\n/)) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (match) vars[match[1]] = match[2].replace(/^(["'])(.*)\1$/, "$2");
  }
  return vars;
}

function isLocalUrl(url) {
  try {
    const host = new URL(url).hostname;
    return host === "localhost" || host === "127.0.0.1" || host === "[::1]" || host === "::1";
  } catch {
    return false;
  }
}

// Warsaw calendar date, `offsetDays` from today, as `YYYY-MM-DD`.
function warsawDate(offsetDays) {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Warsaw" }).format(new Date());
  const date = new Date(`${today}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}

function psql(container, sql) {
  return spawnSync(
    "docker",
    ["exec", "-i", container, "psql", "-X", "-q", "-At", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres"],
    { input: sql, encoding: "utf8" },
  );
}

// --- 1. Target: a local Supabase only ---
const devVars = readDevVars();
const supabaseUrl = process.env.SUPABASE_URL || devVars.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY || devVars.SUPABASE_KEY;
// An empty value counts as missing: it would look exactly like an absent one further on.
if (!supabaseUrl || !supabaseKey) {
  fail("SUPABASE_URL or SUPABASE_KEY is missing or empty (environment or .dev.vars). Values: `npx supabase status`.");
}
if (!isLocalUrl(supabaseUrl)) {
  fail(
    `Refusing to seed: SUPABASE_URL host is "${URL.canParse(supabaseUrl) ? new URL(supabaseUrl).hostname : "(not a URL)"}", not a local Supabase ` +
      "(localhost / 127.0.0.1). The measurement account is local-only test data; .env points at production.",
  );
}

const projectId = parseProjectId(readFileSync(CONFIG_PATH, "utf8"));
if (!projectId) fail(`No project_id in ${path.relative(REPO_ROOT, CONFIG_PATH)}.`);
const container = containerName(projectId);
const running = spawnSync("docker", ["inspect", "-f", "{{.State.Running}}", container], { encoding: "utf8" });
if (running.error || running.status !== 0 || running.stdout.trim() !== "true") {
  fail(`Database container ${container} is not running. Start the local database with: npx supabase start`);
}

// --- 2. The account, through Supabase Auth ---
const supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });
const { error: signUpError } = await supabase.auth.signUp({
  email: EMAIL,
  password: PASSWORD,
  options: { data: { terms_version: CURRENT_TERMS_VERSION } },
});
if (signUpError && signUpError.code !== "user_already_exists") {
  fail(`Signup of ${EMAIL} failed: ${signUpError.code ?? signUpError.message}`);
}
if (signUpError) console.log(`Account ${EMAIL} already exists; checking that it holds no medications yet.`);

const { error: signInError } = await supabase.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
if (signInError) fail(`Sign-in of ${EMAIL} failed: ${signInError.code ?? signInError.message}`);

const existing = await supabase.from("medications").select("id", { count: "exact", head: true });
if (existing.error) fail(`Reading the account's medications failed: ${existing.error.code}`);
if ((existing.count ?? 0) > 0) {
  fail(`Account ${EMAIL} already holds ${String(existing.count)} medications; delete it before seeding again.`);
}

// --- 3. The medications, as the signed-in account ---
const startedOn = warsawDate(-2);
for (const medication of MEDICATIONS) {
  const { error } = await supabase.rpc("add_medication_from_leaflet", {
    p_product_name: medication.name,
    p_substance_name: medication.substance,
    p_verified: true,
    p_dose_text: "1 tabletka rano",
    p_started_on: startedOn,
  });
  if (error) fail(`Saving ${medication.substance} failed: ${error.code}`);
}

// --- 4. Read back: the account and its medications are in THIS database, with enough pairs ---
const check = psql(
  container,
  String.raw`select count(*) from public.medications m join auth.users u on u.id = m.user_id
   where u.email = '${EMAIL.replaceAll("'", "''")}' and m.discontinued_on is null;`,
);
if (check.error || check.status !== 0) fail(`Local check failed: ${check.error?.message ?? check.stderr.trim()}`);
const localCount = Number(check.stdout.trim());
if (localCount !== MEDICATIONS.length) {
  fail(`Expected ${String(MEDICATIONS.length)} current medications in ${container}, found ${String(localCount)}.`);
}

const interactions = await supabase.rpc("medication_interactions");
if (interactions.error) fail(`medication_interactions() failed: ${interactions.error.code}`);
// The result is symmetric and may hold several rows per pair: count unordered pairs of medication ids.
const pairs = new Set(interactions.data.map((row) => [row.medication_id, row.other_medication_id].sort().join(" ")));
if (pairs.size < MIN_PAIRS) fail(`Only ${String(pairs.size)} pairs found; the measurement needs ${String(MIN_PAIRS)}.`);

await supabase.auth.signOut();
console.log(`GRAPH_SEED medications=${String(localCount)} pairs=${String(pairs.size)}`);
console.log(`Measurement account ready in ${container}: sign in as ${EMAIL} and open /leki.`);
