-- Schema probe: an account table with a correct structure but no test data must fail ISOLATION 0 of
-- supabase/tests/account_isolation_checks.sql: without a row in the fixture map its behaviour would never be tested.
-- Run only through the composer, which puts `begin;` in front of this DDL so the check file's `rollback;` removes it:
--   node scripts/db-checks.mjs --probe scripts/db-checks/probes/account-table-without-fixture.sql supabase/tests/account_isolation_checks.sql
-- Run on its own, the table would be committed and every later `npm run db:check` would fail on it.
-- The table is otherwise complete (cascading key to auth.users, RLS, four policies for authenticated, no TRUNCATE),
-- so it passes every rule of schema_invariants_checks.sql and the only thing missing is its test data.

create table public.probe_account_without_fixture (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade
);

alter table public.probe_account_without_fixture enable row level security;

create policy probe_account_without_fixture_select on public.probe_account_without_fixture
  for select to authenticated using (user_id = auth.uid());
create policy probe_account_without_fixture_insert on public.probe_account_without_fixture
  for insert to authenticated with check (user_id = auth.uid());
create policy probe_account_without_fixture_update on public.probe_account_without_fixture
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy probe_account_without_fixture_delete on public.probe_account_without_fixture
  for delete to authenticated using (user_id = auth.uid());

revoke truncate on public.probe_account_without_fixture from anon, authenticated;
