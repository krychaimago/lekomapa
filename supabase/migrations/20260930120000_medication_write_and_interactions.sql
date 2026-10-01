-- Migration: S-02 — adding a medication and flagging a possible interaction.
--
-- What this migration makes possible, in plain terms, with an example for each part.
-- Technical names are in brackets, for whoever needs to find them in the code below.
--
-- A. HOW TWO MEDICATIONS GET A FLAG (medication_interactions)
--
--    Example: Anna takes Acenocumarol and Ibuprom.
--      - Every active substance has a code (ATC code). Acenocumarol has B01AA07, Ibuprom has M01AE01.
--      - A code is built like an address, from general to specific: B01AA07 belongs to the group B01AA
--        (medicines like acenocoumarol and warfarin), M01AE01 belongs to the group M01AE (ibuprofen and similar).
--      - The list of checked pairs (interaction_pairs, 24 rows) is written on groups, not on medicines.
--        One row says: "group B01AA with group M01AE may be related".
--      - B01AA07 starts with B01AA, M01AE01 starts with M01AE, so the pair matches. BOTH medications get a flag:
--        Acenocumarol with a note "with Ibuprom", Ibuprom with a note "with Acenocumarol".
--
--    Rules that follow from this:
--      - A medication with several substances is checked substance by substance. It is enough that ONE of its
--        substances is in the group.
--      - Two different medications from the same group can form a pair too, when the list says so. Example: Ibuprom
--        and Dexak (both group M01AE) get a flag each.
--      - A medication is never paired with itself, even when its own substances are in both groups.
--      - One pair between two medications is shown once, even if several substances match it.
--      - Medications that have been stopped (discontinued date today or earlier, Polish time) are not checked.
--      - A substance without a code (e.g. added from a leaflet without checking) never gets a flag.
--      - Each account sees only its own medications. Anna's medication never pairs with someone else's.
--      - No flag does NOT mean "safe": the list of pairs is incomplete by design.
--
-- B. ADDING A MEDICATION FROM THE REGISTRY (add_medication_from_registry)
--
--    Example: Anna picks Ibuprofen Zentiva 400 mg from the registry and types "1 tablet 3 times a day".
--      - One save writes three things together: the medication, its full composition copied from the registry,
--        and the first dosage period. Either all three are saved, or nothing is. Before, these were three separate
--        steps, and an error halfway could leave a medication without a composition or without a dose.
--      - The registry lists this product's substance twice (ibuprofen, M01AE01, two times). The copy keeps each
--        code ONCE, otherwise the save would fail on the "one code per medication" rule (part E). For some products
--        the two rows under one code carry different names — a salt form (Dexak: "Dexketoprofenum" and
--        "DExketoprofenum Trometamolum"; Coroswera: "Rosuvastatinum" and "Rosuvastatinum calicum"). Deliberate
--        decision: the first name in registry order is kept and the other is NOT copied. Interaction matching is
--        unaffected (same code); the full source composition stays reachable through registry_medication_id.
--      - A substance the registry has without a code (e.g. sacubitril in Sartesta) is copied too, without a code.
--        Nothing from the composition is thrown away.
--
-- C. ADDING A MEDICATION FROM A LEAFLET (add_medication_from_leaflet)
--
--    Example: a medication is not in the registry, so Anna types its name and the substance from the leaflet.
--      - If she picks the substance from the suggestion list (e.g. "diclofenacum"), the database looks up every
--        code this substance has and saves all of them. Diclofenac has 5 codes (tablets, gel, eye drops…), so
--        5 rows are saved. More chances for a flag instead of a silent miss.
--      - The codes always come from the database, never from what was typed.
--      - A substance typed by hand that is not on the list is saved WITHOUT a code — and only after Anna ticks
--        "save without checking". Such a substance never gets a flag.
--
-- D. HISTORY PROTECTION FOR THE MEDICATION ITSELF (medications_guard_core)
--
--    Example: Anna has had Ibuprom for a month and has written symptoms since then.
--      - Once the correction window is closed, three things about the medication are locked: where its
--        composition came from (registry or leaflet), which registry product it is, and which account it belongs to.
--        Changing them would quietly rewrite what the symptom history is compared against.
--      - Still allowed: renaming the medication (the name is only a label) and setting the date it was stopped.
--      - The composition and the dosage periods already had this protection; the medication itself did not.
--
-- E. RULES ON THE DATA ITSELF
--      - A medication marked "from the registry" must point to a registry product, and one marked "from a leaflet"
--        must not (medications_registry_source_check).
--      - The name of a medication, the dose and the name of a substance cannot be empty or only spaces.
--      - One medication cannot hold the same code twice (medication_substances_medication_id_atc_code_key). The same
--        code twice would count one substance as two. Measured 2026-09-30: 4 registry products list a code twice
--        (Ibuprofen Zentiva 400 mg, Dexak, two Coroswera variants); only Ibuprofen Zentiva repeats the same name,
--        the others differ by salt form, see part B. The older rule on name + code stays, because it
--        still stops the same substance without a code from being saved twice.
--
-- Access: only a signed-in person can call the three functions in A–C (EXECUTE for authenticated only). Inside them
-- the same per-account data protection applies as everywhere else (security invoker, RLS).

