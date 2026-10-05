-- Schema invariant checks: rules every table in public must follow, derived from the database catalog instead of
-- hand-written table lists.
--   The account data tables are the closure of foreign keys leading to auth.users (pg_temp.account_data_tables()).
--   The only hand-written lists are the shared tables (INVARIANT 1, INVARIANT 5) and the history guards
--   (INVARIANT 8): neither follows from the structure of the database, so adding one is a deliberate entry here.
--
--   INVARIANT 1: every public table is either account data (in the closure) or on the shared list, never both.
--   INVARIANT 2: every foreign key to auth.users is `on delete cascade`, every account table is reachable from
--                auth.users through cascading keys alone, and no key to an account table is `on delete set default`.
--   INVARIANT 3: RLS is enabled on every public table.
--   INVARIANT 4: every account table has a policy for SELECT, INSERT, UPDATE and DELETE, each only for
--                authenticated, with a non-empty expression that is not literally `true`.
--   INVARIANT 5: shared tables have SELECT policies only and no write privileges for anon/authenticated.
--   INVARIANT 6: anon and authenticated have no TRUNCATE on any public table.
--   INVARIANT 7: anon and authenticated have no EXECUTE on any security definer function in public that is not a
--                trigger function, and every security definer function in public pins its search_path.
--   INVARIANT 8: the history guard triggers exist, are enabled and fire BEFORE the listed event for each row.
--   INVARIANT 9: every view in public is security_invoker, or anon and authenticated have no privilege on it.
--
-- The catalog proves structure only. Whether a policy really ties a row to auth.uid() is proven by behaviour in
-- account_isolation_checks.sql; a policy `using (medication_id is not null)` passes every rule here.
--
-- How to run: `npm run db:check` (needs `npx supabase start`), or this file alone:
-- `node scripts/db-checks.mjs supabase/tests/schema_invariants_checks.sql`. The runner (scripts/db-checks.mjs)
-- pipes it into psql inside the local database container, forces ON_ERROR_STOP and passes it only when it prints
-- `GATE_COMPLETE schema_invariants_checks`. CI also runs it behind probes (scripts/db-checks/probes/) that break
-- the schema inside the transaction and must make a named invariant fail.
--
-- Everything runs as postgres in one transaction ended with rollback: nothing is left behind.

\set ON_ERROR_STOP on

begin;

-- ---------------------------------------------------------------------------
-- Account data tables: closure of foreign keys leading to auth.users.
-- The same predicate is copied in account_isolation_checks.sql; keep both copies identical, because a table that
-- drops out of one copy would drop out of the behaviour checks.
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

-- Shared, read-only tables shipped with the product. A new table goes here only by a deliberate decision:
-- a table with account data belongs in the closure (foreign key to auth.users or to an account table) instead.
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
    'symptom_search_terms'
  ]::name[])
$$;

-- ---------------------------------------------------------------------------
-- INVARIANT 1: every public table is account data or shared, never both; the shared list and the closure are real
-- ---------------------------------------------------------------------------

do $$
declare
  v_list text;
  v_count integer;
begin
  select count(*) into v_count from pg_temp.account_data_tables();
  if v_count = 0 then
    raise exception 'INVARIANT 1 FAILED: no public table is reachable by foreign keys from auth.users; the closure predicate is broken and every rule on account tables would pass on an empty set';
  end if;

  select string_agg(s.table_name, ', ' order by s.table_name) into v_list
  from pg_temp.shared_tables() s
  where not exists (
    select 1 from pg_class t
    where t.relnamespace = 'public'::regnamespace and t.relkind in ('r', 'p') and t.relname = s.table_name
  );
  if v_list is not null then
    raise exception 'INVARIANT 1 FAILED: shared list names tables that do not exist in public: %', v_list;
  end if;

  select string_agg(a.table_name, ', ' order by a.table_name) into v_list
  from pg_temp.account_data_tables() a
  join pg_temp.shared_tables() s on s.table_name = a.table_name;
  if v_list is not null then
    raise exception 'INVARIANT 1 FAILED: tables are both on the shared list and reachable by foreign keys from auth.users: %', v_list;
  end if;

  select string_agg(t.relname, ', ' order by t.relname) into v_list
  from pg_class t
  where t.relnamespace = 'public'::regnamespace
    and t.relkind in ('r', 'p')
    and t.relname not in (select a.table_name from pg_temp.account_data_tables() a)
    and t.relname not in (select s.table_name from pg_temp.shared_tables() s);
  if v_list is not null then
    raise exception 'INVARIANT 1 FAILED: tables are neither account data nor shared: %. A table with account data needs a foreign key to auth.users or to an account table (on delete cascade); a shared read-only table must be added deliberately to the shared list in this file and in account_isolation_checks.sql', v_list;
  end if;

  raise notice 'INVARIANT 1 OK: % account table(s) from the foreign key closure, % shared table(s), every public table classified once', v_count, (select count(*) from pg_temp.shared_tables());
