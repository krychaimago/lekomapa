-- Migration: S-05 phase 2 — the symptom journal: entries, their symptoms, the correction window and one save call.
--
-- What this migration makes possible, in plain terms, with an example for each part.
-- Technical names are in brackets, for whoever needs to find them in the code below.
--
-- A. AN ENTRY AND ITS SYMPTOMS (symptom_entries, symptom_entry_items)
--
--    Example: on Monday at 21:14 Anna writes "nausea, moderate" and "headache" (no severity) with the note "after
--    dinner".
--      - One entry row: when it happened (occurred_at), the note, the moment of saving (created_at).
--      - One row per symptom: which symptom from the closed list and, optionally, how severe (mild, moderate,
--        severe). The same symptom cannot be on one entry twice.
--      - The note is optional; blank means no note. It is never mapped to a symptom and never takes part in any
--        comparison with medications.
--      - A symptom on the closed list cannot be deleted while an entry uses it (on delete restrict): the history
--        would lose what was written.
--      - Each account sees and writes only its own entries (RLS in this same migration, four policies per table,
--        only for signed-in accounts).
--
-- B. EVERY ENTRY HAS AT LEAST ONE SYMPTOM (symptom_entries_require_item, error SE001)
--      - Checked when the transaction commits, so an entry and its symptoms can be written by separate statements
--        of one transaction. An entry left without symptoms at commit is refused, whichever way it got there: saved
--        empty, its last symptom deleted, or its last symptom moved to another entry.
--      - Deleting the whole entry (or the account) is not an error: there is no entry left to check.
--
-- C. WHEN AN ENTRY CAN BE DATED (symptom_entries_guard_occurred_at, errors SE002, SE003)
--      - Not in the future (SE002) and not more than 14 days back (SE003), both counted from now() at the moment of
--        saving. Example: saved on 2026-10-20 at 12:00, the earliest allowed moment is 2026-10-06 12:00.
--      - The same rule holds for a direct insert and for a later change of occurred_at, not only for the save call.
--
-- D. THE CORRECTION WINDOW OF AN ENTRY (symptom_entry_correction_window_open, correction_window_ends_at)
--    Example: saved on Monday at 21:14, the entry can be corrected until Tuesday at 21:14 (24 hours, the same
--    correction_window_end as medications). From then on:
--      - when it happened (occurred_at) and whose it is (user_id) cannot change; created_at never changes,
--      - its symptoms cannot be added, changed, moved to another entry or removed, and no symptom can be moved into
--        it — adding a symptom to a closed entry rewrites its history as much as changing one,
--      - the entry cannot be deleted (except together with the whole account),
--      - the note stays editable: it is a comment, not part of the history compared with medications.
--    Every refusal raises P0001 with a Polish message containing "okno korekty ... jest już zamknięte", the wording
--    the SQL checks and the application recognise.
--
-- E. SAVING AN ENTRY (add_symptom_entry)
--      - One call writes the entry and all its symptoms; either everything is saved or nothing is.
--      - The time comes from the form without a zone (datetime-local) and is read as Polish time: 21:14 on
--        2026-10-20 is stored as 19:14 UTC, 21:14 on 2026-10-30 (after the clock change on 25 October) as 20:14 UTC.
--      - No time given means the moment of saving, not the moment the screen was opened (FR-008).
--      - Errors: 28000 = no signed-in session, SE001 = no symptom, SE004 = the same symptom twice, SE005 = a symptom
--        not on the list, SE002 = time in the future, SE003 = time more than 14 days back.
--
-- Wording: nothing here says a symptom is caused by anything. An entry records what was felt and when; the product
-- only ever says a symptom may be related to a medication (FR-012).

-- ---------------------------------------------------------------------------
-- 1. Tables
-- ---------------------------------------------------------------------------

