import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

import {
  buildSubstanceIndex,
  deriveSubstanceCodes,
  fillMissingComposition,
  inScope,
  pickCandidates,
} from "./derive.mjs";
import { parseRpl } from "./parse.mjs";

const fixture = readFileSync(path.join(import.meta.dirname, "fixtures", "sample.xml"), "utf8");
const { products } = parseRpl(fixture);
const index = buildSubstanceIndex(products);
const withCodes = (id) => {
  const product = products.find((candidate) => candidate.rplId === id);
  return { ...product, substanceCodes: deriveSubstanceCodes(product, index) };
};

test("index merges amlodipine spellings and collects both ibuprofen codes", () => {
  assert.deepEqual([...index.get("amlodipinum")], ["C08CA01"]);
  assert.deepEqual([...index.get("ibuprofenum")].sort(), ["M01AE01", "M02AA13"]);
});

test("valsartan in Exforge HCT gets C09CA03 (derived)", () => {
  const rows = withCodes("100094647").substanceCodes;
  const valsartan = rows.filter((row) => row.name === "Valsartanum");
  assert.deepEqual(
    valsartan.map((row) => [row.atcCode, row.atcSource]),
    [["C09CA03", "derived"]],
  );
  const amlodipine = rows.filter((row) => row.name === "Amlodipini besilas");
  assert.deepEqual(
    amlodipine.map((row) => [row.normalizedName, row.atcCode, row.atcSource]),
    [["amlodipinum", "C08CA01", "derived"]],
  );
});

test("ibuprofen in an M01AE51 product gets M01AE01, not M02AA13", () => {
  const ibuprofen = withCodes("100194780").substanceCodes.filter((row) => row.name === "Ibuprofenum");
  assert.deepEqual(
    ibuprofen.map((row) => [row.atcCode, row.atcSource]),
    [["M01AE01", "derived"]],
  );
});

test("substance without a candidate gets null and unmatched", () => {
  const sacubitril = withCodes("100309013").substanceCodes.filter((row) => row.name === "Sacubitrilum");
  assert.deepEqual(
    sacubitril.map((row) => [row.atcCode, row.atcSource]),
    [[null, "unmatched"]],
  );
});

test("single-substance product takes the product codes", () => {
  assert.deepEqual(
    withCodes("100107195").substanceCodes.map((row) => [row.atcCode, row.atcSource]),
    [["C09CA03", "product"]],
  );
});

test("product without substances has no substance rows", () => {
  assert.deepEqual(withCodes("100536394").substanceCodes, []);
});

test("a tie keeps every winning code", () => {
  assert.deepEqual(pickCandidates(["M02AA13", "M01AE01"], ["C09DX01"]), {
    winners: ["M01AE01", "M02AA13"],
    ambiguous: true,
  });
  assert.deepEqual(pickCandidates(["M02AA13", "M01AE01"], ["M01AE51"]), { winners: ["M01AE01"], ambiguous: false });
});

test("Exforge HCT is in scope for group C09CA although its product code is C09DX01", () => {
  assert.equal(inScope(withCodes("100094647"), ["C09CA"]), true);
  assert.equal(inScope(withCodes("100094647"), ["M01AE"]), false);
});

test("ibuprofen gel is not in scope for M01AE", () => {
  assert.equal(inScope(withCodes("100383660"), ["M01AE"]), false);
});

// In-memory products for the composition fill: only the fields the fill reads, plus a `raw` to prove it is kept.
function product(rplId, productName, atcCodes, names, procedureType = "NAR") {
  return {
    rplId,
    productName,
    procedureType,
    atcCodes,
    substances: names.map((name, index) => ({ position: index + 1, name })),
    raw: { id: rplId, nazwaProduktu: productName },
  };
}
const fill = (products) => fillMissingComposition(products, buildSubstanceIndex(products));
const byId = (list, id) => list.find((candidate) => candidate.rplId === id);

test("parallel import without composition takes the composition of the same-named product with the same codes", () => {
  const products = [
    product("200", "Concor", ["C07AB07"], ["Bisoprololi fumaras"]),
    product("300", "CONCOR", ["C07AB07"], [], "IR"),
  ];
  const result = fill(products);
  const filled = byId(result.products, "300");
  assert.deepEqual(filled.substances, [{ position: 1, name: "Bisoprololi fumaras" }]);
  assert.equal(filled.compositionSource, "sibling");
  assert.equal(filled.compositionSourceRplId, "200");
  assert.deepEqual(filled.raw, { id: "300", nazwaProduktu: "CONCOR" }, "raw stays the source content");
  assert.deepEqual(products[1].substances, [], "input products are not mutated");
  assert.equal(byId(result.products, "200").compositionSource, "source");
  assert.equal(byId(result.products, "200").compositionSourceRplId, null);
  assert.deepEqual(
    result.filled.map((entry) => [entry.product.rplId, entry.compositionSource, entry.sourceRplId]),
    [["300", "sibling", "200"]],
  );
});

