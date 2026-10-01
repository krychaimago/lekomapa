// FR-012 for the medication screens (review F7): titles, labels, hints and errors in src/lib/copy/medications.ts
// pass the same stem filter as pair descriptions and interaction texts. The goal is neutral wording that does not
// alarm — the filter catches stems that state a cause, frighten or suggest stopping a medicine.
// No REQUIRED_PHRASE: these texts do not link a medicine to a symptom (see lessons.md, "Filtr języka…").

import assert from "node:assert/strict";
import { test } from "node:test";

import { MEDICATION_COPY } from "../../src/lib/copy/medications.ts";
import { forbiddenWordsIn } from "../rpl/pairs.mjs";

// The form must talk about the dose ("Dawkowanie"), so the dose stem is allowed in every field. It is the reason
// these texts live outside interactions.ts.
const ALLOWED_STEMS = ["dawk"];

// Per-field exceptions, each with the only stem it may hit. fixedComposition says old diary entries "przestałyby
// się zgadzać" — about records, not about stopping a medicine.
const EXCEPTIONS = { "hints.fixedComposition": ["przesta"] };

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

test("no medication text hits a forbidden stem, except the dose stem and the named exceptions", () => {
  assert.ok(texts.length > 0, "module exports no texts");
  for (const [path, text] of texts) {
    const hits = forbiddenWordsIn(text).filter((stem) => !ALLOWED_STEMS.includes(stem));
    assert.deepEqual(hits, EXCEPTIONS[path] ?? [], `${path}: "${text}"`);
  }
});

test("the exceptions are narrow: without the named stem each text is clean", () => {
  for (const [path, stems] of Object.entries(EXCEPTIONS)) {
    const text = path.split(".").reduce((node, key) => node[key], MEDICATION_COPY);
    assert.equal(typeof text, "string", `${path} does not exist`);
    const withoutStems = stems.reduce((acc, stem) => acc.replace(new RegExp(`${stem}\\p{L}*`, "giu"), ""), text);
    const rest = forbiddenWordsIn(withoutStems).filter((stem) => !ALLOWED_STEMS.includes(stem));
    assert.deepEqual(rest, [], path);
  }
});
