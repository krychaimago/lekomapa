-- Dosage change checks (S-03): public.change_dosage closes the ongoing period and opens a new one, and refuses every
-- case of its rule list with a named SQLSTATE; dosage periods remember their registry variant.
--   DOSAGE 1:  add_medication_from_registry writes the chosen variant into the first period; leaflet periods have none;
--              both functions save the dose without outer spaces.
--   DOSAGE 2:  a successful change — old period ends on the change date, new one starts on it, exactly two periods,
--              one ongoing, dose trimmed, variant carried over, the returned id is the new period.
--   DOSAGE 3:  repeating the same call after a successful change is DP004 (not DP002) and adds no third period.
--   DOSAGE 4:  a strength change (another variant with the same name, case ignored, and the same composition) passes
--              and saves the new variant.
--   DOSAGE 5:  DP004 for the same dose differing only in case and spaces; the same dose with another variant passes.
--   DOSAGE 6:  DP002 for a date equal to the start of the period and earlier; DP003 for tomorrow.
--   DOSAGE 7:  DP007 for today - 15 days; today - 14 days passes.
--   DOSAGE 8:  DP001 for a medication stopped today; one stopped tomorrow passes.
--   DOSAGE 9:  DP005 for a variant of another name, of another ATC composition, of another composition without a
--              code, a missing registry row, and any variant for a leaflet medication.
--   DOSAGE 10: DP006 for a medication without an ongoing period.
--   DOSAGE 11: DP008 for another account's medication, its periods untouched.
--   DOSAGE 12: 28000 without a session.
--   DOSAGE 13: with the correction window closed a dose change still passes, and changing registry_product_id of an
--              existing period is blocked by the history guard; with the window open the same update passes.
--   DOSAGE 14: the variant rule holds outside change_dosage too (trigger dosage_periods_guard_variant): a direct insert
--              or update with a variant of another name or composition, and a direct insert with any variant for a
--              leaflet medication, are DP005; a direct insert with a variant of the same product passes; an insert
--              into another account's medication is refused by RLS (42501), not by DP005.
--   DOSAGE 15: registry_variants_of returns exactly the variants of the same name and composition (the variant the
--              medication was added with included); nothing for a leaflet medication or another account's medication.
--
-- How to run: `npm run db:check` (needs `npx supabase start`), or this file alone:
-- `node scripts/db-checks.mjs supabase/tests/dosage_change_checks.sql`. The runner (scripts/db-checks.mjs) passes it
-- only when it prints `GATE_COMPLETE dosage_change_checks` at the end.
--
-- Rules every block follows (same as medication_interaction_checks.sql):
--   - The role is switched at the top level of a block, never inside a `begin ... exception ... end` subblock,
--     because catching an error there would undo the switch and the next steps would run as postgres.
--   - Each switch is asserted (current_user and auth.uid()).
--   - Blocked cases catch a named SQLSTATE only, never `when others`: pg_temp.try_change lists every code the
--     function may raise, and any other error stops the file.
--   - Every blocked case leaves the number of periods unchanged, and has an owner counterexample that adds exactly
--     one period (pg_temp.assert_period_count, pg_temp.assert_changed_on).
--   - Registry fixtures are own rows (names starting with "Dosagecheck"), not the seed data, so the rules are
--     measured on compositions chosen for them.
--
-- Everything runs in one transaction ended with rollback: no test rows are left behind.

\set ON_ERROR_STOP on

begin;

-- ---------------------------------------------------------------------------
-- Test accounts, registry fixtures and helpers
-- ---------------------------------------------------------------------------

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-9200-000000000a00',
   'authenticated', 'authenticated', 'dosage-a@example.test', 'x', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-9200-000000000b00',
   'authenticated', 'authenticated', 'dosage-b@example.test', 'x', now(), now());

-- Registry fixtures:
--   ...0a1 Dosagecheck Alpha 200 mg            ibuprofenum M01AE01                      (base variant)
--   ...0a2 DOSAGECHECK alpha 400 mg            ibuprofenum M01AE01                      (same name, case differs)
--   ...0a3 Dosagecheck Alpha 200 mg + 500 mg   ibuprofenum M01AE01 + paracetamolum N02BE01  (another ATC set)
--   ...0a4 Dosagecheck Alpha 200 mg + 10 mg    ibuprofenum M01AE01 + substantia ignota, no code (another uncoded set)
--   ...0b1 Dosagecheck Beta 200 mg             ibuprofenum M01AE01                      (another name, same composition)
insert into public.registry_products (id, rpl_id, product_name, strength, pharmaceutical_form, source_payload, snapshot_date)
values
  ('00000000-0000-4000-9200-0000000000a1', 'dosagecheck-a1', 'Dosagecheck Alpha', '200 mg', 'Tabletki', '{}', date '2026-09-01'),
  ('00000000-0000-4000-9200-0000000000a2', 'dosagecheck-a2', 'DOSAGECHECK alpha', '400 mg', 'Tabletki', '{}', date '2026-09-01'),
  ('00000000-0000-4000-9200-0000000000a3', 'dosagecheck-a3', 'Dosagecheck Alpha', '200 mg + 500 mg', 'Tabletki', '{}', date '2026-09-01'),
  ('00000000-0000-4000-9200-0000000000a4', 'dosagecheck-a4', 'Dosagecheck Alpha', '200 mg + 10 mg', 'Tabletki', '{}', date '2026-09-01'),
  ('00000000-0000-4000-9200-0000000000b1', 'dosagecheck-b1', 'Dosagecheck Beta', '200 mg', 'Tabletki', '{}', date '2026-09-01');

insert into public.registry_substances
  (registry_product_id, position, substance_name, normalized_name, atc_code, atc_source, composition_source)
