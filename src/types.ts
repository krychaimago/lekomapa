/**
 * Typy współdzielone: encje odpowiadające wierszom tabel i polecenia zapisu.
 *
 * Pisane ręcznie, bez generowania z bazy — dzięki temu `npm run typecheck`
 * nie wymaga uruchomionego Supabase. Źródłem prawdy o kolumnach pozostaje
 * migracja `supabase/migrations/20260922120000_medication_schema.sql`;
 * przy zmianie schematu poprawiamy oba pliki razem.
 *
 * Konwencja: kolumna dopuszczająca pustą wartość to `| null`, daty i znaczniki
 * czasu to `string` w zapisie ISO (`YYYY-MM-DD` dla `date`, pełny ISO 8601 dla
 * `timestamptz`) — tak zwraca je klient Supabase.
 */

/** Skąd pochodzi skład preparatu. Zgodne z kontrolą `medications_composition_source_check`. */
export type CompositionSource = "registry" | "leaflet";

/** Wiersz `public.medications` — preparat przyjmowany przez użytkowniczkę. */
export interface Medication {
  id: string;
  /** Właściciel wiersza; na nim stoi izolacja danych per-konto w politykach RLS. */
  user_id: string;
  product_name: string;
  composition_source: CompositionSource;
  /**
   * Pusta wartość, gdy skład pochodzi z ulotki, a nie z rejestru leków.
   * Foreign key to `registry_products.id` (on delete restrict), added in F-02.
   */
  registry_medication_id: string | null;
  /** Wypełniona data oznacza lek zakończony, nie usunięty — historia zostaje. */
  discontinued_on: string | null;
  created_at: string;
  updated_at: string;
}

/** Wiersz `public.medication_substances` — jedna substancja czynna preparatu. */
export interface MedicationSubstance {
  id: string;
  medication_id: string;
  substance_name: string;
  /**
   * Pełny kod ATC ze źródła, nigdy obcinany do grupy objętej regułami:
   * dopasowanie reguł idzie po przedrostku, a obcięcie przy zapisie
   * wyrzuciłoby dane, które produkt miał w ręku.
   *
   * Null = the substance is stored, but not matched to any rule (the
   * dictionary had no code for it). Never invent a code to fill it.
   */
  atc_code: string | null;
}

