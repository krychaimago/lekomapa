-- Dosage undo checks (S-06 phase 1): undoing a dose change saved by mistake, on both write paths — the function
-- undo_dosage_change and a direct delete through the API (dosage_periods_guard_delete, dosage_periods_reopen_previous).
--   UNDO 1: undo_dosage_change on a medication added 3 days ago, inside the window of the new period — the period is
--           gone, the period before it is ongoing again with its dose, dates and variant unchanged, the medication
--           has exactly one ongoing period.
--   UNDO 2: every refusal of undo_dosage_change by its named SQLSTATE, each leaving the periods unchanged: DP011 for
--           the first period (also with its window closed: DP011 comes before DP009), DP012 for a period that is not
--           the newest, DP014 for a period with a gap before it, DP013 for an ended medication, DP009 when the period was saved 25 h ago, DP008 for another
--           account's period and for an unknown id, 28000 without a session.
--   UNDO 3: a direct delete as the owner follows the same rule — the newest period inside its window passes and
--           reopens the period before; the same delete 25 h after saving the period, the delete of a period that is
--           not the newest, of the only period, of a period with a gap before it and of the newest period of an ended
--           medication are refused with the guard's message.
--   UNDO 4: a direct `update ... set ended_on = null` on a closed period, without any delete, is refused by the
--           history guard: the reopening is reachable only as an effect of the delete.
--   UNDO 5: deleting a medication inside its window still removes all its periods (the cascade does not reopen
--           anything and nothing fails).
--
-- How to run: `npm run db:check` (needs `npx supabase start`), or this file alone:
-- `node scripts/db-checks.mjs supabase/tests/dosage_undo_checks.sql`. The runner (scripts/db-checks.mjs) passes it
-- only when it prints `GATE_COMPLETE dosage_undo_checks` at the end.
--
-- Rules every block follows (as in correction_window_checks.sql and dosage_change_checks.sql):
--   - Rows get an old created_at only through pg_temp.backdate: as postgres it disables ONLY the freeze trigger of
--     that table for one update and re-enables it, asserting that it is enabled again. Every history guard stays
--     active. `session_replication_role = replica` is never used: it would switch off every guard.
--   - undo_dosage_change goes through pg_temp.try_undo, which catches only the codes the function raises, each by
--     name; direct writes go through pg_temp.try_exec, which catches only P0001 (the guards' raise exception). Any
--     other error stops the file, so a typo or a missing function can never look like a working refusal.
--   - A refusal must leave the periods of the medication exactly as they were (pg_temp.periods_state).
--   - The role is switched at the top level of a block, never inside an exception subblock.
--
-- Everything runs in one transaction ended with rollback: nothing is left behind.

\set ON_ERROR_STOP on

begin;

-- ---------------------------------------------------------------------------
-- Test accounts and helpers. UUID pool 00000000-0000-4000-9600-*.
--   account A: 0a00, account B: 0b00
-- ---------------------------------------------------------------------------

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-9600-000000000a00',
   'authenticated', 'authenticated', 'undo-a@example.test', 'x', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-9600-000000000b00',
   'authenticated', 'authenticated', 'undo-b@example.test', 'x', now(), now());

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

-- Calls undo_dosage_change and returns 'ok' or the SQLSTATE of a refusal. Only the codes the function raises are
-- caught, each by name.
create function pg_temp.try_undo(p_period_id uuid)
returns text
language plpgsql
as $$
begin
  perform public.undo_dosage_change(p_period_id);
  return 'ok';
exception
  when sqlstate '28000' then return '28000';
  when sqlstate 'DP008' then return 'DP008';
  when sqlstate 'DP011' then return 'DP011';
  when sqlstate 'DP012' then return 'DP012';
  when sqlstate 'DP013' then return 'DP013';
  when sqlstate 'DP014' then return 'DP014';
  when sqlstate 'DP009' then return 'DP009';
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
    raise exception 'UNDO % FAILED: % gave %, expected %', p_check, p_case, p_got, p_expected;
  end if;
end;
$$;

