// Color mode controls: every text in src/lib/copy/appearance.ts passes the FR-012 stem filter, and the "Wygląd"
// section has a label for each of the three stored preferences.
// No REQUIRED_PHRASE: these texts do not link a medicine to a symptom (see lessons.md, "Filtr języka…").

import assert from "node:assert/strict";
import { test } from "node:test";

import { APPEARANCE_COPY } from "../../src/lib/copy/appearance.ts";
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

const texts = collectTexts(APPEARANCE_COPY);

test("no appearance text hits a forbidden stem", () => {
  assert.ok(texts.length > 0, "module exports no texts");
  for (const [path, text] of texts) {
    assert.deepEqual(forbiddenWordsIn(text), [], `${path}: "${text}"`);
  }
});

test("no appearance text is empty", () => {
  for (const [path, text] of texts) {
    assert.ok(text.trim().length > 0, path);
  }
});

test("the section labels exactly the three stored preferences", () => {
  // Written out by hand, not read from THEME_PREFERENCES, so a value added there without a label fails here.
  assert.deepEqual(Object.keys(APPEARANCE_COPY.section.options).sort(), ["dark", "light", "system"]);
});
