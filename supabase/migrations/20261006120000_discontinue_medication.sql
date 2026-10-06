-- Migration: S-04 — ending a medication with a date, correcting or cancelling that end, deleting an item added by
-- mistake.
--
-- What this migration makes possible, in plain terms, with an example for each part.
-- Technical names are in brackets, for whoever needs to find them in the code below.
--
-- A. ENDING A MEDICATION (discontinue_medication)
--
--    Example: Anna takes Ibuprom "1 tabletka" since 1 September. Her last tablet is on 9 October, so on 10 October
--    she saves "first day without the medication: 10 October".
--      - The date is the first day WITHOUT the medication, like the end date of a dosage period (exclusive bound).
--        The screen shows "taken until 9 October".
--      - One save sets the date on the medication (discontinued_on) and closes the ongoing period on the same day.
--        The medication leaves the list of current medications but stays in the history and keeps explaining the
--        symptoms written while it was taken. Nothing is deleted.
--      - The date may be today or up to 14 days back (the same limit as a dose change), never in the future: the
--        product records something that has already happened.
--      - The earliest possible date is the day after the start of the ongoing period: ending on the day the period
--        started would leave a period of zero days. An item added today by mistake is deleted instead (part D).
--
-- B. CORRECTING OR CANCELLING THE END (correct_discontinuation)
--
--    Example: Anna saved 10 October on Tuesday at 18:00, but she actually stopped on 8 October.
--      - Until Wednesday 18:00 (24 hours from saving the end, the same correction_window_end as everywhere else) she
--        can move the date or cancel the end. Moving the date moves the end of the last period with it; cancelling
--        makes the last period ongoing again and the medication current again.
--      - Moving the date does not extend the window. Cancelling and ending again is a new save with a new window.
--      - After the window the date is final, also for a direct write to the database (medications_guard_core). This
--        closes the S-02 debt: until now discontinued_on could be rewritten at any time.
--      - The moment of saving the end (discontinued_at) is set by the database clock (medications_stamp_discontinuation);
--        a client cannot send it or move it, like created_at in S-05.
--
-- C. THE HISTORY STAYS CONSISTENT ON EVERY WRITE PATH
--      - The periods follow the end date by a trigger on medications (medications_sync_discontinuation), not only in
--        the functions above, so a direct update of discontinued_on leaves the periods consistent too.
--      - An ended medication cannot get a new period (dosage_periods_guard_insert) and none of its periods can be
--        reopened or end after the end date (dosage_periods_guard_core), whatever the correction windows say. This
--        closes the S-03 debt F6b: a future end date used to let change_dosage open a period running past it. Future
--        end dates no longer exist, so change_dosage refuses every ended medication with DP001.
--
-- D. DELETING AN ITEM ADDED BY MISTAKE (delete_medication)
--      - Only within the correction window of the medication (24 hours from adding it), together with its
--        composition and periods. After that the medication explains the history and is ended with a date instead.
--        The rule itself has been in medications_guard_delete since F-01; the function adds a named error.
--
-- Errors of the three functions, each a named SQLSTATE the routes map to a text:
--   28000  no signed-in session;
--   MD001  no such medication among the caller's medications (another account's medication, or none at all);
--   MD002  discontinue_medication: the medication is already ended;
--   MD003  the date is in the future;
--   MD004  the date is more than 14 days back;
--   MD005  the date is on or before the start of the ongoing period (discontinue_medication) or of the last period
--          (correct_discontinuation);
--   MD006  discontinue_medication: the medication has no ongoing period;
--   MD007  correct_discontinuation: the medication is not ended, so there is nothing to correct;
--   MD008  correct_discontinuation: the correction window of the end is closed;
--   MD009  correct_discontinuation: the same date as the saved one;
--   MD010  delete_medication: the correction window of the medication is closed.
-- The history guards stay the last line of defence for direct writes and raise P0001 with a Polish message.
--
-- Correction to the header of 20260930120000_medication_write_and_interactions.sql (part D there), not edited there
-- because it is already applied: "Still allowed: ... setting the date it was stopped" no longer holds without limits.
-- A new end date must be within [today - 14 days, today], Polish time, and a date already set can be moved or cleared
-- only within 24 hours of saving it.
--
-- WARNING for deployment:
--   - The migration stops with a named error if production holds a medication with an end date in the future, or an
--     ended medication with an ongoing period. The application never wrote discontinued_on, so zero such rows are
--     expected; if there are any, the author decides what the history should say, the migration does not guess.
--   - Medications already ended get discontinued_at = updated_at, so their end is final at once (unless updated in
--     the last 24 hours). There is no way back other than another migration; nothing is deleted.
--
-- Order: data check, then the column with its backfill and only then its constraint, then the stamping trigger, then
-- the guards and the sync trigger, then the functions.

