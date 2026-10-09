-- Migration: S-07 phase 1 — correcting a journal entry, changing its note and deleting an entry added by mistake.
--
-- What this migration makes possible, in plain terms, with an example for each part.
-- Technical names are in brackets, for whoever needs to find them in the code below.
--
-- The rule itself has been in the database since S-05 (20261005130000_symptom_journal.sql, part D): an entry can be
-- corrected for 24 hours from saving it, and its note always. Until now the application had no way to use it. This
-- migration adds three save calls on top of that rule. It adds no table and changes no trigger: the history guards of
-- S-05 stay the last line of defence for direct writes.
--
-- A. CORRECTING AN ENTRY (correct_symptom_entry)
--
--    Example: on 2026-10-09 at 21:14 Anna saves "headache, moderate" dated 2026-10-09 20:00. On 2026-10-10 at 08:00
--    she notices it was dizziness, severe, at 19:30. Until 2026-10-10 21:14 she can correct, in one call:
--      - when it happened (19:30 instead of 20:00); no time given means the date stays as saved, not "now",
--      - the symptoms: headache removed, dizziness added; a symptom kept on the entry keeps its row and gets the
--        new severity,
--      - the note.
--    Either the whole correction is saved or nothing is. From 2026-10-10 21:14 the call refuses with SE007, even when
--    only the note differs: the note alone is changed by set_symptom_entry_note (part B).
--    The 14-day rule (SE003) is counted from the moment of correcting, as for any change of the date (S-05 part C).
--    An entry dated 2026-09-25 20:00 and saved on 2026-10-09 at 19:00 can still get another symptom on 2026-10-09 at
--    20:30, because a date left unchanged is not a new dating of the entry.
--
-- B. CHANGING THE NOTE (set_symptom_entry_note)
--
--    Example: the entry saved on 2026-10-09 at 21:14 gets the note "po kolacji" on 2026-10-15. The note is a comment,
--    not part of the history compared with medications, so it can be changed or cleared at any time (FR-009).
--    A blank note means no note.
--
-- C. DELETING AN ENTRY ADDED BY MISTAKE (delete_symptom_entry)
--
--    Example: an entry saved twice by mistake on 2026-10-09 at 21:14 can be deleted, with its symptoms, until
--    2026-10-10 21:14. After that it is part of the history and stays (SE007).
--
-- Errors of the three functions, each a named SQLSTATE the routes map to a text, checked in this order:
--   28000  no signed-in session;
--   SE006  no such entry among the caller's entries (another account's entry, or none at all);
--   SE007  correct_symptom_entry, delete_symptom_entry: the correction window of the entry is closed. Checked here by
--          comparing now() with correction_window_end(created_at), like DP009 in correct_dosage_period and MD010 in
--          delete_medication, so the caller gets a named error instead of the general message of the history guard.
--          Checked before the content, so after the window closes the caller learns that, not a content error;
--   SE001, SE004, SE005  correct_symptom_entry: no symptom, the same symptom twice, a symptom not on the list (the
--          same checks as add_symptom_entry);
--   SE002, SE003  correct_symptom_entry, from the date-bounds trigger: time in the future, more than 14 days back.
--
-- Why security invoker: the functions read and write as the caller, so RLS and every guard on the journal tables
-- still apply; the functions add named errors on top, they do not replace them.
--
-- Wording: nothing here says a symptom is caused by anything (FR-012).

-- ---------------------------------------------------------------------------
-- 1. Correcting an entry
-- ---------------------------------------------------------------------------

