-- Medication write and interaction checks (S-02): the functions the application uses to save a medication and to
-- read interaction flags, run as a signed-in account (role authenticated, RLS applies) on the real seed data.
--   INTERACTION 1:  saving from the registry — Ibuprofen Zentiva 400 mg has the same code twice in RPL and is
--                   saved with one substance row.
--   INTERACTION 2:  saving from the registry — the Sartesta variant with sacubitril gets exactly its own
--                   composition, never the amlodipine of another variant with the same name.
--   INTERACTION 3:  saving is atomic — a failed save leaves no medication and no substance behind.
--   INTERACTION 4:  saving from a leaflet — verified name gives one row per dictionary code, unknown verified name
--                   and a verified name present only without a code are named errors, unverified name gives one
--                   row without a code; coded_substance_names() returns exactly the distinct coded names.
--   INTERACTION 5:  basic interaction — B01AA and M01AE give two rows (A->B, B->A) with the same pair.
--   INTERACTION 6:  a group paired with itself (M01AE x M01AE) flags two medications, never one with itself.
--   INTERACTION 7:  several substances in the same group give one row per (medication, other medication, pair).
--   INTERACTION 8:  a discontinued medication drops out; one with a future discontinuation date stays.
--   INTERACTION 9:  isolation — another account's medications never pair with mine.
--   INTERACTION 10: a medication without a code creates no rows.
--   INTERACTION 11: privileges — anon cannot execute the seven functions (change_dosage, assert_dosage_period_variant and registry_variants_of from S-03 included); a call
--                   without a session is a named error.
--
-- How to run: `npm run db:check` (needs `npx supabase start`). The runner (scripts/db-checks.mjs) passes this file
-- only when it prints `GATE_COMPLETE medication_interaction_checks` at the end.
--
-- Rules every block follows (same as account_isolation_checks.sql):
--   - The role is switched at the top level of a block, never inside a `begin ... exception ... end` subblock,
--     because catching an error there would undo the switch and the next steps would run as postgres.
--   - Each switch is asserted (current_user and auth.uid()).
--   - Expected values are measured from the seed data (rpl_id, dictionary codes), not typed in as counts.
--   - Blocked cases catch a named error only, never `when others`.
--
-- Everything runs in one transaction ended with rollback: no test rows are left behind.

\set ON_ERROR_STOP on

begin;

-- ---------------------------------------------------------------------------
-- Test accounts and helpers
-- ---------------------------------------------------------------------------

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-9100-000000000a00',
   'authenticated', 'authenticated', 'interaction-a@example.test', 'x', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-9100-000000000b00',
   'authenticated', 'authenticated', 'interaction-b@example.test', 'x', now(), now());

-- Switches the transaction to a signed-in account and asserts that the switch took effect.
create function pg_temp.act_as(p_uid uuid)
returns void
language plpgsql
as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  if current_user <> 'authenticated' or auth.uid() is distinct from p_uid then
    raise exception 'switch to account % did not take effect (current_user %, auth.uid %)', p_uid, current_user, auth.uid();
  end if;
end;
$$;

-- Back to postgres, without claims.
create function pg_temp.act_as_postgres()
returns void
language plpgsql
as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  if current_user <> 'postgres' then
    raise exception 'switch back to postgres did not take effect (current_user %)', current_user;
  end if;
end;
$$;

-- Removes every medication of both test accounts (the correction window of fresh rows is open, so deletes pass).
create function pg_temp.clear_accounts()
returns void
language plpgsql
as $$
begin
  delete from public.medications
   where user_id in ('00000000-0000-4000-9100-000000000a00', '00000000-0000-4000-9100-000000000b00');
end;
$$;

create function pg_temp.product(p_rpl_id text)
returns uuid
language plpgsql
stable
as $$
declare
  v_id uuid;
