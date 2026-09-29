-- Probe: proves the SQL gate turns red when a file finishes without its completion marker.
-- Run by CI with an inverted result: the step fails if `node scripts/db-checks.mjs` exits with 0 on this file.
-- The SQL is valid and psql exits with 0; only the missing `GATE_COMPLETE missing-marker` notice fails it.

begin;

do $$
begin
  raise notice 'PROBE: valid SQL, no completion marker';
end;
$$;

rollback;
