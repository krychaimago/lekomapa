-- Journal correction checks (S-07 phase 1): correcting an entry, changing its note and deleting an entry added by
-- mistake through correct_symptom_entry, set_symptom_entry_note and delete_symptom_entry.
--   CORRECTION 1: window open (23 h 59 min) — one call moves the date, swaps a symptom, changes a severity (the kept
--                 symptom keeps its row), adds and removes a symptom and trims the note; the corrected entry passes the
--                 "at least one symptom" check; deleting an entry removes it with its symptoms.
--   CORRECTION 2: window closed (24 h) — correcting and deleting are SE007 (also with an empty list of symptoms: the
--                 window is checked first), the entry and its symptoms stay as saved; the note can still be changed and
--                 cleared.
--   CORRECTION 3: no date given (p_occurred_local null) keeps occurred_at as saved.
--   CORRECTION 4: an entry dated 13 days 23 h back gets a symptom corrected inside its window (the date is unchanged).
--   CORRECTION 5: content codes of the correction — SE001 (empty and missing list), SE004 (also with the id of a
--                 symptom already on the entry once in lower and once in upper case), SE005, SE002, SE003; a
--                 refused correction leaves the entry as saved.
--   CORRECTION 6: account B on an entry of account A — all three functions are SE006, the entry of A stays as saved.
--   CORRECTION 7: no session — all three functions are 28000.
-- Privileges (anon without EXECUTE, authenticated with) are checked in medication_interaction_checks.sql,
-- INTERACTION 11, the one register of the functions the application calls; not repeated here.
--
-- How to run: `npm run db:check` (needs `npx supabase start`), or this file alone:
-- `node scripts/db-checks.mjs supabase/tests/journal_correction_checks.sql`. The runner (scripts/db-checks.mjs) passes
-- it only when it prints `GATE_COMPLETE journal_correction_checks` at the end.
--
-- Rules every block follows (same as symptom_journal_checks.sql, whose helpers are copied below: pg_temp functions
-- live only in the session that defines them):
--   - Rows get an old created_at only through pg_temp.backdate: as postgres it disables ONLY the freeze trigger of
--     symptom_entries for one update and re-enables it, asserting that it is enabled again. Every history guard stays
--     active. `session_replication_role = replica` is never used: it would switch off every guard.
--   - now() is constant inside the transaction, so 23 h 59 min means one minute of window left and 24 h means the
--     window ended exactly now.
--   - Calls that may be refused go through pg_temp.try_code, which catches only the one named SQLSTATE asked for. Any
--     other error stops the file; `when others` is never used.
--   - Every SE001 case is preceded by `set constraints ... immediate` on the "at least one symptom" checks: the pending
--     deferred checks of earlier saves run there and then, so a deferred SE001 cannot hide behind the rollback at the
--     end of this file, and the SE001 measured is the one raised by the call itself.
--   - The role is switched at the top level of a block, never inside an exception subblock.
--
-- Everything runs in one transaction ended with rollback: nothing is left behind.

\set ON_ERROR_STOP on

begin;

-- ---------------------------------------------------------------------------
-- Test accounts and helpers. UUID pool 00000000-0000-4000-9800-*.
--   account A: 0a00, account B: 0b00
-- ---------------------------------------------------------------------------

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-9800-000000000a00',
   'authenticated', 'authenticated', 'correction-a@example.test', 'x', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-9800-000000000b00',
   'authenticated', 'authenticated', 'correction-b@example.test', 'x', now(), now());

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

-- p_items for the save and correction calls: one element per key, with the severity given at the same position
-- (null = none).
create function pg_temp.items(p_keys text[], p_severities text[])
returns jsonb
language sql
stable
as $$
  select coalesce(jsonb_agg(jsonb_build_object('symptom_id', pg_temp.symptom(k.key), 'severity', p_severities[k.n]) order by k.n), '[]'::jsonb)
    from unnest(p_keys) with ordinality as k(key, n);
$$;

