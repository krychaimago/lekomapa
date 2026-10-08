-- Terms acceptance checks (S-01 phase 1): the acceptance is written by the database when the account is created, and
-- it is append-only history.
--   TERMS 1: an account created with raw_user_meta_data {"terms_version":"1"} gets exactly one acceptance of version 1,
--            dated at the moment the account was created.
--   TERMS 2: an account created with {}, {"terms_version":"abc"} or {"terms_version":"99"} gets no acceptance and no
--            error — the signup must never fail because of the metadata; the version gate catches the missing row.
--   TERMS 3: update and delete of an acceptance as postgres are refused by the guard with P0001.
--   TERMS 4: deleting the account deletes its acceptances (cascade passes the guard).
--   TERMS 5: an insert with an explicit accepted_at = 2000-01-01 stores now() instead.
--   TERMS 6: a second insert of the same version for the same account is unique_violation, and the account still has
--            one row of that version.
--
-- How to run: `npm run db:check` (needs `npx supabase start`), or this file alone:
-- `node scripts/db-checks.mjs supabase/tests/terms_checks.sql`. The runner (scripts/db-checks.mjs) passes it only when
-- it prints `GATE_COMPLETE terms_checks` at the end.
--
-- Rules every block follows:
--   - Writes that may be refused go through pg_temp.try_exec (catches only P0001, the guard's raise exception) or
--     pg_temp.try_unique (catches only unique_violation). Any other error stops the file.
--   - Everything runs as postgres, which bypasses RLS, so the guard is the only thing measured in TERMS 3.
--
-- Everything runs in one transaction ended with rollback: nothing is left behind.

\set ON_ERROR_STOP on

begin;

-- ---------------------------------------------------------------------------
-- Helpers. UUID pool 00000000-0000-4000-9500-*.
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

create function pg_temp.acceptances(p_user uuid)
returns integer
language sql
stable
as $$
  select count(*)::integer from public.terms_acceptances where user_id = p_user;
$$;

-- Runs one statement with $1 = p_id and returns 'ok <rows>' or 'P0001: <message>'. Only P0001 is caught.
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

-- Runs one statement and returns 'ok' or 'unique_violation'. Only unique_violation is caught.
create function pg_temp.try_unique(p_sql text)
returns text
language plpgsql
as $$
begin
  execute p_sql;
  return 'ok';
exception when unique_violation then
  return 'unique_violation';
end;
$$;

-- ---------------------------------------------------------------------------
-- TERMS 1: valid metadata -> one acceptance of version 1, dated at account creation
-- ---------------------------------------------------------------------------

do $$
declare
  v_user constant uuid := '00000000-0000-4000-9500-000000000a01';
  v_count integer;
  v_version smallint;
  v_accepted_at timestamptz;
  v_created_at timestamptz;
begin
  perform pg_temp.create_account(v_user, 'terms-1@example.test', '{"terms_version":"1"}'::jsonb);

  v_count := pg_temp.acceptances(v_user);
  if v_count <> 1 then
    raise exception 'TERMS 1 FAILED: expected 1 acceptance after signup with terms_version 1, got %', v_count;
  end if;

  select a.version, a.accepted_at, u.created_at
    into v_version, v_accepted_at, v_created_at
    from public.terms_acceptances a
    join auth.users u on u.id = a.user_id
   where a.user_id = v_user;

  if v_version <> 1 then
    raise exception 'TERMS 1 FAILED: expected version 1, got %', v_version;
  end if;
  if v_accepted_at is distinct from v_created_at then
    raise exception 'TERMS 1 FAILED: accepted_at % differs from account created_at %', v_accepted_at, v_created_at;
  end if;

  raise notice 'TERMS 1 OK: signup with terms_version 1 writes one acceptance of version 1 dated at account creation';
end;
$$;

-- ---------------------------------------------------------------------------
-- TERMS 2: missing, non-numeric, unknown or oversized version -> no row and no error
-- ---------------------------------------------------------------------------

do $$
declare
  v_case record;
  v_count integer;
begin
  for v_case in
    select * from (values
      ('00000000-0000-4000-9500-000000000a02'::uuid, 'terms-2a@example.test', '{}'::jsonb),
      ('00000000-0000-4000-9500-000000000a03'::uuid, 'terms-2b@example.test', '{"terms_version":"abc"}'::jsonb),
      ('00000000-0000-4000-9500-000000000a04'::uuid, 'terms-2c@example.test', '{"terms_version":"99"}'::jsonb),
      -- Beyond smallint: without the length limit in the trigger the cast overflows and the signup fails with 500.
      ('00000000-0000-4000-9500-000000000a2d'::uuid, 'terms-2d@example.test', '{"terms_version":"99999999999"}'::jsonb)
    ) as c(id, email, meta)
  loop
    -- Any error here stops the file: a trigger that raises would make the signup fail with 500.
    perform pg_temp.create_account(v_case.id, v_case.email, v_case.meta);

    if not exists (select 1 from auth.users where id = v_case.id) then
      raise exception 'TERMS 2 FAILED: account with metadata % was not created', v_case.meta;
    end if;

    v_count := pg_temp.acceptances(v_case.id);
    if v_count <> 0 then
      raise exception 'TERMS 2 FAILED: metadata % produced % acceptances, expected 0', v_case.meta, v_count;
    end if;
  end loop;

  raise notice 'TERMS 2 OK: missing, non-numeric, unknown and oversized terms_version create the account without an acceptance';
end;
$$;

-- ---------------------------------------------------------------------------
-- TERMS 3: the guard refuses update and delete with P0001
-- ---------------------------------------------------------------------------

do $$
declare
  v_user constant uuid := '00000000-0000-4000-9500-000000000a01';
  v_got text;
begin
  v_got := pg_temp.try_exec(
    'update public.terms_acceptances set accepted_at = accepted_at - interval ''1 day'' where user_id = $1', v_user);
  if v_got not like 'P0001: %' then
    raise exception 'TERMS 3 FAILED: update of an acceptance was not refused by the guard (got %)', v_got;
  end if;

  v_got := pg_temp.try_exec('delete from public.terms_acceptances where user_id = $1', v_user);
  if v_got not like 'P0001: %' then
    raise exception 'TERMS 3 FAILED: delete of an acceptance was not refused by the guard (got %)', v_got;
  end if;

  if pg_temp.acceptances(v_user) <> 1 then
    raise exception 'TERMS 3 FAILED: the acceptance did not survive the refused writes';
  end if;

  raise notice 'TERMS 3 OK: update and delete of an acceptance are refused with P0001';
end;
$$;

-- ---------------------------------------------------------------------------
-- TERMS 4: deleting the account removes its acceptances
-- ---------------------------------------------------------------------------

do $$
declare
  v_user constant uuid := '00000000-0000-4000-9500-000000000a05';
begin
  perform pg_temp.create_account(v_user, 'terms-4@example.test', '{"terms_version":"1"}'::jsonb);
  if pg_temp.acceptances(v_user) <> 1 then
    raise exception 'TERMS 4 FAILED: setup expected 1 acceptance, so the cascade would not be measured';
  end if;

  -- Any error here (e.g. the guard refusing the cascade) stops the file.
  delete from auth.users where id = v_user;

  if pg_temp.acceptances(v_user) <> 0 then
    raise exception 'TERMS 4 FAILED: acceptances of a deleted account are still there';
  end if;

  raise notice 'TERMS 4 OK: deleting the account deletes its acceptances';
end;
$$;

-- ---------------------------------------------------------------------------
-- TERMS 5: accepted_at is set by the database
-- TERMS 6: one row per account and version
-- ---------------------------------------------------------------------------

do $$
declare
  v_user constant uuid := '00000000-0000-4000-9500-000000000a06';
  v_accepted_at timestamptz;
  v_got text;
begin
  perform pg_temp.create_account(v_user, 'terms-5@example.test', '{}'::jsonb);

  insert into public.terms_acceptances (user_id, version, accepted_at)
  values (v_user, 1, '2000-01-01 00:00:00+00');

  select accepted_at into v_accepted_at from public.terms_acceptances where user_id = v_user;
  if v_accepted_at is distinct from now() then
    raise exception 'TERMS 5 FAILED: accepted_at given by the client was stored (%), expected now() %',
      v_accepted_at, now();
  end if;

  raise notice 'TERMS 5 OK: an explicit accepted_at is replaced by now()';

  v_got := pg_temp.try_unique(format(
    'insert into public.terms_acceptances (user_id, version) values (%L, 1)', v_user));
  if v_got <> 'unique_violation' then
    raise exception 'TERMS 6 FAILED: second acceptance of the same version was not refused (got %)', v_got;
  end if;
  if pg_temp.acceptances(v_user) <> 1 then
    raise exception 'TERMS 6 FAILED: expected 1 acceptance of version 1, got %', pg_temp.acceptances(v_user);
  end if;

  raise notice 'TERMS 6 OK: a second acceptance of the same version is unique_violation and leaves one row';
end;
$$;

-- Completion marker for scripts/db-checks.mjs: printed only after every check above has passed.
do $$
begin
  if current_user <> 'postgres' then
    raise exception 'FINAL CHECK FAILED: file ends as % instead of postgres, a role was not reset', current_user;
  end if;
  raise notice 'GATE_COMPLETE terms_checks';
end;
$$;

rollback;
