-- Account isolation checks: RLS behaviour per operation on every table with account data, for a second account
-- and for anon, plus deletion of the account with the correction window closed.
--   The account tables are not listed here: they are the closure of foreign keys leading to auth.users
--   (pg_temp.account_data_tables(), the same predicate as in schema_invariants_checks.sql). Each of them needs a
--   row in the fixture map (isolation_fixtures); a table in the closure without one fails ISOLATION 0.
--   ISOLATION 0: partition of public tables, fixture map matches the closure, test data and preconditions
--                (correction window open for fresh rows).
--   ISOLATION 1: SELECT.
--   ISOLATION 2: INSERT.
--   ISOLATION 3: UPDATE.
--   ISOLATION 4: UPDATE that re-points a row of account B under account A (user_id / medication_id / entry_id),
--                with the owner counterexample: account A re-points its own row.
--   ISOLATION 5: DELETE.
--   Append-only tables (pg_temp.append_only_tables()) get the owner counterexamples of ISOLATION 3, 4 and 5 reversed:
--   the owner changes, re-points and deletes 0 rows of her own, and the row stays as it was.
--   ISOLATION 6: deleting account A with the correction window closed removes every row of A in every account
--                table and leaves account B untouched.
--
-- How to run: `npm run db:check` (needs `npx supabase start`). The runner (scripts/db-checks.mjs) pipes this
-- file into psql inside the local database container, forces ON_ERROR_STOP and passes the file only when it
-- prints `GATE_COMPLETE account_isolation_checks` at the end. The same runner runs in CI in the `smoke` job,
-- also behind the probe scripts/db-checks/probes/account-table-without-fixture.sql, which must fail ISOLATION 0.
--
-- Rules every block follows:
--   - The role is switched OUTSIDE any `begin ... exception ... end` subblock. `set local role` executed inside
--     a subblock is undone together with the subtransaction when the subblock catches an error, and the next
--     steps would run as postgres and pass without measuring RLS. Each block starts by asserting current_user
--     and auth.uid(), and goes back with `execute 'reset role'` after each case.
--   - The fixture map is a temporary table owned by postgres; authenticated and anon cannot read it (measured:
--     42501 permission denied). Each block reads it into an array as postgres before the loop that switches roles.
--   - "No error" is never proof of a block. Blocked INSERT and re-pointing UPDATE must fail with SQLSTATE 42501
--     and a message about row-level security or a denied permission; any other error stops the file.
--     Blocked UPDATE and DELETE on someone else's row give no error and zero rows (measured), so each one is
--     followed by a check as postgres that the row of account A is unchanged / still exists, and each has an
--     owner counterexample that must touch exactly one row.
--
-- Everything runs in one transaction ended with rollback: no test rows are left behind.

\set ON_ERROR_STOP on

begin;

-- ---------------------------------------------------------------------------
-- Account data tables: closure of foreign keys leading to auth.users.
-- Copied from schema_invariants_checks.sql, and copied again in account_deletion_checks.sql; keep all three copies
-- identical, because a table that drops out of this copy would drop out of the behaviour checks below. ISOLATION 0 also applies the partition rule of that file, so a
-- table missing from this copy fails here too instead of being skipped.
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

-- Shared, read-only tables shipped with the product. Copied from schema_invariants_checks.sql; keep both lists
-- identical. A table with account data belongs in the closure (foreign key to auth.users or to an account table).
create function pg_temp.shared_tables()
returns table (table_name name)
language sql
immutable
as $$
  select unnest(array[
    'registry_products',
    'registry_substances',
    'interaction_pairs',
    'symptoms',
    'symptom_search_terms',
    'terms_versions'
  ]::name[])
$$;

-- Append-only account tables: history does not lie, so not even the owner may change, re-point or delete a row; it
-- disappears only with the account (ISOLATION 6). For these tables the owner counterexamples of ISOLATION 3, 4 and 5
-- are reversed: 0 rows touched, no error, the row unchanged. A table goes here only by a deliberate decision, with its
-- reason; every other account table must still pass the owner counterexamples.
--   - terms_acceptances (S-01): the date and version of accepting the terms of use are a fact in the account history.
create function pg_temp.append_only_tables()
returns table (table_name name)
language sql
immutable
as $$
  select unnest(array[
    'terms_acceptances'
  ]::name[])
$$;