-- Runs the pending deferred "at least one symptom" checks now, then defers them again. Raises SE001 if an entry saved
-- so far has no symptom.
create function pg_temp.run_pending_item_checks()
returns void
language plpgsql
as $$
begin
  set constraints public.symptom_entries_require_item, public.symptom_entry_items_require_item immediate;
  set constraints public.symptom_entries_require_item, public.symptom_entry_items_require_item deferred;
end;
$$;

-- Disables one trigger of symptom_entries for the duration of p_sql, then re-enables it and asserts that it is
-- enabled again. Runs as postgres.
create function pg_temp.with_trigger_disabled(p_trigger name, p_sql text)
returns void
language plpgsql
as $$
begin
  if current_user <> 'postgres' then
    raise exception 'with_trigger_disabled must run as postgres (current_user %)', current_user;
  end if;
  -- ALTER TABLE refuses a table with pending trigger events: run the deferred checks first.
  perform pg_temp.run_pending_item_checks();
  execute format('alter table public.symptom_entries disable trigger %I', p_trigger);
  execute p_sql;
  perform pg_temp.run_pending_item_checks();
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

-- Runs one statement and returns 'ok' or '<code>: <message>' when it fails with exactly p_code. Only the codes the
-- journal raises are caught, each by name (SE006 and SE007 added to the list of symptom_journal_checks.sql); any
-- other error, or a named one other than p_code, stops the file.
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
         or sqlstate 'SE005' or sqlstate 'SE006' or sqlstate 'SE007' then
      get stacked diagnostics v_state = returned_sqlstate, v_message = message_text;
      if v_state is distinct from p_code then
        raise;
      end if;
      return v_state || ': ' || v_message;
  end;
end;
$$;

-- A refusal with a named code: exactly p_code, never "ok".
create function pg_temp.assert_code(p_check text, p_case text, p_got text, p_code text)
returns void
language plpgsql
as $$
begin
  if p_got is null or p_got not like p_code || ': %' then
    raise exception 'CORRECTION % FAILED: % gave "%", expected error %', p_check, p_case, p_got, p_code;
  end if;
end;
$$;

-- Everything the correction may change about one entry, read past RLS: the entry row and its symptom rows with
-- their ids, so "unchanged" also means no row was replaced by an equal one.
create function pg_temp.entry_state(p_id uuid)
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'entry', (select jsonb_build_object('user_id', e.user_id, 'occurred_at', e.occurred_at, 'note', e.note,
                                        'created_at', e.created_at)
                from public.symptom_entries e where e.id = p_id),
    'items', (select coalesce(jsonb_agg(jsonb_build_object('id', i.id, 'symptom_id', i.symptom_id,
                                                            'severity', i.severity) order by i.id), '[]'::jsonb)
                from public.symptom_entry_items i where i.entry_id = p_id));
$$;

-- ---------------------------------------------------------------------------
-- CORRECTION 1: window open (23 h 59 min) — a full correction, then a delete
-- ---------------------------------------------------------------------------

do $$
declare
  v_a constant uuid := '00000000-0000-4000-9800-000000000a00';
  v_entry uuid;
  v_returned uuid;
  v_nausea_item uuid;
  v_doomed uuid;
  v_deleted uuid;
  v_row public.symptom_entries;
