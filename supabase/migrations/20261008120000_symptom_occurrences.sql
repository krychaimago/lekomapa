-- Symptom occurrences (S-08): one row per symptom of the signed-in person with the complete set of dates of the
-- entries that logged it. The "Do omówienia z lekarzem" section composes one doctor question per symptom from these
-- dates (composeDoctorQuestion in src/lib/services/doctor-question.ts needs every date: the first one opens the
-- window, the count goes into the summary).
--
-- Why a function and not a plain PostgREST select: reading every symptom_entry_items row is cut at max_rows = 1000
-- (supabase/config.toml), and the cut could drop the oldest entry, which sets the start of the window. Aggregated per
-- symptom, the result has at most one row per catalog symptom.
--
-- No new table: RLS of symptom_entries and symptom_entry_items applies to the caller (security invoker).
-- Checks: supabase/tests/symptom_occurrences_checks.sql.

create or replace function public.symptom_occurrences()
returns table (
  symptom_id uuid,
  symptom_name text,
  occurrences timestamptz[]
)
language sql
stable
security invoker
set search_path = ''
as $$
  select s.id,
         s.name,
         array_agg(e.occurred_at order by e.occurred_at)
    from public.symptom_entries e
    join public.symptom_entry_items i on i.entry_id = e.id
    join public.symptoms s on s.id = i.symptom_id
   -- RLS already limits rows to the caller; the explicit filter keeps the result per account also for a role that
   -- bypasses RLS.
   where e.user_id = (select auth.uid())
   group by s.id, s.name;
$$;

comment on function public.symptom_occurrences() is
  'Lists each symptom the signed-in person has logged, with the dates of all entries that logged it, oldest first. Example: nausea logged on 2026-10-01, 2026-10-03 and 2026-10-07, headache on 2026-10-05 — two rows: nausea with three dates, headache with one. A symptom without any entry does not appear. Only the caller''s own entries are read. The dates only place symptoms on the timeline next to medications: the wording shown is "may be related", never a cause (FR-012).';

-- The Supabase default privileges grant anon and authenticated EXECUTE on every new function in public; revoking
-- from public alone would not remove those direct grants.
revoke execute on function public.symptom_occurrences() from public, anon;
grant execute on function public.symptom_occurrences() to authenticated;