values
  ('00000000-0000-4000-9200-0000000000a1', 1, 'Ibuprofenum', 'ibuprofenum', 'M01AE01', 'product', 'source'),
  ('00000000-0000-4000-9200-0000000000a2', 1, 'Ibuprofenum', 'ibuprofenum', 'M01AE01', 'product', 'source'),
  ('00000000-0000-4000-9200-0000000000a3', 1, 'Ibuprofenum', 'ibuprofenum', 'M01AE01', 'derived', 'source'),
  ('00000000-0000-4000-9200-0000000000a3', 2, 'Paracetamolum', 'paracetamolum', 'N02BE01', 'derived', 'source'),
  ('00000000-0000-4000-9200-0000000000a4', 1, 'Ibuprofenum', 'ibuprofenum', 'M01AE01', 'derived', 'source'),
  ('00000000-0000-4000-9200-0000000000a4', 2, 'Substantia ignota', 'substantia ignota', null, 'unmatched', 'source'),
  ('00000000-0000-4000-9200-0000000000b1', 1, 'Ibuprofenum', 'ibuprofenum', 'M01AE01', 'product', 'source');

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

-- Calls change_dosage and returns 'ok' or the SQLSTATE of a refusal. Only the codes change_dosage raises are caught,
-- each by name; any other error (a typo, a constraint, a missing function) propagates and stops the file.
create function pg_temp.try_change(p_medication_id uuid, p_dose_text text, p_changed_on date, p_variant uuid default null)
returns text
language plpgsql
as $$
begin
  perform public.change_dosage(p_medication_id, p_dose_text, p_changed_on, p_variant);
  return 'ok';
exception
  when sqlstate '28000' then return '28000';
  when sqlstate 'DP008' then return 'DP008';
  when sqlstate 'DP001' then return 'DP001';
  when sqlstate 'DP002' then return 'DP002';
  when sqlstate 'DP003' then return 'DP003';
  when sqlstate 'DP004' then return 'DP004';
  when sqlstate 'DP005' then return 'DP005';
  when sqlstate 'DP006' then return 'DP006';
  when sqlstate 'DP007' then return 'DP007';
end;
$$;

create function pg_temp.period_count(p_medication_id uuid)
returns integer
language sql
stable
as $$
  select count(*)::integer from public.dosage_periods where medication_id = p_medication_id
$$;

create function pg_temp.assert_result(p_check text, p_case text, p_got text, p_expected text)
returns void
language plpgsql
as $$
begin
  if p_got is distinct from p_expected then
    raise exception 'DOSAGE % FAILED: % gave %, expected %', p_check, p_case, p_got, p_expected;
  end if;
end;
$$;

-- Owner counterexample and "nothing changed" check in one: run as postgres after the calls.
create function pg_temp.assert_period_count(p_check text, p_case text, p_medication_id uuid, p_expected integer)
returns void
language plpgsql
as $$
begin
  if pg_temp.period_count(p_medication_id) <> p_expected then
    raise exception 'DOSAGE % FAILED: after % the medication has % period(s), expected %',
      p_check, p_case, pg_temp.period_count(p_medication_id), p_expected;
  end if;
end;
$$;

-- A successful change: exactly one ongoing period, starting on the change date, and the period before it ends on
-- that date.
create function pg_temp.assert_changed_on(p_check text, p_case text, p_medication_id uuid, p_changed_on date)
returns void
language plpgsql
as $$
begin
  if (select count(*) from public.dosage_periods where medication_id = p_medication_id and ended_on is null) <> 1
     or not exists (select 1 from public.dosage_periods
                     where medication_id = p_medication_id and ended_on is null and started_on = p_changed_on)
     or not exists (select 1 from public.dosage_periods
                     where medication_id = p_medication_id and ended_on = p_changed_on) then
    raise exception 'DOSAGE % FAILED: % did not close the period on % and open one from it (periods: %)',
      p_check, p_case, p_changed_on,
      (select string_agg(format('%s [%s, %s)', dose_text, started_on, coalesce(ended_on::text, '…')), '; ' order by started_on)
         from public.dosage_periods where medication_id = p_medication_id);
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- DOSAGE 1: the first period of a registry medication holds the chosen variant; a leaflet period holds none
-- ---------------------------------------------------------------------------

do $$
declare
  v_a constant uuid := '00000000-0000-4000-9200-000000000a00';
  v_alpha_400 constant uuid := '00000000-0000-4000-9200-0000000000a2';
  v_registry uuid;
  v_leaflet uuid;
begin
  perform pg_temp.act_as(v_a);
  v_registry := public.add_medication_from_registry(v_alpha_400, '  1 tabletka ', date '2026-09-01');
  v_leaflet := public.add_medication_from_leaflet('Dosagecheck leaflet', 'ibuprofen', false, '  1 tabletka ', date '2026-09-01');
  perform pg_temp.act_as_postgres();

  if (select registry_product_id from public.dosage_periods where medication_id = v_registry) is distinct from v_alpha_400 then
    raise exception 'DOSAGE 1 FAILED: first period of a registry medication has variant %, expected %',
      (select registry_product_id from public.dosage_periods where medication_id = v_registry), v_alpha_400;
  end if;
  if (select registry_product_id from public.dosage_periods where medication_id = v_leaflet) is not null then
    raise exception 'DOSAGE 1 FAILED: first period of a leaflet medication has a registry variant';
  end if;
  -- Same dose normalisation as change_dosage (impl-review F7): outer spaces removed.
  if exists (select 1 from public.dosage_periods
              where medication_id in (v_registry, v_leaflet) and dose_text is distinct from '1 tabletka') then
    raise exception 'DOSAGE 1 FAILED: a first period kept the outer spaces of the dose (got %)',
      (select string_agg(format('"%s"', dose_text), ', ') from public.dosage_periods where medication_id in (v_registry, v_leaflet));
  end if;

  raise notice 'DOSAGE 1 OK: add_medication_from_registry saves the chosen variant in the first period; a leaflet period has none; both save the dose without outer spaces';
end;
$$;

-- ---------------------------------------------------------------------------
-- DOSAGE 2 and 3: a successful change, then the same call repeated
-- ---------------------------------------------------------------------------

