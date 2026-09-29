-- Schema probe: an account table without RLS must fail INVARIANT 3 of supabase/tests/schema_invariants_checks.sql.
-- Run only through the composer, which puts `begin;` in front of this DDL so the check file's `rollback;` removes it:
--   node scripts/db-checks.mjs --probe scripts/db-checks/probes/account-table-without-rls.sql supabase/tests/schema_invariants_checks.sql
-- Run on its own, the table would be committed and every later `npm run db:check` would fail on it.
-- The table is in the foreign key closure through a cascading key to auth.users, so INVARIANT 1 and 2 pass and
-- the first failing rule is the missing RLS.

create table public.probe_account_without_rls (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade
);
