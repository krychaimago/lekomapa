-- Migration: S-03 review fixes (impl-review F1, F2, F3, F4, F7) — the variant rule of a dosage period holds for every
-- write, not only for change_dosage.
--
-- The problem, with an example:
--   Anna takes Sartesta 10 mg + 160 mg (amlodipine + valsartan). change_dosage refuses to give her next period the
--   variant Sartesta 24 mg + 26 mg (sacubitril + valsartan): same name, different composition (DP005). But the
--   policy dosage_periods_insert_authenticated lets her insert a period straight into dosage_periods through the API,
--   and nothing checked the variant there. The history screen would then show the strength of a product she never
--   took. The same went for an update of registry_product_id while the correction window is open (today: always).
--   Only her own account is affected; RLS still keeps other accounts out.
--
-- The fix:
--   A. One function holds the rule (assert_dosage_period_variant). The variant of a period must be:
--        - empty, or
--        - for a medication from a leaflet: always empty (it has no registry variants),
--        - for a medication from the registry: the variant it was added with, or another variant with the same name
--          (case ignored) and the same composition (the set of ATC codes and the set of substance names without a
--          code, compared without case and outer spaces).
--      Anything else is refused with DP005, the same code change_dosage already used.
--   B. A trigger on dosage_periods (dosage_periods_guard_variant) calls it before every insert and before every
--      update that touches registry_product_id or medication_id. Re-pointing a period to another medication can
--      break the rule as much as changing its variant.
--   C. change_dosage calls the same function instead of its own copy of the rule. The order of its errors does not
--      change: DP005 is still checked before DP004 and the date rules.
--   D. The dose change screen asks the database for the allowed variants by medication id (registry_variants_of)
--      instead of looking them up by name in the URL and filtering them with a copy of the rule (impl-review F3).
--   E. change_dosage reports a missing medication as DP008 instead of P0002 (impl-review F4), see section C.
--   F. The functions that add a medication save the dose with outer spaces removed, like change_dosage (F7).
--
-- Why security invoker: the function reads the medication with the caller's rights. Another account's medication is
-- invisible under RLS, so the function lets the row through and the insert policy refuses it — the caller learns
-- nothing about another account's medication from a DP005. The history guards (security definer) are not needed
-- here, because the rule does not depend on data the caller cannot see.
--
-- Correction to the header of 20261004120000_dosage_change.sql (impl-review F2), not edited there because it is
-- already applied: the DP007 note "An older change is saved by stopping the medication and adding it again" is no
-- longer advice. Stopping a medication does not exist yet (S-04), and the workaround would leave two items of the
-- same medication with different doses at the same time. A change older than 14 days has no path for now; S-05
-- decides it together with the correction window. The message shown to the user says only the 14-day limit.
--
-- Periods without a variant stay allowed for registry medications: such rows exist from before 20261004120000 and
-- from direct inserts in the SQL checks; an empty variant makes no claim about the strength taken.

-- ---------------------------------------------------------------------------
-- A. The rule
-- ---------------------------------------------------------------------------

create or replace function public.assert_dosage_period_variant(p_medication_id uuid, p_variant uuid)
returns void
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_medication record;
  v_variant_name text;
  v_base_name text;
begin
  if p_variant is null then
    return;
  end if;

  select m.id, m.composition_source, m.registry_medication_id into v_medication
    from public.medications m
   where m.id = p_medication_id;
  -- Not visible: another account's medication (RLS) or no such row. The insert policy or the foreign key refuses it.
  if not found then
    return;
  end if;

  if v_medication.composition_source <> 'registry' then
    raise exception using
      errcode = 'DP005',
      message = 'Lek dodany z ulotki nie ma wariantów z rejestru. Zmianę mocy zapisuje się w treści dawkowania.';
  end if;

  if p_variant = v_medication.registry_medication_id then
    return;
  end if;

  select rp.product_name into v_variant_name
    from public.registry_products rp
   where rp.id = p_variant;
  select rp.product_name into v_base_name
    from public.registry_products rp
   where rp.id = v_medication.registry_medication_id;

  -- Another product: a different name (case ignored), or no such registry row at all.
  if v_variant_name is null or lower(v_variant_name) is distinct from lower(v_base_name) then
    raise exception using
      errcode = 'DP005',
      message = 'Wybrany wariant to inny preparat. Inny preparat zapisuje się jako nowy lek.';
  end if;

  -- Another composition: the set of ATC codes, or the set of substance names without a code, differs from the
  -- composition saved with the medication. Names are compared without case and outer spaces.
  if (select coalesce(array_agg(distinct rs.atc_code order by rs.atc_code), '{}')
        from public.registry_substances rs
       where rs.registry_product_id = p_variant and rs.atc_code is not null)
     is distinct from
     (select coalesce(array_agg(distinct ms.atc_code order by ms.atc_code), '{}')
        from public.medication_substances ms
       where ms.medication_id = v_medication.id and ms.atc_code is not null)
     or
     (select coalesce(array_agg(distinct lower(btrim(rs.substance_name)) order by lower(btrim(rs.substance_name))), '{}')
        from public.registry_substances rs
       where rs.registry_product_id = p_variant and rs.atc_code is null)
     is distinct from
     (select coalesce(array_agg(distinct lower(btrim(ms.substance_name)) order by lower(btrim(ms.substance_name))), '{}')
        from public.medication_substances ms
       where ms.medication_id = v_medication.id and ms.atc_code is null)
  then
    raise exception using
      errcode = 'DP005',
      message = 'Wybrany wariant ma inny skład niż zapisany lek. Inny skład zapisuje się jako nowy lek.';
  end if;
