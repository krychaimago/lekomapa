-- Symptom timeline (S-09, FR-013): one row per symptom of the signed-in person with the dates and severities of all
-- the entries that logged it. The timeline page (/wizyta/os-czasu) places these entries as marks under the dosage
-- periods of the medications; a day mark shows the strongest severity of that day.
--
-- Why a function and not a plain PostgREST select: reading every symptom_entry_items row is cut at max_rows = 1000
-- (supabase/config.toml), and the cut would silently drop entries from the timeline. Aggregated per symptom, the
-- result has at most one row per catalog symptom (same reasoning as symptom_occurrences()).
--
-- Two parallel arrays: occurred_at[i] and severities[i] describe the same entry item. Both array_agg calls use the
-- same order (occurred_at, then entry id as a tie-breaker), so the pairing holds also for two entries at the same
-- instant. A symptom logged without severity has null at its position.
--
-- No new table: RLS of symptom_entries and symptom_entry_items applies to the caller (security invoker).
-- Checks: supabase/tests/symptom_timeline_checks.sql.

create or replace function public.symptom_timeline()
returns table (
  symptom_id uuid,
  symptom_name text,
  occurred_at timestamptz[],
  severities text[]
)
language sql
stable
security invoker
set search_path = ''
as $$
  select s.id,
         s.name,
         array_agg(e.occurred_at order by e.occurred_at, e.id),
         array_agg(i.severity order by e.occurred_at, e.id)
    from public.symptom_entries e
    join public.symptom_entry_items i on i.entry_id = e.id
    join public.symptoms s on s.id = i.symptom_id
   -- RLS already limits rows to the caller; the explicit filter keeps the result per account also for a role that
   -- bypasses RLS.
   where e.user_id = (select auth.uid())
   group by s.id, s.name;
$$;

comment on function public.symptom_timeline() is
  'Lists each symptom the signed-in person has logged, with the dates and severities of all entries that logged it, oldest first, as two parallel arrays. Example: nausea logged on 2026-10-01 (moderate) and 2026-10-03 (no severity), headache on 2026-10-05 (severe) — two rows: nausea with occurred_at {2026-10-01, 2026-10-03} and severities {moderate, null}, headache with {2026-10-05} and {severe}. A symptom without any entry does not appear. Only the caller''s own entries are read. The dates only place symptoms on the timeline next to medications: the timeline shows dates, not relations, and never states a cause (FR-012).';

-- The Supabase default privileges grant anon and authenticated EXECUTE on every new function in public; revoking
-- from public alone would not remove those direct grants.
revoke execute on function public.symptom_timeline() from public, anon;
grant execute on function public.symptom_timeline() to authenticated;
