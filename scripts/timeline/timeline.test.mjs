// The medication and symptom timeline (S-09, FR-013): what the chart model holds. Expected values are written by hand
// from the plan's rules, not computed with the module: "90 dni" = [today − 89, today + 1), "rok" = [today − 364,
// today + 1), "całość" from the earlier of the first period and the first entry; periods `[startedOn, endedOn)`;
// medications ordered by the start of their first period, then by name — never by input order or suspicion (FR-012);
// an entry's day is its day in Polish time; one mark per day with the strongest severity.
//
// Today is 17.10.2026 unless a test says otherwise, so "90 dni" runs from 20.07.2026 to 17.10.2026 (to = 18.10.2026)
// and the range is 90 days wide: a day d days after 20.07.2026 starts at d/90.

import assert from "node:assert/strict";
import { test } from "node:test";

import { buildFilterCss, buildTimeline, labelFits } from "../../src/lib/services/timeline.ts";

// Run in a zone other than Warsaw: on a machine already in Europe/Warsaw the day of an entry would come out right even
// without the conversion. The Worker runs in UTC. Set before any test runs.
process.env.TZ = "UTC";

const TODAY = "2026-10-17";

let nextId = 0;
function med(name, periods, id = undefined) {
  nextId += 1;
  return {
    id: id ?? `med-${nextId}`,
    name,
    discontinuedOn: periods.at(-1)?.[1] ?? null,
    periods: periods.map(([startedOn, endedOn, doseText = "1 tabletka"]) => ({
      startedOn,
      endedOn,
      doseText,
      strength: null,
      pharmaceuticalForm: null,
    })),
  };
}

const symptom = (name, entries, id = `symptom-${name}`) => ({
  symptomId: id,
  name,
  entries: entries.map(([occurredAt, severity = null]) => ({ occurredAt, severity })),
});

const build = ({ medications = [], symptoms = [], today = TODAY } = {}) =>
  buildTimeline({ medications, symptoms, today });
const names = (rows) => rows.map((row) => row.name);

test("the 90-day range is 20.07.2026 to 17.10.2026 and the year range 18.10.2025 to 17.10.2026", () => {
  const { ranges } = build();
  assert.equal(ranges["90d"].from, "2026-07-20");
  assert.equal(ranges["90d"].to, "2026-10-18");
  assert.equal(ranges["90d"].days, 90);
  assert.equal(ranges.year.from, "2025-10-18");
  assert.equal(ranges.year.to, "2026-10-18");
  assert.equal(ranges.year.days, 365);
});

test("medications go by the start of their first period, a tie alphabetically, never in input order", () => {
  const input = [
    med("Zyrtec", [["2026-09-01", null]]),
    // Periods handed over newest first: the first period still is the one from 01.08.2026.
    med("Polprazol", [
      ["2026-09-15", null],
      ["2026-08-01", "2026-09-15"],
    ]),
    med("Apap", [["2026-09-01", null]]),
    med("Łzawin", [["2026-09-01", null]]),
    med("Lakcid", [["2026-09-01", null]]),
  ];
  const expected = ["Polprazol", "Apap", "Lakcid", "Łzawin", "Zyrtec"];
  assert.deepEqual(names(build({ medications: input }).ranges["90d"].medications), expected);
  assert.deepEqual(names(build({ medications: [...input].reverse() }).ranges["90d"].medications), expected);
  assert.deepEqual(names(build({ medications: input }).medicationOptions), expected);
});

test("a medication ended before the range has no row and is counted", () => {
  // ended_on 20.07.2026 = last day taken 19.07.2026, the day before the 90-day range.
  const before = med("Apap", [["2026-06-01", "2026-07-20"]]);
  // Last day taken 20.07.2026: the first day of the range.
  const lastDayInside = med("Ibuprom", [["2026-06-01", "2026-07-21"]]);
  const { ranges, medicationOptions } = build({ medications: [before, lastDayInside] });

  assert.deepEqual(names(ranges["90d"].medications), ["Ibuprom"]);
  assert.equal(ranges["90d"].endedBeforeCount, 1);
  const [segment] = ranges["90d"].medications[0].segments;
  assert.equal(segment.startedOn, "2026-07-20");
  assert.equal(segment.endedOn, "2026-07-21");
  assert.equal(segment.start, 0);
  assert.equal(segment.end, 1 / 90);

  // Both are inside the year, and both can be ticked.
  assert.deepEqual(names(ranges.year.medications), ["Apap", "Ibuprom"]);
  assert.equal(ranges.year.endedBeforeCount, 0);
  assert.deepEqual(names(medicationOptions), ["Apap", "Ibuprom"]);
});

