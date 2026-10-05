-- Migration: S-03 — changing the dose of a medication and remembering the product variant of each dosage period.
--
-- What this migration makes possible, in plain terms, with an example for each part.
-- Technical names are in brackets, for whoever needs to find them in the code below.
--
-- A. EVERY DOSAGE PERIOD REMEMBERS ITS VARIANT (dosage_periods.registry_product_id)
--
--    Example: Anna added Ibuprom 200 mg on 1 September. On 10 October her doctor switches her to Ibuprom 400 mg.
--      - Before, the variant (strength and form) was stored only on the medication, so after the switch the
--        screen would still say 200 mg for the whole history.
--      - Now each dosage period stores its own variant: 1 September – 9 October is 200 mg, from 10 October 400 mg.
--      - Periods that already exist get the variant the medication was added with. Medications from a leaflet have
--        no registry variant, so their periods stay empty.
--      - The variant of a period is part of the history: once the correction window is closed it cannot be changed
--        (dosage_periods_guard_core). A new strength is saved as a new period, never by rewriting an old one.
--      - Adding a medication from the registry (add_medication_from_registry) now writes the chosen variant into
--        the first period.
--
-- B. CHANGING THE DOSE (change_dosage)
--
--    Example: Anna takes "1 tablet in the morning" since 1 September and from 10 October "2 tablets in the morning".
--      - One call closes the current period on 10 October and opens a new one from 10 October. Either both happen
--        or nothing does. The old dose stays in the history; nothing is overwritten.
--      - The medication stays one item on the list.
--      - The end date is stored as the first day of the new dose (the period runs up to, but not including, that
--        day), so the screen shows the old period as "1.09.2026 – 9.10.2026".
--      - A strength change of the same product (Ibuprom 200 mg -> Ibuprom 400 mg) is a dose change too: the new
--        period gets the new variant.
--
--    What is refused, each with its own error code so the application can explain it:
--      - nobody is signed in (28000),
--      - the medication does not exist or belongs to another account (P0002),
--      - the medication has been stopped: stop date today or earlier, Polish time (DP001),
--      - the medication has no ongoing period (DP006),
--      - the new variant is another product (a different name) or has a different composition, e.g. Sartesta
--        10 mg + 160 mg (amlodipine + valsartan) -> Sartesta 24 mg + 26 mg (sacubitril + valsartan); for a medication
--        from a leaflet any variant is refused, because it has none in the registry (DP005). A different product or
--        composition is a new medication: stop this one and add the other,
--      - the same dose again: "1 Tablet " is the same as "1 tablet" when the variant is also the same (DP004).
--        Pressing "back" and saving again lands here, so a repeated save says "already saved", not "date too early",
--      - a date in the future (DP003),
--      - a date more than 14 days back (DP007). A change written in October with a date in January would assign the
--        new dose to nine months of history that were already compared with symptoms. An older change is saved by
--        stopping the medication and adding it again,
--      - a date on or before the start of the current period (DP002). A change on the day the period started would
--        leave a period of zero days, so the earliest possible change is the next day.
--
--    Measured 2026-10-04 on the local registry: of 1095 product names, 686 have more than one variant and exactly
--    one (Sartesta) has variants with different compositions, so the "different composition" refusal is rare.
--
-- Access: only a signed-in person can call change_dosage (EXECUTE for authenticated only). Inside it the same
-- per-account data protection applies as everywhere else (security invoker, RLS).
--
-- Order matters: the column and the filling of existing periods come BEFORE the new version of the guard. Once the
-- correction window can close (S-05), the new guard would block filling a closed period.

-- ---------------------------------------------------------------------------
-- 1. Variant of each dosage period
-- ---------------------------------------------------------------------------

alter table public.dosage_periods
  add column registry_product_id uuid null
    references public.registry_products (id) on delete restrict;

comment on column public.dosage_periods.registry_product_id is
  'Registry variant (strength and form) taken in this period; empty for a medication from a leaflet. A strength change of the same product opens a new period with the new variant. Part of the history: cannot change once the correction window is closed. The registry row cannot be deleted while a period points to it (on delete restrict).';

-- Existing periods get the variant their medication was added with. Leaflet medications have no variant.
update public.dosage_periods dp
   set registry_product_id = m.registry_medication_id
  from public.medications m
 where m.id = dp.medication_id
   and m.composition_source = 'registry';

-- ---------------------------------------------------------------------------
-- 2. History guard on dosage periods: the variant is part of the core
-- ---------------------------------------------------------------------------
-- Same branches as before (20260922120000_medication_schema.sql), plus registry_product_id.

create or replace function public.dosage_periods_guard_core()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.medication_correction_window_open(old.medication_id) then
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