-- ---------------------------------------------------------------------------
-- 1. Registry source consistency
-- ---------------------------------------------------------------------------

alter table public.medications
  add constraint medications_registry_source_check
  check ((composition_source = 'registry') = (registry_medication_id is not null));

-- ---------------------------------------------------------------------------
-- 2. Blank texts
-- ---------------------------------------------------------------------------

alter table public.medications
  add constraint medications_product_name_check
  check (btrim(product_name) <> '');

alter table public.dosage_periods
  add constraint dosage_periods_dose_text_check
  check (btrim(dose_text) <> '');

alter table public.medication_substances
  add constraint medication_substances_substance_name_check
  check (btrim(substance_name) <> '');

-- ---------------------------------------------------------------------------
-- 3. F7: one row per ATC code in a medication
-- ---------------------------------------------------------------------------

create unique index medication_substances_medication_id_atc_code_key
  on public.medication_substances (medication_id, atc_code)
  where atc_code is not null;

-- ---------------------------------------------------------------------------
-- 4. History guard on medications
-- ---------------------------------------------------------------------------

create or replace function public.medications_guard_core()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Compares only the three protected columns. BEFORE UPDATE triggers fire in name order, so
  -- medications_guard_core runs before medications_set_updated_at; that does not matter as long as updated_at is
  -- never compared here. Do not add updated_at to this list: every update changes it.
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

  return new;
end;
$$;

create trigger medications_guard_core
  before update on public.medications
  for each row execute function public.medications_guard_core();

-- A trigger function, like the other guards: nobody calls it directly.
revoke execute on function public.medications_guard_core() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. Saving a medication from the registry
-- ---------------------------------------------------------------------------
-- security invoker: the function runs with the caller's rights, so RLS on the account tables applies exactly as
-- for three separate inserts, but the three inserts succeed or fail together (one statement, one transaction).

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

  insert into public.dosage_periods (medication_id, dose_text, started_on)
  values (v_medication_id, p_dose_text, p_started_on);

  return v_medication_id;
end;
$$;

comment on function public.add_medication_from_registry(uuid, text, date) is
  'Adds a medication chosen from the registry. Example: Ibuprofen Zentiva 400 mg with the dose "1 tablet 3 times a day". One call saves the medication (name taken from the registry), its full composition and the first dosage period; either all three are saved or nothing is. Copying the composition: each code is saved once. When the registry lists the same code twice (Ibuprofen Zentiva 400 mg lists ibuprofen M01AE01 two times), the first one in the registry order is kept. When the two rows carry different names (a salt form, e.g. Dexak), only the first name is kept; the full composition stays in the registry product. A substance without a code is kept too (once per name), e.g. sacubitril in Sartesta. When the registry offers several possible codes for one substance, all of them are kept: more flags instead of a silent miss. Errors: 28000 = no signed-in session, P0002 = no such registry product; an empty dose fails on the table rules.';

