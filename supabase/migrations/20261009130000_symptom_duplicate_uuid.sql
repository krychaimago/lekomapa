-- Migration: SE004 compares symptom ids as uuid, not as text (impl-review of S-07, finding F2).
--
-- Example: a request with the same symptom twice, once as "3f2a...c9" and once as "3F2A...C9", passed SE004 because
-- the two texts differ. add_symptom_entry then failed on the unique key of symptom_entry_items (an unnamed 23505,
-- shown as an unknown error), and correct_symptom_entry silently kept one of the two severities. The form never
-- sends this; a hand-made request could, and only on the caller's own entries.
--
-- The fix: both functions count distinct ids after casting them to uuid, which ignores letter case. Nothing else
-- changes: same signatures, same order of checks, same error codes. `create or replace` keeps the comments and the
-- EXECUTE privileges set by 20261005130000_symptom_journal.sql and 20261009120000_journal_correction.sql.
-- An id that is not a uuid at all fails on the cast with 22P02, as it already did in the SE005 check below it.
--
-- Checks: symptom_journal_checks.sql (JOURNAL 2) and journal_correction_checks.sql (CORRECTION 5).

-- ---------------------------------------------------------------------------
-- 1. Saving an entry
-- ---------------------------------------------------------------------------

create or replace function public.add_symptom_entry(
  p_occurred_local timestamp,
  p_items jsonb,
  p_note text
)
returns uuid
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_entry_id uuid;
begin
  if v_user_id is null then
    raise exception using
      errcode = '28000',
      message = 'Nie można zapisać wpisu bez zalogowanej sesji.';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception using
      errcode = 'SE001',
      message = 'Wpis o samopoczuciu musi mieć co najmniej jeden objaw.';
  end if;

  -- Items without a symptom id are left to SE005 below. Ids are compared as uuid, so the same id in two letter cases
  -- counts as one symptom.
  if (select count(distinct (item ->> 'symptom_id')::uuid) <> count(item ->> 'symptom_id')
        from jsonb_array_elements(p_items) as item) then
    raise exception using
      errcode = 'SE004',
      message = 'Ten sam objaw jest we wpisie więcej niż raz.';
  end if;

  if exists (
    select 1
      from jsonb_array_elements(p_items) as item
     where not exists (
       select 1 from public.symptoms s where s.id = (item ->> 'symptom_id')::uuid
     )
  ) then
    raise exception using
      errcode = 'SE005',
      message = 'Wybranego objawu nie ma na liście objawów.';
  end if;

  -- datetime-local has no zone: the time typed in the form is Polish time. No time means the moment of saving.
  insert into public.symptom_entries (user_id, occurred_at, note)
  values (
    v_user_id,
    coalesce(p_occurred_local at time zone 'Europe/Warsaw', now()),
    nullif(btrim(p_note), '')
  )
  returning id into v_entry_id;

  insert into public.symptom_entry_items (entry_id, symptom_id, severity)
  select v_entry_id, (item ->> 'symptom_id')::uuid, item ->> 'severity'
    from jsonb_array_elements(p_items) as item;

  return v_entry_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Correcting an entry
-- ---------------------------------------------------------------------------

create or replace function public.correct_symptom_entry(
  p_entry_id uuid,
  p_occurred_local timestamp,
  p_items jsonb,
  p_note text
)
returns uuid
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_entry record;
begin
  if v_user_id is null then
    raise exception using
      errcode = '28000',
      message = 'Nie można poprawić wpisu bez zalogowanej sesji.';
  end if;

  -- Locks the entry, so two corrections of the same entry cannot interleave. RLS already hides another account's
  -- rows; the explicit owner filter keeps the rule also for a role that bypasses RLS.
  select e.id, e.created_at into v_entry
    from public.symptom_entries e
   where e.id = p_entry_id
     and e.user_id = v_user_id
     for update;
  if not found then
    raise exception using
      errcode = 'SE006',
      message = 'Nie ma takiego wpisu w dzienniczku tego konta.';
  end if;

  -- The same window the history guards enforce (symptom_entry_correction_window_open), compared here directly.
  if not (now() < public.correction_window_end(v_entry.created_at)) then
    raise exception using
      errcode = 'SE007',
      message = 'Okno korekty tego wpisu jest już zamknięte. Data, godzina, objawy i nasilenie są częścią historii; notatkę można zmienić zawsze.';
  end if;

  -- SE001, SE004 and SE005: the same checks as add_symptom_entry (section 1 above), kept as a copy without a shared
  -- helper. The SQL checks of both functions keep the copies equal.
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception using
      errcode = 'SE001',
      message = 'Wpis o samopoczuciu musi mieć co najmniej jeden objaw.';
  end if;

  -- Items without a symptom id are left to SE005 below. Ids are compared as uuid, so the same id in two letter cases
  -- counts as one symptom.
  if (select count(distinct (item ->> 'symptom_id')::uuid) <> count(item ->> 'symptom_id')
        from jsonb_array_elements(p_items) as item) then
    raise exception using
      errcode = 'SE004',
      message = 'Ten sam objaw jest we wpisie więcej niż raz.';
  end if;

  if exists (
    select 1
      from jsonb_array_elements(p_items) as item
     where not exists (
       select 1 from public.symptoms s where s.id = (item ->> 'symptom_id')::uuid
     )
  ) then
    raise exception using
      errcode = 'SE005',
      message = 'Wybranego objawu nie ma na liście objawów.';
  end if;

  -- datetime-local has no zone: the time typed in the form is Polish time. No time means the date stays as saved
  -- (unlike add_symptom_entry, where it means the moment of saving). Writing the same value back is not a new
  -- dating of the entry, so the date-bounds trigger lets it pass (S-05 section 7).
  update public.symptom_entries
     set occurred_at = coalesce(p_occurred_local at time zone 'Europe/Warsaw', occurred_at),
         note = nullif(btrim(p_note), '')
   where id = v_entry.id;

  -- Symptoms no longer on the entry are removed; the deferred "at least one symptom" check runs at commit, after the
  -- new ones are in.
  delete from public.symptom_entry_items i
   where i.entry_id = v_entry.id
     and not exists (
       select 1 from jsonb_array_elements(p_items) as item
        where (item ->> 'symptom_id')::uuid = i.symptom_id
     );

  -- Symptoms kept on the entry keep their row and get the new severity (only rows that change are written).
  update public.symptom_entry_items i
     set severity = item ->> 'severity'
    from jsonb_array_elements(p_items) as item
   where i.entry_id = v_entry.id
     and i.symptom_id = (item ->> 'symptom_id')::uuid
     and i.severity is distinct from item ->> 'severity';

  insert into public.symptom_entry_items (entry_id, symptom_id, severity)
  select v_entry.id, (item ->> 'symptom_id')::uuid, item ->> 'severity'
    from jsonb_array_elements(p_items) as item
   where not exists (
     select 1 from public.symptom_entry_items i
      where i.entry_id = v_entry.id
        and i.symptom_id = (item ->> 'symptom_id')::uuid
   );

  return v_entry.id;
end;
$$;
