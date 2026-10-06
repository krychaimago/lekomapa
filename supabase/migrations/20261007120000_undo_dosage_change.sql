-- Migration: S-06 phase 1 — undoing a dose change saved by mistake (debt DP010 from S-05).
--
-- The problem, with an example:
--   Anna takes Euthyrox "50 µg" since 1 September. On Friday at 9:00 she saves a dose change to "75 µg" — on the wrong
--   medication. correct_dosage_period refuses to correct the new period back to "50 µg" (DP010: that would leave two
--   periods with the same dose next to each other), and the period cannot be deleted either: deleting a period asked
--   about the window of the medication, closed long ago. The change that never happened stayed in the history, and
--   the question to the doctor (S-06) would show it at the top.
--
-- The fix, in plain terms:
--   Until Saturday 9:00 (24 hours from saving the new period, its own correction window) Anna can undo the change: the
--   period from Friday disappears and "50 µg" is ongoing again, with no end date. Only the newest period of a current
--   medication can be undone, and never the first one (that is the start of the medication, not a change; a medication
--   added by mistake is deleted as a whole). An ended medication first gets its end cancelled.
--
-- What changes, technical names in brackets:
--   A. Deleting a period (dosage_periods_guard_delete) passes in one more case: the window of THIS period is open
--      (dosage_period_correction_window_open), it is the newest period of its medication, it has a period before it,
--      and the medication is not ended. The rule lives in the guard, so a direct delete through the API follows it
--      too (lesson "Ograniczenie na tabeli podrzędnej nie chroni, dopóki rodzic go nie ma").
--   B. The period before is reopened by a trigger (dosage_periods_reopen_previous, AFTER DELETE), only as an effect
--      of that delete: when the deleted period was the newest one and the period before it ended on its start. On a
--      cascade from a deleted medication nothing happens. The reopening passes dosage_periods_guard_core through the
--      exception it already has for trigger writes (depth > 1, the newest period, end equal to the empty
--      discontinued_on); only the comment above that exception changes. A direct `update ... set ended_on = null`
--      on a closed period still has depth 1 and is still refused.
--   C. undo_dosage_change(p_period_id) adds named errors on top of the guard, so the screen can explain a refusal.
--   D. The message of DP010 in correct_dosage_period points to undoing the change instead of saying it is not
--      possible yet. Correction to the header of 20261005140000_correct_dosage_period.sql (DP010, "which the product
--      does not support yet"), not edited there because it is already applied: undoing is now undo_dosage_change.
--
-- Errors of undo_dosage_change, each a named SQLSTATE the route maps to a text, checked in this order:
--   28000  no signed-in session;
--   DP008  no such period among the caller's medications (another account's period, or none at all);
--   DP011  the period is the first period of its medication: the start of the medication, not a change;
--   DP012  the period is not the newest one of its medication;
--   DP013  the medication is ended;
--   DP009  the correction window of the period is closed.
--
-- No data to recompute: only functions and triggers change.

-- ---------------------------------------------------------------------------
-- 1. Deleting a period: the newest period of a current medication within its own window
-- ---------------------------------------------------------------------------
-- Same branches and message as 20261005120000_correction_window.sql, plus the undo branch.

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

  -- Window of the medication open: a medication added by mistake can still lose any of its periods.
  if public.medication_correction_window_open(old.medication_id) then
    return old;
  end if;

  -- Undoing a dose change (S-06): the period opened by the change, while its own window is open, if it is still the
  -- newest period of a current medication and has a period before it (dosage_periods_reopen_previous reopens that
  -- one). Example: medication added in September, dose changed on Friday 9:00 by mistake — the Friday period can be
  -- deleted until Saturday 9:00, and only while no later change and no end date have been saved after it. The first
  -- period is the start of the medication, not a change; an older period would leave a gap in the history.
  -- security definer, so every period of the medication counts, not only those visible to the caller.
  if public.dosage_period_correction_window_open(old.id)
     and exists (
       select 1 from public.dosage_periods dp
        where dp.medication_id = old.medication_id
          and dp.started_on < old.started_on
     )
     and not exists (
       select 1 from public.dosage_periods dp
        where dp.medication_id = old.medication_id
          and dp.started_on > old.started_on
     )
     and exists (
       select 1 from public.medications m
        where m.id = old.medication_id
          and m.discontinued_on is null
     ) then
    return old;
  end if;

  -- Any other period is history: deleting it would leave the medication with no ongoing dose and no stop date, or a
  -- gap that never happened. A fresh period is corrected with correct_dosage_period.
  raise exception
    'Nie można usunąć okresu dawkowania: okno korekty leku jest już zamknięte, a ten okres należy do historii. Pomyłkę w dawce świeżego okresu poprawia się w jego oknie korekty, a zakończenie okresu zapisuje się datą w polu ended_on.';
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. The period before is reopened as an effect of the delete
-- ---------------------------------------------------------------------------
-- AFTER DELETE: dosage_periods_guard_delete (BEFORE) has already decided whether the delete is allowed, and the deleted
-- row is no longer visible, so the period before it is now the newest one. Its write reaches dosage_periods_guard_core
-- at trigger depth 2, where the existing exception for trigger writes lets it through.

