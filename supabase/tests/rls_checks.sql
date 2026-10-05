-- Schema checks: RLS, policies, constraints and triggers.
--   Checks 1–8:  user medications schema (F-01).
--   Checks 9–14: shared registry and interaction pairs (F-02), plus the F-01 changes it makes.
--   Checks 15–18: shared symptom catalog and search terms (F-03).
--   Check 19: dosage change closes a period and opens a new one (the positive half of the history rule).
--   Check 19 runs with the correction window closed, so it stands between check 7 and check 8.
--   Checks 20–24: S-02 changes to the medication schema — guard on medications (20 open window, 21 closed
--   window, so 21 stands after check 19), registry source consistency (22), one row per ATC code (23),
--   blank texts (24).
--   Check 11 runs on the data loaded by the generated migrations, before any test row is added to the shared tables.
--   Check 18 runs on the loaded symptom list, so it stands before check 17 adds its test rows.
--
-- How to run: `npm run db:check` (needs `npx supabase start`). The runner (scripts/db-checks.mjs) pipes this
-- file into psql inside the local database container supabase_db_<project_id>, forces ON_ERROR_STOP, checks
-- that every migration is applied, and passes the file only when it prints `GATE_COMPLETE rls_checks` at the end.
-- The same runner runs in CI in the `smoke` job. `supabase db query -f` cannot run this file: it rejects
-- multiple commands in one statement and the `\set` meta-command.
--
-- Skrypt chodzi jako rola postgres, dla której auth.uid() jest puste, więc same
-- polityki RLS nie są tu przechodzone — RLS sprawdzany jest zapytaniem do katalogu
-- systemowego, a zachowanie danych przez ograniczenia i wyzwalacze.
-- Dowód izolacji dwóch kont robi osobno `npm run smoke`.
--
-- Wszystko dzieje się w jednej transakcji zakończonej rollbackiem: skrypt nie
-- zostawia po sobie ani wierszy testowych, ani podmienionej funkcji okna korekty.
-- ON_ERROR_STOP sprawia, że nieudane sprawdzenie kończy psql kodem różnym od zera.

\set ON_ERROR_STOP on

begin;

-- ---------------------------------------------------------------------------
-- Sprawdzenie 1: RLS włączone na trzech tabelach
-- ---------------------------------------------------------------------------

do $$
declare
  v_missing text;
begin
  select string_agg(t.tablename, ', ' order by t.tablename)
    into v_missing
  from pg_tables t
  where t.schemaname = 'public'
    and t.tablename in ('medications', 'medication_substances', 'dosage_periods')
    and t.rowsecurity is not true;

  if v_missing is not null then
    raise exception 'SPRAWDZENIE 1 NIEUDANE: RLS wyłączone na tabelach: %', v_missing;
  end if;

  if (
    select count(*) from pg_tables t
    where t.schemaname = 'public'
      and t.tablename in ('medications', 'medication_substances', 'dosage_periods')
  ) <> 3 then
    raise exception 'SPRAWDZENIE 1 NIEUDANE: w schemacie public nie ma wszystkich trzech tabel';
  end if;

  raise notice 'SPRAWDZENIE 1 OK: RLS włączone na medications, medication_substances, dosage_periods';
end;
$$;

-- ---------------------------------------------------------------------------
-- Sprawdzenie 2: dwanaście polityk, po cztery na tabelę, wyłącznie dla authenticated
-- ---------------------------------------------------------------------------

do $$
declare
  r record;
  v_total integer;
  v_anon integer;
begin
  for r in
    select unnest(array['medications', 'medication_substances', 'dosage_periods']) as tablename
  loop
    if (
      select count(distinct p.cmd) from pg_policies p
      where p.schemaname = 'public' and p.tablename = r.tablename
    ) <> 4 then
      raise exception 'SPRAWDZENIE 2 NIEUDANE: tabela % nie ma polityki dla każdej z czterech operacji', r.tablename;
    end if;

    if (
      select count(*) from pg_policies p
      where p.schemaname = 'public' and p.tablename = r.tablename
    ) <> 4 then
      raise exception 'SPRAWDZENIE 2 NIEUDANE: tabela % ma inną liczbę polityk niż cztery', r.tablename;
    end if;
  end loop;

  select count(*) into v_total
  from pg_policies p
  where p.schemaname = 'public'
    and p.tablename in ('medications', 'medication_substances', 'dosage_periods');

  if v_total <> 12 then
    raise exception 'SPRAWDZENIE 2 NIEUDANE: polityk jest %, a ma być 12', v_total;
  end if;

  -- Nie wystarczy sprawdzić, czy któraś polityka wymienia rolę anon: polityka
  -- założona dla roli public obejmuje anon, nie nazywając jej. Dlatego warunek
  -- jest odwrotny — każda z dwunastu polityk musi być dokładnie dla authenticated.
  select count(*) into v_anon
  from pg_policies p
  where p.schemaname = 'public'
    and p.tablename in ('medications', 'medication_substances', 'dosage_periods')
    and p.roles is distinct from array['authenticated']::name[];

  if v_anon <> 0 then
    raise exception 'SPRAWDZENIE 2 NIEUDANE: % polityk ma role inne niż dokładnie {authenticated} — polityka dla public albo anon otwiera dane bez sesji', v_anon;
  end if;

  raise notice 'SPRAWDZENIE 2 OK: 12 polityk, po 4 na tabelę, każda dokładnie dla roli authenticated';
end;
$$;

-- ---------------------------------------------------------------------------
-- Dane testowe (usuwane rollbackiem na końcu skryptu)
-- ---------------------------------------------------------------------------

do $$
begin
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, created_at, updated_at)
  values (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-4000-8000-000000000001',
    'authenticated',
    'authenticated',
    'rls-checks@example.test',
    'x',
    now(),
    now()
  );

  insert into public.medications (id, user_id, product_name, composition_source)
  values (
    '00000000-0000-4000-8000-000000000002',
    '00000000-0000-4000-8000-000000000001',
    'Preparat testowy',
    'leaflet'
  );

  insert into public.medications (id, user_id, product_name, composition_source)
  values (
    '00000000-0000-4000-8000-000000000005',
    '00000000-0000-4000-8000-000000000001',
    'Drugi preparat testowy',
    'leaflet'
  );

  insert into public.medication_substances (id, medication_id, substance_name, atc_code)
  values (
    '00000000-0000-4000-8000-000000000003',
    '00000000-0000-4000-8000-000000000002',
    'Substancja testowa',
    'A01AB02'
  );

  insert into public.dosage_periods (id, medication_id, dose_text, started_on, ended_on)
  values (
    '00000000-0000-4000-8000-000000000004',
    '00000000-0000-4000-8000-000000000002',
    '1 tabletka rano',
    date '2026-01-01',
    null
  );

  raise notice 'DANE TESTOWE OK: konto, dwa leki, jedna substancja i jeden okres dawkowania';
end;
$$;

-- ---------------------------------------------------------------------------
-- Sprawdzenie 3: dwa nakładające się okresy tego samego leku są odrzucane
-- ---------------------------------------------------------------------------

do $$
declare
  v_rejected boolean := false;
  v_message text;
begin
  begin
    insert into public.dosage_periods (medication_id, dose_text, started_on, ended_on)
    values (
      '00000000-0000-4000-8000-000000000002',
      '2 tabletki rano',
      date '2026-01-15',
      date '2026-02-01'
    );
  -- Konkretny błąd, nie dowolny: gdyby wpis padł z innego powodu (literówka w
  -- nazwie kolumny, zła wartość), sprawdzenie wyglądałoby na działającą ochronę.
  exception when exclusion_violation then
    v_rejected := true;
    v_message := sqlerrm;
  end;

  if not v_rejected then
    raise exception 'SPRAWDZENIE 3 NIEUDANE: baza przyjęła okres nakładający się na istniejący';
  end if;

  -- 3b: okres zerowej długości. daterange(d, d, '[)') jest pusty, a pusty zakres
  -- nie przecina się z niczym operatorem &&, więc gdyby kontrola dat go wpuściła,
  -- ograniczenie wykluczające by go nie zauważyło.
  v_rejected := false;
  begin
    insert into public.dosage_periods (medication_id, dose_text, started_on, ended_on)
    values (
      '00000000-0000-4000-8000-000000000002',
      '3 tabletki rano',
      date '2026-03-01',
      date '2026-03-01'
    );
  exception when check_violation then
    v_rejected := true;
  end;

  if not v_rejected then
    raise exception 'SPRAWDZENIE 3 NIEUDANE: baza przyjęła okres zerowej długości, którego ograniczenie wykluczające nie widzi';
  end if;

  raise notice 'SPRAWDZENIE 3 OK: nakładający się okres odrzucony (%), okres zerowej długości też', v_message;
end;
$$;

-- ---------------------------------------------------------------------------
-- Sprawdzenie 4: przy otwartym oknie korekty rdzeń wpisu da się zmienić i usunąć
-- ---------------------------------------------------------------------------

do $$
declare
  v_temp_substance uuid;
  v_temp_period uuid;
