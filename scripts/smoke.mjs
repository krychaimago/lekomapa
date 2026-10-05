// Smoke test: proves the built app, the Cloudflare adapter and the Supabase auth flow still work together,
// and that row level security really isolates one account's medications and journal entries from another's.
// It also proves that the shared registry, interaction pairs and symptom catalog are readable after sign-in and
// read-only.
// Run against a live server: BASE_URL=http://localhost:4321 node scripts/smoke.mjs
//
// The auth path speaks plain HTTP and needs nothing but fetch. The isolation path talks to Supabase
// directly, so it imports @supabase/supabase-js — the single dependency of this script, already in
// "dependencies" because the app itself uses it.
//
// Two modes, picked by the environment:
//   - throwaway account (default): signs up a fresh address, then signs in. Needs a Supabase with e-mail
//     confirmation disabled, so this is the local and CI mode. Only this mode runs the isolation checks, and
//     only when SUPABASE_URL points at a local Supabase — SMOKE_ALLOW_REMOTE_WRITES=1 overrides that.
//   - existing account: set SMOKE_EMAIL and SMOKE_PASSWORD to a confirmed account. Signup is skipped, so the
//     run works against an environment that confirms e-mail and leaves no new rows behind.
// SMOKE_EMAIL_DOMAIN overrides the throwaway address domain when example.com is rejected.
// The password recovery steps run only in throwaway mode against a local Supabase and read the reset mail from
// mailpit (MAILPIT_URL, default http://127.0.0.1:54324).

import { setTimeout as sleep } from "node:timers/promises";

import { createClient, isAuthApiError } from "@supabase/supabase-js";

// Loaded as TypeScript (`--experimental-strip-types` in the npm script): the screens' own copy and "today" rule,
// so the steps compare against what the app renders instead of a second copy of the text.
import { INTERACTION_COPY } from "../src/lib/copy/interactions.ts";
import { todayInWarsaw } from "../src/lib/services/medications.ts";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:4321";
const EXISTING_EMAIL = process.env.SMOKE_EMAIL;
const EXISTING_PASSWORD = process.env.SMOKE_PASSWORD;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

if (Boolean(EXISTING_EMAIL) !== Boolean(EXISTING_PASSWORD)) {
  console.error("SMOKE_EMAIL and SMOKE_PASSWORD must be set together, or neither.");
  process.exit(1);
}

const usesExistingAccount = Boolean(EXISTING_EMAIL);
const emailDomain = process.env.SMOKE_EMAIL_DOMAIN ?? "example.com";

// The isolation checks create accounts and write invented medications. What decides whether that is safe is
// the address they write to, not SMOKE_EMAIL — that variable says nothing about the target database. A local
// Supabase is fair game; anything else needs the operator to say so out loud.
function isLocalSupabase(url) {
  if (!url) return false;
  try {
    const host = new URL(url).hostname;
    return host === "localhost" || host === "127.0.0.1" || host === "[::1]" || host === "::1";
  } catch {
    return false;
  }
}

const allowsRemoteWrites = process.env.SMOKE_ALLOW_REMOTE_WRITES === "1";
const writesAreSafe = isLocalSupabase(SUPABASE_URL) || allowsRemoteWrites;
const email = EXISTING_EMAIL ?? `smoke-${Date.now()}@${emailDomain}`;
const password = EXISTING_PASSWORD ?? "Smoke-Test-Passw0rd!";
const jar = new Map();

// The isolation checks need a Supabase address and public key of their own. An empty value counts as
// missing: an empty secret looks exactly like an absent one downstream, and a silently skipped isolation
// check would turn a data leak into a green run.
for (const [name, value] of [
  ["SUPABASE_URL", SUPABASE_URL],
  ["SUPABASE_KEY", SUPABASE_KEY],
]) {
  if (!value) {
    console.error(`${name} is missing or empty — the isolation checks cannot run without it.`);
    process.exit(1);
  }
}