-- A refusal of a direct write counts only as P0001 with the guard's wording naming the protected subject.
create function pg_temp.assert_blocked(p_check text, p_case text, p_got text, p_subject text)
returns void
language plpgsql
as $$
begin
  if p_got is null or p_got not like 'P0001: %' then
    raise exception 'UNDO % FAILED: % gave "%", expected a refusal by the history guard', p_check, p_case, p_got;
  end if;
  if p_got not like '%' || p_subject || '%' then
    raise exception 'UNDO % FAILED: % was blocked by an unexpected P0001 error, expected the guard naming "%" (got %)',
      p_check, p_case, p_subject, p_got;
  end if;
end;
$$;

-- Every period of a medication, oldest first, as one comparable text (read as postgres, so RLS hides nothing).
create function pg_temp.periods_state(p_medication_id uuid)
returns text
language sql
stable
as $$
  select coalesce(string_agg(format('%s | %s | [%s, %s) | %s | %s', id, dose_text, started_on,
                                    coalesce(ended_on::text, '…'), coalesce(registry_product_id::text, '-'), created_at),
                             ' ; ' order by started_on), '(none)')
    from public.dosage_periods where medication_id = p_medication_id
$$;

create function pg_temp.assert_unchanged(p_check text, p_case text, p_medication_id uuid, p_before text)
returns void
language plpgsql
as $$
begin
  if pg_temp.periods_state(p_medication_id) is distinct from p_before then
    raise exception 'UNDO % FAILED: after % the periods are %, expected them unchanged: %',
      p_check, p_case, pg_temp.periods_state(p_medication_id), p_before;
  end if;
end;
$$;

-- A medication of account A from a leaflet, started p_days_back days ago, with the medication row and its first
-- period saved p_age ago. Returns the medication id.
create function pg_temp.old_medication(p_name text, p_days_back integer, p_age interval)
returns uuid
language plpgsql
as $$
declare
  v_med uuid;
  v_first uuid;
begin
  perform pg_temp.act_as('00000000-0000-4000-9600-000000000a00');
  v_med := public.add_medication_from_leaflet(p_name, 'ibuprofen', false, '1 tabletka',
    (now() at time zone 'Europe/Warsaw')::date - p_days_back);
  perform pg_temp.act_as_postgres();
  select id into v_first from public.dosage_periods where medication_id = v_med;
  perform pg_temp.backdate('medications', v_med, p_age);
  perform pg_temp.backdate('dosage_periods', v_first, p_age);
  return v_med;
end;
$$;

-- A medication of account A whose first period was closed 10 days ago and whose second period, saved now, started
-- 5 days ago: a gap no screen creates, written directly as the owner. Returns the id of the second period.
create function pg_temp.gap_medication(p_name text)
returns uuid
language plpgsql
as $$
declare
  v_today constant date := (now() at time zone 'Europe/Warsaw')::date;
  v_med uuid;
  v_first uuid;
  v_second uuid;
begin
  v_med := pg_temp.old_medication(p_name, 30, interval '3 days');
  select id into v_first from public.dosage_periods where medication_id = v_med;
  perform pg_temp.act_as('00000000-0000-4000-9600-000000000a00');
  update public.dosage_periods set ended_on = v_today - 10 where id = v_first;
  insert into public.dosage_periods (medication_id, dose_text, started_on)
    values (v_med, '2 tabletki', v_today - 5)
    returning id into v_second;
  perform pg_temp.act_as_postgres();
  return v_second;
end;
$$;

-- ---------------------------------------------------------------------------
-- UNDO 1: undoing a fresh dose change removes the period and reopens the one before
-- ---------------------------------------------------------------------------

do $$
declare
  v_a constant uuid := '00000000-0000-4000-9600-000000000a00';
  v_today constant date := (now() at time zone 'Europe/Warsaw')::date;
  v_med uuid;
  v_first uuid;
  v_new uuid;
  v_first_before record;
  v_first_after record;
  v_result text;