-- ---------------------------------------------------------------------------
-- 1. Data check: stop instead of silently repairing the history
-- ---------------------------------------------------------------------------

do $$
declare
  v_future integer;
  v_open integer;
begin
  select count(*) into v_future
    from public.medications m
   where m.discontinued_on > (now() at time zone 'Europe/Warsaw')::date;
  if v_future > 0 then
    raise exception 'S-04 migration stopped: % medication(s) have discontinued_on in the future (Europe/Warsaw). Decide what the history should say before applying this migration.', v_future;
  end if;

  select count(distinct m.id) into v_open
    from public.medications m
    join public.dosage_periods dp on dp.medication_id = m.id
   where m.discontinued_on is not null
     and dp.ended_on is null;
  if v_open > 0 then
    raise exception 'S-04 migration stopped: % ended medication(s) still have an ongoing dosage period (ended_on is null). Decide what the history should say before applying this migration.', v_open;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. The moment the end was saved: column, backfill, then the constraint
-- ---------------------------------------------------------------------------

alter table public.medications
  add column discontinued_at timestamptz;

comment on column public.medications.discontinued_at is
  'Moment the end date (discontinued_on) was saved, by the server clock (medications_stamp_discontinuation). Opens the 24-hour correction window of the end (correction_window_end). Empty exactly when discontinued_on is empty. Moving the date keeps it; cancelling the end clears it.';

-- Existing ended medications: the end counts as saved at the last change of the row, so the window is already closed
-- for anything older than 24 hours. The stamping trigger does not exist yet, so this value is kept.
update public.medications
   set discontinued_at = updated_at
 where discontinued_on is not null;

alter table public.medications
  add constraint medications_discontinued_at_check
  check ((discontinued_on is null) = (discontinued_at is null));

-- ---------------------------------------------------------------------------
-- 3. Stamping the moment of the end
-- ---------------------------------------------------------------------------

create or replace function public.medications_stamp_discontinuation()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    -- A medication is added as current; ending it is a separate, later save with its own window.
    if new.discontinued_on is not null then
      raise exception
        'Nie można dodać leku od razu zakończonego: lek zapisuje się jako przyjmowany, a zakończenie przyjmowania zapisuje się osobno, datą pierwszego dnia bez leku.';
    end if;
    new.discontinued_at := null;
    return new;
  end if;

  -- Whatever the client sent in discontinued_at is replaced: the window of the end is counted from this value.
  if old.discontinued_on is null and new.discontinued_on is not null then
    new.discontinued_at := now();
  elsif old.discontinued_on is not null and new.discontinued_on is null then
    new.discontinued_at := null;
  else
    -- Date moved, or not changed: the window keeps counting from the original save.
    new.discontinued_at := old.discontinued_at;
  end if;

  return new;
end;
$$;

comment on function public.medications_stamp_discontinuation() is
  'Trigger: sets discontinued_at by the server clock. Insert with discontinued_on is refused (a medication starts current); null -> date: now(); date -> null: null; date -> another date or unchanged: the old value. A client cannot set or move discontinued_at, so it cannot reopen a closed window of the end.';

