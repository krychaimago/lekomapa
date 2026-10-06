// FR-012 for the question for the doctor (S-06): every template in src/lib/copy/doctor-question.ts passes the stem
// filter with no exception — not even the dose stem, which is why the dose marker is called `{ilość}`. These texts
// link a medicine to a symptom, so each question template carries the required wording (see lessons.md, "Filtr
// języka…"). The composed text with names and dates inserted is checked in scripts/doctor-question/.

import assert from "node:assert/strict";
import { test } from "node:test";

import { DOCTOR_QUESTION_COPY } from "../../src/lib/copy/doctor-question.ts";
import { QUESTION_WINDOW_DAYS } from "../../src/lib/services/doctor-question.ts";
import { REQUIRED_PHRASE } from "./corpus.mjs";
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

const texts = collectTexts(DOCTOR_QUESTION_COPY);

test("no text of the question for the doctor hits a forbidden stem", () => {
  assert.ok(texts.length > 0, "module exports no texts");
  for (const [path, text] of texts) {
    assert.deepEqual(forbiddenWordsIn(text), [], `${path}: "${text}"`);
  }
});

test("every question template carries the required wording", () => {
  for (const key of ["questionOne", "questionMany", "questionTakenOne", "questionTakenMany"]) {
    assert.ok(DOCTOR_QUESTION_COPY[key].includes(REQUIRED_PHRASE), `${key}: "${DOCTOR_QUESTION_COPY[key]}"`);
  }
});

test("texts that name the length of the window name the one the composer uses", () => {
  for (const key of ["eventsIntro", "noEvents", "noQuestion"]) {
    assert.ok(
      DOCTOR_QUESTION_COPY[key].includes(`${QUESTION_WINDOW_DAYS} dni`),
      `${key}: "${DOCTOR_QUESTION_COPY[key]}"`,
    );
  }
});
