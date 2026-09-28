-- Probe: proves the SQL gate turns red when a check fails.
-- Run by CI with an inverted result: the step fails if `node scripts/db-checks.mjs` exits with 0 on this file.
-- There is deliberately no `\set ON_ERROR_STOP on` here: the runner must enforce it from the command line.
-- Without it psql would go on to the completion marker below and exit with 0.

begin;

do $$
begin
  raise exception 'PROBE FAILED: deliberate failure';
end;
$$;

do $$
begin
  raise notice 'GATE_COMPLETE failing-check';
end;
$$;

rollback;