begin
  select id into v_id from public.registry_products where rpl_id = p_rpl_id;
  if v_id is null then
    raise exception 'seed product % is missing, so the check would not measure anything', p_rpl_id;
  end if;
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- INTERACTION 1: registry save of Ibuprofen Zentiva 400 mg (rpl_id 100496319, M01AE01 twice in RPL)
-- ---------------------------------------------------------------------------

do $$
declare
  v_a constant uuid := '00000000-0000-4000-9100-000000000a00';
  v_product uuid := pg_temp.product('100496319');
  v_id uuid;
  v_row record;
begin
  if (select count(*) from public.registry_substances where registry_product_id = v_product and atc_code = 'M01AE01') <> 2 then
    raise exception 'INTERACTION 1 FAILED: seed product 100496319 no longer has M01AE01 twice, so deduplication is not measured';
  end if;

  perform pg_temp.act_as(v_a);
  v_id := public.add_medication_from_registry(v_product, '1 tabletka 3 razy dziennie', date '2026-09-01');
  perform pg_temp.act_as_postgres();

  select user_id, product_name, composition_source, registry_medication_id into v_row
    from public.medications where id = v_id;
  if v_row.user_id is distinct from v_a
     or v_row.composition_source is distinct from 'registry'
     or v_row.registry_medication_id is distinct from v_product
     or v_row.product_name is distinct from 'Ibuprofen Zentiva' then
    raise exception 'INTERACTION 1 FAILED: medication row is wrong (owner %, source %, product %, name %)',
      v_row.user_id, v_row.composition_source, v_row.registry_medication_id, v_row.product_name;
  end if;

  if (select count(*) from public.medication_substances where medication_id = v_id) <> 1
     or (select atc_code from public.medication_substances where medication_id = v_id limit 1) is distinct from 'M01AE01' then
    raise exception 'INTERACTION 1 FAILED: expected exactly one substance row M01AE01, got %',
      (select string_agg(substance_name || ':' || coalesce(atc_code, '-'), ', ') from public.medication_substances where medication_id = v_id);
  end if;

  select dose_text, started_on, ended_on into v_row from public.dosage_periods where medication_id = v_id;
  if (select count(*) from public.dosage_periods where medication_id = v_id) <> 1
     or v_row.dose_text is distinct from '1 tabletka 3 razy dziennie'
     or v_row.started_on is distinct from date '2026-09-01'
     or v_row.ended_on is not null then
    raise exception 'INTERACTION 1 FAILED: expected one ongoing dosage period from 2026-09-01';
  end if;

  raise notice 'INTERACTION 1 OK: registry save copies one row per ATC code (M01AE01 once) and opens one dosage period';
end;
$$;

-- ---------------------------------------------------------------------------
-- INTERACTION 2: registry save of Sartesta 24 mg + 26 mg (rpl_id 100491275, sacubitril without a code + valsartan)
-- ---------------------------------------------------------------------------

do $$
declare
  v_a constant uuid := '00000000-0000-4000-9100-000000000a00';
  v_product uuid := pg_temp.product('100491275');
  v_id uuid;
  v_diff integer;
begin
  perform pg_temp.act_as(v_a);
  v_id := public.add_medication_from_registry(v_product, '1 tabletka 2 razy dziennie', date '2026-09-01');
  perform pg_temp.act_as_postgres();

  select count(*) into v_diff from (
    (select substance_name, atc_code from public.registry_substances where registry_product_id = v_product
     except
     select substance_name, atc_code from public.medication_substances where medication_id = v_id)
    union all
    (select substance_name, atc_code from public.medication_substances where medication_id = v_id
     except
     select substance_name, atc_code from public.registry_substances where registry_product_id = v_product)
  ) d;
  if v_diff <> 0 then
    raise exception 'INTERACTION 2 FAILED: saved composition differs from the chosen variant (got %)',
      (select string_agg(substance_name || ':' || coalesce(atc_code, '-'), ', ') from public.medication_substances where medication_id = v_id);
  end if;

  if exists (select 1 from public.medication_substances where medication_id = v_id and atc_code like 'C08CA%') then
    raise exception 'INTERACTION 2 FAILED: amlodipine of another Sartesta variant was saved';
  end if;
  if not exists (select 1 from public.medication_substances where medication_id = v_id and atc_code is null) then
    raise exception 'INTERACTION 2 FAILED: sacubitril without a code was dropped instead of saved';
  end if;

  raise notice 'INTERACTION 2 OK: the Sartesta variant is saved with its own composition, sacubitril kept without a code';