begin
  perform pg_temp.act_as(v_a);
  v_entry := public.add_symptom_entry(
    ((now() - interval '1 hour') at time zone 'Europe/Warsaw'),
    pg_temp.items(array['nausea', 'headache'], array['mild', null]),
    'pierwsza notatka');
  v_doomed := public.add_symptom_entry(null, pg_temp.items(array['fatigue', 'insomnia'], array['moderate', null]), null);
  perform pg_temp.act_as_postgres();

  select id into v_nausea_item from public.symptom_entry_items
   where entry_id = v_entry and symptom_id = pg_temp.symptom('nausea');

  perform pg_temp.backdate(v_entry, interval '23 hours 59 minutes');
  perform pg_temp.backdate(v_doomed, interval '23 hours 59 minutes');

  -- headache swapped for dizziness (removed and added), nausea kept with a new severity, a new time, a new note.
  perform pg_temp.act_as(v_a);
  v_returned := public.correct_symptom_entry(
    v_entry,
    ((now() - interval '3 hours') at time zone 'Europe/Warsaw'),
    pg_temp.items(array['nausea', 'dizziness'], array['severe', 'moderate']),
    '  po kolacji  ');
  perform pg_temp.act_as_postgres();

  if v_returned is distinct from v_entry then
    raise exception 'CORRECTION 1 FAILED: correct_symptom_entry returned %, expected the entry id %', v_returned, v_entry;
  end if;

  select * into v_row from public.symptom_entries where id = v_entry;
  if v_row.occurred_at is distinct from now() - interval '3 hours'
     or v_row.note is distinct from 'po kolacji'
     or v_row.created_at is distinct from now() - interval '23 hours 59 minutes' then
    raise exception 'CORRECTION 1 FAILED: the corrected entry is (occurred_at %, note "%", created_at %), expected (now() - 3 h, "po kolacji", unchanged now() - 23 h 59 min)',
      v_row.occurred_at, v_row.note, v_row.created_at;
  end if;

  if (select count(*) from public.symptom_entry_items where entry_id = v_entry) <> 2
     or not exists (select 1 from public.symptom_entry_items
                     where id = v_nausea_item and symptom_id = pg_temp.symptom('nausea') and severity = 'severe')
     or not exists (select 1 from public.symptom_entry_items
                     where entry_id = v_entry and symptom_id = pg_temp.symptom('dizziness') and severity = 'moderate')
     or exists (select 1 from public.symptom_entry_items
                 where entry_id = v_entry and symptom_id = pg_temp.symptom('headache')) then
    raise exception 'CORRECTION 1 FAILED: the corrected entry does not hold exactly nausea (severe, same row) and dizziness (moderate) without headache';
  end if;

  -- The corrected entry passes the deferred "at least one symptom" check (raises SE001 otherwise).
  perform pg_temp.run_pending_item_checks();

  -- Deleting an entry added by mistake, one minute before its window closes.
  perform pg_temp.act_as(v_a);
  v_deleted := public.delete_symptom_entry(v_doomed);
  perform pg_temp.act_as_postgres();

  if v_deleted is distinct from v_doomed then
    raise exception 'CORRECTION 1 FAILED: delete_symptom_entry returned %, expected the entry id %', v_deleted, v_doomed;
  end if;
  if exists (select 1 from public.symptom_entries where id = v_doomed)
     or exists (select 1 from public.symptom_entry_items where entry_id = v_doomed) then
    raise exception 'CORRECTION 1 FAILED: the deleted entry or its symptoms are still there';
  end if;
  perform pg_temp.run_pending_item_checks();

  raise notice 'CORRECTION 1 OK: at 23 h 59 min one call moves the date, swaps headache for dizziness, changes the severity of nausea on its own row and trims the note; deleting an entry removes it with its symptoms';
end;
$$;

-- ---------------------------------------------------------------------------
-- CORRECTION 2: window closed (24 h) — SE007 for correcting and deleting; the note stays editable
-- ---------------------------------------------------------------------------

do $$
declare
  v_a constant uuid := '00000000-0000-4000-9800-000000000a00';
  v_entry uuid;
  v_before jsonb;
  v_after jsonb;
  v_correct text;
  v_correct_empty text;
  v_correct_note_only text;
  v_delete text;
  v_note_changed uuid;
  v_note_cleared uuid;