revoke execute on function public.medications_stamp_discontinuation() from public, anon, authenticated;

create trigger medications_stamp_discontinuation
  before insert or update on public.medications
  for each row execute function public.medications_stamp_discontinuation();

-- ---------------------------------------------------------------------------
-- 4. History guard on medications: the end date
-- ---------------------------------------------------------------------------
-- Same branches and messages as 20260930120000_medication_write_and_interactions.sql, plus the discontinued_on branch,
-- which does not depend on the window of the medication.

create or replace function public.medications_guard_core()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Compares only the protected columns. BEFORE UPDATE triggers fire in name order, so medications_guard_core runs
  -- before medications_set_updated_at and medications_stamp_discontinuation; that does not matter as long as
  -- updated_at and new.discontinued_at are never compared here (old.discontinued_at is safe to read). Do not add
  -- updated_at to this list: every update changes it.
  if not public.medication_correction_window_open(old.id) then
    if new.composition_source is distinct from old.composition_source then
      raise exception
        'Nie można zmienić pola composition_source: okno korekty dla tego leku jest już zamknięte, a źródło zapisanego składu jest częścią historii. Aby odnotować inny skład, zakończ tę pozycję datą odstawienia i dodaj nową.';
    end if;

    if new.registry_medication_id is distinct from old.registry_medication_id then
      raise exception
        'Nie można zmienić pola registry_medication_id: okno korekty dla tego leku jest już zamknięte, a preparat, z którego skopiowano skład, jest częścią historii. Aby odnotować inny preparat, zakończ tę pozycję datą odstawienia i dodaj nową.';
    end if;

    if new.user_id is distinct from old.user_id then
      raise exception
        'Nie można zmienić pola user_id: okno korekty dla tego leku jest już zamknięte, a przypisanie leku do konta jest częścią historii.';
    end if;
  end if;

  if new.discontinued_on is distinct from old.discontinued_on then
    -- A date already set is history once its own window (24 hours from discontinued_at) is closed: moving or
    -- clearing it would rewrite which symptoms happened while the medication was taken.
    if old.discontinued_on is not null
       and not (now() < public.correction_window_end(old.discontinued_at)) then
      raise exception
        'Nie można zmienić pola discontinued_on: okno korekty zakończenia przyjmowania tego leku jest już zamknięte, a data zakończenia jest częścią historii.';
    end if;

    -- A new date obeys the same bounds as a dose change: not in the future, at most 14 days back, Polish time.
    -- Keep 14 equal to c_max_days_back in change_dosage, discontinue_medication and correct_discontinuation, and to
    -- the bounds in dosage_periods_guard_core and dosage_periods_guard_insert.
    if new.discontinued_on is not null
       and (new.discontinued_on > (now() at time zone 'Europe/Warsaw')::date
            or new.discontinued_on < (now() at time zone 'Europe/Warsaw')::date - 14) then
      raise exception
        'Nie można ustawić pola discontinued_on na tę datę: zakończenie przyjmowania leku zapisuje się najwyżej 14 dni wstecz i nie w przyszłości.';
    end if;
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. The periods follow the end date
-- ---------------------------------------------------------------------------
-- AFTER UPDATE: medications_guard_core (BEFORE) has already decided whether the change is allowed, and the medication
-- row already holds the new discontinued_on when the period guards below read it. security definer, so every period of
-- the medication counts, not only those visible to the caller.

