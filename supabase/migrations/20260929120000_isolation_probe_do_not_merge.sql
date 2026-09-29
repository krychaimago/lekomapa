-- PROBE for testing-sql-gate-in-ci 3.4. DO NOT MERGE, DO NOT PUSH TO ANY DATABASE.
create policy zz_isolation_probe on public.medications
  for select to authenticated using (true);