begin
  update public.medication_substances
     set substance_name = 'Substancja testowa po korekcie',
         atc_code = 'A01AB03'
   where id = '00000000-0000-4000-8000-000000000003';

  update public.dosage_periods
     set dose_text = '1 tabletka wieczorem',
         started_on = date '2026-01-02'
   where id = '00000000-0000-4000-8000-000000000004';

  insert into public.medication_substances (medication_id, substance_name, atc_code)
  values ('00000000-0000-4000-8000-000000000002', 'Substancja do usunięcia', 'B01AC06')
  returning id into v_temp_substance;

  insert into public.dosage_periods (medication_id, dose_text, started_on, ended_on)
  values ('00000000-0000-4000-8000-000000000002', 'dawka do usunięcia', date '2025-01-01', date '2025-02-01')
  returning id into v_temp_period;

  delete from public.medication_substances where id = v_temp_substance;
  delete from public.dosage_periods where id = v_temp_period;

  if exists (select 1 from public.medication_substances where id = v_temp_substance)
     or exists (select 1 from public.dosage_periods where id = v_temp_period) then
    raise exception 'SPRAWDZENIE 4 NIEUDANE: wiersz nie został usunięty mimo otwartego okna korekty';
  end if;

  raise notice 'SPRAWDZENIE 4 OK: przy otwartym oknie korekty zmiana i usunięcie rdzenia przechodzą';
end;
$$;

-- ---------------------------------------------------------------------------
-- Check 20 (S-02): with the correction window open, the composition source and the registry product of a
-- medication can be corrected
-- ---------------------------------------------------------------------------
-- Uses its own medication (...0020), which stays until the final rollback. Two seed products are picked by
-- rpl_id (Ibuprofen Zentiva 200 mg and 400 mg), so the check does not depend on test rows of check 13.

do $$
declare
  v_product_200 uuid;
  v_product_400 uuid;
  v_row record;
begin
  select id into v_product_200 from public.registry_products where rpl_id = '100432653';
  select id into v_product_400 from public.registry_products where rpl_id = '100432660';
  if v_product_200 is null or v_product_400 is null then
    raise exception 'CHECK 20 FAILED: seed products 100432653 / 100432660 are missing, so the check would not measure anything';
  end if;

  insert into public.medications (id, user_id, product_name, composition_source)
  values (
    '00000000-0000-4000-8000-000000000020',
    '00000000-0000-4000-8000-000000000001',
    'Check 20 medication',
    'leaflet'
  );

  -- 20a: leaflet -> registry with a product
  update public.medications
     set composition_source = 'registry',
         registry_medication_id = v_product_200
   where id = '00000000-0000-4000-8000-000000000020';

  -- 20b: another registry product
  update public.medications
     set registry_medication_id = v_product_400
   where id = '00000000-0000-4000-8000-000000000020';

  select composition_source, registry_medication_id into v_row
    from public.medications where id = '00000000-0000-4000-8000-000000000020';
  if v_row.composition_source is distinct from 'registry' or v_row.registry_medication_id is distinct from v_product_400 then
    raise exception 'CHECK 20 FAILED: correction with the window open was not saved (source %, product %)',
      v_row.composition_source, v_row.registry_medication_id;
  end if;

  raise notice 'CHECK 20 OK: with the correction window open, composition_source and registry_medication_id can be corrected';
end;
$$;

-- ---------------------------------------------------------------------------
-- Correction window closed for checks 5–7, 19 and 21.
-- Both window functions are replaced: the medication window (medication guards,
-- composition guards, insert guards) and the dosage period window (period guards,
-- S-05). Neither is restored by rewriting its body: their migration state is
-- fingerprinted here, the savepoint below is rolled back after check 21, and the
-- final check compares both fingerprints. The real 24-hour rule is measured on
-- backdated rows in correction_window_checks.sql.
-- ---------------------------------------------------------------------------

create temporary table rls_checks_window_fingerprint as
select md5(pg_get_functiondef('public.medication_correction_window_open(uuid)'::regprocedure)) as fingerprint,
       md5(pg_get_functiondef('public.dosage_period_correction_window_open(uuid)'::regprocedure)) as period_fingerprint;

-- Content check for a history guard block. SQLSTATE P0001 comes from every
-- `raise exception` without ERRCODE, so a typo in a check could look like a
-- working trigger. The message must name the closed window and the protected
-- field or object from the trigger text (Polish, quoted from the migration).
-- The pattern allows words between "okno korekty" and "jest już zamknięte":
-- the substance guard says "okno korekty dla tego leku jest już zamknięte".
create function pg_temp.assert_history_guard_message(p_check text, p_case text, p_message text, p_subject text)
returns void
language plpgsql
as $$
begin
  if p_message not like '%okno korekty%jest już zamknięte%' or p_message not like '%' || p_subject || '%' then
    raise exception 'CHECK % FAILED: % was blocked by an unexpected P0001 error, expected the correction window guard naming "%" (got %)',
      p_check, p_case, p_subject, p_message;
  end if;
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

-- ---------------------------------------------------------------------------
-- Sprawdzenie 5: przy zamkniętym oknie rdzeń wpisu jest niemodyfikowalny,
-- ale zamknięcie trwającego okresu przechodzi
-- ---------------------------------------------------------------------------

do $$
declare
  v_message text;
begin
  -- 5a: zmiana substancji czynnej
  v_message := null;
  begin
    update public.medication_substances
       set substance_name = 'Podmieniona substancja'
     where id = '00000000-0000-4000-8000-000000000003';
  exception when sqlstate 'P0001' then
    get stacked diagnostics v_message = message_text;
  end;
  if v_message is null then
    raise exception 'SPRAWDZENIE 5 NIEUDANE: zmiana substance_name przeszła przy zamkniętym oknie korekty';
  end if;
  perform pg_temp.assert_history_guard_message('5', '5a substance_name change', v_message, 'substance_name');

  -- 5b: zmiana dawki
  v_message := null;
  begin
    update public.dosage_periods
       set dose_text = 'inna dawka'
     where id = '00000000-0000-4000-8000-000000000004';
  exception when sqlstate 'P0001' then
    get stacked diagnostics v_message = message_text;
  end;
  if v_message is null then
    raise exception 'SPRAWDZENIE 5 NIEUDANE: zmiana dose_text przeszła przy zamkniętym oknie korekty';
  end if;
  perform pg_temp.assert_history_guard_message('5', '5b dose_text change', v_message, 'dose_text');

  -- 5c: zmiana daty rozpoczęcia
  v_message := null;
  begin
    update public.dosage_periods
       set started_on = date '2026-03-01'
     where id = '00000000-0000-4000-8000-000000000004';
  exception when sqlstate 'P0001' then
    get stacked diagnostics v_message = message_text;
  end;
  if v_message is null then
    raise exception 'SPRAWDZENIE 5 NIEUDANE: zmiana started_on przeszła przy zamkniętym oknie korekty';
  end if;
  perform pg_temp.assert_history_guard_message('5', '5c started_on change', v_message, 'started_on');

  -- 5d: zamknięcie trwającego okresu przechodzi z datą w granicach change_dosage (najwyżej 14 dni wstecz, nie w
  -- przyszłości) — granice mierzy WINDOW 6 w correction_window_checks.sql
  update public.dosage_periods
     set ended_on = (now() at time zone 'Europe/Warsaw')::date - 1
   where id = '00000000-0000-4000-8000-000000000004';

  if (select ended_on from public.dosage_periods where id = '00000000-0000-4000-8000-000000000004')
     is distinct from (now() at time zone 'Europe/Warsaw')::date - 1 then
    raise exception 'SPRAWDZENIE 5 NIEUDANE: zamknięcie okresu datą końca nie zapisało się';
  end if;

  -- 5e: podmiana już ustawionej daty końca jest blokowana
  v_message := null;
  begin
    update public.dosage_periods
       set ended_on = date '2026-07-01'
     where id = '00000000-0000-4000-8000-000000000004';
  exception when sqlstate 'P0001' then
    get stacked diagnostics v_message = message_text;
  end;
  if v_message is null then
    raise exception 'SPRAWDZENIE 5 NIEUDANE: podmiana ustawionej daty ended_on przeszła przy zamkniętym oknie korekty';
  end if;
  perform pg_temp.assert_history_guard_message('5', '5e ended_on change', v_message, 'ended_on');

  -- 5f: przepięcie wiersza podrzędnego pod inny własny lek. Żadne z chronionych
  -- pól się nie zmienia, a historia obu leków owszem.
  v_message := null;
  begin
    update public.dosage_periods
       set medication_id = '00000000-0000-4000-8000-000000000005'
     where id = '00000000-0000-4000-8000-000000000004';
  exception when sqlstate 'P0001' then
    get stacked diagnostics v_message = message_text;
  end;
  if v_message is null then
    raise exception 'SPRAWDZENIE 5 NIEUDANE: przepięcie okresu pod inny lek przeszło przy zamkniętym oknie korekty';
  end if;
  perform pg_temp.assert_history_guard_message('5', '5f dosage period re-parenting', v_message, 'medication_id');

  v_message := null;
  begin
    update public.medication_substances
       set medication_id = '00000000-0000-4000-8000-000000000005'
     where id = '00000000-0000-4000-8000-000000000003';
  exception when sqlstate 'P0001' then
    get stacked diagnostics v_message = message_text;
  end;
  if v_message is null then
    raise exception 'SPRAWDZENIE 5 NIEUDANE: przepięcie składu pod inny lek przeszło przy zamkniętym oknie korekty';
  end if;
  perform pg_temp.assert_history_guard_message('5', '5f substance re-parenting', v_message, 'medication_id');

  -- 5g (F-02): atc_code became nullable, so clearing a code must still count as changing the core of the entry.
  v_message := null;
  begin
    update public.medication_substances
       set atc_code = null
     where id = '00000000-0000-4000-8000-000000000003';
  exception when sqlstate 'P0001' then
    get stacked diagnostics v_message = message_text;
  end;
  if v_message is null then
    raise exception 'CHECK 5 FAILED: clearing atc_code passed with the correction window closed';
  end if;
  perform pg_temp.assert_history_guard_message('5', '5g clearing atc_code', v_message, 'atc_code');

  raise notice 'SPRAWDZENIE 5 OK: rdzeń wpisu niemodyfikowalny wraz z medication_id, zamknięcie trwającego okresu przechodzi';