create or replace function public.medications_sync_discontinuation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_period_id uuid;
begin
  if old.discontinued_on is null and new.discontinued_on is not null then
    -- Ending: the ongoing period closes on the end date.
    select dp.id into v_period_id
      from public.dosage_periods dp
     where dp.medication_id = new.id
       and dp.ended_on is null;
    if not found then
      raise exception
        'Nie można zakończyć przyjmowania leku: ten lek nie ma trwającego okresu dawkowania, który można zamknąć datą zakończenia.';
    end if;

    update public.dosage_periods
       set ended_on = new.discontinued_on
     where id = v_period_id;
  elsif old.discontinued_on is not null and new.discontinued_on is distinct from old.discontinued_on then
    -- Moving (new date) or cancelling (null): the last period of the medication follows.
    select dp.id into v_period_id
      from public.dosage_periods dp
     where dp.medication_id = new.id
     order by dp.started_on desc
     limit 1;
    if found then
      update public.dosage_periods
         set ended_on = new.discontinued_on
       where id = v_period_id;
    end if;
  end if;

  return null;
end;
$$;

comment on function public.medications_sync_discontinuation() is
  'Trigger (AFTER UPDATE OF discontinued_on): keeps the dosage periods consistent with the end date on every write path. null -> date closes the ongoing period on that date (P0001 when there is none); date -> date moves ended_on of the last period; date -> null makes the last period ongoing again. Its writes reach dosage_periods_guard_core at trigger depth 2, which is the only way the end of a closed period can follow the end date.';

revoke execute on function public.medications_sync_discontinuation() from public, anon, authenticated;

create trigger medications_sync_discontinuation
  after update of discontinued_on on public.medications
  for each row execute function public.medications_sync_discontinuation();

-- ---------------------------------------------------------------------------
-- 6. Period guard: the end of the last period follows the end date; no period runs past it
-- ---------------------------------------------------------------------------
-- Same branches and messages as 20261005120000_correction_window.sql, plus the exception for
-- medications_sync_discontinuation and the rule against periods running past the end date.

