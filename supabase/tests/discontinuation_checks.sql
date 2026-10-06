-- Discontinuation checks (S-04): ending a medication with a date, correcting or cancelling the end within its own
-- 24-hour window, the periods following the end on every write path, and deleting an item added by mistake.
--   DISCONTINUATION 1:  discontinue_medication passes for today and for 14 days back; the ongoing period ends on the
--                       date; discontinued_at is the server clock whatever the client sends, also on a direct update;
--                       a medication cannot be inserted already ended; discontinuation_correction_ends_at is
--                       discontinued_at + 24 h, null for a current medication.
--   DISCONTINUATION 2:  every refusal of discontinue_medication by its own case: 28000, MD001 (missing and another
--                       account's medication), MD002, MD006, MD003, MD004, MD005 (start of the period and earlier);
--                       a refused call changes nothing; the day after the start passes.
--   DISCONTINUATION 3:  correct_discontinuation within the window — on a fresh period and on periods saved 3 days ago
--                       (a fresh period skips the closed-window block of the guard and would not prove the exception):
--                       moving changes discontinued_on and the end of the last period and keeps discontinued_at;
--                       cancelling clears both dates and the last period is ongoing again; the earlier period never
--                       changes; 28000, MD001, MD007, MD009, MD003, MD004, MD005.
--   DISCONTINUATION 4:  the exception in dosage_periods_guard_core works only from the sync trigger and only for the
--                       last period: a direct client write (depth 1) reopening the aged, closed last period of a
--                       current medication is P0001 (the case where the exception's value test alone would pass); a
--                       direct write to the end of the last period, aged, with the window of the end open, is P0001; so is a direct write to the earlier period, and a write to
--                       the earlier period from another trigger (depth 2).
--   DISCONTINUATION 5:  the window of the end on the real clock (discontinued_at backdated): at 23 h 59 min moving
--                       passes and keeps discontinued_at; at 24 h correct_discontinuation is MD008 for moving and
--                       cancelling, and a direct update of discontinued_on (moving, clearing) and of the end of the
--                       last period is P0001 — S-02 debt.
--   DISCONTINUATION 6:  a direct update of discontinued_on to tomorrow or to 15 days back is P0001.
--   DISCONTINUATION 7:  a period inserted into an ended medication is P0001 with the medication window open;
--                       change_dosage of an ended medication is DP001 — F6b debt.
--   DISCONTINUATION 8:  a medication added a moment ago (window of the period open) and ended: a direct update of
--                       the period to ended_on = null, to the day after the end date or to the day before it (the
--                       last period ends exactly on the end date, impl-review F6) is P0001.
--   DISCONTINUATION 9:  delete_medication: within the window of the medication it deletes with the composition and
--                       periods; at 24 h it is MD010 and the rows stay; another account's medication is MD001; 28000.
--   DISCONTINUATION 10: the trigger medications_sync_discontinuation exists, is enabled and fires AFTER UPDATE OF
--                       discontinued_on for each row.
--   DISCONTINUATION 11: anon cannot execute the three functions and the computed field, authenticated can.
--   DISCONTINUATION 12: re-pointing a period away from a medication whose window is closed, or which is ended, is
--                       P0001 even when the target's window is open; cancelling the end afterwards keeps the end of
--                       the period closed by a dose change (impl-review F1).
--
-- How to run: `npm run db:check` (needs `npx supabase start`), or this file alone:
-- `node scripts/db-checks.mjs supabase/tests/discontinuation_checks.sql`. The runner (scripts/db-checks.mjs) passes it
-- only when it prints `GATE_COMPLETE discontinuation_checks` at the end.
--
-- Rules every block follows (same as correction_window_checks.sql):
--   - Rows get an old created_at only through pg_temp.backdate, and an old discontinued_at only through
--     pg_temp.backdate_discontinuation: as postgres each disables ONLY the one stamping trigger of that column for one
--     update and re-enables it, asserting that it is enabled again. Every guard stays active, and no window function
--     is replaced, so each block measures the real 24-hour clock.
--   - now() is constant inside the transaction, so 23 h 59 min means one minute of window left and 24 h means the
--     window ended exactly now.
--   - Function calls go through pg_temp.try_discontinue / try_correct / try_delete, which catch only the named
--     SQLSTATEs the function raises; direct writes go through pg_temp.try_exec, which catches only P0001 and returns
--     its message. Any other error stops the file. A refusal must carry the expected wording; a pass must touch exactly
--     one row.
--   - The role is switched at the top level of a block, never inside an exception subblock; each switch is asserted.
--
-- Everything runs in one transaction ended with rollback: nothing is left behind.

\set ON_ERROR_STOP on

begin;

-- ---------------------------------------------------------------------------
-- Test accounts and helpers. UUID pool 00000000-0000-4000-9500-*.
--   account A: 0a00, account B: 0b00
-- ---------------------------------------------------------------------------

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-9500-000000000a00',
   'authenticated', 'authenticated', 'discontinuation-a@example.test', 'x', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-9500-000000000b00',
   'authenticated', 'authenticated', 'discontinuation-b@example.test', 'x', now(), now());

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

-- Moves discontinued_at of one ended medication back by p_age. Only the stamping trigger is disabled, for this one
-- update; medications_guard_core stays active (it does not compare discontinued_at).
create function pg_temp.backdate_discontinuation(p_id uuid, p_age interval)
returns void
language plpgsql
as $$
declare
  v_rows integer;
begin
  if current_user <> 'postgres' then
    raise exception 'backdate_discontinuation must run as postgres (current_user %)', current_user;
  end if;

  alter table public.medications disable trigger medications_stamp_discontinuation;
  update public.medications
     set discontinued_at = now() - p_age
   where id = p_id
     and discontinued_on is not null;
  get diagnostics v_rows = row_count;
  alter table public.medications enable trigger medications_stamp_discontinuation;

  if v_rows <> 1 then
    raise exception 'backdate_discontinuation of % touched % row(s), expected 1 ended medication', p_id, v_rows;
  end if;
  if (select tg.tgenabled from pg_trigger tg
       where tg.tgrelid = 'public.medications'::regclass
         and tg.tgname = 'medications_stamp_discontinuation') is distinct from 'O' then
    raise exception 'stamping trigger medications_stamp_discontinuation was not re-enabled after backdate_discontinuation';
  end if;
  if (select discontinued_at from public.medications where id = p_id) is distinct from now() - p_age then
    raise exception 'backdate_discontinuation of % stored %, expected now() - %',
      p_id, (select discontinued_at from public.medications where id = p_id), p_age;
  end if;
end;
$$;

-- Each try_* returns 'ok' or the SQLSTATE of a refusal. Only the codes the function raises are caught, each by name.
create function pg_temp.try_discontinue(p_medication_id uuid, p_date date)
returns text
language plpgsql
as $$
begin
  perform public.discontinue_medication(p_medication_id, p_date);
  return 'ok';
exception
  when sqlstate '28000' then return '28000';
  when sqlstate 'MD001' then return 'MD001';
  when sqlstate 'MD002' then return 'MD002';
  when sqlstate 'MD003' then return 'MD003';
  when sqlstate 'MD004' then return 'MD004';
  when sqlstate 'MD005' then return 'MD005';
  when sqlstate 'MD006' then return 'MD006';
end;
$$;

create function pg_temp.try_correct(p_medication_id uuid, p_date date)
returns text
language plpgsql
as $$
begin
  perform public.correct_discontinuation(p_medication_id, p_date);
  return 'ok';
exception
  when sqlstate '28000' then return '28000';
  when sqlstate 'MD001' then return 'MD001';
  when sqlstate 'MD003' then return 'MD003';
  when sqlstate 'MD004' then return 'MD004';
  when sqlstate 'MD005' then return 'MD005';
  when sqlstate 'MD007' then return 'MD007';
  when sqlstate 'MD008' then return 'MD008';
  when sqlstate 'MD009' then return 'MD009';
end;
$$;

create function pg_temp.try_delete(p_medication_id uuid)
returns text
language plpgsql
as $$
begin
  perform public.delete_medication(p_medication_id);
  return 'ok';
exception
  when sqlstate '28000' then return '28000';
  when sqlstate 'MD001' then return 'MD001';
  when sqlstate 'MD010' then return 'MD010';
end;
$$;

-- Calls change_dosage and returns 'ok' or DP001; any other error propagates.
create function pg_temp.try_change_dosage(p_medication_id uuid, p_date date)
returns text
language plpgsql
as $$
begin
  perform public.change_dosage(p_medication_id, '5 tabletek', p_date);
  return 'ok';
exception
  when sqlstate 'DP001' then return 'DP001';
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

create function pg_temp.assert_result(p_check text, p_case text, p_got text, p_expected text)
returns void
language plpgsql
as $$
begin
  if p_got is distinct from p_expected then
    raise exception 'DISCONTINUATION % FAILED: % gave %, expected %', p_check, p_case, p_got, p_expected;
  end if;
end;
$$;

-- A refusal counts only as P0001 whose message matches the guard's wording (a LIKE pattern).
create function pg_temp.assert_refused(p_check text, p_case text, p_got text, p_pattern text)
returns void
language plpgsql
as $$
begin
  if p_got is null or p_got not like 'P0001: %' then
    raise exception 'DISCONTINUATION % FAILED: % gave "%", expected a P0001 refusal', p_check, p_case, p_got;
  end if;
  if p_got not like p_pattern then
    raise exception 'DISCONTINUATION % FAILED: % was refused by an unexpected P0001 error, expected wording "%" (got %)',
      p_check, p_case, p_pattern, p_got;
  end if;
end;
$$;

-- The state of a medication and its periods, for "nothing changed" checks and failure messages.
create function pg_temp.state(p_medication_id uuid)
returns text
language sql
stable
as $$
  select format('discontinued_on %s, discontinued_at %s, periods: %s',
    coalesce(m.discontinued_on::text, '-'), coalesce(m.discontinued_at::text, '-'),
    (select string_agg(format('[%s, %s)', dp.started_on, coalesce(dp.ended_on::text, '…')), '; ' order by dp.started_on)
       from public.dosage_periods dp where dp.medication_id = m.id))
  from public.medications m
  where m.id = p_medication_id
$$;

-- Asserts the end date, discontinued_at and the end of the last period of a medication.
create function pg_temp.assert_state(p_check text, p_case text, p_medication_id uuid,
                                     p_discontinued_on date, p_discontinued_at timestamptz)
returns void
language plpgsql
as $$
declare
  v_last_end date;
begin
  select dp.ended_on into v_last_end
    from public.dosage_periods dp
   where dp.medication_id = p_medication_id
   order by dp.started_on desc
   limit 1;
  if (select discontinued_on from public.medications where id = p_medication_id) is distinct from p_discontinued_on
     or (select discontinued_at from public.medications where id = p_medication_id) is distinct from p_discontinued_at
     or v_last_end is distinct from p_discontinued_on
     or (select count(*) from public.dosage_periods
          where medication_id = p_medication_id and ended_on is null) <> (case when p_discontinued_on is null then 1 else 0 end) then
    raise exception 'DISCONTINUATION % FAILED: after % expected discontinued_on %, discontinued_at % and the last period ending on it (got %)',
      p_check, p_case, coalesce(p_discontinued_on::text, '-'), coalesce(p_discontinued_at::text, '-'), pg_temp.state(p_medication_id);
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- DISCONTINUATION 1: ending today and 14 days back; discontinued_at is the server clock
-- ---------------------------------------------------------------------------

do $$
declare
  v_a constant uuid := '00000000-0000-4000-9500-000000000a00';
  v_today constant date := (now() at time zone 'Europe/Warsaw')::date;
  v_today_med uuid;
  v_back_med uuid;
  v_direct_med uuid;
  v_current_med uuid;
  v_today_result text;
  v_back_result text;
  v_direct_result text;
  v_forge_result text;
  v_insert_result text;
  v_ends_at timestamptz;
  v_current_ends_at timestamptz;
begin
  perform pg_temp.act_as(v_a);
  v_today_med := public.add_medication_from_leaflet('Discontinuation 1 today', 'ibuprofen', false, '1 tabletka', v_today - 30);
  v_back_med := public.add_medication_from_leaflet('Discontinuation 1 back', 'ibuprofen', false, '1 tabletka', v_today - 30);
  v_direct_med := public.add_medication_from_leaflet('Discontinuation 1 direct', 'ibuprofen', false, '1 tabletka', v_today - 30);
  v_current_med := public.add_medication_from_leaflet('Discontinuation 1 current', 'ibuprofen', false, '1 tabletka', v_today - 30);

  v_today_result := pg_temp.try_discontinue(v_today_med, v_today);
  v_back_result := pg_temp.try_discontinue(v_back_med, v_today - 14);
  -- A direct update sending its own discontinued_at, 3 days old: the stamp replaces it with now().
  v_direct_result := pg_temp.try_exec(
    format('update public.medications set discontinued_on = %L, discontinued_at = now() - interval ''3 days'' where id = $1', v_today - 1),
    v_direct_med);
  v_insert_result := pg_temp.try_exec(format(
    'insert into public.medications (id, user_id, product_name, composition_source, discontinued_on) values ($1, %L, ''Discontinuation 1 inserted ended'', ''leaflet'', %L)',
    v_a, v_today), '00000000-0000-4000-9500-000000000101');
  perform pg_temp.act_as_postgres();

  perform pg_temp.assert_result('1', 'ending today', v_today_result, 'ok');
  perform pg_temp.assert_state('1', 'ending today', v_today_med, v_today, now());
  perform pg_temp.assert_result('1', 'ending 14 days back', v_back_result, 'ok');
  perform pg_temp.assert_state('1', 'ending 14 days back', v_back_med, v_today - 14, now());
  perform pg_temp.assert_result('1', 'a direct update with a forged discontinued_at', v_direct_result, 'ok 1');
  perform pg_temp.assert_state('1', 'a direct update with a forged discontinued_at', v_direct_med, v_today - 1, now());
  perform pg_temp.assert_refused('1', 'inserting a medication already ended', v_insert_result, '%od razu zakończonego%');

  -- Moving discontinued_at of an ended medication forward would reopen its window: the stamp keeps the old value.
  perform pg_temp.backdate_discontinuation(v_today_med, interval '1 hour');
  perform pg_temp.act_as(v_a);
  v_forge_result := pg_temp.try_exec('update public.medications set discontinued_at = now() where id = $1', v_today_med);
  select public.discontinuation_correction_ends_at(m) into v_ends_at from public.medications m where m.id = v_today_med;
  select public.discontinuation_correction_ends_at(m) into v_current_ends_at from public.medications m where m.id = v_current_med;
  perform pg_temp.act_as_postgres();

  perform pg_temp.assert_result('1', 'moving discontinued_at forward', v_forge_result, 'ok 1');
  perform pg_temp.assert_state('1', 'moving discontinued_at forward', v_today_med, v_today, now() - interval '1 hour');
  if v_ends_at is distinct from now() - interval '1 hour' + interval '24 hours' then
    raise exception 'DISCONTINUATION 1 FAILED: discontinuation_correction_ends_at is %, expected discontinued_at + 24 h = %',
      v_ends_at, now() - interval '1 hour' + interval '24 hours';
  end if;
  if v_current_ends_at is not null then
    raise exception 'DISCONTINUATION 1 FAILED: discontinuation_correction_ends_at of a current medication is %, expected null', v_current_ends_at;
  end if;

  raise notice 'DISCONTINUATION 1 OK: ending today and 14 days back closes the ongoing period on the date; discontinued_at is now() whatever the client sends and cannot be moved; an ended medication cannot be inserted; the window end is discontinued_at + 24 h';
end;
$$;

-- ---------------------------------------------------------------------------
-- DISCONTINUATION 2: every refusal of discontinue_medication
-- ---------------------------------------------------------------------------

do $$
declare
  v_a constant uuid := '00000000-0000-4000-9500-000000000a00';
  v_b constant uuid := '00000000-0000-4000-9500-000000000b00';
  v_no_period constant uuid := '00000000-0000-4000-9500-000000000201';
  v_today constant date := (now() at time zone 'Europe/Warsaw')::date;
  v_med uuid;
  v_ended uuid;
  v_other uuid;
  v_no_session text;
  v_missing text;
  v_other_result text;
  v_ended_result text;
  v_no_period_result text;
  v_future text;
  v_too_old text;
  v_on_start text;
  v_before_start text;
  v_after_start text;
begin
  perform pg_temp.act_as(v_b);
  v_other := public.add_medication_from_leaflet('Discontinuation 2 account B', 'ibuprofen', false, '1 tabletka', v_today - 30);
  perform pg_temp.act_as_postgres();

  -- A current medication of account A whose only period is already closed: nothing ongoing to end.
  insert into public.medications (id, user_id, product_name, composition_source)
  values (v_no_period, v_a, 'Discontinuation 2 no ongoing period', 'leaflet');
  insert into public.dosage_periods (medication_id, dose_text, started_on, ended_on)
  values (v_no_period, '1 tabletka', v_today - 30, v_today - 20);

  -- No session: postgres has no auth.uid().
  perform pg_temp.act_as(v_a);
  v_med := public.add_medication_from_leaflet('Discontinuation 2 medication', 'ibuprofen', false, '1 tabletka', v_today - 3);
  v_ended := public.add_medication_from_leaflet('Discontinuation 2 ended', 'ibuprofen', false, '1 tabletka', v_today - 30);
  perform public.discontinue_medication(v_ended, v_today - 1);
  perform pg_temp.act_as_postgres();
  v_no_session := pg_temp.try_discontinue(v_med, v_today);

  perform pg_temp.act_as(v_a);
  v_missing := pg_temp.try_discontinue('00000000-0000-4000-9500-0000000002ff', v_today);
  v_other_result := pg_temp.try_discontinue(v_other, v_today);
  v_ended_result := pg_temp.try_discontinue(v_ended, v_today);
  v_no_period_result := pg_temp.try_discontinue(v_no_period, v_today);
  v_future := pg_temp.try_discontinue(v_med, v_today + 1);
  v_too_old := pg_temp.try_discontinue(v_med, v_today - 15);
  v_on_start := pg_temp.try_discontinue(v_med, v_today - 3);
  v_before_start := pg_temp.try_discontinue(v_med, v_today - 4);
  perform pg_temp.act_as_postgres();

  perform pg_temp.assert_result('2', 'a call without a session', v_no_session, '28000');
  perform pg_temp.assert_result('2', 'a missing medication', v_missing, 'MD001');
  perform pg_temp.assert_result('2', 'another account''s medication', v_other_result, 'MD001');
  perform pg_temp.assert_result('2', 'an ended medication', v_ended_result, 'MD002');
  perform pg_temp.assert_result('2', 'a medication without an ongoing period', v_no_period_result, 'MD006');
  perform pg_temp.assert_result('2', 'a date tomorrow', v_future, 'MD003');
  perform pg_temp.assert_result('2', 'a date 15 days back', v_too_old, 'MD004');
  perform pg_temp.assert_result('2', 'a date equal to the start of the ongoing period', v_on_start, 'MD005');
  perform pg_temp.assert_result('2', 'a date before the start of the ongoing period', v_before_start, 'MD005');

  -- Nothing changed by the refusals.
  perform pg_temp.assert_state('2', 'the refused calls', v_med, null, null);
  perform pg_temp.assert_state('2', 'the refused call on another account''s medication', v_other, null, null);
  perform pg_temp.assert_state('2', 'the refused call on an ended medication', v_ended, v_today - 1, now());
  if (select discontinued_on from public.medications where id = v_no_period) is not null then
    raise exception 'DISCONTINUATION 2 FAILED: the medication without an ongoing period was ended anyway';
  end if;

  -- Counterexample: the day after the start of the ongoing period passes.
  perform pg_temp.act_as(v_a);
  v_after_start := pg_temp.try_discontinue(v_med, v_today - 2);
  perform pg_temp.act_as_postgres();
  perform pg_temp.assert_result('2', 'the day after the start of the ongoing period', v_after_start, 'ok');
  perform pg_temp.assert_state('2', 'the day after the start of the ongoing period', v_med, v_today - 2, now());

  raise notice 'DISCONTINUATION 2 OK: 28000, MD001 (missing, another account), MD002, MD006, MD003, MD004 and MD005 (on and before the start) each reached by its case and change nothing; the day after the start passes';
end;
$$;

-- ---------------------------------------------------------------------------
-- DISCONTINUATION 3: correcting and cancelling within the window, on a fresh and on aged periods
-- ---------------------------------------------------------------------------
-- Fresh: one period [today-10, ongoing) saved now. Aged: P1 [today-30, today-10) and P2 [today-10, ongoing), the medication and both
-- periods saved 3 days ago, so every write to the end of P2 goes through the closed-window block of the guard.

do $$
declare
  v_a constant uuid := '00000000-0000-4000-9500-000000000a00';
  v_b constant uuid := '00000000-0000-4000-9500-000000000b00';
  v_today constant date := (now() at time zone 'Europe/Warsaw')::date;
  v_fresh uuid;
  v_aged uuid;
  v_p1 uuid;
  v_p2 uuid;
  v_current uuid;
  v_other uuid;
  v_label text;
  v_med uuid;
  v_start date;
  v_move text;
  v_cancel text;
  v_same text;
  v_future text;
  v_too_old text;
  v_on_start text;
  v_not_ended text;
  v_other_result text;
  v_no_session text;
begin
  perform pg_temp.act_as(v_a);
  v_fresh := public.add_medication_from_leaflet('Discontinuation 3 fresh', 'ibuprofen', false, '1 tabletka', v_today - 10);
  v_aged := public.add_medication_from_leaflet('Discontinuation 3 aged', 'ibuprofen', false, '1 tabletka', v_today - 30);
  v_p2 := public.change_dosage(v_aged, '2 tabletki', v_today - 10);
  v_current := public.add_medication_from_leaflet('Discontinuation 3 current', 'ibuprofen', false, '1 tabletka', v_today - 30);
  perform pg_temp.act_as_postgres();
  perform pg_temp.act_as(v_b);
  v_other := public.add_medication_from_leaflet('Discontinuation 3 account B', 'ibuprofen', false, '1 tabletka', v_today - 30);
  perform public.discontinue_medication(v_other, v_today);
  perform pg_temp.act_as_postgres();

  select id into v_p1 from public.dosage_periods where medication_id = v_aged and started_on = v_today - 30;
  perform pg_temp.backdate('medications', v_aged, interval '3 days');
  perform pg_temp.backdate('dosage_periods', v_p1, interval '3 days');
  perform pg_temp.backdate('dosage_periods', v_p2, interval '3 days');
  if public.dosage_period_correction_window_open(v_p2) then
    raise exception 'DISCONTINUATION 3 FAILED: the aged period is still within its window, so the check would not measure the guard exception';
  end if;

  foreach v_label in array array['fresh', 'aged'] loop
    v_med := case v_label when 'fresh' then v_fresh else v_aged end;
    -- Both last periods start 10 days back, so MD005 is reachable within the 14-day bound.
    v_start := v_today - 10;

    perform pg_temp.act_as(v_a);
    perform public.discontinue_medication(v_med, v_today - 1);
    perform pg_temp.act_as_postgres();
    -- Saved an hour ago, so "discontinued_at kept" is distinguishable from a new stamp.
    perform pg_temp.backdate_discontinuation(v_med, interval '1 hour');

    perform pg_temp.act_as(v_a);
    v_move := pg_temp.try_correct(v_med, v_today - 3);
    v_same := pg_temp.try_correct(v_med, v_today - 3);
    v_future := pg_temp.try_correct(v_med, v_today + 1);
    v_too_old := pg_temp.try_correct(v_med, v_today - 15);
    v_on_start := pg_temp.try_correct(v_med, v_start);
    perform pg_temp.act_as_postgres();

    perform pg_temp.assert_result('3', v_label || ': moving the end', v_move, 'ok');
    perform pg_temp.assert_result('3', v_label || ': the same date', v_same, 'MD009');
    perform pg_temp.assert_result('3', v_label || ': a date tomorrow', v_future, 'MD003');
    perform pg_temp.assert_result('3', v_label || ': a date 15 days back', v_too_old, 'MD004');
    perform pg_temp.assert_result('3', v_label || ': a date equal to the start of the last period', v_on_start, 'MD005');
    perform pg_temp.assert_state('3', v_label || ': moving the end', v_med, v_today - 3, now() - interval '1 hour');

    perform pg_temp.act_as(v_a);
    v_cancel := pg_temp.try_correct(v_med, null);
    perform pg_temp.act_as_postgres();
    perform pg_temp.assert_result('3', v_label || ': cancelling the end', v_cancel, 'ok');
    perform pg_temp.assert_state('3', v_label || ': cancelling the end', v_med, null, null);
  end loop;

  -- The earlier period of the aged medication never moved.
  if (select ended_on from public.dosage_periods where id = v_p1) is distinct from v_today - 10 then
    raise exception 'DISCONTINUATION 3 FAILED: the earlier period changed while the end was moved and cancelled (%)', pg_temp.state(v_aged);
  end if;

  -- Current again: a dose change of the cancelled medication passes.
  perform pg_temp.act_as(v_a);
  perform pg_temp.assert_result('3', 'a dose change after cancelling', pg_temp.try_change_dosage(v_aged, v_today - 1), 'ok');
  v_not_ended := pg_temp.try_correct(v_current, v_today);
  v_other_result := pg_temp.try_correct(v_other, v_today - 1);
  perform pg_temp.act_as_postgres();
  v_no_session := pg_temp.try_correct(v_fresh, v_today);

  perform pg_temp.assert_result('3', 'a medication that is not ended', v_not_ended, 'MD007');
  perform pg_temp.assert_result('3', 'another account''s medication', v_other_result, 'MD001');
  perform pg_temp.assert_result('3', 'a call without a session', v_no_session, '28000');
  perform pg_temp.assert_state('3', 'the refused call on another account''s medication', v_other, v_today, now());

  raise notice 'DISCONTINUATION 3 OK: on a fresh period and on periods saved 3 days ago, moving the end moves the end of the last period and keeps discontinued_at, cancelling makes the last period ongoing again; the earlier period never changes; MD009, MD003, MD004, MD005, MD007, MD001 and 28000 reached by their cases';
end;
$$;

-- ---------------------------------------------------------------------------
-- DISCONTINUATION 4: the guard exception only from the sync trigger and only for the last period
-- ---------------------------------------------------------------------------
-- P1 [today-30, today-10) and P2 [today-10, today-1) after ending on today-1; the medication and both periods saved
-- 3 days ago; the window of the end open.

do $$
declare
  v_a constant uuid := '00000000-0000-4000-9500-000000000a00';
  v_today constant date := (now() at time zone 'Europe/Warsaw')::date;
  v_med uuid;
  v_p1 uuid;
  v_p2 uuid;
  v_last_earlier text;
  v_last_null text;
  v_last_later text;
  v_first text;
  v_trigger_write text;
  v_current_closed constant uuid := '00000000-0000-4000-9500-000000000401';
  v_current_closed_period constant uuid := '00000000-0000-4000-9500-000000000402';
  v_current_reopen text;
begin
  -- A current medication (no end date) whose only, aged period is closed: here the value the exception accepts
  -- (discontinued_on = null) differs from the stored end, so only the depth condition stops a client from reopening it.
  insert into public.medications (id, user_id, product_name, composition_source)
  values (v_current_closed, v_a, 'Discontinuation 4 current, closed period', 'leaflet');
  insert into public.dosage_periods (id, medication_id, dose_text, started_on, ended_on)
  values (v_current_closed_period, v_current_closed, '1 tabletka', v_today - 30, v_today - 20);
  perform pg_temp.backdate('medications', v_current_closed, interval '3 days');
  perform pg_temp.backdate('dosage_periods', v_current_closed_period, interval '3 days');

  perform pg_temp.act_as(v_a);
  v_current_reopen := pg_temp.try_exec('update public.dosage_periods set ended_on = null where id = $1', v_current_closed_period);
  v_med := public.add_medication_from_leaflet('Discontinuation 4 medication', 'ibuprofen', false, '1 tabletka', v_today - 30);
  v_p2 := public.change_dosage(v_med, '2 tabletki', v_today - 10);
  perform pg_temp.act_as_postgres();
  select id into v_p1 from public.dosage_periods where medication_id = v_med and started_on = v_today - 30;
  perform pg_temp.backdate('medications', v_med, interval '3 days');
  perform pg_temp.backdate('dosage_periods', v_p1, interval '3 days');
  perform pg_temp.backdate('dosage_periods', v_p2, interval '3 days');

  perform pg_temp.act_as(v_a);
  perform public.discontinue_medication(v_med, v_today - 1);
  -- Direct client writes run at trigger depth 1: no exception, whatever the value.
  v_last_earlier := pg_temp.try_exec(format('update public.dosage_periods set ended_on = %L where id = $1', v_today - 2), v_p2);
  v_last_null := pg_temp.try_exec('update public.dosage_periods set ended_on = null where id = $1', v_p2);
  v_last_later := pg_temp.try_exec(format('update public.dosage_periods set ended_on = %L where id = $1', v_today), v_p2);
  v_first := pg_temp.try_exec(format('update public.dosage_periods set ended_on = %L where id = $1', v_today - 11), v_p1);
  perform pg_temp.act_as_postgres();

  if public.discontinuation_correction_ends_at((select m from public.medications m where m.id = v_med)) <= now() then
    raise exception 'DISCONTINUATION 4 FAILED: the window of the end is closed, so the check would not measure the depth rule';
  end if;
  perform pg_temp.assert_refused('4', 'a direct write reopening the closed last period of a current medication', v_current_reopen,
    '%ended_on%okno korekty%jest już zamknięte%');
  if (select ended_on from public.dosage_periods where id = v_current_closed_period) is distinct from v_today - 20 then
    raise exception 'DISCONTINUATION 4 FAILED: the closed period of a current medication was reopened (%)', pg_temp.state(v_current_closed);
  end if;
  perform pg_temp.assert_refused('4', 'a direct write moving the end of the last period earlier', v_last_earlier,
    '%ended_on%okno korekty%jest już zamknięte%');
  perform pg_temp.assert_refused('4', 'a direct write reopening the last period', v_last_null, '%ended_on%');
  perform pg_temp.assert_refused('4', 'a direct write moving the end of the last period after the end date', v_last_later, '%ended_on%');
  perform pg_temp.assert_refused('4', 'a direct write to the end of the earlier period', v_first,
    '%ended_on%okno korekty%jest już zamknięte%');

  -- A write from another trigger (depth 2) to the earlier period, with the value the exception would accept for the
  -- last one (the current discontinued_on). If the exception let it through, the no-overlap constraint would raise
  -- 23P01 instead, which try_exec does not catch, so the file would stop.
  create function pg_temp.write_first_period_end()
  returns trigger
  language plpgsql
  as $fn$
  begin
    update public.dosage_periods dp
       set ended_on = new.discontinued_on
     where dp.medication_id = new.id
       and dp.started_on = (select min(p.started_on) from public.dosage_periods p where p.medication_id = new.id);
    return null;
  end;
  $fn$;
  create trigger discontinuation_checks_write_first_period_end
    after update of product_name on public.medications
    for each row execute function pg_temp.write_first_period_end();

  v_trigger_write := pg_temp.try_exec('update public.medications set product_name = ''Discontinuation 4 renamed'' where id = $1', v_med);

  drop trigger discontinuation_checks_write_first_period_end on public.medications;
  drop function pg_temp.write_first_period_end();

  perform pg_temp.assert_refused('4', 'a depth-2 write to the end of the earlier period', v_trigger_write,
    '%ended_on%okno korekty%jest już zamknięte%');

  if (select ended_on from public.dosage_periods where id = v_p1) is distinct from v_today - 10
     or (select ended_on from public.dosage_periods where id = v_p2) is distinct from v_today - 1 then
    raise exception 'DISCONTINUATION 4 FAILED: a refused write changed a period (%)', pg_temp.state(v_med);
  end if;

  raise notice 'DISCONTINUATION 4 OK: reopening the aged closed last period of a current medication is P0001; with the window of the end open, direct writes to the end of the aged last period (earlier, null, later) and of the earlier period are P0001, and a depth-2 write to the earlier period is P0001 too';
end;
$$;

-- ---------------------------------------------------------------------------
-- DISCONTINUATION 5: the window of the end on the real clock — S-02 debt
-- ---------------------------------------------------------------------------

do $$
declare
  v_a constant uuid := '00000000-0000-4000-9500-000000000a00';
  v_today constant date := (now() at time zone 'Europe/Warsaw')::date;
  v_med uuid;
  v_period uuid;
  v_boundary text;
  v_rpc_move text;
  v_rpc_cancel text;
  v_direct_move text;
  v_direct_clear text;
  v_direct_period text;
begin
  perform pg_temp.act_as(v_a);
  v_med := public.add_medication_from_leaflet('Discontinuation 5 medication', 'ibuprofen', false, '1 tabletka', v_today - 30);
  perform pg_temp.act_as_postgres();
  select id into v_period from public.dosage_periods where medication_id = v_med;
  perform pg_temp.backdate('medications', v_med, interval '3 days');
  perform pg_temp.backdate('dosage_periods', v_period, interval '3 days');

  perform pg_temp.act_as(v_a);
  perform public.discontinue_medication(v_med, v_today - 1);
  perform pg_temp.act_as_postgres();

  -- 23 h 59 min: one minute left, moving passes and does not extend the window.
  perform pg_temp.backdate_discontinuation(v_med, interval '23 hours 59 minutes');
  perform pg_temp.act_as(v_a);
  v_boundary := pg_temp.try_correct(v_med, v_today - 2);
  perform pg_temp.act_as_postgres();
  perform pg_temp.assert_result('5', 'moving the end at 23 h 59 min', v_boundary, 'ok');
  perform pg_temp.assert_state('5', 'moving the end at 23 h 59 min', v_med, v_today - 2, now() - interval '23 hours 59 minutes');

  -- 24 h: the window of the end ended exactly now.
  perform pg_temp.backdate_discontinuation(v_med, interval '24 hours');
  perform pg_temp.act_as(v_a);
  v_rpc_move := pg_temp.try_correct(v_med, v_today - 3);
  v_rpc_cancel := pg_temp.try_correct(v_med, null);
  v_direct_move := pg_temp.try_exec(format('update public.medications set discontinued_on = %L where id = $1', v_today - 3), v_med);
  v_direct_clear := pg_temp.try_exec('update public.medications set discontinued_on = null where id = $1', v_med);
  v_direct_period := pg_temp.try_exec(format('update public.dosage_periods set ended_on = %L where id = $1', v_today - 3), v_period);
  perform pg_temp.act_as_postgres();

  perform pg_temp.assert_result('5', 'moving the end through the function at 24 h', v_rpc_move, 'MD008');
  perform pg_temp.assert_result('5', 'cancelling the end through the function at 24 h', v_rpc_cancel, 'MD008');
  perform pg_temp.assert_refused('5', 'a direct update moving discontinued_on at 24 h', v_direct_move,
    '%discontinued_on%okno korekty%jest już zamknięte%');
  perform pg_temp.assert_refused('5', 'a direct update clearing discontinued_on at 24 h', v_direct_clear,
    '%discontinued_on%okno korekty%jest już zamknięte%');
  perform pg_temp.assert_refused('5', 'a direct update of the end of the last period at 24 h', v_direct_period,
    '%ended_on%okno korekty%jest już zamknięte%');
  perform pg_temp.assert_state('5', 'the refused writes at 24 h', v_med, v_today - 2, now() - interval '24 hours');

  raise notice 'DISCONTINUATION 5 OK: at 23 h 59 min moving the end passes and keeps discontinued_at; at 24 h the function gives MD008 for moving and cancelling, and direct updates of discontinued_on (move, clear) and of the end of the last period are P0001';
end;
$$;

-- ---------------------------------------------------------------------------
-- DISCONTINUATION 6: a direct update of discontinued_on outside [today - 14 days, today]
-- ---------------------------------------------------------------------------

do $$
declare
  v_a constant uuid := '00000000-0000-4000-9500-000000000a00';
  v_today constant date := (now() at time zone 'Europe/Warsaw')::date;
  v_med uuid;
  v_tomorrow text;
  v_too_old text;
begin
  perform pg_temp.act_as(v_a);
  v_med := public.add_medication_from_leaflet('Discontinuation 6 medication', 'ibuprofen', false, '1 tabletka', v_today - 30);
  v_tomorrow := pg_temp.try_exec(format('update public.medications set discontinued_on = %L where id = $1', v_today + 1), v_med);
  v_too_old := pg_temp.try_exec(format('update public.medications set discontinued_on = %L where id = $1', v_today - 15), v_med);
  perform pg_temp.act_as_postgres();

  perform pg_temp.assert_refused('6', 'a direct update to tomorrow', v_tomorrow, '%discontinued_on%14 dni wstecz%');
  perform pg_temp.assert_refused('6', 'a direct update to 15 days back', v_too_old, '%discontinued_on%14 dni wstecz%');
  perform pg_temp.assert_state('6', 'the refused direct updates', v_med, null, null);

  raise notice 'DISCONTINUATION 6 OK: a direct update of discontinued_on to tomorrow or to 15 days back is P0001 and changes nothing';
end;
$$;

-- ---------------------------------------------------------------------------
-- DISCONTINUATION 7: no new period for an ended medication — F6b debt
-- ---------------------------------------------------------------------------
-- The medication window is open (added now) and the inserted period [today, ongoing) does not overlap the closed one,
-- so only the insert guard can refuse it.

do $$
declare
  v_a constant uuid := '00000000-0000-4000-9500-000000000a00';
  v_today constant date := (now() at time zone 'Europe/Warsaw')::date;
  v_med uuid;
  v_insert text;
  v_change text;
begin
  perform pg_temp.act_as(v_a);
  v_med := public.add_medication_from_leaflet('Discontinuation 7 medication', 'ibuprofen', false, '1 tabletka', v_today - 30);
  perform public.discontinue_medication(v_med, v_today - 1);
  v_insert := pg_temp.try_exec(format(
    'insert into public.dosage_periods (id, medication_id, dose_text, started_on) values ($1, %L, ''3 tabletki'', %L)',
    v_med, v_today), '00000000-0000-4000-9500-000000000701');
  v_change := pg_temp.try_change_dosage(v_med, v_today);
  perform pg_temp.act_as_postgres();

  if not public.medication_correction_window_open(v_med) then
    raise exception 'DISCONTINUATION 7 FAILED: the medication window is closed, so the check would not prove the rule is independent of it';
  end if;
  perform pg_temp.assert_refused('7', 'inserting a period into an ended medication', v_insert,
    '%dodać okresu dawkowania%przyjmowanie tego leku jest zakończone%');
  perform pg_temp.assert_result('7', 'a dose change of an ended medication', v_change, 'DP001');
  if (select count(*) from public.dosage_periods where medication_id = v_med) <> 1 then
    raise exception 'DISCONTINUATION 7 FAILED: an ended medication got a new period (%)', pg_temp.state(v_med);
  end if;

  raise notice 'DISCONTINUATION 7 OK: inserting a period into an ended medication is P0001 with the medication window open; change_dosage is DP001';
end;
$$;

-- ---------------------------------------------------------------------------
-- DISCONTINUATION 8: within the window of the period, an ended medication's period cannot be reopened
-- ---------------------------------------------------------------------------

do $$
declare
  v_a constant uuid := '00000000-0000-4000-9500-000000000a00';
  v_today constant date := (now() at time zone 'Europe/Warsaw')::date;
  v_med uuid;
  v_period uuid;
  v_reopen text;
  v_after_end text;
  v_before_end text;
begin
  perform pg_temp.act_as(v_a);
  v_med := public.add_medication_from_leaflet('Discontinuation 8 medication', 'ibuprofen', false, '1 tabletka', v_today - 5);
  perform public.discontinue_medication(v_med, v_today - 1);
  perform pg_temp.act_as_postgres();
  select id into v_period from public.dosage_periods where medication_id = v_med;
  if not public.dosage_period_correction_window_open(v_period) then
    raise exception 'DISCONTINUATION 8 FAILED: the period window is closed, so the check would not prove the rule is independent of it';
  end if;

  perform pg_temp.act_as(v_a);
  v_reopen := pg_temp.try_exec('update public.dosage_periods set ended_on = null where id = $1', v_period);
  v_after_end := pg_temp.try_exec(format('update public.dosage_periods set ended_on = %L where id = $1', v_today), v_period);
  v_before_end := pg_temp.try_exec(format('update public.dosage_periods set ended_on = %L where id = $1', v_today - 2), v_period);
  perform pg_temp.act_as_postgres();

  perform pg_temp.assert_refused('8', 'reopening the period of an ended medication', v_reopen,
    '%ended_on%przyjmowanie tego leku jest zakończone%');
  perform pg_temp.assert_refused('8', 'ending the period the day after the end date', v_after_end,
    '%ended_on%przyjmowanie tego leku jest zakończone%');
  perform pg_temp.assert_refused('8', 'ending the last period the day before the end date', v_before_end,
    '%ended_on%ostatni okres dawkowania kończy się w dniu zakończenia%');
  perform pg_temp.assert_state('8', 'the refused writes', v_med, v_today - 1, now());

  raise notice 'DISCONTINUATION 8 OK: with the period window open, ended_on = null, after the end date and before it (last period) are P0001 for an ended medication';
end;
$$;

-- ---------------------------------------------------------------------------
-- DISCONTINUATION 9: deleting an item added by mistake
-- ---------------------------------------------------------------------------

do $$
declare
  v_a constant uuid := '00000000-0000-4000-9500-000000000a00';
  v_b constant uuid := '00000000-0000-4000-9500-000000000b00';
  v_today constant date := (now() at time zone 'Europe/Warsaw')::date;
  v_fresh uuid;
  v_old uuid;
  v_other uuid;
  v_fresh_result text;
  v_old_result text;
  v_other_result text;
  v_no_session text;
begin
  perform pg_temp.act_as(v_b);
  v_other := public.add_medication_from_leaflet('Discontinuation 9 account B', 'ibuprofen', false, '1 tabletka', v_today - 3);
  perform pg_temp.act_as_postgres();
  perform pg_temp.act_as(v_a);
  v_fresh := public.add_medication_from_leaflet('Discontinuation 9 fresh', 'ibuprofen', false, '1 tabletka', v_today - 3);
  v_old := public.add_medication_from_leaflet('Discontinuation 9 old', 'ibuprofen', false, '1 tabletka', v_today - 3);
  perform pg_temp.act_as_postgres();
  perform pg_temp.backdate('medications', v_old, interval '24 hours');

  -- The cascade must have something to delete.
  if not exists (select 1 from public.medication_substances where medication_id = v_fresh)
     or not exists (select 1 from public.dosage_periods where medication_id = v_fresh) then
    raise exception 'DISCONTINUATION 9 FAILED: the fresh medication has no substance or period, so the cascade would not be measured';
  end if;

  v_no_session := pg_temp.try_delete(v_fresh);
  perform pg_temp.act_as(v_a);
  v_old_result := pg_temp.try_delete(v_old);
  v_other_result := pg_temp.try_delete(v_other);
  v_fresh_result := pg_temp.try_delete(v_fresh);
  perform pg_temp.act_as_postgres();

  perform pg_temp.assert_result('9', 'a call without a session', v_no_session, '28000');
  perform pg_temp.assert_result('9', 'deleting a medication added 24 h ago', v_old_result, 'MD010');
  perform pg_temp.assert_result('9', 'deleting another account''s medication', v_other_result, 'MD001');
  perform pg_temp.assert_result('9', 'deleting a medication within its window', v_fresh_result, 'ok');

  if exists (select 1 from public.medications where id = v_fresh)
     or exists (select 1 from public.medication_substances where medication_id = v_fresh)
     or exists (select 1 from public.dosage_periods where medication_id = v_fresh) then
    raise exception 'DISCONTINUATION 9 FAILED: deleting within the window left the medication or its children behind';
  end if;
  if not exists (select 1 from public.medications where id = v_old)
     or not exists (select 1 from public.medication_substances where medication_id = v_old)
     or not exists (select 1 from public.dosage_periods where medication_id = v_old)
     or not exists (select 1 from public.medications where id = v_other) then
    raise exception 'DISCONTINUATION 9 FAILED: a refused delete removed rows';
  end if;

  raise notice 'DISCONTINUATION 9 OK: within the window delete_medication removes the medication with its composition and periods; at 24 h it is MD010, another account''s medication MD001, no session 28000, and their rows stay';
end;
$$;

-- ---------------------------------------------------------------------------
-- DISCONTINUATION 10: the sync trigger exists, is enabled and fires AFTER UPDATE OF discontinued_on for each row
-- tgtype bits: 1 = for each row, 2 = before, 4 = insert, 8 = delete, 16 = update, 32 = truncate.
-- ---------------------------------------------------------------------------

do $$
declare
  v_trigger record;
begin
  select tg.tgenabled, tg.tgtype::integer as tgtype,
         array(select a.attname from unnest(tg.tgattr::int2[]) as col(attnum)
                 join pg_attribute a on a.attrelid = tg.tgrelid and a.attnum = col.attnum
                order by a.attname) as columns
    into v_trigger
    from pg_trigger tg
   where tg.tgrelid = 'public.medications'::regclass
     and tg.tgname = 'medications_sync_discontinuation'
     and not tg.tgisinternal;
  if not found then
    raise exception 'DISCONTINUATION 10 FAILED: trigger medications_sync_discontinuation on medications is missing';
  end if;
  if v_trigger.tgenabled <> 'O' then
    raise exception 'DISCONTINUATION 10 FAILED: medications_sync_discontinuation is not enabled (tgenabled %)', v_trigger.tgenabled;
  end if;
  if v_trigger.tgtype & 1 <> 1 or v_trigger.tgtype & 2 <> 0 then
    raise exception 'DISCONTINUATION 10 FAILED: medications_sync_discontinuation is not AFTER ... FOR EACH ROW (tgtype %)', v_trigger.tgtype;
  end if;
  if v_trigger.tgtype & 60 <> 16 then
    raise exception 'DISCONTINUATION 10 FAILED: medications_sync_discontinuation does not fire on exactly UPDATE (tgtype %)', v_trigger.tgtype;
  end if;
  if v_trigger.columns is distinct from array['discontinued_on']::name[] then
    raise exception 'DISCONTINUATION 10 FAILED: medications_sync_discontinuation fires on columns %, expected exactly discontinued_on', v_trigger.columns;
  end if;

  raise notice 'DISCONTINUATION 10 OK: medications_sync_discontinuation exists, is enabled and fires AFTER UPDATE OF discontinued_on for each row';
end;
$$;

-- ---------------------------------------------------------------------------
-- DISCONTINUATION 11: privileges of the functions the application calls
-- ---------------------------------------------------------------------------

do $$
declare
  v_function text;
begin
  foreach v_function in array array[
    'public.discontinue_medication(uuid, date)',
    'public.correct_discontinuation(uuid, date)',
    'public.delete_medication(uuid)',
    'public.discontinuation_correction_ends_at(public.medications)'
  ] loop
    if has_function_privilege('anon', v_function, 'execute') then
      raise exception 'DISCONTINUATION 11 FAILED: anon can execute %', v_function;
    end if;
    if not has_function_privilege('authenticated', v_function, 'execute') then
      raise exception 'DISCONTINUATION 11 FAILED: authenticated cannot execute %', v_function;
    end if;
  end loop;

  raise notice 'DISCONTINUATION 11 OK: anon cannot execute the three discontinuation functions and the computed field, authenticated can';
end;
$$;

-- ---------------------------------------------------------------------------
-- DISCONTINUATION 12: a period cannot be re-pointed away from a medication with a closed window or an end date
-- ---------------------------------------------------------------------------
-- The sequence from impl-review F1: an aged medication with P1 [today-30, today-2) closed by a dose change and a fresh
-- P2 from today-2, ended today. Moving P2 to another medication and then cancelling the end would reopen P1.

do $$
declare
  v_a constant uuid := '00000000-0000-4000-9500-000000000a00';
  v_today constant date := (now() at time zone 'Europe/Warsaw')::date;
  v_aged uuid;
  v_p1 uuid;
  v_p2 uuid;
  v_fresh uuid;
  v_fresh_period uuid;
  v_target uuid;
  v_target_2 uuid;
  v_from_closed text;
  v_from_ended text;
  v_cancel text;
begin
  perform pg_temp.act_as(v_a);
  v_aged := public.add_medication_from_leaflet('Discontinuation 12 aged', 'ibuprofen', false, '1 tabletka', v_today - 30);
  v_p2 := public.change_dosage(v_aged, '2 tabletki', v_today - 2);
  v_fresh := public.add_medication_from_leaflet('Discontinuation 12 fresh', 'ibuprofen', false, '1 tabletka', v_today - 5);
  v_target := public.add_medication_from_leaflet('Discontinuation 12 target', 'ibuprofen', false, '1 tabletka', v_today - 60);
  -- Each target's only period ends long before P2 and the fresh period, so without the source rule both re-pointings
  -- would pass (no dosage_periods_no_overlap conflict) and the check measures the rule, not the constraint.
  -- Two targets, so the two re-pointed periods never land under one medication and overlap each other.
  v_target_2 := public.add_medication_from_leaflet('Discontinuation 12 target 2', 'ibuprofen', false, '1 tabletka', v_today - 60);
  update public.dosage_periods set ended_on = v_today - 50 where medication_id in (v_target, v_target_2);
  perform pg_temp.act_as_postgres();
  select id into v_p1 from public.dosage_periods where medication_id = v_aged and started_on = v_today - 30;
  select id into v_fresh_period from public.dosage_periods where medication_id = v_fresh;
  perform pg_temp.backdate('medications', v_aged, interval '3 days');
  perform pg_temp.backdate('dosage_periods', v_p1, interval '3 days');

  perform pg_temp.act_as(v_a);
  perform public.discontinue_medication(v_aged, v_today);
  perform public.discontinue_medication(v_fresh, v_today);
  -- The targets' windows are open, so only the rule on the source medication can refuse these writes.
  v_from_closed := pg_temp.try_exec(format('update public.dosage_periods set medication_id = %L where id = $1', v_target), v_p2);
  v_from_ended := pg_temp.try_exec(format('update public.dosage_periods set medication_id = %L where id = $1', v_target_2), v_fresh_period);
  v_cancel := pg_temp.try_correct(v_aged, null);
  perform pg_temp.act_as_postgres();

  if public.dosage_period_correction_window_open(v_p2) is not true
     or public.medication_correction_window_open(v_fresh) is not true then
    raise exception 'DISCONTINUATION 12 FAILED: P2 or the fresh medication is outside its window, so the check would not isolate the source rule';
  end if;
  perform pg_temp.assert_refused('12', 're-pointing the fresh last period of an aged ended medication', v_from_closed,
    '%medication_id%okno korekty leku, z którego pochodzi ten okres%');
  perform pg_temp.assert_refused('12', 're-pointing the period of an ended medication within its window', v_from_ended,
    '%medication_id%przyjmowanie leku, z którego pochodzi ten okres, jest zakończone%');
  perform pg_temp.assert_result('12', 'cancelling the end after the refused re-pointing', v_cancel, 'ok');

  if (select ended_on from public.dosage_periods where id = v_p1) is distinct from v_today - 2
     or (select medication_id from public.dosage_periods where id = v_p2) is distinct from v_aged
     or (select ended_on from public.dosage_periods where id = v_p2) is not null
     or (select medication_id from public.dosage_periods where id = v_fresh_period) is distinct from v_fresh then
    raise exception 'DISCONTINUATION 12 FAILED: a refused re-pointing changed the history (aged: %; fresh: %)',
      pg_temp.state(v_aged), pg_temp.state(v_fresh);
  end if;

  raise notice 'DISCONTINUATION 12 OK: re-pointing a period away from a medication with a closed window or an end date is P0001; cancelling the end afterwards reopens only the last period and P1 keeps its end';
end;
$$;

-- Completion marker for scripts/db-checks.mjs: printed only after every check above has passed.
do $$
begin
  if current_user <> 'postgres' then
    raise exception 'FINAL CHECK FAILED: file ends as % instead of postgres, a role was not reset', current_user;
  end if;
  raise notice 'GATE_COMPLETE discontinuation_checks';
end;
$$;

rollback;