begin
  perform pg_temp.act_as(v_a);
  v_entry := public.add_symptom_entry(null, pg_temp.items(array['nausea'], array['mild']), 'pierwsza notatka');
  perform pg_temp.act_as_postgres();
  perform pg_temp.backdate(v_entry, interval '24 hours');
  v_before := pg_temp.entry_state(v_entry);

  perform pg_temp.run_pending_item_checks();
  perform pg_temp.act_as(v_a);
  v_correct := pg_temp.try_code(format('select public.correct_symptom_entry(%L, null, %L::jsonb, null)',
    v_entry, pg_temp.items(array['vomiting'], array['severe'])), 'SE007');
  -- The window is checked before the content: an empty list is SE007, not SE001.
  v_correct_empty := pg_temp.try_code(format('select public.correct_symptom_entry(%L, null, %L::jsonb, null)',
    v_entry, '[]'), 'SE007');
  -- The whole correction is refused, also when only the note differs (decision P3: no partial save).
  v_correct_note_only := pg_temp.try_code(format('select public.correct_symptom_entry(%L, null, %L::jsonb, %L)',
    v_entry, pg_temp.items(array['nausea'], array['mild']), 'inna notatka'), 'SE007');
  v_delete := pg_temp.try_code(format('select public.delete_symptom_entry(%L)', v_entry), 'SE007');
  perform pg_temp.act_as_postgres();

  perform pg_temp.assert_code('2', 'correcting at 24 h', v_correct, 'SE007');
  perform pg_temp.assert_code('2', 'correcting with no symptoms at 24 h', v_correct_empty, 'SE007');
  perform pg_temp.assert_code('2', 'correcting only the note through the correction call at 24 h', v_correct_note_only, 'SE007');
  perform pg_temp.assert_code('2', 'deleting at 24 h', v_delete, 'SE007');

  v_after := pg_temp.entry_state(v_entry);
  if v_after is distinct from v_before then
    raise exception 'CORRECTION 2 FAILED: a refused correction or delete changed the entry: before %, after %', v_before, v_after;
  end if;

  -- The note: changed, then cleared with a blank text, at 24 h.
  perform pg_temp.act_as(v_a);
  v_note_changed := public.set_symptom_entry_note(v_entry, '  poprawiona notatka  ');
  perform pg_temp.act_as_postgres();
  if v_note_changed is distinct from v_entry
     or (select note from public.symptom_entries where id = v_entry) is distinct from 'poprawiona notatka' then
    raise exception 'CORRECTION 2 FAILED: changing the note at 24 h returned % and stored "%", expected the entry id and "poprawiona notatka"',
      v_note_changed, (select note from public.symptom_entries where id = v_entry);
  end if;

  perform pg_temp.act_as(v_a);
  v_note_cleared := public.set_symptom_entry_note(v_entry, '   ');
  perform pg_temp.act_as_postgres();
  if v_note_cleared is distinct from v_entry
     or (select note from public.symptom_entries where id = v_entry) is not null then
    raise exception 'CORRECTION 2 FAILED: clearing the note at 24 h with a blank text left "%"',
      (select note from public.symptom_entries where id = v_entry);
  end if;

  -- Only the note moved: the core and the symptom rows are as saved.
  v_after := pg_temp.entry_state(v_entry);
  if v_after #- '{entry,note}' is distinct from v_before #- '{entry,note}' then
    raise exception 'CORRECTION 2 FAILED: changing the note changed the core of the entry: before %, after %', v_before, v_after;
  end if;

  raise notice 'CORRECTION 2 OK: at 24 h correcting (also with no symptoms or only a new note) and deleting are SE007 and change nothing; the note can be changed and cleared';
end;
$$;

-- ---------------------------------------------------------------------------
-- CORRECTION 3: no date given keeps occurred_at as saved
-- ---------------------------------------------------------------------------

do $$
declare
  v_a constant uuid := '00000000-0000-4000-9800-000000000a00';
  v_entry uuid;
  v_occurred timestamptz;
