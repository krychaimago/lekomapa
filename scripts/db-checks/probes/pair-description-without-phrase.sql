-- Schema probe: a pair description without the FR-012 phrase must fail LANGUAGE 2 of
-- supabase/tests/fr012_language_checks.sql.
-- Run only through the composer, which puts `begin;` in front of this statement so the check file's `rollback;`
-- removes it:
--   node scripts/db-checks.mjs --probe scripts/db-checks/probes/pair-description-without-phrase.sql supabase/tests/fr012_language_checks.sql
-- Run on its own, the changed description would be committed and every later `npm run db:check` would fail on it.
-- Only one row changes, so LANGUAGE 1 passes and the first failing rule is the missing phrase.

update public.interaction_pairs
set description = 'Połączenie wywoła krwawienie.'
where id = (select id from public.interaction_pairs order by group_a, group_b limit 1);
