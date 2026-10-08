-- Schema probe: an append-only account table whose owner can change her own rows must fail ISOLATION 3 of
-- supabase/tests/account_isolation_checks.sql. Proves that the reversed owner counterexample for append-only tables
-- can turn red, instead of passing because nothing was measured.
-- Run only through the composer, which puts `begin;` in front of this DDL so the check file's `rollback;` removes it:
--   node scripts/db-checks.mjs --probe scripts/db-checks/probes/append-only-table-owner-update.sql supabase/tests/account_isolation_checks.sql
-- Run on its own, the change would be committed and every later `npm run db:check` would fail on it.
-- Both layers go: a permissive UPDATE policy for the owner (policies are OR-ed, so `using (false)` no longer blocks)
-- and the history guard, which would otherwise refuse the update with P0001 and stop the file for another reason.

drop trigger terms_acceptances_guard on public.terms_acceptances;

create policy probe_terms_acceptances_update_owner on public.terms_acceptances
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
