// Medication and symptom timeline (S-09, FR-013), page `/wizyta/os-czasu`: the whole geometry of the chart as plain
// numbers, labels and ids — no markup, no colours, no Supabase. No `@/` imports, so scripts/timeline/timeline.test.mjs
// and scripts/timeline/bench.mjs load this file directly under `node --experimental-strip-types`.
//
// The timeline shows dates, not relations (FR-012): medications are ordered only by the start of their first period,
// then by name — never by interactions, symptoms or anything else — and nothing here puts a symptom next to a
// medication. Positions are fractions 0–1 of the range width, not pixels: the component scales them per layout.
//
// Days are ISO `YYYY-MM-DD` in Polish time. Periods are `[startedOn, endedOn)` as in `dosage_periods`, so `endedOn` is
// the first day without that dose; ranges are `[from, to)` the same way, `to` being the day after today.

import type { DoctorQuestionMedication, SymptomSeverity, TimelineSymptomEntries } from "../../types.ts";

export type TimelineRangeKey = "90d" | "year" | "all";

/** In the order of the range switch on the page. */
export const TIMELINE_RANGE_KEYS: readonly TimelineRangeKey[] = ["90d", "year", "all"];

/** Days a fixed range covers, today included: "90 dni" = [today − 89, today + 1), "rok" = [today − 364, today + 1). */
export const TIMELINE_RANGE_DAYS = { "90d": 90, year: 365 } as const;

/** One dosage period cut to the range. `start`/`end` are fractions of the range width (0 = `from`, 1 = `to`). */
export interface TimelineSegment {
  /** First day drawn, ISO; the later of the period start and the range start. */
  startedOn: string;
  /** First day not drawn (exclusive), ISO; the earlier of the period end (today + 1 while ongoing) and `to`. */
  endedOn: string;
  start: number;
  end: number;
  doseText: string;
}

/** One dosage period as the text list shows it: real dates, not cut to the range. */
export interface TimelinePeriodText {
  startedOn: string;
  /** Last day the dose was taken (`endedOn − 1`), ISO; null while the period is ongoing. */
  lastDayOn: string | null;
  doseText: string;
}

export interface TimelineMedicationRow {
  id: string;
  name: string;
  /** Oldest first; two periods around a dose change touch (one ends on the day the other starts). */
  segments: TimelineSegment[];
  /** Periods that overlap the range, oldest first, with their full dates. */
  periods: TimelinePeriodText[];
}

/** One day with the symptom: the strongest severity of that day's entries (`severe` > `moderate` > `mild` > none). */
export interface TimelineSymptomMark {
  day: string;
  /** Middle of the day, as a fraction of the range width. */
  position: number;
  severity: SymptomSeverity | null;
}

export interface TimelineSymptomRow {
  id: string;
  name: string;
  /** Oldest first; empty when the symptom has no entry in the range — the row stays, the page says so. */
  marks: TimelineSymptomMark[];
}

/** The first day of a month inside the range. */
export interface TimelineMonthTick {
  day: string;
  /** Left edge of that day, as a fraction of the range width. */
  position: number;
  /** Polish short month name, e.g. "paź". */
  label: string;
  year: number;
}

export interface TimelineRange {
  key: TimelineRangeKey;
  /** First day, ISO, inclusive. */
  from: string;
  /** Day after the last one (today + 1), ISO, exclusive. */
  to: string;
  days: number;
  /** Middle of today, as a fraction of the range width. */
  todayPosition: number;
  /** Medications with at least one period in the range, in chart order. */
  medications: TimelineMedicationRow[];
  /** Medications whose every period ended on or before `from` — "N leków zakończonych przed tym okresem". */
  endedBeforeCount: number;
  /** Every symptom of the account, alphabetically, with its marks in the range. */
  symptoms: TimelineSymptomRow[];
  months: TimelineMonthTick[];
}

export interface TimelineModel {
  today: string;
  ranges: Record<TimelineRangeKey, TimelineRange>;
  /** The symptom drop-down: every symptom of the input, alphabetically (Polish collation), whether in a range or not. */
  symptomOptions: { id: string; name: string }[];
  /** The medication checkboxes: every medication drawn in any range, in chart order. */
  medicationOptions: { id: string; name: string }[];
}

export interface BuildTimelineInput {
  medications: DoctorQuestionMedication[];
  symptoms: TimelineSymptomEntries[];
  /** Today in Polish time, ISO `YYYY-MM-DD` (todayInWarsaw()). */
  today: string;
}

