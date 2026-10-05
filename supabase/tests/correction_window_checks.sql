-- Correction window checks (S-05 phase 1): the real 24-hour window counted from created_at of each row.
--   WINDOW 1: medication and its composition — 23 h 59 min after adding, a core change passes; 24 h after adding it
--             is refused with the named guard message.
--   WINDOW 2: dosage period — the same boundary measured on the period's own created_at; a period opened by a dose
--             change on a medication added 3 days ago can be corrected, the 3-day-old period cannot.
--   WINDOW 3: created_at is the server clock — a client cannot insert a row with created_at in the past, nor change
--             created_at later (medications and dosage_periods).
--   WINDOW 4: inserts follow the window — with the medication window 24 h old, adding a substance, a period before
--             the first one and a period between two existing ones are refused; change_dosage (a period at the end)
--             passes; the same inserts pass at 23 h 59 min. Re-pointing a substance or a period into a closed
--             medication is refused, into an open one passes.
--   WINDOW 5: correction_window_ends_at(row) read by authenticated is created_at + 24 h, for a medication and for
--             a dosage period.
--
-- How to run: `npm run db:check` (needs `npx supabase start`), or this file alone:
-- `node scripts/db-checks.mjs supabase/tests/correction_window_checks.sql`. The runner (scripts/db-checks.mjs) passes
-- it only when it prints `GATE_COMPLETE correction_window_checks` at the end.
--
-- Rules every block follows:
--   - Rows get an old created_at only through pg_temp.backdate: as postgres it disables ONLY the freeze trigger of
--     that table for one update and re-enables it, asserting that it is enabled again. Every history guard stays
--     active, so each block measures the guards it names. `session_replication_role = replica` is never used: it
--     would switch off every guard and the checks would measure nothing.
--   - now() is constant inside the transaction, so 23 h 59 min means one minute of window left and 24 h means the
--     window ended exactly now (now() < created_at + 24 h is false).
--   - Writes go through pg_temp.try_exec, which catches only P0001 (the guards' raise exception) and returns its
--     message; any other error stops the file. A refusal must name the closed correction window and the protected
--     field or object; a pass must touch exactly one row.
--   - The role is switched at the top level of a block, never inside an exception subblock.
--
-- Everything runs in one transaction ended with rollback: nothing is left behind.

\set ON_ERROR_STOP on

begin;

-- ---------------------------------------------------------------------------
-- Test accounts and helpers. UUID pool 00000000-0000-4000-9300-*.
--   account A: 0a00, account B: 0b00
-- ---------------------------------------------------------------------------

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-9300-000000000a00',
   'authenticated', 'authenticated', 'window-a@example.test', 'x', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-9300-000000000b00',
   'authenticated', 'authenticated', 'window-b@example.test', 'x', now(), now());

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

-- Moves created_at of one row back by p_age. Only the freeze trigger of the table is disabled, for this one update.
create function pg_temp.backdate(p_table name, p_id uuid, p_age interval)
returns void
language plpgsql
as $$
declare
  v_trigger name := p_table || '_freeze_created_at';
  v_rows integer;
  v_created_at timestamptz;
begin
  if current_user <> 'postgres' then
    raise exception 'backdate must run as postgres (current_user %)', current_user;
  end if;

  execute format('alter table public.%I disable trigger %I', p_table, v_trigger);
  execute format('update public.%I set created_at = now() - $1 where id = $2', p_table) using p_age, p_id;
  get diagnostics v_rows = row_count;
  execute format('alter table public.%I enable trigger %I', p_table, v_trigger);

  if v_rows <> 1 then
    raise exception 'backdate of %.% touched % row(s), expected 1', p_table, p_id, v_rows;
  end if;
  if (select tg.tgenabled from pg_trigger tg
       where tg.tgrelid = format('public.%I', p_table)::regclass and tg.tgname = v_trigger) is distinct from 'O' then
    raise exception 'freeze trigger % was not re-enabled after backdate', v_trigger;
  end if;
  execute format('select created_at from public.%I where id = $1', p_table) into v_created_at using p_id;
  if v_created_at is distinct from now() - p_age then
    raise exception 'backdate of %.% stored %, expected now() - %', p_table, p_id, v_created_at, p_age;
  end if;
