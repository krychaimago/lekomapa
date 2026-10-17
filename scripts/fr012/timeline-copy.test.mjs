// FR-012 for the timeline screen (S-09, FR-013): every text in src/lib/copy/timeline.ts passes the stem filter with no
// exception. The timeline shows dates, not relations — no text links a medicine to a symptom — so the required wording
// is not demanded here (see lessons.md, "Filtr języka…").

import assert from "node:assert/strict";
import { test } from "node:test";

import { TIMELINE_COPY } from "../../src/lib/copy/timeline.ts";
import { forbiddenWordsIn } from "../rpl/pairs.mjs";

// → [[path, text]] for every string in the module. Any other value type fails loudly: a function or number
// would hide text from the filter.
function collectTexts(value, path = []) {
  if (typeof value === "string") return [[path.join("."), value]];
  if (value !== null && typeof value === "object") {
    return Object.entries(value).flatMap(([key, child]) => collectTexts(child, [...path, key]));
  }
  throw new TypeError(`${path.join(".")} is ${typeof value}, expected a string or an object of strings`);
}

const texts = collectTexts(TIMELINE_COPY);

test("no text of the timeline hits a forbidden stem", () => {
  assert.ok(texts.length > 0, "module exports no texts");
  for (const [path, text] of texts) {
    assert.deepEqual(forbiddenWordsIn(text), [], `${path}: "${text}"`);
  }
});

test("every text the timeline needs exists and is not empty", () => {
  const keys = [
    "title",
    "intro",
    "rangeLegend",
    "range90d",
    "rangeYear",
    "rangeAll",
    "symptomLabel",
    "symptomPlaceholder",
    "showMedications",
    "medicationsHidden",
    "showAll",
    "medicationsHeading",
    "symptomHeading",
    "symptomHint",
    "noEntriesInRange",
    "endedBeforeOne",
    "endedBeforeFew",
    "endedBeforeMany",
    "legendBars",
    "legendDots",
    "note",
    "textListSummary",
    "emptyIntro",
    "noMedications",
    "noSymptoms",
    "loadError",
    "timelineLink",
    "chartLabel",
  ];
  for (const key of keys) {
    assert.equal(typeof TIMELINE_COPY[key], "string", key);
    assert.notEqual(TIMELINE_COPY[key].trim(), "", key);
  }
});

test("the note says the timeline shows dates, not relations, and points to the doctor or pharmacist", () => {
  assert.equal(
    TIMELINE_COPY.note,
    "Oś pokazuje daty, nie związki. O każdy lek i objaw możesz zapytać lekarza lub farmaceutę.",
  );
});

test("templates carry the markers the screen replaces", () => {
  for (const key of ["endedBeforeOne", "endedBeforeFew", "endedBeforeMany"]) {
    assert.match(TIMELINE_COPY[key], /\{liczba\}/u, key);
  }
  assert.match(TIMELINE_COPY.textPeriod, /\{od\}.*\{do\}.*\{ilość\}/u);
  assert.match(TIMELINE_COPY.textPeriodOngoing, /\{od\}.*\{ilość\}/u);
  assert.match(TIMELINE_COPY.textMedicationItem, /\{lek\}.*\{okresy\}/u);
  assert.match(TIMELINE_COPY.textSymptomItem, /\{objaw\}.*\{wpisy\}/u);
  assert.match(TIMELINE_COPY.textEntryWithSeverity, /\{data\}.*\{nasilenie\}/u);
});