// Polish short month names (user-visible), January first.
const MONTH_LABELS = ["sty", "lut", "mar", "kwi", "maj", "cze", "lip", "sie", "wrz", "paź", "lis", "gru"] as const;

const SEVERITY_RANK: Record<SymptomSeverity, number> = { mild: 1, moderate: 2, severe: 3 };
const rankOf = (severity: SymptomSeverity | null) => (severity === null ? 0 : SEVERITY_RANK[severity]);

const MS_PER_DAY = 86_400_000;

// Days as whole numbers since 1970-01-01, pinned to UTC midnight, so no zone or DST switch moves them.
function dayNumber(iso: string): number {
  const [year, month, day] = iso.split("-").map(Number);
  return Date.UTC(year, month - 1, day) / MS_PER_DAY;
}

function isoOf(dayNo: number): string {
  return new Date(dayNo * MS_PER_DAY).toISOString().slice(0, 10);
}

const MS_PER_HOUR = 3_600_000;

// Formatting every entry through Intl (as todayInWarsaw does) took more than half of buildTimeline on the heavy
// account (scripts/timeline/bench.mjs). Instead the Warsaw offset is read once per UTC day, at noon. That is exact for
// every instant of that UTC day: Poland is UTC+1 or UTC+2, so an instant moves to the next day only from 22:00 UTC on,
// and the clocks change at 01:00 UTC, so from 22:00 UTC to midnight the offset is the noon one. The cache holds one
// number per calendar day ever seen, so it stays small.
const WARSAW_HOUR = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Warsaw", hour: "2-digit", hourCycle: "h23" });
const warsawOffsetByUtcDay = new Map<number, number>();

function warsawOffsetMs(utcDay: number): number {
  let offset = warsawOffsetByUtcDay.get(utcDay);
  if (offset === undefined) {
    const noonInWarsaw = Number(WARSAW_HOUR.format(new Date(utcDay * MS_PER_DAY + 12 * MS_PER_HOUR)));
    offset = (noonInWarsaw - 12) * MS_PER_HOUR;
    warsawOffsetByUtcDay.set(utcDay, offset);
  }
  return offset;
}

function warsawDayNumber(instantIso: string): number {
  const time = Date.parse(instantIso);
  return Math.floor((time + warsawOffsetMs(Math.floor(time / MS_PER_DAY))) / MS_PER_DAY);
}

/** The Polish-time day of an instant: an entry at 00:30 in Poland belongs to that day, though in UTC it is the day before. */
export function warsawDayOf(instantIso: string): string {
  return isoOf(warsawDayNumber(instantIso));
}

const byName = (a: string, b: string) => a.localeCompare(b, "pl");

interface PreparedMedication {
  id: string;
  name: string;
  firstStart: number;
  periods: { start: number; end: number; startedOn: string; endedOn: string | null; doseText: string }[];
}

interface PreparedSymptom {
  id: string;
  name: string;
  /** One per day, oldest first. */
  days: { dayNo: number; day: string; severity: SymptomSeverity | null }[];
}