end;
$$;

-- ---------------------------------------------------------------------------
-- Sprawdzenie 6: przy zamkniętym oknie usunięcie wiersza podrzędnego jest blokowane
-- ---------------------------------------------------------------------------

do $$
declare
  v_message text;
begin
  v_message := null;
  begin
    delete from public.medication_substances
     where id = '00000000-0000-4000-8000-000000000003';
  exception when sqlstate 'P0001' then
    get stacked diagnostics v_message = message_text;
  end;
  if v_message is null then
    raise exception 'SPRAWDZENIE 6 NIEUDANE: usunięcie wiersza składu przeszło przy zamkniętym oknie korekty';
  end if;
  perform pg_temp.assert_history_guard_message('6', 'substance row delete', v_message, 'usunąć wpisu składu leku');

  v_message := null;
  begin
    delete from public.dosage_periods
     where id = '00000000-0000-4000-8000-000000000004';
  exception when sqlstate 'P0001' then
    get stacked diagnostics v_message = message_text;
  end;
  if v_message is null then
    raise exception 'SPRAWDZENIE 6 NIEUDANE: usunięcie okresu dawkowania przeszło przy zamkniętym oknie korekty';
  end if;
  perform pg_temp.assert_history_guard_message('6', 'dosage period delete', v_message, 'usunąć okresu dawkowania');

  raise notice 'SPRAWDZENIE 6 OK: przy zamkniętym oknie korekty wierszy podrzędnych nie da się usunąć';
end;
$$;

-- ---------------------------------------------------------------------------
-- Sprawdzenie 7: przy zamkniętym oknie korekty usunięcie leku pada
-- ---------------------------------------------------------------------------

do $$
declare
  v_message text := null;
begin
  begin
    delete from public.medications where id = '00000000-0000-4000-8000-000000000002';
  exception
    when sqlstate 'P0001' then
      get stacked diagnostics v_message = message_text;
  end;

  if v_message is null then
    raise exception 'SPRAWDZENIE 7 NIEUDANE: usunięcie leku przy zamkniętym oknie korekty przeszło — historia dawkowania da się wymazać';
  end if;
  perform pg_temp.assert_history_guard_message('7', 'medication delete', v_message, 'usunąć leku');

  raise notice 'SPRAWDZENIE 7 OK: przy zamkniętym oknie korekty leku nie da się usunąć';
end;
$$;

-- ---------------------------------------------------------------------------
-- Check 19: with the correction window closed, a dosage change is saved as
-- closing the current period and opening a new one; the old dose stays in history
-- ---------------------------------------------------------------------------
-- Uses its own medication (...0006) so its periods cannot collide with the
-- periods of checks 3–7. Its rows are created after the savepoint and disappear
-- with it. With the medication window closed, dosage_periods_guard_insert lets a
-- period through only at the end of the history and at most 14 days back: P1 is
-- the first period and P2 starts after it, both within 14 days, so both pass. A one-day period at the '[)' bound would be
-- started_on = d, ended_on = d + 1; here P2 starts on the day P1 ends.

do $$
declare
  v_rows integer;
  v_message text;
  v_p1 record;
  v_p2 record;
begin
  if public.medication_correction_window_open('00000000-0000-4000-8000-000000000006') then
    raise exception 'CHECK 19 FAILED: the correction window is open, so the check would not measure the closed-window rule';
  end if;

  insert into public.medications (id, user_id, product_name, composition_source)
  values (
    '00000000-0000-4000-8000-000000000006',
    '00000000-0000-4000-8000-000000000001',
    'Check 19 medication',
    'leaflet'
  );

  -- 19a: P1 with dose A and no end date exists
  insert into public.dosage_periods (id, medication_id, dose_text, started_on, ended_on)
  values (
    '00000000-0000-4000-8000-000000000007',
    '00000000-0000-4000-8000-000000000006',
    'check 19 dose A',
    (now() at time zone 'Europe/Warsaw')::date - 10,
    null
  );

  -- 19b: closing P1 passes
  update public.dosage_periods
     set ended_on = (now() at time zone 'Europe/Warsaw')::date - 5
   where id = '00000000-0000-4000-8000-000000000007';
  get diagnostics v_rows = row_count;
  if v_rows <> 1 then
    raise exception 'CHECK 19 FAILED: closing period P1 updated % rows, expected 1', v_rows;
  end if;

  -- 19c: P2 with dose B starting on the day P1 ends passes (adjacent at the '[)' bound, no overlap)
  insert into public.dosage_periods (id, medication_id, dose_text, started_on, ended_on)
  values (
    '00000000-0000-4000-8000-000000000008',
    '00000000-0000-4000-8000-000000000006',
    'check 19 dose B',
    (now() at time zone 'Europe/Warsaw')::date - 5,
    null
  );

  -- 19d: overwriting the dose of P1 is blocked by the named guard error
  v_message := null;
  begin
    update public.dosage_periods
       set dose_text = 'check 19 dose B'
     where id = '00000000-0000-4000-8000-000000000007';
  exception when sqlstate 'P0001' then
    get stacked diagnostics v_message = message_text;
  end;
  if v_message is null then
    raise exception 'CHECK 19 FAILED: overwriting dose_text of the closed period P1 passed with the correction window closed';
  end if;
  perform pg_temp.assert_history_guard_message('19', '19d dose_text overwrite of P1', v_message, 'dose_text');

  -- 19e: both periods exist; P1 still has dose A and its end date, P2 has dose B and is ongoing
  select dose_text, started_on, ended_on into v_p1
    from public.dosage_periods where id = '00000000-0000-4000-8000-000000000007';
  select dose_text, started_on, ended_on into v_p2
    from public.dosage_periods where id = '00000000-0000-4000-8000-000000000008';
  if v_p1.dose_text is distinct from 'check 19 dose A'
     or v_p1.started_on is distinct from (now() at time zone 'Europe/Warsaw')::date - 10
     or v_p1.ended_on is distinct from (now() at time zone 'Europe/Warsaw')::date - 5 then
    raise exception 'CHECK 19 FAILED: period P1 changed (dose %, % – %), expected dose A, today-10 – today-5',
      v_p1.dose_text, v_p1.started_on, v_p1.ended_on;
  end if;
  if v_p2.dose_text is distinct from 'check 19 dose B'
     or v_p2.started_on is distinct from (now() at time zone 'Europe/Warsaw')::date - 5
     or v_p2.ended_on is not null then
    raise exception 'CHECK 19 FAILED: period P2 is missing or wrong (dose %, % – %), expected dose B from today-5, ongoing',
      v_p2.dose_text, v_p2.started_on, v_p2.ended_on;
  end if;
  if (select count(*) from public.dosage_periods where medication_id = '00000000-0000-4000-8000-000000000006') <> 2 then
    raise exception 'CHECK 19 FAILED: expected exactly 2 periods for the check 19 medication';
  end if;

  raise notice 'CHECK 19 OK: with the correction window closed, P1 closed and adjacent P2 with a new dose opened; old dose kept in history; overwriting it blocked by the dose_text guard';
end;
$$;

-- ---------------------------------------------------------------------------
-- Check 21 (S-02): with the correction window closed, the composition source, the registry product and the
-- owner of a medication cannot change; the name and the discontinuation date still can
-- ---------------------------------------------------------------------------
-- Uses its own registry medication (...0021) and a second account (...0022); both disappear with the savepoint.
-- Every blocked case catches only P0001 and checks the message names the blocked field. Without the guard the
-- updates pass as postgres, so the check fails instead of looking green.

do $$
declare
  v_product_200 uuid;
  v_product_400 uuid;
  v_message text;
  v_row record;