create or replace function public.dosage_periods_guard_core()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_discontinued_on date;
begin
  -- Re-pointing a period to another medication adds it to that medication's history: refused when the window of the
  -- target medication is closed, even while the period itself can still be corrected.
  if new.medication_id is distinct from old.medication_id
     and not public.medication_correction_window_open(new.medication_id) then
    raise exception
      'Nie można zmienić pola medication_id: okno korekty leku, do którego miałby trafić ten okres, jest już zamknięte, a jego historia dawkowania jest już zapisana.';
  end if;

  -- Re-pointing a period away from a medication removes it from that medication's history: refused when the window
  -- of the source medication is closed (the same rule as dosage_periods_guard_delete) or the source is ended. Without
  -- this, moving away the last period of an ended medication makes the period before it the "last" one, and
  -- correcting or cancelling the end would then rewrite the end of a period closed by a dose change.
  if new.medication_id is distinct from old.medication_id then
    if not public.medication_correction_window_open(old.medication_id) then
      raise exception
        'Nie można zmienić pola medication_id: okno korekty leku, z którego pochodzi ten okres, jest już zamknięte, a jego historia dawkowania jest już zapisana.';
    end if;
    if exists (
      select 1 from public.medications m
       where m.id = old.medication_id
         and m.discontinued_on is not null
    ) then
      raise exception
        'Nie można zmienić pola medication_id: przyjmowanie leku, z którego pochodzi ten okres, jest zakończone, a jego historia dawkowania jest już zapisana.';
    end if;
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

    -- Setting ended_on from empty to a date passes: that is how a period is closed on a dose change and when the
    -- medication is ended. Replacing an end date that is already set is blocked, with one exception (S-04): the
    -- write comes from the trigger medications_sync_discontinuation (trigger depth > 1), the period is the last one
    -- of its medication, and the new end equals the medication's current discontinued_on (also null, when the end is
    -- cancelled). Whether the end may still be corrected is decided earlier by medications_guard_core from
    -- old.discontinued_at; the window of the end is deliberately not checked here, because on cancelling
    -- discontinued_at is already cleared and a window counted from it would always be closed. A direct write by a
    -- client has depth 1 and never gets the exception. Any future trigger writing to dosage_periods also runs at
    -- depth > 1: it must be added to this condition deliberately, never by accident.
    if old.ended_on is not null and new.ended_on is distinct from old.ended_on then
      if not (
        pg_trigger_depth() > 1
        and old.id = (select dp.id from public.dosage_periods dp
                       where dp.medication_id = old.medication_id
                       order by dp.started_on desc
                       limit 1)
        and new.ended_on is not distinct from (select m.discontinued_on from public.medications m
                                                where m.id = old.medication_id)
      ) then
        raise exception
          'Nie można zmienić pola ended_on: okno korekty jest już zamknięte, a ten okres ma datę końca zapisaną w historii.';
      end if;
    end if;

    -- The new end date obeys the same bounds as change_dosage (DP003, DP007): not in the future, at most 14 days
    -- back, Polish time. Without them a direct write could close a period months back and rewrite the history
    -- after it. Keep 14 equal to c_max_days_back in change_dosage, discontinue_medication, correct_discontinuation,
    -- medications_guard_core and dosage_periods_guard_insert.
    if old.ended_on is null and new.ended_on is not null
       and (new.ended_on > (now() at time zone 'Europe/Warsaw')::date
            or new.ended_on < (now() at time zone 'Europe/Warsaw')::date - 14) then
      raise exception
        'Nie można ustawić pola ended_on na tę datę: okno korekty jest już zamknięte, a okres można zakończyć najwyżej 14 dni wstecz i nie w przyszłości.';
    end if;
  end if;

  -- Independent of every correction window (S-04): a period of an ended medication can neither be ongoing nor end
  -- after the end date. Without this, a medication added an hour ago and ended today could get its period reopened
  -- by a direct `update dosage_periods set ended_on = null` while the period's own window is open.
  -- medications_sync_discontinuation never breaks it: ending and moving set ended_on = discontinued_on, and on
  -- cancelling discontinued_on is already null.
  select m.discontinued_on into v_discontinued_on
    from public.medications m
   where m.id = new.medication_id;
  if v_discontinued_on is not null
     and (new.ended_on is null or new.ended_on > v_discontinued_on) then
    raise exception
      'Nie można zmienić pola ended_on: przyjmowanie tego leku jest zakończone, więc jego okres dawkowania nie może trwać dalej ani kończyć się po dacie zakończenia.';
  end if;

  -- The last period of an ended medication ends exactly on the end date, otherwise the details ("taken until") and
  -- the period history tell two different stories. Earlier periods only must not run past it (above).
  if v_discontinued_on is not null
     and new.ended_on is distinct from v_discontinued_on
     and not exists (
       select 1 from public.dosage_periods dp
        where dp.medication_id = new.medication_id
          and dp.id <> new.id
          and dp.started_on > new.started_on
     ) then
    raise exception
      'Nie można zmienić pola ended_on: przyjmowanie tego leku jest zakończone, a ostatni okres dawkowania kończy się w dniu zakończenia.';
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. Insert guard: no new period for an ended medication
-- ---------------------------------------------------------------------------
-- Same branches and messages as 20261005120000_correction_window.sql, plus the refusal for an ended medication, checked
-- before the window of the medication (F6b from the insert side).