function prepareMedications(medications: DoctorQuestionMedication[], tomorrow: number): PreparedMedication[] {
  const prepared: PreparedMedication[] = [];
  for (const medication of medications) {
    if (medication.periods.length === 0) continue;
    const periods = medication.periods
      .map((period) => ({
        start: dayNumber(period.startedOn),
        // An ongoing period reaches today, so it is drawn up to today + 1.
        end: period.endedOn === null ? tomorrow : dayNumber(period.endedOn),
        startedOn: period.startedOn,
        endedOn: period.endedOn,
        doseText: period.doseText,
      }))
      .sort((a, b) => a.start - b.start);
    prepared.push({ id: medication.id, name: medication.name, firstStart: periods[0].start, periods });
  }
  // Start of the first period, then name; the id only makes equal rows come out the same whatever the input order.
  return prepared.sort(
    (a, b) => a.firstStart - b.firstStart || byName(a.name, b.name) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
}

function prepareSymptoms(symptoms: TimelineSymptomEntries[]): PreparedSymptom[] {
  const prepared = symptoms.map((symptom) => {
    const byDay = new Map<number, SymptomSeverity | null>();
    for (const entry of symptom.entries) {
      const dayNo = warsawDayNumber(entry.occurredAt);
      if (!byDay.has(dayNo) || rankOf(entry.severity) > rankOf(byDay.get(dayNo) ?? null)) {
        byDay.set(dayNo, entry.severity);
      }
    }
    const days = [...byDay]
      .map(([dayNo, severity]) => ({ dayNo, day: isoOf(dayNo), severity }))
      .sort((a, b) => a.dayNo - b.dayNo);
    return { id: symptom.symptomId, name: symptom.name, days };
  });
  return prepared.sort((a, b) => byName(a.name, b.name) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

function monthTicks(from: number, to: number, days: number): TimelineMonthTick[] {
  const ticks: TimelineMonthTick[] = [];
  const first = new Date(from * MS_PER_DAY);
  let year = first.getUTCFullYear();
  let month = first.getUTCMonth();
  // The first of the month at or after `from`.
  if (first.getUTCDate() !== 1) month += 1;
  for (;;) {
    if (month === 12) {
      month = 0;
      year += 1;
    }
    const dayNo = Date.UTC(year, month, 1) / MS_PER_DAY;
    if (dayNo >= to) break;
    ticks.push({ day: isoOf(dayNo), position: (dayNo - from) / days, label: MONTH_LABELS[month], year });
    month += 1;
  }
  return ticks;
}

function buildRange(
  key: TimelineRangeKey,
  from: number,
  to: number,
  todayNo: number,
  medications: PreparedMedication[],
  symptoms: PreparedSymptom[],
): TimelineRange {
  const days = to - from;
  const rows: TimelineMedicationRow[] = [];
  let endedBeforeCount = 0;
  for (const medication of medications) {
    const segments: TimelineSegment[] = [];
    const periods: TimelinePeriodText[] = [];
    for (const period of medication.periods) {
      const start = Math.max(period.start, from);
      const end = Math.min(period.end, to);
      // A period starting after today (only the API route forbids it, not the database) ends before it starts.
      if (end <= start) continue;
      segments.push({
        startedOn: isoOf(start),
        endedOn: isoOf(end),
        start: (start - from) / days,
        end: (end - from) / days,
        doseText: period.doseText,
      });
      periods.push({
        startedOn: period.startedOn,
        lastDayOn: period.endedOn === null ? null : isoOf(period.end - 1),
        doseText: period.doseText,
      });
    }
    if (segments.length > 0) rows.push({ id: medication.id, name: medication.name, segments, periods });
    else if (medication.periods.every((period) => period.end <= from)) endedBeforeCount += 1;
  }

  const symptomRows = symptoms.map((symptom) => ({
    id: symptom.id,
    name: symptom.name,
    marks: symptom.days
      .filter((entry) => entry.dayNo >= from && entry.dayNo < to)
      .map((entry) => ({ day: entry.day, position: (entry.dayNo - from + 0.5) / days, severity: entry.severity })),
  }));

  return {
    key,
    from: isoOf(from),
    to: isoOf(to),
    days,
    todayPosition: (todayNo - from + 0.5) / days,
    medications: rows,
    endedBeforeCount,
    symptoms: symptomRows,
    months: monthTicks(from, to, days),
  };
}

export function buildTimeline(input: BuildTimelineInput): TimelineModel {
  const todayNo = dayNumber(input.today);
  const tomorrow = todayNo + 1;
  const medications = prepareMedications(input.medications, tomorrow);
  const symptoms = prepareSymptoms(input.symptoms);

  // "Całość" starts on the earlier of the first period and the first entry; never after today, so it is never empty.
  let allFrom = todayNo;
  for (const medication of medications) allFrom = Math.min(allFrom, medication.firstStart);
  for (const symptom of symptoms) if (symptom.days.length > 0) allFrom = Math.min(allFrom, symptom.days[0].dayNo);

  const ranges: Record<TimelineRangeKey, TimelineRange> = {
    "90d": buildRange("90d", tomorrow - TIMELINE_RANGE_DAYS["90d"], tomorrow, todayNo, medications, symptoms),
    year: buildRange("year", tomorrow - TIMELINE_RANGE_DAYS.year, tomorrow, todayNo, medications, symptoms),
    all: buildRange("all", allFrom, tomorrow, todayNo, medications, symptoms),
  };

  return {
    today: input.today,
    ranges,
    symptomOptions: symptoms.map((symptom) => ({ id: symptom.id, name: symptom.name })),
    // "Całość" reaches back to the first period, so it holds every medication that can be drawn at all.
    medicationOptions: ranges.all.medications.map((row) => ({ id: row.id, name: row.name })),
  };
}

// Rough width of one character of the dose label and the room kept around it, in px of the drawn SVG (text-xs).
export const LABEL_CHAR_WIDTH_PX = 6.5;
export const LABEL_PADDING_PX = 8;

/** Whether the dose text fits inside a segment this wide; when it does not, the segment is drawn without it. */
export function labelFits(segmentWidthPx: number, text: string): boolean {
  return text.length > 0 && text.length * LABEL_CHAR_WIDTH_PX + LABEL_PADDING_PX <= segmentWidthPx;
}

// ---------------------------------------------------------------------------
// Filters without JavaScript. The page renders every range and every symptom row; the rules below, built on the
// server, hide all but the chosen combination with `:has()`. They only ever hide (`display: none`), so they never
// dictate a row's own layout (grid on desktop), and every rule starts with `#tl`, so it outranks any class rule of
// the layout. Selector contract the page (TimelineView.astro) must render against:
//
//   #tl                          one element wrapping the controls, the chart and the text list
//   input[name=tl-range]         radios, ids TIMELINE_DOM.rangeInput(key), "90d" checked by default
//   .rng-<key>                   every element that belongs to one range only (TIMELINE_DOM.rangeClass(key))
//   select#tl-sym                symptom drop-down; first option value="" (selected), then one per symptomOptions id
//   [data-s="<symptom id>"]      every row/item of one symptom, in the chart and in the text list
//   .tl-sym-hint                 the hint shown while no symptom is chosen
//   form#tl-meds                 the medication checkboxes and nothing else (the reset button joins via form=)
//   input#tl-m-<medication id>   one checkbox per medicationOptions id, checked by default; it carries no data-m
//   [data-m="<medication id>"]   every row/item of one medication, in the chart and in the text list
//   .tl-meds-hidden              "Część leków jest ukryta." with the "Pokaż wszystkie" button
//
// The range radios and the drop-down stay outside form#tl-meds, so its reset button restores only the medications.

export const TIMELINE_DOM = {
  root: "tl",
  rangeName: "tl-range",
  rangeInput: (key: TimelineRangeKey) => `tl-range-${key}`,
  rangeClass: (key: TimelineRangeKey) => `rng-${key}`,
  symptomSelect: "tl-sym",
  symptomAttr: "data-s",
  symptomHintClass: "tl-sym-hint",
  medicationsForm: "tl-meds",
  medicationInput: (id: string) => `tl-m-${id}`,
  medicationAttr: "data-m",
  medicationsHiddenClass: "tl-meds-hidden",
} as const;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Only ids of this shape reach the filter rules; the page should render rows and options only for these ids too. */
export function isUuid(value: string): boolean {
  return UUID.test(value);
}

/**
 * The rules of the page's `<style is:inline set:html>`. `set:html` skips Astro's escaping, so this function is the
 * only gate between the data and the page: it inserts nothing but ids matching the uuid pattern, skips every other id,
 * and every other character of the result is fixed text written here.
 */
export function buildFilterCss(model: Pick<TimelineModel, "symptomOptions" | "medicationOptions">): string {
  const rules: string[] = [];
  const root = `#${TIMELINE_DOM.root}`;

  for (const key of TIMELINE_RANGE_KEYS) {
    const others = TIMELINE_RANGE_KEYS.filter((other) => other !== key)
      .map((other) => `.${TIMELINE_DOM.rangeClass(other)}`)
      .join(",");
    rules.push(`${root}:has(#${TIMELINE_DOM.rangeInput(key)}:checked) :is(${others}){display:none}`);
  }

  const select = `#${TIMELINE_DOM.symptomSelect}`;
  const symptomAttr = TIMELINE_DOM.symptomAttr;
  rules.push(`${root}:has(${select} option[value=""]:checked) [${symptomAttr}]{display:none}`);
  rules.push(`${root}:has(${select} option:checked:not([value=""])) .${TIMELINE_DOM.symptomHintClass}{display:none}`);
  for (const { id } of model.symptomOptions) {
    if (!isUuid(id)) continue;
    rules.push(
      `${root}:has(${select} option[value="${id}"]:checked) [${symptomAttr}]:not([${symptomAttr}="${id}"]){display:none}`,
    );
  }

  for (const { id } of model.medicationOptions) {
    if (!isUuid(id)) continue;
    rules.push(
      `${root}:has(#${TIMELINE_DOM.medicationInput(id)}:not(:checked)) [${TIMELINE_DOM.medicationAttr}="${id}"]{display:none}`,
    );
  }
  rules.push(
    `${root}:not(:has(#${TIMELINE_DOM.medicationsForm} input[type="checkbox"]:not(:checked))) .${TIMELINE_DOM.medicationsHiddenClass}{display:none}`,
  );

  return rules.join("\n");
}