begin
  v_med := pg_temp.old_medication('Undo 1 medication', 30, interval '3 days');
  select id into v_first from public.dosage_periods where medication_id = v_med;

  perform pg_temp.act_as(v_a);
  v_new := public.change_dosage(v_med, '2 tabletki', v_today - 2);
  perform pg_temp.act_as_postgres();

  select dose_text, started_on, ended_on, registry_product_id, created_at into v_first_before
    from public.dosage_periods where id = v_first;
  if v_first_before.ended_on is distinct from v_today - 2 then
    raise exception 'UNDO 1 FAILED: the dose change did not close the first period on its date (ended_on %)', v_first_before.ended_on;
  end if;

  perform pg_temp.act_as(v_a);
  v_result := pg_temp.try_undo(v_new);
  perform pg_temp.act_as_postgres();
  perform pg_temp.assert_result('1', 'undoing a dose change saved now on a 3-day-old medication', v_result, 'ok');

  if exists (select 1 from public.dosage_periods where id = v_new) then
    raise exception 'UNDO 1 FAILED: the undone period is still there';
  end if;
  select dose_text, started_on, ended_on, registry_product_id, created_at into v_first_after
    from public.dosage_periods where id = v_first;
  if v_first_after.ended_on is not null then
    raise exception 'UNDO 1 FAILED: the period before the undone one still ends on %', v_first_after.ended_on;
  end if;
  if v_first_after.dose_text is distinct from v_first_before.dose_text
     or v_first_after.started_on is distinct from v_first_before.started_on
     or v_first_after.registry_product_id is distinct from v_first_before.registry_product_id
     or v_first_after.created_at is distinct from v_first_before.created_at then
    raise exception 'UNDO 1 FAILED: reopening changed more than ended_on of the period before (% -> %)', v_first_before, v_first_after;
  end if;
  if (select count(*) from public.dosage_periods where medication_id = v_med) <> 1
     or (select count(*) from public.dosage_periods where medication_id = v_med and ended_on is null) <> 1 then
    raise exception 'UNDO 1 FAILED: the medication does not have exactly one ongoing period: %', pg_temp.periods_state(v_med);
  end if;

  raise notice 'UNDO 1 OK: undo_dosage_change removes the fresh period and the period before is ongoing again with its dose, start and variant unchanged';
end;
$$;

-- ---------------------------------------------------------------------------
-- UNDO 2: every refusal of undo_dosage_change by its named code, the periods unchanged
-- ---------------------------------------------------------------------------

do $$
declare
  v_a constant uuid := '00000000-0000-4000-9600-000000000a00';
  v_b constant uuid := '00000000-0000-4000-9600-000000000b00';
  v_today constant date := (now() at time zone 'Europe/Warsaw')::date;
  v_med uuid;
  v_ended uuid;
  v_first uuid;
  v_middle uuid;
  v_last uuid;
  v_ended_last uuid;
  v_gap uuid;
  v_gap_last uuid;
  v_before text;
  v_ended_before text;
  v_gap_before text;
  v_result text;
