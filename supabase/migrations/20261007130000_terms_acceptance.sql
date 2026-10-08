-- Migration: S-01 phase 1 — versions of the terms of use and the append-only history of their acceptance.
--
-- What this migration makes possible, in plain terms, with an example for each part.
-- Technical names are in brackets, for whoever needs to find them in the code below.
--
-- A. VERSIONS OF THE TERMS (terms_versions)
--      - One row per published version of the terms of use. Version 1 ("prototyp") is inserted here.
--      - The text of each version lives in the code (src/lib/copy/terms.ts) and in context/foundation/; the table
--        only says which version numbers exist, so an acceptance can only point at a real version.
--      - Shared, read-only: everyone may read it, nobody writes it through the API.
--
-- B. ACCEPTANCES (terms_acceptances)
--    Example: on 2026-10-20 at 21:14 Anna creates an account with the box "Akceptuję warunki korzystania" ticked.
--      - One row: whose account, which version (1), when (2026-10-20 21:14, the moment the account was created).
--      - One version is one fact in the history: the same account cannot accept the same version twice
--        (double click, two tabs), so no second row appears that could never be removed.
--      - The row is history: nobody can change it or delete it, also not the owner. It disappears only together
--        with the whole account (on delete cascade).
--      - accepted_at is always set by the database, so a client cannot backdate an acceptance.
--      - Each account sees only its own rows (RLS in this same migration, four policies, only for signed-in
--        accounts; update and delete are policies that let nothing through).
--
-- C. ACCEPTANCE WRITTEN WHEN THE ACCOUNT IS CREATED (record_terms_acceptance_on_signup)
--      - In production the signup does not open a session until the e-mail address is confirmed, so the
--        application cannot write the acceptance with the user's own session. The signup form passes the accepted
--        version in the account metadata (raw_user_meta_data.terms_version) and the database writes the row when
--        the account row is inserted.
--      - A missing, non-numeric or unknown version writes nothing and raises nothing: an error here would make the
--        signup itself fail. The version gate in the application sends such an account to the acceptance screen.

-- ---------------------------------------------------------------------------
-- 1. Versions of the terms
-- ---------------------------------------------------------------------------

create table public.terms_versions (
  version smallint primary key
    constraint terms_versions_version_check check (version > 0),
  created_at timestamptz not null default now()
);

comment on table public.terms_versions is
  'Published versions of the terms of use. Only the numbers live here; the text of each version is in src/lib/copy/terms.ts and context/foundation/terms-of-use-v<N>.md. Shared and read-only through the API.';

insert into public.terms_versions (version) values (1);

alter table public.terms_versions enable row level security;

create policy terms_versions_select_all on public.terms_versions
  for select to authenticated, anon
  using (true);

-- Second layer: RLS without a write policy already blocks writes; revoked privileges block them before RLS.
revoke insert, update, delete, truncate on public.terms_versions from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Acceptances
-- ---------------------------------------------------------------------------

create table public.terms_acceptances (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  version smallint not null references public.terms_versions (version),
  accepted_at timestamptz not null default now(),
  -- Also the index for the version gate: the highest accepted version of one account.
  constraint terms_acceptances_user_id_version_key unique (user_id, version)
);

comment on table public.terms_acceptances is
  'Append-only history of accepting the terms of use: one row per account and version. Cannot be changed or deleted, also not by the owner; disappears only with the account (cascade).';
comment on column public.terms_acceptances.version is
  'Accepted version of the terms; must exist in terms_versions.';
comment on column public.terms_acceptances.accepted_at is
  'Moment of acceptance, always now() of the inserting transaction (set by terms_acceptances_set_accepted_at). For an acceptance given at signup this is the moment the account was created.';

-- ---------------------------------------------------------------------------
-- 3. RLS and policies (4 policies, only for authenticated)
-- ---------------------------------------------------------------------------

alter table public.terms_acceptances enable row level security;

-- No policy for anon: with RLS enabled that means no rows without a session.

