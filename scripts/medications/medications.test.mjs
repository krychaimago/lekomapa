// Pure helpers behind the medication screens (S-02). The list order is a product rule (FR-012, US-01): medicines
// stand in order of their start, never by suspicion, so the interaction flag must not move anything.

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  earliestChangeDate,
  escapeLikePattern,
  formatIsoDate,
  groupRegistryResults,
  lastDayOfPeriod,
  nextDay,
  orderMedications,
  registryCompositionNames,
  similarSubstances,
  todayInWarsaw,
  variantText,
} from "../../src/lib/services/medications.ts";

// Run in a zone other than Warsaw: on a machine already in Europe/Warsaw, todayInWarsaw would pass even without its
// `timeZone` option. The Worker runs in UTC, so UTC is the zone that matters. Set before any test runs.
process.env.TZ = "UTC";

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
    { id: "id-ibuprom", product_name: "Ibuprom" },
    { id: "id-bibloc-1", product_name: "Bibloc" },
    { id: "id-bibloc-2", product_name: "BIBLOC" },
    { id: "id-aceno", product_name: "Acenocumarol WZF" },
  ];
  assert.deepEqual(groupRegistryResults(rows), [
    { name: "Acenocumarol WZF", variants: 1, productId: "id-aceno" },
    { name: "Bibloc", variants: 2, productId: "id-bibloc-1" },
    { name: "Ibuprom", variants: 1, productId: "id-ibuprom" },
  ]);
});

test("a group carries the id of its first row in result order, not of a later variant", () => {
  // The link to a name's variants carries this id instead of the name; the page reads the name back from it.
  const rows = [
    { id: "second-name-first-row", product_name: "Nurofen" },
    { id: "first-row", product_name: "Ibuprom" },
    { id: "second-row", product_name: "ibuprom" },
    { id: "third-row", product_name: "IBUPROM" },
  ];
  const groups = groupRegistryResults(rows);
  assert.equal(groups.find((group) => group.name === "Ibuprom")?.productId, "first-row");
  assert.equal(groups.find((group) => group.name === "Nurofen")?.productId, "second-name-first-row");
});