end;
$$;

-- ---------------------------------------------------------------------------
-- INTERACTION 3: a failed save leaves nothing behind
-- ---------------------------------------------------------------------------

do $$
declare
  v_a constant uuid := '00000000-0000-4000-9100-000000000a00';
  v_product uuid := pg_temp.product('100432660');
  v_medications_before integer;
  v_substances_before integer;
  v_constraint text;
begin
  select count(*) into v_medications_before from public.medications where user_id = v_a;
  select count(*) into v_substances_before
    from public.medication_substances s join public.medications m on m.id = s.medication_id where m.user_id = v_a;

  perform pg_temp.act_as(v_a);
  v_constraint := null;
  begin
    perform public.add_medication_from_registry(v_product, '   ', date '2026-09-01');
  exception when check_violation then
    get stacked diagnostics v_constraint = constraint_name;
  end;
  perform pg_temp.act_as_postgres();

  if v_constraint is distinct from 'dosage_periods_dose_text_check' then
    raise exception 'INTERACTION 3 FAILED: blank dose was not rejected by dosage_periods_dose_text_check (got %)', v_constraint;
  end if;
  if (select count(*) from public.medications where user_id = v_a) <> v_medications_before
     or (select count(*) from public.medication_substances s join public.medications m on m.id = s.medication_id where m.user_id = v_a) <> v_substances_before then
    raise exception 'INTERACTION 3 FAILED: a failed save left a medication or its composition behind';
  end if;

  raise notice 'INTERACTION 3 OK: a save failing on the dosage period leaves no medication and no composition';
end;
$$;

-- ---------------------------------------------------------------------------
-- INTERACTION 4: leaflet save
-- ---------------------------------------------------------------------------

do $$
declare
  v_a constant uuid := '00000000-0000-4000-9100-000000000a00';
  v_expected_codes text[];
  v_id uuid;
  v_id_spaced uuid;
  v_id_unverified uuid;
  v_message text;
  v_codeless_name text;
  v_codeless_message text;
  v_expected_names text[];
  v_names text[];
