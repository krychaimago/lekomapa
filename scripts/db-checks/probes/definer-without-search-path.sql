-- Schema probe: a security definer function without `set search_path` must fail INVARIANT 7 of
-- supabase/tests/schema_invariants_checks.sql. Run only through the composer, which puts `begin;` in front of this
-- DDL so the check file's `rollback;` removes it:
--   node scripts/db-checks.mjs --probe scripts/db-checks/probes/definer-without-search-path.sql supabase/tests/schema_invariants_checks.sql
-- Run on its own, the function would be committed and every later `npm run db:check` would fail on it.
-- A trigger function cannot be called directly, so the EXECUTE part of INVARIANT 7 skips it and the only broken
-- rule is the missing search_path.

create function public.probe_definer_without_search_path()
returns trigger
language plpgsql
security definer
as $$
begin
  return new;
end;
$$;