do $$
declare
  v_a constant uuid := '00000000-0000-4000-9200-000000000a00';
  v_alpha_200 constant uuid := '00000000-0000-4000-9200-0000000000a1';
  v_today constant date := (now() at time zone 'Europe/Warsaw')::date;
  v_med uuid;
  v_old_id uuid;
  v_new_id uuid;
  v_old record;
  v_new record;
  v_repeat text;
begin
  perform pg_temp.act_as(v_a);
  v_med := public.add_medication_from_registry(v_alpha_200, '1 tabletka rano', v_today - 30);
  perform pg_temp.act_as_postgres();
  select id into v_old_id from public.dosage_periods where medication_id = v_med;

  perform pg_temp.act_as(v_a);
  v_new_id := public.change_dosage(v_med, '  2 tabletki rano ', v_today - 3);
  perform pg_temp.act_as_postgres();

  select dose_text, started_on, ended_on, registry_product_id into v_old from public.dosage_periods where id = v_old_id;
  select id, medication_id, dose_text, started_on, ended_on, registry_product_id into v_new
    from public.dosage_periods where id = v_new_id;

  perform pg_temp.assert_period_count('2', 'the change', v_med, 2);
  if v_old.dose_text is distinct from '1 tabletka rano'
     or v_old.started_on is distinct from v_today - 30
     or v_old.ended_on is distinct from v_today - 3
     or v_old.registry_product_id is distinct from v_alpha_200 then
    raise exception 'DOSAGE 2 FAILED: old period is % [%, %) variant %, expected "1 tabletka rano" [%, %) variant %',
      v_old.dose_text, v_old.started_on, v_old.ended_on, v_old.registry_product_id, v_today - 30, v_today - 3, v_alpha_200;
  end if;
  if v_new.id is null
     or v_new.medication_id is distinct from v_med
     or v_new.dose_text is distinct from '2 tabletki rano'
     or v_new.started_on is distinct from v_today - 3
     or v_new.ended_on is not null
     or v_new.registry_product_id is distinct from v_alpha_200 then
    raise exception 'DOSAGE 2 FAILED: the returned id is not a new ongoing period "2 tabletki rano" from % with variant % (got % [%, %) variant %)',
      v_today - 3, v_alpha_200, v_new.dose_text, v_new.started_on, v_new.ended_on, v_new.registry_product_id;
  end if;
  perform pg_temp.assert_changed_on('2', 'the change', v_med, v_today - 3);

  raise notice 'DOSAGE 2 OK: change closes the old period on the change date and opens one ongoing period from it; dose trimmed, variant carried over';

  -- DOSAGE 3: the same arguments again (back button, resubmit)
  perform pg_temp.act_as(v_a);
  v_repeat := pg_temp.try_change(v_med, '  2 tabletki rano ', v_today - 3);
  perform pg_temp.act_as_postgres();

  perform pg_temp.assert_result('3', 'repeating the successful call', v_repeat, 'DP004');
  perform pg_temp.assert_period_count('3', 'the repeated call', v_med, 2);

  raise notice 'DOSAGE 3 OK: repeating a successful change is DP004 (already saved), not DP002, and adds no third period';
end;
$$;

-- ---------------------------------------------------------------------------
-- DOSAGE 4: a strength change of the same product
-- ---------------------------------------------------------------------------

do $$
declare
  v_a constant uuid := '00000000-0000-4000-9200-000000000a00';
  v_alpha_200 constant uuid := '00000000-0000-4000-9200-0000000000a1';
  v_alpha_400 constant uuid := '00000000-0000-4000-9200-0000000000a2';
  v_today constant date := (now() at time zone 'Europe/Warsaw')::date;
  v_med uuid;
  v_new_id uuid;
begin
  perform pg_temp.act_as(v_a);
  v_med := public.add_medication_from_registry(v_alpha_200, '1 tabletka', v_today - 30);
  v_new_id := public.change_dosage(v_med, '1 tabletka 2 razy dziennie', v_today - 1, v_alpha_400);
  perform pg_temp.act_as_postgres();

  perform pg_temp.assert_period_count('4', 'the strength change', v_med, 2);
  perform pg_temp.assert_changed_on('4', 'the strength change', v_med, v_today - 1);
  if (select registry_product_id from public.dosage_periods where id = v_new_id) is distinct from v_alpha_400
     or (select registry_product_id from public.dosage_periods where medication_id = v_med and ended_on is not null)
        is distinct from v_alpha_200 then
    raise exception 'DOSAGE 4 FAILED: after the strength change the new period must hold % and the old one %', v_alpha_400, v_alpha_200;
  end if;

  raise notice 'DOSAGE 4 OK: another variant with the same name (case ignored) and composition passes; the new period holds the new variant, the old one keeps its own';
end;
$$;

-- ---------------------------------------------------------------------------
-- DOSAGE 5: DP004 — the same dose and variant; the same dose with another variant passes
-- ---------------------------------------------------------------------------

do $$
declare
  v_a constant uuid := '00000000-0000-4000-9200-000000000a00';
  v_alpha_200 constant uuid := '00000000-0000-4000-9200-0000000000a1';
  v_alpha_400 constant uuid := '00000000-0000-4000-9200-0000000000a2';
  v_today constant date := (now() at time zone 'Europe/Warsaw')::date;
  v_med uuid;
  v_same_text text;
  v_same_explicit text;
  v_other_variant text;