create or replace function public.dosage_periods_reopen_previous()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Cascade from a deleted medication (or account): nothing to reopen.
  if not exists (select 1 from public.medications m where m.id = old.medication_id) then
    return null;
  end if;

  -- Only the newest period hands the ongoing dose back. Deleting an earlier period (possible only while the window of
  -- the medication is open) leaves the periods around it as they are: reopening the one before would overlap the one
  -- after.
  if exists (
    select 1 from public.dosage_periods dp
     where dp.medication_id = old.medication_id
       and dp.started_on > old.started_on
  ) then
    return null;
  end if;

  -- The period directly before ended on the start of the deleted one (a dose change closes the old period on the date
  -- the new one starts). A period ending earlier is separated by a gap and stays closed.
  update public.dosage_periods
     set ended_on = null
   where medication_id = old.medication_id
     and ended_on = old.started_on;

  return null;
end;
$$;

comment on function public.dosage_periods_reopen_previous() is
  'Trigger (AFTER DELETE on dosage_periods): when the deleted period was the newest one of an existing medication, the period that ended on its start becomes ongoing again (ended_on = null). Example: 50 µg [2026-09-01, 2026-10-09), 75 µg from 2026-10-09 saved by mistake; deleting the 75 µg period makes 50 µg ongoing from 2026-09-01. Nothing on a cascade from a deleted medication, nothing when a later period exists. Its write reaches dosage_periods_guard_core at trigger depth 2, which is the only way an end date already set can be cleared by an undo.';

revoke execute on function public.dosage_periods_reopen_previous() from public, anon, authenticated;

create trigger dosage_periods_reopen_previous
  after delete on public.dosage_periods
  for each row execute function public.dosage_periods_reopen_previous();

-- ---------------------------------------------------------------------------
-- 3. Period guard: only the comment above the trigger exception changes
-- ---------------------------------------------------------------------------
-- Same body as 20261006120000_discontinue_medication.sql. The condition of the exception for trigger writes is
-- unchanged; the comment above it now names dosage_periods_reopen_previous next to medications_sync_discontinuation.

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
    -- write comes from a trigger (trigger depth > 1), the period is the last one of its medication, and the new end
    -- equals the medication's current discontinued_on (also null, when the end is cancelled). Two triggers write here
    -- and both fit this condition as it stands:
    --   - medications_sync_discontinuation (S-04): ending, moving or cancelling the end of the medication. Whether
    --     the end may still be corrected is decided earlier by medications_guard_core from old.discontinued_at; the
    --     window of the end is deliberately not checked here, because on cancelling discontinued_at is already
    --     cleared and a window counted from it would always be closed.
    --   - dosage_periods_reopen_previous (S-06): after the last period of a current medication is deleted (undoing a
    --     dose change), the period before it becomes the last one and is reopened (ended_on = null, equal to the
    --     empty discontinued_on). Whether the delete may happen is decided earlier by dosage_periods_guard_delete.
    -- A direct write by a client has depth 1 and never gets the exception. Any future trigger writing to
    -- dosage_periods also runs at depth > 1: it must be added to this list deliberately, never by accident.
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
-- 4. The function the application calls
-- ---------------------------------------------------------------------------
-- security invoker: it reads and deletes as the caller, so RLS and every guard above still apply to the delete; the
-- function checks the same conditions first and raises named errors, the guards stay the last line of defence. The
-- window is compared directly with correction_window_end, like DP009 in correct_dosage_period: the security definer
-- dosage_period_correction_window_open has no EXECUTE for authenticated.

