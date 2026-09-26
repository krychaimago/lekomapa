-- Migration: shared registry of medicinal products and interaction pairs (F-02).
--
-- Creates three shared, read-only tables with RLS enabled in this same migration:
--   registry_products    — products from the Polish register (RPL), with the full source element,
--   registry_substances  — full composition of each product, with an ATC code per substance,
--   interaction_pairs    — interaction pairs stored on ATC groups, not on names.
--
-- It also changes two places of the F-01 schema:
--   medication_substances.atc_code becomes nullable (a substance the dictionary did not match),
--   medications.registry_medication_id gets the foreign key F-01 left for this change.
--
-- The shared tables are readable by a signed-in user and not writable from the application.
-- No rule-administrator role exists (PRD, Access Control): data enters only through migrations.

-- ---------------------------------------------------------------------------
-- 1. Registry products
-- ---------------------------------------------------------------------------

create table public.registry_products (
  id uuid primary key default gen_random_uuid(),
  -- product identifier in RPL; the key used when a later migration tops up the set
  rpl_id text not null
    constraint registry_products_rpl_id_key unique,
  product_name text not null,
  common_name text,
  -- raw values from the source, not interpreted
  strength text,
  pharmaceutical_form text,
  -- NAR, DCP, MRP, CEN, IR; kept raw, no value check, so a new procedure type in RPL
  -- does not break the next top-up migration
  procedure_type text,
  authorization_number text,
  -- a date, "Bezterminowe", "Pozwolenie zawieszone" or empty; the meaning of a past
  -- date is unconfirmed, so it is stored raw and never interpreted here
  authorization_validity text,
  marketing_authorization_holder text,
  -- product-level ATC codes: valid codes after cleaning (upper case, no spaces, no repeats), then the rejected
  -- source values untouched ("BRAK"); the original spelling and order stay in source_payload
  atc_codes text[] not null default '{}',
  -- the whole source element, packages included, so later rules need no re-import
  source_payload jsonb not null,
  -- stanNaDzien of the RPL file the row comes from
  snapshot_date date not null,
  created_at timestamptz not null default now()
);

comment on table public.registry_products is
  'Medicinal products from the Polish register (Rejestr Produktów Leczniczych, RPL), licensed CC BY 4.0 — the source must be credited. Loaded by generated migrations only. The scope (which ATC groups are loaded) is a filter applied by the generator when it reads RPL, not a property of the row: there is no "in scope" flag, and widening the scope means a new migration that adds missing products, not recomputing existing rows.';

-- ---------------------------------------------------------------------------
-- 2. Registry substances
-- ---------------------------------------------------------------------------

create table public.registry_substances (
  id uuid primary key default gen_random_uuid(),
  registry_product_id uuid not null references public.registry_products (id) on delete cascade,
  -- order of the substance in the source composition
  position smallint not null,
  -- substance name exactly as in the source
  substance_name text not null,
  normalized_name text not null,
  -- full ATC code of the substance, never truncated to a group; empty only for 'unmatched'
  atc_code text
    constraint registry_substances_atc_code_check
    check (atc_code ~ '^[A-Z][0-9]{2}([A-Z]([A-Z]([0-9]{2})?)?)?$'),
  atc_source text not null
    constraint registry_substances_atc_source_check
    check (atc_source in ('product', 'derived', 'derived_ambiguous', 'corrected', 'unmatched')),
  composition_source text not null
    constraint registry_substances_composition_source_check
    check (composition_source in ('source', 'sibling', 'atc_reverse', 'correction')),
  -- rpl_id of the product the composition was copied from; set only for 'sibling'
  composition_source_rpl_id text,
  constraint registry_substances_composition_source_rpl_id_check
    check ((composition_source = 'sibling') = (composition_source_rpl_id is not null)),
  -- an empty code means exactly "no match", and a match always has a code
  constraint registry_substances_unmatched_check
    check ((atc_source = 'unmatched') = (atc_code is null)),
  -- one substance may have several rows (tie between candidate codes), but never the same
  -- code twice; nulls not distinct, so an unmatched substance cannot be written twice either
  constraint registry_substances_product_position_atc_code_key
    unique nulls not distinct (registry_product_id, position, atc_code)
);

create index registry_substances_registry_product_id_idx
  on public.registry_substances (registry_product_id);

-- prefix matching: atc_code like 'C09CA%'
create index registry_substances_atc_code_idx
  on public.registry_substances (atc_code text_pattern_ops);

comment on table public.registry_substances is
  'Full composition of a registry product, one ATC code per row. Matching rule for S-02: a medication has an interaction when the code of any of its substances starts with group_a and the code of any substance of another medication starts with group_b, or the other way round. Rows with atc_source = ''derived_ambiguous'' are several rows of one substance (same position), one per candidate code: more flags instead of a silent miss. Rows with atc_source = ''unmatched'' keep the substance without a code and never match a pair.';
