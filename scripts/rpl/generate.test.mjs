import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

import { prepareRegister } from "./corrections.mjs";
import { inScope } from "./derive.mjs";
import {
  addMinutes,
  buildPairsSeedSql,
  buildRegistrySeedSql,
  commentText,
  pairGroups,
  sqlJsonb,
  sqlString,
  sqlTextArray,
} from "./generate.mjs";
import { parseRpl } from "./parse.mjs";

const fixture = readFileSync(path.join(import.meta.dirname, "fixtures", "sample.xml"), "utf8");
const { products, rejectedAtcCodes } = parseRpl(fixture);
const manifest = {
  url: "https://example.test/overall.xml",
  schemaVersion: "6.0.0",
  stanNaDzien: "2026-09-23",
  sha256: "a".repeat(64),
};
const pair = (groupA, groupB, description = "Leki mogą wchodzić w interakcję.") => ({
  groupA,
  groupB,
  description,
  source: "ChPL Diovan pkt 4.5",
  verifiedOn: "2026-09-24",
});

// The fixture products in scope of C09CA, with one product renamed to carry an apostrophe in its name and in
// its source payload.
function scopedProducts() {
  const register = prepareRegister(products);
  return register.products
    .filter((product) => inScope(product, ["C09CA"]))
    .map((product) =>
      product.productName === "Diovan"
        ? { ...product, productName: "Diovan d'Or", raw: { ...product.raw, nazwaProduktu: "Diovan d'Or" } }
        : product,
    );
}

function registrySql(extra = {}) {
  return buildRegistrySeedSql({
    manifest,
    groups: ["C09CA"],
    products: scopedProducts(),
    rejectedAtcCodes,
    appliedCorrections: [],
    title: "registry seed",
    ...extra,
  });
}

test("string literals double the apostrophe and keep backslashes as they are", () => {
  assert.equal(sqlString("Diovan d'Or"), "'Diovan d''Or'");
  assert.equal(sqlString("a\\b"), "'a\\b'");
  assert.equal(sqlString(null), "null");
  assert.equal(sqlString(undefined), "null");
});

test("jsonb literal escapes the apostrophe inside JSON text", () => {
  assert.equal(sqlJsonb({ name: "d'Or", quote: 'say "hi"' }), `'{"name":"d''Or","quote":"say \\"hi\\""}'::jsonb`);
});

test("a value Postgres cannot store stops the generator instead of the migration", () => {
  assert.throws(() => sqlString("Diovan\u0000"), /U\+0000 or a lone surrogate/);
  assert.throws(() => sqlString("Diovan \ud800"), /U\+0000 or a lone surrogate/);
  assert.throws(() => sqlJsonb({ packages: [{ name: "a\u0000" }] }), /U\+0000 or a lone surrogate/);
  assert.throws(() => sqlJsonb({ ["key\udc00"]: "value" }), /U\+0000 or a lone surrogate/);
  assert.equal(sqlString("Ząb 😀"), "'Ząb 😀'");
});

test("text arrays are typed, empty arrays too", () => {
  assert.equal(sqlTextArray([]), "'{}'::text[]");
  assert.equal(sqlTextArray(["C09CA03", "BRAK"]), "array['C09CA03', 'BRAK']::text[]");
});

test("comment text keeps a source value on one line", () => {
  assert.equal(commentText("line one\nline two\r\n  three"), "line one line two three");
});

test("filter groups are the sorted union of both sides of the accepted pairs", () => {
  assert.deepEqual(pairGroups([pair("C09CA", "M01AE"), pair("C09AA", "M01AE"), pair("M01AE", "M01AE")]), [
    "C09AA",
    "C09CA",
    "M01AE",
  ]);
});

test("the pairs migration takes the registry timestamp plus one minute, across an hour boundary too", () => {
  assert.equal(addMinutes("20260924130000", 1), "20260924130100");
  assert.equal(addMinutes("20260924235930", 1), "20260925000030");
});

test("registry seed inserts products idempotently and substances only for products it inserted", () => {
  const sql = registrySql();
  assert.match(sql, /on conflict \(rpl_id\) do nothing\n\s*returning id, rpl_id/);
  assert.match(sql, /^with inserted_products as \(/m);
  assert.match(sql, /join inserted_products on inserted_products\.rpl_id = substance_rows\.rpl_id;/);
  // Never joined to the whole table: that would duplicate the composition of products loaded earlier.
  assert.doesNotMatch(sql, /join public\.registry_products/);
  assert.doesNotMatch(sql, /from public\.registry_products/);
});

test("registry seed escapes an apostrophe in the product name and in the source payload", () => {
  const sql = registrySql();
  assert.match(sql, /'Diovan d''Or'/);
  assert.match(sql, /"nazwaProduktu":"Diovan d''Or"/);
  assert.doesNotMatch(sql, /d'Or/);
});

test("valsartan in Exforge HCT goes into the migration with its derived single-substance code", () => {
  const sql = registrySql();
  assert.match(sql, /\('100094647', 2::smallint, 'Valsartanum', 'valsartanum', 'C09CA03', 'derived', 'source', null\)/);
});

test("registry seed header names the source, the license, the groups, the counts and the corrections", () => {
  const sql = registrySql({
    appliedCorrections: [
      {
        kind: "confirmed_unmatched",
        rplId: "",
        substance: "Sacubitrilum",
        target: "",
        source: "WHO ATC/DDD Index\nC09DX04",
        verifiedOn: "2026-09-24",
      },
    ],
  });
  const header = sql.slice(0, sql.indexOf("with inserted_products"));
  for (const expected of [
    manifest.url,
    "schema version: 6.0.0",
    "stanNaDzien:    2026-09-23",
    manifest.sha256,
    "CC BY 4.0",
    "Groups (union of group_a and group_b of the verified pairs): C09CA",
    "atc_source derived:",
    "Products by composition_source:",
    "confirmed_unmatched | — | Sacubitrilum | WHO ATC/DDD Index C09DX04 | 2026-09-24",
    "ATC codes rejected while cleaning",
  ]) {
    assert.ok(header.includes(expected), `header lacks: ${expected}`);
  }
  // Every header line is a comment: a line break from a source value never escapes into SQL.
  for (const line of header.trim().split("\n")) assert.match(line, /^--/);
});

test("pairs seed inserts idempotently and escapes the description", () => {
  const sql = buildPairsSeedSql({
    manifest,
    groups: ["C09CA", "M01AE"],
    products: scopedProducts(),
    rejectedAtcCodes,
    pairs: [pair("C09CA", "M01AE", "Leki 'z grupy' mogą wchodzić w interakcję.")],
    title: "pairs seed",
  });
  assert.match(sql, /on conflict \(group_a, group_b\) do nothing;/);
  assert.match(
    sql,
    /\('C09CA', 'M01AE', 'Leki ''z grupy'' mogą wchodzić w interakcję\.', 'ChPL Diovan pkt 4\.5', '2026-09-24'::date\)/,
  );
  assert.ok(sql.includes("CC BY 4.0"));
});
