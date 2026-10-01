// FR-012 for the medication screens (review F7): titles, labels, hints and errors in src/lib/copy/medications.ts
// pass the same stem filter as pair descriptions and interaction texts. The goal is neutral wording that does not
// alarm — the filter catches stems that state a cause, frighten or suggest stopping a medicine.
// No REQUIRED_PHRASE: these texts do not link a medicine to a symptom (see lessons.md, "Filtr języka…").

import assert from "node:assert/strict";
import { test } from "node:test";

import { MEDICATION_COPY } from "../../src/lib/copy/medications.ts";
import { forbiddenWordsIn } from "../rpl/pairs.mjs";

// The form must talk about the dose ("Dawkowanie"), so the dose stem is allowed in every field — the only exception.
// It is the reason these texts live outside interactions.ts. A new hit is reworded, not added here.
const ALLOWED_STEMS = ["dawk"];

// → [[path, text]] for every string in the module. Any other value type fails loudly: a function or number
// would hide text from the filter.
function collectTexts(value, path = []) {
  if (typeof value === "string") return [[path.join("."), value]];
  if (value !== null && typeof value === "object") {
    return Object.entries(value).flatMap(([key, child]) => collectTexts(child, [...path, key]));
  }
  throw new TypeError(`${path.join(".")} is ${typeof value}, expected a string or an object of strings`);
}

const texts = collectTexts(MEDICATION_COPY);

test("no medication text hits a forbidden stem other than the dose stem", () => {
  assert.ok(texts.length > 0, "module exports no texts");
  for (const [path, text] of texts) {
    const hits = forbiddenWordsIn(text).filter((stem) => !ALLOWED_STEMS.includes(stem));
    assert.deepEqual(hits, [], `${path}: "${text}"`);
  }
});
