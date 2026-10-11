-- Account deletion checks (S-09 phase 1): public.delete_own_account() deletes only the caller's account, only with a
-- fresh password sign-in, and every refusal comes back as a named SQLSTATE.
--   DELETION 1: no session — postgres without claims and authenticated without `sub` (even with a fresh password
--               sign-in in amr) get 28000; anon gets 42501, because it has no EXECUTE on the function at all
--               (DELETION 5), so it never reaches the session check.
--   DELETION 2: amr without a "password" entry — no amr, an empty array, a non-array value, "otp" (measured shape of
--               a session from the password reset link), "recovery", and "password" without a numeric timestamp —
--               is AD001.
--   DELETION 3: amr with "password" older than 60 seconds (61 s, also next to a fresh "otp") is AD001.
--   DELETION 4: a fresh "password" (59 s) with the correction windows closed deletes account A: its auth.users
--               row and every row of A in every account table are gone, every row of account B stays. A second call
--               by the deleted account is AD002. Counterexample: with the windows closed, deleting A's medication or
--               journal entry by hand is refused by the history guards, so the guards were active.
--   DELETION 5: anon has no EXECUTE on the function, authenticated has; the function is security definer with an empty
--               search_path.
--
-- How to run: `npm run db:check` (needs `npx supabase start`), or this file alone:
-- `node scripts/db-checks.mjs supabase/tests/account_deletion_checks.sql`. The runner (scripts/db-checks.mjs) passes
-- it only when it prints `GATE_COMPLETE account_deletion_checks` at the end.
--
-- Rules every block follows:
--   - The function is called only through pg_temp.try_delete, which catches only the codes the function raises
--     (28000, AD001, AD002) and 42501 (no EXECUTE), each by name. Any other error stops the file.
--   - After every refusal the account is checked as postgres to still exist, so a refusal that deleted anyway fails.
--   - The role is switched at the top level of a block, never inside an exception subblock: `set local role` inside a
--     subblock that catches an error is undone with it, and the next steps would run as postgres.
--   - amr timestamps are unix seconds (measured on local Supabase, see context/changes/account-deletion-cascade/
--     change.md). now() is constant inside the transaction, so "59 s ago" and "61 s ago" sit one second on
--     each side of the 60-second bound.
--   - Rows get an old created_at only through pg_temp.backdate, which disables ONLY the freeze trigger of that table
--     for one update. Every history guard stays active, so DELETION 4 measures the deletion with the guards on.
--   - The deferred "at least one symptom" checks run at commit, and this file ends with rollback. DELETION 4 runs them
--     right after the deletion with `set constraints ... immediate`, so a cascade that left an entry without symptoms
--     would fail here.
--
-- Everything runs in one transaction ended with rollback: nothing is left behind.

\set ON_ERROR_STOP on

begin;

-- ---------------------------------------------------------------------------
-- Account data tables: closure of foreign keys leading to auth.users.
-- Copied from schema_invariants_checks.sql, as in account_isolation_checks.sql; keep all three copies identical,
-- because a table that drops out of this copy would drop out of the deletion check below. No filter on a user_id
-- column: medication_substances, dosage_periods and symptom_entry_items belong to the account through medication_id
-- and entry_id, and such a filter would skip them.
--   - Tables in public (relkind r or p) reachable from auth.users by foreign keys (contype f), walking from the
--     referenced table to the referencing one.
--   - The walk is a recursive UNION carrying the path of visited tables and never enters a table already on the
--     path, so a cycle ends. A foreign key of a table to itself (e.g. a period pointing at the previous period)
--     is skipped and does not add depth.
--   - Each table appears once, with depth = the LONGEST path from auth.users, so a table reachable both through
--     user_id and through medication_id is deeper than medications.
-- ---------------------------------------------------------------------------

