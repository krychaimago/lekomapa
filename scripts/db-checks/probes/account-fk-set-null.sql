-- Schema probe: a key to the account with `on delete set null` must fail INVARIANT 2 of
-- supabase/tests/schema_invariants_checks.sql: deleting the account would leave the rows behind.
-- Run only through the composer, which puts `begin;` in front of this DDL so the check file's `rollback;` removes it:
--   node scripts/db-checks.mjs --probe scripts/db-checks/probes/account-fk-set-null.sql supabase/tests/schema_invariants_checks.sql
-- Run on its own, the table would be committed and every later `npm run db:check` would fail on it.
-- The table is otherwise complete (RLS, four policies for authenticated, no TRUNCATE), so the only broken rule is
-- the delete action of its key.

create table public.probe_account_fk_set_null (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete set null
);

alter table public.probe_account_fk_set_null enable row level security;

create policy probe_account_fk_set_null_select on public.probe_account_fk_set_null
  for select to authenticated using (user_id = auth.uid());
create policy probe_account_fk_set_null_insert on public.probe_account_fk_set_null
  for insert to authenticated with check (user_id = auth.uid());
create policy probe_account_fk_set_null_update on public.probe_account_fk_set_null
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy probe_account_fk_set_null_delete on public.probe_account_fk_set_null
  for delete to authenticated using (user_id = auth.uid());

revoke truncate on public.probe_account_fk_set_null from anon, authenticated;
