-- Schema probe: TRUNCATE on an account table for anon must fail INVARIANT 6 of
-- supabase/tests/schema_invariants_checks.sql: TRUNCATE bypasses RLS and the history guards.
-- Run only through the composer, which puts `begin;` in front of this DDL so the check file's `rollback;` removes it:
--   node scripts/db-checks.mjs --probe scripts/db-checks/probes/account-table-truncate-for-anon.sql supabase/tests/schema_invariants_checks.sql
-- Run on its own, the grant would be committed and every later `npm run db:check` would fail on it.

grant truncate on public.medications to anon;