end;
$$;

-- Runs one write with the row id as $1. Returns 'ok <rows>' or 'P0001: <message>'. Only P0001 is caught.
create function pg_temp.try_exec(p_sql text, p_id uuid)
returns text
language plpgsql
as $$
declare
  v_rows integer;
  v_message text;
begin
  execute p_sql using p_id;
  get diagnostics v_rows = row_count;
  return 'ok ' || v_rows;
exception when sqlstate 'P0001' then
  get stacked diagnostics v_message = message_text;
  return 'P0001: ' || v_message;
end;
$$;

create function pg_temp.assert_ok(p_check text, p_case text, p_got text)
returns void
language plpgsql
as $$
begin
  if p_got is distinct from 'ok 1' then
    raise exception 'WINDOW % FAILED: % gave "%", expected it to pass on exactly one row', p_check, p_case, p_got;
  end if;
end;
$$;

-- A refusal counts only as P0001 with the guard's wording: the closed correction window and the protected subject.
create function pg_temp.assert_blocked(p_check text, p_case text, p_got text, p_subject text)
returns void
language plpgsql
as $$
begin
  if p_got is null or p_got not like 'P0001: %' then
    raise exception 'WINDOW % FAILED: % gave "%", expected a refusal by the correction window guard', p_check, p_case, p_got;
  end if;
  if p_got not like '%okno korekty%jest już zamknięte%' or p_got not like '%' || p_subject || '%' then
    raise exception 'WINDOW % FAILED: % was blocked by an unexpected P0001 error, expected the correction window guard naming "%" (got %)',
      p_check, p_case, p_subject, p_got;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- WINDOW 1: medication and composition — 23 h 59 min passes, 24 h is refused
-- ---------------------------------------------------------------------------
-- Medication ...0101 of account A (leaflet), substance ...0102, period ...0103.

do $$
declare
  v_a constant uuid := '00000000-0000-4000-9300-000000000a00';
  v_b constant uuid := '00000000-0000-4000-9300-000000000b00';
  v_med constant uuid := '00000000-0000-4000-9300-000000000101';
  v_sub constant uuid := '00000000-0000-4000-9300-000000000102';
  v_today constant date := (now() at time zone 'Europe/Warsaw')::date;
begin
  insert into public.medications (id, user_id, product_name, composition_source)
  values (v_med, v_a, 'Window 1 medication', 'leaflet');
  insert into public.medication_substances (id, medication_id, substance_name, atc_code)
  values (v_sub, v_med, 'ibuprofenum', 'M01AE01');
  insert into public.dosage_periods (id, medication_id, dose_text, started_on)
  values ('00000000-0000-4000-9300-000000000103', v_med, '1 tabletka', v_today - 10);

  -- 23 h 59 min: one minute of window left, core changes pass.
  perform pg_temp.backdate('medications', v_med, interval '23 hours 59 minutes');
  if not public.medication_correction_window_open(v_med) then
    raise exception 'WINDOW 1 FAILED: the medication window is closed 23 h 59 min after adding';
  end if;
  perform pg_temp.assert_ok('1', 'moving the medication to account B at 23 h 59 min',
    pg_temp.try_exec(format('update public.medications set user_id = %L where id = $1', v_b), v_med));
  perform pg_temp.assert_ok('1', 'moving the medication back to account A at 23 h 59 min',
    pg_temp.try_exec(format('update public.medications set user_id = %L where id = $1', v_a), v_med));
  perform pg_temp.assert_ok('1', 'correcting substance_name at 23 h 59 min',
    pg_temp.try_exec('update public.medication_substances set substance_name = ''ibuprofenum poprawione'' where id = $1', v_sub));

  -- 24 h: the window ended exactly now.
  perform pg_temp.backdate('medications', v_med, interval '24 hours');
  if public.medication_correction_window_open(v_med) then
    raise exception 'WINDOW 1 FAILED: the medication window is still open 24 h after adding';
  end if;
  perform pg_temp.assert_blocked('1', 'moving the medication to account B at 24 h',
    pg_temp.try_exec(format('update public.medications set user_id = %L where id = $1', v_b), v_med), 'user_id');
  perform pg_temp.assert_blocked('1', 'correcting substance_name at 24 h',
    pg_temp.try_exec('update public.medication_substances set substance_name = ''inna substancja'' where id = $1', v_sub), 'substance_name');
  perform pg_temp.assert_blocked('1', 'deleting the substance at 24 h',
    pg_temp.try_exec('delete from public.medication_substances where id = $1', v_sub), 'usunąć wpisu składu leku');
  perform pg_temp.assert_blocked('1', 'deleting the medication at 24 h',
    pg_temp.try_exec('delete from public.medications where id = $1', v_med), 'usunąć leku');

  if (select user_id from public.medications where id = v_med) is distinct from v_a
     or (select substance_name from public.medication_substances where id = v_sub) is distinct from 'ibuprofenum poprawione' then
    raise exception 'WINDOW 1 FAILED: a refused change was saved anyway';
  end if;

  raise notice 'WINDOW 1 OK: 23 h 59 min after adding, the medication and its composition can be corrected; at 24 h user_id, substance_name and deletes are refused by the history guards';
