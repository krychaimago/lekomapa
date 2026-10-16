// The "Wizyta" section (S-08, US-03, FR-011): which entry of a symptom the question is built from,
// in what order the symptoms go, which pairs show once, and which empty state appears. Expected values come from the
// plan's definitions, not from the code: the newest entry is the largest `occurred_at`, not the last row added;
// symptoms go from the newest entry, a tie by name; pairs are never ordered by suspicion (FR-012).

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  composeVisitQuestions,
  currentMedicationText,
  currentMedications,
  interactionsEmptyState,
  isCurrentMedication,
  showIntro,
  uniqueInteractions,
} from "../../src/lib/services/visit-summary.ts";

// The Worker runs in UTC; days of entries must still come out in Polish time.
process.env.TZ = "UTC";

// One medication taken since 01.09.2026, so every symptom entered in September or October has a question.
const apap = {
  id: "med-apap",
  name: "Apap",
  discontinuedOn: null,
  periods: [
    { startedOn: "2026-09-01", endedOn: null, doseText: "1 tabletka", strength: null, pharmaceuticalForm: null },
  ],
};

const symptom = (name, occurrences) => ({ symptomId: `symptom-${name}`, name, occurrences });

test("the question is built from the entry with the latest symptom date, not the last one in the array", () => {
  // On 05.10.2026 an entry about 25.09.2026 was added after the one about 02.10.2026.
  const { questions } = composeVisitQuestions(
    [symptom("ból głowy", ["2026-10-02T10:00:00Z", "2026-09-25T10:00:00Z"])],
    [apap],
  );
  assert.equal(questions.length, 1);
  assert.equal(questions[0].entryOn, "2026-10-02");
  assert.equal(questions[0].firstEntryOn, "2026-09-25");
});

test("the entry count covers every entry of the symptom", () => {
  const { questions } = composeVisitQuestions(
    [symptom("ból głowy", ["2026-09-20T10:00:00Z", "2026-10-02T10:00:00Z", "2026-09-25T10:00:00Z"])],
    [apap],
  );
  assert.equal(questions[0].entryCount, 3);
});

test("symptoms go from the newest entry; on the same newest entry, alphabetically", () => {
  const { questions } = composeVisitQuestions(
    [
      symptom("wysypka", ["2026-09-10T10:00:00Z"]),
      symptom("zawroty głowy", ["2026-10-03T10:00:00Z"]),
      symptom("ból głowy", ["2026-09-10T10:00:00Z"]),
      symptom("mdłości", ["2026-09-01T08:00:00Z", "2026-10-05T10:00:00Z"]),
    ],
    [apap],
  );
  assert.deepEqual(
    questions.map((question) => question.symptomName),
    ["mdłości", "zawroty głowy", "ból głowy", "wysypka"],
  );
});

test("a symptom with no medication in its window goes to the line without a question, alphabetically", () => {
  // The symptom was entered ten days before the medication started; the question window ends on the entry's day.
  const late = { ...apap, periods: [{ ...apap.periods[0], startedOn: "2026-10-05" }] };
  const { questions, withoutQuestion } = composeVisitQuestions(
    [
      symptom("wysypka", ["2026-09-25T10:00:00Z"]),
      symptom("ból głowy", ["2026-10-06T10:00:00Z"]),
      symptom("bezsenność", ["2026-09-24T10:00:00Z"]),
    ],
    [late],
  );
  assert.deepEqual(
    questions.map((question) => question.symptomName),
    ["ból głowy"],
  );
  assert.deepEqual(withoutQuestion, ["bezsenność", "wysypka"]);
});

// Rows as public.medication_interactions() returns them: every pair in both directions.
const row = (medicationId, otherMedicationId, pairId, description) => ({
  medication_id: medicationId,
  other_medication_id: otherMedicationId,
  pair_id: pairId,
  group_a: "B01AA",
  group_b: "M01AE",
  description,
});
const names = new Map([
  ["m-ibuprom", "Ibuprom"],
  ["m-aceno", "Acenocumarol"],
  ["m-dexak", "Dexak"],
]);