function cookieHeader(cookieJar) {
  return [...cookieJar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}

function storeCookies(response, cookieJar) {
  for (const raw of response.headers.getSetCookie()) {
    const [pair, ...attrs] = raw.split(";");
    const [name, ...rest] = pair.split("=");
    const expired = attrs.some((a) => /max-age=0/i.test(a.trim()));
    if (expired) cookieJar.delete(name.trim());
    else cookieJar.set(name.trim(), rest.join("="));
  }
}

// `jar` picks the cookie jar the request reads and writes; the main jar unless a step needs a separate browser.
// `origin` overrides the Origin header for a form POST whose page changes what a browser sends (see formOrigin).
async function request(path, { method = "GET", form, jar: cookieJar = jar, origin = BASE_URL } = {}) {
  const response = await fetch(BASE_URL + path, {
    method,
    redirect: "manual",
    headers: {
      Cookie: cookieHeader(cookieJar),
      Origin: origin,
      ...(form ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
    },
    body: form ? new URLSearchParams(form).toString() : undefined,
  });
  storeCookies(response, cookieJar);
  return { status: response.status, location: response.headers.get("location") ?? "" };
}

// GET a page and keep its HTML: the steps that check what a screen says need the body, which request() discards.
async function requestPage(path, { jar: cookieJar = jar } = {}) {
  const response = await fetch(BASE_URL + path, {
    redirect: "manual",
    headers: { Cookie: cookieHeader(cookieJar) },
  });
  storeCookies(response, cookieJar);
  return { status: response.status, location: response.headers.get("location") ?? "", body: await response.text() };
}

// A browser derives the Origin of a form POST from the referrer policy of the page holding the form: under
// "no-referrer" it sends `Origin: null`, which Astro's checkOrigin rejects with 403. A step posting from such a
// page reads the page's policy instead of assuming the header this script would send on its own.
async function formOrigin(pagePath, cookieJar = jar) {
  const response = await fetch(BASE_URL + pagePath, {
    redirect: "manual",
    headers: { Cookie: cookieHeader(cookieJar) },
  });
  await response.body?.cancel();
  storeCookies(response, cookieJar);
  // The last listed policy the browser supports wins; every policy here is supported.
  const policy = (response.headers.get("referrer-policy") ?? "").split(",").pop().trim().toLowerCase();
  return policy === "no-referrer" ? "null" : BASE_URL;
}

// --- Isolation checks ------------------------------------------------------
//
// Every new table carrying account data adds its own set of these checks. They turn the policies written in
// the migration into a fact the pipeline verifies: a row reachable from the wrong account fails the run here
// instead of waiting to be noticed once a second account exists.
//
// The asymmetry to assert on: under RLS a blocked SELECT comes back with zero rows and a blocked
// UPDATE/DELETE touches zero rows — neither raises. So the checks look at row counts and at the stored
// value afterwards, never at an exception.

// Second expectation shape for the step loop: the step returns { ok, detail } instead of an HTTP response.
const EXPECT_OK = Symbol("expect ok");

// Fixtures written by the setup step and read by every check below.
const fixtures = { a: null, b: null, anon: null };

function supabaseClient() {
  return createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function createAccount(label) {
  const client = supabaseClient();
  const address = `smoke-${label}-${Date.now()}@${emailDomain}`;
  const { data, error } = await client.auth.signUp({ email: address, password });
  if (error) throw new Error(`sign-up of account ${label} failed: ${error.message}`);
  if (!data.session) {
    throw new Error(`sign-up of account ${label} returned no session — e-mail confirmation must be off here`);
  }
  return { client, address, userId: data.user.id };
}

// Obviously synthetic fixture data: made-up product and substance names, arbitrary but well-formed ATC
// codes. Nothing here says anything about any real preparation.
async function seedMedication(account, suffix) {
  const insert = async (table, row) => {
    const { data, error } = await account.client.from(table).insert(row).select().single();
    if (error) throw new Error(`insert into ${table} failed: ${error.message}`);
    return data;
  };

  const medication = await insert("medications", {
    user_id: account.userId,
    product_name: `Smoke Test Preparat ${suffix}`,
    composition_source: "leaflet",
  });
  const substance = await insert("medication_substances", {
    medication_id: medication.id,
    substance_name: `Smoketestum ${suffix.toLowerCase()}`,
    atc_code: suffix === "A" ? "A01AB02" : "B02BA01",
  });
  // `period` is generated by the database — writing it would fail, so only the source columns go in.
  const dosagePeriod = await insert("dosage_periods", {
    medication_id: medication.id,
    dose_text: `1 tabletka rano (fixture ${suffix})`,
    started_on: "2026-01-05",
  });

  return { ...account, medication, substance, dosagePeriod };
}

// One journal entry with one symptom, saved through add_symptom_entry. Two separate inserts would not do: an entry
// without a symptom is refused when its own request commits (SE001, measured against the local Supabase). The
// symptom is the first one on the shared list, read by id; no symptom name travels anywhere. The note is synthetic.
async function seedSymptomEntry(account, suffix) {
  const symptom = await account.client.from("symptoms").select("id").order("id").limit(1).single();
  if (symptom.error) throw new Error(`symptom lookup failed: ${symptom.error.message}`);

  const saved = await account.client.rpc("add_symptom_entry", {
    p_occurred_local: null,
    p_items: [{ symptom_id: symptom.data.id, severity: "mild" }],
    p_note: `Smoke fixture ${suffix}`,
  });
  if (saved.error) throw new Error(`add_symptom_entry failed: ${saved.error.code} ${saved.error.message}`);

  const entry = await account.client.from("symptom_entries").select().eq("id", saved.data).single();
  if (entry.error) throw new Error(`read of symptom_entries failed: ${entry.error.message}`);
  const item = await account.client.from("symptom_entry_items").select().eq("entry_id", saved.data).single();
  if (item.error) throw new Error(`read of symptom_entry_items failed: ${item.error.message}`);

  return { symptomEntry: entry.data, symptomEntryItem: item.data };
}

const fixtureStep = [
  "isolation fixtures: two accounts, one medication and one journal entry each",
  async () => {
    const [a, b] = await Promise.all([createAccount("iso-a"), createAccount("iso-b")]);
    fixtures.a = { ...(await seedMedication(a, "A")), ...(await seedSymptomEntry(a, "A")) };
    fixtures.b = { ...(await seedMedication(b, "B")), ...(await seedSymptomEntry(b, "B")) };
    fixtures.anon = supabaseClient();
    return { ok: true, detail: `${fixtures.a.address}, ${fixtures.b.address}` };
  },
  EXPECT_OK,
];

// One descriptor per table: which fixture row belongs to it, what a foreign account would try to write into
// it, and which column proves the row stayed untouched.
const isolationTargets = [
  {
    table: "medications",
    rowOf: (fixture) => fixture.medication,
    change: { product_name: "Wpis z obcego konta" },
    guardedColumn: "product_name",
  },
  {
    table: "medication_substances",
    rowOf: (fixture) => fixture.substance,
    change: { substance_name: "Wpis z obcego konta" },
    guardedColumn: "substance_name",
  },
  {
    table: "dosage_periods",
    rowOf: (fixture) => fixture.dosagePeriod,
    change: { dose_text: "Wpis z obcego konta" },
    guardedColumn: "dose_text",
  },
  {
    table: "symptom_entries",
    rowOf: (fixture) => fixture.symptomEntry,
    change: { note: "Wpis z obcego konta" },
    guardedColumn: "note",
  },
  {
    // The fixture severity is "mild"; "severe" passes the column's check, so only RLS can stop the change.
    table: "symptom_entry_items",
    rowOf: (fixture) => fixture.symptomEntryItem,
    change: { severity: "severe" },
    guardedColumn: "severity",
  },
];

function isolationChecks({ table, rowOf, change, guardedColumn }) {
  return [
    [
      `${table}: account A sees only its own row`,
      async () => {
        const { data, error } = await fixtures.a.client.from(table).select("id");
        if (error) return { ok: false, detail: `select failed: ${error.message}` };
        const own = rowOf(fixtures.a).id;
        const ok = data.length === 1 && data[0].id === own;
        return { ok, detail: `${data.length} row(s) visible` };
      },
      EXPECT_OK,
    ],
    [
      `${table}: account A cannot read account B's row by id`,
      async () => {
        const foreignId = rowOf(fixtures.b).id;
        const { data, error } = await fixtures.a.client.from(table).select("id").eq("id", foreignId);
        if (error) return { ok: false, detail: `select failed: ${error.message}` };
        return { ok: data.length === 0, detail: `${data.length} row(s) returned` };
      },
      EXPECT_OK,
    ],
    [
      `${table}: account A cannot change or delete account B's row`,
      async () => {
        const foreign = rowOf(fixtures.b);
        const updated = await fixtures.a.client.from(table).update(change).eq("id", foreign.id).select("id");
        const deleted = await fixtures.a.client.from(table).delete().eq("id", foreign.id).select("id");
        const { data: after, error } = await fixtures.b.client
          .from(table)
          .select(`id, ${guardedColumn}`)
          .eq("id", foreign.id)
          .maybeSingle();
        if (error) return { ok: false, detail: `owner read-back failed: ${error.message}` };

        // As above: a blocked write comes back with zero rows and no error. An error here means the write
        // failed for some other reason — a renamed column, a trigger, a broken connection — and the check
        // proved nothing, so it fails instead of passing on an empty result.
        const notes = [updated.error?.message, deleted.error?.message].filter(Boolean);
        if (notes.length) return { ok: false, detail: `check did not run: ${notes.join("; ")}` };

        const changedRows = (updated.data ?? []).length;
        const deletedRows = (deleted.data ?? []).length;
        const intact = after !== null && after[guardedColumn] === foreign[guardedColumn];
        return {
          ok: changedRows === 0 && deletedRows === 0 && intact,
          detail: `${changedRows} row(s) changed, ${deletedRows} row(s) deleted, owner's row ${
            intact ? "intact" : "altered"
          }`,
        };
      },
      EXPECT_OK,
    ],
    [
      `${table}: public key without a session reads no rows`,
      async () => {
        const { data, error } = await fixtures.anon.from(table).select("id");
        // Row level security does not surface as an error here: PostgREST answers a blocked read with an
        // empty result and no error at all (measured against the local Supabase). So an error means the
        // check never ran — wrong address, missing table, timeout — and must fail rather than pass.
        if (error) return { ok: false, detail: `check did not run: ${error.message}` };
        return { ok: data.length === 0, detail: `${data.length} row(s) returned` };
      },
      EXPECT_OK,
    ],
  ];
}

// --- Shared read-only tables ----------------------------------------------
//
// The registry (registry_products, registry_substances), the interaction pairs (interaction_pairs) and the symptom
// catalog (symptoms, symptom_search_terms) are shared by every account and loaded only by migrations. A signed-in
// account reads them and cannot write them; without a session nothing is visible.
//
// Unlike the account tables above, a blocked write here does raise: the migration revokes INSERT, UPDATE and
// DELETE from anon and authenticated, and the privilege check runs before RLS. Measured against the local
// Supabase for the registry, pair and symptom catalog tables and all three writes: HTTP 403, code 42501, message
// "permission denied for table <name>". The steps require exactly that. Any other error — a row level security refusal after privileges were
// granted back, a constraint, a renamed table — means a layer changed or the step never ran, so it fails.

const PERMISSION_DENIED = "42501";

// Rows read by the first step of each table and compared after the write attempts.
const sharedRows = {};

// Obviously synthetic rows: no real product, substance, pair or symptom. They never land, but if a regression let them in,
// nothing in them would pass for real data.
const sharedTargets = [
  {
    table: "registry_products",
    newRow: () => ({
      rpl_id: `smoke-${Date.now()}`,
      product_name: "Smoke Test Preparat",
      source_payload: {},
      snapshot_date: "2026-01-01",
    }),
    change: { product_name: "Wpis z konta użytkowniczki" },
    guardedColumn: "product_name",
  },
  {
    table: "registry_substances",
    parent: "registry_products",
    newRow: () => ({
      registry_product_id: sharedRows.registry_products?.id,
      position: 99,
      substance_name: "Smoketestum",
      normalized_name: "smoketestum",
      atc_code: null,
      atc_source: "unmatched",
      composition_source: "source",
    }),
    change: { substance_name: "Wpis z konta użytkowniczki" },
    guardedColumn: "substance_name",
  },
  {
    table: "interaction_pairs",
    newRow: () => ({
      group_a: "Z98AA",
      group_b: "Z99AA",
      description: "Smoke test",
      source: "Smoke test",
      verified_on: "2026-01-01",
    }),
    change: { description: "Wpis z konta użytkowniczki" },
    guardedColumn: "description",
  },
  {
    table: "symptoms",
    newRow: () => ({
      key: `smoke_${Date.now()}`,
      name: `Smoke test objaw ${Date.now()}`,
      category: "other",
      sort_order: 999,
    }),
    change: { name: "Wpis z konta użytkowniczki" },
    guardedColumn: "name",
  },
  {
    // Must stay after symptoms: the foreign key comes from the symptom row read in that table's first step.
    table: "symptom_search_terms",
    parent: "symptoms",
    newRow: () => ({
      symptom_id: sharedRows.symptoms?.id,
      term: "smoke test",
    }),
    change: { term: "wpis z konta użytkowniczki" },
    guardedColumn: "term",
  },
];

function isPermissionDenied(table, error) {
  return error?.code === PERMISSION_DENIED && error.message === `permission denied for table ${table}`;
}

function describeError(error) {
  return error ? `${error.code ?? "no code"} ${error.message}` : "no error";
}

function sharedTableChecks({ table, parent, newRow, change, guardedColumn }) {
  return [
    [
      `${table}: signed-in account reads shared rows`,
      async () => {
        const { data, error } = await fixtures.a.client.from(table).select(`id, ${guardedColumn}`).limit(1);
        if (error) return { ok: false, detail: `select failed: ${error.message}` };
        sharedRows[table] = data[0] ?? null;
        return { ok: data.length === 1, detail: `${data.length} row(s) read` };
      },
      EXPECT_OK,
    ],
    [
      `${table}: signed-in account cannot insert`,
      async () => {
        // Without the parent row the foreign key would be dropped and the attempt would not be the one described.
        if (parent && !sharedRows[parent]) return { ok: false, detail: `check did not run: no ${parent} row was read` };
        const { data, error } = await fixtures.a.client.from(table).insert(newRow()).select("id");
        const inserted = (data ?? []).length;
        return {
          ok: isPermissionDenied(table, error) && inserted === 0,
          detail: `${describeError(error)}, ${inserted} row(s) inserted`,
        };
      },
      EXPECT_OK,
    ],
    [
      `${table}: signed-in account cannot change or delete a row`,
      async () => {
        const row = sharedRows[table];
        if (!row) return { ok: false, detail: "check did not run: no row was read in the first step" };
        const updated = await fixtures.a.client.from(table).update(change).eq("id", row.id).select("id");
        const deleted = await fixtures.a.client.from(table).delete().eq("id", row.id).select("id");
        const { data: after, error } = await fixtures.a.client
          .from(table)
          .select(`id, ${guardedColumn}`)
          .eq("id", row.id)
          .maybeSingle();
        if (error) return { ok: false, detail: `read-back failed: ${error.message}` };

        const intact = after !== null && after[guardedColumn] === row[guardedColumn];
        return {
          ok: isPermissionDenied(table, updated.error) && isPermissionDenied(table, deleted.error) && intact,
          detail: `update: ${describeError(updated.error)}; delete: ${describeError(deleted.error)}; row ${
            intact ? "intact" : "altered or gone"
          }`,
        };
      },
      EXPECT_OK,
    ],
    [
      `${table}: public key without a session reads no rows`,
      async () => {
        const { data, error } = await fixtures.anon.from(table).select("id");
        // Measured: no error and an empty result, as for the account tables. An error means the step never ran.
        if (error) return { ok: false, detail: `check did not run: ${error.message}` };
        return { ok: data.length === 0, detail: `${data.length} row(s) returned` };
      },
      EXPECT_OK,
    ],
  ];
}

// Two independent reasons to skip. Existing-account mode runs against an environment that confirms e-mail
// addresses — production — where a second account cannot be created anyway. The address gate is the one that
// protects the data: writing invented medications into a remote Supabase would put made-up health data into a
// real database. CI runs in throwaway mode against a local Supabase, so both gates stay open where it matters.
const isolationSkipReason = usesExistingAccount
  ? "existing-account mode cannot create a second account or write fixture data"
  : !writesAreSafe
    ? `SUPABASE_URL is not a local Supabase — refusing to write invented health data to it. Set SMOKE_ALLOW_REMOTE_WRITES=1 to override.`
    : null;

// The shared-table checks use the same fixture account, so they run in the same mode and skip for the same reason.
const isolationSteps = isolationSkipReason
  ? [
      ["medication and journal isolation checks", null, { skip: isolationSkipReason }],
      ["shared read-only table checks", null, { skip: isolationSkipReason }],
    ]
  : [fixtureStep, ...isolationTargets.flatMap(isolationChecks), ...sharedTargets.flatMap(sharedTableChecks)];

// --- Medications and the interaction flag (S-02) ---------------------------
//
// Walks the add form, the list and the details screen over HTTP, signed in as the two fixture accounts, the way a
// browser does: form POSTs carry the Origin the form page's referrer policy allows (formOrigin), nothing more.
// Writes medications, so it runs in the same mode and behind the same gate as the isolation checks. Runs after them:
// those count account A's rows and would see the medications added here.
//
// Products and the pair description come from the database, never typed in: the registry seed may change, the
// group pair B01AA × M01AE is the contract (both groups are in the checked pairs).

const FLAG_GROUPS = ["B01AA", "M01AE"];
const MEDICATION_ADD_PAGE = "/leki/nowy";
const LEAFLET_ADD_PAGE = "/leki/nowy/z-ulotki";
const ADDED_PREFIX = "/leki?dodano=";

// Filled by the steps below and read by the later ones.
const flow = { jarA: new Map(), jarB: new Map(), products: {}, description: null, ids: {} };

// Astro escapes these five characters in rendered text; a string is compared in the form it takes in the HTML.
function escapeHtml(text) {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function pageContains(body, text) {
  return body.includes(escapeHtml(text));
}

// The <li> of one medication on the list, so the flag is checked per medication rather than counted on the page —
// a legend or an explanation mentioning the label would change a page-wide count.
function listItemOf(body, medicationId) {
  const start = body.indexOf(`data-medication-id="${medicationId}"`);
  if (start === -1) return null;
  const end = body.indexOf("</li>", start);
  return end === -1 ? null : body.slice(start, end);
}

function addedIdFrom(location) {
  if (!location.startsWith(ADDED_PREFIX)) return null;
  const id = location.slice(ADDED_PREFIX.length);
  return /^[0-9a-f-]{36}$/i.test(id) ? id : null;
}

// A registry product whose every coded substance falls in `group`: one group per product keeps the expected flags
// down to the one pair under test.
async function registryProductIn(client, group) {
  const candidates = await client
    .from("registry_substances")
    .select("registry_product_id")
    .like("atc_code", `${group}%`)
    .limit(50);
  if (candidates.error) throw new Error(`registry lookup for ${group} failed: ${candidates.error.message}`);
  const productIds = [...new Set(candidates.data.map((row) => row.registry_product_id))];
  if (productIds.length === 0) throw new Error(`no registry product with a substance in ${group}`);

  const products = await client
    .from("registry_products")
    .select("id, product_name, registry_substances(atc_code)")
    .in("id", productIds);
  if (products.error) throw new Error(`registry products for ${group} failed: ${products.error.message}`);
  const product = products.data.find((row) =>
    row.registry_substances.every((substance) => substance.atc_code === null || substance.atc_code.startsWith(group)),
  );
  if (!product) throw new Error(`no registry product with substances only in ${group}`);
  return { id: product.id, name: product.product_name };
}

async function addMedication(form, pagePath) {
  return request("/api/medications", {
    method: "POST",
    jar: flow.jarA,
    origin: await formOrigin(pagePath, flow.jarA),
    form: { doseText: "1 tabletka (smoke)", startedOn: todayInWarsaw(), ...form },
  });
}

function addRegistryStep(group) {
  return [
    `medications: adding the ${group} product from the registry redirects to the list`,
    async () => {
      const product = flow.products[group];
      if (!product) return { ok: false, detail: `check did not run: no ${group} product was found` };
      const response = await addMedication({ source: "registry", registryProductId: product.id }, MEDICATION_ADD_PAGE);
      const id = response.status === 302 ? addedIdFrom(response.location) : null;
      if (id) flow.ids[group] = id;
      return { ok: id !== null, detail: `${response.status} ${response.location}` };
    },
    EXPECT_OK,
  ];
}

const medicationFlowSteps = [
  [
    "medications: both fixture accounts sign in over HTTP",
    async () => {
      if (!fixtures.a || !fixtures.b) return { ok: false, detail: "check did not run: no fixture accounts" };
      const a = await request("/api/auth/signin", {
        method: "POST",
        jar: flow.jarA,
        form: { email: fixtures.a.address, password },
      });
      const b = await request("/api/auth/signin", {
        method: "POST",
        jar: flow.jarB,
        form: { email: fixtures.b.address, password },
      });
      const ok = [a, b].every((response) => response.status === 302 && response.location === "/");
      return { ok, detail: `A: ${a.status} ${a.location}; B: ${b.status} ${b.location}` };
    },
    EXPECT_OK,
  ],
  [
    `medications: registry has a product in each of ${FLAG_GROUPS.join(" and ")}, and the pair has a description`,
    async () => {
      if (!fixtures.a) return { ok: false, detail: "check did not run: no fixture account" };
      for (const group of FLAG_GROUPS) {
        flow.products[group] = await registryProductIn(fixtures.a.client, group);
      }
      const pair = await fixtures.a.client
        .from("interaction_pairs")
        .select("description")
        .eq("group_a", FLAG_GROUPS[0])
        .eq("group_b", FLAG_GROUPS[1])
        .maybeSingle();
      if (pair.error) return { ok: false, detail: `pair lookup failed: ${pair.error.message}` };
      flow.description = pair.data?.description ?? null;
      return {
        ok: flow.description !== null,
        detail: `${FLAG_GROUPS.map((group) => `${group}: ${flow.products[group].name}`).join("; ")}; pair ${
          flow.description ? "found" : "missing"
        }`,
      };
    },
    EXPECT_OK,
  ],
  ...FLAG_GROUPS.map(addRegistryStep),
  [
    "medications: list flags both medications and shows the note",
    async () => {
      const ids = FLAG_GROUPS.map((group) => flow.ids[group]);
      if (ids.some((id) => !id)) return { ok: false, detail: "check did not run: a medication was not added" };
      const page = await requestPage("/leki", { jar: flow.jarA });
      if (page.status !== 200) return { ok: false, detail: `${page.status} ${page.location}` };
      const flagged = ids.map((id) => {
        const item = listItemOf(page.body, id);
        return item !== null && pageContains(item, INTERACTION_COPY.flagLabel);
      });
      const note = pageContains(page.body, INTERACTION_COPY.note);
      return {
        ok: flagged.every(Boolean) && note,
        detail: `flags: ${flagged.join(", ")}; note ${note ? "present" : "missing"}`,
      };
    },
    EXPECT_OK,
  ],
  [
    "medications: details show the pair description and the note",
    async () => {
      const id = flow.ids[FLAG_GROUPS[0]];
      if (!id || !flow.description) return { ok: false, detail: "check did not run: no medication or description" };
      const page = await requestPage(`/leki/${id}`, { jar: flow.jarA });
      if (page.status !== 200) return { ok: false, detail: `${page.status} ${page.location}` };
      const description = pageContains(page.body, flow.description);
      const note = pageContains(page.body, INTERACTION_COPY.note);
      return {
        ok: description && note,
        detail: `description ${description ? "present" : "missing"}; note ${note ? "present" : "missing"}`,
      };
    },
    EXPECT_OK,
  ],
  [
    "medications: a substance saved from a leaflet without checking is shown as not covered",
    async () => {
      // A made-up name no dictionary holds, sent with the "save without checking" box ticked.
      const response = await addMedication(
        {
          source: "leaflet",
          productName: "Smoke Test Preparat z ulotki",
          substanceName: `Smoketestum ${Date.now()}`,
          confirmUnverified: "1",
        },
        LEAFLET_ADD_PAGE,
      );
      const id = response.status === 302 ? addedIdFrom(response.location) : null;
      if (!id) return { ok: false, detail: `add: ${response.status} ${response.location}` };
      flow.ids.leaflet = id;
      const page = await requestPage(`/leki/${id}`, { jar: flow.jarA });
      const notCovered = page.status === 200 && pageContains(page.body, INTERACTION_COPY.substanceNotCovered);
      return {
        ok: notCovered,
        detail: `details ${page.status}; not-covered text ${notCovered ? "present" : "missing"}`,
      };
    },
    EXPECT_OK,
  ],
  [
    "medications: another account gets 404 for the medication's details",
    async () => {
      const id = flow.ids[FLAG_GROUPS[0]];
      if (!id) return { ok: false, detail: "check did not run: no medication was added" };
      const page = await requestPage(`/leki/${id}`, { jar: flow.jarB });
      // Exactly 404: a redirect to sign-in or a 500 would mean the page never looked the row up for account B.
      return { ok: page.status === 404, detail: `${page.status} ${page.location}` };
    },
    EXPECT_OK,
  ],
];

const medicationSteps = isolationSkipReason
  ? [["medication and interaction flag checks", null, { skip: isolationSkipReason }]]
  : medicationFlowSteps;

// --- Password recovery -----------------------------------------------------
//
// Walks the whole reset path of S-10 over HTTP and reads the reset mail from the local mailpit. Every step asserts
// a concrete outcome: the request route answers the same 302 whether or not the account exists, so the status alone
// proves nothing — the mail (or its absence) does.
//
// Runs only in throwaway mode against a local Supabase: it changes the password of the account it signs in to and
// reads mail from a local mailpit. No override — the password of a real account is never touched.

const MAILPIT_URL = process.env.MAILPIT_URL ?? "http://127.0.0.1:54324";
const MAIL_TIMEOUT_MS = 15000;
const MAIL_POLL_MS = 250;
const NEW_PASSWORD = "Smoke-Test-Passw0rd-New!";
const RESET_PASSWORD_PAGE = "/auth/reset-password";
const RESET_CONFIRM_PATH = "/auth/reset-password/confirm";
const RECOVERY_EXPIRED_PATH = "/auth/reset-password/confirm?expired=1";

// Filled by the steps below and read by the later ones.
const recovery = { unknownAddress: `smoke-nobody-${Date.now()}@${emailDomain}`, link: null, parallel: null };

// Messages addressed exactly to `address`. Throws when mailpit cannot be queried, so an unreachable mailpit
// never passes for "no mail".
async function mailpitMessagesTo(address) {
  const url = `${MAILPIT_URL}/api/v1/search?query=${encodeURIComponent(`to:${address}`)}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`mailpit search failed: HTTP ${response.status} from ${MAILPIT_URL}`);
  const body = await response.json();
  if (!Array.isArray(body.messages)) throw new Error("mailpit search returned no message list");
  const wanted = address.toLowerCase();
  return body.messages.filter((message) => (message.To ?? []).some((to) => to.Address?.toLowerCase() === wanted));
}

async function waitForMail(address) {
  const deadline = Date.now() + MAIL_TIMEOUT_MS;
  for (;;) {
    const messages = await mailpitMessagesTo(address);
    if (messages.length) return messages[0];
    if (Date.now() > deadline) {
      throw new Error(
        `no mail in mailpit after ${MAIL_TIMEOUT_MS} ms. The route answers 302 whatever happens, so look for ` +
          `"Password reset request failed" in the server's console.error (resetPasswordForEmail error, ` +
          `e.g. the email_sent rate limit or max_frequency) and check that mailpit runs at ${MAILPIT_URL}`,
      );
    }
    await sleep(MAIL_POLL_MS);
  }
}

async function readMessage(id) {
  const response = await fetch(`${MAILPIT_URL}/api/v1/message/${encodeURIComponent(id)}`);
  if (!response.ok) throw new Error(`mailpit message read failed: HTTP ${response.status}`);
  return response.json();
}

function resetLinkFrom(message) {
  for (const source of [message.HTML ?? "", message.Text ?? ""]) {
    const match = source.match(/https?:\/\/[^\s"'<>]+\/auth\/reset-password\/confirm[^\s"'<>]*/);
    if (match) return new URL(match[0].replaceAll("&amp;", "&"));
  }
  return null;
}

// HTTP steps that need the link from step 2 fail on their own line when it is missing, instead of requesting "undefined".
const NO_LINK = { status: 0, location: "check did not run: no reset link was read from the mail" };

function linkPath() {
  return recovery.link ? recovery.link.pathname + recovery.link.search : null;
}

function verifyForm() {
  return { token_hash: recovery.link.searchParams.get("token_hash"), type: "recovery" };
}

const recoverySteps = [
  [
    "recovery: request for an unknown address ends on the sent screen and sends no mail",
    async () => {
      const response = await request("/api/auth/password-reset-request", {
        method: "POST",
        form: { email: recovery.unknownAddress },
      });
      const redirected = response.status === 302 && response.location === "/auth/forgot-password/sent";
      const messages = await mailpitMessagesTo(recovery.unknownAddress);
      return {
        ok: redirected && messages.length === 0,
        detail: `${response.status} ${response.location}; ${messages.length} mail(s) in mailpit (re-checked in the next step)`,
      };
    },
    EXPECT_OK,
  ],
  [
    "recovery: request for the account sends a mail with a token_hash link",
    async () => {
      const response = await request("/api/auth/password-reset-request", { method: "POST", form: { email } });
      if (response.status !== 302 || response.location !== "/auth/forgot-password/sent") {
        return { ok: false, detail: `${response.status} ${response.location}` };
      }
      const message = await readMessage((await waitForMail(email)).ID);
      const link = resetLinkFrom(message);
      if (!link) return { ok: false, detail: `mail "${message.Subject}" holds no ${RESET_CONFIRM_PATH} link` };
      const tokenHash = link.searchParams.get("token_hash");
      const type = link.searchParams.get("type");
      if (link.pathname !== RESET_CONFIRM_PATH || !tokenHash || type !== "recovery") {
        return { ok: false, detail: `unexpected link ${link.origin}${link.pathname} type=${type}` };
      }
      recovery.link = link;
      // Delivery works now, so an empty result for the unknown address from the previous step is a real absence.
      const unknown = await mailpitMessagesTo(recovery.unknownAddress);
      return {
        ok: unknown.length === 0,
        detail: `link to ${link.origin}${link.pathname}; unknown address has ${unknown.length} mail(s)`,
      };
    },
    EXPECT_OK,
  ],
  [
    "recovery: parallel session on another device signs in and refreshes",
    async () => {
      const client = supabaseClient();
      const signIn = await client.auth.signInWithPassword({ email, password });
      if (signIn.error) return { ok: false, detail: `sign-in failed: ${describeError(signIn.error)}` };
      // Control for the last step: the session refreshes now, so a failed refresh later comes from the reset.
      const refreshed = await client.auth.refreshSession({ refresh_token: signIn.data.session.refresh_token });
      if (refreshed.error || !refreshed.data.session) {
        return { ok: false, detail: `control refresh failed: ${describeError(refreshed.error)}` };
      }
      recovery.parallel = { client, refreshToken: refreshed.data.session.refresh_token };
      return { ok: true, detail: "signed in outside the cookie jar, refresh works" };
    },
    EXPECT_OK,
  ],
  [
    "recovery: opening the link shows the confirm page",
    () => (linkPath() ? request(linkPath()) : NO_LINK),
    { status: 200 },
  ],
  [
    "recovery: confirming the link opens the new password screen",
    async () =>
      recovery.link
        ? request("/api/auth/password-reset-verify", {
            method: "POST",
            form: verifyForm(),
            origin: await formOrigin(linkPath()),
          })
        : NO_LINK,
    { status: 302, location: "/auth/reset-password", exact: true },
  ],
  [
    "recovery: session from the link cannot reach the interior",
    () => request("/dashboard"),
    { status: 302, location: "/auth/reset-password", exact: true },
  ],
  [
    "recovery: the same link used again in another browser is expired",
    () =>
      recovery.link
        ? request("/api/auth/password-reset-verify", { method: "POST", form: verifyForm(), jar: new Map() })
        : NO_LINK,
    { status: 302, location: RECOVERY_EXPIRED_PATH, exact: true },
  ],
  [
    "recovery: mismatched passwords are rejected",
    async () =>
      request("/api/auth/password-update", {
        method: "POST",
        origin: await formOrigin(RESET_PASSWORD_PAGE),
        form: { password: NEW_PASSWORD, password_confirm: `${NEW_PASSWORD}-other` },
      }),
    { status: 302, location: "/auth/reset-password?error=mismatch", exact: true },
  ],
  [
    "recovery: new password is saved",
    async () =>
      request("/api/auth/password-update", {
        method: "POST",
        origin: await formOrigin(RESET_PASSWORD_PAGE),
        form: { password: NEW_PASSWORD, password_confirm: NEW_PASSWORD },
      }),
    { status: 302, location: "/auth/signin?reset=done", exact: true },
  ],
  [
    "recovery: dashboard redirects after the password change",
    () => request("/dashboard"),
    { status: 302, location: "/auth/signin", exact: true },
  ],
  [
    "recovery: old password no longer signs in",
    () => request("/api/auth/signin", { method: "POST", form: { email, password } }),
    { status: 302, location: "/auth/signin?error=" },
  ],
  [
    "recovery: new password signs in",
    () => request("/api/auth/signin", { method: "POST", form: { email, password: NEW_PASSWORD } }),
    { status: 302, location: "/", exact: true },
  ],
  [
    "recovery: parallel session no longer refreshes",
    async () => {
      if (!recovery.parallel) return { ok: false, detail: "check did not run: no parallel session from step 3" };
      const { data, error } = await recovery.parallel.client.auth.refreshSession({
        refresh_token: recovery.parallel.refreshToken,
      });
      // Only the measured answer counts: after a global sign-out the auth server answers 400
      // refresh_token_not_found (local Supabase CLI v2.117.0). Any other error, network or configuration failure
      // included, never reached the revoked token and proves nothing about the sign-out.
      const rejected = isAuthApiError(error) && error.code === "refresh_token_not_found" && !data?.session;
      return { ok: rejected, detail: `${error ? `${error.status} ` : ""}${describeError(error)}` };
    },
    EXPECT_OK,
  ],
];

const recoverySkipReason = usesExistingAccount
  ? "existing-account mode never changes the password of a real account"
  : !isLocalSupabase(SUPABASE_URL)
    ? "SUPABASE_URL is not a local Supabase — the reset mail is read from a local mailpit and the password changes"
    : null;

const passwordRecoverySteps = recoverySkipReason
  ? [["password recovery checks", null, { skip: recoverySkipReason }]]
  : recoverySteps;

// --- Registry suggestions (S-02, phase 6) ----------------------------------
//
// The JSON route behind the suggestions under the name field. Read-only, so it runs in both modes, signed in with the
// main account. The request carries only the cookie, like the page's same-origin fetch. "ibu" is a prefix the
// registry seed must keep (ibuprofen products).

const REGISTRY_SUGGESTIONS_PATH = "/api/registry/search?q=ibu";

const registrySuggestionsStep = [
  "registry suggestions: signed-in user gets a non-empty list of names",
  async () => {
    const page = await requestPage(REGISTRY_SUGGESTIONS_PATH);
    if (page.status !== 200) return { ok: false, detail: `${page.status} ${page.location}` };
    let names;
    try {
      ({ names } = JSON.parse(page.body));
    } catch {
      return { ok: false, detail: "200 but the body is not JSON" };
    }
    const valid =
      Array.isArray(names) &&
      names.length > 0 &&
      names.length <= 10 &&
      names.every((group) => typeof group?.name === "string" && typeof group?.variants === "number");
    return { ok: valid, detail: `200, ${Array.isArray(names) ? names.length : "no"} name(s)` };
  },
  EXPECT_OK,
];

// Exactly 401: a redirect to sign-in or a 500 would mean the route never decided on the missing session.
const registrySuggestionsAnonymousStep = [
  "registry suggestions: no session gets 401",
  () => requestPage(REGISTRY_SUGGESTIONS_PATH),
  { status: 401 },
];

// --- Steps -----------------------------------------------------------------

const signupStep = [
  "signup creates account",
  () => request("/api/auth/signup", { method: "POST", form: { email, password } }),
  { status: 302, location: "/auth/confirm-email" },
];

const steps = [
  ["home redirects anonymous user", () => request("/"), { status: 302, location: "/auth/signin" }],
  ["dashboard redirects anonymous user", () => request("/dashboard"), { status: 302, location: "/auth/signin" }],
  [
    "dashboard.html redirects anonymous user",
    () => request("/dashboard.html"),
    { status: 302, location: "/auth/signin" },
  ],
  ...(usesExistingAccount ? [] : [signupStep]),
  [
    "signin rejects wrong password",
    () => request("/api/auth/signin", { method: "POST", form: { email, password: "wrong" } }),
    { status: 302, location: "/auth/signin?error=" },
  ],
  [
    "signin accepts correct password",
    () => request("/api/auth/signin", { method: "POST", form: { email, password } }),
    { status: 302, location: "/" },
  ],
  ["dashboard renders for signed-in user", () => request("/dashboard"), { status: 200 }],
  registrySuggestionsStep,
  ["signout clears session", () => request("/api/auth/signout", { method: "POST" }), { status: 302, location: "/" }],
  ["dashboard redirects after signout", () => request("/dashboard"), { status: 302, location: "/auth/signin" }],
  registrySuggestionsAnonymousStep,
  ...isolationSteps,
  ...medicationSteps,
  ...passwordRecoverySteps,
];

console.log(
  usesExistingAccount ? `Mode: existing account (${email}), signup step skipped` : `Mode: throwaway account (${email})`,
);

let failed = 0;
for (const [name, run, expected] of steps) {
  if (expected?.skip) {
    console.log(`SKIP  ${name}  -> ${expected.skip}`);
    continue;
  }

  // Two expectation shapes: EXPECT_OK steps return { ok, detail }, HTTP steps return { status, location }.
  // HTTP steps match the location as a prefix, or in full with `exact: true`.
  if (expected === EXPECT_OK) {
    let actual;
    try {
      actual = await run();
    } catch (error) {
      actual = { ok: false, detail: error.message };
    }
    console.log(`${actual.ok ? "PASS" : "FAIL"}  ${name}  -> ${actual.detail}`);
    if (!actual.ok) failed++;
    continue;
  }

  const actual = await run();
  const ok =
    actual.status === expected.status &&
    (expected.location === undefined ||
      (expected.exact ? actual.location === expected.location : actual.location.startsWith(expected.location)));
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}  -> ${actual.status} ${actual.location}`);
  if (!ok) {
    failed++;
    console.log(`      expected ${expected.status} ${expected.location ?? ""}`);
  }
}

console.log(failed ? `\n${failed} step(s) failed` : "\nAll smoke steps passed");
process.exit(failed ? 1 : 0);