create function pg_temp.account_data_tables()
returns table (table_oid oid, table_name name, depth integer)
language sql
stable
as $$
  with recursive walk (relid, depth, path) as (
    select c.conrelid, 1, array[c.conrelid]
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    where c.contype = 'f'
      and c.confrelid = 'auth.users'::regclass
      and t.relnamespace = 'public'::regnamespace
      and t.relkind in ('r', 'p')
    union
    select c.conrelid, w.depth + 1, w.path || c.conrelid
    from walk w
    join pg_constraint c on c.contype = 'f' and c.confrelid = w.relid
    join pg_class t on t.oid = c.conrelid
    where c.conrelid <> c.confrelid
      and not (c.conrelid = any (w.path))
      and t.relnamespace = 'public'::regnamespace
      and t.relkind in ('r', 'p')
  )
  select w.relid, t.relname, max(w.depth)
  from walk w
  join pg_class t on t.oid = w.relid
  group by w.relid, t.relname
$$;

-- ---------------------------------------------------------------------------
-- Test accounts and helpers. UUID pool 00000000-0000-4000-9900-*.
--   account A: 0a00; medication 0a01, substance 0a02, period 0a03, journal entry 0a04 with symptom 0a05,
--              terms acceptance 0a06
--   account B: 0b00; medication 0b01, substance 0b02, period 0b03, journal entry 0b04 with symptom 0b05,
--              terms acceptance 0b06
--   Every row of A has an id starting with 00000000-0000-4000-9900-000000000a, every row of B with ...-000000000b.
--   That is how DELETION 4 finds the rows of each account in every table without a user_id column.
-- ---------------------------------------------------------------------------

-- Creates an account the way GoTrue does: one insert into auth.users with the signup metadata.
create function pg_temp.create_account(p_id uuid, p_email text, p_meta jsonb)
returns void
language plpgsql
as $$
begin
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, raw_user_meta_data, created_at, updated_at)
  values ('00000000-0000-0000-0000-000000000000', p_id, 'authenticated', 'authenticated', p_email, 'x', p_meta,
          now(), now());
end;
$$;

-- amr with one entry: the method and a timestamp p_age before now(), in unix seconds as the auth server writes it.
create function pg_temp.amr(p_method text, p_age interval)
returns jsonb
language sql
stable
as $$
  select jsonb_build_array(jsonb_build_object(
    'method', p_method,
    'timestamp', floor(extract(epoch from now() - p_age))::bigint));
$$;

-- Signs in as p_uid with the given amr claim (null = no amr key in the token).
create function pg_temp.act_as(p_uid uuid, p_amr jsonb)
returns void
language plpgsql
as $$
declare
  v_claims jsonb := jsonb_build_object('sub', p_uid, 'role', 'authenticated');
begin
  if p_amr is not null then
    v_claims := v_claims || jsonb_build_object('amr', p_amr);
  end if;
  perform set_config('request.jwt.claims', v_claims::text, true);
  execute 'set local role authenticated';
  if current_user <> 'authenticated' or auth.uid() is distinct from p_uid
     or (auth.jwt() -> 'amr') is distinct from p_amr then
    raise exception 'switch to account % did not take effect (current_user %, auth.uid %, amr %)',
      p_uid, current_user, auth.uid(), auth.jwt() -> 'amr';
  end if;
end;
$$;

-- authenticated with a fresh password sign-in in amr but no sub: auth.uid() is empty.
create function pg_temp.act_as_authenticated_without_sub()
returns void
language plpgsql
as $$
begin
  perform set_config('request.jwt.claims',
    jsonb_build_object('role', 'authenticated', 'amr', pg_temp.amr('password', interval '10 seconds'))::text, true);
  execute 'set local role authenticated';
  if current_user <> 'authenticated' or auth.uid() is not null then
    raise exception 'switch to authenticated without sub did not take effect (current_user %, auth.uid %)', current_user, auth.uid();
  end if;
end;
$$;

create function pg_temp.act_as_anon()
returns void
language plpgsql
as $$
begin
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  execute 'set local role anon';
  if current_user <> 'anon' or auth.uid() is not null then
    raise exception 'switch to anon did not take effect (current_user %, auth.uid %)', current_user, auth.uid();
  end if;
end;
$$;