end;
$$;

-- ---------------------------------------------------------------------------
-- WINDOW 2: dosage period — its own window; a period from a dose change is correctable, a 3-day-old one is not
-- ---------------------------------------------------------------------------

do $$
declare
  v_a constant uuid := '00000000-0000-4000-9300-000000000a00';
  v_today constant date := (now() at time zone 'Europe/Warsaw')::date;
  v_med uuid;
  v_old uuid;
  v_new uuid;
begin
  perform pg_temp.act_as(v_a);
  v_med := public.add_medication_from_leaflet('Window 2 medication', 'ibuprofen', false, '1 tabletka', v_today - 30);
  perform pg_temp.act_as_postgres();

  select id into v_old from public.dosage_periods where medication_id = v_med;
  perform pg_temp.backdate('medications', v_med, interval '3 days');
  perform pg_temp.backdate('dosage_periods', v_old, interval '3 days');

  perform pg_temp.act_as(v_a);
  v_new := public.change_dosage(v_med, '2 tabletki', v_today - 1);
  perform pg_temp.act_as_postgres();

  if public.medication_correction_window_open(v_med) or public.dosage_period_correction_window_open(v_old) then
    raise exception 'WINDOW 2 FAILED: the medication or the old period is still open 3 days after saving';
  end if;
  if not public.dosage_period_correction_window_open(v_new) then
    raise exception 'WINDOW 2 FAILED: the period opened by the dose change is closed right after saving';
  end if;

  -- As the owner, through the same path as the API.
  perform pg_temp.act_as(v_a);
  perform pg_temp.assert_ok('2', 'correcting dose_text of the period saved today',
    pg_temp.try_exec('update public.dosage_periods set dose_text = ''2 tabletki rano'' where id = $1', v_new));
  perform pg_temp.assert_blocked('2', 'correcting dose_text of the period saved 3 days ago',
    pg_temp.try_exec('update public.dosage_periods set dose_text = ''1 tabletka wieczorem'' where id = $1', v_old), 'dose_text');
  perform pg_temp.act_as_postgres();

  -- The boundary on the period's own created_at.
  perform pg_temp.backdate('dosage_periods', v_new, interval '23 hours 59 minutes');
  perform pg_temp.assert_ok('2', 'correcting dose_text of the period at 23 h 59 min',
    pg_temp.try_exec('update public.dosage_periods set dose_text = ''2 tabletki'' where id = $1', v_new));
  perform pg_temp.backdate('dosage_periods', v_new, interval '24 hours');
  perform pg_temp.assert_blocked('2', 'correcting dose_text of the period at 24 h',
    pg_temp.try_exec('update public.dosage_periods set dose_text = ''3 tabletki'' where id = $1', v_new), 'dose_text');
  perform pg_temp.assert_blocked('2', 'deleting the period at 24 h',
    pg_temp.try_exec('delete from public.dosage_periods where id = $1', v_new), 'usunąć okresu dawkowania');

  if (select dose_text from public.dosage_periods where id = v_new) is distinct from '2 tabletki'
     or (select dose_text from public.dosage_periods where id = v_old) is distinct from '1 tabletka' then
    raise exception 'WINDOW 2 FAILED: a refused change of a period was saved anyway';
  end if;

  raise notice 'WINDOW 2 OK: a period saved today on a 3-day-old medication can be corrected, the 3-day-old period cannot; the period window passes at 23 h 59 min and refuses at 24 h';
