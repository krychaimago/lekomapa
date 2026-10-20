// Validation bubble texts: every string in src/lib/copy/validation.ts passes the FR-012 stem filter.
// No REQUIRED_PHRASE: these texts do not link a medicine to a symptom (see lessons.md, "Filtr języka…").

import assert from "node:assert/strict";
import { test } from "node:test";

import { VALIDATION_COPY } from "../../src/lib/copy/validation.ts";
import { forbiddenWordsIn } from "../rpl/pairs.mjs";

test("no validation text hits a forbidden stem and none is empty", () => {
  const texts = Object.entries(VALIDATION_COPY);
  assert.ok(texts.length > 0, "module exports no texts");
  for (const [key, text] of texts) {
    assert.equal(typeof text, "string", key);
    assert.ok(text.trim().length > 0, key);
    assert.deepEqual(forbiddenWordsIn(text), [], `${key}: "${text}"`);
  }
});