begin
  perform pg_temp.act_as(v_a);
  v_med := public.add_medication_from_registry(v_alpha_200, '1 tabletka', v_today - 30);
  v_same_text := pg_temp.try_change(v_med, '  1 TABLETKA ', v_today - 1);
  v_same_explicit := pg_temp.try_change(v_med, '1 Tabletka', v_today - 1, v_alpha_200);
  perform pg_temp.act_as_postgres();

  perform pg_temp.assert_result('5', 'the same dose in other case and spaces', v_same_text, 'DP004');
  perform pg_temp.assert_result('5', 'the same dose with the current variant given explicitly', v_same_explicit, 'DP004');
  perform pg_temp.assert_period_count('5', 'the refused same dose', v_med, 1);

  perform pg_temp.act_as(v_a);
  v_other_variant := pg_temp.try_change(v_med, '1 tabletka', v_today - 1, v_alpha_400);
  perform pg_temp.act_as_postgres();

  perform pg_temp.assert_result('5', 'the same dose with another variant', v_other_variant, 'ok');
  perform pg_temp.assert_period_count('5', 'the same dose with another variant', v_med, 2);
  perform pg_temp.assert_changed_on('5', 'the same dose with another variant', v_med, v_today - 1);

  raise notice 'DOSAGE 5 OK: the same dose (case and spaces ignored) with the same variant is DP004; the same dose with another variant passes';
end;
$$;

-- ---------------------------------------------------------------------------
-- DOSAGE 6: DP002 — not after the start of the current period; DP003 — tomorrow
-- ---------------------------------------------------------------------------

do $$
declare
  v_a constant uuid := '00000000-0000-4000-9200-000000000a00';
  v_alpha_200 constant uuid := '00000000-0000-4000-9200-0000000000a1';
  v_today constant date := (now() at time zone 'Europe/Warsaw')::date;
  v_med uuid;
  v_on_start text;
  v_before_start text;
  v_tomorrow text;
  v_next_day text;
begin
  -- The period starts within the 14-day limit, so DP007 cannot answer first.
  perform pg_temp.act_as(v_a);
  v_med := public.add_medication_from_registry(v_alpha_200, '1 tabletka', v_today - 5);
  v_on_start := pg_temp.try_change(v_med, '2 tabletki', v_today - 5);
  v_before_start := pg_temp.try_change(v_med, '2 tabletki', v_today - 6);
  v_tomorrow := pg_temp.try_change(v_med, '2 tabletki', v_today + 1);
  perform pg_temp.act_as_postgres();

  perform pg_temp.assert_result('6', 'a date equal to the start of the period', v_on_start, 'DP002');
  perform pg_temp.assert_result('6', 'a date before the start of the period', v_before_start, 'DP002');
  perform pg_temp.assert_result('6', 'tomorrow', v_tomorrow, 'DP003');
  perform pg_temp.assert_period_count('6', 'the refused dates', v_med, 1);

  perform pg_temp.act_as(v_a);
  v_next_day := pg_temp.try_change(v_med, '2 tabletki', v_today - 4);
  perform pg_temp.act_as_postgres();

  perform pg_temp.assert_result('6', 'the day after the start of the period', v_next_day, 'ok');
  perform pg_temp.assert_period_count('6', 'the day after the start', v_med, 2);
  perform pg_temp.assert_changed_on('6', 'the day after the start', v_med, v_today - 4);

  raise notice 'DOSAGE 6 OK: a date on or before the start of the period is DP002, tomorrow is DP003, the day after the start passes';
end;
$$;

-- ---------------------------------------------------------------------------
-- DOSAGE 7: DP007 — more than 14 days back
-- ---------------------------------------------------------------------------

do $$
declare
  v_a constant uuid := '00000000-0000-4000-9200-000000000a00';
  v_alpha_200 constant uuid := '00000000-0000-4000-9200-0000000000a1';
  v_today constant date := (now() at time zone 'Europe/Warsaw')::date;
  v_med uuid;
  v_15_back text;
  v_14_back text;
begin
  perform pg_temp.act_as(v_a);
  v_med := public.add_medication_from_registry(v_alpha_200, '1 tabletka', v_today - 30);
  v_15_back := pg_temp.try_change(v_med, '2 tabletki', v_today - 15);
  perform pg_temp.act_as_postgres();

  perform pg_temp.assert_result('7', 'today - 15 days', v_15_back, 'DP007');
  perform pg_temp.assert_period_count('7', 'today - 15 days', v_med, 1);

  perform pg_temp.act_as(v_a);
  v_14_back := pg_temp.try_change(v_med, '2 tabletki', v_today - 14);
  perform pg_temp.act_as_postgres();

  perform pg_temp.assert_result('7', 'today - 14 days', v_14_back, 'ok');
  perform pg_temp.assert_period_count('7', 'today - 14 days', v_med, 2);
  perform pg_temp.assert_changed_on('7', 'today - 14 days', v_med, v_today - 14);

  raise notice 'DOSAGE 7 OK: today - 15 days is DP007, today - 14 days passes';
end;
$$;

-- ---------------------------------------------------------------------------
-- DOSAGE 8: DP001 — a stopped medication
-- ---------------------------------------------------------------------------

do $$
declare
  v_a constant uuid := '00000000-0000-4000-9200-000000000a00';
  v_alpha_200 constant uuid := '00000000-0000-4000-9200-0000000000a1';
  v_today constant date := (now() at time zone 'Europe/Warsaw')::date;
  v_stopped_today uuid;
  v_stopped_tomorrow uuid;
  v_today_result text;
  v_tomorrow_result text;
begin
  perform pg_temp.act_as(v_a);
  v_stopped_today := public.add_medication_from_registry(v_alpha_200, '1 tabletka', v_today - 30);
  v_stopped_tomorrow := public.add_medication_from_registry(v_alpha_200, '1 tabletka', v_today - 30);
  perform pg_temp.act_as_postgres();

  update public.medications set discontinued_on = v_today where id = v_stopped_today;
  update public.medications set discontinued_on = v_today + 1 where id = v_stopped_tomorrow;

  perform pg_temp.act_as(v_a);
  v_today_result := pg_temp.try_change(v_stopped_today, '2 tabletki', v_today - 1);
  v_tomorrow_result := pg_temp.try_change(v_stopped_tomorrow, '2 tabletki', v_today - 1);
  perform pg_temp.act_as_postgres();

  perform pg_temp.assert_result('8', 'a medication stopped today', v_today_result, 'DP001');
  perform pg_temp.assert_period_count('8', 'a medication stopped today', v_stopped_today, 1);
  perform pg_temp.assert_result('8', 'a medication stopped tomorrow', v_tomorrow_result, 'ok');
  perform pg_temp.assert_period_count('8', 'a medication stopped tomorrow', v_stopped_tomorrow, 2);
  perform pg_temp.assert_changed_on('8', 'a medication stopped tomorrow', v_stopped_tomorrow, v_today - 1);

  raise notice 'DOSAGE 8 OK: a medication stopped today is DP001, one stopped tomorrow still changes';