end;
$$;

-- ---------------------------------------------------------------------------
-- WINDOW 3: created_at is set by the server and cannot be changed by the client
-- ---------------------------------------------------------------------------

do $$
declare
  v_a constant uuid := '00000000-0000-4000-9300-000000000a00';
  v_med constant uuid := '00000000-0000-4000-9300-000000000301';
  v_period constant uuid := '00000000-0000-4000-9300-000000000302';
  v_today constant date := (now() at time zone 'Europe/Warsaw')::date;
  v_med_insert text;
  v_period_insert text;
  v_med_update text;
  v_period_update text;
begin
  perform pg_temp.act_as(v_a);
  v_med_insert := pg_temp.try_exec(format(
    'insert into public.medications (id, user_id, product_name, composition_source, created_at) values ($1, %L, ''Window 3 medication'', ''leaflet'', now() - interval ''3 days'')',
    v_a), v_med);
  v_period_insert := pg_temp.try_exec(format(
    'insert into public.dosage_periods (id, medication_id, dose_text, started_on, created_at) values ($1, %L, ''1 tabletka'', %L, now() - interval ''3 days'')',
    v_med, v_today - 5), v_period);
  v_med_update := pg_temp.try_exec('update public.medications set created_at = now() - interval ''3 days'' where id = $1', v_med);
  v_period_update := pg_temp.try_exec('update public.dosage_periods set created_at = now() + interval ''3 days'' where id = $1', v_period);
  perform pg_temp.act_as_postgres();

  perform pg_temp.assert_ok('3', 'inserting a medication with created_at in the past', v_med_insert);
  perform pg_temp.assert_ok('3', 'inserting a period with created_at in the past', v_period_insert);
  if (select created_at from public.medications where id = v_med) is distinct from now()
     or (select created_at from public.dosage_periods where id = v_period) is distinct from now() then
    raise exception 'WINDOW 3 FAILED: created_at sent by the client was stored instead of the server clock (medication %, period %)',
      (select created_at from public.medications where id = v_med),
      (select created_at from public.dosage_periods where id = v_period);
  end if;
  perform pg_temp.assert_blocked('3', 'moving created_at of a medication', v_med_update, 'created_at');
  perform pg_temp.assert_blocked('3', 'moving created_at of a period', v_period_update, 'created_at');

  -- The same refusal holds for postgres, so it is the trigger and not a privilege.
  perform pg_temp.assert_blocked('3', 'moving created_at of a medication as postgres',
    pg_temp.try_exec('update public.medications set created_at = now() - interval ''1 day'' where id = $1', v_med), 'created_at');

  raise notice 'WINDOW 3 OK: created_at sent on insert is replaced by now(), and changing it later is refused, for medications and dosage periods';
end;
$$;

-- ---------------------------------------------------------------------------
-- WINDOW 4: inserts and re-pointing follow the window of the medication
-- ---------------------------------------------------------------------------
-- Medication ...0401 of account A (leaflet) with P1 [today-60, today-40) and P2 [today-20, ongoing): a gap between
-- them, so an insert into the gap passes the no-overlap constraint and only the insert guard can refuse it.
-- Medication ...0411 is fresh (window open), with substance ...0412 and period ...0413, for the re-pointing cases.

