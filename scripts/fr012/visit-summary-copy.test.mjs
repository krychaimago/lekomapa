// FR-012 for the "Do omówienia z lekarzem" section (S-08): every text in src/lib/copy/visit-summary.ts passes the stem
// filter with no exception. These texts gather questions and pairs but never link a medicine to a symptom themselves —
// the questions come from S-06 and the pair descriptions from S-02, both checked in their own tests — so the required
// wording is not demanded here (see lessons.md, "Filtr języka…").

import assert from "node:assert/strict";
import { test } from "node:test";

import { VISIT_SUMMARY_COPY } from "../../src/lib/copy/visit-summary.ts";
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

const texts = collectTexts(VISIT_SUMMARY_COPY);

test("no text of the section hits a forbidden stem", () => {
  assert.ok(texts.length > 0, "module exports no texts");
  for (const [path, text] of texts) {
    assert.deepEqual(forbiddenWordsIn(text), [], `${path}: "${text}"`);
  }
});

test("every text the section needs exists and is not empty", () => {
  const keys = [
    "title",
    "intro",
    "introAddMedication",
    "introAddSymptom",
    "pairLabel",
    "noCurrentMedications",
    "oneMedication",
    "noPairFound",
    "questionsHeading",
    "noQuestions",
    "journalLink",
    "withoutQuestion",
    "askDoctorOrPharmacist",
    "questionsNote",
    "loadError",
  ];
  for (const key of keys) {
    assert.equal(typeof VISIT_SUMMARY_COPY[key], "string", key);
    assert.notEqual(VISIT_SUMMARY_COPY[key].trim(), "", key);
  }
});

test("templates carry the markers the screen replaces", () => {
  assert.match(VISIT_SUMMARY_COPY.pairLabel, /\{lek\}.*\{drugi\}/u);
  assert.match(VISIT_SUMMARY_COPY.withoutQuestion, /\{objawy\}/u);
});