create or replace function public.dosage_periods_guard_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- An ended medication stays ended; taking it again is a new item (S-04). Independent of every window.
  if exists (
    select 1 from public.medications m
     where m.id = new.medication_id
       and m.discontinued_on is not null
  ) then
    raise exception
      'Nie można dodać okresu dawkowania: przyjmowanie tego leku jest zakończone. Powrót do leku zapisuje się jako nową pozycję.';
  end if;

  if public.medication_correction_window_open(new.medication_id) then
    return new;
  end if;

  -- Window of the medication closed: only a period at the end of the history passes (change_dosage), starting
  -- within the same bounds as change_dosage (DP003, DP007): not in the future, at most 14 days back, Polish time.
  -- Keep 14 equal to c_max_days_back in change_dosage, discontinue_medication, correct_discontinuation,
  -- medications_guard_core and dosage_periods_guard_core.
  if new.started_on > (now() at time zone 'Europe/Warsaw')::date
     or new.started_on < (now() at time zone 'Europe/Warsaw')::date - 14 then
    raise exception
      'Nie można dodać okresu dawkowania z tą datą rozpoczęcia: okno korekty dla tego leku jest już zamknięte, a nowy okres może zaczynać się najwyżej 14 dni wstecz i nie w przyszłości.';
  end if;

  -- security definer, so every period of the medication counts, not only those visible to the caller.
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
  'Trigger: refuses any period for an ended medication (discontinued_on set), whatever the windows say. With the correction window of the medication closed, a period can be added only at the end of the history (started_on later than every existing started_on of that medication, not in the future and at most 14 days back, Polish time), which is what change_dosage does. A period before or between existing periods is refused. With the window open every insert passes to the other rules (no-overlap constraint, variant guard).';

-- ---------------------------------------------------------------------------
-- 8. End of the window of the end, for the screens (PostgREST computed field)
-- ---------------------------------------------------------------------------

create or replace function public.discontinuation_correction_ends_at(public.medications)
returns timestamptz
language sql
stable
security invoker
set search_path = ''
as $$
  select case when $1.discontinued_at is null then null else public.correction_window_end($1.discontinued_at) end;
$$;

comment on function public.discontinuation_correction_ends_at(public.medications) is
  'PostgREST computed field: until when the end of the medication can be moved or cancelled (discontinued_at + 24 h, correction_window_end); null for a current medication. Example: ended on Tuesday 18:00 -> Wednesday 18:00.';

-- The Supabase default privileges grant anon and authenticated EXECUTE on every new function in public; revoking
-- from public alone would not remove those direct grants.
revoke execute on function public.discontinuation_correction_ends_at(public.medications) from public, anon;
grant execute on function public.discontinuation_correction_ends_at(public.medications) to authenticated;

-- ---------------------------------------------------------------------------
-- 9. The functions the application calls
-- ---------------------------------------------------------------------------
-- security invoker: they read and write as the caller, so RLS and every guard above still apply to their writes; the
-- functions check the same conditions first and raise named errors, the guards stay the last line of defence.

create or replace function public.discontinue_medication(p_medication_id uuid, p_discontinued_on date)
returns void
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  -- How far back the end may be dated. Keep equal to c_max_days_back in change_dosage and correct_discontinuation,
  -- and to the 14-day bounds in medications_guard_core, dosage_periods_guard_core and dosage_periods_guard_insert.
  c_max_days_back constant integer := 14;
  v_user_id uuid := auth.uid();
  v_today date := (now() at time zone 'Europe/Warsaw')::date;
  v_medication record;
  v_current record;
