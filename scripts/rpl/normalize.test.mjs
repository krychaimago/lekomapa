import assert from "node:assert/strict";
import { test } from "node:test";

import { normalizeSubstanceName } from "./normalize.mjs";

test('"Amlodipini besilas" and "Amlodipinum" normalize to the same name', () => {
  assert.equal(normalizeSubstanceName("Amlodipini besilas"), "amlodipinum");
  assert.equal(normalizeSubstanceName("Amlodipinum"), "amlodipinum");
  assert.equal(normalizeSubstanceName("Amlodipini maleas"), "amlodipinum");
});

test('"Acidum acetylsalicylicum" is not cut down to "acidum"', () => {
  assert.equal(normalizeSubstanceName("Acidum acetylsalicylicum"), "acidum acetylsalicylicum");
});

test("salt after a nominative name is removed, the name stays", () => {
  assert.equal(normalizeSubstanceName("Valsartanum dinatricum"), "valsartanum");
  assert.equal(normalizeSubstanceName("Ibuprofenum natricum dihydricum"), "ibuprofenum");
  assert.equal(normalizeSubstanceName("Dexamethasoni Natrii phosphas"), "dexamethasonum");
});

test("first word is never treated as a salt", () => {
  assert.equal(normalizeSubstanceName("Argininum"), "argininum");
  assert.equal(normalizeSubstanceName("Natricum"), "natricum");
});

test("inorganic salt starting with a metal stays whole", () => {
  assert.equal(normalizeSubstanceName("Natrii chloridum"), "natrii chloridum");
  assert.equal(normalizeSubstanceName("Kalii chloridum"), "kalii chloridum");
});

test("lowercase, without diacritics and without brackets", () => {
  assert.equal(normalizeSubstanceName("Pyridoxini hydrochloridum (Vitaminum B6)"), "pyridoxinum");
  assert.equal(normalizeSubstanceName("Atorwastyatyna z L-lizyną"), "atorwastyatyna z l-lizyna");
  assert.equal(normalizeSubstanceName("  "), "");
});

test("clopidogrel salt spellings meet under one name", () => {
  assert.equal(normalizeSubstanceName("Clopidogrelum"), "clopidogrelum");
  assert.equal(normalizeSubstanceName("Clopidogrelum hydrosulfas"), "clopidogrelum");
  assert.equal(normalizeSubstanceName("Clopidogrelum besilate"), "clopidogrelum");
  assert.equal(normalizeSubstanceName("Clopidogreli hydrogenosulfas"), "clopidogrelum");
});
