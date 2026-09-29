-- Account isolation checks: RLS behaviour per operation on the three tables with account data
-- (medications, medication_substances, dosage_periods), for a second account and for anon.
--   ISOLATION 0: test data and preconditions (correction window open for fresh rows).
--   ISOLATION 1: SELECT.
--   ISOLATION 2: INSERT.
--   ISOLATION 3: UPDATE.
--   ISOLATION 4: UPDATE that re-points a row of account B under account A (user_id / medication_id).
--   ISOLATION 5: DELETE.
--
-- How to run: `npm run db:check` (needs `npx supabase start`). The runner (scripts/db-checks.mjs) pipes this
-- file into psql inside the local database container, forces ON_ERROR_STOP and passes the file only when it
-- prints `GATE_COMPLETE account_isolation_checks` at the end. The same runner runs in CI in the `smoke` job.
--
-- Rules every block follows:
--   - The role is switched OUTSIDE any `begin ... exception ... end` subblock. `set local role` executed inside
--     a subblock is undone together with the subtransaction when the subblock catches an error, and the next
--     steps would run as postgres and pass without measuring RLS. Each block starts by asserting current_user
--     and auth.uid(), and goes back with `execute 'reset role'` after each case.
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
-- ISOLATION 0: test data (as postgres) and preconditions
-- UUID pool 00000000-0000-4000-9000-*, distinct from rls_checks.sql.
--   account A: 0a00; medication 0a01, substance 0a02, period 0a03
--              extra rows for the owner DELETE counterexample: medication 0a11, substance 0a12, period 0a13
--   account B: 0b00; medication 0b01, substance 0b02, period 0b03
-- ---------------------------------------------------------------------------

do $$
begin
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

  -- The owner counterexamples change and delete core fields. They only prove anything while the history
  -- guards let them through, i.e. while the correction window of fresh rows is open.
  if not public.medication_correction_window_open('00000000-0000-4000-9000-000000000a01')
     or not public.medication_correction_window_open('00000000-0000-4000-9000-000000000b01') then
    raise exception 'ISOLATION 0 FAILED: correction window is closed for freshly created test medications';
  end if;

  raise notice 'ISOLATION 0 OK: accounts A and B, each with a medication, a substance and a period; correction window open';
end;
$$;

-- ---------------------------------------------------------------------------
-- ISOLATION 1: SELECT — B and anon see 0 rows of A; A sees its own; B sees its own
-- ---------------------------------------------------------------------------

do $$
declare
  v_a constant uuid := '00000000-0000-4000-9000-000000000a00';
  v_b constant uuid := '00000000-0000-4000-9000-000000000b00';
  v_case record;
  v_count integer;