/** Wiersz `public.dosage_periods` — jeden okres dawkowania leku. */
export interface DosagePeriod {
  id: string;
  medication_id: string;
  dose_text: string;
  started_on: string;
  /** Pusta wartość oznacza okres trwający. */
  ended_on: string | null;
  /**
   * Registry variant (strength and form) taken in this period; null for a medication from a leaflet.
   * A strength change of the same product opens a new period with the new variant (S-03).
   * Foreign key to `registry_products.id` (on delete restrict).
   */
  registry_product_id: string | null;
  /**
   * Kolumna wyliczana przez bazę (`daterange(started_on, ended_on, '[)')`),
   * dostępna wyłącznie przy odczycie. Obsługuje ograniczenie przeciw
   * nakładkom okresów.
   */
  period: string;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Saving a medication and reading interaction flags (S-02).
// Source of truth: supabase/migrations/20260930120000_medication_write_and_interactions.sql.
// A medication is saved only through the database functions below, never by separate inserts into the
// three tables: the functions write the medication, its composition and the first dosage period atomically.
// No user_id in the commands: the functions take it from auth.uid() of the session.
// Dates are ISO `YYYY-MM-DD`.
// ---------------------------------------------------------------------------

/** Arguments of `add_medication_from_registry(p_registry_product_id, p_dose_text, p_started_on)`. */
export interface AddRegistryMedicationCommand {
  /** `registry_products.id` of the chosen variant; the name and composition are copied from the registry. */
  registryProductId: string;
  doseText: string;
  startedOn: string;
}

/**
 * Arguments of `add_medication_from_leaflet(p_product_name, p_substance_name, p_verified, p_dose_text, p_started_on)`.
 * `verified: false` saves the substance without an ATC code, so it never matches a pair; pass it only after
 * the user explicitly confirms saving an unchecked substance.
 */
export interface AddLeafletMedicationCommand {
  productName: string;
  substanceName: string;
  verified: boolean;
  doseText: string;
  startedOn: string;
}

/**
 * Arguments of `change_dosage(p_medication_id, p_dose_text, p_changed_on, p_registry_product_id)` (S-03).
 * Source of truth: supabase/migrations/20261004120000_dosage_change.sql. Closes the ongoing dosage period on
 * `changedOn` and opens a new one from that date, atomically.
 */
export interface ChangeDosageCommand {
  medicationId: string;
  doseText: string;
  /** First day of the new dose, ISO `YYYY-MM-DD`. */
  changedOn: string;
  /**
   * Another variant of the same registry product (same name and composition). Omitted = keep the current variant.
   * Must be omitted for a medication from a leaflet.
   */
  registryProductId?: string;
}

/**
 * Row of `medication_interactions()`: a current medication of the caller that forms an interaction pair with
 * another current medication of the caller. Symmetric — pair A-B gives one row for each of the two medications.
 * A row says only that a pair exists; user-facing wording is "may be related", never a cause (FR-012).
 */
export interface MedicationInteraction {
  medication_id: string;
  other_medication_id: string;
  pair_id: string;
  group_a: string;
  group_b: string;
  description: string;
}

// ---------------------------------------------------------------------------
// Shared, read-only data (F-02): medicinal products registry and interaction pairs.
// Source of truth: supabase/migrations/20260924120000_registry_schema.sql.
// No write commands: the application never writes these tables (RLS has no
// write policy and write privileges are revoked).
// ---------------------------------------------------------------------------

/** Origin of `registry_substances.atc_code`. Matches `registry_substances_atc_source_check`. */
export type AtcSource = "product" | "derived" | "derived_ambiguous" | "corrected" | "unmatched";

/**
 * Origin of a registry product's composition. Matches `registry_substances_composition_source_check`.
 * Named apart from `CompositionSource`, which is the origin of a user medication's composition.
 */
export type RegistryCompositionSource = "source" | "sibling" | "atc_reverse" | "correction";

/**
 * Row of `public.registry_products` — a product from the Polish register (RPL, CC BY 4.0).
 * Text fields are raw source values, not interpreted.
 */
export interface RegistryProduct {
  id: string;
  /** Product identifier in RPL. */
  rpl_id: string;
  product_name: string;
  common_name: string | null;
  strength: string | null;
  pharmaceutical_form: string | null;
  /** NAR, DCP, MRP, CEN, IR — raw, not checked. */
  procedure_type: string | null;
  authorization_number: string | null;
  /** A date, "Bezterminowe", "Pozwolenie zawieszone" or empty — raw, never interpreted. */
  authorization_validity: string | null;
  marketing_authorization_holder: string | null;
  /** Product-level ATC codes exactly as in the source (may include invalid values). */
  atc_codes: string[];
  /** The whole source element, packages included. */
  source_payload: unknown;
  /** `stanNaDzien` of the RPL file the row comes from. */
  snapshot_date: string;
  created_at: string;
}

/**
 * Row of `public.registry_substances` — one substance of a registry product with one ATC code.
 * A substance with a tie (`derived_ambiguous`) has several rows with the same `position`.
 */
export interface RegistrySubstance {
  id: string;
  registry_product_id: string;
  /** Order of the substance in the source composition. */
  position: number;
  /** Name exactly as in the source. */
  substance_name: string;
  normalized_name: string;
  /** Null exactly when `atc_source` is `"unmatched"`. */
  atc_code: string | null;
  atc_source: AtcSource;
  composition_source: RegistryCompositionSource;
  /** `rpl_id` of the product the composition was copied from; set only for `"sibling"`. */
  composition_source_rpl_id: string | null;
}

/** One registry variant offered in the add-medication form (strength, form and the composition to be saved). */
export interface RegistryVariantOption {
  id: string;
  strength: string | null;
  form: string | null;
  /** Substance names as they will be saved (registryCompositionNames). */
  composition: string[];
}

/**
 * Row of `public.interaction_pairs` — a pair of ATC groups, matched by code prefix.
 * Canonical order: `group_a <= group_b`; a group may be paired with itself.
 * The set is incomplete by design: no flag does not mean safe.
 */
export interface InteractionPair {
  id: string;
  group_a: string;
  group_b: string;
  /** User-facing text: "may be related", never a cause (FR-012). */
  description: string;
  /** Where the pair was checked, e.g. "ChPL Diovan pkt 4.5". */
  source: string;
  verified_on: string;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Shared, read-only data (F-03): symptom catalog and search terms.
// Source of truth: supabase/migrations/20260926120000_symptom_catalog_schema.sql.
// No write commands: the application never writes these tables (RLS has no
// write policy and write privileges are revoked).
// ---------------------------------------------------------------------------

/** Body system group of a symptom. Matches `symptoms_category_check`. */
export type SymptomCategory =
  "digestive" | "nervous" | "mental" | "skin" | "circulatory" | "general" | "muscular" | "other";

/**
 * User-facing Polish labels, written in display order (object key order is insertion order).
 * A Record, so a category added to the type without a label fails to compile.
 */
const SYMPTOM_CATEGORY_LABELS: Record<SymptomCategory, string> = {
  digestive: "pokarmowy",
  nervous: "nerwowy",
  mental: "psychika",
  skin: "skóra",
  circulatory: "krążenie",
  general: "ogólne",
  muscular: "mięśnie",
  other: "pozostałe",
};

/** Categories in display order, with user-facing Polish labels. The one place S-05 takes them from. */
export const SYMPTOM_CATEGORIES: readonly { value: SymptomCategory; label: string }[] = (
  Object.keys(SYMPTOM_CATEGORY_LABELS) as SymptomCategory[]
).map((value) => ({ value, label: SYMPTOM_CATEGORY_LABELS[value] }));

/**
 * Row of `public.symptoms` — one symptom of the closed list.
 * Choosing a symptom states nothing about its cause (FR-012).
 */
export interface Symptom {
  id: string;
  /** Stable identifier, never changed after load. Refer to a symptom by key, not by name. */
  key: string;
  /** User-facing Polish name; may be refined later. */
  name: string;
  category: SymptomCategory;
  /** Position within the category, unique per category. */
  sort_order: number;
  /** External terminology name; set together with `source_code` or not at all. */
  source_vocabulary: string | null;
  source_code: string | null;
  created_at: string;
}

/** Row of `public.symptom_search_terms` — a colloquial word, lower case, that finds a symptom. */
export interface SymptomSearchTerm {
  id: string;
  symptom_id: string;
  term: string;
}

// ---------------------------------------------------------------------------
// Symptom journal (S-05).
// Source of truth: supabase/migrations/20261005130000_symptom_journal.sql.
// An entry is saved only through `add_symptom_entry(p_occurred_local, p_items, p_note)`, which writes the entry and
// its symptoms atomically. The DTOs below are what the list screen renders, not raw table rows.
// ---------------------------------------------------------------------------

/** Optional severity of one symptom in an entry. Matches `symptom_entry_items_severity_check`. */
export type SymptomSeverity = "mild" | "moderate" | "severe";

/** A Record, so a severity added to the type without a label fails to compile. Written in display order. */
const SYMPTOM_SEVERITY_LABELS: Record<SymptomSeverity, string> = {
  mild: "łagodne",
  moderate: "umiarkowane",
  severe: "silne",
};

/** Severities in display order, with user-facing Polish labels. */
export const SYMPTOM_SEVERITIES: readonly { value: SymptomSeverity; label: string }[] = (
  Object.keys(SYMPTOM_SEVERITY_LABELS) as SymptomSeverity[]
).map((value) => ({ value, label: SYMPTOM_SEVERITY_LABELS[value] }));

/** One symptom of a journal entry, as the list shows it: the current catalog name, never a copy kept with the entry. */
export interface SymptomEntryItem {
  symptomId: string;
  name: string;
  category: SymptomCategory;
  severity: SymptomSeverity | null;
}

/** One journal entry on the list. */
export interface SymptomEntry {
  id: string;
  /** When the symptoms were felt, ISO timestamp (UTC); shown in Europe/Warsaw. */
  occurredAt: string;
  note: string | null;
  /**
   * End of the 24-hour correction window, ISO timestamp, from the computed field `correction_window_ends_at`.
   * Null when the field could not be read; the screen then shows no deadline.
   */
  correctionWindowEndsAt: string | null;
  items: SymptomEntryItem[];
}

// ---------------------------------------------------------------------------
// Question for the doctor (S-06, US-02, FR-010), composed by src/lib/services/doctor-question.ts and reused by S-08.
// Dates are ISO `YYYY-MM-DD` in Polish time. Neither the input nor the result carries interaction pairs or any rating:
// the order of medicines cannot depend on suspicion when the composer never sees it (FR-012).

/** One medication with its dosage history, as the composer reads it. */
export interface DoctorQuestionMedication {
  id: string;
  /** `medications.product_name`. */
  name: string;
  /** First day without the medication; null while it is taken. */
  discontinuedOn: string | null;
  periods: {
    startedOn: string;
    /** Exclusive, as in `dosage_periods.ended_on`; null for the ongoing period. */
    endedOn: string | null;
    doseText: string;
    /** Registry variant (`registry_products.strength`, `.pharmaceutical_form`); null for a leaflet medication. */
    strength: string | null;
    pharmaceuticalForm: string | null;
  }[];
}

/** A start, dose change or end of a medication inside the symptom's window. */
export interface DoctorQuestionEvent {
  date: string;
  kind: "start" | "change" | "stop";
  medicationName: string;
  /** Dose from this date on; absent for a stop. When the dose text did not change, carries the part of the variant that did. */
  dose?: string;
  /** Dose before a change; only for a change. */
  previousDose?: string;
}

/** The question for one symptom of an entry. */
export interface DoctorQuestion {
  symptomName: string;
  /** Day of the earliest entry with the symptom, up to and including the current entry. */
  firstEntryOn: string;
  /** Day of the current entry. */
  entryOn: string;
  /** Entries with the symptom up to and including the current one. */
  entryCount: number;
  /** First day of the window: firstEntryOn minus QUESTION_WINDOW_DAYS. */
  windowStart: string;
  /** Events in the window, by date, then by medication name. */
  events: DoctorQuestionEvent[];
  /** Medications taken in the window without any event in it, by name; dose and its start as on the entry day. */
  otherMedications: { name: string; since: string; dose: string }[];
}

/**
 * One current medication in the doctor visit section (S-05, FR-011): the dose of its latest dosage period and the
 * registry variant of that period (null for a leaflet medication or an unknown part of the variant).
 */
export interface VisitCurrentMedication {
  name: string;
  /** Start of the current dose, ISO `YYYY-MM-DD`. */
  since: string;
  doseText: string;
  strength: string | null;
  pharmaceuticalForm: string | null;
}

/**
 * Content of the doctor visit section `/wizyta` (S-08, FR-011), gathered from what S-02 and S-06 produce.
 * `interactions` holds each pair once, alphabetically — never by suspicion (FR-012). `questions` holds one question
 * per symptom from its newest entry; `withoutQuestion` names the symptoms with no medication in their window.
 * `currentMedications` lists each current medication once, alphabetically — never by suspicion (S-05, FR-012).
 */
export interface VisitSummary {
  showIntro: boolean;
  currentMedications: VisitCurrentMedication[];
  interactions: { firstName: string; secondName: string; description: string }[];
  interactionsEmptyState: "noMedications" | "oneMedication" | "noPair" | null;
  questions: DoctorQuestion[];
  withoutQuestion: string[];
}

/**
 * Acceptance of one version of the terms of use (table terms_acceptances). Append-only history: never changed or
 * deleted, disappears only with the account. accepted_at is set by the database.
 */
export interface TermsAcceptance {
  id: string;
  user_id: string;
  version: number;
  accepted_at: string;
}

// ---------------------------------------------------------------------------
// Medication and symptom timeline (S-09, FR-013), page `/wizyta/os-czasu`.
// Source of truth: supabase/migrations/20261017120000_symptom_timeline.sql. The timeline shows dates, not relations:
// nothing here carries interaction pairs or any rating (FR-012).

/** Every entry of one symptom of the signed-in person, oldest first, each with its own optional severity. */
export interface TimelineSymptomEntries {
  symptomId: string;
  /** Current catalog name. */
  name: string;
  entries: {
    /** When the symptom was felt, ISO timestamp (UTC). */
    occurredAt: string;
    severity: SymptomSeverity | null;
  }[];
}

// ---------------------------------------------------------------------------
// Interaction graph under the medication list (S-10, FR-014), built by src/lib/services/interaction-graph.ts.
// Two layouts, each in its own fixed coordinate system (phone 360 units wide, wide 576); the component scales the one
// it shows. A medication's place comes from the history of arrivals and departures and its id, never from
// interactions or its name (FR-012).

/** One medication of the account as the graph replays its history: when it was added and when its end was saved. */
export interface InteractionGraphHistoryItem {
  id: string;
  /** `medications.created_at`, ISO timestamp. */
  createdAt: string;
  /** `medications.discontinued_at` (moment the end was saved, set by the database), never `discontinued_on`. */
  discontinuedAt: string | null;
}

export interface InteractionGraphInput {
  /** Every medication of the account, ended ones included. */
  history: InteractionGraphHistoryItem[];
  /** Current medications, the same rows the list shows. */
  current: { id: string; name: string }[];
  /** Rows of `medication_interactions()`; they never move a point (FR-012). */
  interactions: MedicationInteraction[];
  /** Today in Polish time, ISO `YYYY-MM-DD`. Part of the contract; the layout does not depend on it. */
  today: string;
}

/** One current medication on the graph. */
export interface InteractionGraphNode {
  id: string;
  name: string;
}

/** One line between two medications forming at least one checked pair; `a` < `b` by id. */
export interface InteractionGraphEdge {
  a: string;
  b: string;
}

/** The centre of a medication's point in one layout. */
export interface InteractionGraphPoint {
  id: string;
  x: number;
  y: number;
}

/** One edge drawn in one layout. */
export interface InteractionGraphLine extends InteractionGraphEdge {
  /**
   * SVG path `d`: only letters, spaces and numbers — M and Q (a quadratic curve) in the phone and wide layouts, M and
   * C (a cubic arc) in the column.
   */
  path: string;
}

/** One layout of the graph in its own coordinate system (`viewBox` width × height). */
export interface InteractionGraphLayout {
  width: number;
  height: number;
  /** One per node, in the order of `InteractionGraphModel.nodes`. */
  points: InteractionGraphPoint[];
  /** One per edge, in the order of `InteractionGraphModel.edges`. */
  lines: InteractionGraphLine[];
}

/** A medication the selected one may interact with, and every distinct description of their pairs. */
export interface InteractionGraphPartner {
  id: string;
  name: string;
  descriptions: string[];
}

export interface InteractionGraphModel {
  /** Alphabetical by name (Polish collation) — the order of the buttons, never by interactions. */
  nodes: InteractionGraphNode[];
  edges: InteractionGraphEdge[];
  /** For every node id: its partners alphabetically; empty when it forms no checked pair. */
  partners: Record<string, InteractionGraphPartner[]>;
  /** Layout "C", 360 units wide: shown while the graph card's content is from 18.25 rem to 30 rem wide. */
  phone: InteractionGraphLayout;
  /** Layout "10", 576 units wide: shown from 30 rem of the card's content (480 px at the default text size). */
  wide: InteractionGraphLayout;
  /**
   * One medication per row, alphabetically, in units of 1/16 rem: shown while the card's content is narrower than
   * 18.25 rem (292 px at the default text size). `points` in the order of `nodes`, `lines` in the order of `edges`.
   */
  column: InteractionGraphLayout;
}
