-- Migration: S-05 phase 4 — correcting a freshly saved dosage period (F6a from S-03).
--
-- The problem, with an example:
--   Anna changes the dose of Ibuprom on Friday at 9:00 and types "2 tabletki" instead of "1 tabletka". Until now the
--   only way to fix it was another dose change, which left a false period in the history: "2 tabletki" for one day,
--   then "1 tabletka". A second change on the same day was not even possible (DP002).
--
-- The fix:
--   correct_dosage_period rewrites the dose (and, for a registry medication, the variant) of one period while that
--   period's own correction window is open (24 hours from saving it, phase 1). The dates of the period never change,
--   so no new period appears and the history stays one period long. After the window the period is history and a
--   new dose is recorded with change_dosage, as before.
--
-- Errors, in this order (each a named SQLSTATE the route maps to a text):
--   28000  no signed-in session;
--   DP008  no such period among the caller's medications (another account's period, or none at all);
--   DP009  the correction window of the period is closed. Checked here by comparing now() with
--          correction_window_end(created_at), without the security definer window function, so the caller gets a
--          named error instead of the general message of the history guard;
--   DP005  the variant belongs to another product or composition (assert_dosage_period_variant, the same rule as
--          change_dosage and the trigger);
--   DP004  the same dose (case and outer spaces ignored, as in change_dosage) and the same variant: nothing to correct;
--   DP010  the dose and variant equal those of the period directly before. Such a "correction" fixes no typo: it
--          leaves in the history a change that never happened (two consecutive periods with the same dose). That is
--          undoing a dose change, which the product does not support yet (debt "cofnięcie zmiany" at S-06 in the
--          roadmap). The first period of a medication has no predecessor, so DP010 never applies to it.
--
-- Why security invoker: the function reads and writes as the caller, so RLS and every guard on dosage_periods
-- (history guard, variant trigger, check constraints) still apply to the update; the function adds named errors on
-- top, it does not replace them.

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
  v_previous record;
  v_current_variant uuid;
  v_variant uuid;
  v_previous_variant uuid;
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

  -- The period directly before: the latest start earlier than this period's start.
  select dp.dose_text, dp.registry_product_id into v_previous
    from public.dosage_periods dp
   where dp.medication_id = v_period.medication_id
     and dp.started_on < v_period.started_on
   order by dp.started_on desc
   limit 1;
  if found then
    v_previous_variant := case
      when v_period.composition_source = 'registry'
        then coalesce(v_previous.registry_product_id, v_period.registry_medication_id)
      else v_previous.registry_product_id
    end;
    if lower(btrim(p_dose_text)) = lower(btrim(v_previous.dose_text))
       and v_variant is not distinct from v_previous_variant then
      raise exception using
        errcode = 'DP010',
        message = 'To dawkowanie jest takie samo jak w poprzednim okresie. Taka poprawa cofnęłaby zmianę dawkowania, a cofnięcia zmiany nie da się jeszcze zapisać.';
    end if;
  end if;

  -- Dates untouched: the period keeps its place in the history. An empty dose fails on dosage_periods_dose_text_check.
  update public.dosage_periods
     set dose_text = btrim(p_dose_text),
         registry_product_id = v_variant
   where id = v_period.id;
end;
$$;

comment on function public.correct_dosage_period(uuid, text, uuid) is
  'Corrects the dose (and the registry variant) of one of the caller''s dosage periods while its correction window is open (24 hours from saving the period). Example: a dose change saved on Friday 9:00 as "2 tabletki" by mistake can be corrected to "1 tabletka" until Saturday 9:00; the period keeps its dates and no new period appears. p_registry_product_id: another variant of the same registry product (assert_dosage_period_variant); null keeps the current variant; must be null for a medication from a leaflet. Errors, checked in this order: 28000 = no signed-in session, DP008 = no such period of this account, DP009 = correction window of the period closed, DP005 = variant of another product or composition, DP004 = same dose (case and outer spaces ignored) and same variant, DP010 = same dose and variant as the period directly before (undoing a change, not supported yet); an empty dose fails on dosage_periods_dose_text_check.';

revoke execute on function public.correct_dosage_period(uuid, text, uuid) from public, anon;
grant execute on function public.correct_dosage_period(uuid, text, uuid) to authenticated;
