-- Symptom journal checks (S-05 phase 2): saving an entry, its error codes, its dates and its correction window.
--   JOURNAL 1: a correct save — two symptoms, one with a severity, a trimmed note; a blank note is stored as null;
--              correction_window_ends_at(entry) read by authenticated is created_at + 24 h.
--   JOURNAL 2: every error code of the save call — 28000 without a session, SE001 no symptom, SE004 the same
--              symptom twice (also with its id once in lower and once in upper case), SE005 a symptom not on the list, SE002 in the future, SE003 more than 14 days back;
--              nothing is left behind by a refused save.
--   JOURNAL 3: no time given -> occurred_at is now() of the transaction (the moment of saving).
--   JOURNAL 4: date bounds — now passes, now + 1 min is SE002, now - 14 days + 1 min passes, now - 14 days - 1 min is
--              SE003; the same bounds hold for a direct change of occurred_at.
--   JOURNAL 5: Polish time — 21:14 on 2026-10-20 is stored as 19:14 UTC, 21:14 on 2026-10-30 (after the clock change
--              on 25 October) as 20:14 UTC.
--   JOURNAL 6: correction window guards — at 23 h 59 min after saving the core of the entry and its symptoms can be
--              corrected; at 24 h occurred_at, user_id, adding, changing, moving and removing a symptom, moving a
--              symptom into the entry and deleting the entry are refused with the named guard message.
--   JOURNAL 7: the note stays editable after the window is closed.
--   JOURNAL 8: a symptom used by an entry cannot be deleted from the closed list (foreign_key_violation).
--   JOURNAL 9: at least one symptom at commit — an entry inserted directly without symptoms, an entry whose last
--              symptom is removed and an entry whose last symptom is moved away are refused with SE001; an entry with a
--              symptom and a deleted entry pass.
--
-- How to run: `npm run db:check` (needs `npx supabase start`), or this file alone:
-- `node scripts/db-checks.mjs supabase/tests/symptom_journal_checks.sql`. The runner (scripts/db-checks.mjs) passes
-- it only when it prints `GATE_COMPLETE symptom_journal_checks` at the end.
--
-- Rules every block follows:
--   - Rows get an old created_at only through pg_temp.backdate: as postgres it disables ONLY the freeze trigger of
--     symptom_entries for one update and re-enables it, asserting that it is enabled again. Every history guard stays
--     active. `session_replication_role = replica` is never used: it would switch off every guard.
--   - Disabling a trigger needs an empty queue of deferred trigger events, so pg_temp.with_trigger_disabled first
--     runs the pending "at least one symptom" checks (`set constraints ... immediate`, then back to deferred).
--   - JOURNAL 5 saves fixed dates in October 2026 that the date bounds would refuse on any other day. It disables
--     ONLY the date-bounds trigger (symptom_entries_guard_occurred_at) for those two calls, the same way, so the
--     conversion measured is the one inside add_symptom_entry. JOURNAL 4 measures the bounds with the trigger on.
--   - now() is constant inside the transaction, so 23 h 59 min means one minute of window left and 24 h means the
--     window ended exactly now.
--   - Writes that may be refused go through pg_temp.try_exec (catches only P0001, the guards' raise exception) or
--     pg_temp.try_code (catches only the one named SQLSTATE asked for). Any other error stops the file.
--   - The deferred "at least one symptom" check runs at commit, and this file ends with rollback. JOURNAL 9 makes it
--     run inside the transaction with `set constraints <name> immediate` in a subblock, which fires the pending check
--     at that moment; the subblock is undone, so nothing it wrote stays. Measured outside this file: a real COMMIT of
--     an entry without symptoms fails with SQLSTATE SE001 and the same message.
--   - The role is switched at the top level of a block, never inside an exception subblock.
--
-- Everything runs in one transaction ended with rollback: nothing is left behind.

\set ON_ERROR_STOP on

begin;

-- ---------------------------------------------------------------------------
-- Test accounts and helpers. UUID pool 00000000-0000-4000-9400-*.
--   account A: 0a00, account B: 0b00
-- ---------------------------------------------------------------------------

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-9400-000000000a00',
   'authenticated', 'authenticated', 'journal-a@example.test', 'x', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-9400-000000000b00',
   'authenticated', 'authenticated', 'journal-b@example.test', 'x', now(), now());

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

-- Id of a symptom on the closed list, by its stable key. Fails loudly when the seed lacks it.
create function pg_temp.symptom(p_key text)
returns uuid
language plpgsql
stable
as $$
declare
  v_id uuid;
begin
  select id into v_id from public.symptoms where key = p_key;
  if v_id is null then
    raise exception 'seed symptom % is missing, so the check would not measure anything', p_key;
  end if;
  return v_id;