begin
  for v_case in
    select * from (values
      ('medications', '00000000-0000-4000-9000-000000000a01'::uuid, '00000000-0000-4000-9000-000000000b01'::uuid),
      ('medication_substances', '00000000-0000-4000-9000-000000000a02'::uuid, '00000000-0000-4000-9000-000000000b02'::uuid),
      ('dosage_periods', '00000000-0000-4000-9000-000000000a03'::uuid, '00000000-0000-4000-9000-000000000b03'::uuid)
    ) as t(tbl, a_row, b_row)
  loop
    -- account B
    perform set_config('request.jwt.claims', json_build_object('sub', v_b, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    if current_user <> 'authenticated' or auth.uid() is distinct from v_b then
      raise exception 'ISOLATION 1 FAILED: switch to account B did not take effect (current_user %, auth.uid %)', current_user, auth.uid();
    end if;

    execute format('select count(*) from public.%I where id = $1', v_case.tbl) into v_count using v_case.a_row;
    if v_count <> 0 then
      raise exception 'ISOLATION 1 FAILED: account B sees % row(s) of account A in %', v_count, v_case.tbl;
    end if;
    -- Positive control: the same session does read rows, only not A's.
    execute format('select count(*) from public.%I where id = $1', v_case.tbl) into v_count using v_case.b_row;
    if v_count <> 1 then
      raise exception 'ISOLATION 1 FAILED: account B does not see its own row in % (count %)', v_case.tbl, v_count;
    end if;
    execute 'reset role';

    -- anon
    perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
    execute 'set local role anon';
    if current_user <> 'anon' or auth.uid() is not null then
      raise exception 'ISOLATION 1 FAILED: switch to anon did not take effect (current_user %, auth.uid %)', current_user, auth.uid();
    end if;

    execute format('select count(*) from public.%I', v_case.tbl) into v_count;
    if v_count <> 0 then
      raise exception 'ISOLATION 1 FAILED: anon sees % row(s) in %', v_count, v_case.tbl;
    end if;
    execute 'reset role';

    -- owner counterexample: account A
    perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    if current_user <> 'authenticated' or auth.uid() is distinct from v_a then
      raise exception 'ISOLATION 1 FAILED: switch to account A did not take effect (current_user %, auth.uid %)', current_user, auth.uid();
    end if;

    execute format('select count(*) from public.%I where id = $1', v_case.tbl) into v_count using v_case.a_row;
    if v_count <> 1 then
      raise exception 'ISOLATION 1 FAILED: account A does not see its own row in % (count %)', v_case.tbl, v_count;
    end if;
    execute format('select count(*) from public.%I where id = $1', v_case.tbl) into v_count using v_case.b_row;
    if v_count <> 0 then
      raise exception 'ISOLATION 1 FAILED: account A sees % row(s) of account B in %', v_count, v_case.tbl;
    end if;
    execute 'reset role';
  end loop;

  raise notice 'ISOLATION 1 OK: SELECT — B and anon see no rows of A in any of the 3 tables; A and B see their own';
end;
$$;

-- ---------------------------------------------------------------------------
-- ISOLATION 2: INSERT — B under A's account/medication -> 42501; anon -> 42501; A under its own -> passes
-- ---------------------------------------------------------------------------

do $$
declare
  v_a constant uuid := '00000000-0000-4000-9000-000000000a00';
  v_b constant uuid := '00000000-0000-4000-9000-000000000b00';
  v_case record;
  v_actor record;
  v_state text;
  v_message text;
  v_count integer;
begin
  -- Each statement writes a row belonging to account A (user_id A or medication of A).
  for v_case in
    select * from (values
      ('medications',
       'insert into public.medications (id, user_id, product_name, composition_source) values ($1, ''00000000-0000-4000-9000-000000000a00'', ''inserted'', ''leaflet'')'),
      ('medication_substances',
       'insert into public.medication_substances (id, medication_id, substance_name, atc_code) values ($1, ''00000000-0000-4000-9000-000000000a01'', ''inserted'', ''B01AC06'')'),
      ('dosage_periods',
       'insert into public.dosage_periods (id, medication_id, dose_text, started_on, ended_on) values ($1, ''00000000-0000-4000-9000-000000000a01'', ''inserted'', date ''2023-01-01'', date ''2023-02-01'')')
    ) as t(tbl, stmt)
  loop
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
        execute v_case.stmt using '00000000-0000-4000-9000-00000000c002'::uuid;
      exception when sqlstate '42501' then
        v_state := '42501';
        get stacked diagnostics v_message = message_text;
      end;
      execute 'reset role';

      if v_state <> '42501' then
        raise exception 'ISOLATION 2 FAILED: % inserted a row of account A into % without an error', v_actor.label, v_case.tbl;
      end if;
      if v_message not like '%row-level security%' and v_message not like '%permission denied%' then
        raise exception 'ISOLATION 2 FAILED: % insert into % blocked by 42501 with an unexpected message (got %)', v_actor.label, v_case.tbl, v_message;
      end if;
    end loop;

    -- owner counterexample: account A inserts the same row
    perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    if current_user <> 'authenticated' or auth.uid() is distinct from v_a then
      raise exception 'ISOLATION 2 FAILED: switch to account A did not take effect (current_user %, auth.uid %)', current_user, auth.uid();
    end if;
    execute v_case.stmt using '00000000-0000-4000-9000-00000000c002'::uuid;
    get diagnostics v_count = row_count;
    execute 'reset role';

    if v_count <> 1 then
      raise exception 'ISOLATION 2 FAILED: account A insert into its own % touched % row(s), expected 1', v_case.tbl, v_count;
    end if;
    execute format('select count(*) from public.%I where id = $1', v_case.tbl) into v_count using '00000000-0000-4000-9000-00000000c002'::uuid;
    if v_count <> 1 then
      raise exception 'ISOLATION 2 FAILED: row inserted by account A into % is missing', v_case.tbl;
    end if;
  end loop;

  raise notice 'ISOLATION 2 OK: INSERT — B under A and anon rejected with 42501 in all 3 tables; A inserts under its own';
end;
$$;

-- ---------------------------------------------------------------------------
-- ISOLATION 3: UPDATE — B and anon on A's row -> 0 rows and the row is unchanged; A on its own -> 1 row
-- ---------------------------------------------------------------------------

do $$
declare
  v_a constant uuid := '00000000-0000-4000-9000-000000000a00';
  v_b constant uuid := '00000000-0000-4000-9000-000000000b00';
  v_case record;
  v_actor record;
  v_count integer;
  v_value text;
begin
  for v_case in
    select * from (values
      ('medications', 'product_name', '00000000-0000-4000-9000-000000000a01'::uuid, 'Isolation A'),
      ('medication_substances', 'substance_name', '00000000-0000-4000-9000-000000000a02'::uuid, 'Substance A'),
      ('dosage_periods', 'dose_text', '00000000-0000-4000-9000-000000000a03'::uuid, 'dose A')
    ) as t(tbl, col, a_row, original)
  loop
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

      execute format('update public.%I set %I = $1 where id = $2', v_case.tbl, v_case.col)
        using 'changed by ' || v_actor.label, v_case.a_row;
      get diagnostics v_count = row_count;
      execute 'reset role';

      if v_count <> 0 then
        raise exception 'ISOLATION 3 FAILED: % updated % row(s) of account A in %', v_actor.label, v_count, v_case.tbl;
      end if;
      execute format('select %I from public.%I where id = $1', v_case.col, v_case.tbl) into v_value using v_case.a_row;
      if v_value is distinct from v_case.original then
        raise exception 'ISOLATION 3 FAILED: row of account A in % changed after update by % (now %)', v_case.tbl, v_actor.label, v_value;
      end if;
    end loop;

    -- owner counterexample: account A updates the same row
    perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    if current_user <> 'authenticated' or auth.uid() is distinct from v_a then
      raise exception 'ISOLATION 3 FAILED: switch to account A did not take effect (current_user %, auth.uid %)', current_user, auth.uid();
    end if;
    execute format('update public.%I set %I = $1 where id = $2', v_case.tbl, v_case.col)
      using 'changed by owner', v_case.a_row;
    get diagnostics v_count = row_count;
    execute 'reset role';

    if v_count <> 1 then
      raise exception 'ISOLATION 3 FAILED: account A update of its own row in % touched % row(s), expected 1', v_case.tbl, v_count;
    end if;
    execute format('select %I from public.%I where id = $1', v_case.col, v_case.tbl) into v_value using v_case.a_row;
    if v_value is distinct from 'changed by owner' then
      raise exception 'ISOLATION 3 FAILED: owner update in % did not persist (now %)', v_case.tbl, v_value;
    end if;
  end loop;

  raise notice 'ISOLATION 3 OK: UPDATE — B and anon touch 0 rows of A and leave them unchanged in all 3 tables; A updates its own';
end;
$$;

-- ---------------------------------------------------------------------------
-- ISOLATION 4: UPDATE re-pointing B's row under A (user_id / medication_id is part of the core) -> 42501
-- ---------------------------------------------------------------------------

do $$
declare
  v_a constant uuid := '00000000-0000-4000-9000-000000000a00';
  v_b constant uuid := '00000000-0000-4000-9000-000000000b00';
  v_case record;
  v_state text;
  v_message text;
  v_owner uuid;
begin
  for v_case in
    select * from (values
      ('medications', 'user_id', '00000000-0000-4000-9000-000000000b01'::uuid,
       v_a, v_b),
      ('medication_substances', 'medication_id', '00000000-0000-4000-9000-000000000b02'::uuid,
       '00000000-0000-4000-9000-000000000a01'::uuid, '00000000-0000-4000-9000-000000000b01'::uuid),
      ('dosage_periods', 'medication_id', '00000000-0000-4000-9000-000000000b03'::uuid,
       '00000000-0000-4000-9000-000000000a01'::uuid, '00000000-0000-4000-9000-000000000b01'::uuid)
    ) as t(tbl, col, b_row, a_target, b_original)
  loop
    perform set_config('request.jwt.claims', json_build_object('sub', v_b, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    if current_user <> 'authenticated' or auth.uid() is distinct from v_b then
      raise exception 'ISOLATION 4 FAILED: switch to account B did not take effect (current_user %, auth.uid %)', current_user, auth.uid();
    end if;

    v_state := 'no error';
    v_message := null;
    begin
      execute format('update public.%I set %I = $1 where id = $2', v_case.tbl, v_case.col)
        using v_case.a_target, v_case.b_row;
    exception when sqlstate '42501' then
      v_state := '42501';
      get stacked diagnostics v_message = message_text;
    end;
    execute 'reset role';

    if v_state <> '42501' then
      raise exception 'ISOLATION 4 FAILED: account B re-pointed its row in % under account A without an error', v_case.tbl;
    end if;
    if v_message not like '%row-level security%' and v_message not like '%permission denied%' then
      raise exception 'ISOLATION 4 FAILED: re-pointing in % blocked by 42501 with an unexpected message (got %)', v_case.tbl, v_message;
    end if;
    execute format('select %I from public.%I where id = $1', v_case.col, v_case.tbl) into v_owner using v_case.b_row;
    if v_owner is distinct from v_case.b_original then
      raise exception 'ISOLATION 4 FAILED: row of account B in % is no longer under B (now %)', v_case.tbl, v_owner;
    end if;
  end loop;

  raise notice 'ISOLATION 4 OK: re-pointing B''s rows under A rejected with 42501 in all 3 tables (the owner counterexample is ISOLATION 3)';
end;
$$;

-- ---------------------------------------------------------------------------
-- ISOLATION 5: DELETE — B and anon on A's row -> 0 rows and the row exists; A on its own extra row -> 1 row
-- ---------------------------------------------------------------------------

do $$
declare
  v_a constant uuid := '00000000-0000-4000-9000-000000000a00';
  v_b constant uuid := '00000000-0000-4000-9000-000000000b00';
  v_case record;
  v_actor record;
  v_count integer;
begin
  -- Children before the parent, so that the owner deletes of 0a12 and 0a13 are not cascades.
  for v_case in
    select * from (values
      (1, 'medication_substances', '00000000-0000-4000-9000-000000000a02'::uuid, '00000000-0000-4000-9000-000000000a12'::uuid),
      (2, 'dosage_periods', '00000000-0000-4000-9000-000000000a03'::uuid, '00000000-0000-4000-9000-000000000a13'::uuid),
      (3, 'medications', '00000000-0000-4000-9000-000000000a01'::uuid, '00000000-0000-4000-9000-000000000a11'::uuid)
    ) as t(ord, tbl, a_row, a_extra_row)
    order by ord
  loop
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

      execute format('delete from public.%I where id = any($1)', v_case.tbl) using array[v_case.a_row, v_case.a_extra_row];
      get diagnostics v_count = row_count;
      execute 'reset role';

      if v_count <> 0 then
        raise exception 'ISOLATION 5 FAILED: % deleted % row(s) of account A in %', v_actor.label, v_count, v_case.tbl;
      end if;
      execute format('select count(*) from public.%I where id = any($1)', v_case.tbl) into v_count using array[v_case.a_row, v_case.a_extra_row];
      if v_count <> 2 then
        raise exception 'ISOLATION 5 FAILED: rows of account A in % missing after delete by % (% of 2 left)', v_case.tbl, v_actor.label, v_count;
      end if;
    end loop;

    -- owner counterexample: account A deletes its extra row
    perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    if current_user <> 'authenticated' or auth.uid() is distinct from v_a then
      raise exception 'ISOLATION 5 FAILED: switch to account A did not take effect (current_user %, auth.uid %)', current_user, auth.uid();
    end if;
    execute format('delete from public.%I where id = $1', v_case.tbl) using v_case.a_extra_row;
    get diagnostics v_count = row_count;
    execute 'reset role';

    if v_count <> 1 then
      raise exception 'ISOLATION 5 FAILED: account A delete of its own row in % touched % row(s), expected 1', v_case.tbl, v_count;
    end if;
    execute format('select count(*) from public.%I where id = $1', v_case.tbl) into v_count using v_case.a_extra_row;
    if v_count <> 0 then
      raise exception 'ISOLATION 5 FAILED: row deleted by account A in % still exists', v_case.tbl;
    end if;
  end loop;

  raise notice 'ISOLATION 5 OK: DELETE — B and anon touch 0 rows of A and leave them in place in all 3 tables; A deletes its own';
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