begin
  select array_agg(distinct atc_code order by atc_code) into v_expected_codes
    from public.registry_substances where normalized_name = 'diclofenacum' and atc_code is not null;
  if coalesce(array_length(v_expected_codes, 1), 0) < 2 then
    raise exception 'INTERACTION 4 FAILED: diclofenacum has fewer than two codes in the dictionary, so "one row per code" is not measured';
  end if;
  -- A name the dictionary knows only from rows without a code: verifying it must fail, not save a codeless row.
  select normalized_name into v_codeless_name
    from public.registry_substances group by normalized_name
    having bool_and(atc_code is null) order by normalized_name limit 1;
  if v_codeless_name is null then
    raise exception 'INTERACTION 4 FAILED: no dictionary name exists only without a code, so the case is not measured';
  end if;
  select array_agg(distinct normalized_name order by normalized_name) into v_expected_names
    from public.registry_substances where atc_code is not null;

  perform pg_temp.act_as(v_a);
  v_names := public.coded_substance_names();
  v_id := public.add_medication_from_leaflet('Check 4 diclofenac', 'diclofenacum', true, '1 tabletka', date '2026-09-01');
  v_id_spaced := public.add_medication_from_leaflet('Check 4 diclofenac spaced', '  Diclofenacum ', true, '1 tabletka', date '2026-09-01');
  v_message := null;
  begin
    perform public.add_medication_from_leaflet('Check 4 unknown', 'substantia ignota', true, '1 tabletka', date '2026-09-01');
  exception when sqlstate 'P0002' then
    get stacked diagnostics v_message = message_text;
  end;
  v_codeless_message := null;
  begin
    perform public.add_medication_from_leaflet('Check 4 codeless', v_codeless_name, true, '1 tabletka', date '2026-09-01');
  exception when sqlstate 'P0002' then
    get stacked diagnostics v_codeless_message = message_text;
  end;
  v_id_unverified := public.add_medication_from_leaflet('Check 4 unverified', 'ibuprofen', false, '1 tabletka', date '2026-09-01');
  perform pg_temp.act_as_postgres();

  if (select array_agg(atc_code order by atc_code) from public.medication_substances where medication_id = v_id) is distinct from v_expected_codes then
    raise exception 'INTERACTION 4 FAILED: verified diclofenacum saved codes %, expected %',
      (select array_agg(atc_code order by atc_code) from public.medication_substances where medication_id = v_id), v_expected_codes;
  end if;
  if (select array_agg(atc_code order by atc_code) from public.medication_substances where medication_id = v_id_spaced) is distinct from v_expected_codes then
    raise exception 'INTERACTION 4 FAILED: "  Diclofenacum " did not match like "diclofenacum"';
  end if;
  if (select composition_source from public.medications where id = v_id) is distinct from 'leaflet'
     or (select registry_medication_id from public.medications where id = v_id) is not null then
    raise exception 'INTERACTION 4 FAILED: leaflet medication has the wrong source or a registry product';
  end if;
  if v_message is null or v_message not like '%substantia ignota%' then
    raise exception 'INTERACTION 4 FAILED: unknown verified substance was not rejected with a named error naming it (got %)', v_message;
  end if;
  if v_names is distinct from v_expected_names then
    raise exception 'INTERACTION 4 FAILED: coded_substance_names() returned % names, expected the % distinct coded names',
      coalesce(array_length(v_names, 1), 0), coalesce(array_length(v_expected_names, 1), 0);
  end if;
  if v_codeless_name = any(v_names) then
    raise exception 'INTERACTION 4 FAILED: coded_substance_names() lists "%", which has no code', v_codeless_name;
  end if;
  if v_codeless_message is null then
    raise exception 'INTERACTION 4 FAILED: verified name "%" present only without a code was not rejected with P0002', v_codeless_name;
  end if;
  if (select count(*) from public.medication_substances where medication_id = v_id_unverified) <> 1
     or exists (select 1 from public.medication_substances where medication_id = v_id_unverified and atc_code is not null) then
    raise exception 'INTERACTION 4 FAILED: unverified leaflet save must give exactly one row without a code';
  end if;

  raise notice 'INTERACTION 4 OK: verified name gives % rows (one per dictionary code), case and spaces ignored; unknown name and codeless-only name "%" rejected (P0002); unverified name saved without a code; coded_substance_names() gives the % coded names',
    array_length(v_expected_codes, 1), v_codeless_name, array_length(v_expected_names, 1);
end;
$$;

-- ---------------------------------------------------------------------------
-- INTERACTION 5: B01AA x M01AE — two rows, one per direction, same pair
-- ---------------------------------------------------------------------------

do $$
declare
  v_a constant uuid := '00000000-0000-4000-9100-000000000a00';
  v_pair uuid;
  v_acenocumarol uuid;
  v_ibuprofen uuid;
  v_rows integer;
  v_matching integer;