create function pg_temp.act_as_postgres()
returns void
language plpgsql
as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  if current_user <> 'postgres' then
    raise exception 'switch back to postgres did not take effect (current_user %)', current_user;
  end if;
end;
$$;

-- Calls public.delete_own_account() as the current role. Returns 'ok' or the SQLSTATE it failed with. Only the codes
-- the function raises and 42501 (no EXECUTE) are caught, each by name; any other error stops the file.
create function pg_temp.try_delete()
returns text
language plpgsql
as $$
declare
  v_state text;
begin
  begin
    perform public.delete_own_account();
    return 'ok';
  exception
    when sqlstate '28000' or sqlstate 'AD001' or sqlstate 'AD002' or sqlstate '42501' then
      get stacked diagnostics v_state = returned_sqlstate;
      return v_state;
  end;
end;
$$;

-- Runs one write with the row id as $1. Returns 'ok <rows>' or 'P0001: <message>'. Only P0001 is caught.
create function pg_temp.try_exec(p_sql text, p_id uuid)
returns text
language plpgsql
as $$
declare
  v_rows integer;
  v_message text;
begin
  execute p_sql using p_id;
  get diagnostics v_rows = row_count;
  return 'ok ' || v_rows;
exception when sqlstate 'P0001' then
  get stacked diagnostics v_message = message_text;
  return 'P0001: ' || v_message;
end;
$$;

create function pg_temp.assert_code(p_check text, p_case text, p_got text, p_expected text)
returns void
language plpgsql
as $$
begin
  if p_got is distinct from p_expected then
    raise exception 'DELETION % FAILED: % gave "%", expected %', p_check, p_case, p_got, p_expected;
  end if;
end;
$$;

create function pg_temp.assert_account_exists(p_check text, p_case text, p_uid uuid)
returns void
language plpgsql
as $$
begin
  if current_user <> 'postgres' then
    raise exception 'assert_account_exists must run as postgres (current_user %)', current_user;
  end if;
  if not exists (select 1 from auth.users where id = p_uid) then
    raise exception 'DELETION % FAILED: % was refused, but account % is gone', p_check, p_case, p_uid;
  end if;
end;
$$;

-- Moves created_at of one row back by p_age. Only the freeze trigger of the table is disabled, for this one update.
-- ALTER TABLE refuses a table with pending trigger events, so the deferred "at least one symptom" checks of the
-- entries saved so far run first; every entry saved before this point has a symptom, so they pass.
create function pg_temp.backdate(p_table name, p_id uuid, p_age interval)
returns void
language plpgsql
as $$
declare
  v_trigger name := p_table || '_freeze_created_at';
  v_rows integer;
  v_created_at timestamptz;
begin
  if current_user <> 'postgres' then
    raise exception 'backdate must run as postgres (current_user %)', current_user;
  end if;

  set constraints public.symptom_entries_require_item, public.symptom_entry_items_require_item immediate;
  set constraints public.symptom_entries_require_item, public.symptom_entry_items_require_item deferred;
  execute format('alter table public.%I disable trigger %I', p_table, v_trigger);
  execute format('update public.%I set created_at = now() - $1 where id = $2', p_table) using p_age, p_id;
  get diagnostics v_rows = row_count;
  execute format('alter table public.%I enable trigger %I', p_table, v_trigger);

  if v_rows <> 1 then
    raise exception 'backdate of %.% touched % row(s), expected 1', p_table, p_id, v_rows;
  end if;
  if (select tg.tgenabled from pg_trigger tg
       where tg.tgrelid = format('public.%I', p_table)::regclass and tg.tgname = v_trigger) is distinct from 'O' then
    raise exception 'freeze trigger % was not re-enabled after backdate', v_trigger;
  end if;
  execute format('select created_at from public.%I where id = $1', p_table) into v_created_at using p_id;
  if v_created_at is distinct from now() - p_age then
    raise exception 'backdate of %.% stored %, expected now() - %', p_table, p_id, v_created_at, p_age;
  end if;
end;
$$;