begin
  perform pg_temp.act_as(v_a);
  v_entry := public.add_symptom_entry(
    ((now() - interval '2 hours') at time zone 'Europe/Warsaw'),
    pg_temp.items(array['headache'], array[null]), null);
  perform pg_temp.act_as_postgres();
  perform pg_temp.backdate(v_entry, interval '1 hour');
  select occurred_at into v_occurred from public.symptom_entries where id = v_entry;

  perform pg_temp.act_as(v_a);
  perform public.correct_symptom_entry(v_entry, null, pg_temp.items(array['headache'], array['moderate']), null);
  perform pg_temp.act_as_postgres();

  if (select occurred_at from public.symptom_entries where id = v_entry) is distinct from v_occurred
     or v_occurred is distinct from now() - interval '2 hours' then
    raise exception 'CORRECTION 3 FAILED: a correction without a date stored occurred_at %, expected it unchanged at %',
      (select occurred_at from public.symptom_entries where id = v_entry), v_occurred;
  end if;
  if (select severity from public.symptom_entry_items where entry_id = v_entry) is distinct from 'moderate' then
    raise exception 'CORRECTION 3 FAILED: the correction without a date did not save the new severity';
  end if;

  raise notice 'CORRECTION 3 OK: a correction without a date keeps occurred_at as saved (not the moment of correcting)';
end;
$$;

-- ---------------------------------------------------------------------------
-- CORRECTION 4: an entry dated 13 days 23 h back, its symptom corrected inside the window
-- ---------------------------------------------------------------------------

do $$
declare
  v_a constant uuid := '00000000-0000-4000-9800-000000000a00';
  v_entry uuid;
  v_got text;
begin
  perform pg_temp.act_as(v_a);
  v_entry := public.add_symptom_entry(
    ((now() - interval '13 days 23 hours') at time zone 'Europe/Warsaw'),
    pg_temp.items(array['rash'], array['mild']), null);
  perform pg_temp.act_as_postgres();
  -- As if saved 2 h ago: the date is now 14 days 1 h back from the moment of correcting, past the 14-day bound if it
  -- were a new dating, while the window of the entry is still open. Each shift disables only its own trigger (the
  -- freeze trigger for created_at, the date-bounds trigger for occurred_at, as JOURNAL 5 in symptom_journal_checks).
  perform pg_temp.backdate(v_entry, interval '2 hours');
  perform pg_temp.with_trigger_disabled('symptom_entries_guard_occurred_at',
    format('update public.symptom_entries set occurred_at = occurred_at - interval ''2 hours'' where id = %L', v_entry));
  if (select occurred_at from public.symptom_entries where id = v_entry) >= now() - interval '14 days' then
    raise exception 'CORRECTION 4 FAILED: the entry is not dated past the 14-day bound, so the check would not measure anything';
  end if;

  perform pg_temp.act_as(v_a);
  v_got := pg_temp.try_code(format('select public.correct_symptom_entry(%L, null, %L::jsonb, null)',
    v_entry, pg_temp.items(array['itching'], array['moderate'])), 'SE003');
  perform pg_temp.act_as_postgres();

  if v_got is distinct from 'ok' then
    raise exception 'CORRECTION 4 FAILED: correcting the symptom of an entry dated over 14 days back, date unchanged, gave "%", expected it to pass', v_got;
  end if;
  if (select count(*) from public.symptom_entry_items where entry_id = v_entry) <> 1
     or not exists (select 1 from public.symptom_entry_items
                     where entry_id = v_entry and symptom_id = pg_temp.symptom('itching') and severity = 'moderate') then
    raise exception 'CORRECTION 4 FAILED: the entry does not hold exactly itching (moderate) after the correction';
  end if;

  raise notice 'CORRECTION 4 OK: an entry dated near the 14-day bound gets its symptom corrected inside the window when its date is unchanged';
end;
$$;

-- ---------------------------------------------------------------------------
-- CORRECTION 5: content codes of the correction; a refused correction leaves the entry as saved
-- ---------------------------------------------------------------------------

do $$
declare
  v_a constant uuid := '00000000-0000-4000-9800-000000000a00';
  v_entry uuid;
  v_before jsonb;
  c_call constant text := 'select public.correct_symptom_entry(%L, %s, %L::jsonb, null)';
  v_empty text;
  v_null_items text;
  v_duplicate text;
  v_duplicate_case text;
  v_unknown text;
  v_future text;
  v_too_old text;
