-- Sprawdzenia schematu leków: RLS, polityki, ograniczenia i wyzwalacze.
--
-- Uruchomienie (Supabase CLI nie wykonuje SQL, psql nie jest zależnością repozytorium,
-- więc plik idzie do kontenera bazy podniesionego przez `npx supabase start`):
--
--   docker exec -i $(docker ps -qf name=supabase_db) psql -U postgres -d postgres -f - < supabase/tests/rls_checks.sql
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
-- Okno korekty zamknięte — podmiana treści funkcji na czas kolejnych sprawdzeń.
-- Oryginalna treść wraca niżej, a rollback na końcu skryptu domyka sprawę.
-- ---------------------------------------------------------------------------

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

-- ---------------------------------------------------------------------------
-- Sprawdzenie 5: przy zamkniętym oknie rdzeń wpisu jest niemodyfikowalny,
-- ale zamknięcie trwającego okresu przechodzi
-- ---------------------------------------------------------------------------

do $$
declare
  v_blocked boolean;
begin
  -- 5a: zmiana substancji czynnej
  v_blocked := false;
  begin
    update public.medication_substances
       set substance_name = 'Podmieniona substancja'
     where id = '00000000-0000-4000-8000-000000000003';
  exception when sqlstate 'P0001' then v_blocked := true;
  end;
  if not v_blocked then
    raise exception 'SPRAWDZENIE 5 NIEUDANE: zmiana substance_name przeszła przy zamkniętym oknie korekty';
  end if;

  -- 5b: zmiana dawki
  v_blocked := false;
  begin
    update public.dosage_periods
       set dose_text = 'inna dawka'
     where id = '00000000-0000-4000-8000-000000000004';
  exception when sqlstate 'P0001' then v_blocked := true;
  end;
  if not v_blocked then
    raise exception 'SPRAWDZENIE 5 NIEUDANE: zmiana dose_text przeszła przy zamkniętym oknie korekty';
  end if;

  -- 5c: zmiana daty rozpoczęcia
  v_blocked := false;
  begin
    update public.dosage_periods
       set started_on = date '2026-03-01'
     where id = '00000000-0000-4000-8000-000000000004';
  exception when sqlstate 'P0001' then v_blocked := true;
  end;
  if not v_blocked then
    raise exception 'SPRAWDZENIE 5 NIEUDANE: zmiana started_on przeszła przy zamkniętym oknie korekty';
  end if;

  -- 5d: zamknięcie trwającego okresu musi przejść zawsze
  update public.dosage_periods
     set ended_on = date '2026-06-01'
   where id = '00000000-0000-4000-8000-000000000004';

  if (select ended_on from public.dosage_periods where id = '00000000-0000-4000-8000-000000000004')
     is distinct from date '2026-06-01' then
    raise exception 'SPRAWDZENIE 5 NIEUDANE: zamknięcie okresu datą końca nie zapisało się';
  end if;

  -- 5e: podmiana już ustawionej daty końca jest blokowana
  v_blocked := false;
  begin
    update public.dosage_periods
       set ended_on = date '2026-07-01'
     where id = '00000000-0000-4000-8000-000000000004';
  exception when sqlstate 'P0001' then v_blocked := true;
  end;
  if not v_blocked then
    raise exception 'SPRAWDZENIE 5 NIEUDANE: podmiana ustawionej daty ended_on przeszła przy zamkniętym oknie korekty';
  end if;

  -- 5f: przepięcie wiersza podrzędnego pod inny własny lek. Żadne z chronionych
  -- pól się nie zmienia, a historia obu leków owszem.
  v_blocked := false;
  begin
    update public.dosage_periods
       set medication_id = '00000000-0000-4000-8000-000000000005'
     where id = '00000000-0000-4000-8000-000000000004';
  exception when sqlstate 'P0001' then v_blocked := true;
  end;
  if not v_blocked then
    raise exception 'SPRAWDZENIE 5 NIEUDANE: przepięcie okresu pod inny lek przeszło przy zamkniętym oknie korekty';
  end if;

  v_blocked := false;
  begin
    update public.medication_substances
       set medication_id = '00000000-0000-4000-8000-000000000005'
     where id = '00000000-0000-4000-8000-000000000003';
  exception when sqlstate 'P0001' then v_blocked := true;
  end;
  if not v_blocked then
    raise exception 'SPRAWDZENIE 5 NIEUDANE: przepięcie składu pod inny lek przeszło przy zamkniętym oknie korekty';
  end if;

  raise notice 'SPRAWDZENIE 5 OK: rdzeń wpisu niemodyfikowalny wraz z medication_id, zamknięcie trwającego okresu przechodzi';