begin
  -- Medication with three periods: first (saved 3 days ago), middle and last (both saved now).
  v_med := pg_temp.old_medication('Undo 2 medication', 30, interval '3 days');
  select id into v_first from public.dosage_periods where medication_id = v_med;
  perform pg_temp.act_as(v_a);
  v_middle := public.change_dosage(v_med, '2 tabletki', v_today - 5);
  v_last := public.change_dosage(v_med, '3 tabletki', v_today - 2);
  perform pg_temp.act_as_postgres();
  v_before := pg_temp.periods_state(v_med);

  -- DP011: the first period, whose window is closed: DP011 comes before DP009.
  perform pg_temp.act_as(v_a);
  v_result := pg_temp.try_undo(v_first);
  perform pg_temp.act_as_postgres();
  perform pg_temp.assert_result('2', 'undoing the first period', v_result, 'DP011');
  perform pg_temp.assert_unchanged('2', 'DP011', v_med, v_before);

  -- DP012: a period inside its window that is not the newest one.
  perform pg_temp.act_as(v_a);
  v_result := pg_temp.try_undo(v_middle);
  perform pg_temp.act_as_postgres();
  perform pg_temp.assert_result('2', 'undoing a period that is not the newest', v_result, 'DP012');
  perform pg_temp.assert_unchanged('2', 'DP012', v_med, v_before);

  -- DP008: account B undoing account A's period, and an id that does not exist.
  perform pg_temp.act_as(v_b);
  v_result := pg_temp.try_undo(v_last);
  perform pg_temp.assert_result('2', 'account B undoing account A''s period', v_result, 'DP008');
  v_result := pg_temp.try_undo('00000000-0000-4000-9600-0000000000ff');
  perform pg_temp.assert_result('2', 'undoing an unknown period', v_result, 'DP008');
  perform pg_temp.act_as_postgres();
  perform pg_temp.assert_unchanged('2', 'DP008', v_med, v_before);

  -- 28000: postgres without claims.
  if auth.uid() is not null then
    raise exception 'UNDO 2 FAILED: auth.uid() is not empty as postgres without claims, so the case is not measured';
  end if;
  v_result := pg_temp.try_undo(v_last);
  perform pg_temp.assert_result('2', 'undoing without a session', v_result, '28000');
  perform pg_temp.assert_unchanged('2', '28000', v_med, v_before);

  -- DP009: the newest period saved 25 h ago.
  perform pg_temp.backdate('dosage_periods', v_last, interval '25 hours');
  v_before := pg_temp.periods_state(v_med);
  perform pg_temp.act_as(v_a);
  v_result := pg_temp.try_undo(v_last);
  perform pg_temp.act_as_postgres();
  perform pg_temp.assert_result('2', 'undoing the newest period saved 25 h ago', v_result, 'DP009');
  perform pg_temp.assert_unchanged('2', 'DP009', v_med, v_before);

  -- DP013: an ended medication whose newest period is inside its window.
  v_ended := pg_temp.old_medication('Undo 2 ended medication', 30, interval '3 days');
  perform pg_temp.act_as(v_a);
  v_ended_last := public.change_dosage(v_ended, '2 tabletki', v_today - 3);
  perform public.discontinue_medication(v_ended, v_today);
  perform pg_temp.act_as_postgres();
  v_ended_before := pg_temp.periods_state(v_ended);
  perform pg_temp.act_as(v_a);
  v_result := pg_temp.try_undo(v_ended_last);
  perform pg_temp.act_as_postgres();
  perform pg_temp.assert_result('2', 'undoing the newest period of an ended medication', v_result, 'DP013');
  perform pg_temp.assert_unchanged('2', 'DP013', v_ended, v_ended_before);

  -- DP014: the newest period inside its window, with a gap before it: nothing would be reopened.
  v_gap_last := pg_temp.gap_medication('Undo 2 gap medication');
  select medication_id into v_gap from public.dosage_periods where id = v_gap_last;
  v_gap_before := pg_temp.periods_state(v_gap);
  perform pg_temp.act_as(v_a);
  v_result := pg_temp.try_undo(v_gap_last);
  perform pg_temp.act_as_postgres();
  perform pg_temp.assert_result('2', 'undoing a period with a gap before it', v_result, 'DP014');
  perform pg_temp.assert_unchanged('2', 'DP014', v_gap, v_gap_before);

  raise notice 'UNDO 2 OK: DP011 (also with the window closed), DP012, DP008 (another account, unknown id), 28000, DP009, DP013 and DP014 refuse the undo and leave the periods unchanged';
end;
$$;

-- ---------------------------------------------------------------------------
-- UNDO 3: a direct delete follows the same rule
-- ---------------------------------------------------------------------------

do $$
declare
  v_a constant uuid := '00000000-0000-4000-9600-000000000a00';
  v_today constant date := (now() at time zone 'Europe/Warsaw')::date;
  c_delete constant text := 'delete from public.dosage_periods where id = $1';
  v_med uuid;
  v_single uuid;
  v_ended uuid;
  v_first uuid;
  v_new uuid;
  v_middle uuid;
  v_single_period uuid;
  v_ended_last uuid;
  v_gap uuid;
  v_gap_last uuid;
  v_before text;
  v_result text;
