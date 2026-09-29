-- FR-012 language checks: the interaction pair descriptions the application actually reads.
--   LANGUAGE 1: interaction_pairs has at least one row, otherwise LANGUAGE 2 measures nothing.
--   LANGUAGE 2: every description contains the FR-012 phrase „może mieć związek”.
--
-- The description is folded the same way as foldText in scripts/rpl/pairs.mjs before the comparison: NFC,
-- lowercase, every run of whitespace collapsed to one space. So „Może mieć związek” at the start of a sentence and
-- „może mieć” + line break + „związek” both pass. normalize() needs a UTF8 database, which Supabase uses.
--
-- What this file does not check: the list of forbidden word stems. It lives only in the generator's validator
-- (scripts/rpl/pairs.mjs), on purpose: a second copy here would drift from the first. This file catches what the
-- validator cannot see: a generated migration edited by hand, or a later `update` that skips the generator.
--
-- How to run: `npm run db:check` (needs `npx supabase start`), or this file alone:
-- `node scripts/db-checks.mjs supabase/tests/fr012_language_checks.sql`. The runner (scripts/db-checks.mjs)
-- pipes it into psql inside the local database container, forces ON_ERROR_STOP and passes it only when it prints
-- `GATE_COMPLETE fr012_language_checks`. CI also runs it behind the probe
-- scripts/db-checks/probes/pair-description-without-phrase.sql, which must make LANGUAGE 2 fail.
--
-- Everything runs as postgres in one transaction ended with rollback: nothing is left behind.

\set ON_ERROR_STOP on

begin;

-- ---------------------------------------------------------------------------
-- LANGUAGE 1: there are descriptions to check.
-- ---------------------------------------------------------------------------

do $$
declare
  v_count bigint;
begin
  select count(*) into v_count from public.interaction_pairs;
  if v_count = 0 then
    raise exception 'LANGUAGE 1 FAILED: interaction_pairs is empty';
  end if;

  raise notice 'LANGUAGE 1 OK: interaction_pairs has % row(s)', v_count;
end;
$$;

-- ---------------------------------------------------------------------------
-- LANGUAGE 2: every description contains the FR-012 phrase.
-- ---------------------------------------------------------------------------

do $$
declare
  v_list text;
begin
  select string_agg(p.group_a || ' x ' || p.group_b, ', ' order by p.group_a, p.group_b) into v_list
  from public.interaction_pairs p
  where position(
    'może mieć związek' in regexp_replace(lower(normalize(p.description, NFC)), '\s+', ' ', 'g')
  ) = 0;
  if v_list is not null then
    raise exception 'LANGUAGE 2 FAILED: descriptions without the FR-012 phrase: %', v_list;
  end if;

  raise notice 'LANGUAGE 2 OK: all % description(s) contain the FR-012 phrase',
    (select count(*) from public.interaction_pairs);
end;
$$;

-- Completion marker for scripts/db-checks.mjs: printed only after every check above has passed.
do $$
begin
  if current_user <> 'postgres' then
    raise exception 'FINAL CHECK FAILED: file ends as % instead of postgres, a role was not reset', current_user;
  end if;
  raise notice 'GATE_COMPLETE fr012_language_checks';
end;
$$;

rollback;
