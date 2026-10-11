-- Migration: S-09 phase 1 — a signed-in account deletes itself, together with all its data.
--
-- What this migration makes possible, in plain terms, with an example.
-- Technical names are in brackets, for whoever needs to find them in the code below.
--
-- A. DELETING ONE'S OWN ACCOUNT (delete_own_account)
--
--    Example: on 2026-10-11 at 21:14 Anna types her password on the "Usuń konto" screen. The route signs her in with
--    that password and, in the same request, calls this function. Her row in auth.users is deleted, and the existing
--    cascade removes every row of her account: medications with their composition and dosage periods, journal
--    entries with their symptoms, and her acceptances of the terms. No copy is kept.
--      - The function deletes the auth.users row itself, physically. Every history guard recognises the account
--        deletion by the missing auth.users row (medications_guard_delete, symptom_entries_guard_delete,
--        terms_acceptances_guard), so a soft delete would be refused by them once a correction window is closed.
--      - It accepts only a fresh password sign-in: the token must carry an `amr` entry with method "password" whose
--        timestamp is at most 5 minutes old. The anon key is public, so without this check anyone holding a session
--        (a stolen cookie, a session opened from the password reset link, whose amr method is "otp") could call the
--        function directly and skip the password. Shape of `amr` measured on local Supabase on 2026-10-11:
--        [{"method":"password","timestamp":<unix seconds>}] after a password sign-in,
--        [{"method":"otp","timestamp":<unix seconds>}] after the password reset link.
--
-- Errors, each a named SQLSTATE the route maps to a text, checked in this order:
--   28000  no signed-in session (auth.uid() is empty);
--   AD001  no fresh password sign-in in the token (no "password" entry in amr, or one older than 5 minutes);
--   AD002  the account row was not found (already deleted), so nothing was deleted.
--
-- Privileges: security definer, because authenticated has no privilege on auth.users. The function deletes only the
-- row of auth.uid(), never a row chosen by the caller. EXECUTE only for authenticated; anon has none. INVARIANT 7 in
-- supabase/tests/schema_invariants_checks.sql lists this function as its one deliberate exception.

create function public.delete_own_account()
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  -- The route signs in with the password and calls this function in one request, so a few seconds would do. The
  -- margin covers clock drift between the auth server that stamps the amr timestamp and the database clock.
  c_fresh_sign_in constant interval := interval '5 minutes';
  v_user_id uuid := auth.uid();
  v_amr jsonb := auth.jwt() -> 'amr';
  v_rows integer;
begin
  if v_user_id is null then
    raise exception using
      errcode = '28000',
      message = 'Cannot delete an account without a signed-in session.';
  end if;

  -- A malformed amr (not an array, an entry without a numeric timestamp) counts as no fresh password sign-in.
  if jsonb_typeof(v_amr) is distinct from 'array' or not exists (
    select 1
      from jsonb_array_elements(v_amr) as e(entry)
     where jsonb_typeof(e.entry) = 'object'
       and e.entry ->> 'method' = 'password'
       and jsonb_typeof(e.entry -> 'timestamp') = 'number'
       and to_timestamp((e.entry ->> 'timestamp')::double precision) >= now() - c_fresh_sign_in
  ) then
    raise exception using
      errcode = 'AD001',
      message = 'Fresh password sign-in required to delete the account.';
  end if;

  delete from auth.users u where u.id = v_user_id;
  get diagnostics v_rows = row_count;

  if v_rows = 0 then
    raise exception using
      errcode = 'AD002',
      message = 'Account not found, nothing was deleted.';
  end if;
end;
$$;

comment on function public.delete_own_account() is
  'Deletes the account of the caller (auth.uid()) from auth.users; the on delete cascade keys remove every row of the account in public, and the history guards let the cascade through because the account row is gone. Example: Anna signs in with her password on 2026-10-11 at 21:14 and the route calls this function in the same request; her medications, dosage periods, journal entries and terms acceptances are deleted, with no copy. Requires a fresh password sign-in: an amr entry with method "password" and a timestamp (unix seconds) at most 5 minutes old; a session from the password reset link (method "otp") or an older sign-in is refused. Errors: 28000 = no signed-in session, AD001 = no fresh password sign-in, AD002 = account not found. security definer because authenticated has no privilege on auth.users; it never deletes a row other than auth.uid().';

-- The Supabase default privileges grant anon and authenticated EXECUTE on every new function in public; revoking
-- from public alone would not remove those direct grants.
revoke execute on function public.delete_own_account() from public, anon, authenticated;
grant execute on function public.delete_own_account() to authenticated;