begin
  perform pg_temp.act_as(v_a);
  v_entry := public.add_symptom_entry(null, pg_temp.items(array['nausea'], array['mild']), 'notatka');
  perform pg_temp.act_as_postgres();
  v_before := pg_temp.entry_state(v_entry);

  -- Pending deferred checks run before the SE001 cases (see the header).
  perform pg_temp.run_pending_item_checks();
  perform pg_temp.act_as(v_a);
  v_empty := pg_temp.try_code(format(c_call, v_entry, 'null', '[]'), 'SE001');
  v_null_items := pg_temp.try_code(format('select public.correct_symptom_entry(%L, null, null, null)', v_entry), 'SE001');
  v_duplicate := pg_temp.try_code(format(c_call, v_entry, 'null',
    pg_temp.items(array['nausea', 'nausea'], array['mild', 'severe'])), 'SE004');
  -- The same uuid in two letter cases is one symptom: the ids are compared as uuid, not as text.
  v_duplicate_case := pg_temp.try_code(format(c_call, v_entry, 'null', jsonb_build_array(
    jsonb_build_object('symptom_id', lower(pg_temp.symptom('nausea')::text), 'severity', 'moderate'),
    jsonb_build_object('symptom_id', upper(pg_temp.symptom('nausea')::text), 'severity', 'severe'))), 'SE004');
  v_unknown := pg_temp.try_code(format(c_call, v_entry, 'null',
    jsonb_build_array(jsonb_build_object('symptom_id', '00000000-0000-4000-9800-0000000000ff', 'severity', null))), 'SE005');
  v_future := pg_temp.try_code(format(c_call, v_entry,
    quote_literal(((now() + interval '1 hour') at time zone 'Europe/Warsaw')::text) || '::timestamp',
    pg_temp.items(array['nausea'], array['mild'])), 'SE002');
  v_too_old := pg_temp.try_code(format(c_call, v_entry,
    quote_literal(((now() - interval '15 days') at time zone 'Europe/Warsaw')::text) || '::timestamp',
    pg_temp.items(array['nausea'], array['mild'])), 'SE003');
  perform pg_temp.act_as_postgres();

  perform pg_temp.assert_code('5', 'correcting with an empty list of symptoms', v_empty, 'SE001');
  perform pg_temp.assert_code('5', 'correcting with no list of symptoms', v_null_items, 'SE001');
  perform pg_temp.assert_code('5', 'correcting to the same symptom twice', v_duplicate, 'SE004');
  perform pg_temp.assert_code('5', 'correcting to the same symptom twice in two letter cases', v_duplicate_case, 'SE004');
  perform pg_temp.assert_code('5', 'correcting to a symptom not on the list', v_unknown, 'SE005');
  perform pg_temp.assert_code('5', 'correcting the time to one hour ahead', v_future, 'SE002');
  perform pg_temp.assert_code('5', 'correcting the time to 15 days back', v_too_old, 'SE003');

  if pg_temp.entry_state(v_entry) is distinct from v_before then
    raise exception 'CORRECTION 5 FAILED: a refused correction changed the entry: before %, after %', v_before, pg_temp.entry_state(v_entry);
  end if;

  raise notice 'CORRECTION 5 OK: SE001 (empty and missing list), SE004, SE005, SE002 and SE003 come back as named errors and leave the entry as saved';
end;
$$;

-- ---------------------------------------------------------------------------
-- CORRECTION 6: account B on an entry of account A — SE006 for all three functions
-- ---------------------------------------------------------------------------

do $$
declare
  v_a constant uuid := '00000000-0000-4000-9800-000000000a00';
  v_b constant uuid := '00000000-0000-4000-9800-000000000b00';
  v_entry uuid;
  v_before jsonb;
  v_correct text;
  v_correct_empty text;
  v_note text;
  v_delete text;
  v_missing text;