end;
$$;

-- ---------------------------------------------------------------------------
-- DOSAGE 9: DP005 — a variant of another product or composition, any variant for a leaflet medication
-- ---------------------------------------------------------------------------

do $$
declare
  v_a constant uuid := '00000000-0000-4000-9200-000000000a00';
  v_alpha_200 constant uuid := '00000000-0000-4000-9200-0000000000a1';
  v_alpha_combo constant uuid := '00000000-0000-4000-9200-0000000000a3';
  v_alpha_uncoded constant uuid := '00000000-0000-4000-9200-0000000000a4';
  v_beta_200 constant uuid := '00000000-0000-4000-9200-0000000000b1';
  v_missing constant uuid := '00000000-0000-4000-9200-0000000000ff';
  v_today constant date := (now() at time zone 'Europe/Warsaw')::date;
  v_med uuid;
  v_leaflet uuid;
  v_other_name text;
  v_other_codes text;
  v_other_uncoded text;
  v_missing_row text;
  v_leaflet_variant text;
  v_leaflet_plain text;
begin
  perform pg_temp.act_as(v_a);
  v_med := public.add_medication_from_registry(v_alpha_200, '1 tabletka', v_today - 30);
  v_leaflet := public.add_medication_from_leaflet('Dosagecheck leaflet 9', 'ibuprofen', false, '1 tabletka', v_today - 30);
  v_other_name := pg_temp.try_change(v_med, '2 tabletki', v_today - 1, v_beta_200);
  v_other_codes := pg_temp.try_change(v_med, '2 tabletki', v_today - 1, v_alpha_combo);
  v_other_uncoded := pg_temp.try_change(v_med, '2 tabletki', v_today - 1, v_alpha_uncoded);
  v_missing_row := pg_temp.try_change(v_med, '2 tabletki', v_today - 1, v_missing);
  v_leaflet_variant := pg_temp.try_change(v_leaflet, '2 tabletki', v_today - 1, v_alpha_200);
  perform pg_temp.act_as_postgres();

  perform pg_temp.assert_result('9', 'a variant with another name and the same composition', v_other_name, 'DP005');
  perform pg_temp.assert_result('9', 'a variant with the same name and another ATC code set', v_other_codes, 'DP005');
  perform pg_temp.assert_result('9', 'a variant with the same name and another substance without a code', v_other_uncoded, 'DP005');
  perform pg_temp.assert_result('9', 'a variant missing from the registry', v_missing_row, 'DP005');
  perform pg_temp.assert_result('9', 'a variant for a leaflet medication', v_leaflet_variant, 'DP005');
  perform pg_temp.assert_period_count('9', 'the refused variants', v_med, 1);
  perform pg_temp.assert_period_count('9', 'the refused leaflet variant', v_leaflet, 1);

  -- Owner counterexample for the leaflet medication: a change without a variant passes and stays without one.
  perform pg_temp.act_as(v_a);
  v_leaflet_plain := pg_temp.try_change(v_leaflet, '2 tabletki', v_today - 1);
  perform pg_temp.act_as_postgres();

  perform pg_temp.assert_result('9', 'a leaflet change without a variant', v_leaflet_plain, 'ok');
  perform pg_temp.assert_period_count('9', 'a leaflet change without a variant', v_leaflet, 2);
  perform pg_temp.assert_changed_on('9', 'a leaflet change without a variant', v_leaflet, v_today - 1);
  if exists (select 1 from public.dosage_periods where medication_id = v_leaflet and registry_product_id is not null) then
    raise exception 'DOSAGE 9 FAILED: a period of a leaflet medication got a registry variant';
  end if;

  raise notice 'DOSAGE 9 OK: another name, another ATC set, another uncoded substance, a missing row and a leaflet variant are DP005; the leaflet medication changes without a variant';
end;
$$;

-- ---------------------------------------------------------------------------
-- DOSAGE 10: DP006 — no ongoing period
-- ---------------------------------------------------------------------------
-- Such a medication cannot be made by the functions; it is written as postgres.

do $$
declare
  v_a constant uuid := '00000000-0000-4000-9200-000000000a00';
  v_today constant date := (now() at time zone 'Europe/Warsaw')::date;
  v_med uuid;
  v_no_ongoing text;
  v_with_ongoing text;
begin
  insert into public.medications (user_id, product_name, composition_source)
  values (v_a, 'Dosagecheck closed periods', 'leaflet')
  returning id into v_med;
  insert into public.dosage_periods (medication_id, dose_text, started_on, ended_on)
  values (v_med, '1 tabletka', v_today - 30, v_today - 10);

  perform pg_temp.act_as(v_a);
  v_no_ongoing := pg_temp.try_change(v_med, '2 tabletki', v_today - 1);
  perform pg_temp.act_as_postgres();

  perform pg_temp.assert_result('10', 'a medication without an ongoing period', v_no_ongoing, 'DP006');
  perform pg_temp.assert_period_count('10', 'a medication without an ongoing period', v_med, 1);

  -- Counterexample: with an ongoing period the same call passes.
  insert into public.dosage_periods (medication_id, dose_text, started_on, ended_on)
  values (v_med, '1 tabletka', v_today - 10, null);

  perform pg_temp.act_as(v_a);
  v_with_ongoing := pg_temp.try_change(v_med, '2 tabletki', v_today - 1);
  perform pg_temp.act_as_postgres();

  perform pg_temp.assert_result('10', 'the same medication with an ongoing period', v_with_ongoing, 'ok');
  perform pg_temp.assert_period_count('10', 'the same medication with an ongoing period', v_med, 3);
  perform pg_temp.assert_changed_on('10', 'the same medication with an ongoing period', v_med, v_today - 1);

  raise notice 'DOSAGE 10 OK: a medication without an ongoing period is DP006; with one the change passes';