create table public.symptom_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  occurred_at timestamptz not null,
  -- Same limit as the dose text in S-02/S-03 (MAX_TEXT_LENGTH = 200 in the medication routes). Blank is stored as
  -- null by add_symptom_entry; the check refuses a blank note written directly.
  note text
    constraint symptom_entries_note_check
    check (note is null or (btrim(note) <> '' and char_length(note) <= 200)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index symptom_entries_user_id_occurred_at_idx
  on public.symptom_entries (user_id, occurred_at desc);

comment on table public.symptom_entries is
  'One entry of the symptom journal: when it happened (occurred_at), an optional note and the moment of saving (created_at, which opens the 24-hour correction window). Its symptoms are in symptom_entry_items; an entry has at least one at commit (SE001).';
comment on column public.symptom_entries.occurred_at is
  'When the symptoms were felt. At most 14 days before and never after now() at the moment of saving (SE003, SE002). Part of the history: cannot change once the correction window is closed.';
comment on column public.symptom_entries.note is
  'Optional free text, at most 200 characters, never blank. Never mapped to a symptom and never compared with medications. Editable also after the correction window is closed.';

create table public.symptom_entry_items (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references public.symptom_entries (id) on delete cascade,
  symptom_id uuid not null references public.symptoms (id) on delete restrict,
  severity text
    constraint symptom_entry_items_severity_check
    check (severity in ('mild', 'moderate', 'severe')),
  constraint symptom_entry_items_entry_id_symptom_id_key
    unique (entry_id, symptom_id)
);

-- The unique key above already serves lookups by entry_id. This one serves the restrict check when a symptom is
-- deleted from the closed list.
create index symptom_entry_items_symptom_id_idx
  on public.symptom_entry_items (symptom_id);

comment on table public.symptom_entry_items is
  'Symptoms of one journal entry, from the closed list, each with an optional severity (mild, moderate, severe). One symptom at most once per entry. Part of the history of the entry: cannot be added, changed, moved or removed once its correction window is closed.';

-- ---------------------------------------------------------------------------
-- 2. RLS and policies (8 policies: 4 operations x 2 tables, only for authenticated)
-- ---------------------------------------------------------------------------

alter table public.symptom_entries enable row level security;
alter table public.symptom_entry_items enable row level security;

-- No policy for anon: with RLS enabled that means no rows without a session.

create policy symptom_entries_select_authenticated on public.symptom_entries
  for select to authenticated
  using (user_id = auth.uid());

create policy symptom_entries_insert_authenticated on public.symptom_entries
  for insert to authenticated
  with check (user_id = auth.uid());

create policy symptom_entries_update_authenticated on public.symptom_entries
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy symptom_entries_delete_authenticated on public.symptom_entries
  for delete to authenticated
  using (user_id = auth.uid());

-- The items have no owner column of their own (one source of truth about the owner): ownership goes through the
-- entry, as for medication_substances.

create policy symptom_entry_items_select_authenticated on public.symptom_entry_items
  for select to authenticated
  using (
    exists (
      select 1 from public.symptom_entries e
      where e.id = entry_id and e.user_id = auth.uid()
    )
  );

create policy symptom_entry_items_insert_authenticated on public.symptom_entry_items
  for insert to authenticated
  with check (
    exists (
      select 1 from public.symptom_entries e
      where e.id = entry_id and e.user_id = auth.uid()
    )
  );

create policy symptom_entry_items_update_authenticated on public.symptom_entry_items
  for update to authenticated
  using (
    exists (
      select 1 from public.symptom_entries e
      where e.id = entry_id and e.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.symptom_entries e
      where e.id = entry_id and e.user_id = auth.uid()
    )
  );

create policy symptom_entry_items_delete_authenticated on public.symptom_entry_items
  for delete to authenticated
  using (
    exists (
      select 1 from public.symptom_entries e
      where e.id = entry_id and e.user_id = auth.uid()
    )
  );

-- TRUNCATE is not subject to RLS and fires no row triggers (20260929120000_revoke_account_truncate_and_window_execute.sql).
revoke truncate on public.symptom_entries, public.symptom_entry_items from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. created_at is the moment of saving; updated_at follows every change
-- ---------------------------------------------------------------------------

create trigger symptom_entries_freeze_created_at
  before insert or update on public.symptom_entries
  for each row execute function public.freeze_created_at();

create trigger symptom_entries_set_updated_at
  before update on public.symptom_entries
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 4. The correction window of an entry
-- ---------------------------------------------------------------------------

create function public.symptom_entry_correction_window_open(p_entry_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_created_at timestamptz;
begin
  select e.created_at into v_created_at
    from public.symptom_entries e
   where e.id = p_entry_id;

  -- No entry: it is being deleted together with its symptoms (cascade), which must pass.
  if not found then
    return true;
  end if;

  return now() < public.correction_window_end(v_created_at);
end;
$$;

comment on function public.symptom_entry_correction_window_open(uuid) is
  'Correction window of a journal entry and its symptoms: open while now() < correction_window_end(symptom_entries.created_at), i.e. 24 hours from saving the entry. Example: saved 2026-10-05 21:14 -> correctable until 2026-10-06 21:14. True when the entry does not exist (cascade delete). Called by the journal history guards. security definer and no EXECUTE for anon or authenticated: it takes any entry id without checking the owner, so callable from the API it would answer about another account''s entry.';

-- The Supabase default privileges grant anon and authenticated EXECUTE on every new function in public; revoking
-- from public alone would not remove those direct grants.
revoke execute on function public.symptom_entry_correction_window_open(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. History guards on entries
-- ---------------------------------------------------------------------------

create function public.symptom_entries_guard_core()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- note and updated_at are deliberately not compared: the note stays editable after the window closes, and every
  -- update changes updated_at. created_at is frozen for good by symptom_entries_freeze_created_at.
  if not public.symptom_entry_correction_window_open(old.id) then
    if new.occurred_at is distinct from old.occurred_at then
      raise exception
        'Nie można zmienić pola occurred_at: okno korekty tego wpisu jest już zamknięte, a data i godzina wpisu są częścią historii zestawianej z lekami.';
    end if;

    if new.user_id is distinct from old.user_id then
      raise exception
        'Nie można zmienić pola user_id: okno korekty tego wpisu jest już zamknięte, a przypisanie wpisu do konta jest częścią historii.';
    end if;
  end if;

  return new;
end;
$$;

comment on function public.symptom_entries_guard_core() is
  'Trigger: once the correction window of the entry is closed, refuses changing occurred_at and user_id. The note stays editable. created_at is protected by freeze_created_at.';

create function public.symptom_entries_guard_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Cascade from a deleted account: the auth.users row is deleted before the cascade reaches the entries, so a
  -- missing account means the whole account is going, which must pass.
  if not exists (select 1 from auth.users u where u.id = old.user_id) then
    return old;
  end if;

  if not public.symptom_entry_correction_window_open(old.id) then
    raise exception
      'Nie można usunąć wpisu o samopoczuciu: okno korekty tego wpisu jest już zamknięte, a wpis należy do historii zestawianej z lekami.';
  end if;

  return old;
end;
$$;

comment on function public.symptom_entries_guard_delete() is
  'Trigger: refuses deleting a journal entry whose correction window is closed. Passes when the account no longer exists (account deletion cascade).';

revoke execute on function public.symptom_entries_guard_core() from public, anon, authenticated;
revoke execute on function public.symptom_entries_guard_delete() from public, anon, authenticated;

create trigger symptom_entries_guard_core
  before update on public.symptom_entries
  for each row execute function public.symptom_entries_guard_core();

create trigger symptom_entries_guard_delete
  before delete on public.symptom_entries
  for each row execute function public.symptom_entries_guard_delete();

-- ---------------------------------------------------------------------------
-- 6. History guards on the symptoms of an entry (whole write path: insert, update, delete)
-- ---------------------------------------------------------------------------

create function public.symptom_entry_items_guard_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- A missing entry returns true here; the foreign key refuses the row.
  if not public.symptom_entry_correction_window_open(new.entry_id) then
    raise exception
      'Nie można dodać objawu do wpisu: okno korekty tego wpisu jest już zamknięte, a jego objawy są częścią historii zestawianej z lekami.';
  end if;

  return new;
end;
$$;

comment on function public.symptom_entry_items_guard_insert() is
  'Trigger: refuses adding a symptom to an entry whose correction window is closed. Example: an entry saved on Monday 21:14 cannot get another symptom on Wednesday.';

create function public.symptom_entry_items_guard_core()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Moving a symptom into another entry adds it to that entry's history: refused when the target's window is closed.
  if new.entry_id is distinct from old.entry_id
     and not public.symptom_entry_correction_window_open(new.entry_id) then
    raise exception
      'Nie można zmienić pola entry_id: okno korekty wpisu, do którego miałby trafić ten objaw, jest już zamknięte, a jego objawy są częścią historii.';
  end if;

  -- entry_id is part of the core like the symptom itself: moving the row out of a closed entry rewrites its history.
  if new.symptom_id is distinct from old.symptom_id
     or new.severity is distinct from old.severity
     or new.entry_id is distinct from old.entry_id then
    if not public.symptom_entry_correction_window_open(old.entry_id) then
      raise exception
        'Nie można zmienić pola symptom_id, severity ani entry_id: okno korekty tego wpisu jest już zamknięte, a jego objawy są częścią historii zestawianej z lekami.';
    end if;
  end if;

  return new;
end;
$$;

comment on function public.symptom_entry_items_guard_core() is
  'Trigger: once the correction window of the entry is closed, refuses changing symptom_id, severity and entry_id of its symptoms; refuses moving a symptom into an entry whose window is closed.';

create function public.symptom_entry_items_guard_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Cascade from a deleted entry (or account): the entry row is already gone, so the delete must pass.
  if not exists (select 1 from public.symptom_entries e where e.id = old.entry_id) then
    return old;
  end if;

  if not public.symptom_entry_correction_window_open(old.entry_id) then
    raise exception
      'Nie można usunąć objawu z wpisu: okno korekty tego wpisu jest już zamknięte, a jego objawy są częścią historii zestawianej z lekami.';
  end if;

  return old;
end;
$$;

comment on function public.symptom_entry_items_guard_delete() is
  'Trigger: refuses removing a symptom from an entry whose correction window is closed. Passes when the entry no longer exists (cascade).';

revoke execute on function public.symptom_entry_items_guard_insert() from public, anon, authenticated;
revoke execute on function public.symptom_entry_items_guard_core() from public, anon, authenticated;
revoke execute on function public.symptom_entry_items_guard_delete() from public, anon, authenticated;

create trigger symptom_entry_items_guard_insert
  before insert on public.symptom_entry_items
  for each row execute function public.symptom_entry_items_guard_insert();

create trigger symptom_entry_items_guard_core
  before update on public.symptom_entry_items
  for each row execute function public.symptom_entry_items_guard_core();

create trigger symptom_entry_items_guard_delete
  before delete on public.symptom_entry_items
  for each row execute function public.symptom_entry_items_guard_delete();

-- ---------------------------------------------------------------------------
-- 7. When an entry can be dated: SE002 (future), SE003 (more than 14 days back)
-- ---------------------------------------------------------------------------

create function public.symptom_entries_guard_occurred_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  -- Keep equal to JOURNAL_MAX_DAYS_BACK in the journal service (S-05 phase 3).
  c_max_days_back constant interval := interval '14 days';
begin
  -- An update that writes the same value back (e.g. a form saving every field) is not a new dating of the entry.
  if tg_op = 'UPDATE' and new.occurred_at is not distinct from old.occurred_at then
    return new;
  end if;

  if new.occurred_at > now() then
    raise exception using
      errcode = 'SE002',
      message = 'Data i godzina wpisu nie mogą być w przyszłości.';
  end if;

  if new.occurred_at < now() - c_max_days_back then
    raise exception using
      errcode = 'SE003',
      message = 'Datę i godzinę wpisu można cofnąć najwyżej o 14 dni.';
  end if;

  return new;
end;
$$;

comment on function public.symptom_entries_guard_occurred_at() is
  'Trigger: occurred_at must lie between now() - 14 days and now(), both inclusive, counted at the moment of saving. SE002 = in the future, SE003 = more than 14 days back. Example: saved 2026-10-20 12:00 -> allowed from 2026-10-06 12:00 to 2026-10-20 12:00. Fires on insert and on a change of occurred_at.';

revoke execute on function public.symptom_entries_guard_occurred_at() from public, anon, authenticated;

create trigger symptom_entries_guard_occurred_at
  before insert or update of occurred_at on public.symptom_entries
  for each row execute function public.symptom_entries_guard_occurred_at();

-- ---------------------------------------------------------------------------
-- 8. At least one symptom per entry, checked at commit: SE001
-- ---------------------------------------------------------------------------
-- Constraint triggers deferred to commit: an entry is inserted before its symptoms, so a check per statement would
-- refuse every correct save. Fired by an inserted entry, and by a symptom removed from an entry or moved out of it.
-- security definer: the count covers every symptom of the entry, not only those visible to the caller.

create function public.symptom_entries_assert_has_item()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_entry_id uuid;
begin
  if tg_table_name = 'symptom_entries' then
    v_entry_id := new.id;
  else
    v_entry_id := old.entry_id;
  end if;

  -- The entry is gone (deleted with all its symptoms, or with the account): nothing to check.
  if not exists (select 1 from public.symptom_entries e where e.id = v_entry_id) then
    return null;
  end if;

  if not exists (select 1 from public.symptom_entry_items i where i.entry_id = v_entry_id) then
    raise exception using
      errcode = 'SE001',
      message = 'Wpis o samopoczuciu musi mieć co najmniej jeden objaw.';
  end if;

  return null;
end;
$$;

comment on function public.symptom_entries_assert_has_item() is
  'Constraint trigger, deferred to commit: an existing journal entry must have at least one symptom (SE001). Passes when the entry itself is gone (deleted with its symptoms or with the account).';

revoke execute on function public.symptom_entries_assert_has_item() from public, anon, authenticated;

create constraint trigger symptom_entries_require_item
  after insert on public.symptom_entries
  deferrable initially deferred
  for each row execute function public.symptom_entries_assert_has_item();

create constraint trigger symptom_entry_items_require_item
  after delete or update of entry_id on public.symptom_entry_items
  deferrable initially deferred
  for each row execute function public.symptom_entries_assert_has_item();

-- ---------------------------------------------------------------------------
-- 9. Saving an entry
-- ---------------------------------------------------------------------------
-- security invoker: the function runs with the caller's rights, so RLS on the journal tables applies exactly as for
-- separate inserts, but the entry and its symptoms succeed or fail together (one statement, one transaction).

create function public.add_symptom_entry(
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

comment on function public.add_symptom_entry(timestamp, jsonb, text) is
  'Saves a journal entry of the signed-in account with its symptoms, atomically, and returns the entry id. Example: p_occurred_local = 2026-10-20 21:14 (Polish time, stored as 19:14 UTC), p_items = [{"symptom_id": "<nausea>", "severity": "moderate"}, {"symptom_id": "<headache>", "severity": null}], p_note = " after dinner " (stored trimmed; blank -> null). p_occurred_local null = the moment of saving (FR-008). Errors, checked in this order: 28000 = no signed-in session, SE001 = no symptom, SE004 = the same symptom twice, SE005 = a symptom not on the list, then from the table rules SE002 = time in the future, SE003 = time more than 14 days back; a severity outside mild/moderate/severe or a note over 200 characters fails on the table checks.';

-- ---------------------------------------------------------------------------
-- 10. End of the window for the screens (PostgREST computed field)
-- ---------------------------------------------------------------------------
-- A new overload of the phase 1 name: `select=id,correction_window_ends_at` on symptom_entries returns the end of
-- that entry's window. Reads only the row it is given, which the caller could already read under RLS.

create function public.correction_window_ends_at(public.symptom_entries)
returns timestamptz
language sql
stable
security invoker
set search_path = ''
as $$
  select public.correction_window_end($1.created_at);
$$;

comment on function public.correction_window_ends_at(public.symptom_entries) is
  'PostgREST computed field: end of the correction window of the journal entry (created_at + 24 h, correction_window_end). Example: saved 2026-10-05 21:14 -> 2026-10-06 21:14.';

-- ---------------------------------------------------------------------------
-- 11. Privileges
-- ---------------------------------------------------------------------------

revoke execute on function public.add_symptom_entry(timestamp, jsonb, text) from public, anon;
revoke execute on function public.correction_window_ends_at(public.symptom_entries) from public, anon;

grant execute on function public.add_symptom_entry(timestamp, jsonb, text) to authenticated;
grant execute on function public.correction_window_ends_at(public.symptom_entries) to authenticated;