test("a dose change gives two segments touching on the day of the change", () => {
  const medication = med("Polprazol", [
    ["2026-08-01", "2026-09-01", "1 kapsułka"],
    ["2026-09-01", null, "2 kapsułki"],
  ]);
  const [row] = build({ medications: [medication] }).ranges["90d"].medications;
  assert.deepEqual(row.segments, [
    { startedOn: "2026-08-01", endedOn: "2026-09-01", start: 12 / 90, end: 43 / 90, doseText: "1 kapsułka" },
    // Ongoing: reaches today, so it is drawn up to the range end.
    { startedOn: "2026-09-01", endedOn: "2026-10-18", start: 43 / 90, end: 1, doseText: "2 kapsułki" },
  ]);
  assert.deepEqual(row.periods, [
    { startedOn: "2026-08-01", lastDayOn: "2026-08-31", doseText: "1 kapsułka" },
    { startedOn: "2026-09-01", lastDayOn: null, doseText: "2 kapsułki" },
  ]);
});

test("an ended medication stops at ended_on, exclusive: the last day taken is the day before", () => {
  const [row] = build({ medications: [med("Apap", [["2026-09-01", "2026-10-01"]])] }).ranges["90d"].medications;
  assert.equal(row.segments.length, 1);
  assert.equal(row.segments[0].endedOn, "2026-10-01");
  assert.equal(row.segments[0].end, 73 / 90);
  assert.equal(row.periods[0].lastDayOn, "2026-09-30");
});

test("a period started before the range is cut at its start, with the real start date kept for the text list", () => {
  const [row] = build({ medications: [med("Apap", [["2026-01-10", null]])] }).ranges["90d"].medications;
  assert.equal(row.segments[0].startedOn, "2026-07-20");
  assert.equal(row.segments[0].start, 0);
  assert.equal(row.periods[0].startedOn, "2026-01-10");
});

test("the 90-day range holds today − 89 (20.07.2026) and not today − 90 (19.07.2026)", () => {
  const { ranges } = build({
    symptoms: [
      symptom("ból głowy", [
        ["2026-07-19T10:00:00Z", "mild"],
        ["2026-07-20T10:00:00Z", "severe"],
      ]),
    ],
  });
  assert.deepEqual(ranges["90d"].symptoms[0].marks, [{ day: "2026-07-20", position: 0.5 / 90, severity: "severe" }]);
  assert.deepEqual(
    ranges.year.symptoms[0].marks.map((mark) => mark.day),
    ["2026-07-19", "2026-07-20"],
  );
});

test("an entry at 23:30 UTC counts towards the next Polish day", () => {
  // 10.10.2026, 23:30 UTC = 11.10.2026, 01:30 in Poland (summer time).
  const [row] = build({ symptoms: [symptom("ból głowy", [["2026-10-10T23:30:00Z"]])] }).ranges["90d"].symptoms;
  assert.deepEqual(
    row.marks.map((mark) => mark.day),
    ["2026-10-11"],
  );
});

test("the Polish day follows the clock change: UTC+2 in summer, UTC+1 in winter", () => {
  const entries = [
    // 28.03.2026, 22:30 UTC = 23:30 winter time, still 28.03.2026.
    ["2026-03-28T22:30:00Z"],
    // Clocks go forward on 29.03.2026: 29.03.2026, 22:30 UTC = 30.03.2026, 00:30.
    ["2026-03-29T22:30:00Z"],
    // 24.10.2026, 22:30 UTC = 25.10.2026, 00:30 summer time.
    ["2026-10-24T22:30:00Z"],
    // Clocks go back on 25.10.2026: 25.10.2026, 22:30 UTC = 23:30 winter time, still 25.10.2026 — the same day.
    ["2026-10-25T22:30:00Z"],
  ];
  const [row] = build({ today: "2026-11-30", symptoms: [symptom("ból głowy", entries)] }).ranges.year.symptoms;
  assert.deepEqual(
    row.marks.map((mark) => mark.day),
    ["2026-03-28", "2026-03-30", "2026-10-25"],
  );
});

