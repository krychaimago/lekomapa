-- Schema probe: a table with a user_id column but no foreign key to the account must fail INVARIANT 1 of
-- supabase/tests/schema_invariants_checks.sql: it is neither in the foreign key closure nor on the shared list, so
-- without this rule it would silently drop out of every account check.
-- Run only through the composer, which puts `begin;` in front of this DDL so the check file's `rollback;` removes it:
--   node scripts/db-checks.mjs --probe scripts/db-checks/probes/unclassified-table.sql supabase/tests/schema_invariants_checks.sql
-- Run on its own, the table would be committed and every later `npm run db:check` would fail on it.

create table public.probe_unclassified (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null
);

alter table public.probe_unclassified enable row level security;