end;
$$;

comment on function public.assert_dosage_period_variant(uuid, uuid) is
  'The variant rule of a dosage period, shared by change_dosage and the trigger dosage_periods_guard_variant. Passes for an empty variant, for the variant the medication was added with, and for another variant of the same registry product (same name, case ignored, same composition). Raises DP005 for a variant of another name or composition, a variant missing from the registry, and any variant for a leaflet medication. Example: Sartesta 10 mg + 160 mg -> Sartesta 24 mg + 26 mg is DP005 (another composition). security invoker: another account''s medication is invisible, so the function passes and RLS refuses the row.';

-- The trigger and change_dosage (both security invoker) call it as the signed-in caller, so authenticated keeps
-- EXECUTE. Calling it directly through the API only answers about the caller's own medications.
revoke execute on function public.assert_dosage_period_variant(uuid, uuid) from public, anon;
grant execute on function public.assert_dosage_period_variant(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- B. The trigger on every write path
-- ---------------------------------------------------------------------------

create or replace function public.dosage_periods_guard_variant()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  perform public.assert_dosage_period_variant(new.medication_id, new.registry_product_id);
  return new;
end;
$$;

comment on function public.dosage_periods_guard_variant() is
  'Trigger: applies assert_dosage_period_variant to every inserted period and to every update of registry_product_id or medication_id, so a direct write through the API follows the same variant rule as change_dosage.';

revoke execute on function public.dosage_periods_guard_variant() from public, anon, authenticated;

create trigger dosage_periods_guard_variant
  before insert or update of registry_product_id, medication_id on public.dosage_periods
  for each row execute function public.dosage_periods_guard_variant();

-- ---------------------------------------------------------------------------
-- C. change_dosage uses the shared rule
-- ---------------------------------------------------------------------------
-- Body unchanged from 20261004120000_dosage_change.sql except the variant block and DP008 in place of P0002
-- (impl-review F4). Same signature, so `create or replace` keeps the privileges set there; the comment is replaced
-- below because it lists the error codes.

create or replace function public.change_dosage(
  p_medication_id uuid,
  p_dose_text text,
  p_changed_on date,
  p_registry_product_id uuid default null
)
returns uuid
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  -- How far back a dose change may be dated. Keep equal to DOSAGE_CHANGE_MAX_DAYS_BACK in
  -- src/lib/services/medications.ts; align both with the correction window once S-05 defines it.
  c_max_days_back constant integer := 14;
  v_user_id uuid := auth.uid();
  v_today date := (now() at time zone 'Europe/Warsaw')::date;
  v_medication record;
  v_current record;
  v_current_variant uuid;
  v_variant uuid;
  v_new_period_id uuid;
begin
  if v_user_id is null then
    raise exception using
      errcode = '28000',
      message = 'Nie można zmienić dawkowania bez zalogowanej sesji.';
  end if;

  -- Locks the medication, so two dose changes of the same medication cannot interleave. RLS already hides another
  -- account's rows; the explicit owner filter keeps the rule also for a role that bypasses RLS.
  select m.id, m.composition_source, m.registry_medication_id, m.discontinued_on into v_medication
    from public.medications m
   where m.id = p_medication_id
     and m.user_id = v_user_id
     for update;
  if not found then
    -- DP008, not P0002: measured in S-03, P0002 reaches the API as HTTP 500 without its code, so the route could not
    -- tell a missing medication from any other failure. Codes of the DP class arrive as error.code.
    raise exception using
      errcode = 'DP008',
      message = 'Nie ma takiego leku na liście leków tego konta.';
  end if;

  if v_medication.discontinued_on is not null and v_medication.discontinued_on <= v_today then
    raise exception using
      errcode = 'DP001',
      message = 'Nie można zmienić dawkowania leku, który został odstawiony.';
  end if;

  select dp.id, dp.dose_text, dp.started_on, dp.registry_product_id into v_current
    from public.dosage_periods dp
   where dp.medication_id = v_medication.id
     and dp.ended_on is null
     for update;
  if not found then
    raise exception using
      errcode = 'DP006',
      message = 'Ten lek nie ma trwającego okresu dawkowania, więc nie ma czego zmienić.';
  end if;

  if v_medication.composition_source = 'registry' then
    -- A period without a variant (written before 20261004120000 by a direct insert) falls back to the variant the
    -- medication was added with.
    v_current_variant := coalesce(v_current.registry_product_id, v_medication.registry_medication_id);
    -- No variant given means: keep the current one.
    v_variant := coalesce(p_registry_product_id, v_current_variant);
  else
    v_current_variant := null;
    v_variant := p_registry_product_id;
  end if;

  -- DP005 before the dose and date rules, as before. The insert below passes the same rule again in the trigger.
  if v_variant is distinct from v_current_variant then
    perform public.assert_dosage_period_variant(v_medication.id, v_variant);
  end if;

  -- Before the date rules on purpose: a repeated save (back button, resubmit) has the same dose and a date equal to
  -- the start of the period it just opened, and must say "already saved", not "date too early".
  if lower(btrim(p_dose_text)) = lower(btrim(v_current.dose_text))
     and v_variant is not distinct from v_current_variant then
    raise exception using
      errcode = 'DP004',
      message = 'To dawkowanie jest już zapisane jako bieżące.';
  end if;

  if p_changed_on > v_today then
    raise exception using
      errcode = 'DP003',
      message = 'Data zmiany dawkowania nie może być w przyszłości.';
  end if;

  if p_changed_on < v_today - c_max_days_back then
    raise exception using
      errcode = 'DP007',
      message = format('Datę zmiany dawkowania można cofnąć najwyżej o %s dni.', c_max_days_back);
  end if;

  if p_changed_on <= v_current.started_on then
    raise exception using
      errcode = 'DP002',
      message = 'Data zmiany dawkowania musi być późniejsza niż początek bieżącego okresu.';
  end if;

  update public.dosage_periods
     set ended_on = p_changed_on
   where id = v_current.id;

  insert into public.dosage_periods (medication_id, dose_text, started_on, registry_product_id)
  values (v_medication.id, btrim(p_dose_text), p_changed_on, v_variant)
  returning id into v_new_period_id;

  return v_new_period_id;
end;
$$;

comment on function public.change_dosage(uuid, text, date, uuid) is
  'Changes the dose of the caller''s medication. Example: "1 tablet in the morning" since 2026-09-01, changed on 2026-10-10 to "2 tablets in the morning": the current period gets ended_on = 2026-10-10 (exclusive bound, last day 2026-10-09) and a new period starts on 2026-10-10; both in one transaction. Returns the id of the new period. p_registry_product_id: another variant of the same registry product (same name, case ignored, same composition — assert_dosage_period_variant), e.g. Ibuprom 200 mg -> Ibuprom 400 mg; null keeps the current variant; must be null for a medication from a leaflet. Errors, checked in this order: 28000 = no signed-in session, DP008 = no such medication of this account, DP001 = medication stopped (discontinued_on today or earlier, Polish time), DP006 = no ongoing period, DP005 = variant of another product, of another composition, or any variant for a leaflet medication, DP004 = same dose (case and outer spaces ignored) and same variant, DP003 = date in the future, DP007 = date more than 14 days back, DP002 = date on or before the start of the current period; an empty dose fails on dosage_periods_dose_text_check.';

-- ---------------------------------------------------------------------------
-- D. Variants offered on the dose change screen (impl-review F3)
-- ---------------------------------------------------------------------------
-- The screen used to look variants up with `?product_name=ilike.<name>`: the medication name travelled in the URL of
-- the request to the API and could land in its logs. Now it sends only the medication id (RPC, POST body) and gets
-- back only variant ids. The function applies assert_dosage_period_variant to every variant with the same name, so
-- the screen offers exactly the variants a dose change accepts — one rule, no copy in the application.
-- Example: for Sartesta 10 mg + 160 mg it returns the amlodipine + valsartan variants, never Sartesta 24 mg + 26 mg.
-- A leaflet medication, another account's medication (invisible under RLS) or a missing one gives an empty list.

create or replace function public.registry_variants_of(p_medication_id uuid)
returns setof uuid
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_medication record;
  v_base_name text;
  v_variant uuid;
begin
  select m.composition_source, m.registry_medication_id into v_medication
    from public.medications m
   where m.id = p_medication_id;
  if not found or v_medication.composition_source <> 'registry' then
    return;
  end if;

  select rp.product_name into v_base_name
    from public.registry_products rp
   where rp.id = v_medication.registry_medication_id;

  for v_variant in
    select rp.id
      from public.registry_products rp
     where lower(rp.product_name) = lower(v_base_name)
     order by rp.id
  loop
    begin
      perform public.assert_dosage_period_variant(p_medication_id, v_variant);
      return next v_variant;
    exception when sqlstate 'DP005' then
      null;
    end;
  end loop;
end;
$$;

comment on function public.registry_variants_of(uuid) is
  'Ids of the registry variants a dose change of the caller''s medication accepts: the same product name (case ignored) and the same composition, checked by assert_dosage_period_variant. The variant the medication was added with is always included. Empty for a leaflet medication and for a medication the caller cannot see. Called by the dose change screen instead of a name lookup, so no medication name travels in a URL.';

revoke execute on function public.registry_variants_of(uuid) from public, anon;
grant execute on function public.registry_variants_of(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- F. The same dose normalisation in every write function (impl-review F7)
-- ---------------------------------------------------------------------------
-- change_dosage saves the dose with outer spaces removed; the two functions that add a medication saved it as sent.
-- The routes trim it before the call, so only a direct RPC call could store " 1 tabletka ", and then DP004 ("same
-- dose") compared a trimmed and an untrimmed text. Both now save btrim(p_dose_text). Bodies unchanged from
-- 20261004120000_dosage_change.sql (registry) and 20260930120000_medication_write_and_interactions.sql (leaflet)
-- except the dose in the last insert. Same signatures, so `create or replace` keeps their privileges and comments.

create or replace function public.add_medication_from_registry(
  p_registry_product_id uuid,
  p_dose_text text,
  p_started_on date
)
returns uuid
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_product_name text;
  v_medication_id uuid;
begin
  if v_user_id is null then
    raise exception using
      errcode = '28000',
      message = 'Nie można zapisać leku bez zalogowanej sesji.';
  end if;

  select rp.product_name into v_product_name
    from public.registry_products rp
   where rp.id = p_registry_product_id;
  if not found then
    raise exception using
      errcode = 'P0002',
      message = format('Nie ma w rejestrze produktu %s.', p_registry_product_id);
  end if;

  insert into public.medications (user_id, product_name, composition_source, registry_medication_id)
  values (v_user_id, v_product_name, 'registry', p_registry_product_id)
  returning id into v_medication_id;

  -- Composition copy with deduplication (see the function comment).
  insert into public.medication_substances (medication_id, substance_name, atc_code)
  select v_medication_id, coded.substance_name, coded.atc_code
    from (
      select distinct on (rs.atc_code) rs.substance_name, rs.atc_code
        from public.registry_substances rs
       where rs.registry_product_id = p_registry_product_id
         and rs.atc_code is not null
       order by rs.atc_code, rs.position, rs.substance_name
    ) coded
  union all
  select v_medication_id, uncoded.substance_name, null
    from (
      select distinct rs.substance_name
        from public.registry_substances rs
       where rs.registry_product_id = p_registry_product_id
         and rs.atc_code is null
    ) uncoded;

  insert into public.dosage_periods (medication_id, dose_text, started_on, registry_product_id)
  values (v_medication_id, btrim(p_dose_text), p_started_on, p_registry_product_id);

  return v_medication_id;
end;
$$;


create or replace function public.add_medication_from_leaflet(
  p_product_name text,
  p_substance_name text,
  p_verified boolean,
  p_dose_text text,
  p_started_on date
)
returns uuid
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_codes text[];
  v_medication_id uuid;
begin
  if v_user_id is null then
    raise exception using
      errcode = '28000',
      message = 'Nie można zapisać leku bez zalogowanej sesji.';
  end if;

  if p_verified then
    -- Only dictionary rows with a code count as a match: a name known only without a code would give a
    -- medication that silently matches no pair.
    select array_agg(distinct rs.atc_code order by rs.atc_code) into v_codes
      from public.registry_substances rs
     where rs.normalized_name = lower(btrim(p_substance_name))
       and rs.atc_code is not null;
    if v_codes is null then
      raise exception using
        errcode = 'P0002',
        message = format('Substancji „%s” nie ma w słowniku substancji z kodem ATC.', btrim(p_substance_name));
    end if;
  end if;

  insert into public.medications (user_id, product_name, composition_source)
  values (v_user_id, btrim(p_product_name), 'leaflet')
  returning id into v_medication_id;

  if p_verified then
    insert into public.medication_substances (medication_id, substance_name, atc_code)
    select v_medication_id, btrim(p_substance_name), code
      from unnest(v_codes) as code;
  else
    insert into public.medication_substances (medication_id, substance_name, atc_code)
    values (v_medication_id, btrim(p_substance_name), null);
  end if;

  insert into public.dosage_periods (medication_id, dose_text, started_on)
  values (v_medication_id, btrim(p_dose_text), p_started_on);

  return v_medication_id;
end;
$$;