begin
  -- The newest period inside its window, on a medication whose own window is closed: the delete passes.
  v_med := pg_temp.old_medication('Undo 3 medication', 30, interval '3 days');
  select id into v_first from public.dosage_periods where medication_id = v_med;
  perform pg_temp.act_as(v_a);
  v_new := public.change_dosage(v_med, '2 tabletki', v_today - 1);
  v_result := pg_temp.try_exec(c_delete, v_new);
  perform pg_temp.act_as_postgres();
  perform pg_temp.assert_result('3', 'a direct delete of the newest period inside its window', v_result, 'ok 1');
  if (select ended_on from public.dosage_periods where id = v_first) is not null
     or (select count(*) from public.dosage_periods where medication_id = v_med) <> 1 then
    raise exception 'UNDO 3 FAILED: a direct delete did not reopen the period before: %', pg_temp.periods_state(v_med);
  end if;

  -- The same delete 25 h after saving the period: refused by the guard.
  perform pg_temp.act_as(v_a);
  v_new := public.change_dosage(v_med, '3 tabletki', v_today - 1);
  perform pg_temp.act_as_postgres();
  perform pg_temp.backdate('dosage_periods', v_new, interval '25 hours');
  v_before := pg_temp.periods_state(v_med);
  perform pg_temp.act_as(v_a);
  v_result := pg_temp.try_exec(c_delete, v_new);
  perform pg_temp.act_as_postgres();
  perform pg_temp.assert_blocked('3', 'a direct delete of the newest period 25 h after saving it', v_result,
    'usunąć okresu dawkowania');
  perform pg_temp.assert_unchanged('3', 'the refused delete after 25 h', v_med, v_before);

  -- A period inside its window that is not the newest: refused (deleting it would leave a gap).
  v_med := pg_temp.old_medication('Undo 3 second medication', 30, interval '3 days');
  perform pg_temp.act_as(v_a);
  v_middle := public.change_dosage(v_med, '2 tabletki', v_today - 5);
  perform public.change_dosage(v_med, '3 tabletki', v_today - 2);
  perform pg_temp.act_as_postgres();
  v_before := pg_temp.periods_state(v_med);
  perform pg_temp.act_as(v_a);
  v_result := pg_temp.try_exec(c_delete, v_middle);
  perform pg_temp.act_as_postgres();
  perform pg_temp.assert_blocked('3', 'a direct delete of a period that is not the newest', v_result,
    'usunąć okresu dawkowania');
  perform pg_temp.assert_unchanged('3', 'the refused delete of the middle period', v_med, v_before);

  -- The only period, inside its own window, of a medication whose window is closed: no period before, refused.
  perform pg_temp.act_as(v_a);
  v_single := public.add_medication_from_leaflet('Undo 3 single medication', 'ibuprofen', false, '1 tabletka', v_today - 10);
  perform pg_temp.act_as_postgres();
  perform pg_temp.backdate('medications', v_single, interval '3 days');
  select id into v_single_period from public.dosage_periods where medication_id = v_single;
  v_before := pg_temp.periods_state(v_single);
  perform pg_temp.act_as(v_a);
  v_result := pg_temp.try_exec(c_delete, v_single_period);
  perform pg_temp.act_as_postgres();
  perform pg_temp.assert_blocked('3', 'a direct delete of the only period', v_result, 'usunąć okresu dawkowania');
  perform pg_temp.assert_unchanged('3', 'the refused delete of the only period', v_single, v_before);

  -- The newest period of an ended medication, inside its window: refused.
  v_ended := pg_temp.old_medication('Undo 3 ended medication', 30, interval '3 days');
  perform pg_temp.act_as(v_a);
  v_ended_last := public.change_dosage(v_ended, '2 tabletki', v_today - 3);
  perform public.discontinue_medication(v_ended, v_today);
  perform pg_temp.act_as_postgres();
  v_before := pg_temp.periods_state(v_ended);
  perform pg_temp.act_as(v_a);
  v_result := pg_temp.try_exec(c_delete, v_ended_last);
  perform pg_temp.act_as_postgres();
  perform pg_temp.assert_blocked('3', 'a direct delete of the newest period of an ended medication', v_result,
    'usunąć okresu dawkowania');
  perform pg_temp.assert_unchanged('3', 'the refused delete on an ended medication', v_ended, v_before);

  -- The newest period inside its window, with a gap before it: refused (nothing would be reopened).
  v_gap_last := pg_temp.gap_medication('Undo 3 gap medication');
  select medication_id into v_gap from public.dosage_periods where id = v_gap_last;
  v_before := pg_temp.periods_state(v_gap);
  perform pg_temp.act_as(v_a);
  v_result := pg_temp.try_exec(c_delete, v_gap_last);
  perform pg_temp.act_as_postgres();
  perform pg_temp.assert_blocked('3', 'a direct delete of a period with a gap before it', v_result,
    'usunąć okresu dawkowania');
  perform pg_temp.assert_unchanged('3', 'the refused delete with a gap before it', v_gap, v_before);

  raise notice 'UNDO 3 OK: a direct delete of the newest period inside its window passes and reopens the period before; after 25 h, for a period that is not the newest, for the only period, with a gap before it and on an ended medication it is refused by the guard';