begin
  if public.medication_correction_window_open('00000000-0000-4000-8000-000000000021') then
    raise exception 'CHECK 21 FAILED: the correction window is open, so the check would not measure the closed-window rule';
  end if;

  select id into v_product_200 from public.registry_products where rpl_id = '100432653';
  select id into v_product_400 from public.registry_products where rpl_id = '100432660';

  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, created_at, updated_at)
  values (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-4000-8000-000000000022',
    'authenticated',
    'authenticated',
    'rls-checks-21@example.test',
    'x',
    now(),
    now()
  );

  insert into public.medications (id, user_id, product_name, composition_source, registry_medication_id)
  values (
    '00000000-0000-4000-8000-000000000021',
    '00000000-0000-4000-8000-000000000001',
    'Check 21 medication',
    'registry',
    v_product_200
  );

  -- 21a: another registry product
  v_message := null;
  begin
    update public.medications
       set registry_medication_id = v_product_400
     where id = '00000000-0000-4000-8000-000000000021';
  exception when sqlstate 'P0001' then
    get stacked diagnostics v_message = message_text;
  end;
  if v_message is null then
    raise exception 'CHECK 21 FAILED: changing registry_medication_id passed with the correction window closed';
  end if;
  perform pg_temp.assert_history_guard_message('21', '21a registry_medication_id change', v_message, 'registry_medication_id');

  -- 21b: registry -> leaflet (both columns change together, so the consistency check alone would let it through)
  v_message := null;
  begin
    update public.medications
       set composition_source = 'leaflet',
           registry_medication_id = null
     where id = '00000000-0000-4000-8000-000000000021';
  exception when sqlstate 'P0001' then
    get stacked diagnostics v_message = message_text;
  end;
  if v_message is null then
    raise exception 'CHECK 21 FAILED: changing composition_source passed with the correction window closed';
  end if;
  perform pg_temp.assert_history_guard_message('21', '21b composition_source change', v_message, 'composition_source');

  -- 21c: moving the medication to another account
  v_message := null;
  begin
    update public.medications
       set user_id = '00000000-0000-4000-8000-000000000022'
     where id = '00000000-0000-4000-8000-000000000021';
  exception when sqlstate 'P0001' then
    get stacked diagnostics v_message = message_text;
  end;
  if v_message is null then
    raise exception 'CHECK 21 FAILED: changing user_id passed with the correction window closed';
  end if;
  perform pg_temp.assert_history_guard_message('21', '21c user_id change', v_message, 'user_id');

  -- 21d: the name is a label and the discontinuation date ends the medication (S-04); both pass
  update public.medications
     set product_name = 'Check 21 medication renamed'
   where id = '00000000-0000-4000-8000-000000000021';
  update public.medications
     set discontinued_on = date '2026-06-01'
   where id = '00000000-0000-4000-8000-000000000021';

  select product_name, discontinued_on, composition_source, registry_medication_id, user_id into v_row
    from public.medications where id = '00000000-0000-4000-8000-000000000021';
  if v_row.product_name is distinct from 'Check 21 medication renamed'
     or v_row.discontinued_on is distinct from date '2026-06-01' then
    raise exception 'CHECK 21 FAILED: product_name / discontinued_on were not saved with the window closed (got %, %)',
      v_row.product_name, v_row.discontinued_on;
  end if;
  if v_row.composition_source is distinct from 'registry'
     or v_row.registry_medication_id is distinct from v_product_200
     or v_row.user_id is distinct from '00000000-0000-4000-8000-000000000001' then
    raise exception 'CHECK 21 FAILED: a blocked field changed anyway (source %, product %, owner %)',
      v_row.composition_source, v_row.registry_medication_id, v_row.user_id;
  end if;

  raise notice 'CHECK 21 OK: with the correction window closed, composition_source, registry_medication_id and user_id are blocked by medications_guard_core; product_name and discontinued_on pass';
end;
$$;

-- ---------------------------------------------------------------------------
-- Back to the migration state of the correction window function: undoes the
-- replacement above together with the rows written by checks 5–7 and 19.
-- ---------------------------------------------------------------------------

rollback to savepoint before_window_closed;

-- ---------------------------------------------------------------------------
-- Sprawdzenie 8: przy otwartym oknie korekty usunięcie leku przechodzi wraz z kaskadą
-- ---------------------------------------------------------------------------

-- Measures the migration state of the window function. Since S-05 the window is
-- 24 hours from medications.created_at; the rows of this file were saved in this
-- transaction (now() is constant inside it), so the window is open.

do $$
begin
  -- The cascade must have something to delete: without child rows it would pass on an empty set.
  if not exists (select 1 from public.medication_substances where medication_id = '00000000-0000-4000-8000-000000000002')
     or not exists (select 1 from public.dosage_periods where medication_id = '00000000-0000-4000-8000-000000000002') then
    raise exception 'CHECK 8 FAILED: medication ...0002 has no substance or no dosage period before the delete, so the cascade would not be measured';
  end if;

  delete from public.medications where id = '00000000-0000-4000-8000-000000000002';

  if exists (select 1 from public.medications where id = '00000000-0000-4000-8000-000000000002')
     or exists (select 1 from public.medication_substances where medication_id = '00000000-0000-4000-8000-000000000002')
     or exists (select 1 from public.dosage_periods where medication_id = '00000000-0000-4000-8000-000000000002') then
    raise exception 'SPRAWDZENIE 8 NIEUDANE: kaskadowe usunięcie leku nie usunęło wszystkich wierszy podrzędnych';
  end if;

  raise notice 'SPRAWDZENIE 8 OK: przy otwartym oknie korekty usunięcie pomyłki przechodzi wraz z kaskadą';
end;
$$;

-- ---------------------------------------------------------------------------
-- Check 9: shared tables have RLS and exactly one SELECT policy for authenticated
-- ---------------------------------------------------------------------------

do $$
declare
  r record;
begin
  if (
    select count(*) from pg_tables t
    where t.schemaname = 'public'
      and t.tablename in ('registry_products', 'registry_substances', 'interaction_pairs')
      and t.rowsecurity is true
  ) <> 3 then
    raise exception 'CHECK 9 FAILED: RLS is not enabled on all three shared tables (or a table is missing)';
  end if;

  for r in
    select unnest(array['registry_products', 'registry_substances', 'interaction_pairs']) as tablename
  loop
    -- Roles compared exactly: a policy for public covers anon without naming it.
    if (
      select count(*) from pg_policies p
      where p.schemaname = 'public' and p.tablename = r.tablename
    ) <> 1 or not exists (
      select 1 from pg_policies p
      where p.schemaname = 'public' and p.tablename = r.tablename
        and p.cmd = 'SELECT'
        and p.roles = array['authenticated']::name[]
    ) then
      raise exception 'CHECK 9 FAILED: table % must have exactly one policy, SELECT, for role {authenticated} only', r.tablename;
    end if;
  end loop;

  raise notice 'CHECK 9 OK: RLS on registry_products, registry_substances, interaction_pairs; one SELECT policy each, authenticated only';
end;
$$;

-- ---------------------------------------------------------------------------
-- Check 10: write privileges on shared tables are revoked from anon and authenticated
-- ---------------------------------------------------------------------------

do $$
declare
  v_table text;
  v_role text;
  v_privilege text;
begin
  foreach v_table in array array['registry_products', 'registry_substances', 'interaction_pairs'] loop
    foreach v_role in array array['anon', 'authenticated'] loop
      foreach v_privilege in array array['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE'] loop
        if has_table_privilege(v_role, 'public.' || v_table, v_privilege) then
          raise exception 'CHECK 10 FAILED: role % still has % on %', v_role, v_privilege, v_table;
        end if;
      end loop;
    end loop;
  end loop;

  raise notice 'CHECK 10 OK: anon and authenticated have no INSERT, UPDATE, DELETE, TRUNCATE on shared tables';
end;
$$;

-- ---------------------------------------------------------------------------
-- Check 11: data loaded by the generated migrations
-- ---------------------------------------------------------------------------
-- Invariants S-02 relies on. Runs before checks 12–13 add their test rows, so it sees only migration data.
--   11a: the registry and the pairs are not empty (the data migrations ran);
--   11b: every product has a substance code or a product code starting with a group of some pair — the scope
--        filter worked and nothing outside it was loaded;
--   11c: every product's substances come from one composition origin (one composition_source and, for
--        sibling, one composition_source_rpl_id) — mixed origins would mean a top-up migration inserted
--        substances for an already loaded product.

do $$
declare
  v_products integer;
  v_substances integer;
  v_pairs integer;
  v_outside text;
  v_mixed text;