end;
$$;

-- p_items for add_symptom_entry: one element per key, with the severity given at the same position (null = none).
create function pg_temp.items(p_keys text[], p_severities text[])
returns jsonb
language sql
stable
as $$
  select coalesce(jsonb_agg(jsonb_build_object('symptom_id', pg_temp.symptom(k.key), 'severity', p_severities[k.n]) order by k.n), '[]'::jsonb)
    from unnest(p_keys) with ordinality as k(key, n);
$$;

-- Disables one trigger of symptom_entries for the duration of p_sql, then re-enables it and asserts that it is
-- enabled again. Runs as postgres; p_sql switches roles itself when needed and must end as postgres.
create function pg_temp.with_trigger_disabled(p_trigger name, p_sql text)
returns void
language plpgsql
as $$
begin
  if current_user <> 'postgres' then
    raise exception 'with_trigger_disabled must run as postgres (current_user %)', current_user;
  end if;
  -- ALTER TABLE refuses a table with pending trigger events ("cannot ALTER TABLE ... because it has pending trigger
  -- events", measured): the deferred "at least one symptom" checks of the entries saved so far. Running them now
  -- clears the queue; every entry saved before this point has a symptom, so they pass.
  set constraints public.symptom_entries_require_item, public.symptom_entry_items_require_item immediate;
  set constraints public.symptom_entries_require_item, public.symptom_entry_items_require_item deferred;
  execute format('alter table public.symptom_entries disable trigger %I', p_trigger);
  execute p_sql;
  -- p_sql may have saved entries: their checks are pending again.
  set constraints public.symptom_entries_require_item, public.symptom_entry_items_require_item immediate;
  set constraints public.symptom_entries_require_item, public.symptom_entry_items_require_item deferred;
  execute format('alter table public.symptom_entries enable trigger %I', p_trigger);
  if (select tg.tgenabled from pg_trigger tg
       where tg.tgrelid = 'public.symptom_entries'::regclass and tg.tgname = p_trigger) is distinct from 'O' then
    raise exception 'trigger % was not re-enabled', p_trigger;
  end if;
end;
$$;

-- Moves created_at of one entry back by p_age. Only the freeze trigger is disabled, for this one update.
create function pg_temp.backdate(p_id uuid, p_age interval)
returns void
language plpgsql
as $$
declare
  v_created_at timestamptz;
begin
  perform pg_temp.with_trigger_disabled('symptom_entries_freeze_created_at',
    format('update public.symptom_entries set created_at = now() - %L::interval where id = %L', p_age, p_id));
  select created_at into v_created_at from public.symptom_entries where id = p_id;
  if v_created_at is distinct from now() - p_age then
    raise exception 'backdate of entry % stored %, expected now() - %', p_id, v_created_at, p_age;
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

-- Runs one statement and returns 'ok' or '<code>: <message>' when it fails with exactly p_code. Only the codes the
-- journal raises are caught, each by name; any other error, or a named one other than p_code, stops the file.
create function pg_temp.try_code(p_sql text, p_code text)
returns text
language plpgsql
as $$
declare
  v_state text;
  v_message text;
begin
  begin
    execute p_sql;
    return 'ok';
  exception
    when sqlstate '28000' or sqlstate 'SE001' or sqlstate 'SE002' or sqlstate 'SE003' or sqlstate 'SE004'
         or sqlstate 'SE005' then
      get stacked diagnostics v_state = returned_sqlstate, v_message = message_text;
      if v_state is distinct from p_code then
        raise;
      end if;
      return v_state || ': ' || v_message;
  end;
end;
$$;

create function pg_temp.assert_ok(p_check text, p_case text, p_got text)
returns void
language plpgsql
as $$
begin
  if p_got is distinct from 'ok 1' then
    raise exception 'JOURNAL % FAILED: % gave "%", expected it to pass on exactly one row', p_check, p_case, p_got;
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
    raise exception 'JOURNAL % FAILED: % gave "%", expected a refusal by the correction window guard', p_check, p_case, p_got;
  end if;
  if p_got not like '%okno korekty%jest już zamknięte%' or p_got not like '%' || p_subject || '%' then
    raise exception 'JOURNAL % FAILED: % was blocked by an unexpected P0001 error, expected the correction window guard naming "%" (got %)',
      p_check, p_case, p_subject, p_got;
  end if;
end;
$$;

-- A refusal with a named code: exactly p_code, never "ok".
create function pg_temp.assert_code(p_check text, p_case text, p_got text, p_code text)
returns void
language plpgsql
as $$
begin
  if p_got is null or p_got not like p_code || ': %' then
    raise exception 'JOURNAL % FAILED: % gave "%", expected error %', p_check, p_case, p_got, p_code;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- JOURNAL 1: a correct save with two symptoms, a severity and a note
-- ---------------------------------------------------------------------------

do $$
declare
  v_a constant uuid := '00000000-0000-4000-9400-000000000a00';
  v_entry uuid;
  v_blank uuid;
  v_ends_at timestamptz;
  v_entry_row public.symptom_entries;
begin
  perform pg_temp.act_as(v_a);
  v_entry := public.add_symptom_entry(
    ((now() - interval '2 hours') at time zone 'Europe/Warsaw'),
    pg_temp.items(array['nausea', 'headache'], array['moderate', null]),
    '  po obiedzie  ');
  v_blank := public.add_symptom_entry(null, pg_temp.items(array['dizziness'], array['severe']), '   ');
  select public.correction_window_ends_at(e) into v_ends_at from public.symptom_entries e where e.id = v_entry;
  perform pg_temp.act_as_postgres();

  select * into v_entry_row from public.symptom_entries where id = v_entry;
  if v_entry_row.user_id is distinct from v_a
     or v_entry_row.occurred_at is distinct from now() - interval '2 hours'
     or v_entry_row.note is distinct from 'po obiedzie'
     or v_entry_row.created_at is distinct from now() then
    raise exception 'JOURNAL 1 FAILED: the saved entry is (user %, occurred_at %, note "%", created_at %), expected (A, now() - 2 h, "po obiedzie", now())',
      v_entry_row.user_id, v_entry_row.occurred_at, v_entry_row.note, v_entry_row.created_at;
  end if;

  if (select count(*) from public.symptom_entry_items where entry_id = v_entry) <> 2
     or not exists (select 1 from public.symptom_entry_items
                     where entry_id = v_entry and symptom_id = pg_temp.symptom('nausea') and severity = 'moderate')
     or not exists (select 1 from public.symptom_entry_items
                     where entry_id = v_entry and symptom_id = pg_temp.symptom('headache') and severity is null) then
    raise exception 'JOURNAL 1 FAILED: the entry does not hold exactly nausea (moderate) and headache (no severity)';
  end if;

  if (select note from public.symptom_entries where id = v_blank) is not null then
    raise exception 'JOURNAL 1 FAILED: a blank note was stored instead of null';
  end if;

  if v_ends_at is distinct from now() + interval '24 hours' then
    raise exception 'JOURNAL 1 FAILED: correction_window_ends_at(entry) is %, expected created_at + 24 h = %', v_ends_at, now() + interval '24 hours';
  end if;

  raise notice 'JOURNAL 1 OK: one call saves the entry with two symptoms and their severities, trims the note, stores a blank note as null; the window ends 24 h after saving';
end;
$$;

-- ---------------------------------------------------------------------------
-- JOURNAL 2: error codes of the save call; a refused save leaves nothing behind
-- ---------------------------------------------------------------------------

do $$
declare
  v_a constant uuid := '00000000-0000-4000-9400-000000000a00';
  v_entries_before integer;
  v_items_before integer;
  c_call constant text := 'select public.add_symptom_entry(%s, %L::jsonb, null)';
  v_no_session text;
  v_empty text;
  v_null_items text;
  v_duplicate text;
  v_duplicate_case text;
  v_unknown text;
  v_future text;
  v_too_old text;
begin
  select count(*) into v_entries_before from public.symptom_entries;
  select count(*) into v_items_before from public.symptom_entry_items;

  -- postgres without claims: auth.uid() is empty.
  v_no_session := pg_temp.try_code(format(c_call, 'null', pg_temp.items(array['nausea'], array[null])), '28000');

  perform pg_temp.act_as(v_a);
  v_empty := pg_temp.try_code(format(c_call, 'null', '[]'), 'SE001');
  v_null_items := pg_temp.try_code('select public.add_symptom_entry(null, null, null)', 'SE001');
  v_duplicate := pg_temp.try_code(format(c_call, 'null', pg_temp.items(array['nausea', 'nausea'], array['mild', 'severe'])), 'SE004');
  -- The same uuid in two letter cases is one symptom: the ids are compared as uuid, not as text.
  v_duplicate_case := pg_temp.try_code(format(c_call, 'null', jsonb_build_array(
    jsonb_build_object('symptom_id', lower(pg_temp.symptom('nausea')::text), 'severity', 'mild'),
    jsonb_build_object('symptom_id', upper(pg_temp.symptom('nausea')::text), 'severity', 'severe'))), 'SE004');
  v_unknown := pg_temp.try_code(format(c_call, 'null',
    jsonb_build_array(jsonb_build_object('symptom_id', '00000000-0000-4000-9400-0000000000ff', 'severity', null))), 'SE005');
  v_future := pg_temp.try_code(format(c_call, quote_literal(((now() + interval '1 hour') at time zone 'Europe/Warsaw')::text) || '::timestamp',
    pg_temp.items(array['nausea'], array[null])), 'SE002');
  v_too_old := pg_temp.try_code(format(c_call, quote_literal(((now() - interval '15 days') at time zone 'Europe/Warsaw')::text) || '::timestamp',
    pg_temp.items(array['nausea'], array[null])), 'SE003');
  perform pg_temp.act_as_postgres();

  perform pg_temp.assert_code('2', 'saving without a session', v_no_session, '28000');
  perform pg_temp.assert_code('2', 'saving with an empty list of symptoms', v_empty, 'SE001');
  perform pg_temp.assert_code('2', 'saving with no list of symptoms', v_null_items, 'SE001');
  perform pg_temp.assert_code('2', 'saving the same symptom twice', v_duplicate, 'SE004');
  perform pg_temp.assert_code('2', 'saving the same symptom twice in two letter cases', v_duplicate_case, 'SE004');
  perform pg_temp.assert_code('2', 'saving a symptom not on the list', v_unknown, 'SE005');
  perform pg_temp.assert_code('2', 'saving a time one hour ahead', v_future, 'SE002');
  perform pg_temp.assert_code('2', 'saving a time 15 days back', v_too_old, 'SE003');

  if (select count(*) from public.symptom_entries) <> v_entries_before
     or (select count(*) from public.symptom_entry_items) <> v_items_before then
    raise exception 'JOURNAL 2 FAILED: a refused save left rows behind';
  end if;

  raise notice 'JOURNAL 2 OK: 28000, SE001 (empty and missing list), SE004, SE005, SE002 and SE003 come back as named errors and leave nothing behind';
end;
$$;

-- ---------------------------------------------------------------------------
-- JOURNAL 3: no time given -> the moment of saving
-- ---------------------------------------------------------------------------

do $$
declare
  v_a constant uuid := '00000000-0000-4000-9400-000000000a00';
  v_entry uuid;
begin
  perform pg_temp.act_as(v_a);
  v_entry := public.add_symptom_entry(null, pg_temp.items(array['insomnia'], array[null]), null);
  perform pg_temp.act_as_postgres();

  if (select occurred_at from public.symptom_entries where id = v_entry) is distinct from now() then
    raise exception 'JOURNAL 3 FAILED: an entry saved without a time has occurred_at %, expected now() of the transaction %',
      (select occurred_at from public.symptom_entries where id = v_entry), now();
  end if;

  raise notice 'JOURNAL 3 OK: an entry saved without a time is dated at the moment of saving';
end;
$$;

-- ---------------------------------------------------------------------------
-- JOURNAL 4: date bounds, counted from now() at the moment of saving
-- ---------------------------------------------------------------------------

do $$
declare
  v_a constant uuid := '00000000-0000-4000-9400-000000000a00';
  c_call constant text := 'select public.add_symptom_entry(%L::timestamp, %L::jsonb, null)';
  v_now text;
  v_plus_minute text;
  v_oldest text;
  v_too_old text;
  v_update_future text;
  v_update_old text;
  v_entry uuid;
begin
  perform pg_temp.act_as(v_a);
  v_now := pg_temp.try_code(format(c_call, now() at time zone 'Europe/Warsaw',
    pg_temp.items(array['nausea'], array[null])), 'SE002');
  v_plus_minute := pg_temp.try_code(format(c_call, (now() + interval '1 minute') at time zone 'Europe/Warsaw',
    pg_temp.items(array['nausea'], array[null])), 'SE002');
  v_oldest := pg_temp.try_code(format(c_call, (now() - interval '14 days' + interval '1 minute') at time zone 'Europe/Warsaw',
    pg_temp.items(array['nausea'], array[null])), 'SE003');
  v_too_old := pg_temp.try_code(format(c_call, (now() - interval '14 days' - interval '1 minute') at time zone 'Europe/Warsaw',
    pg_temp.items(array['nausea'], array[null])), 'SE003');

  -- The same rule on a direct change of occurred_at (whole write path), on an entry with its window open.
  v_entry := public.add_symptom_entry(null, pg_temp.items(array['drowsiness'], array[null]), null);
  v_update_future := pg_temp.try_code(format(
    'update public.symptom_entries set occurred_at = now() + interval ''1 minute'' where id = %L', v_entry), 'SE002');
  v_update_old := pg_temp.try_code(format(
    'update public.symptom_entries set occurred_at = now() - interval ''14 days'' - interval ''1 minute'' where id = %L', v_entry), 'SE003');
  perform pg_temp.act_as_postgres();

  if v_now is distinct from 'ok' then
    raise exception 'JOURNAL 4 FAILED: saving at exactly now gave "%", expected it to pass', v_now;
  end if;
  perform pg_temp.assert_code('4', 'saving at now + 1 min', v_plus_minute, 'SE002');
  if v_oldest is distinct from 'ok' then
    raise exception 'JOURNAL 4 FAILED: saving at now - 14 days + 1 min gave "%", expected it to pass', v_oldest;
  end if;
  perform pg_temp.assert_code('4', 'saving at now - 14 days - 1 min', v_too_old, 'SE003');
  perform pg_temp.assert_code('4', 'moving occurred_at of an entry to now + 1 min', v_update_future, 'SE002');
  perform pg_temp.assert_code('4', 'moving occurred_at of an entry to now - 14 days - 1 min', v_update_old, 'SE003');

  if (select occurred_at from public.symptom_entries where id = v_entry) is distinct from now() then
    raise exception 'JOURNAL 4 FAILED: a refused change of occurred_at was saved anyway';
  end if;

  raise notice 'JOURNAL 4 OK: now and now - 14 days + 1 min pass; now + 1 min is SE002, now - 14 days - 1 min is SE003, for the save call and for a direct change';
end;
$$;

-- ---------------------------------------------------------------------------
-- JOURNAL 5: the time from the form is Polish time, across the clock change of 25 October 2026
-- ---------------------------------------------------------------------------
-- Fixed dates the bounds refuse on other days: only the bounds trigger is off for these two calls (see the header).

create temporary table journal_zone_entries (label text primary key, entry_id uuid);
grant insert on journal_zone_entries to authenticated;

select pg_temp.with_trigger_disabled('symptom_entries_guard_occurred_at', $sql$
  select pg_temp.act_as('00000000-0000-4000-9400-000000000a00');
  insert into journal_zone_entries values
    ('summer', public.add_symptom_entry(timestamp '2026-10-20 21:14', pg_temp.items(array['nausea'], array[null]), null)),
    ('winter', public.add_symptom_entry(timestamp '2026-10-30 21:14', pg_temp.items(array['nausea'], array[null]), null));
  select pg_temp.act_as_postgres();
$sql$);

do $$
declare
  v_summer timestamptz;
  v_winter timestamptz;
begin
  select e.occurred_at into v_summer
    from public.symptom_entries e join journal_zone_entries z on z.entry_id = e.id where z.label = 'summer';
  select e.occurred_at into v_winter
    from public.symptom_entries e join journal_zone_entries z on z.entry_id = e.id where z.label = 'winter';

  if v_summer is distinct from timestamptz '2026-10-20 19:14:00+00' then
    raise exception 'JOURNAL 5 FAILED: 21:14 Polish time on 2026-10-20 was stored as % UTC, expected 19:14 UTC',
      v_summer at time zone 'UTC';
  end if;
  if v_winter is distinct from timestamptz '2026-10-30 20:14:00+00' then
    raise exception 'JOURNAL 5 FAILED: 21:14 Polish time on 2026-10-30 was stored as % UTC, expected 20:14 UTC',
      v_winter at time zone 'UTC';
  end if;

  raise notice 'JOURNAL 5 OK: 21:14 Polish time is stored as 19:14 UTC on 2026-10-20 and as 20:14 UTC on 2026-10-30, after the clock change';
end;
$$;

-- ---------------------------------------------------------------------------
-- JOURNAL 6: correction window guards on the entry and its symptoms — 23 h 59 min passes, 24 h is refused
-- ---------------------------------------------------------------------------

do $$
declare
  v_a constant uuid := '00000000-0000-4000-9400-000000000a00';
  v_b constant uuid := '00000000-0000-4000-9400-000000000b00';
  v_entry uuid;
  v_fresh uuid;
  v_fresh_item uuid;
  v_nausea uuid;
  v_headache uuid;
  v_spare uuid;
  v_occurred timestamptz;
begin
  perform pg_temp.act_as(v_a);
  v_entry := public.add_symptom_entry(null, pg_temp.items(array['nausea', 'headache'], array['mild', null]), null);
  v_fresh := public.add_symptom_entry(null, pg_temp.items(array['fatigue'], array[null]), null);
  perform pg_temp.act_as_postgres();

  select id into v_nausea from public.symptom_entry_items where entry_id = v_entry and symptom_id = pg_temp.symptom('nausea');
  select id into v_headache from public.symptom_entry_items where entry_id = v_entry and symptom_id = pg_temp.symptom('headache');
  select id into v_fresh_item from public.symptom_entry_items where entry_id = v_fresh;

  -- 23 h 59 min: one minute of window left, every core change passes.
  perform pg_temp.backdate(v_entry, interval '23 hours 59 minutes');
  if not public.symptom_entry_correction_window_open(v_entry) then
    raise exception 'JOURNAL 6 FAILED: the entry window is closed 23 h 59 min after saving';
  end if;

  perform pg_temp.act_as(v_a);
  perform pg_temp.assert_ok('6', 'correcting occurred_at at 23 h 59 min',
    pg_temp.try_exec('update public.symptom_entries set occurred_at = now() - interval ''3 hours'' where id = $1', v_entry));
  perform pg_temp.assert_ok('6', 'correcting a severity at 23 h 59 min',
    pg_temp.try_exec('update public.symptom_entry_items set severity = ''moderate'' where id = $1', v_nausea));
  perform pg_temp.assert_ok('6', 'adding a symptom at 23 h 59 min',
    pg_temp.try_exec(format('insert into public.symptom_entry_items (id, entry_id, symptom_id) values ($1, %L, %L)',
      v_entry, pg_temp.symptom('dizziness')), '00000000-0000-4000-9400-000000000601'));
  perform pg_temp.assert_ok('6', 'removing a symptom at 23 h 59 min',
    pg_temp.try_exec('delete from public.symptom_entry_items where id = $1', '00000000-0000-4000-9400-000000000601'));
  perform pg_temp.act_as_postgres();

  -- 24 h: the window ended exactly now.
  perform pg_temp.backdate(v_entry, interval '24 hours');
  if public.symptom_entry_correction_window_open(v_entry) then
    raise exception 'JOURNAL 6 FAILED: the entry window is still open 24 h after saving';
  end if;
  select occurred_at into v_occurred from public.symptom_entries where id = v_entry;

  -- As the owner, through the same path as the API.
  perform pg_temp.act_as(v_a);
  perform pg_temp.assert_blocked('6', 'correcting occurred_at at 24 h',
    pg_temp.try_exec('update public.symptom_entries set occurred_at = now() - interval ''5 hours'' where id = $1', v_entry), 'occurred_at');
  perform pg_temp.assert_blocked('6', 'adding a symptom at 24 h',
    pg_temp.try_exec(format('insert into public.symptom_entry_items (id, entry_id, symptom_id) values ($1, %L, %L)',
      v_entry, pg_temp.symptom('dizziness')), '00000000-0000-4000-9400-000000000602'), 'dodać objawu do wpisu');
  perform pg_temp.assert_blocked('6', 'changing a severity at 24 h',
    pg_temp.try_exec('update public.symptom_entry_items set severity = ''severe'' where id = $1', v_nausea), 'severity');
  perform pg_temp.assert_blocked('6', 'changing a symptom at 24 h',
    pg_temp.try_exec(format('update public.symptom_entry_items set symptom_id = %L where id = $1', pg_temp.symptom('vomiting')), v_nausea), 'symptom_id');
  perform pg_temp.assert_blocked('6', 'moving a symptom out of the closed entry',
    pg_temp.try_exec(format('update public.symptom_entry_items set entry_id = %L where id = $1', v_fresh), v_headache), 'entry_id');
  perform pg_temp.assert_blocked('6', 'moving a symptom into the closed entry',
    pg_temp.try_exec(format('update public.symptom_entry_items set entry_id = %L where id = $1', v_entry), v_fresh_item), 'entry_id');
  perform pg_temp.assert_blocked('6', 'removing a symptom at 24 h',
    pg_temp.try_exec('delete from public.symptom_entry_items where id = $1', v_headache), 'usunąć objawu z wpisu');
  perform pg_temp.assert_blocked('6', 'deleting the entry at 24 h',
    pg_temp.try_exec('delete from public.symptom_entries where id = $1', v_entry), 'usunąć wpisu o samopoczuciu');
  perform pg_temp.act_as_postgres();

  -- user_id: the owner cannot hand the entry over (RLS would refuse it anyway), so this case runs as postgres, past
  -- RLS, and only the guard can refuse it.
  perform pg_temp.assert_blocked('6', 'moving the entry to account B at 24 h',
    pg_temp.try_exec(format('update public.symptom_entries set user_id = %L where id = $1', v_b), v_entry), 'user_id');

  if (select occurred_at from public.symptom_entries where id = v_entry) is distinct from v_occurred
     or (select user_id from public.symptom_entries where id = v_entry) is distinct from v_a
     or (select count(*) from public.symptom_entry_items where entry_id = v_entry) <> 2
     or (select severity from public.symptom_entry_items where id = v_nausea) is distinct from 'moderate'
     or (select symptom_id from public.symptom_entry_items where id = v_nausea) is distinct from pg_temp.symptom('nausea')
     or (select entry_id from public.symptom_entry_items where id = v_fresh_item) is distinct from v_fresh then
    raise exception 'JOURNAL 6 FAILED: a refused change of the closed entry or its symptoms was saved anyway';
  end if;

  -- Counterexample for moving: between two open entries it passes. The source keeps a symptom, so the deferred
  -- "at least one symptom" check stays satisfied for JOURNAL 9, which fires it.
  perform pg_temp.act_as(v_a);
  v_spare := public.add_symptom_entry(null, pg_temp.items(array['rash', 'itching'], array[null, null]), null);
  perform pg_temp.assert_ok('6', 'moving a symptom between two open entries',
    pg_temp.try_exec(format('update public.symptom_entry_items set entry_id = %L where entry_id = %L and symptom_id = %L',
      v_fresh, v_spare, pg_temp.symptom('rash')), null));
  perform pg_temp.act_as_postgres();

  raise notice 'JOURNAL 6 OK: at 23 h 59 min occurred_at, symptoms and severities can be corrected; at 24 h occurred_at, user_id, adding, changing, moving in and out, removing a symptom and deleting the entry are refused by the history guards';
end;
$$;

-- ---------------------------------------------------------------------------
-- JOURNAL 7: the note stays editable after the window is closed
-- ---------------------------------------------------------------------------

do $$
declare
  v_a constant uuid := '00000000-0000-4000-9400-000000000a00';
  v_entry uuid;
begin
  perform pg_temp.act_as(v_a);
  v_entry := public.add_symptom_entry(null, pg_temp.items(array['nausea'], array[null]), 'pierwsza notatka');
  perform pg_temp.act_as_postgres();
  perform pg_temp.backdate(v_entry, interval '3 days');

  perform pg_temp.act_as(v_a);
  perform pg_temp.assert_ok('7', 'editing the note 3 days after saving',
    pg_temp.try_exec('update public.symptom_entries set note = ''poprawiona notatka'' where id = $1', v_entry));
  perform pg_temp.assert_ok('7', 'clearing the note 3 days after saving',
    pg_temp.try_exec('update public.symptom_entries set note = null where id = $1', v_entry));
  -- Control: the window is really closed for the core.
  perform pg_temp.assert_blocked('7', 'correcting occurred_at 3 days after saving',
    pg_temp.try_exec('update public.symptom_entries set occurred_at = now() - interval ''1 hour'' where id = $1', v_entry), 'occurred_at');
  perform pg_temp.act_as_postgres();

  raise notice 'JOURNAL 7 OK: with the window closed the note can be edited and cleared, while occurred_at stays refused';
end;
$$;

-- ---------------------------------------------------------------------------
-- JOURNAL 8: a symptom used by an entry cannot be deleted from the closed list
-- ---------------------------------------------------------------------------

do $$
declare
  v_a constant uuid := '00000000-0000-4000-9400-000000000a00';
  v_message text;
  v_constraint text;
begin
  perform pg_temp.act_as(v_a);
  perform public.add_symptom_entry(null, pg_temp.items(array['tremor'], array[null]), null);
  perform pg_temp.act_as_postgres();

  begin
    delete from public.symptoms where key = 'tremor';
  exception when foreign_key_violation then
    get stacked diagnostics v_message = message_text, v_constraint = constraint_name;
  end;

  if v_message is null then
    raise exception 'JOURNAL 8 FAILED: deleting a symptom used by an entry passed';
  end if;
  if v_constraint is distinct from 'symptom_entry_items_symptom_id_fkey' then
    raise exception 'JOURNAL 8 FAILED: deleting a symptom was refused by % instead of symptom_entry_items_symptom_id_fkey (%)', v_constraint, v_message;
  end if;
  if not exists (select 1 from public.symptoms where key = 'tremor') then
    raise exception 'JOURNAL 8 FAILED: the symptom is gone after the refused delete';
  end if;

  raise notice 'JOURNAL 8 OK: deleting a symptom used by an entry is refused with foreign_key_violation on symptom_entry_items_symptom_id_fkey';
end;
$$;

-- ---------------------------------------------------------------------------
-- JOURNAL 9: at least one symptom per entry at commit (SE001)
-- ---------------------------------------------------------------------------
-- Each case runs in a subblock: it writes, then `set constraints ... immediate` fires the pending checks of both
-- constraint triggers. An error rolls the subblock back with everything it wrote; a pass is undone by raising a
-- marker error, so the next case starts from the same state.

create function pg_temp.check_at_commit(p_sql text)
returns text
language plpgsql
as $$
declare
  v_state text;
  v_message text;
begin
  begin
    execute p_sql;
    set constraints public.symptom_entries_require_item, public.symptom_entry_items_require_item immediate;
    raise exception using errcode = 'JT000', message = 'passed';
  exception
    when sqlstate 'JT000' then
      v_state := 'ok';
    when sqlstate 'SE001' then
      get stacked diagnostics v_message = message_text;
      v_state := 'SE001: ' || v_message;
  end;
  set constraints public.symptom_entries_require_item, public.symptom_entry_items_require_item deferred;
  return v_state;
end;
$$;

do $$
declare
  v_a constant uuid := '00000000-0000-4000-9400-000000000a00';
  v_one uuid;
  v_two uuid;
  v_one_item uuid;
  v_without text;
  v_with text;
  v_last_removed text;
  v_last_moved text;
  v_entry_deleted text;
  v_one_of_two_removed text;
begin
  perform pg_temp.act_as(v_a);
  v_one := public.add_symptom_entry(null, pg_temp.items(array['nausea'], array[null]), null);
  v_two := public.add_symptom_entry(null, pg_temp.items(array['headache', 'dizziness'], array[null, null]), null);
  select id into v_one_item from public.symptom_entry_items where entry_id = v_one;

  v_without := pg_temp.check_at_commit(format(
    'insert into public.symptom_entries (id, user_id, occurred_at) values (%L, %L, now())',
    '00000000-0000-4000-9400-000000000901', v_a));
  v_with := pg_temp.check_at_commit(format(
    'insert into public.symptom_entries (id, user_id, occurred_at) values (%L, %L, now()); '
    'insert into public.symptom_entry_items (entry_id, symptom_id) values (%L, %L)',
    '00000000-0000-4000-9400-000000000902', v_a, '00000000-0000-4000-9400-000000000902', pg_temp.symptom('nausea')));
  v_last_removed := pg_temp.check_at_commit(format('delete from public.symptom_entry_items where id = %L', v_one_item));
  v_last_moved := pg_temp.check_at_commit(format('update public.symptom_entry_items set entry_id = %L where id = %L',
    v_two, v_one_item));
  v_entry_deleted := pg_temp.check_at_commit(format('delete from public.symptom_entries where id = %L', v_one));
  v_one_of_two_removed := pg_temp.check_at_commit(format(
    'delete from public.symptom_entry_items where entry_id = %L and symptom_id = %L', v_two, pg_temp.symptom('headache')));
  perform pg_temp.act_as_postgres();

  perform pg_temp.assert_code('9', 'an entry inserted directly without symptoms', v_without, 'SE001');
  perform pg_temp.assert_code('9', 'removing the last symptom of an entry', v_last_removed, 'SE001');
  perform pg_temp.assert_code('9', 'moving the last symptom of an entry to another entry', v_last_moved, 'SE001');
  if v_with is distinct from 'ok' then
    raise exception 'JOURNAL 9 FAILED: an entry inserted directly with one symptom gave "%", expected it to pass', v_with;
  end if;
  if v_entry_deleted is distinct from 'ok' then
    raise exception 'JOURNAL 9 FAILED: deleting a whole entry gave "%", expected it to pass', v_entry_deleted;
  end if;
  if v_one_of_two_removed is distinct from 'ok' then
    raise exception 'JOURNAL 9 FAILED: removing one of two symptoms gave "%", expected it to pass', v_one_of_two_removed;
  end if;

  -- Every case was undone: the two entries are as saved.
  if (select count(*) from public.symptom_entry_items where entry_id = v_one) <> 1
     or (select count(*) from public.symptom_entry_items where entry_id = v_two) <> 2
     or exists (select 1 from public.symptom_entries where id in ('00000000-0000-4000-9400-000000000901', '00000000-0000-4000-9400-000000000902')) then
    raise exception 'JOURNAL 9 FAILED: a case was not undone, so the cases after it did not start from the saved state';
  end if;

  raise notice 'JOURNAL 9 OK: at commit an entry without symptoms, without its last symptom or with its last symptom moved away is SE001; an entry with a symptom, a deleted entry and an entry keeping one of two symptoms pass';
end;
$$;

-- Completion marker for scripts/db-checks.mjs: printed only after every check above has passed.
do $$
begin
  if current_user <> 'postgres' then
    raise exception 'FINAL CHECK FAILED: file ends as % instead of postgres, a role was not reset', current_user;
  end if;
  raise notice 'GATE_COMPLETE symptom_journal_checks';
end;
$$;

rollback;
