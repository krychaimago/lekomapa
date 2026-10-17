// Seeds the heavy account of the timeline measurements (S-09, phase 4 of
// context/changes/medication-symptom-timeline/plan.md) into the LOCAL Supabase, for the Lighthouse LCP runs on
// /wizyta/os-czasu: 20 medications with 3 dosage periods each (every second one ended) and 1000 symptom entries over 8
// symptoms within the year — the same generator as bench.mjs and render-bench.mjs (heavy-fixture.mjs), not a copy.
//
// Run (needs `npx supabase start`; the target is .dev.vars, never .env, which points at production):
//
//   node --experimental-strip-types scripts/timeline/seed-heavy.mjs
//
// Optional environment: HEAVY_EMAIL, HEAVY_PASSWORD (the account to create; defaults below), SUPABASE_URL and
// SUPABASE_KEY (default: read from .dev.vars). The script refuses to run when SUPABASE_URL is not a local address.
// Sign in with the printed address afterwards. Remove the account through /konto/usun (or the Supabase panel of the
// local instance) before seeding it again: the script refuses an account that already holds medications or entries.
//
// How the data gets in, and why:
//   - The account is created through Supabase Auth (signUp with the current terms version), as the app does.
//   - The rows go in through psql as postgres in the local database container (the one scripts/db-checks.mjs uses),
//     in ONE transaction. The history guards refuse a year of past data through the app on purpose: a journal entry
//     at most 14 days back (SE003), an end date at most 14 days back (medications_guard_core). For those writes only,
//     the script disables exactly these named triggers and re-enables them inside the same transaction, then asserts
//     that every trigger of the three tables is enabled before COMMIT; ALTER TABLE is transactional, so a failure
//     anywhere rolls the triggers back to enabled as well. `session_replication_role = replica` is never used.
//   - Dosage periods need no exception: a medication saved a moment ago is inside its correction window, where the
//     insert guard lets earlier periods in. Every other guard and constraint (no overlap, non-empty periods, the
//     variant rule, "at least one symptom") stays on.
//   - The SQL first checks that the new account exists in this database: if the signup went to another Supabase, the
//     account is missing here and nothing is written.
//   - "Today" of the fixture is yesterday in Polish time, so no entry lies in the future; ongoing periods still reach
//     today on the page.

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { createClient } from "@supabase/supabase-js";

import { CURRENT_TERMS_VERSION } from "../../src/lib/copy/terms.ts";
import { CONFIG_PATH, containerName, parseProjectId } from "../db-checks.mjs";
import { heavyAccount } from "./heavy-fixture.mjs";

const REPO_ROOT = path.resolve(import.meta.dirname, "../..");
const DEV_VARS_PATH = path.join(REPO_ROOT, ".dev.vars");
const EMAIL = process.env.HEAVY_EMAIL ?? "timeline-heavy@example.test";
const PASSWORD = process.env.HEAVY_PASSWORD ?? "Heavy-Timeline-Passw0rd!";
// A leaflet substance without a code: the heavy account measures the timeline, not interactions.
const SUBSTANCE = "substancja konta pomiarowego";

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
      "(localhost / 127.0.0.1). The heavy account is local-only test data; .env points at production.",
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
if (signUpError) console.log(`Account ${EMAIL} already exists; the SQL step checks that it holds no data yet.`);

// --- 3. The rows, through psql in the local container ---
const fixture = heavyAccount(warsawDate(-1));
const input = {
  email: EMAIL,
  substance: SUBSTANCE,
  medications: fixture.medications.map(({ name, discontinuedOn, periods }) => ({
    name,
    discontinuedOn,
    periods: periods.map(({ startedOn, endedOn, doseText }) => ({ startedOn, endedOn, doseText })),
  })),
  symptoms: fixture.symptoms.map(({ name, entries }) => ({ name, entries })),
};
const inputJson = JSON.stringify(input);
if (inputJson.includes("$heavy$")) fail("Fixture text contains the SQL quote tag $heavy$.");