begin
  select count(*) into v_products from public.registry_products;
  select count(*) into v_substances from public.registry_substances;
  select count(*) into v_pairs from public.interaction_pairs;
  if v_products = 0 or v_substances = 0 or v_pairs = 0 then
    raise exception 'CHECK 11 FAILED: shared data is missing (registry_products %, registry_substances %, interaction_pairs %)',
      v_products, v_substances, v_pairs;
  end if;

  select string_agg(p.rpl_id || ' ' || p.product_name, ', ' order by p.rpl_id)
    into v_outside
  from public.registry_products p
  where not exists (
    select 1
    from (
      select group_a as grp from public.interaction_pairs
      union
      select group_b from public.interaction_pairs
    ) g
    where exists (
        select 1 from public.registry_substances s
        where s.registry_product_id = p.id
          and s.atc_code like g.grp || '%'
      )
      or exists (
        select 1 from unnest(p.atc_codes) as code
        where code like g.grp || '%'
      )
  );
  if v_outside is not null then
    raise exception 'CHECK 11 FAILED: products outside the scope of every pair were loaded: %', v_outside;
  end if;

  -- The generator decides where a composition comes from per product, not per substance. No constraint spans
  -- rows, so a product mixing origins would load silently. (Duplicate substance rows need no check here: the
  -- unique constraint on registry_substances rejects them during the migration.)
  select string_agg(rpl_id, ', ' order by rpl_id)
    into v_mixed
  from (
    select p.rpl_id
    from public.registry_substances s
    join public.registry_products p on p.id = s.registry_product_id
    group by p.rpl_id
    having count(distinct s.composition_source) > 1
        or count(distinct s.composition_source_rpl_id) > 1
  ) mixed;
  if v_mixed is not null then
    raise exception 'CHECK 11 FAILED: products whose substances mix composition origins: %', v_mixed;
  end if;

  raise notice 'CHECK 11 OK: % products, % substance rows, % pairs; every product in the scope of a pair; one composition origin per product',
    v_products, v_substances, v_pairs;
end;
$$;

-- ---------------------------------------------------------------------------
-- Check 12: interaction_pairs constraints
-- ---------------------------------------------------------------------------
-- Each rejection must come from the named error AND the expected constraint: a check_violation
-- from a different constraint would otherwise look like working protection.
-- Measured before asserting: reversed order, bad shape -> 23514 check_violation;
-- duplicate -> 23505 unique_violation.
-- Uses groups Z98AA and Z99AA: valid shape, no ATC anatomical group Z, so no seeded pair collides with them.

do $$
declare
  v_constraint text;
begin
  insert into public.interaction_pairs (group_a, group_b, description, source, verified_on)
  values ('Z98AA', 'Z99AA', 'Test pair description', 'Test source', date '2026-09-24');

  -- 12a: reversed group order
  v_constraint := null;
  begin
    insert into public.interaction_pairs (group_a, group_b, description, source, verified_on)
    values ('Z99AA', 'Z98AA', 'Test pair description', 'Test source', date '2026-09-24');
  exception when check_violation then
    get stacked diagnostics v_constraint = constraint_name;
  end;
  if v_constraint is distinct from 'interaction_pairs_group_order_check' then
    raise exception 'CHECK 12 FAILED: reversed group order was not rejected by interaction_pairs_group_order_check (got %)', v_constraint;
  end if;

  -- 12b: duplicate pair
  v_constraint := null;
  begin
    insert into public.interaction_pairs (group_a, group_b, description, source, verified_on)
    values ('Z98AA', 'Z99AA', 'Another description', 'Another source', date '2026-09-24');
  exception when unique_violation then
    get stacked diagnostics v_constraint = constraint_name;
  end;
  if v_constraint is distinct from 'interaction_pairs_group_a_group_b_key' then
    raise exception 'CHECK 12 FAILED: duplicate pair was not rejected by interaction_pairs_group_a_group_b_key (got %)', v_constraint;
  end if;

  -- 12c: bad ATC shape (lowercase)
  v_constraint := null;
  begin
    insert into public.interaction_pairs (group_a, group_b, description, source, verified_on)
    values ('Z98AA', 'z99aa', 'Test pair description', 'Test source', date '2026-09-24');
  exception when check_violation then
    get stacked diagnostics v_constraint = constraint_name;
  end;
  if v_constraint is distinct from 'interaction_pairs_group_b_check' then
    raise exception 'CHECK 12 FAILED: malformed ATC group was not rejected by interaction_pairs_group_b_check (got %)', v_constraint;
  end if;

  -- 12d: a group paired with itself is allowed (two drugs of one class from different doctors)
  insert into public.interaction_pairs (group_a, group_b, description, source, verified_on)
  values ('Z99AA', 'Z99AA', 'Test pair description', 'Test source', date '2026-09-24');

  raise notice 'CHECK 12 OK: reversed order, duplicate and malformed group rejected by their constraints; self pair accepted';
end;
$$;

-- ---------------------------------------------------------------------------
-- Check 13: registry_substances constraints
-- ---------------------------------------------------------------------------
-- Measured before asserting: all four cases -> 23514 check_violation.

do $$
declare
  v_constraint text;
begin
  insert into public.registry_products (id, rpl_id, product_name, source_payload, snapshot_date)
  values (
    '00000000-0000-4000-8000-000000000010',
    'rls-checks-1',
    'Registry test product',
    '{}'::jsonb,
    date '2026-09-23'
  );

  -- 13a: 'unmatched' with a code
  v_constraint := null;
  begin
    insert into public.registry_substances
      (registry_product_id, position, substance_name, normalized_name, atc_code, atc_source, composition_source)
    values ('00000000-0000-4000-8000-000000000010', 1, 'Substantia', 'substantia', 'A01AB02', 'unmatched', 'source');
  exception when check_violation then
    get stacked diagnostics v_constraint = constraint_name;
  end;
  if v_constraint is distinct from 'registry_substances_unmatched_check' then
    raise exception 'CHECK 13 FAILED: unmatched substance with a code was not rejected by registry_substances_unmatched_check (got %)', v_constraint;
  end if;

  -- 13b: 'product' without a code
  v_constraint := null;
  begin
    insert into public.registry_substances
      (registry_product_id, position, substance_name, normalized_name, atc_code, atc_source, composition_source)
    values ('00000000-0000-4000-8000-000000000010', 1, 'Substantia', 'substantia', null, 'product', 'source');
  exception when check_violation then
    get stacked diagnostics v_constraint = constraint_name;
  end;
  if v_constraint is distinct from 'registry_substances_unmatched_check' then
    raise exception 'CHECK 13 FAILED: matched substance without a code was not rejected by registry_substances_unmatched_check (got %)', v_constraint;
  end if;

  -- 13c: 'sibling' without composition_source_rpl_id
  v_constraint := null;
  begin
    insert into public.registry_substances
      (registry_product_id, position, substance_name, normalized_name, atc_code, atc_source, composition_source)
    values ('00000000-0000-4000-8000-000000000010', 1, 'Substantia', 'substantia', 'A01AB02', 'product', 'sibling');
  exception when check_violation then
    get stacked diagnostics v_constraint = constraint_name;
  end;
  if v_constraint is distinct from 'registry_substances_composition_source_rpl_id_check' then
    raise exception 'CHECK 13 FAILED: sibling composition without source rpl_id was not rejected (got %)', v_constraint;
  end if;

  -- 13d: 'source' with composition_source_rpl_id
  v_constraint := null;
  begin
    insert into public.registry_substances
      (registry_product_id, position, substance_name, normalized_name, atc_code, atc_source,
       composition_source, composition_source_rpl_id)
    values ('00000000-0000-4000-8000-000000000010', 1, 'Substantia', 'substantia', 'A01AB02', 'product',
            'source', 'rls-checks-2');
  exception when check_violation then
    get stacked diagnostics v_constraint = constraint_name;
  end;
  if v_constraint is distinct from 'registry_substances_composition_source_rpl_id_check' then
    raise exception 'CHECK 13 FAILED: source composition with a source rpl_id was not rejected (got %)', v_constraint;
  end if;

  -- 13e: valid rows pass, including an unmatched substance without a code
  insert into public.registry_substances
    (registry_product_id, position, substance_name, normalized_name, atc_code, atc_source, composition_source)
  values
    ('00000000-0000-4000-8000-000000000010', 1, 'Substantia', 'substantia', 'A01AB02', 'product', 'source'),
    ('00000000-0000-4000-8000-000000000010', 2, 'Altera', 'altera', null, 'unmatched', 'source');

  raise notice 'CHECK 13 OK: atc_source/atc_code and composition_source/rpl_id mismatches rejected; valid rows accepted';
end;
$$;

-- ---------------------------------------------------------------------------
-- Check 14: F-01 changes — registry foreign key and nullable substance code
-- ---------------------------------------------------------------------------
-- Measured before asserting: missing registry product -> 23503 foreign_key_violation;
-- duplicate substance without a code -> 23505 unique_violation;
-- deleting a product a medication points to -> 23503 foreign_key_violation.
-- Uses medication ...0005, which survives check 8, and registry product ...0010 from check 13.

do $$
declare
  v_constraint text;