-- Test data, as postgres. Account A gets a medication with a dosage period and a journal entry with a symptom, as in
-- the plan; account B the same, so a deletion that reaches beyond A shows up in every table.
do $$
declare
  v_today constant date := (now() at time zone 'Europe/Warsaw')::date;
begin
  -- Empty metadata: no acceptance from the signup trigger, so the acceptances below carry ids from the pool.
  perform pg_temp.create_account('00000000-0000-4000-9900-000000000a00', 'deletion-a@example.test', '{}'::jsonb);
  perform pg_temp.create_account('00000000-0000-4000-9900-000000000b00', 'deletion-b@example.test', '{}'::jsonb);

  insert into public.medications (id, user_id, product_name, composition_source)
  values
    ('00000000-0000-4000-9900-000000000a01', '00000000-0000-4000-9900-000000000a00', 'Deletion A', 'leaflet'),
    ('00000000-0000-4000-9900-000000000b01', '00000000-0000-4000-9900-000000000b00', 'Deletion B', 'leaflet');

  insert into public.medication_substances (id, medication_id, substance_name, atc_code)
  values
    ('00000000-0000-4000-9900-000000000a02', '00000000-0000-4000-9900-000000000a01', 'ibuprofenum', 'M01AE01'),
    ('00000000-0000-4000-9900-000000000b02', '00000000-0000-4000-9900-000000000b01', 'paracetamolum', 'N02BE01');

  insert into public.dosage_periods (id, medication_id, dose_text, started_on)
  values
    ('00000000-0000-4000-9900-000000000a03', '00000000-0000-4000-9900-000000000a01', '1 tabletka', v_today - 30),
    ('00000000-0000-4000-9900-000000000b03', '00000000-0000-4000-9900-000000000b01', '1 tabletka', v_today - 30);

  insert into public.symptom_entries (id, user_id, occurred_at, note)
  values
    ('00000000-0000-4000-9900-000000000a04', '00000000-0000-4000-9900-000000000a00', now() - interval '2 hours', 'Note A'),
    ('00000000-0000-4000-9900-000000000b04', '00000000-0000-4000-9900-000000000b00', now() - interval '2 hours', 'Note B');

  insert into public.symptom_entry_items (id, entry_id, symptom_id, severity)
  values
    ('00000000-0000-4000-9900-000000000a05', '00000000-0000-4000-9900-000000000a04',
     (select id from public.symptoms where key = 'nausea'), 'mild'),
    ('00000000-0000-4000-9900-000000000b05', '00000000-0000-4000-9900-000000000b04',
     (select id from public.symptoms where key = 'headache'), null);

  insert into public.terms_acceptances (id, user_id, version)
  values
    ('00000000-0000-4000-9900-000000000a06', '00000000-0000-4000-9900-000000000a00', 1),
    ('00000000-0000-4000-9900-000000000b06', '00000000-0000-4000-9900-000000000b00', 1);
end;
$$;

-- ---------------------------------------------------------------------------
-- DELETION 1: no session -> 28000; anon -> 42501 (no EXECUTE)
-- ---------------------------------------------------------------------------

do $$
declare
  v_a constant uuid := '00000000-0000-4000-9900-000000000a00';
  v_postgres text;
  v_without_sub text;
  v_anon text;
begin
  -- postgres without claims: auth.uid() is empty, and postgres owns the function, so EXECUTE is not what stops it.
  v_postgres := pg_temp.try_delete();

  -- authenticated with a fresh password sign-in but no sub: the session check comes before the amr check.
  perform pg_temp.act_as_authenticated_without_sub();
  v_without_sub := pg_temp.try_delete();
  perform pg_temp.act_as_postgres();

  perform pg_temp.act_as_anon();
  v_anon := pg_temp.try_delete();
  perform pg_temp.act_as_postgres();

  perform pg_temp.assert_code('1', 'postgres without claims', v_postgres, '28000');
  perform pg_temp.assert_code('1', 'authenticated without sub, with a fresh password sign-in', v_without_sub, '28000');
  perform pg_temp.assert_code('1', 'anon', v_anon, '42501');
  perform pg_temp.assert_account_exists('1', 'every call without a session', v_a);
  if (select count(*) from auth.users where id::text like '00000000-0000-4000-9900-%') <> 2 then
    raise exception 'DELETION 1 FAILED: a call without a session deleted a test account';
  end if;

  raise notice 'DELETION 1 OK: without a session the function refuses with 28000 (postgres without claims, authenticated without sub), anon is refused with 42501 before reaching it';
