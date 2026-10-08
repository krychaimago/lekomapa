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
import { DOCTOR_QUESTION_COPY } from "../src/lib/copy/doctor-question.ts";
import { INTERACTION_COPY } from "../src/lib/copy/interactions.ts";
import { JOURNAL_COPY } from "../src/lib/copy/journal.ts";
import { MEDICATION_COPY } from "../src/lib/copy/medications.ts";
import { CURRENT_TERMS_VERSION } from "../src/lib/copy/terms.ts";
import { TERMS_ACCEPTANCE_PATH } from "../src/lib/auth/terms-gate.ts";
import { PLURAL_SYMPTOM_NAMES } from "../src/lib/services/doctor-question.ts";
import { earliestChangeDate, formatIsoDate, todayInWarsaw } from "../src/lib/services/medications.ts";
import { REQUIRED_PHRASE, REQUIRED_PHRASE_PLURAL } from "./fr012/corpus.mjs";

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

// Accounts carry the terms version in their metadata, like the sign-up form, so the database records the acceptance
// and the terms gate lets them in. `acceptTerms: false` makes an account without it, for the gate steps.
async function createAccount(label, { acceptTerms = true } = {}) {
  const client = supabaseClient();
  const address = `smoke-${label}-${Date.now()}@${emailDomain}`;
  const options = acceptTerms ? { data: { terms_version: CURRENT_TERMS_VERSION } } : undefined;
  const { data, error } = await client.auth.signUp({ email: address, password, options });
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
    for (const fixture of [fixtures.a, fixtures.b]) {
      // Written by the database when the account was created, from the terms version in its metadata.
      const accepted = await fixture.client.from("terms_acceptances").select().single();
      if (accepted.error) throw new Error(`read of terms_acceptances failed: ${describeError(accepted.error)}`);
      fixture.termsAcceptance = accepted.data;
    }
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
  {
    // Append-only: the owner cannot change or delete its own row either (termsAcceptanceOwnRowCheck below).
    table: "terms_acceptances",
    rowOf: (fixture) => fixture.termsAcceptance,
    change: { accepted_at: "2020-01-01T00:00:00+00:00" },
    guardedColumn: "accepted_at",
  },
];

// The account tables above let the owner change its own rows; terms_acceptances does not. Same measured shape as
// a blocked foreign write: zero rows and no error, so any error means the check never ran.
const termsAcceptanceOwnRowCheck = [
  "terms_acceptances: account A cannot change or delete its own row",
  async () => {
    const own = fixtures.a.termsAcceptance;
    const table = fixtures.a.client.from("terms_acceptances");
    const updated = await table.update({ accepted_at: "2020-01-01T00:00:00+00:00" }).eq("id", own.id).select("id");
    const deleted = await fixtures.a.client.from("terms_acceptances").delete().eq("id", own.id).select("id");
    const { data: after, error } = await fixtures.a.client
      .from("terms_acceptances")
      .select("id, accepted_at")
      .eq("id", own.id)
      .maybeSingle();
    if (error) return { ok: false, detail: `read-back failed: ${describeError(error)}` };
    const notes = [updated.error, deleted.error].filter(Boolean).map(describeError);
    if (notes.length) return { ok: false, detail: `check did not run: ${notes.join("; ")}` };
    const changedRows = (updated.data ?? []).length;
    const deletedRows = (deleted.data ?? []).length;
    const intact = after !== null && after.accepted_at === own.accepted_at;
    return {
      ok: changedRows === 0 && deletedRows === 0 && intact,
      detail: `${changedRows} row(s) changed, ${deletedRows} row(s) deleted, row ${intact ? "intact" : "altered"}`,
    };
  },
  EXPECT_OK,
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
  : [
      fixtureStep,
      ...isolationTargets.flatMap(isolationChecks),
      termsAcceptanceOwnRowCheck,
      ...sharedTargets.flatMap(sharedTableChecks),
    ];

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
// Dose texts of the correction steps: a mistaken dose change, then its correction in the period's window.
const SMOKE_MISTAKEN_DOSE = "2 tabletki (smoke pomyłka)";
const SMOKE_CORRECTED_DOSE = "1 tabletka (smoke poprawka)";

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

// An ISO date `days` days before `iso`, pinned to UTC midnight so no zone or DST switch moves it.
function isoDaysBefore(iso, days) {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day) - days * 86_400_000).toISOString().slice(0, 10);
}