create or replace function public.undo_dosage_change(p_period_id uuid)
returns void
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_period record;
begin
  if v_user_id is null then
    raise exception using
      errcode = '28000',
      message = 'Nie można cofnąć zmiany dawkowania bez zalogowanej sesji.';
  end if;

  -- Locks the medication before the checks, so an undo cannot interleave with a dose change, an end date or another
  -- undo of the same medication. RLS already hides another account's rows; the explicit owner filter keeps the rule
  -- also for a role that bypasses RLS.
  select dp.id, dp.medication_id, dp.started_on, dp.created_at, m.discontinued_on
    into v_period
    from public.dosage_periods dp
    join public.medications m on m.id = dp.medication_id
   where dp.id = p_period_id
     and m.user_id = v_user_id
     for update of m;
  if not found then
    raise exception using
      errcode = 'DP008',
      message = 'Nie ma takiego okresu dawkowania na liście leków tego konta.';
  end if;

  if not exists (
    select 1 from public.dosage_periods dp
     where dp.medication_id = v_period.medication_id
       and dp.started_on < v_period.started_on
  ) then
    raise exception using
      errcode = 'DP011',
      message = 'To pierwszy okres dawkowania tego leku, czyli jego początek, a nie zmiana dawkowania. Lek dodany przez pomyłkę usuwa się w oknie korekty leku.';
  end if;

  if exists (
    select 1 from public.dosage_periods dp
     where dp.medication_id = v_period.medication_id
       and dp.started_on > v_period.started_on
  ) then
    raise exception using
      errcode = 'DP012',
      message = 'Cofnąć można tylko najnowszą zmianę dawkowania tego leku.';
  end if;

  if v_period.discontinued_on is not null then
    raise exception using
      errcode = 'DP013',
      message = 'Przyjmowanie tego leku jest zakończone. Zmianę dawkowania można cofnąć dopiero po cofnięciu zakończenia.';
  end if;

  if not (now() < public.correction_window_end(v_period.created_at)) then
    raise exception using
      errcode = 'DP009',
      message = 'Okno korekty tego okresu dawkowania jest już zamknięte. Zmiana dawkowania jest częścią historii.';
  end if;

  -- dosage_periods_reopen_previous makes the period before ongoing again.
  delete from public.dosage_periods
   where id = v_period.id;
end;
$$;

comment on function public.undo_dosage_change(uuid) is
  'Undoes a dose change of the caller''s medication saved by mistake: deletes the newest dosage period while its correction window is open (24 hours from saving it), and the period before it becomes ongoing again (trigger dosage_periods_reopen_previous). Example: 50 µg since 2026-09-01, a change to 75 µg saved on Friday 9:00 by mistake; until Saturday 9:00 the 75 µg period can be undone and 50 µg is ongoing again with no end date. Errors, checked in this order: 28000 = no signed-in session, DP008 = no such period of this account, DP011 = the first period of the medication (its start, not a change), DP012 = not the newest period, DP013 = the medication is ended, DP009 = correction window of the period closed.';