begin
  if v_user_id is null then
    raise exception using
      errcode = '28000',
      message = 'Nie można zakończyć przyjmowania leku bez zalogowanej sesji.';
  end if;

  -- Locks the medication, so two saves of its end cannot interleave. RLS already hides another account's rows; the
  -- explicit owner filter keeps the rule also for a role that bypasses RLS.
  select m.id, m.discontinued_on into v_medication
    from public.medications m
   where m.id = p_medication_id
     and m.user_id = v_user_id
     for update;
  if not found then
    raise exception using
      errcode = 'MD001',
      message = 'Nie ma takiego leku na liście leków tego konta.';
  end if;

  if v_medication.discontinued_on is not null then
    raise exception using
      errcode = 'MD002',
      message = 'Przyjmowanie tego leku jest już zakończone.';
  end if;

  select dp.id, dp.started_on into v_current
    from public.dosage_periods dp
   where dp.medication_id = v_medication.id
     and dp.ended_on is null
     for update;
  if not found then
    raise exception using
      errcode = 'MD006',
      message = 'Ten lek nie ma trwającego okresu dawkowania, więc nie ma czego zakończyć.';
  end if;

  if p_discontinued_on > v_today then
    raise exception using
      errcode = 'MD003',
      message = 'Pierwszy dzień bez leku nie może być w przyszłości.';
  end if;

  if p_discontinued_on < v_today - c_max_days_back then
    raise exception using
      errcode = 'MD004',
      message = format('Zakończenie przyjmowania leku można zapisać najwyżej %s dni wstecz.', c_max_days_back);
  end if;

  if p_discontinued_on <= v_current.started_on then
    raise exception using
      errcode = 'MD005',
      message = 'Pierwszy dzień bez leku musi być późniejszy niż początek bieżącego okresu dawkowania.';
  end if;

  -- discontinued_at is stamped by medications_stamp_discontinuation; the ongoing period is closed by
  -- medications_sync_discontinuation.
  update public.medications
     set discontinued_on = p_discontinued_on
   where id = v_medication.id;
end;
$$;

comment on function public.discontinue_medication(uuid, date) is
  'Ends the caller''s medication. p_discontinued_on is the first day without the medication (exclusive bound, like dosage_periods.ended_on). Example: the last tablet on 2026-10-09, saved as 2026-10-10: discontinued_on = 2026-10-10, the ongoing period gets ended_on = 2026-10-10 (by the trigger medications_sync_discontinuation), discontinued_at = now(), and the end can be moved or cancelled for 24 hours (correct_discontinuation). Errors, checked in this order: 28000 = no signed-in session, MD001 = no such medication of this account, MD002 = already ended, MD006 = no ongoing period, MD003 = date in the future, MD004 = date more than 14 days back, MD005 = date on or before the start of the ongoing period.';

create or replace function public.correct_discontinuation(p_medication_id uuid, p_discontinued_on date)
returns void
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  -- Keep equal to c_max_days_back in change_dosage and discontinue_medication, and to the 14-day bounds in
  -- medications_guard_core, dosage_periods_guard_core and dosage_periods_guard_insert.
  c_max_days_back constant integer := 14;
  v_user_id uuid := auth.uid();
  v_today date := (now() at time zone 'Europe/Warsaw')::date;
  v_medication record;
  v_last_started_on date;
begin
  if v_user_id is null then
    raise exception using
      errcode = '28000',
      message = 'Nie można poprawić zakończenia przyjmowania leku bez zalogowanej sesji.';
  end if;

  select m.id, m.discontinued_on, m.discontinued_at into v_medication
    from public.medications m
   where m.id = p_medication_id
     and m.user_id = v_user_id
     for update;
  if not found then
    raise exception using
      errcode = 'MD001',
      message = 'Nie ma takiego leku na liście leków tego konta.';
  end if;

  if v_medication.discontinued_on is null then
    raise exception using
      errcode = 'MD007',
      message = 'Przyjmowanie tego leku nie jest zakończone, więc nie ma czego poprawiać.';
  end if;

  -- Compared here without the guard, so the caller gets a named error instead of the general guard message.
  if not (now() < public.correction_window_end(v_medication.discontinued_at)) then
    raise exception using
      errcode = 'MD008',
      message = 'Okno korekty zakończenia przyjmowania tego leku jest już zamknięte. Data zakończenia jest częścią historii.';
  end if;

  -- null cancels the end; the remaining rules are about a new date.
  if p_discontinued_on is null then
    update public.medications
       set discontinued_on = null
     where id = v_medication.id;
    return;
  end if;

  if p_discontinued_on = v_medication.discontinued_on then
    raise exception using
      errcode = 'MD009',
      message = 'Ta data zakończenia jest już zapisana.';
  end if;

  if p_discontinued_on > v_today then
    raise exception using
      errcode = 'MD003',
      message = 'Pierwszy dzień bez leku nie może być w przyszłości.';
  end if;

  if p_discontinued_on < v_today - c_max_days_back then
    raise exception using
      errcode = 'MD004',
      message = format('Zakończenie przyjmowania leku można zapisać najwyżej %s dni wstecz.', c_max_days_back);
  end if;

  -- The last period is the one the end closed; its start is the earliest bound for the new date.
  select dp.started_on into v_last_started_on
    from public.dosage_periods dp
   where dp.medication_id = v_medication.id
   order by dp.started_on desc
   limit 1;
  if p_discontinued_on <= v_last_started_on then
    raise exception using
      errcode = 'MD005',
      message = 'Pierwszy dzień bez leku musi być późniejszy niż początek ostatniego okresu dawkowania.';
  end if;

  -- discontinued_at stays (medications_stamp_discontinuation): moving the date does not extend the window.
  update public.medications
     set discontinued_on = p_discontinued_on
   where id = v_medication.id;
