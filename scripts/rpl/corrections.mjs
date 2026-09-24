// Substance corrections: gaps RPL does not close on its own (typos in names, substances without a
// single-substance product, ties, source errors, products listed without a composition), each row with a source
// and the author's verification date. Only verified rows act; RPL data stays untouched — corrections are applied
// on top of the parsed products, never written into `raw`.
//
// Order of application (plan, phase 1 point 8):
//   index_exclude, alias          → before the substance index is built
//   product_composition           → before the automatic fill (point 7); disjoint from it by validation
//   substance_code,
//   product_substance_code        → during code derivation
//   confirmed_unmatched,
//   confirmed_ambiguous           → report only

import { readFile } from "node:fs/promises";

import { buildSubstanceIndex, deriveSubstanceCodes, fillMissingComposition } from "./derive.mjs";
import { normalizeSubstanceName, resolveSubstanceName } from "./normalize.mjs";
import { ATC_SHAPE } from "./parse.mjs";

export const CORRECTION_COLUMNS = ["kind", "rpl_id", "substance", "target", "source", "note", "verified_on"];

// Which columns each kind needs. `target` for product_composition is optional (an ATC code or empty).
const KINDS = {
  alias: { rplId: false, substance: true, target: "name" },
  substance_code: { rplId: false, substance: true, target: "code" },
  product_substance_code: { rplId: true, substance: true, target: "code" },
  index_exclude: { rplId: true, substance: false, target: "none" },
  product_composition: { rplId: true, substance: true, target: "optional_code" },
  confirmed_unmatched: { rplId: false, substance: true, target: "none" },
  confirmed_ambiguous: { rplId: true, substance: true, target: "none" },
};
export const CORRECTION_KINDS = Object.keys(KINDS);

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

// RFC 4180-style parsing with `;` as the separator: quoted fields may hold `;`, newlines and doubled quotes.
// → [{ line, fields }] where `line` is the 1-based line on which the record starts.
export function parseCsv(text) {
  const input = text.replace(/^\uFEFF/, "");
  const records = [];
  let fields = [];
  let field = "";
  let quoted = false;
  let line = 1;
  let recordLine = 1;
  let fieldStarted = false;

  const endField = () => {
    fields.push(field);
    field = "";
    fieldStarted = false;
  };
  const endRecord = () => {
    endField();
    if (!(fields.length === 1 && fields[0] === "")) records.push({ line: recordLine, fields });
    fields = [];
  };

  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];
    if (quoted) {
      if (char === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        if (char === "\n") line += 1;
        field += char;
      }
      continue;
    }
    if (char === '"' && !fieldStarted) {
      quoted = true;
      fieldStarted = true;
    } else if (char === ";") {
      endField();
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && input[i + 1] === "\n") i += 1;
      endRecord();
      line += 1;
      recordLine = line;
    } else {
      field += char;
      fieldStarted = true;
    }
  }
  if (quoted)
    throw new Error(`Corrections CSV: unterminated quoted field in the record starting on line ${recordLine}.`);
  if (field !== "" || fields.length > 0) endRecord();
  return records;
}

// → [{ line, kind, rplId, substance, target, source, note, verifiedOn }]. Throws on a wrong header: a file
// with shifted columns would otherwise validate row by row into nonsense.
export function parseCorrections(text) {
  const [header, ...records] = parseCsv(text);
  const actual = header?.fields.map((name) => name.trim()) ?? [];
  if (actual.join(";") !== CORRECTION_COLUMNS.join(";")) {
    throw new Error(
      `Corrections CSV header must be ${CORRECTION_COLUMNS.join(";")}, got ${actual.join(";") || "(empty file)"}.`,
    );
  }
  return records.map(({ line, fields }) => {
    const [kind, rplId, substance, target, source, note, verifiedOn] = CORRECTION_COLUMNS.map((_, index) =>
      (fields[index] ?? "").trim(),
    );
    return { line, kind, rplId, substance, target, source, note, verifiedOn, extraFields: fields.length - 7 };
  });
}

function rowKey(row) {
  return `${row.kind}\u0000${row.rplId}\u0000${row.substance}`;
}

