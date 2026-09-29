import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";

import { ACCEPTED_FALSE_POSITIVES, ALLOWED_SENTENCES, FORBIDDEN_SENTENCES, REQUIRED_PHRASE } from "../fr012/corpus.mjs";
import { PAIR_COLUMNS, parsePairs, validatePairs } from "./pairs.mjs";
import { REPO_ROOT } from "./snapshot.mjs";

// The oracle is scripts/fr012/corpus.mjs, written from the PRD. Every row here has a valid ATC pair, a source and a
// verified date, so the only error a description can produce is a language one.
const HEADER = PAIR_COLUMNS.map((column) => `"${column}"`).join(";");
const SOURCE = "ChPL Diovan pkt 4.5";

function validateDescription(description) {
  const row = ["C09CA", "M01AE", description, SOURCE, "2026-10-02"].map((value) => `"${value}"`).join(";");
  return validatePairs(parsePairs(`${HEADER}\n${row}\n`));
}

const reasons = (result) => result.errors.map((error) => [error.line, error.reason]);

function assertForbidden(description) {
  const result = validateDescription(description);
  assert.deepEqual(reasons(result), [[2, "forbidden_word"]]);
  assert.deepEqual(result.accepted, []);
}

for (const [kind, sentences] of Object.entries(FORBIDDEN_SENTENCES)) {
  for (const sentence of sentences) {
    test(`forbidden ${kind}: "${sentence}" is rejected even next to the required phrase`, () => {
      assertForbidden(`${sentence} Jednoczesne przyjmowanie ${REQUIRED_PHRASE} z objawami.`);
    });
  }
}

for (const sentence of FORBIDDEN_SENTENCES.cause) {
  test(`a causal second sentence "${sentence}" is rejected after a compliant first one`, () => {
    assertForbidden(`Jednoczesne przyjmowanie ${REQUIRED_PHRASE} z objawami. ${sentence}`);
  });
}

for (const sentence of ALLOWED_SENTENCES) {
  test(`allowed: "${sentence}" passes`, () => {
    assert.ok(sentence.includes(REQUIRED_PHRASE), "corpus sentence must carry the required phrase");
    const result = validateDescription(sentence);
    assert.deepEqual(result.errors, []);
    assert.equal(result.accepted.length, 1);
  });
}

for (const { sentence, stem } of ACCEPTED_FALSE_POSITIVES) {
  test(`accepted false positive: "${sentence}" is rejected by stem "${stem}"`, () => {
    assert.ok(sentence.includes(REQUIRED_PHRASE), "corpus sentence must carry the required phrase");
    const result = validateDescription(sentence);
    assert.deepEqual(reasons(result), [[2, "forbidden_word"]]);
    const listed = result.errors[0].message.split(": ").at(-1).split(", ");
    assert.ok(listed.includes(stem), `expected stem "${stem}" among ${listed.join(", ")}`);
  });
}

test("the FR-012 corpus depends on nothing, so the validator cannot shape its own oracle", async () => {
  const source = await readFile(path.join(REPO_ROOT, "scripts", "fr012", "corpus.mjs"), "utf8");
  assert.doesNotMatch(source, /^\s*import\b/m);
  assert.doesNotMatch(source, /\bimport\s*\(/);
  assert.doesNotMatch(source, /\brequire\s*\(/);
  assert.doesNotMatch(source, /\bfrom\s+["']/);
});