// Periods of one medication, oldest first, read as account A (RLS limits the read to its own rows).
async function periodsOf(medicationId) {
  const { data, error } = await fixtures.a.client
    .from("dosage_periods")
    .select("id, dose_text, started_on, ended_on")
    .eq("medication_id", medicationId)
    .order("started_on");
  if (error) throw new Error(`reading periods failed: ${error.code}`);
  return data;
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
    "medications: a dose change over HTTP closes the period and opens a new one",
    async () => {
      if (!fixtures.a) return { ok: false, detail: "check did not run: no fixture account" };
      const today = todayInWarsaw();
      // Started three days ago, so a change dated today is later than the start (DP002 otherwise).
      const added = await addMedication(
        {
          source: "leaflet",
          productName: "Smoke Test Preparat do poprawy",
          substanceName: `Smoketestum ${Date.now()}`,
          confirmUnverified: "1",
          startedOn: isoDaysBefore(today, 3),
        },
        LEAFLET_ADD_PAGE,
      );
      const id = added.status === 302 ? addedIdFrom(added.location) : null;
      if (!id) return { ok: false, detail: `add: ${added.status} ${added.location}` };
      flow.ids.corrected = id;
      const change = await request(`/api/medications/${id}/dosage`, {
        method: "POST",
        jar: flow.jarA,
        origin: await formOrigin(`/leki/${id}/zmiana-dawki`, flow.jarA),
        form: { doseText: SMOKE_MISTAKEN_DOSE, changedOn: today },
      });
      const periods = await periodsOf(id);
      const ongoing = periods.find((period) => period.ended_on === null);
      if (ongoing) flow.ids.correctedPeriod = ongoing.id;
      const ok =
        change.status === 302 &&
        change.location === `/leki/${id}?zmieniono=1` &&
        periods.length === 2 &&
        ongoing?.dose_text === SMOKE_MISTAKEN_DOSE &&
        ongoing.started_on === today;
      return { ok, detail: `${change.status} ${change.location}; periods: ${periods.length}` };
    },
    EXPECT_OK,
  ],
  [
    "medications: correcting the new period over HTTP rewrites its dose and adds no period",
    async () => {
      const id = flow.ids.corrected;
      const periodId = flow.ids.correctedPeriod;
      if (!id || !periodId) return { ok: false, detail: "check did not run: no dose change was saved" };
      const before = await periodsOf(id);
      const correction = await request(`/api/medications/${id}/periods/${periodId}`, {
        method: "POST",
        jar: flow.jarA,
        origin: await formOrigin(`/leki/${id}/okresy/${periodId}/poprawa`, flow.jarA),
        form: { doseText: SMOKE_CORRECTED_DOSE },
      });
      const after = await periodsOf(id);
      const corrected = after.find((period) => period.id === periodId);
      const previous = before.find((period) => period.id === periodId);
      // The same period: new dose, same dates; the number of periods unchanged; no dose in the redirect.
      const samePeriod =
        corrected?.dose_text === SMOKE_CORRECTED_DOSE &&
        corrected.started_on === previous?.started_on &&
        corrected.ended_on === previous.ended_on;
      const noDoseInUrl = !correction.location.includes("smoke") && !correction.location.includes("tablet");
      const page = await requestPage(`/leki/${id}?poprawiono=${periodId}`, { jar: flow.jarA });
      const banner = page.status === 200 && page.body.includes(escapeHtml(MEDICATION_COPY.correction.saved));
      const ok =
        correction.status === 302 &&
        correction.location === `/leki/${id}?poprawiono=${periodId}` &&
        after.length === before.length &&
        samePeriod &&
        noDoseInUrl &&
        banner;
      return {
        ok,
        detail: `${correction.status} ${correction.location}; periods ${before.length} -> ${after.length}; dose ${
          samePeriod ? "corrected in place" : "not corrected in place"
        }; banner ${banner ? "present" : "missing"}`,
      };
    },
    EXPECT_OK,
  ],
  [
    "medications: undoing a dose change over HTTP removes the new period and reopens the previous one",
    async () => {
      if (!fixtures.a) return { ok: false, detail: "check did not run: no fixture account" };
      const today = todayInWarsaw();
      // Started three days ago, so a change dated today is later than the start (DP002 otherwise).
      const added = await addMedication(
        {
          source: "leaflet",
          productName: "Smoke Test Preparat do cofnięcia",
          substanceName: `Smoketestum ${Date.now()}`,
          confirmUnverified: "1",
          startedOn: isoDaysBefore(today, 3),
        },
        LEAFLET_ADD_PAGE,
      );
      const id = added.status === 302 ? addedIdFrom(added.location) : null;
      if (!id) return { ok: false, detail: `add: ${added.status} ${added.location}` };
      flow.ids.undone = id;
      const change = await request(`/api/medications/${id}/dosage`, {
        method: "POST",
        jar: flow.jarA,
        origin: await formOrigin(`/leki/${id}/zmiana-dawki`, flow.jarA),
        form: { doseText: SMOKE_MISTAKEN_DOSE, changedOn: today },
      });
      const before = await periodsOf(id);
      const changed = before.find((period) => period.ended_on === null);
      if (change.status !== 302 || before.length !== 2 || !changed) {
        return { ok: false, detail: `change: ${change.status} ${change.location}; periods: ${before.length}` };
      }
      const undo = await request(`/api/medications/${id}/periods/${changed.id}/undo`, {
        method: "POST",
        jar: flow.jarA,
        origin: await formOrigin(`/leki/${id}/okresy/${changed.id}/cofniecie`, flow.jarA),
        form: {},
      });
      const after = await periodsOf(id);
      const reopened =
        after.length === 1 &&
        after[0].id === before[0].id &&
        after[0].ended_on === null &&
        after[0].dose_text === before[0].dose_text &&
        after[0].started_on === before[0].started_on;
      const page = await requestPage(`/leki/${id}?cofnieto=1`, { jar: flow.jarA });
      const banner = page.status === 200 && pageContains(page.body, MEDICATION_COPY.undo.saved);
      return {
        ok: undo.status === 302 && undo.location === `/leki/${id}?cofnieto=1` && reopened && banner,
        detail: `${undo.status} ${undo.location}; periods ${before.length} -> ${after.length}; previous period ${
          reopened ? "ongoing again" : "not reopened"
        }; banner ${banner ? "present" : "missing"}`,
      };
    },
    EXPECT_OK,
  ],
  [
    "medications: undoing the first period over HTTP is refused with its message (DP011), not a server error",
    async () => {
      const id = flow.ids.undone;
      if (!id) return { ok: false, detail: "check did not run: no dose change was undone" };
      const before = await periodsOf(id);
      const first = before.at(0);
      if (before.length !== 1 || !first) return { ok: false, detail: `expected one period, got ${before.length}` };
      const response = await request(`/api/medications/${id}/periods/${first.id}/undo`, {
        method: "POST",
        jar: flow.jarA,
        origin: await formOrigin(`/leki/${id}/okresy/${first.id}/cofniecie`, flow.jarA),
        form: {},
      });
      const after = await periodsOf(id);
      const expected = `/leki/${id}/okresy/${first.id}/cofniecie?error=undoFirstPeriod`;
      const page = await requestPage(expected, { jar: flow.jarA });
      const shown = page.status === 200 && pageContains(page.body, MEDICATION_COPY.apiErrors.undoFirstPeriod);
      const unchanged = JSON.stringify(before) === JSON.stringify(after);
      const noDoseInUrl = !response.location.includes("smoke") && !response.location.includes("tablet");
      return {
        ok: response.status === 302 && response.location === expected && shown && unchanged && noDoseInUrl,
        detail: `${response.status} ${response.location}; page ${page.status}, message ${
          shown ? "present" : "missing"
        }; periods ${unchanged ? "unchanged" : "changed"}`,
      };
    },
    EXPECT_OK,
  ],
  [
    "medications: ending on the day the current period started is refused with the earliest date (MD005)",
    async () => {
      // The dose change above opened a period starting today, so today is not later than its start.
      const id = flow.ids.corrected;
      if (!id) return { ok: false, detail: "check did not run: no dose change was saved" };
      const today = todayInWarsaw();
      const before = await periodsOf(id);
      const response = await request(`/api/medications/${id}/discontinuation`, {
        method: "POST",
        jar: flow.jarA,
        origin: await formOrigin(`/leki/${id}/zakonczenie`, flow.jarA),
        form: { discontinuedOn: today },
      });
      const after = await periodsOf(id);
      const expected = `/leki/${id}/zakonczenie?error=discontinuedOnTooEarly`;
      const page = await requestPage(expected, { jar: flow.jarA });
      const message = MEDICATION_COPY.apiErrors.discontinuedOnTooEarly.replace(
        "{data}",
        formatIsoDate(earliestChangeDate(today, today)),
      );
      const shown = page.status === 200 && pageContains(page.body, message);
      const unchanged = JSON.stringify(before) === JSON.stringify(after);
      return {
        ok: response.status === 302 && response.location === expected && shown && unchanged,
        detail: `${response.status} ${response.location}; message ${shown ? "present" : "missing"}; periods ${
          unchanged ? "unchanged" : "changed"
        }`,
      };
    },
    EXPECT_OK,
  ],
  [
    "medications: ending a medication today over HTTP closes its period and removes it from the list",
    async () => {
      if (!fixtures.a) return { ok: false, detail: "check did not run: no fixture account" };
      const today = todayInWarsaw();
      // Started three days ago, so both today and yesterday are later than the start (MD005 otherwise).
      const added = await addMedication(
        {
          source: "leaflet",
          productName: "Smoke Test Preparat do zakończenia",
          substanceName: `Smoketestum ${Date.now()}`,
          confirmUnverified: "1",
          startedOn: isoDaysBefore(today, 3),
        },
        LEAFLET_ADD_PAGE,
      );
      const id = added.status === 302 ? addedIdFrom(added.location) : null;
      if (!id) return { ok: false, detail: `add: ${added.status} ${added.location}` };
      flow.ids.discontinued = id;
      const response = await request(`/api/medications/${id}/discontinuation`, {
        method: "POST",
        jar: flow.jarA,
        origin: await formOrigin(`/leki/${id}/zakonczenie`, flow.jarA),
        form: { discontinuedOn: today },
      });
      const periods = await periodsOf(id);
      const list = await requestPage("/leki", { jar: flow.jarA });
      const details = await requestPage(`/leki/${id}`, { jar: flow.jarA });
      const takenUntil = MEDICATION_COPY.discontinuation.takenUntil.replace(
        "{data}",
        formatIsoDate(isoDaysBefore(today, 1)),
      );
      const closed = periods.length === 1 && periods[0].ended_on === today;
      const offList = list.status === 200 && listItemOf(list.body, id) === null;
      const shown = details.status === 200 && pageContains(details.body, takenUntil);
      return {
        ok:
          response.status === 302 &&
          response.location === `/leki/${id}?zakonczenie=zapisane` &&
          closed &&
          offList &&
          shown,
        detail: `${response.status} ${response.location}; period ${closed ? "closed today" : "not closed today"}; list ${
          offList ? "without it" : "still shows it"
        }; details ${shown ? "show" : "miss"} the last day`,
      };
    },
    EXPECT_OK,
  ],
  [
    "medications: moving the end over HTTP moves the end of the last period",
    async () => {
      const id = flow.ids.discontinued;
      if (!id) return { ok: false, detail: "check did not run: no medication was ended" };
      const yesterday = isoDaysBefore(todayInWarsaw(), 1);
      const response = await request(`/api/medications/${id}/discontinuation/correction`, {
        method: "POST",
        jar: flow.jarA,
        origin: await formOrigin(`/leki/${id}/zakonczenie`, flow.jarA),
        form: { action: "move", discontinuedOn: yesterday },
      });
      const periods = await periodsOf(id);
      const moved = periods.at(-1)?.ended_on === yesterday;
      return {
        ok: response.status === 302 && response.location === `/leki/${id}?zakonczenie=poprawione` && moved,
        detail: `${response.status} ${response.location}; period end ${periods.at(-1)?.ended_on ?? "missing"}`,
      };
    },
    EXPECT_OK,
  ],
  [
    "medications: cancelling the end over HTTP reopens the last period and returns the medication to the list",
    async () => {
      const id = flow.ids.discontinued;
      if (!id) return { ok: false, detail: "check did not run: no medication was ended" };
      const response = await request(`/api/medications/${id}/discontinuation/correction`, {
        method: "POST",
        jar: flow.jarA,
        origin: await formOrigin(`/leki/${id}/zakonczenie`, flow.jarA),
        form: { action: "cancel" },
      });
      const periods = await periodsOf(id);
      const list = await requestPage("/leki", { jar: flow.jarA });
      const reopened = periods.at(-1)?.ended_on === null;
      const onList = list.status === 200 && listItemOf(list.body, id) !== null;
      return {
        ok: response.status === 302 && response.location === `/leki/${id}?zakonczenie=cofniete` && reopened && onList,
        detail: `${response.status} ${response.location}; period ${reopened ? "ongoing" : "still closed"}; list ${
          onList ? "shows it" : "without it"
        }`,
      };
    },
    EXPECT_OK,
  ],
  [
    "medications: an ended medication is on /leki/zakonczone and counted in the link on /leki",
    async () => {
      const id = flow.ids.discontinued;
      if (!id) return { ok: false, detail: "check did not run: no medication was ended" };
      // The end was cancelled above, so the medication is current again; ending it anew opens a new window.
      const response = await request(`/api/medications/${id}/discontinuation`, {
        method: "POST",
        jar: flow.jarA,
        origin: await formOrigin(`/leki/${id}/zakonczenie`, flow.jarA),
        form: { discontinuedOn: todayInWarsaw() },
      });
      // The expected number comes from the database, read as account A with the page's own filter: earlier steps
      // may have ended other medications of this account.
      const count = await fixtures.a.client
        .from("medications")
        .select("id", { count: "exact", head: true })
        .not("discontinued_on", "is", null);
      if (count.error) return { ok: false, detail: `counting ended medications failed: ${count.error.code}` };
      const ended = await requestPage("/leki/zakonczone", { jar: flow.jarA });
      const list = await requestPage("/leki", { jar: flow.jarA });
      const onEnded = ended.status === 200 && listItemOf(ended.body, id) !== null;
      const offList = list.status === 200 && listItemOf(list.body, id) === null;
      const link = MEDICATION_COPY.list.endedLink.replace("{liczba}", String(count.count));
      const counted = (count.count ?? 0) > 0 && list.status === 200 && pageContains(list.body, link);
      return {
        ok:
          response.status === 302 &&
          response.location === `/leki/${id}?zakonczenie=zapisane` &&
          onEnded &&
          offList &&
          counted,
        detail: `${response.status} ${response.location}; ended page ${ended.status} ${
          onEnded ? "shows it" : "without it"
        }; list ${offList ? "without it" : "still shows it"}; link "${link}" ${counted ? "present" : "missing"}`,
      };
    },
    EXPECT_OK,
  ],
  [
    "medications: deleting an item added by mistake over HTTP removes it from both lists",
    async () => {
      if (!fixtures.a) return { ok: false, detail: "check did not run: no fixture account" };
      const added = await addMedication(
        {
          source: "leaflet",
          productName: "Smoke Test Preparat do usunięcia",
          substanceName: `Smoketestum ${Date.now()}`,
          confirmUnverified: "1",
        },
        LEAFLET_ADD_PAGE,
      );
      const id = added.status === 302 ? addedIdFrom(added.location) : null;
      if (!id) return { ok: false, detail: `add: ${added.status} ${added.location}` };
      const response = await request(`/api/medications/${id}/delete`, {
        method: "POST",
        jar: flow.jarA,
        origin: await formOrigin(`/leki/${id}/usun`, flow.jarA),
        form: {},
      });
      // Gone from the database, not just hidden: no medication row and no periods left (on delete cascade).
      const row = await fixtures.a.client.from("medications").select("id").eq("id", id);
      if (row.error) return { ok: false, detail: `reading the medication failed: ${row.error.code}` };
      const periods = await periodsOf(id);
      const list = await requestPage("/leki?usunieto=1", { jar: flow.jarA });
      const ended = await requestPage("/leki/zakonczone", { jar: flow.jarA });
      const gone = row.data.length === 0 && periods.length === 0;
      const offList = list.status === 200 && listItemOf(list.body, id) === null;
      const offEnded = ended.status === 200 && listItemOf(ended.body, id) === null;
      const banner = list.status === 200 && pageContains(list.body, MEDICATION_COPY.list.deleted);
      return {
        ok:
          response.status === 302 && response.location === "/leki?usunieto=1" && gone && offList && offEnded && banner,
        detail: `${response.status} ${response.location}; row ${gone ? "deleted" : "still there"}; list ${
          offList ? "without it" : "still shows it"
        }; ended page ${offEnded ? "without it" : "still shows it"}; banner ${banner ? "present" : "missing"}`,
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

// --- Symptom journal (S-05) ------------------------------------------------
//
// Saves an entry over HTTP the way the journal form does: fetch with a JSON body and the Origin a browser derives from
// the referrer policy of /dzienniczek/nowy (formOrigin), Content-Type application/json, the session cookie, nothing
// more. Writes a journal entry, so it runs in the same mode and behind the same gate as the isolation checks, signed
// in as fixture account A in a jar of its own. Runs after the isolation checks: those count account A's rows.
//
// The symptom comes from the database by id, never typed in. Its name is used only to check the list and the URLs.

const JOURNAL_NEW_PAGE = "/dzienniczek/nowy";
const JOURNAL_LIST_PAGE = "/dzienniczek";
const JOURNAL_ROUTE = "/api/journal";

// Filled by the steps below and read by the later ones. `paths` holds every URL path the flow requested.
const journal = { jar: new Map(), symptom: null, entryId: null, paths: [] };

// A JSON POST like the form's fetch: the body never travels in the URL. Returns the status and the parsed body.
async function postJson(path, body, { jar: cookieJar, origin }) {
  journal.paths.push(path);
  const response = await fetch(BASE_URL + path, {
    method: "POST",
    redirect: "manual",
    headers: { Cookie: cookieHeader(cookieJar), Origin: origin, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  storeCookies(response, cookieJar);
  const text = await response.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    // Not JSON: left null, the step reports the status.
  }
  return { status: response.status, json };
}

// The <li> of one journal entry on the list, so the symptom name is checked inside that entry.
function entryItemOf(body, entryId) {
  const start = body.indexOf(`data-entry-id="${entryId}"`);
  if (start === -1) return null;
  const end = body.indexOf("</ul>", start);
  return end === -1 ? null : body.slice(start, end);
}

const journalFlowSteps = [
  [
    "journal: fixture account A signs in over HTTP and the new entry page renders",
    async () => {
      if (!fixtures.a) return { ok: false, detail: "check did not run: no fixture account" };
      const signIn = await request("/api/auth/signin", {
        method: "POST",
        jar: journal.jar,
        form: { email: fixtures.a.address, password },
      });
      journal.paths.push(JOURNAL_NEW_PAGE);
      const page = await requestPage(JOURNAL_NEW_PAGE, { jar: journal.jar });
      return {
        ok: signIn.status === 302 && signIn.location === "/" && page.status === 200,
        detail: `sign-in ${signIn.status} ${signIn.location}; ${JOURNAL_NEW_PAGE} ${page.status} ${page.location}`,
      };
    },
    EXPECT_OK,
  ],
  [
    "journal: saving an entry returns 201 with its id, and the entry is in the database",
    async () => {
      if (!fixtures.a) return { ok: false, detail: "check did not run: no fixture account" };
      // The second symptom by id: the isolation fixture already uses the first, so the list check below proves this
      // entry and not the fixture.
      const symptom = await fixtures.a.client.from("symptoms").select("id, name").order("id").range(1, 1).single();
      if (symptom.error) return { ok: false, detail: `symptom lookup failed: ${symptom.error.message}` };
      journal.symptom = symptom.data;

      const response = await postJson(
        JOURNAL_ROUTE,
        {
          occurredLocal: null,
          items: [{ symptomId: journal.symptom.id, severity: "moderate" }],
          note: "Smoke journal note",
        },
        { jar: journal.jar, origin: await formOrigin(JOURNAL_NEW_PAGE, journal.jar) },
      );
      const id = typeof response.json?.id === "string" ? response.json.id : null;
      if (response.status !== 201 || !id) {
        return { ok: false, detail: `${response.status} ${JSON.stringify(response.json)}` };
      }
      journal.entryId = id;

      const items = await fixtures.a.client
        .from("symptom_entry_items")
        .select("symptom_id, severity")
        .eq("entry_id", id);
      if (items.error) return { ok: false, detail: `read-back failed: ${items.error.message}` };
      const stored =
        items.data.length === 1 &&
        items.data[0].symptom_id === journal.symptom.id &&
        items.data[0].severity === "moderate";
      return {
        ok: stored,
        detail: `201; ${items.data.length} symptom row(s) stored ${stored ? "as sent" : "differently"}`,
      };
    },
    EXPECT_OK,
  ],
  [
    "journal: an entry without symptoms gets 422 with its error key",
    async () => {
      const response = await postJson(
        JOURNAL_ROUTE,
        { occurredLocal: null, items: [], note: null },
        { jar: journal.jar, origin: await formOrigin(JOURNAL_NEW_PAGE, journal.jar) },
      );
      const key = response.json?.error;
      const ok = response.status === 422 && key === "noSymptoms" && Object.hasOwn(JOURNAL_COPY.apiErrors, key);
      return { ok, detail: `${response.status} ${JSON.stringify(response.json)}` };
    },
    EXPECT_OK,
  ],
  [
    "journal: no session gets 401",
    async () => {
      const response = await postJson(
        JOURNAL_ROUTE,
        { occurredLocal: null, items: [], note: null },
        { jar: new Map(), origin: BASE_URL },
      );
      // Exactly 401: a redirect or a 422 would mean the route validated the body before deciding on the session.
      return { ok: response.status === 401, detail: `${response.status} ${JSON.stringify(response.json)}` };
    },
    EXPECT_OK,
  ],
  [
    "journal: the list shows the saved entry with its symptom name and the saved message",
    async () => {
      if (!journal.entryId || !journal.symptom) return { ok: false, detail: "check did not run: no entry was saved" };
      const path = `${JOURNAL_LIST_PAGE}?dodano=${journal.entryId}`;
      journal.paths.push(path);
      const page = await requestPage(path, { jar: journal.jar });
      if (page.status !== 200) return { ok: false, detail: `${page.status} ${page.location}` };
      const item = entryItemOf(page.body, journal.entryId);
      const named = item !== null && pageContains(item, journal.symptom.name);
      // The message carries the entry's symptoms and the deadline, so only its fixed start is compared.
      const savedPrefix = JOURNAL_COPY.list.savedWithDeadline.split(/\{(?:objawy|do)\}/)[0];
      const saved = pageContains(page.body, savedPrefix);
      return {
        ok: named && saved,
        detail: `entry ${item ? "listed" : "missing"}; symptom name ${named ? "present" : "missing"}; saved message ${
          saved ? "present" : "missing"
        }`,
      };
    },
    EXPECT_OK,
  ],
  [
    "journal: the saved entry's page shows the question for the doctor with the smoke medication and the phrase",
    async () => {
      if (!journal.entryId || !fixtures.a) return { ok: false, detail: "check did not run: no entry was saved" };
      const path = `${JOURNAL_LIST_PAGE}?dodano=${journal.entryId}`;
      journal.paths.push(path);
      const page = await requestPage(path, { jar: journal.jar });
      if (page.status !== 200) return { ok: false, detail: `${page.status} ${page.location}` };
      // The section alone, so the medication name and the phrase are proven inside the question, not elsewhere.
      const start = page.body.indexOf("data-doctor-question");
      const end = start === -1 ? -1 : page.body.indexOf("</section>", start);
      const section = end === -1 ? null : page.body.slice(start, end);
      // The fixture medication of account A (ongoing since 2026-01-05) is taken in the window of an entry saved today.
      const medicationName = fixtures.a.medication.product_name;
      const title = section !== null && pageContains(section, DOCTOR_QUESTION_COPY.sectionTitle);
      const medication = section !== null && pageContains(section, medicationName);
      // The symptom is picked by id, so it may be one with a plural name; the verb then agrees with it.
      const requiredPhrase = PLURAL_SYMPTOM_NAMES.has(journal.symptom.name) ? REQUIRED_PHRASE_PLURAL : REQUIRED_PHRASE;
      const phrase = section !== null && pageContains(section, requiredPhrase);
      return {
        ok: title && medication && phrase,
        detail: `section ${section ? "present" : "missing"}; title ${title ? "present" : "missing"}; ${medicationName} ${
          medication ? "present" : "missing"
        }; phrase ${phrase ? "present" : "missing"}`,
      };
    },
    EXPECT_OK,
  ],
  [
    "journal: no URL on the way carries the symptom name, the medication name or the note",
    async () => {
      if (!journal.symptom || !fixtures.a) return { ok: false, detail: "check did not run: no symptom was read" };
      const forbidden = [journal.symptom.name, fixtures.a.medication.product_name, "Smoke journal note"].flatMap(
        (text) => [text.toLowerCase(), encodeURIComponent(text).toLowerCase()],
      );
      const leaking = journal.paths.filter((path) => forbidden.some((text) => path.toLowerCase().includes(text)));
      return {
        ok: journal.paths.length > 0 && leaking.length === 0,
        detail: `${journal.paths.length} path(s) checked; ${leaking.length ? `leaking: ${leaking.join(", ")}` : "none leaks"}`,
      };
    },
    EXPECT_OK,
  ],
];

const journalSteps = isolationSkipReason
  ? [["symptom journal checks", null, { skip: isolationSkipReason }]]
  : journalFlowSteps;

// --- Terms gate (S-01) -----------------------------------------------------
//
// An account without acceptance of the current terms version (created without the metadata the sign-up form sends)
// is held on the acceptance screen: interior screens redirect there, API routes answer 403, the privacy page and
// sign-out stay open. Accepting opens the interior. Creates an account, so it runs behind the isolation gate.

const termsGate = { jar: new Map(), account: null };

async function acceptedVersionsOf(account) {
  const { data, error } = await account.client.from("terms_acceptances").select("version");
  if (error) throw new Error(`read of terms_acceptances failed: ${describeError(error)}`);
  return data.map((row) => row.version);
}

const signInTermsGateAccount = () =>
  request("/api/auth/signin", {
    method: "POST",
    jar: termsGate.jar,
    form: { email: termsGate.account.address, password },
  });

const termsGateFlowSteps = [
  [
    "terms gate: an account without accepted terms signs in",
    async () => {
      termsGate.account = await createAccount("noterms-gate", { acceptTerms: false });
      const versions = await acceptedVersionsOf(termsGate.account);
      const signIn = await signInTermsGateAccount();
      return {
        ok: versions.length === 0 && signIn.status === 302 && signIn.location === "/",
        detail: `accepted versions [${versions}], sign-in ${signIn.status} ${signIn.location}`,
      };
    },
    EXPECT_OK,
  ],
  ...["/leki", "/dashboard", "/dzienniczek/nowy"].map((path) => [
    `terms gate: ${path} redirects to the acceptance screen`,
    () => request(path, { jar: termsGate.jar }),
    { status: 302, location: TERMS_ACCEPTANCE_PATH, exact: true },
  ]),
  [
    "terms gate: POST /api/journal answers 403 termsNotAccepted",
    async () => {
      const response = await fetch(BASE_URL + "/api/journal", {
        method: "POST",
        redirect: "manual",
        headers: { Cookie: cookieHeader(termsGate.jar), Origin: BASE_URL, "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const text = await response.text();
      const ok = response.status === 403 && text === JSON.stringify({ error: "termsNotAccepted" });
      return { ok, detail: `${response.status} ${text}` };
    },
    EXPECT_OK,
  ],
  ["terms gate: /prywatnosc stays open", () => request("/prywatnosc", { jar: termsGate.jar }), { status: 200 }],
  [
    "terms gate: the acceptance screen renders both forms",
    async () => {
      const page = await requestPage(TERMS_ACCEPTANCE_PATH, { jar: termsGate.jar });
      const ok =
        page.status === 200 &&
        page.body.includes('action="/api/terms/accept"') &&
        page.body.includes('action="/api/auth/signout"');
      return { ok, detail: `${page.status}` };
    },
    EXPECT_OK,
  ],
  [
    "terms gate: signing out from the acceptance screen works and records no acceptance",
    async () => {
      const signOut = await request("/api/auth/signout", {
        method: "POST",
        jar: termsGate.jar,
        origin: await formOrigin(TERMS_ACCEPTANCE_PATH, termsGate.jar),
      });
      const after = await request("/leki", { jar: termsGate.jar });
      const versions = await acceptedVersionsOf(termsGate.account);
      return {
        ok: signOut.status === 302 && after.location === "/auth/signin" && versions.length === 0,
        detail: `sign-out ${signOut.status}, /leki ${after.status} ${after.location}, accepted versions [${versions}]`,
      };
    },
    EXPECT_OK,
  ],
  [
    "terms gate: accepting redirects to / and opens the interior",
    async () => {
      await signInTermsGateAccount();
      const accept = await request("/api/terms/accept", {
        method: "POST",
        jar: termsGate.jar,
        origin: await formOrigin(TERMS_ACCEPTANCE_PATH, termsGate.jar),
      });
      const leki = await request("/leki", { jar: termsGate.jar });
      const versions = await acceptedVersionsOf(termsGate.account);
      return {
        ok:
          accept.status === 303 &&
          accept.location === "/" &&
          leki.status === 200 &&
          versions.length === 1 &&
          versions[0] === CURRENT_TERMS_VERSION,
        detail: `accept ${accept.status} ${accept.location}, /leki ${leki.status}, accepted versions [${versions}]`,
      };
    },
    EXPECT_OK,
  ],
  [
    "terms gate: accepting again (second tab) ends the same way and adds no row",
    async () => {
      const accept = await request("/api/terms/accept", {
        method: "POST",
        jar: termsGate.jar,
        origin: await formOrigin("/", termsGate.jar),
      });
      const versions = await acceptedVersionsOf(termsGate.account);
      return {
        ok: accept.status === 303 && accept.location === "/" && versions.length === 1,
        detail: `accept ${accept.status} ${accept.location}, accepted versions [${versions}]`,
      };
    },
    EXPECT_OK,
  ],
  [
    "terms gate: the acceptance screen sends an account with accepted terms back to /",
    () => request(TERMS_ACCEPTANCE_PATH, { jar: termsGate.jar }),
    { status: 302, location: "/", exact: true },
  ],
];

const termsGateSteps = isolationSkipReason
  ? [["terms gate checks", null, { skip: isolationSkipReason }]]
  : termsGateFlowSteps;

// Existing-account mode signs in to a real account: without acceptance of the current version every interior step
// would fail on the redirect. The run never accepts on its behalf — a person accepts the terms, not a script.
const existingAccountTermsStep = [
  "existing account has accepted the current terms version",
  async () => {
    const client = supabaseClient();
    const { error: signInError } = await client.auth.signInWithPassword({ email, password });
    if (signInError) return { ok: false, detail: `sign-in failed: ${describeError(signInError)}` };
    const versions = await acceptedVersionsOf({ client });
    const ok = versions.some((version) => version >= CURRENT_TERMS_VERSION);
    return {
      ok,
      detail: ok
        ? `accepted versions [${versions}]`
        : `accepted versions [${versions}] — sign in to this account in a browser, accept the terms on ${TERMS_ACCEPTANCE_PATH}, then run again`,
    };
  },
  EXPECT_OK,
];

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

// The sign-up form as a browser sends it with the terms box ticked (S-01).
const signupForm = (address) => ({ email: address, password, confirmPassword: password, terms: "accepted" });
const noTermsEmail = `smoke-noterms-${Date.now()}@${emailDomain}`;

const signupSteps = [
  [
    "signup without accepted terms is rejected",
    () => {
      const { terms: _terms, ...form } = signupForm(noTermsEmail);
      return request("/api/auth/signup", { method: "POST", form });
    },
    { status: 302, location: "/auth/signup?error=terms", exact: true },
  ],
  [
    "signup without accepted terms creates no account",
    async () => {
      // Local Supabase confirms addresses on its own, so an account created by the rejected form would sign in.
      // Only the measured answer for an unknown address counts; any other error proves nothing about the account.
      const { error } = await supabaseClient().auth.signInWithPassword({ email: noTermsEmail, password });
      const absent = isAuthApiError(error) && error.code === "invalid_credentials";
      return { ok: absent, detail: describeError(error) };
    },
    EXPECT_OK,
  ],
  [
    "signup creates account",
    () => request("/api/auth/signup", { method: "POST", form: signupForm(email) }),
    { status: 302, location: "/auth/confirm-email", exact: true },
  ],
  [
    "signup to an existing address ends on the same screen",
    () => request("/api/auth/signup", { method: "POST", form: signupForm(email) }),
    { status: 302, location: "/auth/confirm-email", exact: true },
  ],
  [
    "account from the signup form has accepted the current terms version",
    async () => {
      const client = supabaseClient();
      const { error: signInError } = await client.auth.signInWithPassword({ email, password });
      if (signInError) return { ok: false, detail: `sign-in failed: ${describeError(signInError)}` };
      const { data, error } = await client.from("terms_acceptances").select("version, accepted_at");
      if (error) return { ok: false, detail: describeError(error) };
      const accepted = data.length === 1 && data[0].version === CURRENT_TERMS_VERSION && Boolean(data[0].accepted_at);
      return { ok: accepted, detail: JSON.stringify(data) };
    },
    EXPECT_OK,
  ],
];

// --- Address confirmation link (S-01, phase 5) ------------------------------
//
// Local Supabase confirms addresses on its own and sends no confirmation mail, so a real token never exists here.
// The steps cover the branches that need none: opening the link consumes nothing, a bad token lands on the expired
// screen, and asking for a new link answers the same for an unknown and an existing address. The full mail path is
// a manual check on production. A separate cookie jar keeps the main session out of it.

const CONFIRM_PATH = "/auth/confirm";
const CONFIRM_EXPIRED_PATH = "/auth/confirm?expired=1";
const confirmJar = new Map();

const emailConfirmLinkSteps = [
  [
    "email confirm: opening the link renders the confirm form and consumes nothing",
    async () => {
      const page = await requestPage(`${CONFIRM_PATH}?token_hash=smoke-not-a-token&type=email`, { jar: confirmJar });
      const ok =
        page.status === 200 &&
        page.body.includes('action="/api/auth/email-confirm"') &&
        page.body.includes('value="smoke-not-a-token"') &&
        confirmJar.size === 0;
      return { ok, detail: `${page.status}, ${confirmJar.size} cookie(s) set` };
    },
    EXPECT_OK,
  ],
  [
    "email confirm: a bad token lands on the expired-link screen",
    async () =>
      request("/api/auth/email-confirm", {
        method: "POST",
        jar: confirmJar,
        form: { token_hash: "smoke-not-a-token", type: "email" },
        origin: await formOrigin(`${CONFIRM_PATH}?token_hash=smoke-not-a-token&type=email`, confirmJar),
      }),
    { status: 302, location: CONFIRM_EXPIRED_PATH, exact: true },
  ],
  [
    "email confirm: the expired-link screen offers a new link",
    async () => {
      const page = await requestPage(CONFIRM_EXPIRED_PATH, { jar: confirmJar });
      const ok = page.status === 200 && page.body.includes('action="/api/auth/email-resend"');
      return { ok, detail: `${page.status}` };
    },
    EXPECT_OK,
  ],
];

// The resend route makes Supabase send mail, so it runs only against a local Supabase, like the recovery steps.
const emailResendSteps = [
  [
    "email resend: unknown and existing address end on the same check-inbox screen",
    async () => {
      const origin = await formOrigin(CONFIRM_EXPIRED_PATH, confirmJar);
      const send = (address) =>
        request("/api/auth/email-resend", { method: "POST", jar: confirmJar, form: { email: address }, origin });
      const unknown = await send(`smoke-nobody-confirm-${Date.now()}@${emailDomain}`);
      const existing = await send(email);
      const same = (r) => r.status === 302 && r.location === "/auth/confirm-email";
      return {
        ok: same(unknown) && same(existing),
        detail: `unknown ${unknown.status} ${unknown.location}, existing ${existing.status} ${existing.location}`,
      };
    },
    EXPECT_OK,
  ],
];

const emailConfirmSteps = [
  ...emailConfirmLinkSteps,
  ...(recoverySkipReason ? [["email resend check", null, { skip: recoverySkipReason }]] : emailResendSteps),
];

const steps = [
  ["home redirects anonymous user", () => request("/"), { status: 302, location: "/auth/signin" }],
  ["dashboard redirects anonymous user", () => request("/dashboard"), { status: 302, location: "/auth/signin" }],
  [
    "dashboard.html redirects anonymous user",
    () => request("/dashboard.html"),
    { status: 302, location: "/auth/signin" },
  ],
  [
    "acceptance screen redirects anonymous user",
    () => request(TERMS_ACCEPTANCE_PATH),
    { status: 302, location: "/auth/signin", exact: true },
  ],
  ...(usesExistingAccount ? [existingAccountTermsStep] : signupSteps),
  ...emailConfirmSteps,
  [
    "signin rejects wrong password",
    () => request("/api/auth/signin", { method: "POST", form: { email, password: "wrong" } }),
    { status: 302, location: "/auth/signin?error=credentials", exact: true },
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
  ...journalSteps,
  ...termsGateSteps,
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