end;
$$;

comment on function public.correct_discontinuation(uuid, date) is
  'Moves or cancels the end of the caller''s medication while the window of the end is open (24 hours from discontinued_at). p_discontinued_on: the new first day without the medication, or null to cancel the end. Example: ended on Tuesday 18:00 with 2026-10-10; until Wednesday 18:00 it can become 2026-10-08 (the last period then ends on 2026-10-08) or be cancelled (the last period is ongoing again and the medication is current). Moving keeps discontinued_at, so the window is not extended. Errors, checked in this order: 28000 = no signed-in session, MD001 = no such medication of this account, MD007 = the medication is not ended, MD008 = window of the end closed, MD009 = the same date, MD003 = date in the future, MD004 = date more than 14 days back, MD005 = date on or before the start of the last period.';

create or replace function public.delete_medication(p_medication_id uuid)
returns void
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_medication record;
begin
  if v_user_id is null then
    raise exception using
      errcode = '28000',
      message = 'Nie można usunąć leku bez zalogowanej sesji.';
  end if;

  select m.id, m.created_at into v_medication
    from public.medications m
   where m.id = p_medication_id
     and m.user_id = v_user_id
     for update;
  if not found then
    raise exception using
      errcode = 'MD001',
      message = 'Nie ma takiego leku na liście leków tego konta.';
  end if;

  -- The same window medications_guard_delete enforces (via medication_correction_window_open), compared here
  -- directly, like DP009 in correct_dosage_period, so the caller gets a named error.
  if not (now() < public.correction_window_end(v_medication.created_at)) then
    raise exception using
      errcode = 'MD010',
      message = 'Okno korekty tego leku jest już zamknięte, więc nie można go usunąć. Zakończenie przyjmowania zapisuje się datą.';
  end if;

  -- The composition and the periods go with it (on delete cascade).
  delete from public.medications
   where id = v_medication.id;
end;
$$;

comment on function public.delete_medication(uuid) is
  'Permanently deletes the caller''s medication added by mistake, with its composition and dosage periods, while the correction window of the medication is open (24 hours from adding it). Example: Ibuprom added on Monday 21:14 by mistake can be deleted until Tuesday 21:14; after that it is ended with a date (discontinue_medication). Errors, checked in this order: 28000 = no signed-in session, MD001 = no such medication of this account, MD010 = correction window of the medication closed.';

-- The Supabase default privileges grant anon and authenticated EXECUTE on every new function in public; revoking
-- from public alone would not remove those direct grants.
revoke execute on function public.discontinue_medication(uuid, date) from public, anon;
revoke execute on function public.correct_discontinuation(uuid, date) from public, anon;
revoke execute on function public.delete_medication(uuid) from public, anon;

grant execute on function public.discontinue_medication(uuid, date) to authenticated;
grant execute on function public.correct_discontinuation(uuid, date) to authenticated;
grant execute on function public.delete_medication(uuid) to authenticated;
