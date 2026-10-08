// FR-012 for the terms of use and the privacy page (S-01): every string in src/lib/copy/terms.ts passes the same
// stem filter as the other copy modules. No REQUIRED_PHRASE: these texts do not link a medicine to a symptom
// (see lessons.md, "Filtr języka…").

import assert from "node:assert/strict";
import { test } from "node:test";

import { LEGAL_LINKS_COPY, PRIVACY_COPY, TERMS_V1 } from "../../src/lib/copy/terms.ts";
import { forbiddenWordsIn } from "../rpl/pairs.mjs";

// Lines of the approved terms v1 that the filter rejects on purpose. Both are disclaimers the PRD requires: they deny
// advice and deny safety, which is what FR-012 asks the product to say. Each entry is the exact line with the exact
// stems it hits — change one word and the exception no longer matches, so the line goes back through the filter.
// Only terms lines belong here: version 1 is immutable, other copy is reworded until it passes.
const ACCEPTED_TERMS_LINES = [
  {
    text: "Nie jest podstawą do zmiany dawkowania. Decyzje o leczeniu podejmuj z lekarzem lub farmaceutą.",
    stems: ["odstaw", "dawk"],
    reason:
      "`odstaw` sits inside `podstawą`; `dawk` names the dose only to deny that the app is a basis for changing it.",
  },
  {
    text: "Brak informacji o interakcji nie oznacza, że połączenie leków jest bezpieczne. Lekomapa zna tylko wybrane leki i wybrane interakcje.",
    stems: ["bezpieczn"],
    reason: "FR-012 requires saying outright that a missing warning does not mean safe.",
  },
];

// → [[path, text]] for every string in the module. Any other value type fails loudly: a function or number
// would hide text from the filter.
function collectTexts(value, path = []) {
  if (typeof value === "string") return [[path.join("."), value]];
  if (value !== null && typeof value === "object") {
    return Object.entries(value).flatMap(([key, child]) => collectTexts(child, [...path, key]));
  }
  throw new TypeError(`${path.join(".")} is ${typeof value}, expected a string or an object of strings`);
}

const termsTexts = collectTexts(TERMS_V1, ["TERMS_V1"]);
const pageTexts = [
  ...collectTexts(PRIVACY_COPY, ["PRIVACY_COPY"]),
  ...collectTexts(LEGAL_LINKS_COPY, ["LEGAL_LINKS_COPY"]),
];

test("no terms or privacy text hits a forbidden stem, except the listed terms lines", () => {
  assert.ok(termsTexts.length > 0 && pageTexts.length > 0, "module exports no texts");
  const accepted = new Set(ACCEPTED_TERMS_LINES.map(({ text }) => text));
  for (const [path, text] of [...termsTexts, ...pageTexts]) {
    if (path.startsWith("TERMS_V1") && accepted.has(text)) continue;
    assert.deepEqual(forbiddenWordsIn(text), [], `${path}: "${text}"`);
  }
});

test("each accepted terms line is still in the terms and hits exactly its listed stems", () => {
  const shown = new Set(termsTexts.map(([, text]) => text));
  for (const { text, stems } of ACCEPTED_TERMS_LINES) {
    assert.ok(shown.has(text), `no longer in TERMS_V1, remove the exception: "${text}"`);
    assert.deepEqual([...forbiddenWordsIn(text)].sort(), [...stems].sort(), text);
  }
});
