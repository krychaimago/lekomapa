// Pure helpers for the symptom journal screens (S-05). No `@/` imports and no Supabase client, so
// scripts/journal/journal.test.mjs can load this file directly under `node --experimental-strip-types`.

import { foldForSearch } from "./text-fold.ts";
import { SYMPTOM_CATEGORIES, type SymptomCategory } from "../../types.ts";

// How far back an entry may be dated. Mirrors SE003 (c_max_days_back) in symptom_entries_guard_occurred_at,
// supabase/migrations/20261005130000_symptom_journal.sql.
export const JOURNAL_MAX_DAYS_BACK = 14;

// Same limit as symptom_entries_note_check in the journal migration.
export const JOURNAL_NOTE_MAX_LENGTH = 200;

const MS_PER_MINUTE = 60_000;
const MS_PER_DAY = 86_400_000;
const WARSAW = "Europe/Warsaw";

export interface SearchableSymptom {
  id: string;
  name: string;
}

export interface SearchTerm {
  symptom_id: string;
  term: string;
}

// Symptoms whose name or colloquial search term contains the query, ignoring case, diacritics and extra spaces:
// "nudnosci" finds the symptom with the term "nudności". Alphabetical (Polish collation). An empty query gives
// null: the screen then shows the symptoms grouped by category instead of a flat list.
export function filterSymptoms<T extends SearchableSymptom>(
  catalog: readonly T[],
  terms: readonly SearchTerm[],
  query: string,
): T[] | null {
  const folded = foldForSearch(query);
  if (folded === "") return null;

  const termsBySymptom = new Map<string, string[]>();
  for (const { symptom_id, term } of terms) {
    const list = termsBySymptom.get(symptom_id) ?? [];
    list.push(foldForSearch(term));
    termsBySymptom.set(symptom_id, list);
  }

  return catalog
    .filter(
      (symptom) =>
        foldForSearch(symptom.name).includes(folded) ||
        (termsBySymptom.get(symptom.id) ?? []).some((term) => term.includes(folded)),
    )
    .sort((a, b) => a.name.localeCompare(b.name, "pl"));
}

export interface GroupableSymptom {
  category: string;
  sort_order: number;
}

export interface SymptomGroup<T> {
  category: SymptomCategory;
  label: string;
  symptoms: T[];
}

// Symptoms grouped under their category, categories in SYMPTOM_CATEGORIES order, symptoms by sort_order. Empty
// categories are left out. A category missing from SYMPTOM_CATEGORIES throws with its name: a symptom without a
// heading would be a silent error, so the screen fails visibly instead.
export function groupSymptomsByCategory<T extends GroupableSymptom>(symptoms: readonly T[]): SymptomGroup<T>[] {
  const known = new Set<string>(SYMPTOM_CATEGORIES.map(({ value }) => value));
  for (const symptom of symptoms) {
    if (!known.has(symptom.category)) {
      throw new Error(`Unknown symptom category: ${symptom.category}`);
    }
  }
  return SYMPTOM_CATEGORIES.map(({ value, label }) => ({
    category: value,
    label,
    symptoms: symptoms.filter((symptom) => symptom.category === value).sort((a, b) => a.sort_order - b.sort_order),
  })).filter((group) => group.symptoms.length > 0);
}

interface WarsawParts {
  date: string; // YYYY-MM-DD
  time: string; // HH:MM
}

// Calendar date and time of an instant in Europe/Warsaw. The Worker runs in UTC and a browser may be anywhere, so
// every time shown to the user goes through this. h23: midnight is 00:00, never 24:00.
function warsawParts(instant: Date): WarsawParts {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: WARSAW,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instant);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return { date: `${get("year")}-${get("month")}-${get("day")}`, time: `${get("hour")}:${get("minute")}` };
}

// The day after an ISO date, pinned to UTC midnight so no zone or DST switch moves it.
function nextIsoDay(iso: string): string {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day) + MS_PER_DAY).toISOString().slice(0, 10);
}

// "DD.MM" from an ISO date.
function dayMonth(iso: string): string {
  const [, month, day] = iso.split("-");
  return `${day}.${month}`;
}

// End of a correction window as the user reads it, in Polish time: "dziś, 21:14", "jutra, 21:14" (genitive, for
// "do jutra"), otherwise "DD.MM, 21:14". `nowIso` is the server's (or browser's) now, passed in so the result is
// testable.
export function formatCorrectionDeadline(endsAtIso: string, nowIso: string): string {
  const ends = warsawParts(new Date(endsAtIso));
  const today = warsawParts(new Date(nowIso)).date;
  if (ends.date === today) return `dziś, ${ends.time}`;
  if (ends.date === nextIsoDay(today)) return `jutra, ${ends.time}`;
  return `${dayMonth(ends.date)}, ${ends.time}`;
}

// "DD.MM.YYYY, HH:MM" in Polish time: when an entry happened, and the earliest allowed time after SE003.
export function formatWarsawDateTime(iso: string): string {
  const { date, time } = warsawParts(new Date(iso));
  const [year, month, day] = date.split("-");
  return `${day}.${month}.${year}, ${time}`;
}

// A `datetime-local` value (`YYYY-MM-DDTHH:MM`, no zone) as Polish wall-clock time; add_symptom_entry reads it the
// same way (`at time zone 'Europe/Warsaw'`).
function toWarsawLocal(instant: Date): string {
  const { date, time } = warsawParts(instant);
  return `${date}T${time}`;
}

// Default and upper bound of the entry time field: now in Polish time, seconds dropped (never later than now).
export function nowInWarsawLocal(now: Date = new Date()): string {
  return toWarsawLocal(now);
}

// Lower bound of the entry time field: now minus JOURNAL_MAX_DAYS_BACK days, rounded up to the next full minute.
// The field has minute precision, so rounding down could offer a minute the database refuses with SE003.
export function earliestEntryLocal(now: Date = new Date()): string {
  const limit = now.getTime() - JOURNAL_MAX_DAYS_BACK * MS_PER_DAY;
  return toWarsawLocal(new Date(Math.ceil(limit / MS_PER_MINUTE) * MS_PER_MINUTE));
}

// "YYYY-MM-DDTHH:MM" as "DD.MM.YYYY, HH:MM", without a Date object (the value is already Polish time).
export function formatLocalDateTime(local: string): string {
  const [date, time] = local.split("T");
  const [year, month, day] = date.split("-");
  return `${day}.${month}.${year}, ${time}`;
}