end;
$$;

-- ---------------------------------------------------------------------------
-- INVARIANT 2: deleting the account deletes every account row
-- Only keys whose TARGET is the account or an account table count: medications -> registry_products (restrict)
-- points from account data to shared data and does not block deleting the account.
--   - A key to auth.users must cascade, otherwise the row outlives the account or blocks its deletion.
--   - Every account table must be reached from auth.users by cascading keys alone. A key between two account
--     tables may then be cascade, set null, no action or restrict: the row leaves by its own cascade path, and
--     whether deleting a parent (e.g. a medication added by mistake) takes its children along is a decision of the
--     migration, not of this gate. Measured 2026-09-29: no action, set null and restrict between two account tables
--     do not block `delete from auth.users`, in both orders of the cascade triggers.
--   - set default is rejected: it re-points a row to another parent, which rewrites history as much as changing a
--     value does.
--   - set null on a key guarded by a history trigger turns the cascade into an UPDATE the guard may block; that is
--     measured by behaviour (ISOLATION 6), not here.
-- ---------------------------------------------------------------------------

do $$
declare
  v_list text;
  v_count integer;
begin
  select string_agg(format('%s.%s -> %s (confdeltype %s)', t.relname, c.conname, c.confrelid::regclass, c.confdeltype), ', '
                    order by t.relname, c.conname),
         count(*)
    into v_list, v_count
  from pg_constraint c
  join pg_class t on t.oid = c.conrelid
  where c.contype = 'f'
    and t.relnamespace = 'public'::regnamespace
    and c.confrelid = 'auth.users'::regclass
    and c.confdeltype <> 'c';
  if v_list is not null then
    raise exception 'INVARIANT 2 FAILED: % foreign key(s) to auth.users are not on delete cascade, so deleting an account would leave rows behind or be blocked: %', v_count, v_list;
  end if;

  select string_agg(format('%s.%s -> %s', t.relname, c.conname, c.confrelid::regclass), ', '
                    order by t.relname, c.conname) into v_list
  from pg_constraint c
  join pg_class t on t.oid = c.conrelid
  where c.contype = 'f'
    and t.relnamespace = 'public'::regnamespace
    and c.confrelid in (select a.table_oid from pg_temp.account_data_tables() a)
    and c.confdeltype = 'd';
  if v_list is not null then
    raise exception 'INVARIANT 2 FAILED: foreign key(s) to an account table are on delete set default, which re-points rows to another parent: %', v_list;
  end if;

  with recursive cascade_walk (relid, path) as (
    select c.conrelid, array[c.conrelid]
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    where c.contype = 'f'
      and c.confrelid = 'auth.users'::regclass
      and c.confdeltype = 'c'
      and t.relnamespace = 'public'::regnamespace
      and t.relkind in ('r', 'p')
    union
    select c.conrelid, w.path || c.conrelid
    from cascade_walk w
    join pg_constraint c on c.contype = 'f' and c.confrelid = w.relid and c.confdeltype = 'c'
    join pg_class t on t.oid = c.conrelid
    where c.conrelid <> c.confrelid
      and not (c.conrelid = any (w.path))
      and t.relnamespace = 'public'::regnamespace
      and t.relkind in ('r', 'p')
  )
  select string_agg(a.table_name, ', ' order by a.table_name) into v_list
  from pg_temp.account_data_tables() a
  where a.table_oid not in (select w.relid from cascade_walk w);
  if v_list is not null then
    raise exception 'INVARIANT 2 FAILED: account tables not reached from auth.users by on delete cascade keys alone, so deleting an account would leave their rows behind or be blocked: %', v_list;
  end if;

  raise notice 'INVARIANT 2 OK: every key to auth.users cascades, all % account table(s) are reached by cascading keys alone, no key to an account table is set default',
    (select count(*) from pg_temp.account_data_tables());