begin
  -- 14a: registry_medication_id pointing to a non-existent product. composition_source changes together with it,
  -- because a leaflet medication with a product fails medications_registry_source_check (S-02) before the
  -- foreign key is checked.
  v_constraint := null;
  begin
    update public.medications
       set composition_source = 'registry',
           registry_medication_id = '00000000-0000-4000-8000-0000000000ff'
     where id = '00000000-0000-4000-8000-000000000005';
  exception when foreign_key_violation then
    get stacked diagnostics v_constraint = constraint_name;
  end;
  if v_constraint is distinct from 'medications_registry_medication_id_fkey' then
    raise exception 'CHECK 14 FAILED: registry_medication_id to a missing product was not rejected by medications_registry_medication_id_fkey (got %)', v_constraint;
  end if;

  -- 14b: a substance without a code is accepted
  insert into public.medication_substances (medication_id, substance_name, atc_code)
  values ('00000000-0000-4000-8000-000000000005', 'Extractum X', null);

  -- 14c: the same substance without a code again in the same medication is rejected
  v_constraint := null;
  begin
    insert into public.medication_substances (medication_id, substance_name, atc_code)
    values ('00000000-0000-4000-8000-000000000005', 'Extractum X', null);
  exception when unique_violation then
    get stacked diagnostics v_constraint = constraint_name;
  end;
  if v_constraint is distinct from 'medication_substances_medication_id_substance_name_atc_code_key' then
    raise exception 'CHECK 14 FAILED: duplicate substance without a code was not rejected (got %)', v_constraint;
  end if;

  -- 14d: a different substance without a code in the same medication is accepted
  insert into public.medication_substances (medication_id, substance_name, atc_code)
  values ('00000000-0000-4000-8000-000000000005', 'Extractum Y', null);

  -- 14e: a registry product a medication points to cannot be deleted (on delete restrict)
  update public.medications
     set composition_source = 'registry',
         registry_medication_id = '00000000-0000-4000-8000-000000000010'
   where id = '00000000-0000-4000-8000-000000000005';
  v_constraint := null;
  begin
    delete from public.registry_products where id = '00000000-0000-4000-8000-000000000010';
  exception when foreign_key_violation then
    get stacked diagnostics v_constraint = constraint_name;
  end;
  if v_constraint is distinct from 'medications_registry_medication_id_fkey' then
    raise exception 'CHECK 14 FAILED: deleting a product a medication points to was not rejected by medications_registry_medication_id_fkey (got %)', v_constraint;
  end if;

  raise notice 'CHECK 14 OK: registry foreign key enforced on insert and delete; substances without a code accepted, duplicate rejected';
end;
$$;

-- ---------------------------------------------------------------------------
-- Check 22 (S-02): composition_source = 'registry' exactly when registry_medication_id is set
-- ---------------------------------------------------------------------------

do $$
declare
  v_constraint text;
begin
  -- 22a: registry without a product
  v_constraint := null;
  begin
    insert into public.medications (user_id, product_name, composition_source)
    values ('00000000-0000-4000-8000-000000000001', 'Check 22 registry without product', 'registry');
  exception when check_violation then
    get stacked diagnostics v_constraint = constraint_name;
  end;
  if v_constraint is distinct from 'medications_registry_source_check' then
    raise exception 'CHECK 22 FAILED: registry medication without registry_medication_id was not rejected by medications_registry_source_check (got %)', v_constraint;
  end if;

  -- 22b: leaflet with a product
  v_constraint := null;
  begin
    insert into public.medications (user_id, product_name, composition_source, registry_medication_id)
    values (
      '00000000-0000-4000-8000-000000000001',
      'Check 22 leaflet with product',
      'leaflet',
      (select id from public.registry_products where rpl_id = '100432653')
    );
  exception when check_violation then
    get stacked diagnostics v_constraint = constraint_name;
  end;
  if v_constraint is distinct from 'medications_registry_source_check' then
    raise exception 'CHECK 22 FAILED: leaflet medication with registry_medication_id was not rejected by medications_registry_source_check (got %)', v_constraint;
  end if;

  raise notice 'CHECK 22 OK: registry without a product and leaflet with a product rejected by medications_registry_source_check';
end;
$$;

-- ---------------------------------------------------------------------------
-- Check 23 (S-02, F7): one row per ATC code in a medication
-- ---------------------------------------------------------------------------
-- The second row has a different substance name, so the older key (medication_id, substance_name, atc_code)
-- does not catch it; only the partial unique index on (medication_id, atc_code) does.

do $$
declare
  v_constraint text;
begin
  insert into public.medication_substances (medication_id, substance_name, atc_code)
  values ('00000000-0000-4000-8000-000000000020', 'Ibuprofenum', 'M01AE01');

  v_constraint := null;
  begin
    insert into public.medication_substances (medication_id, substance_name, atc_code)
    values ('00000000-0000-4000-8000-000000000020', 'Ibuprofenum (other spelling)', 'M01AE01');
  exception when unique_violation then
    get stacked diagnostics v_constraint = constraint_name;
  end;
  if v_constraint is distinct from 'medication_substances_medication_id_atc_code_key' then
    raise exception 'CHECK 23 FAILED: a second row with the same ATC code was not rejected by medication_substances_medication_id_atc_code_key (got %)', v_constraint;
  end if;

  -- two different substances without a code still pass
  insert into public.medication_substances (medication_id, substance_name, atc_code)
  values
    ('00000000-0000-4000-8000-000000000020', 'Check 23 extract A', null),
    ('00000000-0000-4000-8000-000000000020', 'Check 23 extract B', null);

  raise notice 'CHECK 23 OK: same ATC code twice in one medication rejected; two substances without a code accepted';
end;
$$;

-- ---------------------------------------------------------------------------
-- Check 24 (S-02): blank product name, dose and substance name are rejected
-- ---------------------------------------------------------------------------

do $$
declare
  v_constraint text;
begin
  v_constraint := null;
  begin
    insert into public.medications (user_id, product_name, composition_source)
    values ('00000000-0000-4000-8000-000000000001', '   ', 'leaflet');
  exception when check_violation then
    get stacked diagnostics v_constraint = constraint_name;
  end;
  if v_constraint is distinct from 'medications_product_name_check' then
    raise exception 'CHECK 24 FAILED: blank product_name was not rejected by medications_product_name_check (got %)', v_constraint;
  end if;

  v_constraint := null;
  begin
    insert into public.dosage_periods (medication_id, dose_text, started_on)
    values ('00000000-0000-4000-8000-000000000020', '  ', date '2026-01-01');
  exception when check_violation then
    get stacked diagnostics v_constraint = constraint_name;
  end;
  if v_constraint is distinct from 'dosage_periods_dose_text_check' then
    raise exception 'CHECK 24 FAILED: blank dose_text was not rejected by dosage_periods_dose_text_check (got %)', v_constraint;
  end if;

  v_constraint := null;
  begin
    insert into public.medication_substances (medication_id, substance_name, atc_code)
    values ('00000000-0000-4000-8000-000000000020', ' ', null);
  exception when check_violation then
    get stacked diagnostics v_constraint = constraint_name;
  end;
  if v_constraint is distinct from 'medication_substances_substance_name_check' then
    raise exception 'CHECK 24 FAILED: blank substance_name was not rejected by medication_substances_substance_name_check (got %)', v_constraint;
  end if;

  raise notice 'CHECK 24 OK: blank product_name, dose_text and substance_name rejected by their checks';
end;
$$;

-- ---------------------------------------------------------------------------
-- Check 15: symptom catalog tables have RLS and exactly one SELECT policy for authenticated
-- ---------------------------------------------------------------------------

do $$
declare
  r record;
begin
  if (
    select count(*) from pg_tables t
    where t.schemaname = 'public'
      and t.tablename in ('symptoms', 'symptom_search_terms')
      and t.rowsecurity is true
  ) <> 2 then
    raise exception 'CHECK 15 FAILED: RLS is not enabled on both symptom catalog tables (or a table is missing)';
  end if;

  for r in
    select unnest(array['symptoms', 'symptom_search_terms']) as tablename
  loop
    -- Roles compared exactly: a policy for public covers anon without naming it.
    if (
      select count(*) from pg_policies p
      where p.schemaname = 'public' and p.tablename = r.tablename
    ) <> 1 or not exists (
      select 1 from pg_policies p
      where p.schemaname = 'public' and p.tablename = r.tablename
        and p.cmd = 'SELECT'
        and p.roles = array['authenticated']::name[]
    ) then
      raise exception 'CHECK 15 FAILED: table % must have exactly one policy, SELECT, for role {authenticated} only', r.tablename;
    end if;
  end loop;

  raise notice 'CHECK 15 OK: RLS on symptoms, symptom_search_terms; one SELECT policy each, authenticated only';
end;
$$;

-- ---------------------------------------------------------------------------
-- Check 16: write privileges on symptom catalog tables are revoked from anon and authenticated
-- ---------------------------------------------------------------------------

do $$
declare
  v_table text;
  v_role text;
  v_privilege text;
begin
  foreach v_table in array array['symptoms', 'symptom_search_terms'] loop
    foreach v_role in array array['anon', 'authenticated'] loop
      foreach v_privilege in array array['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE'] loop
        if has_table_privilege(v_role, 'public.' || v_table, v_privilege) then
          raise exception 'CHECK 16 FAILED: role % still has % on %', v_role, v_privilege, v_table;
        end if;
      end loop;
    end loop;
  end loop;

  raise notice 'CHECK 16 OK: anon and authenticated have no INSERT, UPDATE, DELETE, TRUNCATE on symptoms, symptom_search_terms';