test("a pair returned in both directions shows once, with names in alphabetical order", () => {
  const items = uniqueInteractions(
    [row("m-ibuprom", "m-aceno", "p1", "Opis pary."), row("m-aceno", "m-ibuprom", "p1", "Opis pary.")],
    names,
  );
  assert.deepEqual(items, [{ firstName: "Acenocumarol", secondName: "Ibuprom", description: "Opis pary." }]);
});

test("the same two medications under two different checked pairs show twice", () => {
  const items = uniqueInteractions(
    [
      row("m-aceno", "m-ibuprom", "p1", "Pierwszy opis."),
      row("m-ibuprom", "m-aceno", "p1", "Pierwszy opis."),
      row("m-aceno", "m-ibuprom", "p2", "Drugi opis."),
      row("m-ibuprom", "m-aceno", "p2", "Drugi opis."),
    ],
    names,
  );
  assert.deepEqual(
    items.map((item) => item.description),
    ["Drugi opis.", "Pierwszy opis."],
  );
});

test("the order of pairs does not depend on the order of the rows", () => {
  const rows = [
    row("m-ibuprom", "m-dexak", "p3", "Opis C."),
    row("m-dexak", "m-ibuprom", "p3", "Opis C."),
    row("m-ibuprom", "m-aceno", "p1", "Opis A."),
    row("m-aceno", "m-ibuprom", "p1", "Opis A."),
    row("m-dexak", "m-aceno", "p2", "Opis B."),
    row("m-aceno", "m-dexak", "p2", "Opis B."),
  ];
  const expected = [
    { firstName: "Acenocumarol", secondName: "Dexak", description: "Opis B." },
    { firstName: "Acenocumarol", secondName: "Ibuprom", description: "Opis A." },
    { firstName: "Dexak", secondName: "Ibuprom", description: "Opis C." },
  ];
  assert.deepEqual(uniqueInteractions(rows, names), expected);
  assert.deepEqual(uniqueInteractions([...rows].reverse(), names), expected);
});

test("the empty state of interactions depends on the number of current medications", () => {
  assert.equal(interactionsEmptyState(0, 0), "noMedications");
  assert.equal(interactionsEmptyState(1, 0), "oneMedication");
  assert.equal(interactionsEmptyState(2, 0), "noPair");
  assert.equal(interactionsEmptyState(5, 0), "noPair");
  assert.equal(interactionsEmptyState(2, 1), null);
});

test("the intro shows only with no medication at all and no symptom", () => {
  assert.equal(showIntro(0, 0), true);
  // An ended medication is still a medication: it feeds the questions.
  assert.equal(showIntro(1, 0), false);
  assert.equal(showIntro(0, 1), false);
});

test("a medication discontinued today is no longer current; one discontinued tomorrow still is", () => {
  assert.equal(isCurrentMedication(null, "2026-10-09"), true);
  assert.equal(isCurrentMedication("2026-10-09", "2026-10-09"), false);
  assert.equal(isCurrentMedication("2026-10-08", "2026-10-09"), false);
  assert.equal(isCurrentMedication("2026-10-10", "2026-10-09"), true);
});

// S-05: the list of current medications. Expected lines are written out by hand from the plan's wording, never built
// with the code under test.
const period = (startedOn, endedOn, doseText, strength = null, pharmaceuticalForm = null) => ({
  startedOn,
  endedOn,
  doseText,
  strength,
  pharmaceuticalForm,
});
const medication = (name, periods, discontinuedOn = null) => ({ id: `med-${name}`, name, discontinuedOn, periods });
const TODAY = "2026-10-16";
const lines = (medications) => currentMedications(medications, TODAY).map(currentMedicationText);

test("a medication discontinued today is not on the list; one discontinued tomorrow and one never discontinued are", () => {
  const meds = [
    medication("Apap", [period("2026-09-01", null, "1 tabletka")], "2026-10-16"),
    medication("Ibuprom", [period("2026-09-02", null, "2 tabletki")], "2026-10-17"),
    medication("Metformax", [period("2026-09-03", null, "1 tabletka 2 razy dziennie")]),
  ];
  assert.deepEqual(lines(meds), [
    "Ibuprom — od 02.09.2026, 2 tabletki",
    "Metformax — od 03.09.2026, 1 tabletka 2 razy dziennie",
  ]);
});