end;
$$;

-- ---------------------------------------------------------------------------
-- UNDO 4: reopening a closed period without a delete is refused
-- ---------------------------------------------------------------------------

do $$
declare
  v_a constant uuid := '00000000-0000-4000-9600-000000000a00';
  v_today constant date := (now() at time zone 'Europe/Warsaw')::date;
  v_med uuid;
  v_first uuid;
  v_before text;
  v_result text;
begin
  v_med := pg_temp.old_medication('Undo 4 medication', 30, interval '3 days');
  select id into v_first from public.dosage_periods where medication_id = v_med;
  perform pg_temp.act_as(v_a);
  perform public.change_dosage(v_med, '2 tabletki', v_today - 1);
  perform pg_temp.act_as_postgres();
  v_before := pg_temp.periods_state(v_med);

  perform pg_temp.act_as(v_a);
  v_result := pg_temp.try_exec('update public.dosage_periods set ended_on = null where id = $1', v_first);
  perform pg_temp.act_as_postgres();
  perform pg_temp.assert_blocked('4', 'a direct update clearing ended_on of the closed period', v_result, 'ended_on');
  if v_result not like '%okno korekty%jest już zamknięte%' then
    raise exception 'UNDO 4 FAILED: the update was refused by something other than the correction window guard: %', v_result;
  end if;
  perform pg_temp.assert_unchanged('4', 'the refused update', v_med, v_before);

  raise notice 'UNDO 4 OK: clearing ended_on of a closed period by a direct update is refused by the history guard';
end;
$$;

-- ---------------------------------------------------------------------------
-- UNDO 5: deleting a medication inside its window still removes every period
-- ---------------------------------------------------------------------------

do $$
declare
  v_a constant uuid := '00000000-0000-4000-9600-000000000a00';
  v_today constant date := (now() at time zone 'Europe/Warsaw')::date;
  v_med uuid;
begin
  perform pg_temp.act_as(v_a);
  v_med := public.add_medication_from_leaflet('Undo 5 medication', 'ibuprofen', false, '1 tabletka', v_today - 10);
  perform public.change_dosage(v_med, '2 tabletki', v_today - 5);
  perform public.change_dosage(v_med, '3 tabletki', v_today - 2);
  perform public.delete_medication(v_med);
  perform pg_temp.act_as_postgres();

  if exists (select 1 from public.medications where id = v_med)
     or exists (select 1 from public.dosage_periods where medication_id = v_med) then
    raise exception 'UNDO 5 FAILED: deleting the medication left rows behind: %', pg_temp.periods_state(v_med);
  end if;

  raise notice 'UNDO 5 OK: deleting a medication inside its window removes all three periods, the cascade reopens nothing';
end;
$$;

-- Completion marker for scripts/db-checks.mjs: printed only after every check above has passed.
do $$
begin
  if current_user <> 'postgres' then
    raise exception 'FINAL CHECK FAILED: file ends as % instead of postgres, a role was not reset', current_user;
  end if;
  raise notice 'GATE_COMPLETE dosage_undo_checks';
end;
$$;

rollback;