begin
  perform pg_temp.act_as(v_a);
  v_entry := public.add_symptom_entry(null, pg_temp.items(array['nausea'], array['mild']), 'notatka A');
  perform pg_temp.act_as_postgres();
  v_before := pg_temp.entry_state(v_entry);

  perform pg_temp.run_pending_item_checks();
  perform pg_temp.act_as(v_b);
  v_correct := pg_temp.try_code(format('select public.correct_symptom_entry(%L, null, %L::jsonb, %L)',
    v_entry, pg_temp.items(array['vomiting'], array['severe']), 'notatka B'), 'SE006');
  -- The owner is checked before the content: an empty list is SE006, not SE001.
  v_correct_empty := pg_temp.try_code(format('select public.correct_symptom_entry(%L, null, %L::jsonb, null)',
    v_entry, '[]'), 'SE006');
  v_note := pg_temp.try_code(format('select public.set_symptom_entry_note(%L, %L)', v_entry, 'notatka B'), 'SE006');
  v_delete := pg_temp.try_code(format('select public.delete_symptom_entry(%L)', v_entry), 'SE006');
  perform pg_temp.act_as_postgres();

  -- An id that belongs to no entry at all, as the owner A.
  perform pg_temp.act_as(v_a);
  v_missing := pg_temp.try_code(format('select public.delete_symptom_entry(%L)', '00000000-0000-4000-9800-0000000000fe'), 'SE006');
  perform pg_temp.act_as_postgres();

  perform pg_temp.assert_code('6', 'account B correcting an entry of A', v_correct, 'SE006');
  perform pg_temp.assert_code('6', 'account B correcting an entry of A with no symptoms', v_correct_empty, 'SE006');
  perform pg_temp.assert_code('6', 'account B changing the note of an entry of A', v_note, 'SE006');
  perform pg_temp.assert_code('6', 'account B deleting an entry of A', v_delete, 'SE006');
  perform pg_temp.assert_code('6', 'deleting an entry that does not exist', v_missing, 'SE006');

  if pg_temp.entry_state(v_entry) is distinct from v_before then
    raise exception 'CORRECTION 6 FAILED: account B changed an entry of A: before %, after %', v_before, pg_temp.entry_state(v_entry);
  end if;

  raise notice 'CORRECTION 6 OK: account B gets SE006 from all three functions on an entry of A (also before the content check), a missing entry is SE006, the entry of A is unchanged';
end;
$$;

-- ---------------------------------------------------------------------------
-- CORRECTION 7: no session — 28000 for all three functions
-- ---------------------------------------------------------------------------

do $$
declare
  v_a constant uuid := '00000000-0000-4000-9800-000000000a00';
  v_entry uuid;
  v_before jsonb;
  v_correct text;
  v_note text;
  v_delete text;
begin
  perform pg_temp.act_as(v_a);
  v_entry := public.add_symptom_entry(null, pg_temp.items(array['nausea'], array['mild']), 'notatka');
  perform pg_temp.act_as_postgres();
  v_before := pg_temp.entry_state(v_entry);

  -- postgres without claims: auth.uid() is empty.
  v_correct := pg_temp.try_code(format('select public.correct_symptom_entry(%L, null, %L::jsonb, null)',
    v_entry, pg_temp.items(array['vomiting'], array[null])), '28000');
  v_note := pg_temp.try_code(format('select public.set_symptom_entry_note(%L, %L)', v_entry, 'inna'), '28000');
  v_delete := pg_temp.try_code(format('select public.delete_symptom_entry(%L)', v_entry), '28000');

  perform pg_temp.assert_code('7', 'correcting without a session', v_correct, '28000');
  perform pg_temp.assert_code('7', 'changing the note without a session', v_note, '28000');
  perform pg_temp.assert_code('7', 'deleting without a session', v_delete, '28000');

  if pg_temp.entry_state(v_entry) is distinct from v_before then
    raise exception 'CORRECTION 7 FAILED: a call without a session changed the entry';
  end if;

  raise notice 'CORRECTION 7 OK: without a session all three functions are 28000 and change nothing';
end;
$$;

-- Completion marker for scripts/db-checks.mjs: printed only after every check above has passed.
do $$
begin
  if current_user <> 'postgres' then
    raise exception 'FINAL CHECK FAILED: file ends as % instead of postgres, a role was not reset', current_user;
  end if;
  perform pg_temp.run_pending_item_checks();
  raise notice 'GATE_COMPLETE journal_correction_checks';
end;
$$;

rollback;