end;
$$;

-- ---------------------------------------------------------------------------
-- DELETION 2: amr without a "password" entry -> AD001
-- ---------------------------------------------------------------------------

do $$
declare
  v_a constant uuid := '00000000-0000-4000-9900-000000000a00';
  v_case record;
  v_cases constant jsonb := jsonb_build_array(
    jsonb_build_object('label', 'an empty amr array', 'amr', '[]'::jsonb),
    jsonb_build_object('label', 'amr that is not an array', 'amr', '"password"'::jsonb),
    jsonb_build_object('label', 'a session from the password reset link (otp)', 'amr', pg_temp.amr('otp', interval '10 seconds')),
    jsonb_build_object('label', 'amr method recovery', 'amr', pg_temp.amr('recovery', interval '10 seconds')),
    jsonb_build_object('label', 'password without a timestamp', 'amr', '[{"method":"password"}]'::jsonb),
    jsonb_build_object('label', 'password with a timestamp as text', 'amr',
      jsonb_build_array(jsonb_build_object('method', 'password', 'timestamp', floor(extract(epoch from now()))::bigint::text))));
  v_results text[] := array[]::text[];
  v_no_amr text;
  v_index integer;
begin
  -- The token has no amr key at all.
  perform pg_temp.act_as(v_a, null);
  v_no_amr := pg_temp.try_delete();
  perform pg_temp.act_as_postgres();
  perform pg_temp.assert_code('2', 'a token without amr', v_no_amr, 'AD001');
  perform pg_temp.assert_account_exists('2', 'a token without amr', v_a);

  for v_case in select value as c, ordinality as n from jsonb_array_elements(v_cases) with ordinality loop
    perform pg_temp.act_as(v_a, v_case.c -> 'amr');
    v_results := v_results || pg_temp.try_delete();
    perform pg_temp.act_as_postgres();
  end loop;

  for v_index in 1 .. jsonb_array_length(v_cases) loop
    perform pg_temp.assert_code('2', v_cases -> (v_index - 1) ->> 'label', v_results[v_index], 'AD001');
  end loop;
  perform pg_temp.assert_account_exists('2', 'every amr without a password sign-in', v_a);

  raise notice 'DELETION 2 OK: no amr, an empty or non-array amr, otp, recovery and password without a numeric timestamp are refused with AD001, the account stays';
end;
$$;

-- ---------------------------------------------------------------------------
-- DELETION 3: "password" older than 60 seconds -> AD001
-- ---------------------------------------------------------------------------

do $$
declare
  v_a constant uuid := '00000000-0000-4000-9900-000000000a00';
  v_old text;
  v_old_next_to_otp text;
begin
  perform pg_temp.act_as(v_a, pg_temp.amr('password', interval '61 seconds'));
  v_old := pg_temp.try_delete();
  perform pg_temp.act_as_postgres();

  -- A fresh entry of another method does not make an old password sign-in fresh.
  perform pg_temp.act_as(v_a, pg_temp.amr('otp', interval '10 seconds') || pg_temp.amr('password', interval '1 hour'));
  v_old_next_to_otp := pg_temp.try_delete();
  perform pg_temp.act_as_postgres();

  perform pg_temp.assert_code('3', 'password sign-in 61 s ago', v_old, 'AD001');
  perform pg_temp.assert_code('3', 'password sign-in 1 h ago next to a fresh otp', v_old_next_to_otp, 'AD001');
  perform pg_temp.assert_account_exists('3', 'an old password sign-in', v_a);

  raise notice 'DELETION 3 OK: a password sign-in older than 60 seconds is refused with AD001, also next to a fresh otp entry, the account stays';
