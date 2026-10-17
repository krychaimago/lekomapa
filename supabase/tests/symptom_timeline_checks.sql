-- Symptom timeline checks (S-09, FR-013): public.symptom_timeline(), the symptom read behind the timeline page
-- (/wizyta/os-czasu), run as a signed-in account (role authenticated, RLS applies).
--   TIMELINE 1: account A with three entries of one symptom (inserted out of order, one of them without severity) and
--               one entry of another gets two rows; each row carries all its dates in ascending order, severities[i]
--               belongs to occurred_at[i] (null included), and the catalog name.
--   TIMELINE 2: isolation — account B, which logged the same symptom as A, gets only its own row, date and severity;
--               no date of account A appears. Precondition in the same block: account A sees its own rows, so an
--               empty result from a broken function cannot pass as isolation.
--   TIMELINE 3: privileges — anon cannot execute the function (named error insufficient_privilege, code 42501
--               measured on 17.10.2026 against the local database), authenticated can; the function is security
--               invoker, so RLS of the caller applies.
--
-- How to run: `npm run db:check` (needs `npx supabase start`). The runner (scripts/db-checks.mjs) passes this file
-- only when it prints `GATE_COMPLETE symptom_timeline_checks` at the end.
--
-- Rules every block follows (same as account_isolation_checks.sql):
--   - The role is switched at the top level of a block, never inside a `begin ... exception ... end` subblock,
--     because catching an error there would undo the switch and the next steps would run as postgres.
--   - Each switch is asserted (current_user and auth.uid()).
--   - Blocked cases catch a named error only, never `when others`.
--   - Expected dates are built from now(), which is constant within the transaction.
--
-- Everything runs in one transaction ended with rollback: no test rows are left behind.

\set ON_ERROR_STOP on

begin;

-- ---------------------------------------------------------------------------
-- Test accounts, data and helpers
-- UUID pool 00000000-0000-4000-9a00-*.
--   account A: 0a00; nausea entries 0a01 (now - 1 day, severe), 0a02 (now - 3 days, no severity),
--              0a03 (now - 2 days, mild), inserted in this order on purpose; headache entry 0a04 (now - 5 hours,
--              moderate)
--   account B: 0b00; nausea entry 0b01 (now - 6 hours, moderate)
-- An entry needs a symptom only at commit, and this file ends with rollback.
-- ---------------------------------------------------------------------------

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-9a00-000000000a00',
   'authenticated', 'authenticated', 'timeline-a@example.test', 'x', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-9a00-000000000b00',
   'authenticated', 'authenticated', 'timeline-b@example.test', 'x', now(), now());

insert into public.symptom_entries (id, user_id, occurred_at)
values
  ('00000000-0000-4000-9a00-000000000a01', '00000000-0000-4000-9a00-000000000a00', now() - interval '1 day'),
  ('00000000-0000-4000-9a00-000000000a02', '00000000-0000-4000-9a00-000000000a00', now() - interval '3 days'),
  ('00000000-0000-4000-9a00-000000000a03', '00000000-0000-4000-9a00-000000000a00', now() - interval '2 days'),
  ('00000000-0000-4000-9a00-000000000a04', '00000000-0000-4000-9a00-000000000a00', now() - interval '5 hours'),
  ('00000000-0000-4000-9a00-000000000b01', '00000000-0000-4000-9a00-000000000b00', now() - interval '6 hours');

insert into public.symptom_entry_items (entry_id, symptom_id, severity)
values
  ('00000000-0000-4000-9a00-000000000a01', (select id from public.symptoms where key = 'nausea'), 'severe'),
  ('00000000-0000-4000-9a00-000000000a02', (select id from public.symptoms where key = 'nausea'), null),
  ('00000000-0000-4000-9a00-000000000a03', (select id from public.symptoms where key = 'nausea'), 'mild'),
  ('00000000-0000-4000-9a00-000000000a04', (select id from public.symptoms where key = 'headache'), 'moderate'),
  ('00000000-0000-4000-9a00-000000000b01', (select id from public.symptoms where key = 'nausea'), 'moderate');

-- Switches the transaction to a signed-in account and asserts that the switch took effect.
create function pg_temp.act_as(p_uid uuid)
returns void
language plpgsql
as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  if current_user <> 'authenticated' or auth.uid() is distinct from p_uid then
    raise exception 'switch to account % did not take effect (current_user %, auth.uid %)', p_uid, current_user, auth.uid();
  end if;
end;
$$;

-- Switches the transaction to anon without a session and asserts that the switch took effect.
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

-- Back to postgres, without claims.
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

-- The function result of the current role, copied into a temporary table readable after switching back to postgres.
create temporary table timeline_result (
  label text not null,
  symptom_id uuid,
  symptom_name text,
  occurred_at timestamptz[],
  severities text[]
);
grant select, insert on timeline_result to authenticated, anon;

-- ---------------------------------------------------------------------------
-- TIMELINE 1: complete, ordered dates of account A with the severity of each entry
-- ---------------------------------------------------------------------------

do $$
declare
  v_a constant uuid := '00000000-0000-4000-9a00-000000000a00';
  v_nausea uuid := (select id from public.symptoms where key = 'nausea');
  v_headache uuid := (select id from public.symptoms where key = 'headache');
  v_row record;
