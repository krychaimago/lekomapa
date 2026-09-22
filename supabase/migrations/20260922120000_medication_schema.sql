-- Migracja: schemat leków użytkowniczki, składu preparatu i okresów dawkowania.
-- Zakres: F-01 (roadmapa). Tabele, RLS z politykami per-operacja i per-rola,
-- ograniczenie przeciw nakładkom okresów, wyzwalacze chroniące rdzeń wpisu.
--
-- RLS włączone jest w tej samej migracji, w której powstają tabele. Dołożone
-- później zostawiłoby okno, w którym dane zdrowotne leżą bez izolacji per-konto,
-- a przy jednym koncie testowym nic by tego nie ujawniło.

-- btree_gist musi istnieć przed definicją dosage_periods: ograniczenie wykluczające
-- zestawia równość uuid (btree) z przecięciem zakresu dat (gist) w jednym indeksie.
create extension if not exists btree_gist;

-- ---------------------------------------------------------------------------
-- 1. Lek użytkowniczki
-- ---------------------------------------------------------------------------

create table public.medications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  -- nazwa handlowa wpisana przez użytkowniczkę, etykieta pozycji na liście
  product_name text not null,
  composition_source text not null
    constraint medications_composition_source_check
    check (composition_source in ('registry', 'leaflet')),
  -- bez klucza obcego celowo: tabela rejestru leków powstaje dopiero w F-02,
  -- która dołoży powiązanie osobną migracją. F-01 nie może od niej zależeć.
  registry_medication_id uuid,
  -- wypełniona data oznacza lek zakończony, nie usunięty — historia zostaje
  discontinued_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index medications_user_id_idx on public.medications (user_id);

comment on table public.medications is
  'Preparat przyjmowany przez użytkowniczkę. Zakończenie leku to data w discontinued_on, nie usunięcie wiersza.';
comment on column public.medications.registry_medication_id is
  'Notatka o pochodzeniu składu z rejestru leków. Klucz obcy dokłada migracja z F-02.';

-- ---------------------------------------------------------------------------
-- 2. Skład leku
-- ---------------------------------------------------------------------------

create table public.medication_substances (
  id uuid primary key default gen_random_uuid(),
  medication_id uuid not null references public.medications (id) on delete cascade,
  substance_name text not null,
  -- pełny kod ATC ze źródła, nigdy obcinany do grupy: reguły siedzą na grupach,
  -- a dopasowanie idzie po przedrostku. Obcięcie przy zapisie wyrzuciłoby dane,
  -- które produkt miał w ręku.
  atc_code text not null
    constraint medication_substances_atc_code_check
    -- luźna kontrola kształtu: dopuszcza każdy poziom klasyfikacji ATC (A01,
    -- A01A, A01AB, A01AB02), bo ulotka nie zawsze daje pełne siedem znaków
    check (atc_code ~ '^[A-Z][0-9]{2}([A-Z]([A-Z]([0-9]{2})?)?)?$'),
  constraint medication_substances_medication_id_atc_code_key
    unique (medication_id, atc_code)
);

create index medication_substances_medication_id_idx
  on public.medication_substances (medication_id);

comment on table public.medication_substances is
  'Pełny skład preparatu. Zapisywane są wszystkie substancje czynne ze źródła, także spoza grup objętych regułami.';

-- ---------------------------------------------------------------------------
-- 3. Okresy dawkowania
-- ---------------------------------------------------------------------------

