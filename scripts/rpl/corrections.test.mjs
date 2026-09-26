import assert from "node:assert/strict";
import path from "node:path";
import { test } from "node:test";

import {
  CORRECTION_COLUMNS,
  loadCorrections,
  parseCorrections,
  parseCsv,
  prepareRegister,
  validateCorrections,
} from "./corrections.mjs";
import { REPO_ROOT } from "./snapshot.mjs";

function product(rplId, productName, atcCodes, names, procedureType = "NAR") {
  return {
    rplId,
    productName,
    procedureType,
    atcCodes,
    substances: names.map((name, index) => ({ position: index + 1, name })),
    raw: { id: rplId },
  };
}

// Small register covering every correction kind. Names and codes follow the RPL cases the plan was built on.
const PRODUCTS = [
  product("1", "Sortis", ["C10AA05"], ["Atorvastatinum calcicum trihydricum"]),
  product("2", "Norvasc", ["C08CA01"], ["Amlodipini besilas"]),
  product("3", "Amlator", ["C10BX03"], ["Atorwastyatyna z L-lizyną", "Amlodipini besilas"]),
  product("4", "Xarelto", ["B01AF01"], ["Rivaroxabanum"]),
  product("5", "Thinban", ["A10BA02"], ["Rivaroxabanum"]),
  product("6", "Rivaroxaban combo", ["B01AF51"], ["Rivaroxabanum", "Amlodipinum"]),
  product("7", "Ibuprom", ["M01AE01"], ["Ibuprofenum"]),
  product("8", "Ibuprom żel", ["M02AA13"], ["Ibuprofenum"]),
  product("9", "Combo A", ["N02BE51"], ["Ibuprofenum", "Paracetamolum"]),
  product("10", "Combo B", ["N02BE51"], ["Ibuprofenum", "Paracetamolum"]),
  product("11", "Paracetamol", ["N02BE01"], ["Paracetamolum"]),
  product("12", "Entresto", ["C09DX04"], ["Sacubitrilum", "Valsartanum"]),
  product("13", "Diovan", ["C09CA03"], ["Valsartanum"]),
  product("14", "Diovan", ["C09CA03"], [], "IR"),
  product("15", "No composition", ["C09DX"], []),
];

const HEADER = CORRECTION_COLUMNS.map((column) => `"${column}"`).join(";");
const SOURCE = "ChPL pkt 2";

// rows: [kind, rpl_id, substance, target, verified_on]
function csv(rows) {
  const lines = rows.map(([kind, rplId, substance, target, verifiedOn = "2026-09-24"]) =>
    [kind, rplId, substance, target, SOURCE, "note", verifiedOn].map((value) => `"${value}"`).join(";"),
  );
  return [HEADER, ...lines].join("\n") + "\n";
}

function validate(rows, products = PRODUCTS) {
  return validateCorrections(parseCorrections(csv(rows)), products);
}

function register(rows) {
  const result = validate(rows);
  assert.deepEqual(result.errors, [], "fixture rows are valid");
  return prepareRegister(PRODUCTS, result.applied);
}

const codesOf = (result, rplId, name) =>
  result.products
    .find((candidate) => candidate.rplId === rplId)
    .substanceCodes.filter((row) => row.name === name)
    .map((row) => [row.atcCode, row.atcSource]);
const reasons = (result) => result.errors.map((error) => [error.line, error.reason]);

test("alias gives the misspelled Polish atorvastatin name the atorvastatin code", () => {
  assert.deepEqual(codesOf(register([]), "3", "Atorwastyatyna z L-lizyną"), [[null, "unmatched"]]);
  const corrected = register([["alias", "", "Atorwastyatyna z L-lizyną", "atorvastatinum"]]);
  assert.deepEqual(codesOf(corrected, "3", "Atorwastyatyna z L-lizyną"), [["C10AA05", "derived"]]);
});