// Checks that need nothing but the row itself. → reason code or null.
function statelessReason(row) {
  const spec = KINDS[row.kind];
  if (!spec) return { reason: "unknown_kind", message: `nieznany rodzaj „${row.kind}”` };
  if (row.extraFields !== 0) {
    return { reason: "column_count", message: `oczekiwano ${CORRECTION_COLUMNS.length} kolumn` };
  }
  if (spec.rplId && row.rplId === "") return { reason: "missing_rpl_id", message: `${row.kind} wymaga rpl_id` };
  if (!spec.rplId && row.rplId !== "") {
    return { reason: "unexpected_rpl_id", message: `${row.kind} dotyczy wszystkich produktów, rpl_id musi być puste` };
  }
  if (spec.substance && row.substance === "") {
    return { reason: "missing_substance", message: `${row.kind} wymaga substance` };
  }
  if (!spec.substance && row.substance !== "") {
    return { reason: "unexpected_substance", message: `${row.kind} nie przyjmuje substance` };
  }
  if ((spec.target === "name" || spec.target === "code") && row.target === "") {
    return { reason: "missing_target", message: `${row.kind} wymaga target` };
  }
  if (spec.target === "none" && row.target !== "") {
    return { reason: "unexpected_target", message: `${row.kind} nie przyjmuje target` };
  }
  const isCode = spec.target === "code" || (spec.target === "optional_code" && row.target !== "");
  if (isCode && !ATC_SHAPE.test(row.target)) {
    return { reason: "invalid_atc_code", message: `„${row.target}” nie jest kodem ATC` };
  }
  if (row.verifiedOn !== "" && !ISO_DATE.test(row.verifiedOn)) {
    return { reason: "invalid_verified_on", message: `verified_on „${row.verifiedOn}” nie ma postaci RRRR-MM-DD` };
  }
  if (row.verifiedOn !== "" && row.source === "") {
    return { reason: "missing_source", message: "sprawdzona poprawka wymaga źródła" };
  }
  return null;
}

// Lookup structures consumed by derive.mjs. Names are normalized here, so a row written with a source
// spelling still meets the normalized names derivation compares against.
export function buildCorrectionMaps(applied) {
  const maps = {
    aliases: new Map(),
    excluded: new Set(),
    substanceCodes: new Map(),
    productSubstanceCodes: new Map(),
    productCompositions: new Map(),
    confirmedUnmatched: new Map(),
    confirmedAmbiguous: new Map(),
  };
  for (const row of applied) {
    const name = normalizeSubstanceName(row.substance);
    switch (row.kind) {
      case "alias":
        maps.aliases.set(name, normalizeSubstanceName(row.target));
        break;
      case "index_exclude":
        maps.excluded.add(row.rplId);
        break;
      case "substance_code": {
        const codes = maps.substanceCodes.get(name) ?? new Set();
        codes.add(row.target);
        maps.substanceCodes.set(name, codes);
        break;
      }
      case "product_substance_code": {
        const byName = maps.productSubstanceCodes.get(row.rplId) ?? new Map();
        byName.set(name, row.target);
        maps.productSubstanceCodes.set(row.rplId, byName);
        break;
      }
      case "product_composition": {
        const rows = maps.productCompositions.get(row.rplId) ?? [];
        rows.push(row);
        maps.productCompositions.set(row.rplId, rows);
        break;
      }
      case "confirmed_unmatched":
        maps.confirmedUnmatched.set(name, row);
        break;
      case "confirmed_ambiguous": {
        const byName = maps.confirmedAmbiguous.get(row.rplId) ?? new Map();
        byName.set(name, row);
        maps.confirmedAmbiguous.set(row.rplId, byName);
        break;
      }
    }
  }
  return maps;
}

// Products with their final composition, before code derivation: index (after index_exclude and alias), the
// automatic fill (point 7), then product_composition for products the fill left empty. Validation guarantees
// product_composition never targets a product the fill composes, so applying it after the fill gives the same
// result as applying it before, and lets validation see what the fill did.
export function composeRegister(products, maps) {
  const index = buildSubstanceIndex(products, maps);
  const fill = fillMissingComposition(products, index, maps);
  const correctedComposition = [];
  const composed = fill.products.map((product) => {
    const rows = maps.productCompositions.get(product.rplId);
    if (!rows || product.substances.length > 0) return product;
    const next = {
      ...product,
      // position = order of this product's rows in the corrections file, from 1
      substances: rows.map((row, position) => ({
        position: position + 1,
        name: row.substance,
        atcCode: row.target === "" ? null : row.target,
      })),
      compositionSource: "correction",
      compositionSourceRplId: null,
    };
    correctedComposition.push({ product: next, rows });
    return next;
  });
  const unfilled = fill.unfilled.filter((entry) => !maps.productCompositions.has(entry.product.rplId));
  return { index, products: composed, filled: fill.filled, correctedComposition, unfilled };
}