begin
  perform pg_temp.clear_accounts();
  select id into v_pair from public.interaction_pairs where group_a = 'B01AA' and group_b = 'M01AE';

  perform pg_temp.act_as(v_a);
  v_acenocumarol := public.add_medication_from_registry(pg_temp.product('100002243'), '1 tabletka', date '2026-09-01');
  v_ibuprofen := public.add_medication_from_registry(pg_temp.product('100432660'), '1 tabletka', date '2026-09-02');
  select count(*),
         count(*) filter (where pair_id = v_pair and group_a = 'B01AA' and group_b = 'M01AE'
                          and ((medication_id = v_acenocumarol and other_medication_id = v_ibuprofen)
                            or (medication_id = v_ibuprofen and other_medication_id = v_acenocumarol)))
    into v_rows, v_matching
    from public.medication_interactions();
  perform pg_temp.act_as_postgres();

  if v_rows <> 2 or v_matching <> 2 then
    raise exception 'INTERACTION 5 FAILED: expected 2 rows (both directions of B01AA x M01AE), got % rows, % matching', v_rows, v_matching;
  end if;

  raise notice 'INTERACTION 5 OK: acenocumarol and ibuprofen give two rows, one per direction, with the B01AA x M01AE pair';
end;
$$;

-- ---------------------------------------------------------------------------
-- INTERACTION 6: M01AE x M01AE — two medications flag, one medication with two M01AE codes does not pair with itself
-- ---------------------------------------------------------------------------

do $$
declare
  v_a constant uuid := '00000000-0000-4000-9100-000000000a00';
  v_single uuid;
  v_rows integer;
  v_self integer;
begin
  perform pg_temp.clear_accounts();

  -- one medication, two different M01AE codes (written as postgres; the functions never produce it for this group)
  insert into public.medications (user_id, product_name, composition_source)
  values (v_a, 'Check 6 two NSAIDs in one', 'leaflet')
  returning id into v_single;
  insert into public.medication_substances (medication_id, substance_name, atc_code)
  values (v_single, 'Ibuprofenum', 'M01AE01'), (v_single, 'Dexketoprofenum', 'M01AE17');

  perform pg_temp.act_as(v_a);
  select count(*) into v_rows from public.medication_interactions();
  perform pg_temp.act_as_postgres();
  if v_rows <> 0 then
    raise exception 'INTERACTION 6 FAILED: one medication with two M01AE codes gave % row(s), expected none (never a medication with itself)', v_rows;
  end if;

  perform pg_temp.act_as(v_a);
  perform public.add_medication_from_registry(pg_temp.product('100163667'), '1 saszetka', date '2026-09-01');
  select count(*), count(*) filter (where medication_id = other_medication_id) into v_rows, v_self
    from public.medication_interactions()
   where group_a = 'M01AE' and group_b = 'M01AE';
  perform pg_temp.act_as_postgres();
  if v_rows <> 2 or v_self <> 0 then
    raise exception 'INTERACTION 6 FAILED: two M01AE medications gave % M01AE x M01AE row(s) (% with itself), expected 2 and 0', v_rows, v_self;
  end if;

  raise notice 'INTERACTION 6 OK: M01AE x M01AE flags two medications both ways and never pairs a medication with itself';
end;
$$;

-- ---------------------------------------------------------------------------
-- INTERACTION 7: several substances in one group count once per (medication, other medication, pair)
-- ---------------------------------------------------------------------------

do $$
declare
  v_a constant uuid := '00000000-0000-4000-9100-000000000a00';
  v_x uuid;
  v_rows integer;
  v_distinct integer;
begin
  perform pg_temp.clear_accounts();

  insert into public.medications (user_id, product_name, composition_source)
  values (v_a, 'Check 7 two B01AA codes', 'leaflet')
  returning id into v_x;
  insert into public.medication_substances (medication_id, substance_name, atc_code)
  values (v_x, 'Acenocoumarolum', 'B01AA07'), (v_x, 'Warfarinum', 'B01AA03');

  perform pg_temp.act_as(v_a);
  perform public.add_medication_from_registry(pg_temp.product('100432660'), '1 tabletka', date '2026-09-01');
  select count(*), count(distinct (medication_id, other_medication_id, pair_id)) into v_rows, v_distinct
    from public.medication_interactions();
  perform pg_temp.act_as_postgres();

  if v_rows <> 2 or v_distinct <> 2 then
    raise exception 'INTERACTION 7 FAILED: expected 2 distinct rows, got % rows (% distinct)', v_rows, v_distinct;
  end if;

  raise notice 'INTERACTION 7 OK: two B01AA substances in one medication still give one row per direction';
