-- Schema probe: without the trigger dosage_periods_guard_variant, a direct insert into dosage_periods with a variant
-- of another product must fail DOSAGE 14 of supabase/tests/dosage_change_checks.sql (impl-review F1 of S-03).
-- Run only through the composer, which puts `begin;` in front of this DDL so the check file's `rollback;` removes it:
--   node scripts/db-checks.mjs --probe scripts/db-checks/probes/dosage-period-without-variant-guard.sql supabase/tests/dosage_change_checks.sql
-- Run on its own, the drop would be committed and the variant rule would hold only inside change_dosage again.

drop trigger dosage_periods_guard_variant on public.dosage_periods;
