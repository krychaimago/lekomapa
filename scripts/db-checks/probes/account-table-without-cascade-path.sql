-- Schema probe: an account table reached from auth.users only through a `no action` key must fail INVARIANT 2 of
-- supabase/tests/schema_invariants_checks.sql: no cascading path deletes its rows with the account.
-- Run only through the composer, which puts `begin;` in front of this DDL so the check file's `rollback;` removes it:
--   node scripts/db-checks.mjs --probe scripts/db-checks/probes/account-table-without-cascade-path.sql supabase/tests/schema_invariants_checks.sql
-- Run on its own, the table would be committed and every later `npm run db:check` would fail on it.
-- The table is otherwise complete (RLS, four policies for authenticated, no TRUNCATE) and its key to medications
-- puts it in the closure, so the only broken rule is the missing cascade path.

create table public.probe_account_without_cascade_path (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  medication_id uuid not null references public.medications (id) on delete no action
);

alter table public.probe_account_without_cascade_path enable row level security;

create policy probe_account_without_cascade_path_select on public.probe_account_without_cascade_path
  for select to authenticated using (user_id = auth.uid());
create policy probe_account_without_cascade_path_insert on public.probe_account_without_cascade_path
  for insert to authenticated with check (user_id = auth.uid());
create policy probe_account_without_cascade_path_update on public.probe_account_without_cascade_path
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy probe_account_without_cascade_path_delete on public.probe_account_without_cascade_path
  for delete to authenticated using (user_id = auth.uid());

revoke truncate on public.probe_account_without_cascade_path from anon, authenticated;