end;
$$;

-- ---------------------------------------------------------------------------
-- INVARIANT 3: RLS enabled on every public table
-- ---------------------------------------------------------------------------

do $$
declare
  v_list text;
begin
  select string_agg(t.relname, ', ' order by t.relname) into v_list
  from pg_class t
  where t.relnamespace = 'public'::regnamespace
    and t.relkind in ('r', 'p')
    and not t.relrowsecurity;
  if v_list is not null then
    raise exception 'INVARIANT 3 FAILED: RLS is disabled on: %. Enable it in the same migration that creates the table', v_list;
  end if;

  raise notice 'INVARIANT 3 OK: RLS enabled on all % public table(s)',
    (select count(*) from pg_class t where t.relnamespace = 'public'::regnamespace and t.relkind in ('r', 'p'));
end;
$$;

-- ---------------------------------------------------------------------------
-- INVARIANT 4: account tables have a policy per command, only for authenticated, with a real expression
-- ---------------------------------------------------------------------------

do $$
declare
  v_list text;
begin
  select string_agg(format('%s (%s)', a.table_name, cmd.name), ', ' order by a.table_name, cmd.name) into v_list
  from pg_temp.account_data_tables() a
  cross join unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE']) as cmd(name)
  where not exists (
    select 1 from pg_policies p
    where p.schemaname = 'public' and p.tablename = a.table_name and p.cmd = cmd.name
  );
  if v_list is not null then
    raise exception 'INVARIANT 4 FAILED: account tables without a policy for a command: %', v_list;
  end if;

  -- A policy for public covers anon without naming it, and `for all` hides which command it was meant for.
  select string_agg(format('%s.%s (cmd %s, roles %s)', p.tablename, p.policyname, p.cmd, p.roles), ', '
                    order by p.tablename, p.policyname) into v_list
  from pg_policies p
  where p.schemaname = 'public'
    and p.tablename in (select a.table_name from pg_temp.account_data_tables() a)
    and (p.roles is distinct from array['authenticated']::name[] or p.cmd = 'ALL');
  if v_list is not null then
    raise exception 'INVARIANT 4 FAILED: account table policies must be for exactly {authenticated} and one command, not ALL: %', v_list;
  end if;

  select string_agg(format('%s.%s (cmd %s)', p.tablename, p.policyname, p.cmd), ', '
                    order by p.tablename, p.policyname) into v_list
  from pg_policies p
  where p.schemaname = 'public'
    and p.tablename in (select a.table_name from pg_temp.account_data_tables() a)
    and ((p.cmd in ('SELECT', 'UPDATE', 'DELETE') and p.qual is null)
         or (p.cmd in ('INSERT', 'UPDATE') and p.with_check is null));
  if v_list is not null then
    raise exception 'INVARIANT 4 FAILED: account table policies without an expression (using for SELECT/UPDATE/DELETE, with check for INSERT/UPDATE): %', v_list;
  end if;

  select string_agg(format('%s.%s (cmd %s)', p.tablename, p.policyname, p.cmd), ', '
                    order by p.tablename, p.policyname) into v_list
  from pg_policies p
  where p.schemaname = 'public'
    and p.tablename in (select a.table_name from pg_temp.account_data_tables() a)
    and (lower(btrim(p.qual)) in ('true', '(true)') or lower(btrim(p.with_check)) in ('true', '(true)'));
  if v_list is not null then
    raise exception 'INVARIANT 4 FAILED: account table policies with an expression that is literally true, which opens every row to every account: %', v_list;
  end if;

  raise notice 'INVARIANT 4 OK: every account table has SELECT, INSERT, UPDATE and DELETE policies, each only for authenticated, with a non-trivial expression (% policies)',
    (select count(*) from pg_policies p
     where p.schemaname = 'public' and p.tablename in (select a.table_name from pg_temp.account_data_tables() a));