end;
$$;

-- ---------------------------------------------------------------------------
-- Check 18: symptom catalog loaded by the data migration
-- ---------------------------------------------------------------------------
-- Proves the whole approved list reached the database in its approved shape
-- (context/changes/symptom-catalog-seed/symptom-list.md, approved 2026-09-26). A change to the list in a later
-- migration changes the numbers below in the same commit.
-- Placed before check 17 on purpose: the script is one transaction ending in rollback, so the synthetic
-- check_17_* rows would live until the end and a check placed after them would count more than 34 symptoms.
--   18a: exactly 34 symptoms;
--   18b: per category: digestive 8, nervous 7, mental 3, skin 3, circulatory 3, general 3, muscular 2, other 5;
--   18c: every symptom has at least one search term;
--   18d: exactly 82 search terms;
--   18e: sort_order in every category is 1..n without gaps;
--   18f: source_vocabulary and source_code are empty in every row (set only from version 2).
--   18g: content fingerprint — md5 of every (key, name, category, sort_order) and every (key, term), compared with
--        literals; a change to any name, term, category or position must update the literal in the same commit.

do $$
declare
  v_symptoms integer;
  v_terms integer;
  v_bad text;
  v_hash text;
begin
  select count(*) into v_symptoms from public.symptoms;
  if v_symptoms <> 34 then
    raise exception 'CHECK 18 FAILED: expected 34 symptoms, found %', v_symptoms;
  end if;

  -- Full outer join: a category missing from the database and a category missing from the expected list both show.
  select string_agg(coalesce(e.category, a.category) || ' expected ' || coalesce(e.expected, 0)
                    || ', found ' || coalesce(a.found, 0), '; ' order by coalesce(e.category, a.category))
    into v_bad
  from (
    values ('digestive', 8), ('nervous', 7), ('mental', 3), ('skin', 3),
           ('circulatory', 3), ('general', 3), ('muscular', 2), ('other', 5)
  ) as e (category, expected)
  full join (
    select category, count(*)::integer as found from public.symptoms group by category
  ) a on a.category = e.category
  where e.expected is distinct from a.found;
  if v_bad is not null then
    raise exception 'CHECK 18 FAILED: category counts differ from the approved list: %', v_bad;
  end if;

  select string_agg(s.key, ', ' order by s.key)
    into v_bad
  from public.symptoms s
  where not exists (select 1 from public.symptom_search_terms t where t.symptom_id = s.id);
  if v_bad is not null then
    raise exception 'CHECK 18 FAILED: symptoms without a search term: %', v_bad;
  end if;

  select count(*) into v_terms from public.symptom_search_terms;
  if v_terms <> 82 then
    raise exception 'CHECK 18 FAILED: expected 82 search terms, found %', v_terms;
  end if;

  -- 1..n without gaps: positions are unique per category (constraint), so max = count and min = 1 is enough.
  select string_agg(category || ' (min ' || lo || ', max ' || hi || ', count ' || n || ')', '; ' order by category)
    into v_bad
  from (
    select category, min(sort_order) as lo, max(sort_order) as hi, count(*) as n
    from public.symptoms
    group by category
  ) c
  where lo <> 1 or hi <> n;
  if v_bad is not null then
    raise exception 'CHECK 18 FAILED: sort_order is not 1..n in: %', v_bad;
  end if;

  select string_agg(key, ', ' order by key)
    into v_bad
  from public.symptoms
  where source_vocabulary is not null or source_code is not null;
  if v_bad is not null then
    raise exception 'CHECK 18 FAILED: source code columns are set in: %', v_bad;
  end if;

  -- collate "C": byte order, independent of the database locale, so the fingerprint is the same locally and in CI.
  select md5(string_agg(key || '|' || name || '|' || category || '|' || sort_order, ',' order by key collate "C"))
    into v_hash
  from public.symptoms;
  if v_hash <> '35ab98f0081e6a6ec777b51cbc7537ce' then
    raise exception 'CHECK 18 FAILED: symptom content differs from the approved list (fingerprint %)', v_hash;
  end if;

  select md5(string_agg(s.key || '|' || t.term, ',' order by s.key collate "C", t.term collate "C"))
    into v_hash
  from public.symptom_search_terms t
  join public.symptoms s on s.id = t.symptom_id;
  if v_hash <> 'a5f672cb87a97e4578eb812cca6883bd' then
    raise exception 'CHECK 18 FAILED: search terms differ from the approved list (fingerprint %)', v_hash;
  end if;

  raise notice 'CHECK 18 OK: % symptoms in the approved category split 8/7/3/3/3/3/2/5, % search terms, every symptom has a term, sort_order 1..n per category, source code columns empty, content fingerprints match',
    v_symptoms, v_terms;
end;
$$;

-- ---------------------------------------------------------------------------
-- Check 17: symptoms and symptom_search_terms constraints
-- ---------------------------------------------------------------------------
-- Each rejection must come from the named error AND the expected constraint.
-- Measured before asserting: category, key shape, name shape, sort_order, source code shape, half-filled source code,
-- term shape -> 23514 check_violation; duplicate key, duplicate name in any letter case, duplicate term,
-- duplicate (category, sort_order) -> 23505 unique_violation; key change -> P0001 from symptoms_guard_key.
-- symptoms_category_sort_order_key is deferred to commit and this script ends in rollback, so the duplicate
-- position is forced with "set constraints ... immediate" and the mode is set back to deferred right after.
-- Synthetic keys check_17_*; sort_order 901+ stays clear of the real list.

do $$
declare
  v_constraint text;
  v_symptom_a uuid;
  v_symptom_b uuid;
  v_message text;
  v_case record;
