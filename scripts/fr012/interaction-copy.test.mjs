// FR-012 for UI copy (S-02 contract, point 2): every text that speaks about a possible interaction, or about its
// absence, lives in src/lib/copy/interactions.ts and passes the same stem filter as pair descriptions.
// The oracle for the filter is scripts/fr012/corpus.mjs, written from the PRD, not from the stem list.
// This test does not require REQUIRED_PHRASE: that wording is about a medicine and a symptom, and these texts
// describe a pair of medicines, not a symptom — pair descriptions carry it and pairs.mjs checks them.

import assert from "node:assert/strict";
import { test } from "node:test";

import { INTERACTION_COPY } from "../../src/lib/copy/interactions.ts";
import { forbiddenWordsIn } from "../rpl/pairs.mjs";
import { FORBIDDEN_SENTENCES } from "./corpus.mjs";

// The one field allowed to hit a stem, and the only stem it may hit: the product must say outright that no
// warning does not mean "safe" (prd.md:49), and that sentence cannot be written without the word.
const EXCEPTIONS = { noWarningIsNotSafe: ["bezpieczn"] };

// → [[path, text]] for every string in the module. Any other value type fails loudly: a function or number
// would hide text from the filter.
function collectTexts(value, path = []) {
  if (typeof value === "string") return [[path.join("."), value]];
  if (value !== null && typeof value === "object") {
    return Object.entries(value).flatMap(([key, child]) => collectTexts(child, [...path, key]));
  }
  throw new TypeError(`${path.join(".")} is ${typeof value}, expected a string or an object of strings`);
}

const texts = collectTexts(INTERACTION_COPY);

test("the filter rejects every forbidden corpus sentence, so a clean result below means something", () => {
  for (const sentences of Object.values(FORBIDDEN_SENTENCES)) {
    for (const sentence of sentences) assert.notDeepEqual(forbiddenWordsIn(sentence), [], sentence);
  }
});

test("no interaction text hits a forbidden stem, except the named exception", () => {
  assert.ok(texts.length > 0, "module exports no texts");
  for (const [path, text] of texts) {
    assert.deepEqual(forbiddenWordsIn(text), EXCEPTIONS[path] ?? [], `${path}: "${text}"`);
  }
});

test("the exception is narrow: noWarningIsNotSafe hits only its named stem", () => {
  assert.deepEqual(forbiddenWordsIn(INTERACTION_COPY.noWarningIsNotSafe), EXCEPTIONS.noWarningIsNotSafe);
  // Without the named stem the sentence is clean — no second forbidden word hides behind the exception.
  const withoutStem = INTERACTION_COPY.noWarningIsNotSafe.replace(/bezpieczn\p{L}*/giu, "");
  assert.deepEqual(forbiddenWordsIn(withoutStem), []);
});

test("the note and the no-warning sentence exist, and the latter is a negation", () => {
  assert.notEqual(INTERACTION_COPY.note.trim(), "");
  assert.notEqual(INTERACTION_COPY.noWarningIsNotSafe.trim(), "");
  assert.match(INTERACTION_COPY.noWarningIsNotSafe, /(^|\s)nie(\s|$)/i);
  assert.ok(!FORBIDDEN_SENTENCES.safety.includes(INTERACTION_COPY.noWarningIsNotSafe));
});

// The absence text describes what was checked (pairs among current medications), never the medicine itself:
// a medicine can belong to a checked pair whose other half the user does not take (review F1).
test("the no-interaction text is scoped to current medications, not a claim about the medicine", () => {
  assert.match(INTERACTION_COPY.noInteractionsForMedication, /bieżąc/i);
  assert.doesNotMatch(INTERACTION_COPY.noInteractionsForMedication, /nie należy/i);
});