test("sibling with another set of product codes is not a sibling", () => {
  const products = [
    product("200", "Concor", ["C07AB07", "C07BB07"], ["Bisoprololi fumaras"]),
    product("300", "Concor", ["C07AB07"], [], "IR"),
  ];
  const filled = byId(fill(products).products, "300");
  assert.equal(filled.compositionSource, "atc_reverse", "falls through to the product code");
});

test("most frequent sibling composition wins, spellings and repeats of one substance count as one composition", () => {
  const products = [
    product("210", "Seroxat", ["N06AB05"], ["Paroxetini hydrochloridum"]),
    product("205", "Seroxat", ["N06AB05"], ["Paroxetinum", "Paroxetinum"]),
    product("201", "Seroxat", ["N06AB05"], ["Fluoxetinum"]),
    product("300", "Seroxat", ["N06AB05"], [], "IR"),
  ];
  const filled = byId(fill(products).products, "300");
  assert.equal(filled.compositionSourceRplId, "205", "lowest rplId among the winning composition");
  assert.deepEqual(filled.substances, [
    { position: 1, name: "Paroxetinum" },
    { position: 2, name: "Paroxetinum" },
  ]);
});

test("a tie between sibling compositions fills nothing and is reported", () => {
  const products = [
    product("201", "Dexak", ["M01AE17"], ["Dexketoprofenum"]),
    product("202", "Dexak", ["M01AE17"], ["Ketoprofenum"]),
    product("300", "Dexak", ["M01AE17"], [], "IR"),
  ];
  const result = fill(products);
  assert.deepEqual(byId(result.products, "300").substances, []);
  assert.deepEqual(
    result.unfilled.map((entry) => [entry.product.rplId, entry.reason]),
    [["300", "sibling_tie"]],
  );
});

test("product without a sibling takes the substance of its product code when the index names exactly one", () => {
  const products = [
    product("101", "Clopidogrel A", ["B01AC04"], ["Clopidogrelum"]),
    product("102", "Clopidogrel B", ["B01AC04"], ["Clopidogrelum"]),
    product("103", "Clopidogrel C", ["B01AC04"], ["Clopidogrelum hydrosulfas"]),
    product("104", "Clopidogrel D", ["B01AC04"], ["Clopidogrelum besilate"]),
    product("300", "Clopidogrel Krka", ["B01AC04"], []),
  ];
  const filled = byId(fill(products).products, "300");
  assert.equal(filled.compositionSource, "atc_reverse");
  assert.equal(filled.compositionSourceRplId, null);
  assert.deepEqual(filled.substances, [{ position: 1, name: "Clopidogrelum" }], "most frequent source spelling");
});

test("product code the index gives several names stays without composition and is reported", () => {
  const products = [
    product("101", "A", ["B01AC04"], ["Clopidogrelum"]),
    product("102", "B", ["B01AC04"], ["Ticlopidinum"]),
    product("300", "C", ["B01AC04"], []),
  ];
  const result = fill(products);
  assert.deepEqual(byId(result.products, "300").substances, []);
  assert.equal(byId(result.products, "300").compositionSource, "source");
  assert.deepEqual(
    result.unfilled.map((entry) => [entry.product.rplId, entry.reason, entry.details]),
    [["300", "code_ambiguous", ["clopidogrelum", "ticlopidinum"]]],
  );
});

test("product without composition and without one full code stays empty", () => {
  const result = fill([product("101", "A", ["B01AC04"], ["Clopidogrelum"]), product("300", "C", ["B01AC"], [])]);
  assert.deepEqual(
    result.unfilled.map((entry) => [entry.product.rplId, entry.reason]),
    [["300", "no_single_full_code"]],
  );
});

test("index is built from source compositions only, never from filled ones", () => {
  const filled = { ...product("300", "X", ["A10BA02"], ["Rivaroxabanum"]), compositionSource: "atc_reverse" };
  const index = buildSubstanceIndex([product("101", "Xarelto", ["B01AF01"], ["Rivaroxabanum"]), filled]);
  assert.deepEqual([...index.get("rivaroxabanum")], ["B01AF01"]);
});