create policy terms_acceptances_select_authenticated on public.terms_acceptances
  for select to authenticated
  using (user_id = auth.uid());

create policy terms_acceptances_insert_authenticated on public.terms_acceptances
  for insert to authenticated
  with check (user_id = auth.uid());

-- History does not lie: an acceptance is never changed or deleted. These policies let nothing through; the guard
-- below is the second layer for roles that bypass RLS.
create policy terms_acceptances_update_authenticated on public.terms_acceptances
  for update to authenticated
  using (false)
  with check (false);

create policy terms_acceptances_delete_authenticated on public.terms_acceptances
  for delete to authenticated
  using (false);

-- TRUNCATE is not subject to RLS and fires no row triggers (20260929120000_revoke_account_truncate_and_window_execute.sql).
revoke truncate on public.terms_acceptances from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. accepted_at set by the database
-- ---------------------------------------------------------------------------

create function public.terms_acceptances_set_accepted_at()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.accepted_at := now();
  return new;
end;
$$;

comment on function public.terms_acceptances_set_accepted_at() is
  'Trigger: overwrites accepted_at with now(), so a client cannot backdate an acceptance.';

-- The Supabase default privileges grant anon and authenticated EXECUTE on every new function in public; revoking
-- from public alone would not remove those direct grants.
revoke execute on function public.terms_acceptances_set_accepted_at() from public, anon, authenticated;

create trigger terms_acceptances_set_accepted_at
  before insert on public.terms_acceptances
  for each row execute function public.terms_acceptances_set_accepted_at();

-- ---------------------------------------------------------------------------
-- 5. History guard
-- ---------------------------------------------------------------------------

create function public.terms_acceptances_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    -- Cascade from a deleted account: the auth.users row is deleted before the cascade reaches the acceptances, so a
    -- missing account means the whole account is going, which must pass.
    if not exists (select 1 from auth.users u where u.id = old.user_id) then
      return old;
    end if;

    raise exception
      'Nie można usunąć akceptacji warunków korzystania: akceptacja należy do historii konta i znika tylko razem z kontem.';
  end if;

  raise exception
    'Nie można zmienić akceptacji warunków korzystania: wersja i data akceptacji należą do historii konta.';
end;
$$;

comment on function public.terms_acceptances_guard() is
  'Trigger: refuses every update and delete of an acceptance. Passes a delete when the account no longer exists (account deletion cascade).';

revoke execute on function public.terms_acceptances_guard() from public, anon, authenticated;

create trigger terms_acceptances_guard
  before update or delete on public.terms_acceptances
  for each row execute function public.terms_acceptances_guard();

-- ---------------------------------------------------------------------------
-- 6. Acceptance written when the account is created
-- ---------------------------------------------------------------------------

create function public.record_terms_acceptance_on_signup()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_raw text := new.raw_user_meta_data ->> 'terms_version';
  v_version smallint;
begin
  -- Never raise here: an exception would make the signup fail. Anything but a known version writes nothing.
  -- The length limit keeps the cast to smallint from overflowing.
  if v_raw is null or v_raw !~ '^[0-9]{1,4}$' then
    return new;
  end if;

  v_version := v_raw::smallint;

  if not exists (select 1 from public.terms_versions v where v.version = v_version) then
    return new;
  end if;

  insert into public.terms_acceptances (user_id, version)
  values (new.id, v_version)
  on conflict (user_id, version) do nothing;

  return new;
end;
$$;

comment on function public.record_terms_acceptance_on_signup() is
  'Trigger on auth.users: when raw_user_meta_data.terms_version names an existing version of the terms, writes the acceptance of that version for the new account. Any other value writes nothing and raises nothing, so the signup never fails because of it.';

revoke execute on function public.record_terms_acceptance_on_signup() from public, anon, authenticated;

create trigger record_terms_acceptance_on_signup
  after insert on auth.users
  for each row execute function public.record_terms_acceptance_on_signup();