test("index_exclude removes A10BA02 from the rivaroxaban candidates", () => {
  const before = register([]);
  assert.deepEqual([...before.index.get("rivaroxabanum")].sort(), ["A10BA02", "B01AF01"]);
  const after = register([["index_exclude", "5", "", ""]]);
  assert.deepEqual([...after.index.get("rivaroxabanum")], ["B01AF01"]);
  const rows = after.products.find((candidate) => candidate.rplId === "6").substanceCodes;
  assert.deepEqual(rows.find((row) => row.name === "Rivaroxabanum").candidates, ["B01AF01"]);
});

test("product_substance_code resolves a tie in one product only and gives atc_source corrected", () => {
  const before = register([]);
  assert.deepEqual(codesOf(before, "9", "Ibuprofenum"), [
    ["M01AE01", "derived_ambiguous"],
    ["M02AA13", "derived_ambiguous"],
  ]);
  const after = register([["product_substance_code", "9", "ibuprofenum", "M01AE01"]]);
  assert.deepEqual(codesOf(after, "9", "Ibuprofenum"), [["M01AE01", "corrected"]]);
  assert.deepEqual(
    codesOf(after, "10", "Ibuprofenum"),
    codesOf(before, "10", "Ibuprofenum"),
    "other product keeps tie",
  );
});

test("substance_code gives a substance unknown to the index a corrected code", () => {
  const after = register([["substance_code", "", "sacubitrilum", "C09DX04"]]);
  assert.deepEqual(codesOf(after, "12", "Sacubitrilum"), [["C09DX04", "corrected"]]);
});

test("correction without verified_on changes nothing and is reported as pending", () => {
  const result = validate([["product_substance_code", "9", "ibuprofenum", "M01AE01", ""]]);
  assert.deepEqual(result.applied, []);
  assert.deepEqual(result.errors, []);
  assert.deepEqual(
    result.pending.map((row) => [row.line, row.kind, row.rplId]),
    [[2, "product_substance_code", "9"]],
  );
  const after = prepareRegister(PRODUCTS, result.applied);
  assert.deepEqual(codesOf(after, "9", "Ibuprofenum"), codesOf(register([]), "9", "Ibuprofenum"));
});

test("unknown rpl_id and a malformed code are validation errors with their own reason", () => {
  const result = validate([
    ["product_substance_code", "999", "ibuprofenum", "M01AE01"],
    ["product_substance_code", "9", "ibuprofenum", "M01AE0"],
    ["substance_code", "", "sacubitrilum", "BRAK"],
    ["index_exclude", "999", "", ""],
  ]);
  assert.deepEqual(reasons(result), [
    [2, "unknown_rpl_id"],
    [3, "invalid_atc_code"],
    [4, "invalid_atc_code"],
    [5, "unknown_rpl_id"],
  ]);
  assert.deepEqual(result.applied, []);
});

test("unknown kind and duplicate key are validation errors", () => {
  const result = validate([
    ["rename", "", "ibuprofenum", "x"],
    ["substance_code", "", "sacubitrilum", "C09DX04"],
    ["substance_code", "", "sacubitrilum", "C09DX04", ""],
  ]);
  assert.deepEqual(reasons(result), [
    [2, "unknown_kind"],
    [4, "duplicate_key"],
  ]);
  assert.deepEqual(
    result.applied.map((row) => row.line),
    [3],
  );
});

test("product_composition passes for a product without composition and positions follow the file order", () => {
  const result = validate([
    ["product_composition", "15", "Sacubitrilum", ""],
    ["product_composition", "15", "Valsartanum", "C09CA03"],
  ]);
  assert.deepEqual(result.errors, []);
  const after = prepareRegister(PRODUCTS, result.applied);
  const composed = after.products.find((candidate) => candidate.rplId === "15");
  assert.equal(composed.compositionSource, "correction");
  assert.equal(composed.compositionSourceRplId, null);
  assert.deepEqual(
    composed.substances.map((substance) => [substance.position, substance.name]),
    [
      [1, "Sacubitrilum"],
      [2, "Valsartanum"],
    ],
  );
  assert.deepEqual(codesOf(after, "15", "Valsartanum"), [["C09CA03", "corrected"]]);
  assert.deepEqual(after.unfilled, [], "a product composed by correction is not reported as still empty");
  assert.deepEqual(composed.raw, { id: "15" }, "raw stays the source content");
});