end;
$$;

-- ---------------------------------------------------------------------------
-- INTERACTION 8: discontinued medications drop out; a future discontinuation date keeps them
-- ---------------------------------------------------------------------------

do $$
declare
  v_a constant uuid := '00000000-0000-4000-9100-000000000a00';
  v_today date := (now() at time zone 'Europe/Warsaw')::date;
  v_ibuprofen uuid;
  v_rows integer;
begin
  perform pg_temp.clear_accounts();

  perform pg_temp.act_as(v_a);
  perform public.add_medication_from_registry(pg_temp.product('100002243'), '1 tabletka', date '2026-01-01');
  v_ibuprofen := public.add_medication_from_registry(pg_temp.product('100432660'), '1 tabletka', date '2026-01-01');
  perform pg_temp.act_as_postgres();

  update public.medications set discontinued_on = v_today - 1 where id = v_ibuprofen;
  perform pg_temp.act_as(v_a);
  select count(*) into v_rows from public.medication_interactions();
  perform pg_temp.act_as_postgres();
  if v_rows <> 0 then
    raise exception 'INTERACTION 8 FAILED: a medication discontinued yesterday still gives % row(s)', v_rows;
  end if;

  update public.medications set discontinued_on = v_today + 1 where id = v_ibuprofen;
  perform pg_temp.act_as(v_a);
  select count(*) into v_rows from public.medication_interactions();
  perform pg_temp.act_as_postgres();
  if v_rows <> 2 then
    raise exception 'INTERACTION 8 FAILED: a medication discontinued tomorrow gives % row(s), expected 2', v_rows;
  end if;

  raise notice 'INTERACTION 8 OK: discontinued yesterday drops out in both directions, discontinued tomorrow stays';
end;
$$;

-- ---------------------------------------------------------------------------
-- INTERACTION 9: another account's medications never pair with mine
-- ---------------------------------------------------------------------------
-- Zero rows alone could mean a broken function, so account B also gets its own pair as a positive control.

do $$
declare
  v_a constant uuid := '00000000-0000-4000-9100-000000000a00';
  v_b constant uuid := '00000000-0000-4000-9100-000000000b00';
  v_a_acenocumarol uuid;
  v_b_ibuprofen uuid;
  v_b_acenocumarol uuid;
  v_rows integer;
  v_foreign integer;
begin
  perform pg_temp.clear_accounts();

  perform pg_temp.act_as(v_a);
  v_a_acenocumarol := public.add_medication_from_registry(pg_temp.product('100002243'), '1 tabletka', date '2026-09-01');
  perform pg_temp.act_as(v_b);
  v_b_ibuprofen := public.add_medication_from_registry(pg_temp.product('100432660'), '1 tabletka', date '2026-09-01');

  -- as B, before B has its own pair
  select count(*) into v_rows from public.medication_interactions();
  if v_rows <> 0 then
    perform pg_temp.act_as_postgres();
    raise exception 'INTERACTION 9 FAILED: account B sees % row(s) pairing its ibuprofen with account A''s acenocumarol', v_rows;
  end if;

  v_b_acenocumarol := public.add_medication_from_registry(pg_temp.product('100002243'), '1 tabletka', date '2026-09-01');
  select count(*),
         count(*) filter (where medication_id not in (v_b_ibuprofen, v_b_acenocumarol)
                             or other_medication_id not in (v_b_ibuprofen, v_b_acenocumarol))
    into v_rows, v_foreign
    from public.medication_interactions();
  if v_rows <> 2 or v_foreign <> 0 then
    perform pg_temp.act_as_postgres();
    raise exception 'INTERACTION 9 FAILED: account B with its own pair sees % row(s), % with a medication of another account', v_rows, v_foreign;
  end if;

  perform pg_temp.act_as(v_a);
  select count(*) into v_rows from public.medication_interactions();
  perform pg_temp.act_as_postgres();
  if v_rows <> 0 then
    raise exception 'INTERACTION 9 FAILED: account A sees % row(s) pairing its acenocumarol with account B''s medications', v_rows;
  end if;

  raise notice 'INTERACTION 9 OK: accounts never pair with each other; account B sees exactly its own pair';
