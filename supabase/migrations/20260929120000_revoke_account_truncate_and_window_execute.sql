-- Migration: close two privilege gaps on the account data schema (F-01), measured in the local database.
--
-- 1. TRUNCATE on the account tables. The default Supabase privileges grant anon and authenticated every table
--    privilege on a new table in public, TRUNCATE included. TRUNCATE is not subject to RLS and does not fire
--    the `for each row` history guards, so it would empty the tables of every account at once, past both the
--    per-account isolation and the correction window. PostgREST does not expose TRUNCATE, but any SQL running
--    as authenticated (a security invoker function, a future RPC) could. The shared tables already have it
--    revoked (20260924120000_registry_schema.sql, 20260926120000_symptom_catalog_schema.sql); this aligns the
--    account tables with that pattern. Only TRUNCATE is revoked: revoking SELECT/INSERT/UPDATE/DELETE from anon
--    would turn the empty PostgREST result under RLS into a permission error, which the smoke steps rely on.
--
-- 2. EXECUTE on public.medication_correction_window_open(uuid) for anon and authenticated. The medication schema
--    migration revoked it from public (20260922120000_medication_schema.sql), but that does not remove the direct
--    grants the default Supabase privileges give anon and authenticated on every new function in public: the
--    measured proacl was {postgres=X, anon=X, authenticated=X, service_role=X}. The function is security definer
--    and takes any medication id without checking its owner; once S-05 makes it read symptom diary entries, any
--    caller of /rpc/medication_correction_window_open, a signed-in account included, would learn whether entries
--    exist for another account's medication. The same migration granted it to authenticated explicitly; that
--    grant is withdrawn here. The history guards are security definer too and call the function as its owner,
--    so they do not need EXECUTE for the caller. If S-05 needs the window state in the browser, it adds an RPC
--    that checks auth.uid() against medications.user_id.
--
-- No policy, data or function body changes. `create or replace function` in S-05 keeps these privileges; a
-- `drop function` + `create` would restore the default grants, which supabase/tests/schema_invariants_checks.sql
-- catches.

revoke truncate on public.medications, public.medication_substances, public.dosage_periods from anon, authenticated;

revoke execute on function public.medication_correction_window_open(uuid) from anon, authenticated;
