-- Migration: shared symptom catalog and search terms (F-03).
--
-- Creates two shared, read-only tables with RLS enabled in this same migration:
--   symptoms              — the closed list of symptoms a user picks from, grouped by category,
--   symptom_search_terms  — colloquial words that find a symptom in the search box.
--
-- Both tables are empty here; the reviewed list is loaded by a separate data migration.
-- The shared tables are readable by a signed-in user and not writable from the application.
-- No administrator role exists (PRD, Access Control): data enters only through migrations.

-- ---------------------------------------------------------------------------
-- 1. Symptoms
-- ---------------------------------------------------------------------------

create table public.symptoms (
  id uuid primary key default gen_random_uuid(),
  -- stable identifier; later migrations find a symptom by key, never by name, and a key is
  -- never changed after it is loaded (enforced by symptoms_guard_key below)
  key text not null
    constraint symptoms_key_key unique
    constraint symptoms_key_check
    check (key ~ '^[a-z][a-z0-9_]*$'),
  -- user-facing Polish name; may be refined by later migrations, so it is not an identifier.
  -- Unique regardless of letter case: see symptoms_name_lower_key below.
  name text not null
    constraint symptoms_name_check
    check (name <> '' and name = btrim(name)),
  -- no separate category table (roadmap, F-03); labels and order live in src/types.ts
  category text not null
    constraint symptoms_category_check
    check (category in ('digestive', 'nervous', 'mental', 'skin', 'circulatory', 'general', 'muscular', 'other')),
  -- position within the category
  sort_order smallint not null
    constraint symptoms_sort_order_check
    check (sort_order > 0),
  -- vocabulary and code of an external terminology (e.g. MedDRA, ICD-10); empty until version 2.
  -- A code without its vocabulary is ambiguous, so the two are set or cleared together.
  source_vocabulary text
    constraint symptoms_source_vocabulary_check
    check (btrim(source_vocabulary) <> ''),
  source_code text
    constraint symptoms_source_code_check
    check (btrim(source_code) <> ''),
  created_at timestamptz not null default now(),
  constraint symptoms_source_pair_check
    check ((source_vocabulary is null) = (source_code is null)),
  -- deferred: a later migration that swaps two positions in one statement or across statements
  -- must not trip over the intermediate state; the check runs at commit
  constraint symptoms_category_sort_order_key
    unique (category, sort_order)
    deferrable initially deferred
);

-- "Ból głowy" next to "ból głowy" would be two entries for one symptom
create unique index symptoms_name_lower_key
  on public.symptoms (lower(name));

comment on table public.symptoms is
  'Closed list of symptoms, a shared set shipped with the product and loaded by migrations only. The scope (which symptoms are on the list) is a filter applied when the list is loaded, not a property of the row: there is no "in scope" flag, and widening the list means a migration that adds rows. key is the stable identifier and is never changed after load; name may be refined. Choosing a symptom states nothing about its cause: the product only ever says a symptom may be related to a medication (FR-012).';
comment on column public.symptoms.key is
  'Stable English identifier (lower case, digits, underscores). Never changed after load; later migrations refer to a symptom by key.';
comment on column public.symptoms.name is
  'User-facing Polish name. May be refined by a later migration; never used as an identifier.';
comment on column public.symptoms.category is
  'Body system group: digestive, nervous, mental, skin, circulatory, general, muscular, other. Polish labels and display order are in src/types.ts (SYMPTOM_CATEGORIES).';
comment on column public.symptoms.sort_order is
  'Position within the category, unique per category. The uniqueness check is deferred to commit so positions can be swapped.';
comment on column public.symptoms.source_vocabulary is
  'Name of the external terminology source_code comes from. Set together with source_code or not at all; empty until version 2.';
comment on column public.symptoms.source_code is
  'Code of the symptom in source_vocabulary. Set together with source_vocabulary or not at all; empty until version 2. The parked adverse-event set will join on this column, never on the Polish name.';

-- A key is the join point for every later migration; changing it would silently break them.
-- Only migrations write this table, so the guard catches a mistake in a later migration.
-- A deliberate key change must drop this trigger in the same migration.
create or replace function public.symptoms_guard_key()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.key is distinct from old.key then
    raise exception
      'Cannot change symptoms.key (% -> %): later migrations refer to a symptom by key. Change name instead.',
      old.key, new.key;
  end if;
  return new;
end;
$$;

create trigger symptoms_guard_key
  before update of key on public.symptoms
  for each row execute function public.symptoms_guard_key();

-- ---------------------------------------------------------------------------
-- 2. Symptom search terms
-- ---------------------------------------------------------------------------

create table public.symptom_search_terms (
  id uuid primary key default gen_random_uuid(),
  symptom_id uuid not null
    constraint symptom_search_terms_symptom_id_fkey
    references public.symptoms (id) on delete cascade,
  -- stored in one spelling so search compares like with like: lower case, composed Unicode (NFC),
  -- words separated by single plain spaces (no tabs, no non-breaking spaces, nothing at the edges)
  term text not null
    constraint symptom_search_terms_term_check
    check (
      term = lower(term)
      and term = normalize(term, NFC)
      and term ~ '^[^[:space:]]+( [^[:space:]]+)*$'
    ),
  -- the same word may point to two different symptoms, but not twice to one
  constraint symptom_search_terms_symptom_id_term_key
    unique (symptom_id, term)
);

comment on table public.symptom_search_terms is
  'Colloquial words that find a symptom in the search box. Shared and read-only: the author adds words through migrations, users never write them. A word maps to a symptom on the list only; a free-text note is never mapped to a symptom (FR-008).';
comment on column public.symptom_search_terms.term is
  'Search word in one spelling: lower case, NFC, single spaces between words, no spaces at the edges. The search in S-05 must bring the typed text to the same form before comparing.';

-- ---------------------------------------------------------------------------
-- 3. RLS and privileges
-- ---------------------------------------------------------------------------

alter table public.symptoms enable row level security;
alter table public.symptom_search_terms enable row level security;

-- One select policy per table for authenticated. No policy for anon (no rows without a
-- session) and no write policies (the application never writes shared data).

create policy symptoms_select_authenticated on public.symptoms
  for select to authenticated
  using (true);

create policy symptom_search_terms_select_authenticated on public.symptom_search_terms
  for select to authenticated
  using (true);

-- Second layer: RLS without a write policy already blocks writes; revoked privileges block
-- them even if a write policy is ever added by mistake.
revoke insert, update, delete, truncate on public.symptoms from anon, authenticated;
revoke insert, update, delete, truncate on public.symptom_search_terms from anon, authenticated;
