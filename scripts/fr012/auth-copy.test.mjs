// FR-012 for the entry screens (S-01): every string in src/lib/copy/auth.ts passes the same stem filter as the other
// copy modules. No REQUIRED_PHRASE: these texts do not link a medicine to a symptom (see lessons.md, "Filtr języka…").

import assert from "node:assert/strict";
import { test } from "node:test";

import { AUTH_COPY } from "../../src/lib/copy/auth.ts";
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

const texts = collectTexts(AUTH_COPY);

test("no entry screen text hits a forbidden stem", () => {
  assert.ok(texts.length > 0, "module exports no texts");
  for (const [path, text] of texts) {
    assert.deepEqual(forbiddenWordsIn(text), [], `${path}: "${text}"`);
  }
});