const sql = String.raw`
\set ON_ERROR_STOP on
begin;

create temp table heavy_input (doc jsonb) on commit drop;
insert into heavy_input values ($heavy$${inputJson}$heavy$::jsonb);

-- The account must exist in THIS database and hold nothing yet.
do $$
declare
  v_email text := (select doc ->> 'email' from heavy_input);
  v_user uuid;
begin
  select id into v_user from auth.users where email = v_email;
  if v_user is null then
    raise exception 'account % is not in this database: the signup went to another Supabase', v_email;
  end if;
  if exists (select 1 from public.medications where user_id = v_user)
     or exists (select 1 from public.symptom_entries where user_id = v_user) then
    raise exception 'account % already holds medications or entries; delete it before seeding again', v_email;
  end if;
end;
$$;

-- Medications: an end date far in the past is refused by medications_guard_core (14 days back at most), and
-- medications_sync_discontinuation would close an ongoing period; the periods are saved already closed instead.
alter table public.medications disable trigger medications_guard_core;
alter table public.medications disable trigger medications_sync_discontinuation;

do $$
declare
  v_doc jsonb := (select doc from heavy_input);
  v_user uuid := (select id from auth.users where email = v_doc ->> 'email');
  v_medication jsonb;
  v_period jsonb;
  v_medication_id uuid;
begin
  for v_medication in select value from jsonb_array_elements(v_doc -> 'medications') loop
    insert into public.medications (user_id, product_name, composition_source)
    values (v_user, v_medication ->> 'name', 'leaflet')
    returning id into v_medication_id;

    insert into public.medication_substances (medication_id, substance_name, atc_code)
    values (v_medication_id, v_doc ->> 'substance', null);

    for v_period in select value from jsonb_array_elements(v_medication -> 'periods') loop
      insert into public.dosage_periods (medication_id, dose_text, started_on, ended_on)
      values (
        v_medication_id,
        v_period ->> 'doseText',
        (v_period ->> 'startedOn')::date,
        (v_period ->> 'endedOn')::date
      );
    end loop;

    if v_medication ->> 'discontinuedOn' is not null then
      update public.medications
         set discontinued_on = (v_medication ->> 'discontinuedOn')::date
       where id = v_medication_id;
    end if;
  end loop;
end;
$$;

alter table public.medications enable trigger medications_guard_core;
alter table public.medications enable trigger medications_sync_discontinuation;

-- Journal entries: dates up to a year back are refused by symptom_entries_guard_occurred_at (14 days back at most).
alter table public.symptom_entries disable trigger symptom_entries_guard_occurred_at;

do $$
declare
  v_doc jsonb := (select doc from heavy_input);
  v_user uuid := (select id from auth.users where email = v_doc ->> 'email');
  v_symptom jsonb;
  v_entry jsonb;
  v_symptom_id uuid;
  v_entry_id uuid;
begin
  for v_symptom in select value from jsonb_array_elements(v_doc -> 'symptoms') loop
    select id into v_symptom_id from public.symptoms where name = v_symptom ->> 'name';
    if v_symptom_id is null then
      raise exception 'symptom % is not in the catalog', v_symptom ->> 'name';
    end if;

    for v_entry in select value from jsonb_array_elements(v_symptom -> 'entries') loop
      insert into public.symptom_entries (user_id, occurred_at)
      values (v_user, (v_entry ->> 'occurredAt')::timestamptz)
      returning id into v_entry_id;

      insert into public.symptom_entry_items (entry_id, symptom_id, severity)
      values (v_entry_id, v_symptom_id, v_entry ->> 'severity');
    end loop;
  end loop;
end;
$$;

-- Run the deferred "at least one symptom" checks now: a table with pending trigger events cannot be altered.
set constraints all immediate;
set constraints all deferred;
alter table public.symptom_entries enable trigger symptom_entries_guard_occurred_at;

-- Every trigger of the touched tables is enabled again, and the counts are the fixture's.
do $$
declare
  v_doc jsonb := (select doc from heavy_input);
  v_user uuid := (select id from auth.users where email = v_doc ->> 'email');
  v_disabled text;
  v_medications int;
  v_periods int;
  v_entries int;
begin
  select string_agg(t.tgname, ', ') into v_disabled
    from pg_trigger t
   where t.tgrelid in ('public.medications'::regclass, 'public.dosage_periods'::regclass,
                       'public.symptom_entries'::regclass)
     and not t.tgisinternal
     and t.tgenabled <> 'O';
  if v_disabled is not null then
    raise exception 'triggers still disabled: %', v_disabled;
  end if;

  select count(*) into v_medications from public.medications where user_id = v_user;
  select count(*) into v_periods
    from public.dosage_periods p join public.medications m on m.id = p.medication_id
   where m.user_id = v_user;
  select count(*) into v_entries from public.symptom_entries where user_id = v_user;
  if v_medications <> jsonb_array_length(v_doc -> 'medications')
     or v_periods <> (select sum(jsonb_array_length(m -> 'periods'))::int
                        from jsonb_array_elements(v_doc -> 'medications') as m)
     or v_entries <> (select sum(jsonb_array_length(s -> 'entries'))::int
                        from jsonb_array_elements(v_doc -> 'symptoms') as s) then
    raise exception 'unexpected counts: % medications, % periods, % entries', v_medications, v_periods, v_entries;
  end if;
  raise notice 'HEAVY_SEED medications=% periods=% entries=%', v_medications, v_periods, v_entries;
end;
$$;

commit;
`;

const result = spawnSync(
  "docker",
  ["exec", "-i", container, "psql", "-X", "-q", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres", "-f", "-"],
  { input: sql, encoding: "utf8" },
);
if (result.error || result.status !== 0) {
  fail(`Seeding failed, nothing was written:\n${result.error?.message ?? result.stderr.trim()}`);
}
const summary = /HEAVY_SEED .*/.exec(result.stderr)?.[0] ?? "HEAVY_SEED (no summary)";
console.log(summary);
console.log(`Heavy account ready in ${container}: sign in as ${EMAIL} and open /wizyta/os-czasu.`);