begin
  if v_nausea is null or v_headache is null then
    raise exception 'TIMELINE 1 FAILED: catalog symptoms nausea/headache are missing, so the check would not measure anything';
  end if;

  perform pg_temp.act_as(v_a);
  insert into timeline_result select 'a1', * from public.symptom_timeline();
  perform pg_temp.act_as_postgres();

  if (select count(*) from timeline_result where label = 'a1') <> 2 then
    raise exception 'TIMELINE 1 FAILED: expected 2 rows (nausea, headache), got %',
      (select string_agg(coalesce(symptom_name, '?'), ', ') from timeline_result where label = 'a1');
  end if;

  -- Ascending dates; the severity at each position is the one inserted with that date: -3 days had none, -2 days was
  -- mild, -1 day was severe. A function ordering only one of the two arrays would pair them wrongly.
  select * into v_row from timeline_result where label = 'a1' and symptom_id = v_nausea;
  if v_row.occurred_at is distinct from array[now() - interval '3 days', now() - interval '2 days', now() - interval '1 day']
     or v_row.severities is distinct from array[null, 'mild', 'severe']::text[]
     or v_row.symptom_name is distinct from (select name from public.symptoms where id = v_nausea) then
    raise exception 'TIMELINE 1 FAILED: nausea row is (name %, occurred_at %, severities %), expected the catalog name, three dates ascending and severities {NULL,mild,severe}',
      v_row.symptom_name, v_row.occurred_at, v_row.severities;
  end if;

  select * into v_row from timeline_result where label = 'a1' and symptom_id = v_headache;
  if v_row.occurred_at is distinct from array[now() - interval '5 hours']
     or v_row.severities is distinct from array['moderate']::text[]
     or v_row.symptom_name is distinct from (select name from public.symptoms where id = v_headache) then
    raise exception 'TIMELINE 1 FAILED: headache row is (name %, occurred_at %, severities %), expected the catalog name, one date and {moderate}',
      v_row.symptom_name, v_row.occurred_at, v_row.severities;
  end if;

  raise notice 'TIMELINE 1 OK: one row per symptom with all its dates ascending, each paired with its own severity (null included), and the catalog name';
end;
$$;

-- ---------------------------------------------------------------------------
-- TIMELINE 2: account B sees only its own row, date and severity
-- ---------------------------------------------------------------------------

do $$
declare
  v_a constant uuid := '00000000-0000-4000-9a00-000000000a00';
  v_b constant uuid := '00000000-0000-4000-9a00-000000000b00';
  v_nausea uuid := (select id from public.symptoms where key = 'nausea');
  v_row record;
begin
  -- Precondition: in this run account A sees its own rows, so an empty result for B is not a broken function.
  perform pg_temp.act_as(v_a);
  insert into timeline_result select 'a2', * from public.symptom_timeline();
  perform pg_temp.act_as_postgres();
  if (select count(*) from timeline_result where label = 'a2') = 0 then
    raise exception 'TIMELINE 2 FAILED: precondition — account A sees none of its own rows, so isolation is not measured';
  end if;

  perform pg_temp.act_as(v_b);
  insert into timeline_result select 'b2', * from public.symptom_timeline();
  perform pg_temp.act_as_postgres();

  if (select count(*) from timeline_result where label = 'b2') <> 1 then
    raise exception 'TIMELINE 2 FAILED: account B expected exactly 1 row (its nausea), got %',
      (select string_agg(coalesce(symptom_name, '?'), ', ') from timeline_result where label = 'b2');
  end if;

  select * into v_row from timeline_result where label = 'b2';
  if v_row.symptom_id is distinct from v_nausea
     or v_row.occurred_at is distinct from array[now() - interval '6 hours']
     or v_row.severities is distinct from array['moderate']::text[] then
    raise exception 'TIMELINE 2 FAILED: account B row is (symptom %, occurred_at %, severities %), expected nausea with only its own date and severity',
      v_row.symptom_name, v_row.occurred_at, v_row.severities;
  end if;

  if exists (
    select 1
      from timeline_result r, unnest(r.occurred_at) d
     where r.label = 'b2'
       and d in (select occurred_at from public.symptom_entries where user_id = v_a)
  ) then
    raise exception 'TIMELINE 2 FAILED: a date of account A appears in the result of account B';
  end if;

  raise notice 'TIMELINE 2 OK: account B gets only its own row, date and severity, account A sees its rows in the same run';
end;
$$;

-- ---------------------------------------------------------------------------
-- TIMELINE 3: privileges
-- ---------------------------------------------------------------------------

do $$
declare
  v_caught boolean := false;
begin
  if has_function_privilege('anon', 'public.symptom_timeline()', 'execute') then
    raise exception 'TIMELINE 3 FAILED: anon has EXECUTE on symptom_timeline()';
  end if;
  if not has_function_privilege('authenticated', 'public.symptom_timeline()', 'execute') then
    raise exception 'TIMELINE 3 FAILED: authenticated has no EXECUTE on symptom_timeline()';
  end if;
  if (select prosecdef from pg_proc where oid = 'public.symptom_timeline()'::regprocedure) then
    raise exception 'TIMELINE 3 FAILED: symptom_timeline() is security definer, so RLS of the caller would not apply';
  end if;

  perform pg_temp.act_as_anon();
  begin
    perform * from public.symptom_timeline();
  exception
    when insufficient_privilege then
      v_caught := true;
  end;
  perform pg_temp.act_as_postgres();

  if not v_caught then
    raise exception 'TIMELINE 3 FAILED: anon called symptom_timeline() without a permission error';
  end if;

  raise notice 'TIMELINE 3 OK: anon cannot execute symptom_timeline() (42501), authenticated can, the function is security invoker';
end;
$$;

-- Completion marker for scripts/db-checks.mjs: printed only after every check above has passed.
do $$
begin
  if current_user <> 'postgres' then
    raise exception 'FINAL CHECK FAILED: file ends as % instead of postgres, a role was not reset', current_user;
  end if;
  raise notice 'GATE_COMPLETE symptom_timeline_checks';
end;
$$;

rollback;