create table public.dosage_periods (
  id uuid primary key default gen_random_uuid(),
  medication_id uuid not null references public.medications (id) on delete cascade,
  -- dawkowanie własnymi słowami użytkowniczki
  dose_text text not null,
  started_on date not null,
  -- pusta wartość oznacza okres trwający
  ended_on date,
  -- kolumna wyliczana i przechowywana, żeby ograniczenie wykluczające miało
  -- na czym pracować; okres domknięty z lewej, otwarty z prawej
  period daterange generated always as (daterange(started_on, ended_on, '[)')) stored,
  created_at timestamptz not null default now(),
  -- Data zakończenia musi być późniejsza niż data rozpoczęcia, nie równa:
  -- daterange(d, d, '[)') jest pusty, a pusty zakres nie przecina się z niczym
  -- operatorem &&, więc ograniczenie wykluczające poniżej by go nie zauważyło
  -- i wpuściło okres zerowej długości w środek okresu trwającego. Okres
  -- jednodniowy zapisuje się jako started_on = d, ended_on = d + 1.
  constraint dosage_periods_dates_check
    check (ended_on is null or ended_on > started_on),
  -- dwa okresy tego samego leku nie mogą się nakładać: historia dawkowania
  -- to ciąg okresów, a nie zbiór wpisów, które mogą mówić dwie rzeczy naraz
  constraint dosage_periods_no_overlap
    exclude using gist (medication_id with =, period with &&)
);

create index dosage_periods_medication_id_idx
  on public.dosage_periods (medication_id);

comment on table public.dosage_periods is
  'Historia dawkowania jako ciąg okresów od–do. Zmiana dawki zamyka bieżący okres i otwiera nowy, zamiast nadpisywać poprzedni.';

-- ---------------------------------------------------------------------------
-- 4. RLS i polityki (12 polityk: 4 operacje × 3 tabele, wyłącznie dla authenticated)
-- ---------------------------------------------------------------------------

alter table public.medications enable row level security;
alter table public.medication_substances enable row level security;
alter table public.dosage_periods enable row level security;

-- Dla roli anon nie powstaje żadna polityka — przy włączonym RLS oznacza to
-- brak dostępu do wierszy bez sesji.

create policy medications_select_authenticated on public.medications
  for select to authenticated
  using (user_id = auth.uid());

create policy medications_insert_authenticated on public.medications
  for insert to authenticated
  with check (user_id = auth.uid());

create policy medications_update_authenticated on public.medications
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy medications_delete_authenticated on public.medications
  for delete to authenticated
  using (user_id = auth.uid());

-- Tabele podrzędne nie mają własnej kolumny właściciela: duplikowanie user_id
-- dawałoby dwa źródła prawdy o właścicielu i możliwość ich rozjechania.
-- Przynależność sprawdzana jest przez lek nadrzędny.

create policy medication_substances_select_authenticated on public.medication_substances
  for select to authenticated
  using (
    exists (
      select 1 from public.medications m
      where m.id = medication_id and m.user_id = auth.uid()
    )
  );

create policy medication_substances_insert_authenticated on public.medication_substances
  for insert to authenticated
  with check (
    exists (
      select 1 from public.medications m
      where m.id = medication_id and m.user_id = auth.uid()
    )
  );

create policy medication_substances_update_authenticated on public.medication_substances
  for update to authenticated
  using (
    exists (
      select 1 from public.medications m
      where m.id = medication_id and m.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.medications m
      where m.id = medication_id and m.user_id = auth.uid()
    )
  );

create policy medication_substances_delete_authenticated on public.medication_substances
  for delete to authenticated
  using (
    exists (
      select 1 from public.medications m
      where m.id = medication_id and m.user_id = auth.uid()
    )
  );

create policy dosage_periods_select_authenticated on public.dosage_periods
  for select to authenticated
  using (
    exists (
      select 1 from public.medications m
      where m.id = medication_id and m.user_id = auth.uid()
    )
  );

create policy dosage_periods_insert_authenticated on public.dosage_periods
  for insert to authenticated
  with check (
    exists (
      select 1 from public.medications m
      where m.id = medication_id and m.user_id = auth.uid()
    )
  );

create policy dosage_periods_update_authenticated on public.dosage_periods
  for update to authenticated
  using (
    exists (
      select 1 from public.medications m
      where m.id = medication_id and m.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.medications m
      where m.id = medication_id and m.user_id = auth.uid()
    )
  );

