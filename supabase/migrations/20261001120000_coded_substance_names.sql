-- Substance names for the leaflet form (S-02, review F8).
--
-- Example: Anna adds a medication from its leaflet and starts typing "dicl". The form suggests "diclofenacum" from a
-- list of every dictionary name that has an ATC code (about 100 names, measured 2026-10-01).
--
-- Before, the page read all registry_substances rows with a code (about 4200) in pages of 1000, one after another,
-- on every display, only to collect those 100 distinct names. This function returns them in one call.
--
-- One array value instead of a set of rows: PostgREST caps every response at max_rows, so a row set could silently
-- drop names once the dictionary grows; a single value is never cut.
--
-- Access: only a signed-in person (EXECUTE for authenticated only). security invoker: the caller's rights and RLS
-- on the dictionary apply as for a direct read.

create or replace function public.coded_substance_names()
returns text[]
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(array_agg(distinct rs.normalized_name order by rs.normalized_name), '{}')
    from public.registry_substances rs
   where rs.atc_code is not null;
$$;

comment on function public.coded_substance_names() is
  'Distinct registry_substances.normalized_name values that have an ATC code, alphabetically, as one array (e.g. {..., diclofenacum, ..., ibuprofenum, ...}). Used for the substance suggestions in the leaflet form. One array instead of rows, so the PostgREST max_rows cap can never drop names. Empty array when the dictionary has no coded rows.';

-- The Supabase default privileges grant anon and authenticated EXECUTE on every new function in public; revoking
-- from public alone would not remove those direct grants.
revoke execute on function public.coded_substance_names() from public, anon;
grant execute on function public.coded_substance_names() to authenticated;
