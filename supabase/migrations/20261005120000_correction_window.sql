-- Migration: S-05 phase 1 — the real correction window for medications, their composition and dosage periods.
--
-- What changes, in plain terms, with an example.
--
--   Anna adds Ibuprom on Monday at 21:14. Until Tuesday 21:14 she can still correct it (the composition, the first
--   dose, or delete it as added by mistake). From Tuesday 21:14 the medication is history: it can be stopped with a
--   date, but not rewritten. On Friday at 9:00 she changes the dose: the old period is closed and a new one opens.
--   The new period has its own window until Saturday 9:00, so a typo in the new dose can still be corrected, while
--   the old period and the medication stay closed.
--
-- A. ONE MEASURE OF THE WINDOW (correction_window_end)
--    The window ends 24 hours after the row was saved. This is the only place with the number 24. The functions
--    "window open" (used by the history guards) and the computed fields read by the screens
--    (correction_window_ends_at) all go through it, so the hour shown on the screen is the hour the database
--    enforces.
--
-- B. THE MOMENT OF SAVING CANNOT BE FORGED (medications_freeze_created_at, dosage_periods_freeze_created_at)
--    Before this migration created_at was only a default: the insert policy let a client send any value, and the
--    update policy let it move the value later. Since the window is counted from created_at, a client could reopen
--    a closed window by moving created_at forward. Now created_at is always now() on insert, whatever the client
--    sends, and any later change of it is refused.
--
-- C. ONE WINDOW PER ROW
--    - medication_correction_window_open(uuid): same signature as the F-01 stub, so its callers and privileges stay;
--      counted from medications.created_at. Guards the medication and its composition.
--    - dosage_period_correction_window_open(uuid), new: counted from dosage_periods.created_at. The period guards
--      now ask this function about the period itself, so a period opened by a dose change can be corrected for
--      24 hours although the medication is long closed, and an old period stays closed.
--
-- D. INSERTS FOLLOW THE WINDOW TOO (medication_substances_guard_insert, dosage_periods_guard_insert)
--    The update and delete guards alone left a gap: with the window of a medication closed, the insert policies
--    still let a client add a substance to its composition, or a period in the middle of its history.
--    - A substance can be added only while the window of the medication is open.
--    - With the window of the medication closed, a period can be added only at the end of the history: its start
--      later than the start of every existing period. That is what change_dosage does; a period before or between
--      existing periods is refused.
--    - Re-pointing a substance or a period to another medication is an insert into that medication: it is refused
--      when the window of the target medication is closed (lesson "Ograniczenie na tabeli podrzędnej...").
--
-- Every refusal raises P0001 with a Polish message containing "okno korekty ... jest już zamknięte", the wording the
-- SQL checks and the application recognise.
--
-- WARNING for deployment: rows already in production keep their created_at, so everything saved more than 24 hours
-- before this migration becomes unchangeable at once. That is intended; there is no way back other than another
-- migration.
--
-- Order: the freeze triggers first, then the window functions, then the guards that use them.

-- ---------------------------------------------------------------------------
-- 1. created_at is the moment of saving, set by the database and never changed
-- ---------------------------------------------------------------------------

create or replace function public.freeze_created_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    -- Whatever the client sent: the window is counted from this value, so it must be the server clock.
    new.created_at := now();
  elsif new.created_at is distinct from old.created_at then
    raise exception
      'Nie można zmienić pola created_at: od chwili zapisu liczy się okno korekty, więc dla tego pola okno korekty jest już zamknięte w chwili zapisu.';
  end if;

  return new;
end;
$$;

comment on function public.freeze_created_at() is
  'Trigger: on insert sets created_at to now() whatever the client sent; on update refuses any change of created_at. The correction window is counted from created_at, so a client moving it could reopen a closed window.';

revoke execute on function public.freeze_created_at() from public, anon, authenticated;

create trigger medications_freeze_created_at
  before insert or update on public.medications
  for each row execute function public.freeze_created_at();

create trigger dosage_periods_freeze_created_at
  before insert or update on public.dosage_periods
  for each row execute function public.freeze_created_at();

-- ---------------------------------------------------------------------------
-- 2. The measure of the window and the "window open" functions
-- ---------------------------------------------------------------------------

create or replace function public.correction_window_end(p_saved_at timestamptz)
returns timestamptz
language sql
stable
security invoker
set search_path = ''
as $$
  select p_saved_at + interval '24 hours';
$$;

comment on function public.correction_window_end(timestamptz) is
  'End of the correction window of a row saved at p_saved_at: 24 hours later (FR-004, FR-009, Q-3). Example: saved 2026-10-05 21:14 -> correctable until 2026-10-06 21:14 (the window is open while now() < this value). The only place holding the length of the window.';

revoke execute on function public.correction_window_end(timestamptz) from public, anon;
grant execute on function public.correction_window_end(timestamptz) to authenticated;