test("entries of one day make one mark with the strongest severity, and no severity loses to mild", () => {
  const { ranges } = build({
    symptoms: [
      symptom("ból głowy", [
        ["2026-10-01T06:00:00Z", "mild"],
        ["2026-10-01T09:00:00Z", null],
        ["2026-10-01T15:00:00Z", "moderate"],
      ]),
      symptom("mdłości", [
        ["2026-10-02T06:00:00Z", null],
        ["2026-10-02T09:00:00Z", "mild"],
        ["2026-10-02T15:00:00Z", null],
      ]),
      symptom("senność", [
        ["2026-10-03T06:00:00Z", "severe"],
        ["2026-10-03T09:00:00Z", "moderate"],
        ["2026-10-03T15:00:00Z", null],
      ]),
      symptom("wysypka", [
        ["2026-10-04T06:00:00Z", null],
        ["2026-10-04T15:00:00Z", null],
      ]),
    ],
  });
  const marks = Object.fromEntries(ranges["90d"].symptoms.map((row) => [row.name, row.marks]));
  // 01.10.2026 is day 73 after 20.07.2026: its middle is at 73.5/90.
  assert.deepEqual(marks["ból głowy"], [{ day: "2026-10-01", position: 73.5 / 90, severity: "moderate" }]);
  assert.deepEqual(marks.mdłości, [{ day: "2026-10-02", position: 74.5 / 90, severity: "mild" }]);
  assert.deepEqual(marks.senność, [{ day: "2026-10-03", position: 75.5 / 90, severity: "severe" }]);
  assert.deepEqual(marks.wysypka, [{ day: "2026-10-04", position: 76.5 / 90, severity: null }]);
});

test("a symptom without entries in the range keeps an empty row and stays in the drop-down", () => {
  const model = build({ symptoms: [symptom("ból głowy", [["2025-01-10T10:00:00Z", "mild"]])] });
  assert.deepEqual(model.ranges["90d"].symptoms, [{ id: "symptom-ból głowy", name: "ból głowy", marks: [] }]);
  assert.deepEqual(model.symptomOptions, [{ id: "symptom-ból głowy", name: "ból głowy" }]);
  assert.equal(model.ranges.all.symptoms[0].marks.length, 1);
});

test("the drop-down lists symptoms alphabetically in Polish whatever the input order", () => {
  const input = [
    symptom("zgaga", []),
    symptom("łzawienie", []),
    symptom("ból głowy", []),
    symptom("lęk", []),
    symptom("ćmienie", []),
  ];
  const expected = ["ból głowy", "ćmienie", "lęk", "łzawienie", "zgaga"];
  assert.deepEqual(names(build({ symptoms: input }).symptomOptions), expected);
  assert.deepEqual(names(build({ symptoms: [...input].reverse() }).symptomOptions), expected);
  assert.deepEqual(names(build({ symptoms: input }).ranges["90d"].symptoms), expected);
});

test("the whole range starts on the earlier of the first period and the first entry", () => {
  const medications = [med("Apap", [["2026-03-01", null]])];
  const earlierEntry = build({ medications, symptoms: [symptom("ból głowy", [["2026-02-10T10:00:00Z"]])] });
  assert.equal(earlierEntry.ranges.all.from, "2026-02-10");
  assert.equal(earlierEntry.ranges.all.to, "2026-10-18");

  const earlierPeriod = build({ medications, symptoms: [symptom("ból głowy", [["2026-04-01T10:00:00Z"]])] });
  assert.equal(earlierPeriod.ranges.all.from, "2026-03-01");
  // 01.03.2026 to 17.10.2026: 31 + 30 + 31 + 30 + 31 + 31 + 30 + 17 = 231 days.
  assert.equal(earlierPeriod.ranges.all.days, 231);
});