// Full pipeline: composition, then per-substance codes. `substanceCodes` is attached to every product.
export function prepareRegister(products, applied = []) {
  const maps = buildCorrectionMaps(applied);
  const composed = composeRegister(products, maps);
  const withCodes = composed.products.map((product) => ({
    ...product,
    substanceCodes: deriveSubstanceCodes(product, composed.index, maps),
  }));
  return { ...composed, products: withCodes, maps };
}

// → { applied, pending, errors }. Errors are { line, row, reason, message }: `reason` is a stable code for tests and
// tools, `message` is Polish because it lands in the measurement report the author reads.
// Rows without verified_on go to `pending` and never act. A row that fails validation is an error whether it is
// verified or not. Product-dependent checks run in pipeline order: rpl_id existence, then product_composition
// against the fill result, then substance presence against the final composition (after aliases and the fill).
export function validateCorrections(rows, products) {
  const errors = [];
  const pending = [];
  const candidates = [];
  const fail = (row, reason, message) => errors.push({ line: row.line, row, reason, message });

  const productsById = new Map(products.map((product) => [product.rplId, product]));
  const seen = new Map();
  const aliasTargets = new Map();

  for (const row of rows) {
    const stateless = statelessReason(row);
    if (stateless) {
      fail(row, stateless.reason, stateless.message);
      continue;
    }
    const key = rowKey(row);
    if (seen.has(key)) {
      fail(row, "duplicate_key", `ten sam kind, rpl_id i substance co w wierszu ${seen.get(key)}`);
      continue;
    }
    seen.set(key, row.line);
    if (row.rplId !== "" && !productsById.has(row.rplId)) {
      fail(row, "unknown_rpl_id", `rpl_id ${row.rplId} nie jest produktem dla ludzi w pliku RPL`);
      continue;
    }
    if (row.kind === "alias") {
      const source = normalizeSubstanceName(row.substance);
      const target = normalizeSubstanceName(row.target);
      const earlier = aliasTargets.get(source);
      if (earlier && earlier.target !== target) {
        fail(row, "alias_conflict", `„${source}” ma już alias „${earlier.target}” w wierszu ${earlier.line}`);
        continue;
      }
      aliasTargets.set(source, { target, line: row.line });
    }
    if (row.verifiedOn === "") pending.push(row);
    else candidates.push(row);
  }

  // product_composition: only for products that end up without any composition otherwise.
  const withoutComposition = candidates.filter((row) => row.kind !== "product_composition");
  const baseline = composeRegister(products, buildCorrectionMaps(withoutComposition));
  const baselineById = new Map(baseline.products.map((product) => [product.rplId, product]));
  const applied = [];
  for (const row of candidates) {
    if (row.kind !== "product_composition") {
      applied.push(row);
      continue;
    }
    const product = baselineById.get(row.rplId);
    if (product.substances.length > 0) {
      const from =
        product.compositionSource === "source"
          ? "ze źródła RPL"
          : `z automatycznego uzupełnienia (${product.compositionSource})`;
      fail(row, "product_has_composition", `produkt ${row.rplId} ma już skład ${from}`);
      continue;
    }
    applied.push(row);
  }

  // product_substance_code and confirmed_ambiguous: the substance must be in the product's final composition.
  const maps = buildCorrectionMaps(applied);
  const final = composeRegister(products, maps);
  const finalById = new Map(final.products.map((product) => [product.rplId, product]));
  const result = [];
  for (const row of applied) {
    if (row.kind === "product_substance_code" || row.kind === "confirmed_ambiguous") {
      const product = finalById.get(row.rplId);
      const names = new Set(product.substances.map((substance) => resolveSubstanceName(substance.name, maps.aliases)));
      const name = normalizeSubstanceName(row.substance);
      if (!names.has(name)) {
        fail(
          row,
          "substance_not_in_product",
          `„${name}” nie występuje w składzie ${row.rplId} (${[...names].join(", ") || "brak substancji"})`,
        );
        continue;
      }
    }
    result.push(row);
  }

  // A presence failure removes a row that the final composition did not depend on (only product_composition
  // shapes composition), so `result` needs no second pass.
  errors.sort((a, b) => a.line - b.line);
  return { applied: result, pending, errors };
}

export async function loadCorrections(filePath, products) {
  let text;
  try {
    text = await readFile(filePath, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") throw new Error(`No corrections file at ${filePath}.`, { cause: error });
    throw error;
  }
  return validateCorrections(parseCorrections(text), products);
}