do $$
declare
  v_a constant uuid := '00000000-0000-4000-9300-000000000a00';
  v_med constant uuid := '00000000-0000-4000-9300-000000000401';
  v_fresh constant uuid := '00000000-0000-4000-9300-000000000411';
  v_fresh_sub constant uuid := '00000000-0000-4000-9300-000000000412';
  v_fresh_period constant uuid := '00000000-0000-4000-9300-000000000413';
  v_today constant date := (now() at time zone 'Europe/Warsaw')::date;
  c_substance constant text :=
    'insert into public.medication_substances (id, medication_id, substance_name, atc_code) values ($1, ''00000000-0000-4000-9300-000000000401'', %L, %L)';
  c_period constant text :=
    'insert into public.dosage_periods (id, medication_id, dose_text, started_on, ended_on) values ($1, ''00000000-0000-4000-9300-000000000401'', ''dopisany okres'', %L, %L)';
  v_substance_open text;
  v_before_open text;
  v_substance_closed text;
  v_before_closed text;
  v_between_closed text;
  v_change text;
  v_repoint_sub text;
  v_repoint_period text;
  v_periods integer;
begin
  insert into public.medications (id, user_id, product_name, composition_source)
  values (v_med, v_a, 'Window 4 medication', 'leaflet'),
         (v_fresh, v_a, 'Window 4 fresh medication', 'leaflet');
  insert into public.dosage_periods (medication_id, dose_text, started_on, ended_on)
  values (v_med, 'P1', v_today - 60, v_today - 40),
         (v_med, 'P2', v_today - 20, null);
  insert into public.medication_substances (id, medication_id, substance_name, atc_code)
  values (v_fresh_sub, v_fresh, 'paracetamolum', 'N02BE01');
  insert into public.dosage_periods (id, medication_id, dose_text, started_on, ended_on)
  values (v_fresh_period, v_fresh, 'fresh', v_today - 200, v_today - 190);

  -- 23 h 59 min: the same inserts pass, so the refusals below come from the closed window.
  perform pg_temp.backdate('medications', v_med, interval '23 hours 59 minutes');
  perform pg_temp.act_as(v_a);
  v_substance_open := pg_temp.try_exec(format(c_substance, 'acidum acetylsalicylicum', 'B01AC06'), '00000000-0000-4000-9300-000000000402');
  v_before_open := pg_temp.try_exec(format(c_period, v_today - 120, v_today - 110), '00000000-0000-4000-9300-000000000403');
  perform pg_temp.act_as_postgres();
  perform pg_temp.assert_ok('4', 'adding a substance at 23 h 59 min', v_substance_open);
  perform pg_temp.assert_ok('4', 'adding a period before the first one at 23 h 59 min', v_before_open);

  -- 24 h: the window of the medication is closed.
  perform pg_temp.backdate('medications', v_med, interval '24 hours');
  select count(*) into v_periods from public.dosage_periods where medication_id = v_med;

  perform pg_temp.act_as(v_a);
  v_substance_closed := pg_temp.try_exec(format(c_substance, 'metamizolum', 'N02BB02'), '00000000-0000-4000-9300-000000000404');
  v_before_closed := pg_temp.try_exec(format(c_period, v_today - 180, v_today - 170), '00000000-0000-4000-9300-000000000405');
  v_between_closed := pg_temp.try_exec(format(c_period, v_today - 35, v_today - 25), '00000000-0000-4000-9300-000000000406');
  v_repoint_sub := pg_temp.try_exec(format('update public.medication_substances set medication_id = %L where id = $1', v_med), v_fresh_sub);
  v_repoint_period := pg_temp.try_exec(format('update public.dosage_periods set medication_id = %L where id = $1', v_med), v_fresh_period);
  perform pg_temp.act_as_postgres();

  perform pg_temp.assert_blocked('4', 'adding a substance at 24 h', v_substance_closed, 'dodać wpisu składu leku');
  perform pg_temp.assert_blocked('4', 'adding a period before the first one at 24 h', v_before_closed, 'dodać okresu dawkowania');
  perform pg_temp.assert_blocked('4', 'adding a period between two existing ones at 24 h', v_between_closed, 'dodać okresu dawkowania');
  perform pg_temp.assert_blocked('4', 're-pointing a substance into a closed medication', v_repoint_sub, 'medication_id');
  perform pg_temp.assert_blocked('4', 're-pointing a period into a closed medication', v_repoint_period, 'medication_id');
  if (select count(*) from public.dosage_periods where medication_id = v_med) <> v_periods
     or (select count(*) from public.medication_substances where medication_id = v_med) <> 1 then
    raise exception 'WINDOW 4 FAILED: a refused insert or re-pointing left a row in the closed medication';
  end if;

  -- A dose change adds its period at the end of the history and passes with the window closed.
  perform pg_temp.act_as(v_a);
  perform public.change_dosage(v_med, '2 tabletki', v_today - 1);
  perform pg_temp.act_as_postgres();
  if (select count(*) from public.dosage_periods where medication_id = v_med) <> v_periods + 1
     or not exists (select 1 from public.dosage_periods
                     where medication_id = v_med and started_on = v_today - 1 and ended_on is null and dose_text = '2 tabletki') then
    raise exception 'WINDOW 4 FAILED: change_dosage did not add its period at the end of the history with the window closed';
  end if;

  -- Counterexample for re-pointing: into a medication with the window open it passes.
  perform pg_temp.act_as(v_a);
  insert into public.medications (id, user_id, product_name, composition_source)
  values ('00000000-0000-4000-9300-000000000421', v_a, 'Window 4 second fresh medication', 'leaflet');
  perform pg_temp.assert_ok('4', 're-pointing a substance into an open medication',
    pg_temp.try_exec('update public.medication_substances set medication_id = ''00000000-0000-4000-9300-000000000421'' where id = $1', v_fresh_sub));
  perform pg_temp.act_as_postgres();

  raise notice 'WINDOW 4 OK: at 24 h adding a substance, a period before the first and a period between two are refused, re-pointing into the closed medication is refused, change_dosage adds its period at the end; at 23 h 59 min the same inserts pass';