create policy dosage_periods_delete_authenticated on public.dosage_periods
  for delete to authenticated
  using (
    exists (
      select 1 from public.medications m
      where m.id = medication_id and m.user_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- 5. Okno korekty
-- ---------------------------------------------------------------------------

create or replace function public.medication_correction_window_open(p_medication_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  -- F-01: tabela dzienniczka objawów jeszcze nie istnieje, więc warunek
  -- „nie ma wpisu objawu po dacie rozpoczęcia" jest spełniony z definicji.
  -- Parametr jest przyjmowany już teraz, żeby podmiana treści w S-05 nie
  -- wymagała zmiany sygnatury ani wyzwalaczy, które tę funkcję wołają.
  return true;
end;
$$;

comment on function public.medication_correction_window_open(uuid) is
  'ZAŚLEPKA Z TERMINEM — nie usuwać jako martwy kod. W F-01 zawsze zwraca true, bo tabela wpisów dzienniczka jeszcze nie istnieje. Migracja z S-05 podmienia treść tej funkcji na sprawdzenie, czy dla danego leku istnieje wpis objawu po dacie rozpoczęcia; wyzwalacze niemodyfikowalności na medication_substances i dosage_periods pytają wyłącznie tę funkcję. security definer, bo w S-05 funkcja będzie czytała tabelę chronioną RLS z wnętrza wyzwalacza.';

-- security definer bez ograniczenia uprawnień dałoby w S-05 wyrocznię: funkcja
-- będzie wtedy czytała wpisy dzienniczka prawami właściciela, więc każdy, kto
-- może ją wywołać, dowiedziałby się po samym medication_id, czy dla cudzego
-- leku istnieje wpis objawu. Wyzwalacze wołają ją jako własny definer, więc
-- odebranie praw roli public ich nie dotyczy.
revoke execute on function public.medication_correction_window_open(uuid) from public;
grant execute on function public.medication_correction_window_open(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Wyzwalacze niemodyfikowalności rdzenia wpisu
-- ---------------------------------------------------------------------------

create or replace function public.medication_substances_guard_core()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- medication_id należy do rdzenia wpisu tak samo jak nazwa substancji:
  -- przepięcie wiersza pod inny lek przepisuje historię obu leków naraz,
  -- nie ruszając żadnego z pozostałych pól.
  if new.substance_name is distinct from old.substance_name
     or new.atc_code is distinct from old.atc_code
     or new.medication_id is distinct from old.medication_id then
    if not public.medication_correction_window_open(old.medication_id) then
      raise exception
        'Nie można zmienić pola substance_name, atc_code ani medication_id: okno korekty dla tego leku jest już zamknięte, a skład zapisany przy leku jest częścią historii. Aby odnotować inny skład, zakończ tę pozycję datą odstawienia i dodaj nową.';
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.dosage_periods_guard_core()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.medication_correction_window_open(old.medication_id) then
    if new.dose_text is distinct from old.dose_text then
      raise exception
        'Nie można zmienić pola dose_text: okno korekty jest już zamknięte, a zmiana dawkowania zamyka bieżący okres i otwiera nowy, zamiast nadpisywać poprzedni.';
    end if;

    if new.started_on is distinct from old.started_on then
      raise exception
        'Nie można zmienić pola started_on: okno korekty jest już zamknięte, a data rozpoczęcia okresu jest częścią historii dawkowania.';
    end if;

    -- Przepięcie okresu pod inny lek przepisuje historię obu leków naraz,
    -- nie ruszając żadnego z pozostałych pól — to też jest zmiana rdzenia.
    if new.medication_id is distinct from old.medication_id then
      raise exception
        'Nie można zmienić pola medication_id: okno korekty jest już zamknięte, a przypisanie okresu dawkowania do leku jest częścią historii.';
    end if;

    -- Ustawienie ended_on z pustej wartości na datę przechodzi zawsze: na tym
    -- polega zamknięcie okresu przy zmianie dawki i przy odstawieniu leku.
    -- Blokowana jest wyłącznie podmiana już ustawionej daty końca.
    if old.ended_on is not null and new.ended_on is distinct from old.ended_on then
      raise exception
        'Nie można zmienić pola ended_on: okno korekty jest już zamknięte, a ten okres ma datę końca zapisaną w historii.';
    end if;
  end if;

  return new;
end;
$$;

-- Bez wyzwalaczy przy usuwaniu ochrona rdzenia byłaby pozorna: wiersza nie dałoby
-- się zmienić, ale dałoby się go skasować i zapisać od nowa z inną treścią.
--
-- Rozpoznanie kasowania kaskadowego: kaskada z medications wykonuje się dopiero
-- po usunięciu wiersza nadrzędnego, więc brak wiersza w medications w momencie
-- usuwania wiersza podrzędnego oznacza, że kasowany jest cały lek (albo całe
-- konto w S-09) — takie usunięcie musi przejść.

create or replace function public.medication_substances_guard_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.medications m where m.id = old.medication_id) then
    return old;
  end if;

  if not public.medication_correction_window_open(old.medication_id) then
    raise exception
      'Nie można usunąć wpisu składu leku: okno korekty jest już zamknięte, a ten wpis należy do historii. Aby zakończyć przyjmowanie leku, użyj daty odstawienia.';
  end if;

  return old;
end;
$$;

create or replace function public.dosage_periods_guard_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.medications m where m.id = old.medication_id) then
    return old;
  end if;

  if not public.medication_correction_window_open(old.medication_id) then
    raise exception
      'Nie można usunąć okresu dawkowania: okno korekty jest już zamknięte, a ten okres należy do historii. Zakończenie okresu zapisuje się datą w polu ended_on.';
  end if;

  return old;
end;
$$;

-- Guard usunięcia leku. Ta sama zasada co na tabelach podrzędnych: usunięcie
-- pozycji dodanej przez pomyłkę przechodzi, dopóki okno korekty jest otwarte
-- (FR-005). Po jego zamknięciu lek tłumaczy już zapisane objawy i zamiast
-- usunięcia służy data odstawienia.
--
-- Rozpoznanie kaskady z auth.users: usunięcie konta (S-09) kasuje wiersz
-- użytkownika przed kaskadą do medications, więc brak wiersza w auth.users
-- oznacza kasowanie konta — takie usunięcie musi przejść.

create or replace function public.medications_guard_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from auth.users u where u.id = old.user_id) then
    return old;
  end if;

  if not public.medication_correction_window_open(old.id) then
    raise exception
      'Nie można usunąć leku: okno korekty jest już zamknięte, a ten lek tłumaczy zapisane wcześniej objawy. Aby zakończyć jego przyjmowanie, użyj daty odstawienia (discontinued_on).';
  end if;

  return old;
end;
$$;

create trigger medications_guard_delete
  before delete on public.medications
  for each row execute function public.medications_guard_delete();

create trigger medication_substances_guard_core
  before update on public.medication_substances
  for each row execute function public.medication_substances_guard_core();

create trigger medication_substances_guard_delete
  before delete on public.medication_substances
  for each row execute function public.medication_substances_guard_delete();

create trigger dosage_periods_guard_core
  before update on public.dosage_periods
  for each row execute function public.dosage_periods_guard_core();

create trigger dosage_periods_guard_delete
  before delete on public.dosage_periods
  for each row execute function public.dosage_periods_guard_delete();

-- ---------------------------------------------------------------------------
-- 7. updated_at
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

comment on function public.set_updated_at() is
  'Podnosi updated_at przy każdej zmianie wiersza. Bez tego kolumna zostałaby na zawsze równa created_at i kłamałaby o dacie ostatniej zmiany.';

create trigger medications_set_updated_at
  before update on public.medications
  for each row execute function public.set_updated_at();