-- ---------------------------------------------------------------------------
-- 6. Saving a medication from a leaflet
-- ---------------------------------------------------------------------------

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
  values (v_medication_id, p_dose_text, p_started_on);

  return v_medication_id;
end;
$$;

comment on function public.add_medication_from_leaflet(text, text, boolean, text, date) is
  'Saves a medication from outside the registry with one substance from its leaflet, atomically. p_verified = true: the name is matched as lower(btrim(name)) = registry_substances.normalized_name, only on rows with a code, and one substance row is written per distinct code of that name (e.g. diclofenacum has several) — the code always comes from the data, never from the input; no match is error P0002. p_verified = false: one row without a code, which never matches a pair; the application passes it only after the user explicitly confirms saving an unchecked substance. Error 28000 without a session.';

-- ---------------------------------------------------------------------------
-- 7. Interactions between the caller's medications
-- ---------------------------------------------------------------------------

create or replace function public.medication_interactions()
returns table (
  medication_id uuid,
  other_medication_id uuid,
  pair_id uuid,
  group_a text,
  group_b text,
  description text
)
language sql
stable
security invoker
set search_path = ''
as $$
  with active_medications as (
    select m.id
      from public.medications m
     -- RLS already limits rows to the caller; the explicit filter keeps the result per account also for a role
     -- that bypasses RLS.
     where m.user_id = (select auth.uid())
       and (m.discontinued_on is null
            or m.discontinued_on > (now() at time zone 'Europe/Warsaw')::date)
  ),
  codes as (
    select s.medication_id, s.atc_code
      from public.medication_substances s
      join active_medications am on am.id = s.medication_id
     where s.atc_code is not null
  )
  select distinct
         c1.medication_id,
         c2.medication_id,
         ip.id,
         ip.group_a,
         ip.group_b,
         ip.description
    from codes c1
    join codes c2 on c2.medication_id <> c1.medication_id
    join public.interaction_pairs ip
      on (c1.atc_code like ip.group_a || '%' and c2.atc_code like ip.group_b || '%')
      or (c1.atc_code like ip.group_b || '%' and c2.atc_code like ip.group_a || '%');
$$;

comment on function public.medication_interactions() is
  'Lists which of the signed-in person''s current medications form a checked pair. Example: Acenocumarol (code B01AA07) and Ibuprom (code M01AE01); the list of pairs has the row "group B01AA with group M01AE"; B01AA07 starts with B01AA and M01AE01 starts with M01AE, so the function returns two rows: Acenocumarol with Ibuprom, and Ibuprom with Acenocumarol. Rules: one matching substance is enough; two different medications from the same group pair when the list has that group with itself (M01AE with M01AE: Ibuprom and Dexak); a medication never pairs with itself; each pair between two medications is returned once; stopped medications (discontinued today or earlier, Polish time) and substances without a code are skipped; only the caller''s own medications are compared. A row says only that a pair exists: the wording shown is "may be related", never a cause (FR-012), and no row does not mean safe, because the list of pairs is incomplete by design.';

-- ---------------------------------------------------------------------------
-- 8. Privileges
-- ---------------------------------------------------------------------------
-- The Supabase default privileges grant anon and authenticated EXECUTE on every new function in public; revoking
-- from public alone would not remove those direct grants.

revoke execute on function public.add_medication_from_registry(uuid, text, date) from public, anon;
revoke execute on function public.add_medication_from_leaflet(text, text, boolean, text, date) from public, anon;
revoke execute on function public.medication_interactions() from public, anon;

grant execute on function public.add_medication_from_registry(uuid, text, date) to authenticated;
grant execute on function public.add_medication_from_leaflet(text, text, boolean, text, date) to authenticated;
grant execute on function public.medication_interactions() to authenticated;