-- ---------------------------------------------------------------------------
-- Fixture map: one row per account table. This is the only place that names account tables (apart from comments
-- and the ISOLATION 6 counterexample on the root table). A new account table needs a row here and its test rows in
-- ISOLATION 0; without them ISOLATION 0 fails and names the table.
-- UUID pool 00000000-0000-4000-9000-*, distinct from rls_checks.sql.
--   account A: 0a00; medication 0a01, substance 0a02, period 0a03
--              extra rows for the owner DELETE counterexample: medication 0a11 (no children),
--              substance 0a12 and period 0a13 under medication 0a01
--              journal entry 0a04 with symptoms 0a05 and 0a15 (extra row for the owner DELETE counterexample);
--              extra journal entry 0a14 with symptom 0a25 (target of the owner re-pointing in ISOLATION 4)
--              terms acceptances 0a06 (version 1) and 0a16 (version 2)
--   account B: 0b00; medication 0b01, substance 0b02, period 0b03; journal entry 0b04 with symptom 0b05;
--              terms acceptance 0b06 (version 1)
--   row inserted by account A in ISOLATION 2 (every table): c002
-- Columns:
--   a_row, a_extra_row, b_row  rows of A, the extra row of A deleted by its owner in ISOLATION 5, row of B
--   update_column, update_original, update_value
--                              column changed in ISOLATION 3, its value in a_row as inserted in ISOLATION 0, and the
--                              value the owner writes (it must pass the column's own checks, e.g. a severity)
--   insert_statement           INSERT of a row belonging to account A, with the row id as $1 (ISOLATION 2)
--   repoint_column             ownership column (user_id, or the foreign key to the parent) re-pointed in ISOLATION 4
--   repoint_a_target           value putting a row under account A (target of B's attempt)
--   repoint_b_original         value of that column in b_row
--   repoint_owner_target       another value under account A, target of A re-pointing its own a_row. For the root
--                              table (medications.user_id) the only value under A is A itself, so the owner case
--                              writes the same value and proves only that `with check` lets the owner through, not
--                              that B is stopped by RLS rather than by something blocking every change of the column.
--                              For the root that proof comes from ISOLATION 3: the owner's UPDATE of product_name
--                              succeeds where B's fails.
-- ---------------------------------------------------------------------------

create temporary table isolation_fixtures (
  table_name name primary key,
  a_row uuid not null,
  a_extra_row uuid not null,
  b_row uuid not null,
  update_column name not null,
  update_original text not null,
  update_value text not null,
  insert_statement text not null,
  repoint_column name not null,
  repoint_a_target uuid not null,
  repoint_b_original uuid not null,
  repoint_owner_target uuid not null
);

insert into isolation_fixtures values
  ('medications',
   '00000000-0000-4000-9000-000000000a01', '00000000-0000-4000-9000-000000000a11', '00000000-0000-4000-9000-000000000b01',
   'product_name', 'Isolation A', 'changed by owner',
   'insert into public.medications (id, user_id, product_name, composition_source) values ($1, ''00000000-0000-4000-9000-000000000a00'', ''inserted'', ''leaflet'')',
   'user_id', '00000000-0000-4000-9000-000000000a00', '00000000-0000-4000-9000-000000000b00',
   '00000000-0000-4000-9000-000000000a00'),
  ('medication_substances',
   '00000000-0000-4000-9000-000000000a02', '00000000-0000-4000-9000-000000000a12', '00000000-0000-4000-9000-000000000b02',
   'substance_name', 'Substance A', 'changed by owner',
   'insert into public.medication_substances (id, medication_id, substance_name, atc_code) values ($1, ''00000000-0000-4000-9000-000000000a01'', ''inserted'', ''B01AC06'')',
   'medication_id', '00000000-0000-4000-9000-000000000a01', '00000000-0000-4000-9000-000000000b01',
   '00000000-0000-4000-9000-000000000a11'),
  ('dosage_periods',
   '00000000-0000-4000-9000-000000000a03', '00000000-0000-4000-9000-000000000a13', '00000000-0000-4000-9000-000000000b03',
   'dose_text', 'dose A', 'changed by owner',
   'insert into public.dosage_periods (id, medication_id, dose_text, started_on, ended_on) values ($1, ''00000000-0000-4000-9000-000000000a01'', ''inserted'', date ''2023-01-01'', date ''2023-02-01'')',
   'medication_id', '00000000-0000-4000-9000-000000000a01', '00000000-0000-4000-9000-000000000b01',
   '00000000-0000-4000-9000-000000000a11');

-- Journal (S-05). The symptom ids come from the seeded closed list, so the INSERT of ISOLATION 2 is composed here,
-- as postgres. Each row of the fixture uses a different symptom: re-pointing B's symptom into A's entry could only be
-- stopped by RLS, never by the unique key (entry_id, symptom_id).
insert into isolation_fixtures
select 'symptom_entries'::name,
       '00000000-0000-4000-9000-000000000a04'::uuid, '00000000-0000-4000-9000-000000000a14'::uuid, '00000000-0000-4000-9000-000000000b04'::uuid,
       'note'::name, 'Note A', 'changed by owner',
       'insert into public.symptom_entries (id, user_id, occurred_at) values ($1, ''00000000-0000-4000-9000-000000000a00'', now() - interval ''1 hour'')',
       'user_id'::name, '00000000-0000-4000-9000-000000000a00'::uuid, '00000000-0000-4000-9000-000000000b00'::uuid,
       '00000000-0000-4000-9000-000000000a00'::uuid
union all
select 'symptom_entry_items',
       '00000000-0000-4000-9000-000000000a05', '00000000-0000-4000-9000-000000000a15', '00000000-0000-4000-9000-000000000b05',
       'severity', 'mild', 'severe',
       format('insert into public.symptom_entry_items (id, entry_id, symptom_id) values ($1, ''00000000-0000-4000-9000-000000000a04'', %L)',
              (select id from public.symptoms where key = 'dizziness')),
       'entry_id', '00000000-0000-4000-9000-000000000a04', '00000000-0000-4000-9000-000000000b04',
       '00000000-0000-4000-9000-000000000a14';

-- Terms acceptances (S-01), append-only. unique (user_id, version) allows one row per version, and account A has three
-- (a_row, a_extra_row and c002 from ISOLATION 2), so ISOLATION 0 adds test versions 2 and 3 to terms_versions and each
-- row of A gets its own version. The table has no text column: ISOLATION 3 changes accepted_at, whose value as
-- inserted is now() of this transaction (set by the database).
insert into isolation_fixtures values
  ('terms_acceptances',
   '00000000-0000-4000-9000-000000000a06', '00000000-0000-4000-9000-000000000a16', '00000000-0000-4000-9000-000000000b06',
   'accepted_at', now()::text, '2000-01-01 00:00:00+00',
   'insert into public.terms_acceptances (id, user_id, version) values ($1, ''00000000-0000-4000-9000-000000000a00'', 3)',
   'user_id', '00000000-0000-4000-9000-000000000a00', '00000000-0000-4000-9000-000000000b00',
   '00000000-0000-4000-9000-000000000a00');

-- ---------------------------------------------------------------------------
-- ISOLATION 0: partition, fixture map, test data (as postgres) and preconditions
-- ---------------------------------------------------------------------------

do $$
declare
  v_list text;
  v_count integer;
  v_fixture isolation_fixtures;
  v_row record;
begin
  -- Partition rule of schema_invariants_checks.sql (INVARIANT 1), repeated so that a table missing from this copy
  -- of the closure predicate cannot silently skip the behaviour checks.
  select count(*) into v_count from pg_temp.account_data_tables();
  if v_count = 0 then
    raise exception 'ISOLATION 0 FAILED: no public table is reachable by foreign keys from auth.users; the closure predicate is broken and every block would pass on an empty set';
  end if;

  select string_agg(s.table_name, ', ' order by s.table_name) into v_list
  from pg_temp.shared_tables() s
  where not exists (
    select 1 from pg_class t
    where t.relnamespace = 'public'::regnamespace and t.relkind in ('r', 'p') and t.relname = s.table_name
  );
  if v_list is not null then
    raise exception 'ISOLATION 0 FAILED: shared list names tables that do not exist in public: %', v_list;
  end if;

  select string_agg(a.table_name, ', ' order by a.table_name) into v_list
  from pg_temp.account_data_tables() a
  join pg_temp.shared_tables() s on s.table_name = a.table_name;
  if v_list is not null then
    raise exception 'ISOLATION 0 FAILED: tables are both on the shared list and reachable by foreign keys from auth.users: %', v_list;
  end if;

  select string_agg(t.relname, ', ' order by t.relname) into v_list
  from pg_class t
  where t.relnamespace = 'public'::regnamespace
    and t.relkind in ('r', 'p')
    and t.relname not in (select a.table_name from pg_temp.account_data_tables() a)
    and t.relname not in (select s.table_name from pg_temp.shared_tables() s);
  if v_list is not null then
    raise exception 'ISOLATION 0 FAILED: tables are neither account data nor shared: %. A table with account data needs a foreign key to auth.users or to an account table (on delete cascade); a shared read-only table must be added deliberately to the shared list here and in schema_invariants_checks.sql', v_list;
  end if;

  select string_agg(o.table_name, ', ' order by o.table_name) into v_list
  from pg_temp.append_only_tables() o
  where not exists (select 1 from pg_temp.account_data_tables() a where a.table_name = o.table_name);
  if v_list is not null then
    raise exception 'ISOLATION 0 FAILED: append-only list names tables outside the foreign key closure of auth.users: %', v_list;
  end if;

  -- The fixture map covers exactly the closure.
  select string_agg(a.table_name, ', ' order by a.table_name) into v_list
  from pg_temp.account_data_tables() a
  where not exists (select 1 from isolation_fixtures f where f.table_name = a.table_name);
  if v_list is not null then
    raise exception 'ISOLATION 0 FAILED: % has no test data — add a row to the fixture map (isolation_fixtures) and insert its rows of accounts A and B in ISOLATION 0 of account_isolation_checks.sql', v_list;
  end if;

  select string_agg(f.table_name, ', ' order by f.table_name) into v_list
  from isolation_fixtures f
  where not exists (select 1 from pg_temp.account_data_tables() a where a.table_name = f.table_name);
  if v_list is not null then
    raise exception 'ISOLATION 0 FAILED: fixture map has rows for tables outside the foreign key closure of auth.users: %', v_list;
  end if;

  -- Test data. Every account table needs its rows of A (a_row, a_extra_row) and of B (b_row) here.
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, created_at, updated_at)
  values
    ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-9000-000000000a00',
     'authenticated', 'authenticated', 'isolation-a@example.test', 'x', now(), now()),
    ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-9000-000000000b00',
     'authenticated', 'authenticated', 'isolation-b@example.test', 'x', now(), now());

  insert into public.medications (id, user_id, product_name, composition_source)
  values
    ('00000000-0000-4000-9000-000000000a01', '00000000-0000-4000-9000-000000000a00', 'Isolation A', 'leaflet'),
    ('00000000-0000-4000-9000-000000000a11', '00000000-0000-4000-9000-000000000a00', 'Isolation A to delete', 'leaflet'),
    ('00000000-0000-4000-9000-000000000b01', '00000000-0000-4000-9000-000000000b00', 'Isolation B', 'leaflet');

  -- Distinct ATC codes and non-overlapping periods, so that re-pointing B's rows under A's medication
  -- could only be stopped by RLS, never by the unique or exclusion constraint.
  insert into public.medication_substances (id, medication_id, substance_name, atc_code)
  values
    ('00000000-0000-4000-9000-000000000a02', '00000000-0000-4000-9000-000000000a01', 'Substance A', 'A01AB02'),
    ('00000000-0000-4000-9000-000000000a12', '00000000-0000-4000-9000-000000000a01', 'Substance A to delete', 'N02BE01'),
    ('00000000-0000-4000-9000-000000000b02', '00000000-0000-4000-9000-000000000b01', 'Substance B', 'C10AA01');

  insert into public.dosage_periods (id, medication_id, dose_text, started_on, ended_on)
  values
    ('00000000-0000-4000-9000-000000000a03', '00000000-0000-4000-9000-000000000a01', 'dose A', date '2026-01-01', null),
    ('00000000-0000-4000-9000-000000000a13', '00000000-0000-4000-9000-000000000a01', 'dose A to delete', date '2025-01-01', date '2025-02-01'),
    ('00000000-0000-4000-9000-000000000b03', '00000000-0000-4000-9000-000000000b01', 'dose B', date '2024-01-01', date '2024-06-01');

  -- Journal entries with their symptoms. An entry needs a symptom only at commit, and this file ends with rollback.
  insert into public.symptom_entries (id, user_id, occurred_at, note)
  values
    ('00000000-0000-4000-9000-000000000a04', '00000000-0000-4000-9000-000000000a00', now() - interval '2 hours', 'Note A'),
    ('00000000-0000-4000-9000-000000000a14', '00000000-0000-4000-9000-000000000a00', now() - interval '3 hours', 'Note A to delete'),
    ('00000000-0000-4000-9000-000000000b04', '00000000-0000-4000-9000-000000000b00', now() - interval '4 hours', 'Note B');

  insert into public.symptom_entry_items (id, entry_id, symptom_id, severity)
  values
    ('00000000-0000-4000-9000-000000000a05', '00000000-0000-4000-9000-000000000a04', (select id from public.symptoms where key = 'nausea'), 'mild'),
    ('00000000-0000-4000-9000-000000000a15', '00000000-0000-4000-9000-000000000a04', (select id from public.symptoms where key = 'headache'), null),
    ('00000000-0000-4000-9000-000000000a25', '00000000-0000-4000-9000-000000000a14', (select id from public.symptoms where key = 'fatigue'), null),
    ('00000000-0000-4000-9000-000000000b05', '00000000-0000-4000-9000-000000000b04', (select id from public.symptoms where key = 'vomiting'), 'moderate');

  -- Terms acceptances. Test versions 2 and 3 exist only in this transaction (rollback at the end).
  insert into public.terms_versions (version) values (2), (3);
  insert into public.terms_acceptances (id, user_id, version)
  values
    ('00000000-0000-4000-9000-000000000a06', '00000000-0000-4000-9000-000000000a00', 1),
    ('00000000-0000-4000-9000-000000000a16', '00000000-0000-4000-9000-000000000a00', 2),
    ('00000000-0000-4000-9000-000000000b06', '00000000-0000-4000-9000-000000000b00', 1);

  -- Every row named in the fixture map exists in its table.
  for v_fixture in select * from isolation_fixtures order by table_name loop
    for v_row in
      select * from (values ('a_row', v_fixture.a_row), ('a_extra_row', v_fixture.a_extra_row), ('b_row', v_fixture.b_row)) as r(label, id)
    loop
      execute format('select count(*) from public.%I where id = $1', v_fixture.table_name) into v_count using v_row.id;
      if v_count <> 1 then
        raise exception 'ISOLATION 0 FAILED: fixture map row for % names % %, but public.% has no such row; insert it in ISOLATION 0',
          v_fixture.table_name, v_row.label, v_row.id, v_fixture.table_name;
      end if;
    end loop;
  end loop;

  -- The owner counterexamples change and delete core fields. They only prove anything while the history
  -- guards let them through, i.e. while the correction window of fresh rows is open.
  if not public.medication_correction_window_open('00000000-0000-4000-9000-000000000a01')
     or not public.medication_correction_window_open('00000000-0000-4000-9000-000000000a11')
     or not public.medication_correction_window_open('00000000-0000-4000-9000-000000000b01') then
    raise exception 'ISOLATION 0 FAILED: correction window is closed for freshly created test medications';
  end if;
  if not public.symptom_entry_correction_window_open('00000000-0000-4000-9000-000000000a04')
     or not public.symptom_entry_correction_window_open('00000000-0000-4000-9000-000000000a14')
     or not public.symptom_entry_correction_window_open('00000000-0000-4000-9000-000000000b04') then
    raise exception 'ISOLATION 0 FAILED: correction window is closed for freshly created test journal entries';
  end if;

  raise notice 'ISOLATION 0 OK: % account table(s) from the foreign key closure, each with a fixture row and test rows of accounts A and B; every public table classified; correction window open',
    (select count(*) from pg_temp.account_data_tables());