end;
$$;

-- ---------------------------------------------------------------------------
-- WINDOW 5: correction_window_ends_at for authenticated is created_at + 24 h
-- ---------------------------------------------------------------------------

do $$
declare
  v_a constant uuid := '00000000-0000-4000-9300-000000000a00';
  v_today constant date := (now() at time zone 'Europe/Warsaw')::date;
  v_med uuid;
  v_med_end timestamptz;
  v_period_end timestamptz;
  v_period_created timestamptz;
begin
  perform pg_temp.act_as(v_a);
  v_med := public.add_medication_from_leaflet('Window 5 medication', 'ibuprofen', false, '1 tabletka', v_today - 3);
  perform pg_temp.act_as_postgres();
  perform pg_temp.backdate('medications', v_med, interval '5 hours');

  perform pg_temp.act_as(v_a);
  select public.correction_window_ends_at(m) into v_med_end from public.medications m where m.id = v_med;
  select public.correction_window_ends_at(dp), dp.created_at into v_period_end, v_period_created
    from public.dosage_periods dp where dp.medication_id = v_med;
  perform pg_temp.act_as_postgres();

  if v_med_end is distinct from now() - interval '5 hours' + interval '24 hours' then
    raise exception 'WINDOW 5 FAILED: correction_window_ends_at(medication) is %, expected created_at + 24 h = %',
      v_med_end, now() - interval '5 hours' + interval '24 hours';
  end if;
  if v_period_created is distinct from now() or v_period_end is distinct from now() + interval '24 hours' then
    raise exception 'WINDOW 5 FAILED: correction_window_ends_at(period) is % for created_at %, expected created_at + 24 h',
      v_period_end, v_period_created;
  end if;

  raise notice 'WINDOW 5 OK: correction_window_ends_at read by authenticated gives created_at + 24 h for a medication and a dosage period';
end;
$$;

-- Completion marker for scripts/db-checks.mjs: printed only after every check above has passed.
do $$
begin
  if current_user <> 'postgres' then
    raise exception 'FINAL CHECK FAILED: file ends as % instead of postgres, a role was not reset', current_user;
  end if;
  raise notice 'GATE_COMPLETE correction_window_checks';
end;
$$;

rollback;
