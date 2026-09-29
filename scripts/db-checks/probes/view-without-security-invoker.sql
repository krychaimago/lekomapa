-- Schema probe: a view over an account table without security_invoker must fail INVARIANT 9 of
-- supabase/tests/schema_invariants_checks.sql. Run only through the composer, which puts `begin;` in front of this
-- DDL so the check file's `rollback;` removes it:
--   node scripts/db-checks.mjs --probe scripts/db-checks/probes/view-without-security-invoker.sql supabase/tests/schema_invariants_checks.sql
-- Run on its own, the view would be committed and every later `npm run db:check` would fail on it.
-- The Supabase default privileges give anon and authenticated SELECT on the new view, so INVARIANT 1-8 pass and
-- the first failing rule is the view reading medications past RLS.

create view public.probe_leak as select * from public.medications;
