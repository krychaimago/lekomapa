// Smoke test: proves the built app, the Cloudflare adapter and the Supabase auth flow still work together,
// and that row level security really isolates one account's medications from another's.
// Run against a live server: BASE_URL=http://localhost:4321 node scripts/smoke.mjs
//
// The auth path speaks plain HTTP and needs nothing but fetch. The isolation path talks to Supabase
// directly, so it imports @supabase/supabase-js — the single dependency of this script, already in
// "dependencies" because the app itself uses it.
//
// Two modes, picked by the environment:
//   - throwaway account (default): signs up a fresh address, then signs in. Needs a Supabase with e-mail
//     confirmation disabled, so this is the local and CI mode. Only this mode runs the isolation checks.
//   - existing account: set SMOKE_EMAIL and SMOKE_PASSWORD to a confirmed account. Signup is skipped, so the
//     run works against an environment that confirms e-mail and leaves no new rows behind.
// SMOKE_EMAIL_DOMAIN overrides the throwaway address domain when example.com is rejected.

import { createClient } from "@supabase/supabase-js";

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
const email = EXISTING_EMAIL ?? `smoke-${Date.now()}@${emailDomain}`;
const password = EXISTING_PASSWORD ?? "Smoke-Test-Passw0rd!";
const jar = new Map();

// The isolation checks need a Supabase address and public key of their own. An empty value counts as
// missing: an empty secret looks exactly like an absent one downstream, and a silently skipped isolation
// check would turn a data leak into a green run.
if (!usesExistingAccount) {
  for (const [name, value] of [
    ["SUPABASE_URL", SUPABASE_URL],
    ["SUPABASE_KEY", SUPABASE_KEY],
  ]) {
    if (!value) {
      console.error(`${name} is missing or empty — the isolation checks cannot run without it.`);
      process.exit(1);
    }
  }
}

function cookieHeader() {
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}

function storeCookies(response) {
  for (const raw of response.headers.getSetCookie()) {
    const [pair, ...attrs] = raw.split(";");
    const [name, ...rest] = pair.split("=");
    const expired = attrs.some((a) => /max-age=0/i.test(a.trim()));
    if (expired) jar.delete(name.trim());
    else jar.set(name.trim(), rest.join("="));
  }
}

async function request(path, { method = "GET", form } = {}) {
  const response = await fetch(BASE_URL + path, {
    method,
    redirect: "manual",
    headers: {
      Cookie: cookieHeader(),
      Origin: BASE_URL,
      ...(form ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
    },
    body: form ? new URLSearchParams(form).toString() : undefined,
  });
  storeCookies(response);
  return { status: response.status, location: response.headers.get("location") ?? "" };
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

const fixtureStep = [
  "isolation fixtures: two accounts, one medication each",
  async () => {
    const [a, b] = await Promise.all([createAccount("iso-a"), createAccount("iso-b")]);
    fixtures.a = await seedMedication(a, "A");
    fixtures.b = await seedMedication(b, "B");
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

        const changedRows = (updated.data ?? []).length;
        const deletedRows = (deleted.data ?? []).length;
        const intact = after !== null && after[guardedColumn] === foreign[guardedColumn];
        const notes = [updated.error?.message, deleted.error?.message].filter(Boolean);
        return {
          ok: changedRows === 0 && deletedRows === 0 && intact,
          detail: `${changedRows} row(s) changed, ${deletedRows} row(s) deleted, owner's row ${
            intact ? "intact" : "altered"
          }${notes.length ? ` (${notes.join("; ")})` : ""}`,
        };
      },
      EXPECT_OK,
    ],
    [
      `${table}: public key without a session reads no rows`,
      async () => {
        const { data, error } = await fixtures.anon.from(table).select("id");
        if (error) return { ok: data === null, detail: `blocked with: ${error.message}` };
        return { ok: data.length === 0, detail: `${data.length} row(s) returned` };
      },
      EXPECT_OK,
    ],
  ];
}

// Existing-account mode runs against an environment that confirms e-mail addresses — production. A second
// account cannot be created there, and seeding invented medications into a real account would write made-up
// health data. CI runs in throwaway mode, so the gate stays in force where it matters.
const isolationSteps = usesExistingAccount
  ? [
      [
        "medication isolation checks",
        null,
        { skip: "existing-account mode cannot create a second account or write fixture data" },
      ],
    ]
  : [fixtureStep, ...isolationTargets.flatMap(isolationChecks)];

// --- Steps -----------------------------------------------------------------

const signupStep = [
  "signup creates account",
  () => request("/api/auth/signup", { method: "POST", form: { email, password } }),
  { status: 302, location: "/auth/confirm-email" },
];

const steps = [
  ["home renders", () => request("/"), { status: 200 }],
  ["dashboard redirects anonymous user", () => request("/dashboard"), { status: 302, location: "/auth/signin" }],
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
  ["signout clears session", () => request("/api/auth/signout", { method: "POST" }), { status: 302, location: "/" }],
  ["dashboard redirects after signout", () => request("/dashboard"), { status: 302, location: "/auth/signin" }],
  ...isolationSteps,
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
    (expected.location === undefined || actual.location.startsWith(expected.location));
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}  -> ${actual.status} ${actual.location}`);
  if (!ok) {
    failed++;
    console.log(`      expected ${expected.status} ${expected.location ?? ""}`);
  }
}

console.log(failed ? `\n${failed} step(s) failed` : "\nAll smoke steps passed");
process.exit(failed ? 1 : 0);