-- ---------------------------------------------------------------------------
-- 3. Adding a medication from the registry writes the variant into the first period
-- ---------------------------------------------------------------------------
-- Body unchanged from 20260930120000_medication_write_and_interactions.sql except the last insert. Same signature,
-- so `create or replace` keeps the privileges set there.

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
  values (v_medication_id, p_dose_text, p_started_on, p_registry_product_id);

  return v_medication_id;
end;
$$;

comment on function public.add_medication_from_registry(uuid, text, date) is
  'Adds a medication chosen from the registry. Example: Ibuprofen Zentiva 400 mg with the dose "1 tablet 3 times a day". One call saves the medication (name taken from the registry), its full composition and the first dosage period with the chosen variant (dosage_periods.registry_product_id); either all three are saved or nothing is. Copying the composition: each code is saved once. When the registry lists the same code twice (Ibuprofen Zentiva 400 mg lists ibuprofen M01AE01 two times), the first one in the registry order is kept. When the two rows carry different names (a salt form, e.g. Dexak), only the first name is kept; the full composition stays in the registry product. A substance without a code is kept too (once per name), e.g. sacubitril in Sartesta. When the registry offers several possible codes for one substance, all of them are kept: more flags instead of a silent miss. Errors: 28000 = no signed-in session, P0002 = no such registry product; an empty dose fails on the table rules.';

-- ---------------------------------------------------------------------------
-- 4. Changing the dose
-- ---------------------------------------------------------------------------
-- security invoker: the function runs with the caller's rights, so RLS on the account tables applies exactly as for
-- a separate update and insert, but both succeed or fail together (one statement, one transaction).

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
  v_variant_name text;
  v_base_name text;
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
    raise exception using
      errcode = 'P0002',
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
    -- A period without a variant (written before this migration by a direct insert) falls back to the variant the
    -- medication was added with.
    v_current_variant := coalesce(v_current.registry_product_id, v_medication.registry_medication_id);
    -- No variant given means: keep the current one.
    v_variant := coalesce(p_registry_product_id, v_current_variant);

    if v_variant is distinct from v_current_variant then
      select rp.product_name into v_variant_name
        from public.registry_products rp
       where rp.id = v_variant;
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
           where rs.registry_product_id = v_variant and rs.atc_code is not null)
         is distinct from
         (select coalesce(array_agg(distinct ms.atc_code order by ms.atc_code), '{}')
            from public.medication_substances ms
           where ms.medication_id = v_medication.id and ms.atc_code is not null)
         or
         (select coalesce(array_agg(distinct lower(btrim(rs.substance_name)) order by lower(btrim(rs.substance_name))), '{}')
            from public.registry_substances rs
           where rs.registry_product_id = v_variant and rs.atc_code is null)
         is distinct from
         (select coalesce(array_agg(distinct lower(btrim(ms.substance_name)) order by lower(btrim(ms.substance_name))), '{}')
            from public.medication_substances ms
           where ms.medication_id = v_medication.id and ms.atc_code is null)
      then
        raise exception using
          errcode = 'DP005',
          message = 'Wybrany wariant ma inny skład niż zapisany lek. Inny skład zapisuje się jako nowy lek.';
      end if;
    end if;
  else
    if p_registry_product_id is not null then
      raise exception using
        errcode = 'DP005',
        message = 'Lek dodany z ulotki nie ma wariantów z rejestru. Zmianę mocy zapisuje się w treści dawkowania.';
    end if;
    v_current_variant := null;
    v_variant := null;
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
  'Changes the dose of the caller''s medication. Example: "1 tablet in the morning" since 2026-09-01, changed on 2026-10-10 to "2 tablets in the morning": the current period gets ended_on = 2026-10-10 (exclusive bound, last day 2026-10-09) and a new period starts on 2026-10-10; both in one transaction. Returns the id of the new period. p_registry_product_id: another variant of the same registry product (same name, case ignored, same composition), e.g. Ibuprom 200 mg -> Ibuprom 400 mg; null keeps the current variant; must be null for a medication from a leaflet. Errors, checked in this order: 28000 = no signed-in session, P0002 = no such medication of this account, DP001 = medication stopped (discontinued_on today or earlier, Polish time), DP006 = no ongoing period, DP005 = variant of another product, of another composition, or any variant for a leaflet medication, DP004 = same dose (case and outer spaces ignored) and same variant, DP003 = date in the future, DP007 = date more than 14 days back, DP002 = date on or before the start of the current period; an empty dose fails on dosage_periods_dose_text_check.';

-- ---------------------------------------------------------------------------
-- 5. Privileges
-- ---------------------------------------------------------------------------
-- The Supabase default privileges grant anon and authenticated EXECUTE on every new function in public; revoking
-- from public alone would not remove those direct grants.

revoke execute on function public.change_dosage(uuid, text, date, uuid) from public, anon;
grant execute on function public.change_dosage(uuid, text, date, uuid) to authenticated;