end;
$$;

-- ---------------------------------------------------------------------------
-- DELETION 4: fresh "password" with the correction windows closed deletes every row of A and nothing of B
-- ---------------------------------------------------------------------------

create temporary table deletion_rows (
  table_name name not null,
  owner text not null check (owner in ('A', 'B')),
  id uuid not null,
  primary key (table_name, id)
);

do $$
declare
  v_a constant uuid := '00000000-0000-4000-9900-000000000a00';
  v_b constant uuid := '00000000-0000-4000-9900-000000000b00';
  v_table record;
  v_list text;
  v_got text;
  v_again text;
  v_count integer;
begin
  -- Close the correction windows of A's medication, period and journal entry (3 days old).
  perform pg_temp.backdate('medications', '00000000-0000-4000-9900-000000000a01', interval '3 days');
  perform pg_temp.backdate('dosage_periods', '00000000-0000-4000-9900-000000000a03', interval '3 days');
  perform pg_temp.backdate('symptom_entries', '00000000-0000-4000-9900-000000000a04', interval '3 days');
  if public.medication_correction_window_open('00000000-0000-4000-9900-000000000a01')
     or public.dosage_period_correction_window_open('00000000-0000-4000-9900-000000000a03')
     or public.symptom_entry_correction_window_open('00000000-0000-4000-9900-000000000a04') then
    raise exception 'DELETION 4 FAILED: a correction window of account A is still open 3 days after saving, so the deletion would not be measured with the history guards closed';
  end if;

  -- Counterexample: the history guards are active, so the deletion below passes them as the account cascade.
  v_got := pg_temp.try_exec('delete from public.medications where id = $1', '00000000-0000-4000-9900-000000000a01');
  if v_got not like 'P0001: %okno korekty jest już zamknięte%' then
    raise exception 'DELETION 4 FAILED: deleting A''s medication by hand with the window closed gave "%", expected the correction window guard', v_got;
  end if;
  v_got := pg_temp.try_exec('delete from public.symptom_entries where id = $1', '00000000-0000-4000-9900-000000000a04');
  if v_got not like 'P0001: %okno korekty%jest już zamknięte%' then
    raise exception 'DELETION 4 FAILED: deleting A''s journal entry by hand with the window closed gave "%", expected the correction window guard', v_got;
  end if;

  -- The ids of every row of A and of B in every account table, found by the id pool, not by a user_id column.
  for v_table in select a.table_name from pg_temp.account_data_tables() a order by a.depth, a.table_name loop
    execute format(
      'insert into deletion_rows (table_name, owner, id)
       select %L, case when t.id::text like ''00000000-0000-4000-9900-000000000a%%'' then ''A'' else ''B'' end, t.id
         from public.%I t
        where t.id::text like ''00000000-0000-4000-9900-000000000a%%''
           or t.id::text like ''00000000-0000-4000-9900-000000000b%%''',
      v_table.table_name, v_table.table_name);
  end loop;

  select string_agg(format('%s (%s)', a.table_name, o.owner), ', ' order by a.table_name, o.owner) into v_list
  from pg_temp.account_data_tables() a
  cross join (values ('A'), ('B')) as o(owner)
  where not exists (select 1 from deletion_rows r where r.table_name = a.table_name and r.owner = o.owner);
  if v_list is not null then
    raise exception 'DELETION 4 FAILED: account tables without a test row: %. Insert a row of A and of B with ids from the pool in the test data of account_deletion_checks.sql, otherwise the deletion of that table is not measured', v_list;
  end if;

  perform pg_temp.act_as(v_a, pg_temp.amr('password', interval '59 seconds'));
  v_got := pg_temp.try_delete();
  perform pg_temp.act_as_postgres();

  -- The deferred "at least one symptom" checks would otherwise never run (the file ends with rollback).
  set constraints public.symptom_entries_require_item, public.symptom_entry_items_require_item immediate;
  set constraints public.symptom_entries_require_item, public.symptom_entry_items_require_item deferred;

  perform pg_temp.assert_code('4', 'a password sign-in 59 s ago with the windows closed', v_got, 'ok');

  if exists (select 1 from auth.users where id = v_a) then
    raise exception 'DELETION 4 FAILED: account A is still in auth.users after a successful call';
  end if;
  if not exists (select 1 from auth.users where id = v_b) then
    raise exception 'DELETION 4 FAILED: account B is gone after deleting account A';
  end if;

  for v_table in select distinct r.table_name from deletion_rows r order by r.table_name loop
    execute format(
      'select count(*) from public.%I t join deletion_rows r on r.id = t.id and r.table_name = %L where r.owner = ''A''',
      v_table.table_name, v_table.table_name) into v_count;
    if v_count <> 0 then
      raise exception 'DELETION 4 FAILED: % row(s) of deleted account A left in %', v_count, v_table.table_name;
    end if;
    execute format(
      'select count(*) from deletion_rows r where r.table_name = %L and r.owner = ''B''
         and not exists (select 1 from public.%I t where t.id = r.id)',
      v_table.table_name, v_table.table_name) into v_count;
    if v_count <> 0 then
      raise exception 'DELETION 4 FAILED: % row(s) of account B in % are gone after deleting account A', v_count, v_table.table_name;
    end if;
  end loop;

  -- The deleted account calls again with a still valid token: nothing to delete.
  perform pg_temp.act_as(v_a, pg_temp.amr('password', interval '10 seconds'));
  v_again := pg_temp.try_delete();
  perform pg_temp.act_as_postgres();
  perform pg_temp.assert_code('4', 'a second call by the deleted account', v_again, 'AD002');
  if not exists (select 1 from auth.users where id = v_b) then
    raise exception 'DELETION 4 FAILED: account B is gone after the second call by deleted account A';
  end if;

  raise notice 'DELETION 4 OK: with the correction windows closed (manual deletes refused by the guards), a fresh password sign-in deletes account A and its % row(s) in % account table(s), the % row(s) of account B stay; a second call is AD002',
    (select count(*) from deletion_rows where owner = 'A'),
    (select count(distinct table_name) from deletion_rows),
    (select count(*) from deletion_rows where owner = 'B');
