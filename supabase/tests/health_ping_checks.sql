-- Health ping checks (production-observability phase 3): the public route /api/health reaches Postgres as anon
-- through public.health_ping(), and the function gives nothing but a constant.
--   HEALTH 1: as anon (no session), `select public.health_ping()` returns exactly 1.
--   HEALTH 2: the function exists and is not security definer (prosecdef = false), so it never runs with the owner's
--             privileges.
--   HEALTH 3: pg_depend binds the function to no relation (table, view, sequence). Postgres records no dependencies
--             for a `language sql` body stored as a string, so this only guards a future `begin atomic` body.
--   HEALTH 4: the body is exactly `select 1` (case, whitespace and the trailing semicolon ignored), so a body that
--             reads a table fails here even though HEALTH 3 cannot see it. Changing the body means changing this check.
--
-- How to run: `npm run db:check` (needs `npx supabase start`), or this file alone:
-- `node scripts/db-checks.mjs supabase/tests/health_ping_checks.sql`. The runner (scripts/db-checks.mjs) passes it
-- only when it prints `GATE_COMPLETE health_ping_checks` at the end.
--
-- Rules every block follows:
--   - No error is caught. A missing EXECUTE for anon (42501) or a missing function stops the file, and a stopped file
--     never prints its marker, so it cannot count as green.
--   - The role is switched at the top level of a block, never inside an exception subblock, and checked after the
--     switch, so a switch that did not take effect cannot make the anon check run as postgres.
--
-- Everything runs in one transaction ended with rollback: nothing is left behind.

\set ON_ERROR_STOP on

begin;

-- ---------------------------------------------------------------------------
-- Helpers.
-- ---------------------------------------------------------------------------

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

-- ---------------------------------------------------------------------------
-- HEALTH 1: anon gets exactly 1.
-- ---------------------------------------------------------------------------

do $$
declare
  v_result integer;
begin
  perform pg_temp.act_as_anon();
  v_result := public.health_ping();
  if v_result is distinct from 1 then
    raise exception 'HEALTH 1 FAILED: health_ping() as anon returned %, expected 1', v_result;
  end if;
  perform pg_temp.act_as_postgres();

  raise notice 'HEALTH 1 OK: anon calls health_ping() and gets 1';
end;
$$;

-- ---------------------------------------------------------------------------
-- HEALTH 2, 3 and 4: catalog of the function.
-- ---------------------------------------------------------------------------

do $$
declare
  v_function regprocedure := to_regprocedure('public.health_ping()');
  v_security_definer boolean;
  v_relations text;
  v_body text;
begin
  if v_function is null then
    raise exception 'HEALTH 2 FAILED: public.health_ping() does not exist';
  end if;

  select p.prosecdef into strict v_security_definer from pg_catalog.pg_proc p where p.oid = v_function;
  if v_security_definer is distinct from false then
    raise exception 'HEALTH 2 FAILED: public.health_ping() is security definer';
  end if;

  raise notice 'HEALTH 2 OK: health_ping() is security invoker';

  select string_agg(d.refobjid::regclass::text, ', ')
    into v_relations
    from pg_catalog.pg_depend d
   where d.classid = 'pg_catalog.pg_proc'::regclass
     and d.objid = v_function
     and d.refclassid = 'pg_catalog.pg_class'::regclass;
  if v_relations is not null then
    raise exception 'HEALTH 3 FAILED: health_ping() depends on relations: %', v_relations;
  end if;

  raise notice 'HEALTH 3 OK: health_ping() depends on no relation';

  select p.prosrc into strict v_body from pg_catalog.pg_proc p where p.oid = v_function;
  if lower(regexp_replace(btrim(v_body, E' \t\r\n;'), '\s+', ' ', 'g')) is distinct from 'select 1' then
    raise exception 'HEALTH 4 FAILED: health_ping() body is %, expected select 1', v_body;
  end if;

  raise notice 'HEALTH 4 OK: health_ping() body is select 1';
end;
$$;

-- Completion marker for scripts/db-checks.mjs: printed only after every check above has passed.
do $$
begin
  if current_user <> 'postgres' then
    raise exception 'FINAL CHECK FAILED: file ends as % instead of postgres, a role was not reset', current_user;
  end if;
  raise notice 'GATE_COMPLETE health_ping_checks';
end;
$$;

rollback;