end;
$$;

-- ---------------------------------------------------------------------------
-- INVARIANT 5: shared tables are read-only for anon and authenticated
-- ---------------------------------------------------------------------------

do $$
declare
  v_list text;
begin
  select string_agg(format('%s.%s (cmd %s)', p.tablename, p.policyname, p.cmd), ', '
                    order by p.tablename, p.policyname) into v_list
  from pg_policies p
  where p.schemaname = 'public'
    and p.tablename in (select s.table_name from pg_temp.shared_tables() s)
    and p.cmd <> 'SELECT';
  if v_list is not null then
    raise exception 'INVARIANT 5 FAILED: shared tables have policies other than SELECT: %', v_list;
  end if;

  select string_agg(format('%s: %s %s', s.table_name, r.role_name, priv.name), ', '
                    order by s.table_name, r.role_name, priv.name) into v_list
  from pg_temp.shared_tables() s
  cross join unnest(array['anon', 'authenticated']) as r(role_name)
  cross join unnest(array['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE']) as priv(name)
  where has_table_privilege(r.role_name, format('public.%I', s.table_name), priv.name);
  if v_list is not null then
    raise exception 'INVARIANT 5 FAILED: write privileges on shared tables (revoke insert, update, delete, truncate ... from anon, authenticated): %', v_list;
  end if;

  raise notice 'INVARIANT 5 OK: shared tables have SELECT policies only and no INSERT, UPDATE, DELETE or TRUNCATE for anon and authenticated';
end;
$$;

-- ---------------------------------------------------------------------------
-- INVARIANT 6: no TRUNCATE for anon and authenticated on any public table (TRUNCATE bypasses RLS and row triggers)
-- ---------------------------------------------------------------------------

do $$
declare
  v_list text;
begin
  select string_agg(format('%s: %s', t.relname, r.role_name), ', ' order by t.relname, r.role_name) into v_list
  from pg_class t
  cross join unnest(array['anon', 'authenticated']) as r(role_name)
  where t.relnamespace = 'public'::regnamespace
    and t.relkind in ('r', 'p')
    and has_table_privilege(r.role_name, t.oid, 'TRUNCATE');
  if v_list is not null then
    raise exception 'INVARIANT 6 FAILED: TRUNCATE granted (revoke truncate ... from anon, authenticated in the migration that creates the table): %', v_list;
  end if;

  raise notice 'INVARIANT 6 OK: anon and authenticated have no TRUNCATE on any public table';
end;
$$;

-- ---------------------------------------------------------------------------
-- INVARIANT 7: anon and authenticated cannot execute security definer functions in public (trigger functions cannot
-- be called directly). A security definer function runs with its owner's privileges, past RLS: callable by a
-- signed-in account it answers about any account's rows unless it checks the owner itself. The history guards call
-- medication_correction_window_open, dosage_period_correction_window_open and symptom_entry_correction_window_open
-- (S-05) as their own definer and need no
-- EXECUTE for the caller. A function that must
-- be callable from the browser checks auth.uid() and gets a deliberate exception here.
-- Every security definer function, trigger functions included, sets search_path: without it an object created
-- earlier on the caller's path (a table or operator of the same name) is resolved in place of the intended one and
-- runs with the owner's privileges.
-- ---------------------------------------------------------------------------

do $$
declare
  v_list text;
  v_count integer;
