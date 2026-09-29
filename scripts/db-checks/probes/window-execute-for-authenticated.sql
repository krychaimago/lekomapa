-- Schema probe: EXECUTE on a security definer function for authenticated must fail INVARIANT 7 of
-- supabase/tests/schema_invariants_checks.sql: a signed-in account could ask about another account's medication.
-- Run only through the composer, which puts `begin;` in front of this DDL so the check file's `rollback;` removes it:
--   node scripts/db-checks.mjs --probe scripts/db-checks/probes/window-execute-for-authenticated.sql supabase/tests/schema_invariants_checks.sql
-- Run on its own, the grant would be committed and every later `npm run db:check` would fail on it.

grant execute on function public.medication_correction_window_open(uuid) to authenticated;