test("product names are sorted in Polish alphabetical order, L before Ł", () => {
  // "Alphabetically" (plan S-02) means the Polish alphabet (author's decision, 4.10.2026). The default collation
  // treats Ł as a variant of L and would put "Łagodny" first, because "a" comes before "o".
  const rows = [
    { id: "id-lagodny", product_name: "Łagodny" },
    { id: "id-lorafen", product_name: "Lorafen" },
  ];
  assert.deepEqual(groupRegistryResults(rows), [
    { name: "Lorafen", variants: 1, productId: "id-lorafen" },
    { name: "Łagodny", variants: 1, productId: "id-lagodny" },
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

test("an entry with a diacritic before the fourth character still finds the dictionary entry", () => {
  // Folding ignores diacritics (plan S-02), also where they break the four-character prefix.
  assert.deepEqual(similarSubstances("dićlofenac", DICTIONARY), ["diclofenacum"]);
});

test("an entry equal to a dictionary name finds that name", () => {
  assert.deepEqual(similarSubstances("ibuprofenum", DICTIONARY), ["ibuprofenum"]);
});

test("an entry of exactly four characters is long enough", () => {
  // Boundary from plan S-02: a shared prefix of at least four characters.
  assert.deepEqual(similarSubstances("ibup", DICTIONARY), ["ibuprofenum"]);
});

test("a name listed twice in the dictionary is suggested once", () => {
  // Each name once (author's decision, 4.10.2026).
  assert.deepEqual(similarSubstances("ibuprofen", ["ibuprofenum", "ibuprofenum"]), ["ibuprofenum"]);
});

// The composition shown before saving must be the one add_medication_from_registry saves (FR-006: the full
// composition): one name per ATC code, the first by position; rows without a code kept, each name once.
// Rows are given out of `position` order on purpose.

test("composition names follow the registry position, not the input order", () => {
  const rows = [
    { position: 2, substance_name: "Coffeinum", atc_code: "N06BC01" },
    { position: 1, substance_name: "Paracetamolum", atc_code: "N02BE01" },
  ];
  assert.deepEqual(registryCompositionNames(rows), ["Paracetamolum", "Coffeinum"]);
});

test("a code repeated under a salt form shows the name from the lower position", () => {
  // Pattern from the registry: Dexak lists M01AE17 twice under two spellings (plan S-02). The lower-position name
  // sorts after the other alphabetically, so only the position can pick it.
  const rows = [
    { position: 2, substance_name: "Dexketoprofenum", atc_code: "M01AE17" },
    { position: 1, substance_name: "Dexketoprofenum trometamolum", atc_code: "M01AE17" },
  ];
  assert.deepEqual(registryCompositionNames(rows), ["Dexketoprofenum trometamolum"]);
});

test("rows without a code stay next to rows with a code", () => {
  // The SQL keeps every distinct uncoded name; dropping one would narrow the composition (FR-006).
  const rows = [
    { position: 3, substance_name: "Guaifenesinum", atc_code: null },
    { position: 1, substance_name: "Paracetamolum", atc_code: "N02BE01" },
    { position: 2, substance_name: "Phenylephrini hydrochloridum", atc_code: null },
  ];
  assert.deepEqual(registryCompositionNames(rows), ["Paracetamolum", "Phenylephrini hydrochloridum", "Guaifenesinum"]);
});

test("the same name under two codes is shown once", () => {
  const rows = [
    { position: 2, substance_name: "Diclofenacum", atc_code: "M02AA15" },
    { position: 1, substance_name: "Diclofenacum", atc_code: "M01AB05" },
  ];
  assert.deepEqual(registryCompositionNames(rows), ["Diclofenacum"]);
});

test("an empty composition gives no names", () => {
  assert.deepEqual(registryCompositionNames([]), []);
});

test("an ISO date is shown as day.month.year", () => {
  // Date format in the medication list and details (author's decision, 4.10.2026).
  assert.equal(formatIsoDate("2026-10-01"), "01.10.2026");
});

// Periods are `[started_on, ended_on)`: the details screen shows the day before the saved end date (S-03).
test("the last day of a period is the day before its saved end date", () => {
  assert.equal(lastDayOfPeriod("2026-10-10"), "2026-10-09");
  assert.equal(lastDayOfPeriod("2026-03-01"), "2026-02-28");
  assert.equal(lastDayOfPeriod("2028-03-01"), "2028-02-29");
  assert.equal(lastDayOfPeriod("2027-01-01"), "2026-12-31");
});

test("the next day rolls over month and year ends and 29 February", () => {
  assert.equal(nextDay("2026-10-09"), "2026-10-10");
  assert.equal(nextDay("2026-02-28"), "2026-03-01");
  assert.equal(nextDay("2028-02-28"), "2028-02-29");
  assert.equal(nextDay("2028-02-29"), "2028-03-01");
  assert.equal(nextDay("2026-12-31"), "2027-01-01");
});

test("a dose change may go back fourteen days when the period started earlier", () => {
  assert.equal(earliestChangeDate("2026-01-01", "2026-10-04"), "2026-09-20");
});

test("a dose change cannot fall on or before the day the current period started", () => {
  assert.equal(earliestChangeDate("2026-10-01", "2026-10-04"), "2026-10-02");
});

test("the fourteen days back cross the end of February in a non-leap year", () => {
  assert.equal(earliestChangeDate("2026-01-01", "2026-03-05"), "2026-02-19");
});

// One label for a registry variant on every screen and in the question for the doctor (S-06), which shows it when a
// dose change kept the same dose text.
test("a registry variant reads 'Moc: … · Postać: …', skipping a missing part; no variant gives an empty label", () => {
  assert.equal(variantText({ strength: "75 µg", pharmaceutical_form: "tabletki" }), "Moc: 75 µg · Postać: tabletki");
  assert.equal(variantText({ strength: null, pharmaceutical_form: "syrop" }), "Postać: syrop");
  assert.equal(variantText({ strength: "5 mg", pharmaceutical_form: null }), "Moc: 5 mg");
  assert.equal(variantText(null), "");
});