create function public.correct_symptom_entry(
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

  -- SE001, SE004 and SE005: copied from add_symptom_entry (20261005130000_symptom_journal.sql, section 9) without
  -- a shared helper, so add_symptom_entry stays unchanged. The SQL checks of both functions keep the copies equal.
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception using
      errcode = 'SE001',
      message = 'Wpis o samopoczuciu musi mieć co najmniej jeden objaw.';
  end if;

  -- Items without a symptom id are left to SE005 below.
  if (select count(distinct item ->> 'symptom_id') <> count(item ->> 'symptom_id')
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

comment on function public.correct_symptom_entry(uuid, timestamp, jsonb, text) is
  'Corrects one of the caller''s journal entries while its correction window is open (24 hours from saving it), atomically, and returns the entry id. Example: an entry saved 2026-10-09 21:14 as "headache, moderate" at 20:00 can be corrected until 2026-10-10 21:14 to p_occurred_local = 2026-10-09 19:30 (Polish time), p_items = [{"symptom_id": "<dizziness>", "severity": "severe"}], p_note = " po kolacji " (stored trimmed; blank -> null). p_occurred_local null = the date stays as saved (not the moment of correcting). Symptoms missing from p_items are removed, those kept keep their row with the new severity, new ones are added. Errors, checked in this order: 28000 = no signed-in session, SE006 = no such entry of this account, SE007 = correction window of the entry closed, SE001 = no symptom, SE004 = the same symptom twice, SE005 = a symptom not on the list, then from the table rules SE002 = time in the future, SE003 = time more than 14 days back (counted from the moment of correcting); a severity outside mild/moderate/severe or a note over 200 characters fails on the table checks.';

-- ---------------------------------------------------------------------------
-- 2. Changing the note
-- ---------------------------------------------------------------------------

create function public.set_symptom_entry_note(
  p_entry_id uuid,
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
      message = 'Nie można zmienić notatki bez zalogowanej sesji.';
  end if;

  select e.id into v_entry_id
    from public.symptom_entries e
   where e.id = p_entry_id
     and e.user_id = v_user_id
     for update;
  if not found then
    raise exception using
      errcode = 'SE006',
      message = 'Nie ma takiego wpisu w dzienniczku tego konta.';
  end if;

  -- No window check: the note is a comment, not part of the history, and the guards let it change at any time.
  update public.symptom_entries
     set note = nullif(btrim(p_note), '')
   where id = v_entry_id;

  return v_entry_id;
end;
$$;

comment on function public.set_symptom_entry_note(uuid, text) is
  'Changes or clears the note of one of the caller''s journal entries, at any time, also after the correction window is closed (FR-009), and returns the entry id. Example: an entry saved 2026-10-09 21:14 gets p_note = " po kolacji " on 2026-10-15 (stored trimmed); a blank or null note clears it. Errors, checked in this order: 28000 = no signed-in session, SE006 = no such entry of this account; a note over 200 characters fails on the table check.';

-- ---------------------------------------------------------------------------
-- 3. Deleting an entry added by mistake
-- ---------------------------------------------------------------------------

create function public.delete_symptom_entry(p_entry_id uuid)
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
      message = 'Nie można usunąć wpisu bez zalogowanej sesji.';
  end if;

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

  -- The same window symptom_entries_guard_delete enforces, compared here directly for a named error.
  if not (now() < public.correction_window_end(v_entry.created_at)) then
    raise exception using
      errcode = 'SE007',
      message = 'Okno korekty tego wpisu jest już zamknięte, więc nie można go usunąć. Wpis należy do historii.';
  end if;

  -- Its symptoms go with it (on delete cascade).
  delete from public.symptom_entries
   where id = v_entry.id;

  return v_entry.id;
end;
$$;

comment on function public.delete_symptom_entry(uuid) is
  'Permanently deletes one of the caller''s journal entries added by mistake, with its symptoms, while the correction window of the entry is open (24 hours from saving it), and returns the entry id. Example: an entry saved twice on 2026-10-09 21:14 can be deleted until 2026-10-10 21:14; after that it stays in the history. Errors, checked in this order: 28000 = no signed-in session, SE006 = no such entry of this account, SE007 = correction window of the entry closed.';

-- ---------------------------------------------------------------------------
-- 4. Privileges
-- ---------------------------------------------------------------------------
-- The Supabase default privileges grant anon and authenticated EXECUTE on every new function in public; revoking
-- from public alone would not remove those direct grants.

revoke execute on function public.correct_symptom_entry(uuid, timestamp, jsonb, text) from public, anon;
revoke execute on function public.set_symptom_entry_note(uuid, text) from public, anon;
revoke execute on function public.delete_symptom_entry(uuid) from public, anon;

grant execute on function public.correct_symptom_entry(uuid, timestamp, jsonb, text) to authenticated;
grant execute on function public.set_symptom_entry_note(uuid, text) to authenticated;
grant execute on function public.delete_symptom_entry(uuid) to authenticated;
