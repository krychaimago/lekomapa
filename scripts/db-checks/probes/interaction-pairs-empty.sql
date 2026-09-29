-- Schema probe: an empty interaction_pairs table must fail LANGUAGE 1 of supabase/tests/fr012_language_checks.sql.
-- Without it, LANGUAGE 2 would pass on zero rows and the gate could not tell "no description lacks the phrase"
-- from "there is nothing to check".
-- Run only through the composer, which puts `begin;` in front of this statement so the check file's `rollback;`
-- removes it:
--   node scripts/db-checks.mjs --probe scripts/db-checks/probes/interaction-pairs-empty.sql supabase/tests/fr012_language_checks.sql
-- Run on its own, the table would stay empty and every later `npm run db:check` would fail on it.

delete from public.interaction_pairs;