test("after a dose change the line shows the new dose, its variant and the date of the change", () => {
  const meds = [
    medication("Metformax", [
      period("2026-10-01", null, "1 tabletka 2 razy dziennie", "850 mg", "tabletki powlekane"),
      period("2026-08-01", "2026-10-01", "1 tabletka", "500 mg", "tabletki"),
    ]),
  ];
  assert.deepEqual(lines(meds), [
    "Metformax (Moc: 850 mg · Postać: tabletki powlekane) — od 01.10.2026, 1 tabletka 2 razy dziennie",
  ]);
});

test("the full line with a known variant", () => {
  const meds = [
    medication("Metformax", [period("2026-09-03", null, "1 tabletka 2 razy dziennie", "500 mg", "tabletki")]),
  ];
  assert.deepEqual(lines(meds), [
    "Metformax (Moc: 500 mg · Postać: tabletki) — od 03.09.2026, 1 tabletka 2 razy dziennie",
  ]);
});

test("medications go alphabetically in Polish collation, whatever the input order", () => {
  const meds = [
    medication("Metformax", [period("2026-09-03", null, "1 tabletka")]),
    medication("Łaxil", [period("2026-09-05", null, "1 saszetka")]),
    medication("Lamisil", [period("2026-09-04", null, "1 tabletka")]),
  ];
  const expected = [
    "Lamisil — od 04.09.2026, 1 tabletka",
    "Łaxil — od 05.09.2026, 1 saszetka",
    "Metformax — od 03.09.2026, 1 tabletka",
  ];
  assert.deepEqual(lines(meds), expected);
  assert.deepEqual(lines([...meds].reverse()), expected);
});

test("the result does not depend on the order of the periods or the medications", () => {
  const periods = [
    period("2026-08-01", "2026-09-01", "1 tabletka"),
    period("2026-09-01", "2026-10-01", "2 tabletki"),
    period("2026-10-01", null, "3 tabletki"),
  ];
  const meds = [medication("Apap", periods), medication("Apap", [period("2026-07-01", null, "1 czopek")])];
  const expected = ["Apap — od 01.07.2026, 1 czopek", "Apap — od 01.10.2026, 3 tabletki"];
  assert.deepEqual(lines(meds), expected);
  assert.deepEqual(
    lines([...meds].reverse().map((med) => ({ ...med, periods: [...med.periods].reverse() }))),
    expected,
  );
});

test("a medication with no dosage period is left out", () => {
  const meds = [medication("Apap", []), medication("Ibuprom", [period("2026-09-02", null, "2 tabletki")])];
  assert.deepEqual(lines(meds), ["Ibuprom — od 02.09.2026, 2 tabletki"]);
});

test("a line without strength and form has no brackets; with strength alone, only the strength", () => {
  assert.equal(
    currentMedicationText({
      name: "Apap",
      since: "2026-09-01",
      doseText: "1 tabletka",
      strength: null,
      pharmaceuticalForm: null,
    }),
    "Apap — od 01.09.2026, 1 tabletka",
  );
  assert.equal(
    currentMedicationText({
      name: "Apap",
      since: "2026-09-01",
      doseText: "1 tabletka",
      strength: "500 mg",
      pharmaceuticalForm: null,
    }),
    "Apap (Moc: 500 mg) — od 01.09.2026, 1 tabletka",
  );
});

test("a typed name with $& or a marker is inserted as it is", () => {
  assert.equal(
    currentMedicationText({
      name: "Lek $& {data}",
      since: "2026-09-01",
      doseText: "1 {ilość} $1",
      strength: null,
      pharmaceuticalForm: null,
    }),
    "Lek $& {data} — od 01.09.2026, 1 {ilość} $1",
  );
});

test("no medications give an empty list", () => {
  assert.deepEqual(currentMedications([], TODAY), []);
});