end;
$$;

-- ---------------------------------------------------------------------------
-- ISOLATION 1: SELECT — B and anon see 0 rows of A; A sees its own; B sees its own
-- ---------------------------------------------------------------------------

do $$
declare
  v_a constant uuid := '00000000-0000-4000-9000-000000000a00';
  v_b constant uuid := '00000000-0000-4000-9000-000000000b00';
  v_cases isolation_fixtures[];
  v_case isolation_fixtures;
  v_count integer;
begin
  -- Read as postgres before any role switch (see the header).
  select array_agg(f order by a.depth, f.table_name) into v_cases
  from isolation_fixtures f join pg_temp.account_data_tables() a on a.table_name = f.table_name;

  foreach v_case in array v_cases loop
    -- account B
    perform set_config('request.jwt.claims', json_build_object('sub', v_b, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    if current_user <> 'authenticated' or auth.uid() is distinct from v_b then
      raise exception 'ISOLATION 1 FAILED: switch to account B did not take effect (current_user %, auth.uid %)', current_user, auth.uid();
    end if;

    execute format('select count(*) from public.%I where id = $1', v_case.table_name) into v_count using v_case.a_row;
    if v_count <> 0 then
      raise exception 'ISOLATION 1 FAILED: account B sees % row(s) of account A in %', v_count, v_case.table_name;
    end if;
    -- Positive control: the same session does read rows, only not A's.
    execute format('select count(*) from public.%I where id = $1', v_case.table_name) into v_count using v_case.b_row;
    if v_count <> 1 then
      raise exception 'ISOLATION 1 FAILED: account B does not see its own row in % (count %)', v_case.table_name, v_count;
    end if;
    execute 'reset role';

    -- anon
    perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
    execute 'set local role anon';
    if current_user <> 'anon' or auth.uid() is not null then
      raise exception 'ISOLATION 1 FAILED: switch to anon did not take effect (current_user %, auth.uid %)', current_user, auth.uid();
    end if;

    execute format('select count(*) from public.%I', v_case.table_name) into v_count;
    if v_count <> 0 then
      raise exception 'ISOLATION 1 FAILED: anon sees % row(s) in %', v_count, v_case.table_name;
    end if;
    execute 'reset role';

    -- owner counterexample: account A
    perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    if current_user <> 'authenticated' or auth.uid() is distinct from v_a then
      raise exception 'ISOLATION 1 FAILED: switch to account A did not take effect (current_user %, auth.uid %)', current_user, auth.uid();
    end if;

    execute format('select count(*) from public.%I where id = $1', v_case.table_name) into v_count using v_case.a_row;
    if v_count <> 1 then
      raise exception 'ISOLATION 1 FAILED: account A does not see its own row in % (count %)', v_case.table_name, v_count;
    end if;
    execute format('select count(*) from public.%I where id = $1', v_case.table_name) into v_count using v_case.b_row;
    if v_count <> 0 then
      raise exception 'ISOLATION 1 FAILED: account A sees % row(s) of account B in %', v_count, v_case.table_name;
    end if;
    execute 'reset role';
  end loop;

  raise notice 'ISOLATION 1 OK: SELECT — B and anon see no rows of A in any of the % account tables; A and B see their own', cardinality(v_cases);
end;
$$;

-- ---------------------------------------------------------------------------
-- ISOLATION 2: INSERT — B under A's account/medication -> 42501; anon -> 42501; A under its own -> passes
-- ---------------------------------------------------------------------------

do $$
declare
  v_a constant uuid := '00000000-0000-4000-9000-000000000a00';
  v_b constant uuid := '00000000-0000-4000-9000-000000000b00';
  -- Id of the row inserted by account A in every table; ISOLATION 6 checks that it goes with the account.
  v_inserted constant uuid := '00000000-0000-4000-9000-00000000c002';
  v_cases isolation_fixtures[];
  v_case isolation_fixtures;
  v_actor record;
  v_state text;
  v_message text;
  v_count integer;
begin
  -- Read as postgres before any role switch (see the header). Each insert_statement writes a row belonging to
  -- account A (user_id A or a medication of A).
  select array_agg(f order by a.depth, f.table_name) into v_cases
  from isolation_fixtures f join pg_temp.account_data_tables() a on a.table_name = f.table_name;

  foreach v_case in array v_cases loop
    for v_actor in
      select * from (values ('account B', 'authenticated', v_b), ('anon', 'anon', null::uuid)) as a(label, role_name, uid)
    loop
      if v_actor.uid is null then
        perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
      else
        perform set_config('request.jwt.claims', json_build_object('sub', v_actor.uid, 'role', 'authenticated')::text, true);
      end if;
      execute format('set local role %I', v_actor.role_name);
      if current_user <> v_actor.role_name or auth.uid() is distinct from v_actor.uid then
        raise exception 'ISOLATION 2 FAILED: switch to % did not take effect (current_user %, auth.uid %)', v_actor.label, current_user, auth.uid();
      end if;

      v_state := 'no error';
      v_message := null;
      begin
        execute v_case.insert_statement using v_inserted;
      exception when sqlstate '42501' then
        v_state := '42501';
        get stacked diagnostics v_message = message_text;
      end;
      execute 'reset role';

      if v_state <> '42501' then
        raise exception 'ISOLATION 2 FAILED: % inserted a row of account A into % without an error', v_actor.label, v_case.table_name;
      end if;
      if v_message not like '%row-level security%' and v_message not like '%permission denied%' then
        raise exception 'ISOLATION 2 FAILED: % insert into % blocked by 42501 with an unexpected message (got %)', v_actor.label, v_case.table_name, v_message;
      end if;
    end loop;

    -- owner counterexample: account A inserts the same row
    perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    if current_user <> 'authenticated' or auth.uid() is distinct from v_a then
      raise exception 'ISOLATION 2 FAILED: switch to account A did not take effect (current_user %, auth.uid %)', current_user, auth.uid();
    end if;
    execute v_case.insert_statement using v_inserted;
    get diagnostics v_count = row_count;
    execute 'reset role';

    if v_count <> 1 then
      raise exception 'ISOLATION 2 FAILED: account A insert into its own % touched % row(s), expected 1', v_case.table_name, v_count;
    end if;
    execute format('select count(*) from public.%I where id = $1', v_case.table_name) into v_count using v_inserted;
    if v_count <> 1 then
      raise exception 'ISOLATION 2 FAILED: row inserted by account A into % is missing', v_case.table_name;
    end if;
  end loop;

  raise notice 'ISOLATION 2 OK: INSERT — B under A and anon rejected with 42501 in all % account tables; A inserts under its own', cardinality(v_cases);
end;
$$;

-- ---------------------------------------------------------------------------
-- ISOLATION 3: UPDATE — B and anon on A's row -> 0 rows and the row is unchanged; A on its own -> 1 row
-- ---------------------------------------------------------------------------

do $$
declare
  v_a constant uuid := '00000000-0000-4000-9000-000000000a00';
  v_b constant uuid := '00000000-0000-4000-9000-000000000b00';
  v_cases isolation_fixtures[];
  v_case isolation_fixtures;
  v_actor record;
  v_count integer;
  v_value text;
  v_type text;
  v_append_only boolean;
begin
  -- Read as postgres before any role switch (see the header).
  select array_agg(f order by a.depth, f.table_name) into v_cases
  from isolation_fixtures f join pg_temp.account_data_tables() a on a.table_name = f.table_name;

  foreach v_case in array v_cases loop
    -- The new value is passed as text and cast to the column type, so a table without a text column can be measured.
    -- Append-only tables get update_value from every actor: 'changed by ...' would not cast to a non-text type.
    select format_type(att.atttypid, att.atttypmod) into v_type
    from pg_attribute att
    where att.attrelid = format('public.%I', v_case.table_name)::regclass and att.attname = v_case.update_column;
    v_append_only := v_case.table_name in (select o.table_name from pg_temp.append_only_tables() o);

    for v_actor in
      select * from (values ('account B', 'authenticated', v_b), ('anon', 'anon', null::uuid)) as a(label, role_name, uid)
    loop
      if v_actor.uid is null then
        perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
      else
        perform set_config('request.jwt.claims', json_build_object('sub', v_actor.uid, 'role', 'authenticated')::text, true);
      end if;
      execute format('set local role %I', v_actor.role_name);
      if current_user <> v_actor.role_name or auth.uid() is distinct from v_actor.uid then
        raise exception 'ISOLATION 3 FAILED: switch to % did not take effect (current_user %, auth.uid %)', v_actor.label, current_user, auth.uid();
      end if;

      execute format('update public.%I set %I = $1::%s where id = $2', v_case.table_name, v_case.update_column, v_type)
        using case when v_append_only then v_case.update_value else 'changed by ' || v_actor.label end, v_case.a_row;
      get diagnostics v_count = row_count;
      execute 'reset role';

      if v_count <> 0 then
        raise exception 'ISOLATION 3 FAILED: % updated % row(s) of account A in %', v_actor.label, v_count, v_case.table_name;
      end if;
      execute format('select %I::text from public.%I where id = $1', v_case.update_column, v_case.table_name) into v_value using v_case.a_row;
      if v_value is distinct from v_case.update_original then
        raise exception 'ISOLATION 3 FAILED: row of account A in % changed after update by % (now %)', v_case.table_name, v_actor.label, v_value;
      end if;
    end loop;

    -- owner counterexample: account A updates the same row
    perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    if current_user <> 'authenticated' or auth.uid() is distinct from v_a then
      raise exception 'ISOLATION 3 FAILED: switch to account A did not take effect (current_user %, auth.uid %)', current_user, auth.uid();
    end if;
    execute format('update public.%I set %I = $1::%s where id = $2', v_case.table_name, v_case.update_column, v_type)
      using v_case.update_value, v_case.a_row;
    get diagnostics v_count = row_count;
    execute 'reset role';

    -- Append-only: the owner changes nothing either. RLS gives no error and zero rows (measured).
    if v_append_only then
      if v_count <> 0 then
        raise exception 'ISOLATION 3 FAILED: account A updated % row(s) of its own in append-only %, expected 0', v_count, v_case.table_name;
      end if;
      execute format('select %I::text from public.%I where id = $1', v_case.update_column, v_case.table_name) into v_value using v_case.a_row;
      if v_value is distinct from v_case.update_original then
        raise exception 'ISOLATION 3 FAILED: row of account A in append-only % changed after update by its owner (now %)', v_case.table_name, v_value;
      end if;
      continue;
    end if;

    if v_count <> 1 then
      raise exception 'ISOLATION 3 FAILED: account A update of its own row in % touched % row(s), expected 1', v_case.table_name, v_count;
    end if;
    execute format('select %I::text from public.%I where id = $1', v_case.update_column, v_case.table_name) into v_value using v_case.a_row;
    if v_value is distinct from v_case.update_value then
      raise exception 'ISOLATION 3 FAILED: owner update in % did not persist (now %)', v_case.table_name, v_value;
    end if;
  end loop;

  raise notice 'ISOLATION 3 OK: UPDATE — B and anon touch 0 rows of A and leave them unchanged in all % account tables; A updates its own, except in append-only tables (0 rows, unchanged)', cardinality(v_cases);
end;
$$;

-- ---------------------------------------------------------------------------
-- ISOLATION 4: UPDATE re-pointing B's row under A (user_id / medication_id is part of the core) -> 42501;
-- owner counterexample: A re-points its own row to another target under A -> 1 row
-- ---------------------------------------------------------------------------

do $$
declare
  v_a constant uuid := '00000000-0000-4000-9000-000000000a00';
  v_b constant uuid := '00000000-0000-4000-9000-000000000b00';
  v_cases isolation_fixtures[];
  v_case isolation_fixtures;
  v_state text;
  v_message text;
  v_owner uuid;
  v_original uuid;
  v_count integer;
  v_append_only boolean;
begin
  -- Read as postgres before any role switch (see the header).
  select array_agg(f order by a.depth, f.table_name) into v_cases
  from isolation_fixtures f join pg_temp.account_data_tables() a on a.table_name = f.table_name;

  foreach v_case in array v_cases loop
    v_append_only := v_case.table_name in (select o.table_name from pg_temp.append_only_tables() o);

    perform set_config('request.jwt.claims', json_build_object('sub', v_b, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    if current_user <> 'authenticated' or auth.uid() is distinct from v_b then
      raise exception 'ISOLATION 4 FAILED: switch to account B did not take effect (current_user %, auth.uid %)', current_user, auth.uid();
    end if;

    v_state := 'no error';
    v_message := null;
    begin
      execute format('update public.%I set %I = $1 where id = $2', v_case.table_name, v_case.repoint_column)
        using v_case.repoint_a_target, v_case.b_row;
      get diagnostics v_count = row_count;
    exception when sqlstate '42501' then
      v_state := '42501';
      get stacked diagnostics v_message = message_text;
    end;
    execute 'reset role';

    -- Append-only: `using (false)` hides every row from UPDATE, so RLS gives no error and zero rows instead of 42501.
    -- Any error, 42501 included, means the update reached a policy that lets rows through, and fails the step.
    if v_append_only then
      if v_state <> 'no error' or v_count <> 0 then
        raise exception 'ISOLATION 4 FAILED: account B re-pointing its row in append-only % under account A gave % and % row(s), expected no error and 0 rows', v_case.table_name, v_state, v_count;
      end if;
    elsif v_state <> '42501' then
      raise exception 'ISOLATION 4 FAILED: account B re-pointed its row in % under account A without an error', v_case.table_name;
    elsif v_message not like '%row-level security%' and v_message not like '%permission denied%' then
      raise exception 'ISOLATION 4 FAILED: re-pointing in % blocked by 42501 with an unexpected message (got %)', v_case.table_name, v_message;
    end if;
    execute format('select %I from public.%I where id = $1', v_case.repoint_column, v_case.table_name) into v_owner using v_case.b_row;
    if v_owner is distinct from v_case.repoint_b_original then
      raise exception 'ISOLATION 4 FAILED: row of account B in % is no longer under B (now %)', v_case.table_name, v_owner;
    end if;

    -- Owner counterexample: account A re-points its own row to another target under A (children: the second
    -- medication or journal entry of A, with the correction window open; root tables: user_id A). It must touch exactly one row, so
    -- the block above comes from RLS and not from something that rejects every change of this column.
    execute format('select %I from public.%I where id = $1', v_case.repoint_column, v_case.table_name) into v_original using v_case.a_row;

    perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    if current_user <> 'authenticated' or auth.uid() is distinct from v_a then
      raise exception 'ISOLATION 4 FAILED: switch to account A did not take effect (current_user %, auth.uid %)', current_user, auth.uid();
    end if;
    execute format('update public.%I set %I = $1 where id = $2', v_case.table_name, v_case.repoint_column)
      using v_case.repoint_owner_target, v_case.a_row;
    get diagnostics v_count = row_count;
    execute 'reset role';

    -- Append-only: the owner re-points nothing either, and there is nothing to restore (the guard would refuse every
    -- UPDATE as postgres, even one writing the same value).
    if v_append_only then
      if v_count <> 0 then
        raise exception 'ISOLATION 4 FAILED: account A re-pointed % row(s) of its own in append-only %, expected 0', v_count, v_case.table_name;
      end if;
      execute format('select %I from public.%I where id = $1', v_case.repoint_column, v_case.table_name) into v_owner using v_case.a_row;
      if v_owner is distinct from v_original then
        raise exception 'ISOLATION 4 FAILED: row of account A in append-only % was re-pointed by its owner (now %)', v_case.table_name, v_owner;
      end if;
      continue;
    end if;

    if v_count <> 1 then
      raise exception 'ISOLATION 4 FAILED: account A re-pointing its own row in % touched % row(s), expected 1', v_case.table_name, v_count;
    end if;
    execute format('select %I from public.%I where id = $1', v_case.repoint_column, v_case.table_name) into v_owner using v_case.a_row;
    if v_owner is distinct from v_case.repoint_owner_target then
      raise exception 'ISOLATION 4 FAILED: owner re-pointing in % did not persist (now %)', v_case.table_name, v_owner;
    end if;

    -- Back to the ISOLATION 0 state (as postgres), so that ISOLATION 5 and 6 find the rows where they were.
    execute format('update public.%I set %I = $1 where id = $2', v_case.table_name, v_case.repoint_column)
      using v_original, v_case.a_row;
    get diagnostics v_count = row_count;
    if v_count <> 1 then
      raise exception 'ISOLATION 4 FAILED: restoring the re-pointed row of account A in % touched % row(s), expected 1', v_case.table_name, v_count;
    end if;
  end loop;

  raise notice 'ISOLATION 4 OK: re-pointing B''s rows under A rejected with 42501 in all % account tables (append-only: 0 rows, no error); A re-points its own rows, except in append-only tables (0 rows)', cardinality(v_cases);
end;
$$;

-- ---------------------------------------------------------------------------
-- ISOLATION 5: DELETE — B and anon on A's row -> 0 rows and the row exists; A on its own extra row -> 1 row
-- ---------------------------------------------------------------------------

do $$
declare
  v_a constant uuid := '00000000-0000-4000-9000-000000000a00';
  v_b constant uuid := '00000000-0000-4000-9000-000000000b00';
  v_cases isolation_fixtures[];
  v_case isolation_fixtures;
  v_actor record;
  v_count integer;
begin
  -- Read as postgres before any role switch (see the header). Child tables before their parents: deepest first in
  -- the closure, ties broken by name so the order is deterministic. The extra rows of child tables hang under a
  -- row that is never deleted here, so each owner delete removes exactly its own row.
  select array_agg(f order by a.depth desc, f.table_name) into v_cases
  from isolation_fixtures f join pg_temp.account_data_tables() a on a.table_name = f.table_name;

  foreach v_case in array v_cases loop
    for v_actor in
      select * from (values ('account B', 'authenticated', v_b), ('anon', 'anon', null::uuid)) as a(label, role_name, uid)
    loop
      if v_actor.uid is null then
        perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
      else
        perform set_config('request.jwt.claims', json_build_object('sub', v_actor.uid, 'role', 'authenticated')::text, true);
      end if;
      execute format('set local role %I', v_actor.role_name);
      if current_user <> v_actor.role_name or auth.uid() is distinct from v_actor.uid then
        raise exception 'ISOLATION 5 FAILED: switch to % did not take effect (current_user %, auth.uid %)', v_actor.label, current_user, auth.uid();
      end if;

      execute format('delete from public.%I where id = any($1)', v_case.table_name) using array[v_case.a_row, v_case.a_extra_row];
      get diagnostics v_count = row_count;
      execute 'reset role';

      if v_count <> 0 then
        raise exception 'ISOLATION 5 FAILED: % deleted % row(s) of account A in %', v_actor.label, v_count, v_case.table_name;
      end if;
      execute format('select count(*) from public.%I where id = any($1)', v_case.table_name) into v_count using array[v_case.a_row, v_case.a_extra_row];
      if v_count <> 2 then
        raise exception 'ISOLATION 5 FAILED: rows of account A in % missing after delete by % (% of 2 left)', v_case.table_name, v_actor.label, v_count;
      end if;
    end loop;

    -- owner counterexample: account A deletes its extra row
    perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    if current_user <> 'authenticated' or auth.uid() is distinct from v_a then
      raise exception 'ISOLATION 5 FAILED: switch to account A did not take effect (current_user %, auth.uid %)', current_user, auth.uid();
    end if;
    execute format('delete from public.%I where id = $1', v_case.table_name) using v_case.a_extra_row;
    get diagnostics v_count = row_count;
    execute 'reset role';

    -- Append-only: the owner deletes nothing either; the row goes only with the account (ISOLATION 6).
    if v_case.table_name in (select o.table_name from pg_temp.append_only_tables() o) then
      if v_count <> 0 then
        raise exception 'ISOLATION 5 FAILED: account A deleted % row(s) of its own in append-only %, expected 0', v_count, v_case.table_name;
      end if;
      execute format('select count(*) from public.%I where id = $1', v_case.table_name) into v_count using v_case.a_extra_row;
      if v_count <> 1 then
        raise exception 'ISOLATION 5 FAILED: row of account A in append-only % is gone after delete by its owner', v_case.table_name;
      end if;
      continue;
    end if;

    if v_count <> 1 then
      raise exception 'ISOLATION 5 FAILED: account A delete of its own row in % touched % row(s), expected 1', v_case.table_name, v_count;
    end if;
    execute format('select count(*) from public.%I where id = $1', v_case.table_name) into v_count using v_case.a_extra_row;
    if v_count <> 0 then
      raise exception 'ISOLATION 5 FAILED: row deleted by account A in % still exists', v_case.table_name;
    end if;
  end loop;

  raise notice 'ISOLATION 5 OK: DELETE — B and anon touch 0 rows of A and leave them in place in all % account tables; A deletes its own, except in append-only tables (0 rows, row kept)', cardinality(v_cases);
end;
$$;

-- ---------------------------------------------------------------------------
-- ISOLATION 6: deleting account A with the correction window closed removes every row of A in every account table
-- and leaves account B untouched (as postgres).
-- The three window functions (medication, dosage period and journal entry, S-05) are replaced by `return false` inside
-- a savepoint and restored by rolling back to it, as in rls_checks.sql; their fingerprints are compared afterwards.
-- Counterexample in two parts: deleting A's medication and A's journal entry by hand with the window closed fails
-- with the history guards (so the guards are active), and the rows of B stay (so the delete is not a blanket wipe).
-- ---------------------------------------------------------------------------

create temporary table isolation_window_fingerprint as
select md5(pg_get_functiondef('public.medication_correction_window_open(uuid)'::regprocedure)) as fingerprint,
       md5(pg_get_functiondef('public.dosage_period_correction_window_open(uuid)'::regprocedure)) as period_fingerprint,
       md5(pg_get_functiondef('public.symptom_entry_correction_window_open(uuid)'::regprocedure)) as journal_fingerprint;

savepoint before_account_deleted;

create or replace function public.medication_correction_window_open(p_medication_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  return false;
end;
$$;

create or replace function public.dosage_period_correction_window_open(p_period_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  return false;
end;
$$;

create or replace function public.symptom_entry_correction_window_open(p_entry_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  return false;
end;
$$;

do $$
declare
  v_a constant uuid := '00000000-0000-4000-9000-000000000a00';
  -- Row inserted by account A in ISOLATION 2 in every table.
  v_inserted constant uuid := '00000000-0000-4000-9000-00000000c002';
  v_case isolation_fixtures;
  v_count integer;
  v_state text;
  v_message text;
begin
  -- Precondition: the rows of A that must disappear are there now, so zero rows afterwards measures the deletion.
  for v_case in
    select f.* from isolation_fixtures f join pg_temp.account_data_tables() a on a.table_name = f.table_name
    order by a.depth, f.table_name
  loop
    execute format('select count(*) from public.%I where id = any($1)', v_case.table_name) into v_count using array[v_case.a_row, v_inserted];
    if v_count <> 2 then
      raise exception 'ISOLATION 6 FAILED: before deleting account A, % has % of its 2 test rows (a_row and the row inserted in ISOLATION 2)', v_case.table_name, v_count;
    end if;
  end loop;

  -- Counterexample: with the window closed the history guard blocks deleting A's medication by hand. Only P0001
  -- with the guard's message counts; any other error stops the file.
  v_state := 'no error';
  v_message := null;
  begin
    delete from public.medications where id = '00000000-0000-4000-9000-000000000a01';
  exception when sqlstate 'P0001' then
    v_state := 'P0001';
    get stacked diagnostics v_message = message_text;
  end;
  if v_state <> 'P0001' then
    raise exception 'ISOLATION 6 FAILED: deleting a medication of account A by hand with the correction window closed passed without an error; the history guards are not active, so the account deletion below would prove nothing';
  end if;
  if v_message not like '%okno korekty jest już zamknięte%' then
    raise exception 'ISOLATION 6 FAILED: deleting a medication of account A by hand was blocked by an unexpected P0001 error, expected the correction window guard (got %)', v_message;
  end if;

  v_state := 'no error';
  v_message := null;
  begin
    delete from public.symptom_entries where id = '00000000-0000-4000-9000-000000000a04';
  exception when sqlstate 'P0001' then
    v_state := 'P0001';
    get stacked diagnostics v_message = message_text;
  end;
  if v_state <> 'P0001' then
    raise exception 'ISOLATION 6 FAILED: deleting a journal entry of account A by hand with the correction window closed passed without an error; the journal history guards are not active, so the account deletion below would prove nothing';
  end if;
  if v_message not like '%okno korekty%jest już zamknięte%' or v_message not like '%usunąć wpisu o samopoczuciu%' then
    raise exception 'ISOLATION 6 FAILED: deleting a journal entry of account A by hand was blocked by an unexpected P0001 error, expected the journal correction window guard (got %)', v_message;
  end if;

  delete from auth.users where id = v_a;
  get diagnostics v_count = row_count;
  if v_count <> 1 then
    raise exception 'ISOLATION 6 FAILED: deleting account A from auth.users touched % row(s), expected 1', v_count;
  end if;

  for v_case in
    select f.* from isolation_fixtures f join pg_temp.account_data_tables() a on a.table_name = f.table_name
    order by a.depth, f.table_name
  loop
    execute format('select count(*) from public.%I where id = any($1)', v_case.table_name) into v_count using array[v_case.a_row, v_inserted];
    if v_count <> 0 then
      raise exception 'ISOLATION 6 FAILED: % row(s) of deleted account A left in % with the correction window closed', v_count, v_case.table_name;
    end if;
    execute format('select count(*) from public.%I where id = $1', v_case.table_name) into v_count using v_case.b_row;
    if v_count <> 1 then
      raise exception 'ISOLATION 6 FAILED: row of account B in % is gone after deleting account A', v_case.table_name;
    end if;
  end loop;

  raise notice 'ISOLATION 6 OK: with the correction window closed a manual delete of A''s medication and journal entry is blocked (P0001), deleting account A removes its rows from all % account tables, rows of B stay',
    (select count(*) from isolation_fixtures);
end;
$$;

-- Back to the migration state of the correction window function and to account A.
rollback to savepoint before_account_deleted;

do $$
declare
  v_before text;
  v_now text;
begin
  select fingerprint into v_before from isolation_window_fingerprint;
  v_now := md5(pg_get_functiondef('public.medication_correction_window_open(uuid)'::regprocedure));
  if v_before is null or v_now is distinct from v_before then
    raise exception 'ISOLATION 6 FAILED: correction window function differs from migration state after rollback to savepoint (fingerprint before %, now %)',
      v_before, v_now;
  end if;
  select period_fingerprint into v_before from isolation_window_fingerprint;
  v_now := md5(pg_get_functiondef('public.dosage_period_correction_window_open(uuid)'::regprocedure));
  if v_before is null or v_now is distinct from v_before then
    raise exception 'ISOLATION 6 FAILED: dosage period correction window function differs from migration state after rollback to savepoint (fingerprint before %, now %)',
      v_before, v_now;
  end if;
  select journal_fingerprint into v_before from isolation_window_fingerprint;
  v_now := md5(pg_get_functiondef('public.symptom_entry_correction_window_open(uuid)'::regprocedure));
  if v_before is null or v_now is distinct from v_before then
    raise exception 'ISOLATION 6 FAILED: journal entry correction window function differs from migration state after rollback to savepoint (fingerprint before %, now %)',
      v_before, v_now;
  end if;
end;
$$;

-- Completion marker for scripts/db-checks.mjs: printed only after every check above has passed.
do $$
begin
  if current_user <> 'postgres' then
    raise exception 'FINAL CHECK FAILED: file ends as % instead of postgres, a role was not reset', current_user;
  end if;
  raise notice 'GATE_COMPLETE account_isolation_checks';
end;
$$;

rollback;