end;
$$;

-- ---------------------------------------------------------------------------
-- INTERACTION 10: a medication without a code creates no rows
-- ---------------------------------------------------------------------------

do $$
declare
  v_a constant uuid := '00000000-0000-4000-9100-000000000a00';
  v_rows integer;
begin
  perform pg_temp.clear_accounts();

  perform pg_temp.act_as(v_a);
  perform public.add_medication_from_registry(pg_temp.product('100002243'), '1 tabletka', date '2026-09-01');
  perform public.add_medication_from_leaflet('Check 10 unverified', 'ibuprofen', false, '1 tabletka', date '2026-09-01');
  select count(*) into v_rows from public.medication_interactions();
  perform pg_temp.act_as_postgres();

  if v_rows <> 0 then
    raise exception 'INTERACTION 10 FAILED: a substance without a code gave % row(s)', v_rows;
  end if;

  raise notice 'INTERACTION 10 OK: a medication without a code is not part of any pair';
end;
$$;

-- ---------------------------------------------------------------------------
-- INTERACTION 11: privileges and calls without a session
-- ---------------------------------------------------------------------------

do $$
declare
  v_function text;
  v_message text;
begin
  foreach v_function in array array[
    'public.add_medication_from_registry(uuid, text, date)',
    'public.add_medication_from_leaflet(text, text, boolean, text, date)',
    'public.medication_interactions()',
    'public.coded_substance_names()',
    'public.change_dosage(uuid, text, date, uuid)',
    'public.assert_dosage_period_variant(uuid, uuid)',
    'public.registry_variants_of(uuid)'
  ] loop
    if has_function_privilege('anon', v_function, 'execute') then
      raise exception 'INTERACTION 11 FAILED: anon can execute %', v_function;
    end if;
    if not has_function_privilege('authenticated', v_function, 'execute') then
      raise exception 'INTERACTION 11 FAILED: authenticated cannot execute %', v_function;
    end if;
  end loop;

  -- postgres without claims: auth.uid() is empty
  v_message := null;
  begin
    perform public.add_medication_from_registry(pg_temp.product('100432660'), '1 tabletka', date '2026-09-01');
  exception when sqlstate '28000' then
    get stacked diagnostics v_message = message_text;
  end;
  if v_message is null then
    raise exception 'INTERACTION 11 FAILED: registry save without a session was not rejected with 28000';
  end if;

  v_message := null;
  begin
    perform public.add_medication_from_leaflet('Check 11', 'ibuprofen', false, '1 tabletka', date '2026-09-01');
  exception when sqlstate '28000' then
    get stacked diagnostics v_message = message_text;
  end;
  if v_message is null then
    raise exception 'INTERACTION 11 FAILED: leaflet save without a session was not rejected with 28000';
  end if;

  -- a product that does not exist
  perform pg_temp.act_as('00000000-0000-4000-9100-000000000a00');
  v_message := null;
  begin
    perform public.add_medication_from_registry('00000000-0000-4000-9100-0000000000ff', '1 tabletka', date '2026-09-01');
  exception when sqlstate 'P0002' then
    get stacked diagnostics v_message = message_text;
  end;
  perform pg_temp.act_as_postgres();
  if v_message is null then
    raise exception 'INTERACTION 11 FAILED: registry save of a missing product was not rejected with P0002';
  end if;

  raise notice 'INTERACTION 11 OK: anon cannot execute the seven functions, authenticated can; no session is 28000; a missing product is P0002';
end;
$$;

-- Completion marker for scripts/db-checks.mjs.
do $$
begin
  raise notice 'GATE_COMPLETE medication_interaction_checks';
end;
$$;

rollback;