test("product_composition for a product with a composition is an error, whether from the source or the fill", () => {
  const result = validate([
    ["product_composition", "13", "Valsartanum", ""],
    ["product_composition", "14", "Valsartanum", ""],
  ]);
  assert.deepEqual(reasons(result), [
    [2, "product_has_composition"],
    [3, "product_has_composition"],
  ]);
  assert.match(result.errors[1].message, /automatycznego uzupełnienia \(sibling\)/);
});

test("product_substance_code for a substance added by the composition fill passes validation", () => {
  const result = validate([["product_substance_code", "14", "valsartanum", "C09CA03"]]);
  assert.deepEqual(result.errors, []);
  const after = prepareRegister(PRODUCTS, result.applied);
  assert.equal(after.products.find((candidate) => candidate.rplId === "14").compositionSource, "sibling");
  assert.deepEqual(codesOf(after, "14", "Valsartanum"), [["C09CA03", "corrected"]]);
});

test("product_substance_code and confirmed_ambiguous for a substance not in the product are errors", () => {
  const result = validate([
    ["product_substance_code", "9", "valsartanum", "C09CA03"],
    ["confirmed_ambiguous", "15", "ibuprofenum", ""],
  ]);
  assert.deepEqual(reasons(result), [
    [2, "substance_not_in_product"],
    [3, "substance_not_in_product"],
  ]);
});

test("presence check compares names after aliases", () => {
  const result = validate([
    ["alias", "", "Atorwastyatyna z L-lizyną", "atorvastatinum"],
    ["product_substance_code", "3", "atorvastatinum", "C10AA05"],
  ]);
  assert.deepEqual(result.errors, []);
});

test("confirmed_ambiguous marks the tie as confirmed and leaves the substance rows unchanged", () => {
  const before = register([]);
  const after = register([["confirmed_ambiguous", "9", "ibuprofenum", ""]]);
  const rowsOf = (result) => result.products.find((candidate) => candidate.rplId === "9").substanceCodes;
  assert.deepEqual(rowsOf(after), rowsOf(before));
  assert.equal(after.maps.confirmedAmbiguous.get("9").has("ibuprofenum"), true);
});

test("confirmed_unmatched only marks the substance, the row stays unmatched", () => {
  const after = register([["confirmed_unmatched", "", "sacubitrilum", ""]]);
  assert.deepEqual(codesOf(after, "12", "Sacubitrilum"), [[null, "unmatched"]]);
  assert.equal(after.maps.confirmedUnmatched.has("sacubitrilum"), true);
});

test("CSV fields may be quoted with separators, doubled quotes and line breaks", () => {
  const records = parseCsv('"a";"b;c";"say ""x"""\n"multi\nline";plain;\n');
  assert.deepEqual(records, [
    { line: 1, fields: ["a", "b;c", 'say "x"'] },
    { line: 2, fields: ["multi\nline", "plain", ""] },
  ]);
});

test("a file with another header is refused", () => {
  assert.throws(() => parseCorrections('"kind";"rpl_id";"substance"\n'), /header must be/);
});

// The RPL file (74 MB) is not in the repository, so this test checks everything that does not need it: header,
// per-row rules and duplicate keys. Product-dependent checks run against the full RPL in measure.mjs and in the
// generator, which refuse to work on any error. Without products every row with an rpl_id can only fail as unknown.
test("the corrections file in the repository passes every check that does not need the RPL file", async () => {
  const file = path.join(REPO_ROOT, "supabase", "seed-data", "substance-corrections.csv");
  const result = await loadCorrections(file, []);
  assert.deepEqual(
    result.errors.filter((error) => error.reason !== "unknown_rpl_id"),
    [],
  );
});
