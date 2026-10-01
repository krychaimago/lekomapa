// Pure helpers behind the medication screens (S-02). The list order is a product rule (FR-012, US-01): medicines
// stand in order of their start, never by suspicion, so the interaction flag must not move anything.

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  escapeLikePattern,
  groupRegistryResults,
  orderMedications,
  similarSubstances,
  todayInWarsaw,
} from "../../src/lib/services/medications.ts";

const ids = (items) => items.map((item) => item.id);

test("flipping the interaction flag in the input does not change the order", () => {
  const items = [
    { id: "a", startedOn: "2026-03-01", createdAt: "2026-09-01T10:00:00Z", hasInteraction: false },
    { id: "b", startedOn: "2026-05-10", createdAt: "2026-09-01T10:00:00Z", hasInteraction: true },
    { id: "c", startedOn: "2026-01-15", createdAt: "2026-09-01T10:00:00Z", hasInteraction: true },
  ];
  const flipped = items.map((item) => ({ ...item, hasInteraction: !item.hasInteraction }));

  assert.deepEqual(ids(orderMedications(items)), ["b", "a", "c"]);
  assert.deepEqual(ids(orderMedications(flipped)), ["b", "a", "c"]);
});

test("on the same start date the medicine added later comes first", () => {
  const items = [
    { id: "older", startedOn: "2026-05-10", createdAt: "2026-09-01T08:00:00Z" },
    { id: "newer", startedOn: "2026-05-10", createdAt: "2026-09-02T08:00:00Z" },
  ];
  assert.deepEqual(ids(orderMedications(items)), ["newer", "older"]);
});

test("names differing only in case form one group, alphabetically, with the variant count", () => {
  const rows = [
    { product_name: "Ibuprom" },
    { product_name: "Bibloc" },
    { product_name: "BIBLOC" },
    { product_name: "Acenocumarol WZF" },
  ];
  assert.deepEqual(groupRegistryResults(rows), [
    { name: "Acenocumarol WZF", variants: 1 },
    { name: "Bibloc", variants: 2 },
    { name: "Ibuprom", variants: 1 },
  ]);
});

test("LIKE wildcards and the escape character typed by the user become literals", () => {
  const pattern = escapeLikePattern("50%_a\\b");
  assert.equal(pattern, "50\\%\\_a\\\\b");
  // No wildcard is left without the escape character in front of it.
  assert.doesNotMatch(pattern.replace(/\\./g, ""), /[%_\\]/);
});

test("today is the Warsaw date, not the UTC one", () => {
  // 22:30 UTC on 30 September is 00:30 on 1 October in Warsaw (CEST, UTC+2).
  assert.equal(todayInWarsaw(new Date("2026-09-30T22:30:00Z")), "2026-10-01");
  // 23:30 UTC on 1 December is 00:30 on 2 December in Warsaw (CET, UTC+1).
  assert.equal(todayInWarsaw(new Date("2026-12-01T23:30:00Z")), "2026-12-02");
});

// A slice of the real dictionary (registry_substances.normalized_name with a code), not names made up to fit.
const DICTIONARY = ["dexibuprofenum", "diclofenacum", "ibuprofenum", "indometacinum", "ketoprofenum", "warfarinum"];

test("a Polish leaflet name finds the Latin dictionary entry", () => {
  assert.deepEqual(similarSubstances("ibuprofen", DICTIONARY), ["ibuprofenum"]);
});

test("an entry sharing no prefix with the dictionary finds nothing", () => {
  assert.deepEqual(similarSubstances("xyz", DICTIONARY), []);
});

test("case and diacritics do not matter when comparing", () => {
  assert.deepEqual(similarSubstances("  IBUPRÓFEN ", DICTIONARY), ["ibuprofenum"]);
  assert.deepEqual(similarSubstances("Wałfarin", ["walfarinum"]), ["walfarinum"]);
});

test("a shared prefix shorter than four characters is not similar", () => {
  assert.deepEqual(similarSubstances("ibux", DICTIONARY), []);
  assert.deepEqual(similarSubstances("ibu", DICTIONARY), []);
});

test("at most five names, the longest shared prefix first", () => {
  const names = ["abcd1", "abcd2", "abcd3", "abcde4", "abcd5", "abcd6", "abcdef"];
  const result = similarSubstances("abcdefgh", names);
  assert.equal(result.length, 5);
  assert.deepEqual(result.slice(0, 2), ["abcdef", "abcde4"]);
});