test("an ongoing period starting after today gives no segment, no row and no checkbox", () => {
  const model = build({ medications: [med("Apap", [["2026-10-20", null]])] });
  for (const key of ["90d", "year", "all"]) {
    assert.deepEqual(model.ranges[key].medications, []);
    assert.equal(model.ranges[key].endedBeforeCount, 0);
  }
  assert.deepEqual(model.medicationOptions, []);
  // Nothing drawn: the whole range falls back to today alone, never a range starting after today.
  assert.equal(model.ranges.all.from, "2026-10-17");
});

test("month ticks of the 90-day range: 1 August, 1 September, 1 October, with Polish short names", () => {
  const { ranges } = build();
  assert.deepEqual(ranges["90d"].months, [
    { day: "2026-08-01", position: 12 / 90, label: "sie", year: 2026 },
    { day: "2026-09-01", position: 43 / 90, label: "wrz", year: 2026 },
    { day: "2026-10-01", position: 73 / 90, label: "paź", year: 2026 },
  ]);
  assert.equal(ranges["90d"].todayPosition, 89.5 / 90);
  assert.deepEqual(
    ranges.year.months.map((tick) => `${tick.label} ${tick.year}`),
    [
      "lis 2025",
      "gru 2025",
      "sty 2026",
      "lut 2026",
      "mar 2026",
      "kwi 2026",
      "maj 2026",
      "cze 2026",
      "lip 2026",
      "sie 2026",
      "wrz 2026",
      "paź 2026",
    ],
  );
});

test("a dose label fits only a segment wide enough for it", () => {
  assert.equal(labelFits(200, "1 tabletka"), true);
  assert.equal(labelFits(20, "1 tabletka"), false);
  assert.equal(labelFits(200, ""), false);
});

const GOOD_MEDICATION = "3f1c2b4a-9d8e-4f7a-8b6c-5d4e3f2a1b0c";
const GOOD_SYMPTOM = "a0b1c2d3-e4f5-4a6b-8c7d-9e0f1a2b3c4d";
const INJECTION = 'x"]</style><script>alert(1)</script>';

test("filter rules carry valid uuids and drop any other id, so nothing can break out of the style block", () => {
  const model = build({
    medications: [
      med("Apap", [["2026-09-01", null]], GOOD_MEDICATION),
      med("Ibuprom", [["2026-09-01", null]], INJECTION),
    ],
    symptoms: [symptom("ból głowy", [["2026-10-01T10:00:00Z"]], GOOD_SYMPTOM), symptom("mdłości", [], INJECTION)],
  });
  // Both rows are in the model; only the filter rules skip the bad id.
  assert.equal(model.medicationOptions.length, 2);
  assert.equal(model.symptomOptions.length, 2);

  const css = buildFilterCss(model);
  assert.equal(css.includes("<"), false);
  assert.equal(css.includes("script"), false);
  assert.equal(css.includes("alert"), false);
  assert.ok(
    css.includes(`#tl:has(#tl-m-${GOOD_MEDICATION}:not(:checked)) [data-m="${GOOD_MEDICATION}"]{display:none}`),
  );
  assert.ok(
    css.includes(
      `#tl:has(#tl-sym option[value="${GOOD_SYMPTOM}"]:checked) [data-s]:not([data-s="${GOOD_SYMPTOM}"]){display:none}`,
    ),
  );
});

test("filter rules switch the range, hide symptom rows until one is chosen and show the hidden-medications note", () => {
  const css = buildFilterCss(build());
  assert.ok(css.includes("#tl:has(#tl-range-90d:checked) :is(.rng-year,.rng-all){display:none}"));
  assert.ok(css.includes("#tl:has(#tl-range-year:checked) :is(.rng-90d,.rng-all){display:none}"));
  assert.ok(css.includes("#tl:has(#tl-range-all:checked) :is(.rng-90d,.rng-year){display:none}"));
  assert.ok(css.includes('#tl:has(#tl-sym option[value=""]:checked) [data-s]{display:none}'));
  assert.ok(css.includes('#tl:has(#tl-sym option:checked:not([value=""])) .tl-sym-hint{display:none}'));
  assert.ok(css.includes('#tl:not(:has(#tl-meds input[type="checkbox"]:not(:checked))) .tl-meds-hidden{display:none}'));
});