begin
  select count(*) into v_count
  from pg_proc p
  where p.pronamespace = 'public'::regnamespace
    and p.prosecdef
    and p.prorettype <> 'trigger'::regtype;
  if v_count = 0 then
    raise exception 'INVARIANT 7 FAILED: no security definer function in public found; expected at least medication_correction_window_open, so the rule would pass on an empty set';
  end if;

  -- The window functions answer about any account's rows by id, so they must stay in the set this rule measures.
  select string_agg(f.signature, ', ' order by f.signature) into v_list
  from unnest(array[
    'public.medication_correction_window_open(uuid)',
    'public.dosage_period_correction_window_open(uuid)',
    'public.symptom_entry_correction_window_open(uuid)'
  ]) as f(signature)
  where not exists (
    select 1 from pg_proc p where p.oid = to_regprocedure(f.signature) and p.prosecdef
  );
  if v_list is not null then
    raise exception 'INVARIANT 7 FAILED: correction window functions missing or not security definer, so this rule would not measure them: %', v_list;
  end if;

  select string_agg(p.oid::regprocedure::text, ', ' order by p.oid::regprocedure::text) into v_list
  from pg_proc p
  where p.pronamespace = 'public'::regnamespace
    and p.prosecdef
    and p.prorettype <> 'trigger'::regtype
    and (has_function_privilege('anon', p.oid, 'EXECUTE') or has_function_privilege('authenticated', p.oid, 'EXECUTE'));
  if v_list is not null then
    raise exception 'INVARIANT 7 FAILED: anon or authenticated can execute security definer functions (revoke execute ... from anon, authenticated; revoke from public alone does not remove the Supabase default grants): %', v_list;
  end if;

  select string_agg(p.oid::regprocedure::text, ', ' order by p.oid::regprocedure::text) into v_list
  from pg_proc p
  where p.pronamespace = 'public'::regnamespace
    and p.prosecdef
    and not exists (select 1 from unnest(p.proconfig) as cfg(setting) where cfg.setting like 'search_path=%');
  if v_list is not null then
    raise exception 'INVARIANT 7 FAILED: security definer functions without a pinned search_path (add set search_path = '''' and schema-qualify every name): %', v_list;
  end if;

  raise notice 'INVARIANT 7 OK: anon and authenticated cannot execute any of % security definer function(s) in public, and all % security definer function(s) pin search_path', v_count,
    (select count(*) from pg_proc p where p.pronamespace = 'public'::regnamespace and p.prosecdef);
end;
$$;

-- ---------------------------------------------------------------------------
-- INVARIANT 8: history guard triggers exist, are enabled and fire BEFORE the listed event for each row
-- A guard does not follow from the structure of the database, so this list is hand-written by choice: a guard
-- added in S-02 or S-05 means a new entry here.
-- tgtype bits: 1 = for each row, 2 = before, 4 = insert, 8 = delete, 16 = update, 32 = truncate.
-- ---------------------------------------------------------------------------

do $$
declare
  v_guard record;
  v_trigger record;
  v_expected_event integer;
  v_guard_count integer := 0;
begin
  for v_guard in
    select * from (values
      ('medications', 'medications_guard_delete', 'DELETE'),
      ('medications', 'medications_guard_core', 'UPDATE'),
      ('medication_substances', 'medication_substances_guard_core', 'UPDATE'),
      ('medication_substances', 'medication_substances_guard_delete', 'DELETE'),
      ('dosage_periods', 'dosage_periods_guard_core', 'UPDATE'),
      ('dosage_periods', 'dosage_periods_guard_delete', 'DELETE'),
      ('dosage_periods', 'dosage_periods_guard_variant', 'INSERT OR UPDATE'),
      -- S-05: the moment of saving opens the correction window, so it is set by the database and frozen.
      ('medications', 'medications_freeze_created_at', 'INSERT OR UPDATE'),
      ('dosage_periods', 'dosage_periods_freeze_created_at', 'INSERT OR UPDATE'),
      -- S-05: inserts follow the correction window too (whole write path).
      ('medication_substances', 'medication_substances_guard_insert', 'INSERT'),
      ('dosage_periods', 'dosage_periods_guard_insert', 'INSERT'),
      -- S-05 phase 2: the symptom journal — the entry and its symptoms on the whole write path, the frozen moment of
      -- saving and the date bounds (SE002, SE003).
      ('symptom_entries', 'symptom_entries_freeze_created_at', 'INSERT OR UPDATE'),
      ('symptom_entries', 'symptom_entries_guard_core', 'UPDATE'),
      ('symptom_entries', 'symptom_entries_guard_delete', 'DELETE'),
      ('symptom_entries', 'symptom_entries_guard_occurred_at', 'INSERT OR UPDATE'),
      ('symptom_entry_items', 'symptom_entry_items_guard_insert', 'INSERT'),
      ('symptom_entry_items', 'symptom_entry_items_guard_core', 'UPDATE'),
      ('symptom_entry_items', 'symptom_entry_items_guard_delete', 'DELETE')
    ) as g(table_name, trigger_name, event)
  loop
    v_expected_event := case v_guard.event when 'INSERT' then 4 when 'DELETE' then 8 when 'UPDATE' then 16 when 'INSERT OR UPDATE' then 20 end;

    select tg.tgenabled, tg.tgtype::integer as tgtype into v_trigger
    from pg_trigger tg
    where tg.tgrelid = to_regclass(format('public.%I', v_guard.table_name))
      and tg.tgname = v_guard.trigger_name
      and not tg.tgisinternal;
    if not found then
      raise exception 'INVARIANT 8 FAILED: history guard % on % is missing', v_guard.trigger_name, v_guard.table_name;
    end if;
    if v_trigger.tgenabled <> 'O' then
      raise exception 'INVARIANT 8 FAILED: history guard % on % is not enabled (tgenabled %)', v_guard.trigger_name, v_guard.table_name, v_trigger.tgenabled;
    end if;
    if v_trigger.tgtype & 3 <> 3 then
      raise exception 'INVARIANT 8 FAILED: history guard % on % is not BEFORE ... FOR EACH ROW (tgtype %)', v_guard.trigger_name, v_guard.table_name, v_trigger.tgtype;
    end if;
    if v_trigger.tgtype & 60 <> v_expected_event then
      raise exception 'INVARIANT 8 FAILED: history guard % on % does not fire on exactly % (tgtype %)', v_guard.trigger_name, v_guard.table_name, v_guard.event, v_trigger.tgtype;
    end if;
    v_guard_count := v_guard_count + 1;
  end loop;

  raise notice 'INVARIANT 8 OK: % history guards exist, are enabled and fire BEFORE their event for each row', v_guard_count;
end;
$$;

-- ---------------------------------------------------------------------------
-- INVARIANT 9: views do not bypass RLS for anon and authenticated
-- A view without security_invoker reads its tables with the privileges of its owner (postgres), so RLS on the
-- account tables does not apply, and the Supabase default privileges in public give anon and authenticated every
-- privilege on a new view. One `create view ... as select * from medications` would expose every account's rows
-- through PostgREST. A materialized view cannot be security_invoker, so for it only the second branch holds.
-- ---------------------------------------------------------------------------

do $$
declare
  v_list text;
begin
  select string_agg(format('%s (relkind %s): %s %s', t.relname, t.relkind, r.role_name, priv.name), ', '
                    order by t.relname, r.role_name, priv.name) into v_list
  from pg_class t
  cross join unnest(array['anon', 'authenticated']) as r(role_name)
  cross join unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE']) as priv(name)
  where t.relnamespace = 'public'::regnamespace
    and t.relkind in ('v', 'm')
    and not (t.relkind = 'v' and exists (
      select 1 from pg_options_to_table(t.reloptions) o
      where o.option_name = 'security_invoker' and lower(o.option_value) in ('true', 'on', 'yes', '1')
    ))
    and has_table_privilege(r.role_name, t.oid, priv.name);
  if v_list is not null then
    raise exception 'INVARIANT 9 FAILED: views readable by anon or authenticated bypass RLS (create view ... with (security_invoker = true), or revoke all ... from anon, authenticated): %', v_list;
  end if;

  raise notice 'INVARIANT 9 OK: all % view(s) in public are security_invoker or closed to anon and authenticated',
    (select count(*) from pg_class t where t.relnamespace = 'public'::regnamespace and t.relkind in ('v', 'm'));
end;
$$;

-- Completion marker for scripts/db-checks.mjs: printed only after every check above has passed.
do $$
begin
  if current_user <> 'postgres' then
    raise exception 'FINAL CHECK FAILED: file ends as % instead of postgres, a role was not reset', current_user;
  end if;
  raise notice 'GATE_COMPLETE schema_invariants_checks';
end;
$$;

rollback;