comment on column public.registry_substances.atc_source is
  'Origin of atc_code: product (single-substance product code), derived (from single-substance products of the whole RPL), derived_ambiguous (tie, one row per candidate), corrected (from the reviewed corrections file), unmatched (no code, atc_code is null).';
comment on column public.registry_substances.composition_source is
  'Origin of the composition: source (RPL element), sibling (copied from a product with the same name and codes, see composition_source_rpl_id), atc_reverse (from the product code), correction (from the reviewed corrections file).';

-- ---------------------------------------------------------------------------
-- 3. Interaction pairs
-- ---------------------------------------------------------------------------

create table public.interaction_pairs (
  id uuid primary key default gen_random_uuid(),
  group_a text not null
    constraint interaction_pairs_group_a_check
    check (group_a ~ '^[A-Z][0-9]{2}([A-Z]([A-Z]([0-9]{2})?)?)?$'),
  group_b text not null
    constraint interaction_pairs_group_b_check
    check (group_b ~ '^[A-Z][0-9]{2}([A-Z]([A-Z]([0-9]{2})?)?)?$'),
  -- user-facing text: "may be related", never a cause, never advice to stop or change a dose (FR-012)
  description text not null
    constraint interaction_pairs_description_check
    check (btrim(description) <> ''),
  -- where the pair was checked, e.g. "ChPL Diovan pkt 4.5"
  source text not null
    constraint interaction_pairs_source_check
    check (btrim(source) <> ''),
  verified_on date not null,
  created_at timestamptz not null default now(),
  -- canonical order: A×B and B×A are one pair. A group paired with itself is allowed:
  -- it catches two drugs of the same class from different doctors (ibuprofen and ketoprofen).
  constraint interaction_pairs_group_order_check
    check (group_a <= group_b),
  constraint interaction_pairs_group_a_group_b_key
    unique (group_a, group_b)
);

comment on table public.interaction_pairs is
  'Interaction pairs on ATC groups (prefix match against registry_substances.atc_code). The set is incomplete by design: no flag does not mean safe. Every row carries its source and the date it was verified by the author.';

-- ---------------------------------------------------------------------------
-- 4. RLS and privileges
-- ---------------------------------------------------------------------------

alter table public.registry_products enable row level security;
alter table public.registry_substances enable row level security;
alter table public.interaction_pairs enable row level security;

-- One select policy per table for authenticated. No policy for anon (no rows without a
-- session) and no write policies (the application never writes shared data).

create policy registry_products_select_authenticated on public.registry_products
  for select to authenticated
  using (true);

create policy registry_substances_select_authenticated on public.registry_substances
  for select to authenticated
  using (true);

create policy interaction_pairs_select_authenticated on public.interaction_pairs
  for select to authenticated
  using (true);

-- Second layer: RLS without a write policy already blocks writes; revoked privileges block
-- them even if a write policy is ever added by mistake.
revoke insert, update, delete, truncate on public.registry_products from anon, authenticated;
revoke insert, update, delete, truncate on public.registry_substances from anon, authenticated;
revoke insert, update, delete, truncate on public.interaction_pairs from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. Changes to the F-01 schema
-- ---------------------------------------------------------------------------

-- A substance the dictionary did not match is stored without a code instead of getting an
-- invented one. The shape check still applies to non-empty codes (a check on null passes).
-- F-01 guard triggers compare with "is distinct from", so an empty value does not bypass them.
alter table public.medication_substances
  alter column atc_code drop not null;

comment on column public.medication_substances.atc_code is
  'Full ATC code of the substance, never truncated to a group. Empty = the substance is stored but not matched to any rule.';

-- The old key (medication_id, atc_code) would let a second "Extractum X | (empty)" row into the
-- same medication, because two empty codes count as different by default. The new key blocks that
-- duplicate and still allows two different substances without a code and one substance with two
-- codes (a tie).
alter table public.medication_substances
  drop constraint medication_substances_medication_id_atc_code_key;

alter table public.medication_substances
  add constraint medication_substances_medication_id_substance_name_atc_code_key
  unique nulls not distinct (medication_id, substance_name, atc_code);

-- The registry row a medication points to cannot disappear. Added without "not valid": no
-- environment has registry_medication_id filled yet, because S-02 does not exist.
alter table public.medications
  add constraint medications_registry_medication_id_fkey
  foreign key (registry_medication_id)
  references public.registry_products (id)
  on delete restrict;

comment on column public.medications.registry_medication_id is
  'Registry product the composition was copied from; empty when the composition comes from the leaflet. The registry row cannot be deleted while a medication points to it (on delete restrict).';