end;
$$;

-- ---------------------------------------------------------------------------
-- DOSAGE 11: DP008 — another account's medication
-- ---------------------------------------------------------------------------

do $$
declare
  v_a constant uuid := '00000000-0000-4000-9200-000000000a00';
  v_b constant uuid := '00000000-0000-4000-9200-000000000b00';
  v_alpha_200 constant uuid := '00000000-0000-4000-9200-0000000000a1';
  v_today constant date := (now() at time zone 'Europe/Warsaw')::date;
  v_b_med uuid;
  v_foreign text;
  v_own text;
begin
  perform pg_temp.act_as(v_b);
  v_b_med := public.add_medication_from_registry(v_alpha_200, '1 tabletka', v_today - 30);
  perform pg_temp.act_as(v_a);
  v_foreign := pg_temp.try_change(v_b_med, '2 tabletki', v_today - 1);
  perform pg_temp.act_as_postgres();

  perform pg_temp.assert_result('11', 'account A changing account B''s medication', v_foreign, 'DP008');
  perform pg_temp.assert_period_count('11', 'the refused foreign change', v_b_med, 1);
  if exists (select 1 from public.dosage_periods
              where medication_id = v_b_med
                and (ended_on is not null or dose_text <> '1 tabletka' or started_on <> v_today - 30)) then
    raise exception 'DOSAGE 11 FAILED: account B''s period changed after account A''s refused call';
  end if;

  -- Owner counterexample: account B changes its own medication.
  perform pg_temp.act_as(v_b);
  v_own := pg_temp.try_change(v_b_med, '2 tabletki', v_today - 1);
  perform pg_temp.act_as_postgres();

  perform pg_temp.assert_result('11', 'account B changing its own medication', v_own, 'ok');
  perform pg_temp.assert_period_count('11', 'the owner''s change', v_b_med, 2);
  perform pg_temp.assert_changed_on('11', 'the owner''s change', v_b_med, v_today - 1);

  raise notice 'DOSAGE 11 OK: another account''s medication is DP008 and its periods stay untouched; the owner''s change passes';
end;
$$;

-- ---------------------------------------------------------------------------
-- DOSAGE 12: 28000 — no session
-- ---------------------------------------------------------------------------

do $$
declare
  v_a constant uuid := '00000000-0000-4000-9200-000000000a00';
  v_alpha_200 constant uuid := '00000000-0000-4000-9200-0000000000a1';
  v_today constant date := (now() at time zone 'Europe/Warsaw')::date;
  v_med uuid;
  v_no_session text;
  v_with_session text;
begin
  perform pg_temp.act_as(v_a);
  v_med := public.add_medication_from_registry(v_alpha_200, '1 tabletka', v_today - 30);
  perform pg_temp.act_as_postgres();

  -- postgres without claims: auth.uid() is empty
  if auth.uid() is not null then
    raise exception 'DOSAGE 12 FAILED: auth.uid() is not empty as postgres without claims, so the case is not measured';
  end if;
  v_no_session := pg_temp.try_change(v_med, '2 tabletki', v_today - 1);
  perform pg_temp.assert_result('12', 'a call without a session', v_no_session, '28000');
  perform pg_temp.assert_period_count('12', 'a call without a session', v_med, 1);

  perform pg_temp.act_as(v_a);
  v_with_session := pg_temp.try_change(v_med, '2 tabletki', v_today - 1);
  perform pg_temp.act_as_postgres();

  perform pg_temp.assert_result('12', 'the same call with a session', v_with_session, 'ok');
  perform pg_temp.assert_period_count('12', 'the same call with a session', v_med, 2);

  raise notice 'DOSAGE 12 OK: a call without a session is 28000; the same call by the owner passes';
end;
$$;

-- ---------------------------------------------------------------------------
-- DOSAGE 13: with the correction window closed — a dose change passes, rewriting a period's variant is blocked
-- ---------------------------------------------------------------------------
-- Both window functions (medication and dosage period, S-05) are replaced inside a savepoint, as in rls_checks.sql,
-- and restored by rolling back to it; their fingerprints are compared afterwards.
-- The medication is created before the savepoint and survives it, for the open-window counterexample.

create temporary table dosage_checks_state (medication_id uuid) on commit drop;

create temporary table dosage_checks_window_fingerprint as
select md5(pg_get_functiondef('public.medication_correction_window_open(uuid)'::regprocedure)) as fingerprint,
       md5(pg_get_functiondef('public.dosage_period_correction_window_open(uuid)'::regprocedure)) as period_fingerprint;

do $$
declare
  v_a constant uuid := '00000000-0000-4000-9200-000000000a00';
  v_alpha_200 constant uuid := '00000000-0000-4000-9200-0000000000a1';
  v_today constant date := (now() at time zone 'Europe/Warsaw')::date;
  v_med uuid;
begin
  perform pg_temp.act_as(v_a);
  v_med := public.add_medication_from_registry(v_alpha_200, '1 tabletka', v_today - 30);
  perform pg_temp.act_as_postgres();
  insert into dosage_checks_state values (v_med);
end;
$$;

savepoint before_window_closed;