end;
$$;

-- ---------------------------------------------------------------------------
-- Sprawdzenie 6: przy zamkniętym oknie usunięcie wiersza podrzędnego jest blokowane
-- ---------------------------------------------------------------------------

do $$
declare
  v_blocked boolean;
begin
  v_blocked := false;
  begin
    delete from public.medication_substances
     where id = '00000000-0000-4000-8000-000000000003';
  exception when sqlstate 'P0001' then v_blocked := true;
  end;
  if not v_blocked then
    raise exception 'SPRAWDZENIE 6 NIEUDANE: usunięcie wiersza składu przeszło przy zamkniętym oknie korekty';
  end if;

  v_blocked := false;
  begin
    delete from public.dosage_periods
     where id = '00000000-0000-4000-8000-000000000004';
  exception when sqlstate 'P0001' then v_blocked := true;
  end;
  if not v_blocked then
    raise exception 'SPRAWDZENIE 6 NIEUDANE: usunięcie okresu dawkowania przeszło przy zamkniętym oknie korekty';
  end if;

  raise notice 'SPRAWDZENIE 6 OK: przy zamkniętym oknie korekty wierszy podrzędnych nie da się usunąć';
end;
$$;

-- ---------------------------------------------------------------------------
-- Sprawdzenie 7: przy zamkniętym oknie korekty usunięcie leku pada
-- ---------------------------------------------------------------------------

do $$
declare
  v_blocked boolean := false;
begin
  begin
    delete from public.medications where id = '00000000-0000-4000-8000-000000000002';
  exception
    when sqlstate 'P0001' then
      v_blocked := true;
  end;

  if not v_blocked then
    raise exception 'SPRAWDZENIE 7 NIEUDANE: usunięcie leku przy zamkniętym oknie korekty przeszło — historia dawkowania da się wymazać';
  end if;

  raise notice 'SPRAWDZENIE 7 OK: przy zamkniętym oknie korekty leku nie da się usunąć';
end;
$$;

-- ---------------------------------------------------------------------------
-- Przywrócenie oryginalnej treści funkcji okna korekty
-- ---------------------------------------------------------------------------

create or replace function public.medication_correction_window_open(p_medication_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  return true;
end;
$$;

-- ---------------------------------------------------------------------------
-- Sprawdzenie 8: przy otwartym oknie korekty usunięcie leku przechodzi wraz z kaskadą
-- ---------------------------------------------------------------------------

do $$
begin
  delete from public.medications where id = '00000000-0000-4000-8000-000000000002';

  if exists (select 1 from public.medications where id = '00000000-0000-4000-8000-000000000002')
     or exists (select 1 from public.medication_substances where medication_id = '00000000-0000-4000-8000-000000000002')
     or exists (select 1 from public.dosage_periods where medication_id = '00000000-0000-4000-8000-000000000002') then
    raise exception 'SPRAWDZENIE 8 NIEUDANE: kaskadowe usunięcie leku nie usunęło wszystkich wierszy podrzędnych';
  end if;

  raise notice 'SPRAWDZENIE 8 OK: przy otwartym oknie korekty usunięcie pomyłki przechodzi wraz z kaskadą';
end;
$$;

do $$
begin
  if not public.medication_correction_window_open('00000000-0000-4000-8000-000000000002') then
    raise exception 'SPRAWDZENIE KOŃCOWE NIEUDANE: funkcja okna korekty nie wróciła do stanu z migracji';
  end if;
  raise notice 'WSZYSTKIE SPRAWDZENIA PRZESZŁY — baza wraca do stanu sprzed skryptu (rollback)';
end;
$$;

rollback;