begin
  -- 17-0: the position constraint is deferred to commit, not only deferrable. 17e and 17f pass under
  -- "deferrable initially immediate" too, so the mode is read from the catalog.
  if not exists (
    select 1 from pg_constraint
     where conname = 'symptoms_category_sort_order_key'
       and conrelid = 'public.symptoms'::regclass
       and condeferrable and condeferred
  ) then
    raise exception 'CHECK 17 FAILED: symptoms_category_sort_order_key is not deferrable initially deferred';
  end if;

  insert into public.symptoms (key, name, category, sort_order)
  values ('check_17_a', 'Check 17 symptom A', 'other', 901)
  returning id into v_symptom_a;

  insert into public.symptoms (key, name, category, sort_order)
  values ('check_17_b', 'Check 17 symptom B', 'other', 902)
  returning id into v_symptom_b;

  -- 17a: unknown category
  v_constraint := null;
  begin
    insert into public.symptoms (key, name, category, sort_order)
    values ('check_17_c', 'Check 17 symptom C', 'cardiac', 901);
  exception when check_violation then
    get stacked diagnostics v_constraint = constraint_name;
  end;
  if v_constraint is distinct from 'symptoms_category_check' then
    raise exception 'CHECK 17 FAILED: unknown category was not rejected by symptoms_category_check (got %)', v_constraint;
  end if;

  -- 17b: key with an upper case letter
  v_constraint := null;
  begin
    insert into public.symptoms (key, name, category, sort_order)
    values ('Check_17_c', 'Check 17 symptom C', 'other', 903);
  exception when check_violation then
    get stacked diagnostics v_constraint = constraint_name;
  end;
  if v_constraint is distinct from 'symptoms_key_check' then
    raise exception 'CHECK 17 FAILED: key with an upper case letter was not rejected by symptoms_key_check (got %)', v_constraint;
  end if;

  -- 17c: vocabulary without a code
  v_constraint := null;
  begin
    insert into public.symptoms (key, name, category, sort_order, source_vocabulary, source_code)
    values ('check_17_c', 'Check 17 symptom C', 'other', 903, 'MedDRA', null);
  exception when check_violation then
    get stacked diagnostics v_constraint = constraint_name;
  end;
  if v_constraint is distinct from 'symptoms_source_pair_check' then
    raise exception 'CHECK 17 FAILED: half-filled source code was not rejected by symptoms_source_pair_check (got %)', v_constraint;
  end if;

  -- 17d: duplicate key
  v_constraint := null;
  begin
    insert into public.symptoms (key, name, category, sort_order)
    values ('check_17_a', 'Check 17 symptom C', 'other', 903);
  exception when unique_violation then
    get stacked diagnostics v_constraint = constraint_name;
  end;
  if v_constraint is distinct from 'symptoms_key_key' then
    raise exception 'CHECK 17 FAILED: duplicate key was not rejected by symptoms_key_key (got %)', v_constraint;
  end if;

  -- 17e: duplicate (category, sort_order), checked when the deferred constraint is forced
  v_constraint := null;
  begin
    insert into public.symptoms (key, name, category, sort_order)
    values ('check_17_c', 'Check 17 symptom C', 'other', 901);
    set constraints public.symptoms_category_sort_order_key immediate;
  exception when unique_violation then
    get stacked diagnostics v_constraint = constraint_name;
  end;
  set constraints public.symptoms_category_sort_order_key deferred;
  if v_constraint is distinct from 'symptoms_category_sort_order_key' then
    raise exception 'CHECK 17 FAILED: duplicate position in a category was not rejected by symptoms_category_sort_order_key (got %)', v_constraint;
  end if;

  -- 17f: swapping the positions of two symptoms in one update passes the forced check
  update public.symptoms
     set sort_order = case key when 'check_17_a' then 902 else 901 end
   where key in ('check_17_a', 'check_17_b');
  set constraints public.symptoms_category_sort_order_key immediate;
  set constraints public.symptoms_category_sort_order_key deferred;
  if (select sort_order from public.symptoms where key = 'check_17_a') is distinct from 902::smallint then
    raise exception 'CHECK 17 FAILED: swapped position of check_17_a was not saved';
  end if;

  -- 17g: a valid symptom takes two terms
  insert into public.symptom_search_terms (symptom_id, term)
  values (v_symptom_a, 'check term one'), (v_symptom_a, 'check term two');

  -- 17h: term with an upper case letter
  v_constraint := null;
  begin
    insert into public.symptom_search_terms (symptom_id, term)
    values (v_symptom_a, 'Check term three');
  exception when check_violation then
    get stacked diagnostics v_constraint = constraint_name;
  end;
  if v_constraint is distinct from 'symptom_search_terms_term_check' then
    raise exception 'CHECK 17 FAILED: term with an upper case letter was not rejected by symptom_search_terms_term_check (got %)', v_constraint;
  end if;

  -- 17i: term with a leading space
  v_constraint := null;
  begin
    insert into public.symptom_search_terms (symptom_id, term)
    values (v_symptom_a, ' check term three');
  exception when check_violation then
    get stacked diagnostics v_constraint = constraint_name;
  end;
  if v_constraint is distinct from 'symptom_search_terms_term_check' then
    raise exception 'CHECK 17 FAILED: term with a leading space was not rejected by symptom_search_terms_term_check (got %)', v_constraint;
  end if;

  -- 17j: the same term twice for one symptom
  v_constraint := null;
  begin
    insert into public.symptom_search_terms (symptom_id, term)
    values (v_symptom_a, 'check term one');
  exception when unique_violation then
    get stacked diagnostics v_constraint = constraint_name;
  end;
  if v_constraint is distinct from 'symptom_search_terms_symptom_id_term_key' then
    raise exception 'CHECK 17 FAILED: duplicate term for one symptom was not rejected by symptom_search_terms_symptom_id_term_key (got %)', v_constraint;
  end if;

  -- 17k: the same term for a different symptom is allowed
  insert into public.symptom_search_terms (symptom_id, term)
  values (v_symptom_b, 'check term one');

  if (select count(*) from public.symptom_search_terms where symptom_id in (v_symptom_a, v_symptom_b)) <> 3 then
    raise exception 'CHECK 17 FAILED: expected 3 test terms, the valid inserts did not all land';
  end if;

  -- 17l: shapes rejected by a check constraint; each case names the constraint that must fire
  for v_case in
    select * from (values
      ('empty name',
       $q$insert into public.symptoms (key, name, category, sort_order) values ('check_17_c', '', 'other', 903)$q$,
       'symptoms_name_check'),
      ('name with a trailing space',
       $q$insert into public.symptoms (key, name, category, sort_order) values ('check_17_c', 'Check 17 symptom C ', 'other', 903)$q$,
       'symptoms_name_check'),
      ('sort_order 0',
       $q$insert into public.symptoms (key, name, category, sort_order) values ('check_17_c', 'Check 17 symptom C', 'other', 0)$q$,
       'symptoms_sort_order_check'),
      ('blank source_vocabulary',
       $q$insert into public.symptoms (key, name, category, sort_order, source_vocabulary, source_code) values ('check_17_c', 'Check 17 symptom C', 'other', 903, '  ', '10019211')$q$,
       'symptoms_source_vocabulary_check'),
      ('blank source_code',
       $q$insert into public.symptoms (key, name, category, sort_order, source_vocabulary, source_code) values ('check_17_c', 'Check 17 symptom C', 'other', 903, 'MedDRA', '  ')$q$,
       'symptoms_source_code_check'),
      ('code without a vocabulary',
       $q$insert into public.symptoms (key, name, category, sort_order, source_vocabulary, source_code) values ('check_17_c', 'Check 17 symptom C', 'other', 903, null, '10019211')$q$,
       'symptoms_source_pair_check'),
      ('empty term',
       format($q$insert into public.symptom_search_terms (symptom_id, term) values (%L, '')$q$, v_symptom_a),
       'symptom_search_terms_term_check'),
      ('term with a trailing space',
       format($q$insert into public.symptom_search_terms (symptom_id, term) values (%L, 'check term three ')$q$, v_symptom_a),
       'symptom_search_terms_term_check'),
      ('term with a double space',
       format($q$insert into public.symptom_search_terms (symptom_id, term) values (%L, 'check  term three')$q$, v_symptom_a),
       'symptom_search_terms_term_check'),
      ('term with a tab',
       format($q$insert into public.symptom_search_terms (symptom_id, term) values (%L, E'check\tterm three')$q$, v_symptom_a),
       'symptom_search_terms_term_check'),
      ('term with a non-breaking space',
       format($q$insert into public.symptom_search_terms (symptom_id, term) values (%L, E'check\u00a0term three')$q$, v_symptom_a),
       'symptom_search_terms_term_check'),
      ('term in decomposed Unicode (NFD)',
       format($q$insert into public.symptom_search_terms (symptom_id, term) values (%L, normalize('ból', NFD))$q$, v_symptom_a),
       'symptom_search_terms_term_check')
    ) as t(label, statement, expected)
  loop
    v_constraint := null;
    begin
      execute v_case.statement;
    exception when check_violation then
      get stacked diagnostics v_constraint = constraint_name;
    end;
    if v_constraint is distinct from v_case.expected then
      raise exception 'CHECK 17 FAILED: % was not rejected by % (got %)', v_case.label, v_case.expected, v_constraint;
    end if;
  end loop;

  -- 17m: the same name in a different letter case
  v_constraint := null;
  begin
    insert into public.symptoms (key, name, category, sort_order)
    values ('check_17_c', 'check 17 SYMPTOM a', 'other', 903);
  exception when unique_violation then
    get stacked diagnostics v_constraint = constraint_name;
  end;
  if v_constraint is distinct from 'symptoms_name_lower_key' then
    raise exception 'CHECK 17 FAILED: name differing only in letter case was not rejected by symptoms_name_lower_key (got %)', v_constraint;
  end if;

  -- 17n: a key is never changed after load
  v_message := null;
  begin
    update public.symptoms set key = 'check_17_renamed' where id = v_symptom_a;
  exception when sqlstate 'P0001' then
    get stacked diagnostics v_message = message_text;
  end;
  if v_message is null or v_message not like 'Cannot change symptoms.key%' then
    raise exception 'CHECK 17 FAILED: key change was not rejected by symptoms_guard_key (got %)', v_message;
  end if;

  -- 17o: deleting a symptom removes its terms (cascade on shared data only)
  delete from public.symptoms where id = v_symptom_b;
  if exists (select 1 from public.symptom_search_terms where symptom_id = v_symptom_b) then
    raise exception 'CHECK 17 FAILED: terms of a deleted symptom were left behind';
  end if;

  raise notice 'CHECK 17 OK: position constraint deferred at commit; bad category, key, name, sort_order, source code and term shapes (edge spaces, tab, non-breaking space, double space, NFD) and duplicates (key, name in any case, position, term) rejected by their constraints; key change blocked; terms cascade with their symptom; valid symptom with two terms, shared term and position swap accepted';
end;
$$;

do $$
declare
  v_before text;
  v_now text;
begin
  select fingerprint into v_before from rls_checks_window_fingerprint;
  v_now := md5(pg_get_functiondef('public.medication_correction_window_open(uuid)'::regprocedure));
  if v_before is null or v_now is distinct from v_before then
    raise exception 'FINAL CHECK FAILED: correction window function differs from migration state (fingerprint before %, now %)',
      v_before, v_now;
  end if;
  select period_fingerprint into v_before from rls_checks_window_fingerprint;
  v_now := md5(pg_get_functiondef('public.dosage_period_correction_window_open(uuid)'::regprocedure));
  if v_before is null or v_now is distinct from v_before then
    raise exception 'FINAL CHECK FAILED: dosage period correction window function differs from migration state (fingerprint before %, now %)',
      v_before, v_now;
  end if;
  raise notice 'WSZYSTKIE SPRAWDZENIA PRZESZŁY — baza wraca do stanu sprzed skryptu (rollback)';
end;
$$;

-- Completion marker for scripts/db-checks.mjs: printed only after the final check above has passed.
do $$
begin
  raise notice 'GATE_COMPLETE rls_checks';
end;
$$;

rollback;