end;
$$;

-- ---------------------------------------------------------------------------
-- DELETION 5: EXECUTE only for authenticated; security definer with an empty search_path
-- ---------------------------------------------------------------------------

do $$
declare
  v_fn constant regprocedure := 'public.delete_own_account()'::regprocedure;
begin
  if has_function_privilege('anon', v_fn, 'EXECUTE') then
    raise exception 'DELETION 5 FAILED: anon can execute public.delete_own_account()';
  end if;
  if not has_function_privilege('authenticated', v_fn, 'EXECUTE') then
    raise exception 'DELETION 5 FAILED: authenticated cannot execute public.delete_own_account(), so the route could not call it';
  end if;
  if not (select p.prosecdef from pg_proc p where p.oid = v_fn) then
    raise exception 'DELETION 5 FAILED: public.delete_own_account() is not security definer, so it could not delete from auth.users';
  end if;
  if not exists (
    select 1 from pg_proc p, unnest(p.proconfig) as cfg(setting)
     where p.oid = v_fn and cfg.setting in ('search_path=""', 'search_path=''''')
  ) then
    raise exception 'DELETION 5 FAILED: public.delete_own_account() does not pin an empty search_path (proconfig %)',
      (select p.proconfig from pg_proc p where p.oid = v_fn);
  end if;

  raise notice 'DELETION 5 OK: anon has no EXECUTE on public.delete_own_account(), authenticated has; it is security definer with an empty search_path';
end;
$$;

-- Completion marker for scripts/db-checks.mjs: printed only after every check above has passed.
do $$
begin
  if current_user <> 'postgres' then
    raise exception 'FINAL CHECK FAILED: file ends as % instead of postgres, a role was not reset', current_user;
  end if;
  raise notice 'GATE_COMPLETE account_deletion_checks';
end;
$$;

rollback;
