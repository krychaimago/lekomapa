-- Migration: production-observability phase 3 — a query that reaches Postgres as anon without reading any table.
--
-- What this migration makes possible, in plain terms, with an example.
-- Technical names are in brackets, for whoever needs to find them in the code below.
--
-- A. HEALTH PING (health_ping)
--
--    Example: on 2026-10-13 at 08:00 the uptime monitor opens /api/health without any session. The route calls this
--    function with the public key, Postgres answers 1, and the route answers {"status":"ok"}. When the database is
--    down or paused, the call fails and the route answers 503. The same request is the traffic that keeps the
--    Supabase project from being paused for inactivity.
--      - The function returns the constant 1 and reads no table. The symptom catalog and the registry deliberately
--        have no policy for anon (roadmap F-06, Unknowns), so a "select from a small table" ping is not an option.
--      - security invoker: it runs with the caller's privileges and needs none beyond EXECUTE, so INVARIANT 7 in
--        supabase/tests/schema_invariants_checks.sql (security definer functions) does not apply to it.
--
-- No new table, so no RLS policy is needed here. supabase/tests/health_ping_checks.sql proves that anon gets 1, that
-- the function is not security definer and that it depends on no relation.

create function public.health_ping()
returns integer
language sql
stable
security invoker
set search_path = ''
as $$
  select 1;
$$;

comment on function public.health_ping() is
  'Returns the constant 1 without reading any table. Called by GET /api/health with the public key and no session, so the uptime monitor can tell that the database answers. Example: the monitor opens /api/health on 2026-10-13 at 08:00, the function returns 1 and the route answers 200 {"status":"ok"}; when the call fails the route answers 503 {"status":"unavailable"}. security invoker, reads nothing, EXECUTE for anon and authenticated.';

-- Revoking from public alone would not remove the direct grants the Supabase default privileges give anon and
-- authenticated on every new function in public (measured in 20260929120000_revoke_account_truncate_and_window_execute.sql),
-- so the grants below are the deliberate ones, not leftovers.
revoke execute on function public.health_ping() from public;
grant execute on function public.health_ping() to anon, authenticated;
