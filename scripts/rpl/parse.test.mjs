import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

import { cleanAtcCode, parseRpl } from "./parse.mjs";

const fixture = readFileSync(path.join(import.meta.dirname, "fixtures", "sample.xml"), "utf8");
const parsed = parseRpl(fixture);
const byId = (id) => parsed.products.find((product) => product.rplId === id);

test("reads stanNaDzien from the root element", () => {
  assert.equal(parsed.stanNaDzien, "2026-09-23");
});

test("drops veterinary products and keeps every human product", () => {
  assert.equal(parsed.veterinary, 1);
  assert.equal(parsed.products.length, 10);
  assert.ok(parsed.products.every((product) => product.raw.rodzajPreparatu === "ludzki"));
});

test("product model carries generator fields and the full source element", () => {
  const exforge = byId("100094647");
  assert.equal(exforge.productName, "Exforge HCT");
  assert.equal(exforge.procedureType, "CEN");
  assert.equal(exforge.authorizationNumber, null);
  assert.deepEqual(exforge.atcCodes, ["C09DX01"]);
  assert.deepEqual(exforge.substances, [
    { position: 1, name: "Amlodipini besilas" },
    { position: 2, name: "Valsartanum" },
    { position: 3, name: "Hydrochlorothiazidum" },
  ]);
  assert.ok(exforge.raw.opakowania.opakowanie.length > 0, "raw keeps the packages");
  assert.equal(exforge.raw.opakowania.opakowanie[0].kodGTIN, "05909990771646", "GTIN stays a string");
});

test("product without substances has an empty substance list", () => {
  assert.deepEqual(byId("100536394").substances, []);
});

// The plan named C09X as the rejected example, but the F-01 shape rule accepts every ATC level, and C09X
// is a well-formed fourth-level code. The rejected example is BRAK, a value that really occurs in RPL.
test('code "c09ca03 " is cleaned to C09CA03, a malformed value is rejected and reported', () => {
  assert.deepEqual(cleanAtcCode("c09ca03 "), { code: "C09CA03" });
  assert.deepEqual(cleanAtcCode("C09X"), { code: "C09X" });
  assert.deepEqual(cleanAtcCode("BRAK"), { rejected: "BRAK" });
  assert.deepEqual(cleanAtcCode("C09CA0"), { rejected: "C09CA0" });

  const synthetic = byId("SYNTHETIC-1");
  assert.deepEqual(synthetic.atcCodes, ["C09CA03", "C09X"]);
  assert.deepEqual(parsed.rejectedAtcCodes, [
    { rplId: "SYNTHETIC-1", productName: "Synthetic code test", value: "BRAK" },
  ]);
});

function exportWith(...products) {
  const elements = products.map((attributes) => `<produktLeczniczy rodzajPreparatu="ludzki" ${attributes}/>`);
  return `<produktyLecznicze stanNaDzien="2026-09-23">${elements.join("")}</produktyLecznicze>`;
}

test("a human product without an id stops the parser", () => {
  assert.throws(() => parseRpl(exportWith('nazwaProduktu="Bez id"')), /has no id/);
  assert.throws(() => parseRpl(exportWith('nazwaProduktu="Puste id" id=" "')), /has no id/);
});

test("a repeated product id stops the parser instead of merging two products", () => {
  assert.throws(
    () => parseRpl(exportWith('nazwaProduktu="A" id="1"', 'nazwaProduktu="B" id="1"')),
    /id 1 appears twice/,
  );
});

test("a scalar field sent as an element with an attribute keeps its text", () => {
  const xml =
    '<produktyLecznicze stanNaDzien="2026-09-23"><produktLeczniczy rodzajPreparatu="ludzki" id="7">' +
    '<nazwaProduktu jezyk="pl">Diovan</nazwaProduktu><moc jednostka="mg">80 mg</moc></produktLeczniczy></produktyLecznicze>';
  const [product] = parseRpl(xml).products;
  assert.equal(product.productName, "Diovan");
  assert.equal(product.strength, "80 mg");
});