create or replace function public.medication_correction_window_open(p_medication_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  return false;
end;
$$;

create or replace function public.dosage_period_correction_window_open(p_period_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  return false;
end;
$$;

do $$
declare
  v_a constant uuid := '00000000-0000-4000-9200-000000000a00';
  v_alpha_400 constant uuid := '00000000-0000-4000-9200-0000000000a2';
  v_today constant date := (now() at time zone 'Europe/Warsaw')::date;
  v_med uuid := (select medication_id from dosage_checks_state);
  v_change text;
  v_message text;
begin
  if public.medication_correction_window_open(v_med) then
    raise exception 'DOSAGE 13 FAILED: the correction window is open, so the check would not measure the closed-window rule';
  end if;

  perform pg_temp.act_as(v_a);
  v_change := pg_temp.try_change(v_med, '2 tabletki', v_today - 1);
  perform pg_temp.act_as_postgres();

  perform pg_temp.assert_result('13', 'a dose change with the window closed', v_change, 'ok');
  perform pg_temp.assert_period_count('13', 'a dose change with the window closed', v_med, 2);
  perform pg_temp.assert_changed_on('13', 'a dose change with the window closed', v_med, v_today - 1);

  -- Rewriting the variant of the closed period. As postgres the update passes RLS, so only the guard can stop it.
  v_message := null;
  begin
    update public.dosage_periods
       set registry_product_id = v_alpha_400
     where medication_id = v_med and ended_on is not null;
  exception when sqlstate 'P0001' then
    get stacked diagnostics v_message = message_text;
  end;
  if v_message is null then
    raise exception 'DOSAGE 13 FAILED: changing registry_product_id of a period passed with the correction window closed';
  end if;
  if v_message not like '%okno korekty%jest już zamknięte%' or v_message not like '%registry_product_id%' then
    raise exception 'DOSAGE 13 FAILED: the variant rewrite was blocked by an unexpected P0001 error, expected the correction window guard naming registry_product_id (got %)', v_message;
  end if;

  raise notice 'DOSAGE 13 OK (closed window): the dose change passes, rewriting a period''s variant is blocked by the history guard';
end;
$$;

rollback to savepoint before_window_closed;

do $$
declare
  v_state record;
begin
  select * into v_state from dosage_checks_window_fingerprint;
  if v_state.fingerprint is null
     or md5(pg_get_functiondef('public.medication_correction_window_open(uuid)'::regprocedure)) is distinct from v_state.fingerprint then
    raise exception 'DOSAGE 13 FAILED: medication correction window function differs from migration state after rollback to savepoint';
  end if;
  if v_state.period_fingerprint is null
     or md5(pg_get_functiondef('public.dosage_period_correction_window_open(uuid)'::regprocedure)) is distinct from v_state.period_fingerprint then
    raise exception 'DOSAGE 13 FAILED: dosage period correction window function differs from migration state after rollback to savepoint';
  end if;
end;
$$;

-- Counterexample: with the window open again, the same update passes, so the guard branch is what blocked it.
do $$
declare
  v_alpha_400 constant uuid := '00000000-0000-4000-9200-0000000000a2';
  v_med uuid := (select medication_id from dosage_checks_state);
  v_rows integer;
begin
  if not public.medication_correction_window_open(v_med) then
    raise exception 'DOSAGE 13 FAILED: the correction window was not restored by rolling back to the savepoint';
  end if;

  update public.dosage_periods
     set registry_product_id = v_alpha_400
   where medication_id = v_med;
  get diagnostics v_rows = row_count;
  if v_rows <> 1 then
    raise exception 'DOSAGE 13 FAILED: with the window open the variant update touched % row(s), expected 1', v_rows;
  end if;

  raise notice 'DOSAGE 13 OK (open window): the same variant update passes, so the closed-window refusal comes from the guard';
end;
$$;

-- ---------------------------------------------------------------------------
-- DOSAGE 14: direct writes to dosage_periods follow the same variant rule (impl-review F1)
-- ---------------------------------------------------------------------------
-- The owner writes through the API as authenticated, so the insert policy lets the row through and only the trigger
-- can refuse it. Each insert gets its own five days before the ongoing period, so without the trigger the inserts
-- succeed and the check fails on its DP005 assertion, not on the no-overlap constraint.

create function pg_temp.try_write(p_sql text, p_medication_id uuid, p_variant uuid, p_days_back integer default 0)
returns text
language plpgsql
as $$
begin
  execute p_sql using p_medication_id, p_variant, p_days_back;
  return 'ok';
exception
  when sqlstate 'DP005' then return 'DP005';
  when sqlstate '42501' then return '42501';
end;
$$;

do $$
declare
  v_a constant uuid := '00000000-0000-4000-9200-000000000a00';
  v_b constant uuid := '00000000-0000-4000-9200-000000000b00';
  v_alpha_200 constant uuid := '00000000-0000-4000-9200-0000000000a1';
  v_alpha_400 constant uuid := '00000000-0000-4000-9200-0000000000a2';
  v_alpha_combo constant uuid := '00000000-0000-4000-9200-0000000000a3';
  v_beta_200 constant uuid := '00000000-0000-4000-9200-0000000000b1';
  v_today constant date := (now() at time zone 'Europe/Warsaw')::date;
  c_insert constant text :=
    'insert into public.dosage_periods (medication_id, dose_text, started_on, ended_on, registry_product_id)
     values ($1, ''1 tabletka'', current_date - $3, current_date - $3 + 5, $2)';
  c_update constant text :=
    'update public.dosage_periods set registry_product_id = $2 where medication_id = $1';
  v_med uuid;
  v_leaflet uuid;
  v_b_med uuid;
  v_other_name text;
  v_other_codes text;
  v_leaflet_variant text;
  v_update_other text;
  v_foreign text;
  v_same_product text;
  v_leaflet_plain text;
begin
  perform pg_temp.act_as(v_b);
  v_b_med := public.add_medication_from_registry(v_alpha_200, '1 tabletka', v_today - 30);

  perform pg_temp.act_as(v_a);
  v_med := public.add_medication_from_registry(v_alpha_200, '1 tabletka', v_today - 30);
  v_leaflet := public.add_medication_from_leaflet('Dosagecheck leaflet 14', 'ibuprofen', false, '1 tabletka', v_today - 30);
  v_other_name := pg_temp.try_write(c_insert, v_med, v_beta_200, 300);
  v_other_codes := pg_temp.try_write(c_insert, v_med, v_alpha_combo, 280);
  v_leaflet_variant := pg_temp.try_write(c_insert, v_leaflet, v_alpha_200, 260);
  v_update_other := pg_temp.try_write(c_update, v_med, v_alpha_combo);
  v_foreign := pg_temp.try_write(c_insert, v_b_med, v_beta_200, 240);
  perform pg_temp.act_as_postgres();

  perform pg_temp.assert_result('14', 'a direct insert with a variant of another name', v_other_name, 'DP005');
  perform pg_temp.assert_result('14', 'a direct insert with a variant of another composition', v_other_codes, 'DP005');
  perform pg_temp.assert_result('14', 'a direct insert with a variant for a leaflet medication', v_leaflet_variant, 'DP005');
  perform pg_temp.assert_result('14', 'a direct update to a variant of another composition', v_update_other, 'DP005');
  -- RLS, not DP005: the rule must not answer about another account's medication.
  perform pg_temp.assert_result('14', 'a direct insert into another account''s medication', v_foreign, '42501');
  perform pg_temp.assert_period_count('14', 'the refused direct writes', v_med, 1);
  perform pg_temp.assert_period_count('14', 'the refused leaflet insert', v_leaflet, 1);
  perform pg_temp.assert_period_count('14', 'the refused foreign insert', v_b_med, 1);
  if (select registry_product_id from public.dosage_periods where medication_id = v_med) is distinct from v_alpha_200 then
    raise exception 'DOSAGE 14 FAILED: the refused update changed the variant of the period';
  end if;

  -- Owner counterexamples: the same statements with an allowed variant pass.
  perform pg_temp.act_as(v_a);
  v_same_product := pg_temp.try_write(c_insert, v_med, v_alpha_400, 200);
  v_leaflet_plain := pg_temp.try_write(c_insert, v_leaflet, null, 180);
  perform pg_temp.act_as_postgres();

  perform pg_temp.assert_result('14', 'a direct insert with a variant of the same product', v_same_product, 'ok');
  perform pg_temp.assert_result('14', 'a direct leaflet insert without a variant', v_leaflet_plain, 'ok');
  perform pg_temp.assert_period_count('14', 'the allowed direct insert', v_med, 2);
  perform pg_temp.assert_period_count('14', 'the allowed leaflet insert', v_leaflet, 2);

  raise notice 'DOSAGE 14 OK: direct writes with a variant of another name or composition, or any variant for a leaflet medication, are DP005; an allowed variant passes; another account''s medication is refused by RLS';
end;
$$;

-- ---------------------------------------------------------------------------
-- DOSAGE 15: the variants offered on the dose change screen (impl-review F3)
-- ---------------------------------------------------------------------------

do $$
declare
  v_a constant uuid := '00000000-0000-4000-9200-000000000a00';
  v_b constant uuid := '00000000-0000-4000-9200-000000000b00';
  v_alpha_200 constant uuid := '00000000-0000-4000-9200-0000000000a1';
  v_alpha_400 constant uuid := '00000000-0000-4000-9200-0000000000a2';
  v_today constant date := (now() at time zone 'Europe/Warsaw')::date;
  v_med uuid;
  v_leaflet uuid;
  v_b_med uuid;
  v_own uuid[];
  v_own_leaflet uuid[];
  v_foreign uuid[];
  v_owner_view uuid[];
begin
  perform pg_temp.act_as(v_b);
  v_b_med := public.add_medication_from_registry(v_alpha_200, '1 tabletka', v_today - 30);

  perform pg_temp.act_as(v_a);
  v_med := public.add_medication_from_registry(v_alpha_200, '1 tabletka', v_today - 30);
  v_leaflet := public.add_medication_from_leaflet('Dosagecheck leaflet 15', 'ibuprofen', false, '1 tabletka', v_today - 30);
  v_own := array(select public.registry_variants_of(v_med) order by 1);
  v_own_leaflet := array(select public.registry_variants_of(v_leaflet));
  v_foreign := array(select public.registry_variants_of(v_b_med));

  -- Owner counterexample for the foreign case: account B sees the variants of the same medication.
  perform pg_temp.act_as(v_b);
  v_owner_view := array(select public.registry_variants_of(v_b_med) order by 1);
  perform pg_temp.act_as_postgres();

  -- Alpha 200 mg: itself and DOSAGECHECK alpha 400 mg; not the other ATC set (a3), the other uncoded set (a4) or Beta.
  if v_own is distinct from array[v_alpha_200, v_alpha_400] then
    raise exception 'DOSAGE 15 FAILED: variants of Dosagecheck Alpha 200 mg are %, expected %', v_own, array[v_alpha_200, v_alpha_400];
  end if;
  if cardinality(v_own_leaflet) <> 0 then
    raise exception 'DOSAGE 15 FAILED: a leaflet medication got variants %', v_own_leaflet;
  end if;
  if cardinality(v_foreign) <> 0 then
    raise exception 'DOSAGE 15 FAILED: account A got variants % of account B''s medication', v_foreign;
  end if;
  if v_owner_view is distinct from array[v_alpha_200, v_alpha_400] then
    raise exception 'DOSAGE 15 FAILED: account B sees variants % of its own medication, expected %', v_owner_view, array[v_alpha_200, v_alpha_400];
  end if;

  raise notice 'DOSAGE 15 OK: registry_variants_of gives the same-name, same-composition variants; nothing for a leaflet medication or another account''s medication';
end;
$$;

-- Completion marker for scripts/db-checks.mjs: printed only after every check above has passed.
do $$
begin
  if current_user <> 'postgres' then
    raise exception 'FINAL CHECK FAILED: file ends as % instead of postgres, a role was not reset', current_user;
  end if;
  raise notice 'GATE_COMPLETE dosage_change_checks';
end;
$$;

rollback;
