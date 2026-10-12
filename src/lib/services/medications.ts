// Pure helpers for the medication screens (S-02). No `@/` imports and no Supabase client, so
// scripts/medications/medications.test.mjs can load this file directly under `node --experimental-strip-types`.

import { MEDICATION_COPY } from "../copy/medications.ts";
import { foldForSearch } from "./text-fold.ts";

export interface OrderableMedication {
  // Start date of the first dosage period, ISO `YYYY-MM-DD`.
  startedOn: string;
  // `medications.created_at`, ISO timestamp.
  createdAt: string;
}

// Newest start date first; on the same date, the medicine added later first. Reads only these two fields:
// the order never depends on the interaction flag or anything else a caller passes along (FR-012, US-01).
export function orderMedications<T extends OrderableMedication>(items: readonly T[]): T[] {
  return [...items].sort(
    (a, b) => b.startedOn.localeCompare(a.startedOn) || Date.parse(b.createdAt) - Date.parse(a.createdAt),
  );
}

export interface RegistryNameGroup {
  name: string;
  variants: number;
  // Id of the group's first row in result order: the link to the name's variants carries this id, never the name.
  productId: string;
}

// One entry per product name ignoring case, spelled as it first appears, sorted alphabetically (Polish collation).
export function groupRegistryResults(rows: readonly { id: string; product_name: string }[]): RegistryNameGroup[] {
  const groups = new Map<string, RegistryNameGroup>();
  for (const { id, product_name } of rows) {
    const key = product_name.toLocaleLowerCase("pl");
    const group = groups.get(key);
    if (group) group.variants += 1;
    else groups.set(key, { name: product_name, variants: 1, productId: id });
  }
  return [...groups.values()].sort((a, b) => a.name.localeCompare(b.name, "pl"));
}

// Makes `%`, `_` and `\` typed by the user literal inside an `ilike` pattern (backslash is the default escape).
export function escapeLikePattern(input: string): string {
  return input.replace(/[\\%_]/g, (char) => `\\${char}`);
}

// "Today" as an ISO date in Europe/Warsaw. The only source of today for the form default and zod validation:
// the Worker runs in UTC, so `new Date().toISOString()` would give yesterday between midnight and 2:00.
export function todayInWarsaw(now: Date = new Date()): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Warsaw",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export interface RegistrySubstanceRow {
  position: number;
  substance_name: string;
  atc_code: string | null;
}

// Substance names of a registry product as the user sees them before saving: in `position` order, a repeated code
// shown once (the first by position, then by name) and each name once. Mirrors the deduplication of
// add_medication_from_registry (supabase/migrations/20260930120000_medication_write_and_interactions.sql), so the
// composition on screen is the one that gets saved.
export function registryCompositionNames(rows: readonly RegistrySubstanceRow[]): string[] {
  const sorted = [...rows].sort(
    (a, b) => a.position - b.position || a.substance_name.localeCompare(b.substance_name, "pl"),
  );
  const seenCodes = new Set<string>();
  const names: string[] = [];
  for (const row of sorted) {
    if (row.atc_code !== null) {
      if (seenCodes.has(row.atc_code)) continue;
      seenCodes.add(row.atc_code);
    }
    if (!names.includes(row.substance_name)) names.push(row.substance_name);
  }
  return names;
}

// "Moc: … · Postać: …" for one registry variant; empty for none. The one label of a variant on the medication screens
// and in the question for the doctor (S-06).
export function variantText(
  variant: { strength: string | null; pharmaceutical_form: string | null } | null | undefined,
): string {
  return [
    variant?.strength && `${MEDICATION_COPY.add.strength}: ${variant.strength}`,
    variant?.pharmaceutical_form && `${MEDICATION_COPY.add.form}: ${variant.pharmaceutical_form}`,
  ]
    .filter(Boolean)
    .join(" · ");
}

// ISO `YYYY-MM-DD` as the Polish `DD.MM.YYYY`, without a Date object (no time zone shift).
export function formatIsoDate(iso: string): string {
  const [year, month, day] = iso.split("-");
  return `${day}.${month}.${year}`;
}

// How far back a dose change may be dated (mirrors DP007 in change_dosage,
// supabase/migrations/20261004120000_dosage_change.sql), and an end date of a medication (MD004, S-04).
export const DOSAGE_CHANGE_MAX_DAYS_BACK = 14;

const MS_PER_DAY = 86_400_000;

// ISO `YYYY-MM-DD` shifted by whole days. Pinned to UTC midnight, so neither the local time zone nor a DST switch
// moves the result; Date.UTC rolls over month ends, year ends and 29 February.
export function addDays(iso: string, days: number): string {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day) + days * MS_PER_DAY).toISOString().slice(0, 10);
}

// The day after an ISO date: the earliest possible dose change after a period starting that day.
export function nextDay(iso: string): string {
  return addDays(iso, 1);
}

// Periods are stored as `[started_on, ended_on)`: the saved end date is the first day of the next dose, so the last
// day the period covers is one day earlier.
export function lastDayOfPeriod(endedOn: string): string {
  return addDays(endedOn, -1);
}

// Earliest date a dose change may carry: the day after the current period started, and no more than
// DOSAGE_CHANGE_MAX_DAYS_BACK days before today — whichever is later. ISO dates compare correctly as strings.
// Also the earliest end date of a medication (S-04, MD004/MD005 in discontinue_medication and correct_discontinuation,
// supabase/migrations/20261006120000_discontinue_medication.sql): the database applies the same formula and the same
// 14 days to both. Do not split this function when one of the two rules changes — change the database first.
export function earliestChangeDate(startedOn: string, today: string): string {
  const afterStart = nextDay(startedOn);
  const limit = addDays(today, -DOSAGE_CHANGE_MAX_DAYS_BACK);
  return afterStart > limit ? afterStart : limit;
}

const MIN_SHARED_PREFIX = 4;
const MAX_SIMILAR = 5;

function sharedPrefixLength(a: string, b: string): number {
  let length = 0;
  while (length < a.length && length < b.length && a[length] === b[length]) length += 1;
  return length;
}

// Dictionary names that share a prefix of at least MIN_SHARED_PREFIX characters with the input, ignoring case and
// diacritics: the Polish leaflet "ibuprofen" finds the Latin "ibuprofenum". Longest shared prefix first, then
// alphabetically; at most MAX_SIMILAR names, each once, spelled as in the dictionary.
export function similarSubstances(input: string, names: readonly string[]): string[] {
  const folded = foldForSearch(input);
  if (folded.length < MIN_SHARED_PREFIX) return [];
  const seen = new Set<string>();
  const matches: { name: string; shared: number }[] = [];
  for (const name of names) {
    if (seen.has(name)) continue;
    seen.add(name);
    const shared = sharedPrefixLength(folded, foldForSearch(name));
    if (shared >= MIN_SHARED_PREFIX) matches.push({ name, shared });
  }
  return matches
    .sort((a, b) => b.shared - a.shared || a.name.localeCompare(b.name, "pl"))
    .slice(0, MAX_SIMILAR)
    .map((match) => match.name);
}