-- The Supabase default privileges grant anon and authenticated EXECUTE on every new function in public; revoking
-- from public alone would not remove those direct grants.
revoke execute on function public.undo_dosage_change(uuid) from public, anon;
grant execute on function public.undo_dosage_change(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. DP010 in correct_dosage_period points to the undo
-- ---------------------------------------------------------------------------
-- Same body as 20261005140000_correct_dosage_period.sql; only the text of DP010 and the function comment change.
-- `create or replace` keeps its privileges (EXECUTE for authenticated only).

create or replace function public.correct_dosage_period(
  p_period_id uuid,
  p_dose_text text,
  p_registry_product_id uuid
)
returns void
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_period record;
  v_neighbour record;
  v_current_variant uuid;
  v_variant uuid;
  v_neighbour_variant uuid;
begin
  if v_user_id is null then
    raise exception using
      errcode = '28000',
      message = 'Nie można poprawić dawkowania bez zalogowanej sesji.';
  end if;

  -- Locks the period, so a correction cannot interleave with a dose change closing the same period. RLS already
  -- hides another account's rows; the explicit owner filter keeps the rule also for a role that bypasses RLS.
  select dp.id, dp.medication_id, dp.dose_text, dp.started_on, dp.registry_product_id, dp.created_at,
         m.composition_source, m.registry_medication_id
    into v_period
    from public.dosage_periods dp
    join public.medications m on m.id = dp.medication_id
   where dp.id = p_period_id
     and m.user_id = v_user_id
     for update of dp;
  if not found then
    raise exception using
      errcode = 'DP008',
      message = 'Nie ma takiego okresu dawkowania na liście leków tego konta.';
  end if;

  if not (now() < public.correction_window_end(v_period.created_at)) then
    raise exception using
      errcode = 'DP009',
      message = 'Okno korekty tego okresu dawkowania jest już zamknięte. Nowe dawkowanie zapisuje się jako zmianę dawkowania.';
  end if;

  if v_period.composition_source = 'registry' then
    -- Same fallback as change_dosage: a period without a variant takes the one the medication was added with.
    v_current_variant := coalesce(v_period.registry_product_id, v_period.registry_medication_id);
    -- No variant given means: keep the current one.
    v_variant := coalesce(p_registry_product_id, v_current_variant);
  else
    v_current_variant := v_period.registry_product_id;
    v_variant := p_registry_product_id;
  end if;

  if v_variant is distinct from v_current_variant then
    perform public.assert_dosage_period_variant(v_period.medication_id, v_variant);
  end if;

  if lower(btrim(p_dose_text)) = lower(btrim(v_period.dose_text))
     and v_variant is not distinct from v_current_variant then
    raise exception using
      errcode = 'DP004',
      message = 'To dawkowanie jest już zapisane w tym okresie.';
  end if;

  -- The periods directly before and directly after: the latest start earlier and the earliest start later than this
  -- period's start. The first period has no predecessor and the ongoing one no successor; a missing neighbour is
  -- simply not compared.
  for v_neighbour in
    (select dp.dose_text, dp.registry_product_id
       from public.dosage_periods dp
      where dp.medication_id = v_period.medication_id
        and dp.started_on < v_period.started_on
      order by dp.started_on desc
      limit 1)
    union all
    (select dp.dose_text, dp.registry_product_id
       from public.dosage_periods dp
      where dp.medication_id = v_period.medication_id
        and dp.started_on > v_period.started_on
      order by dp.started_on asc
      limit 1)
  loop
    v_neighbour_variant := case
      when v_period.composition_source = 'registry'
        then coalesce(v_neighbour.registry_product_id, v_period.registry_medication_id)
      else v_neighbour.registry_product_id
    end;
    if lower(btrim(p_dose_text)) = lower(btrim(v_neighbour.dose_text))
       and v_variant is not distinct from v_neighbour_variant then
      raise exception using
        errcode = 'DP010',
        message = 'To dawkowanie jest takie samo jak w okresie bezpośrednio przed tym okresem albo po nim. Taka poprawa usunęłaby z historii zmianę dawkowania. Zmianę zapisaną przez pomyłkę cofa się w oknie korekty jej okresu, przez cofnięcie zmiany dawkowania.';
    end if;
  end loop;

  -- Dates untouched: the period keeps its place in the history. An empty dose fails on dosage_periods_dose_text_check.
  update public.dosage_periods
     set dose_text = btrim(p_dose_text),
         registry_product_id = v_variant
   where id = v_period.id;
end;
$$;

comment on function public.correct_dosage_period(uuid, text, uuid) is
  'Corrects the dose (and the registry variant) of one of the caller''s dosage periods while its correction window is open (24 hours from saving the period). Example: a dose change saved on Friday 9:00 as "2 tabletki" by mistake can be corrected to "1 tabletka" until Saturday 9:00; the period keeps its dates and no new period appears. p_registry_product_id: another variant of the same registry product (assert_dosage_period_variant); null keeps the current variant; must be null for a medication from a leaflet. Errors, checked in this order: 28000 = no signed-in session, DP008 = no such period of this account, DP009 = correction window of the period closed, DP005 = variant of another product or composition, DP004 = same dose (case and outer spaces ignored) and same variant, DP010 = same dose and variant as the period directly before or directly after (that would be undoing a change, which is undo_dosage_change); an empty dose fails on dosage_periods_dose_text_check.';