-- Same signature as the F-01 stub: `create or replace` keeps its privileges (no EXECUTE for anon or authenticated,
-- 20260929120000_revoke_account_truncate_and_window_execute.sql) and the guards that call it.
create or replace function public.medication_correction_window_open(p_medication_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_created_at timestamptz;
begin
  select m.created_at into v_created_at
    from public.medications m
   where m.id = p_medication_id;

  -- No medication: it is being deleted together with its children (cascade), which must pass.
  if not found then
    return true;
  end if;

  return now() < public.correction_window_end(v_created_at);
end;
$$;

comment on function public.medication_correction_window_open(uuid) is
  'Correction window of a medication and its composition: open while now() < correction_window_end(medications.created_at), i.e. 24 hours from adding the medication. True when the medication does not exist (cascade delete). Called by the history guards on medications and medication_substances and by the insert guards. security definer and no EXECUTE for anon or authenticated: it takes any medication id without checking the owner, so callable from the API it would answer about another account''s medication.';

create or replace function public.dosage_period_correction_window_open(p_period_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_created_at timestamptz;
begin
  select dp.created_at into v_created_at
    from public.dosage_periods dp
   where dp.id = p_period_id;

  -- No period: nothing left to protect.
  if not found then
    return true;
  end if;

  return now() < public.correction_window_end(v_created_at);
end;
$$;

comment on function public.dosage_period_correction_window_open(uuid) is
  'Correction window of one dosage period: open while now() < correction_window_end(dosage_periods.created_at), i.e. 24 hours from saving that period. Example: a period opened by a dose change on Friday 9:00 can be corrected until Saturday 9:00, although the medication was added months ago. True when the period does not exist. Called by the period history guards. security definer and no EXECUTE for anon or authenticated, like medication_correction_window_open.';

revoke execute on function public.dosage_period_correction_window_open(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Period guards ask about the period; re-pointing asks about the target medication too
-- ---------------------------------------------------------------------------
-- Same branches and messages as 20261004120000_dosage_change.sql, with the window of the period (old.id) in place of
-- the window of the medication, plus the re-pointing branch.

create or replace function public.dosage_periods_guard_core()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Re-pointing a period to another medication adds it to that medication's history: refused when the window of the
  -- target medication is closed, even while the period itself can still be corrected.
  if new.medication_id is distinct from old.medication_id
     and not public.medication_correction_window_open(new.medication_id) then
    raise exception
      'Nie można zmienić pola medication_id: okno korekty leku, do którego miałby trafić ten okres, jest już zamknięte, a jego historia dawkowania jest już zapisana.';
  end if;

  if not public.dosage_period_correction_window_open(old.id) then
    if new.dose_text is distinct from old.dose_text then
      raise exception
        'Nie można zmienić pola dose_text: okno korekty jest już zamknięte, a zmiana dawkowania zamyka bieżący okres i otwiera nowy, zamiast nadpisywać poprzedni.';
    end if;

    if new.started_on is distinct from old.started_on then
      raise exception
        'Nie można zmienić pola started_on: okno korekty jest już zamknięte, a data rozpoczęcia okresu jest częścią historii dawkowania.';
    end if;

    -- Re-pointing a period to another medication rewrites the history of both at once without touching any other
    -- field — that is a change of the core too.
    if new.medication_id is distinct from old.medication_id then
      raise exception
        'Nie można zmienić pola medication_id: okno korekty jest już zamknięte, a przypisanie okresu dawkowania do leku jest częścią historii.';
    end if;

    -- The variant taken in a period is history as much as the dose: a new strength opens a new period.
    if new.registry_product_id is distinct from old.registry_product_id then
      raise exception
        'Nie można zmienić pola registry_product_id: okno korekty jest już zamknięte, a wariant preparatu przyjmowany w tym okresie jest częścią historii dawkowania. Zmiana mocy zamyka bieżący okres i otwiera nowy, zamiast nadpisywać poprzedni.';
    end if;

    -- Setting ended_on from empty to a date always passes: that is how a period is closed on a dose change and
    -- when the medication is stopped. Only replacing an end date that is already set is blocked.
    if old.ended_on is not null and new.ended_on is distinct from old.ended_on then
      raise exception
        'Nie można zmienić pola ended_on: okno korekty jest już zamknięte, a ten okres ma datę końca zapisaną w historii.';
    end if;
  end if;

  return new;
end;
$$;

create or replace function public.dosage_periods_guard_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Cascade from a deleted medication (or account): the medication row is already gone, so the delete must pass.
  if not exists (select 1 from public.medications m where m.id = old.medication_id) then
    return old;
  end if;

  if not public.dosage_period_correction_window_open(old.id) then
    raise exception
      'Nie można usunąć okresu dawkowania: okno korekty jest już zamknięte, a ten okres należy do historii. Zakończenie okresu zapisuje się datą w polu ended_on.';
  end if;

  return old;
end;
$$;

-- Same branches and message as 20260922120000_medication_schema.sql (window of the medication the row belongs to),
-- plus the re-pointing branch: moving a substance into a medication whose window is closed is an insert into its
-- composition.
create or replace function public.medication_substances_guard_core()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.medication_id is distinct from old.medication_id
     and not public.medication_correction_window_open(new.medication_id) then
    raise exception
      'Nie można zmienić pola medication_id: okno korekty leku, do którego miałby trafić ten wpis składu, jest już zamknięte, a jego skład jest częścią historii.';
  end if;

  -- medication_id is part of the core like the substance name: re-pointing the row to another medication rewrites
  -- the history of both medications at once without touching any other field.
  if new.substance_name is distinct from old.substance_name
     or new.atc_code is distinct from old.atc_code
     or new.medication_id is distinct from old.medication_id then
    if not public.medication_correction_window_open(old.medication_id) then
      raise exception
        'Nie można zmienić pola substance_name, atc_code ani medication_id: okno korekty dla tego leku jest już zamknięte, a skład zapisany przy leku jest częścią historii. Aby odnotować inny skład, zakończ tę pozycję datą odstawienia i dodaj nową.';
    end if;
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Insert guards
-- ---------------------------------------------------------------------------

create or replace function public.medication_substances_guard_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- A missing medication returns true here; the foreign key refuses the row.
  if not public.medication_correction_window_open(new.medication_id) then
    raise exception
      'Nie można dodać wpisu składu leku: okno korekty dla tego leku jest już zamknięte, a skład zapisany przy leku jest częścią historii. Aby odnotować inny skład, zakończ tę pozycję datą odstawienia i dodaj nową.';
  end if;

  return new;
end;
$$;

comment on function public.medication_substances_guard_insert() is
  'Trigger: refuses adding a substance to a medication whose correction window is closed. Example: Ibuprom added on Monday 21:14 cannot get a second substance on Wednesday.';

revoke execute on function public.medication_substances_guard_insert() from public, anon, authenticated;

create trigger medication_substances_guard_insert
  before insert on public.medication_substances
  for each row execute function public.medication_substances_guard_insert();

create or replace function public.dosage_periods_guard_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.medication_correction_window_open(new.medication_id) then
    return new;
  end if;

  -- Window of the medication closed: only a period at the end of the history passes (change_dosage). security
  -- definer, so every period of the medication counts, not only those visible to the caller.
  if exists (
    select 1 from public.dosage_periods dp
     where dp.medication_id = new.medication_id
       and dp.started_on >= new.started_on
  ) then
    raise exception
      'Nie można dodać okresu dawkowania przed istniejącym okresem: okno korekty dla tego leku jest już zamknięte, a wcześniejsza historia dawkowania jest już zapisana. Zmianę dawkowania zapisuje się jako nowy okres na końcu historii.';
  end if;

  return new;
end;
$$;

comment on function public.dosage_periods_guard_insert() is
  'Trigger: with the correction window of the medication closed, a period can be added only at the end of the history (started_on later than every existing started_on of that medication), which is what change_dosage does. A period before or between existing periods is refused. With the window open every insert passes to the other rules (no-overlap constraint, variant guard).';

revoke execute on function public.dosage_periods_guard_insert() from public, anon, authenticated;

create trigger dosage_periods_guard_insert
  before insert on public.dosage_periods
  for each row execute function public.dosage_periods_guard_insert();

-- ---------------------------------------------------------------------------
-- 5. End of the window for the screens (PostgREST computed fields)
-- ---------------------------------------------------------------------------
-- `select=id,correction_window_ends_at` on medications or dosage_periods returns the end of that row's window. The
-- functions read only the row they are given, which the caller could already read under RLS.

create or replace function public.correction_window_ends_at(public.medications)
returns timestamptz
language sql
stable
security invoker
set search_path = ''
as $$
  select public.correction_window_end($1.created_at);
$$;

comment on function public.correction_window_ends_at(public.medications) is
  'PostgREST computed field: end of the correction window of the medication (created_at + 24 h, correction_window_end). Example: added 2026-10-05 21:14 -> 2026-10-06 21:14.';

create or replace function public.correction_window_ends_at(public.dosage_periods)
returns timestamptz
language sql
stable
security invoker
set search_path = ''
as $$
  select public.correction_window_end($1.created_at);
$$;

comment on function public.correction_window_ends_at(public.dosage_periods) is
  'PostgREST computed field: end of the correction window of the dosage period (created_at + 24 h, correction_window_end). Example: a period opened by a dose change on 2026-10-09 09:00 -> 2026-10-10 09:00.';

-- The Supabase default privileges grant anon and authenticated EXECUTE on every new function in public; revoking
-- from public alone would not remove those direct grants.
revoke execute on function public.correction_window_ends_at(public.medications) from public, anon;
revoke execute on function public.correction_window_ends_at(public.dosage_periods) from public, anon;

grant execute on function public.correction_window_ends_at(public.medications) to authenticated;
grant execute on function public.correction_window_ends_at(public.dosage_periods) to authenticated;
