// RPL XML v6.0.0 → products with the fields the generator needs, plus the whole source element in `raw`.
// Pure functions: the CLI scripts read the file, these only see a string.

import { XMLParser } from "fast-xml-parser";

// Same shape rule as medication_substances_atc_code_check in the F-01 migration. Any level of the ATC
// classification passes (A01, A01A, A01AB, A01AB02); anything else would abort a data migration on insert.
export const ATC_SHAPE = /^[A-Z][0-9]{2}([A-Z]([A-Z]([0-9]{2})?)?)?$/;

const HUMAN = "ludzki";

// Elements that repeat in the schema. Declared up front so one child still parses as a list and `raw`
// keeps one shape for every product.
const LIST_ELEMENTS = new Set([
  "produktLeczniczy",
  "kodATC",
  "drogaPodania",
  "substancjaCzynna",
  "opakowanie",
  "jednostkaOpakowania",
  "zgodaPrezesa",
  "GTINZagraniczny",
  "wytworcy",
  "gatunek",
  "okresKarencji",
  "materialEdukacyjny",
]);

function createParser() {
  return new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "",
    // Keep every value a string: GTINs have leading zeros, "12,5" is not a number, and ATC codes are text.
    parseTagValue: false,
    parseAttributeValue: false,
    removeNSPrefix: true,
    isArray: (name) => LIST_ELEMENTS.has(name),
  });
}

// Upper case, no whitespace anywhere. Returns { code } when the result passes the shape rule, { rejected }
// with the untouched source value otherwise.
export function cleanAtcCode(value) {
  const source = typeof value === "string" ? value : String(value ?? "");
  const cleaned = source.replace(/\s+/g, "").toUpperCase();
  return ATC_SHAPE.test(cleaned) ? { code: cleaned } : { rejected: source };
}

function list(container, key) {
  if (!container || typeof container !== "object") return [];
  const value = container[key];
  return Array.isArray(value) ? value : [];
}

function textOf(node) {
  if (node == null) return "";
  if (typeof node === "object") return String(node["#text"] ?? "");
  return String(node);
}

function emptyToNull(value) {
  if (value == null) return null;
  const trimmed = String(value).trim();
  return trimmed === "" ? null : trimmed;
}

// Maps one parsed <produktLeczniczy> to the product model. Rejected ATC codes are returned next to the
// product, never silently dropped: they go into the measurement report and the migration header.
export function toProduct(element) {
  const atcCodes = [];
  const rejectedAtcCodes = [];
  for (const node of list(element.kodyATC, "kodATC")) {
    const result = cleanAtcCode(textOf(node));
    if (result.code !== undefined) {
      if (!atcCodes.includes(result.code)) atcCodes.push(result.code);
    } else {
      rejectedAtcCodes.push(result.rejected);
    }
  }

  const substances = list(element.substancjeCzynne, "substancjaCzynna").map((node, index) => ({
    position: index + 1,
    name: String(node.nazwaSubstancji ?? "").trim(),
  }));

  const species = list(element.gatunki, "gatunek")
    .map((node) => emptyToNull(typeof node === "object" ? (node.nazwa ?? textOf(node)) : node))
    .filter((name) => name !== null);

  return {
    product: {
      rplId: String(element.id),
      productName: String(element.nazwaProduktu ?? "").trim(),
      commonName: emptyToNull(element.nazwaPowszechnieStosowana),
      strength: emptyToNull(element.moc),
      form: emptyToNull(element.nazwaPostaciFarmaceutycznej),
      procedureType: emptyToNull(element.typProcedury),
      authorizationNumber: emptyToNull(element.numerPozwolenia),
      authorizationValidity: emptyToNull(element.waznoscPozwolenia),
      holder: emptyToNull(element.podmiotOdpowiedzialny),
      species,
      atcCodes,
      substances,
      raw: element,
    },
    rejectedAtcCodes,
  };
}

// Parses the whole export. Only veterinary products are dropped; every human product stays, with or without
// ATC codes and substances. `rejectedAtcCodes` lists { rplId, productName, value } for human products only —
// veterinary codes (QA…) never reach a migration.
export function parseRpl(xml) {
  const document = createParser().parse(xml);
  const root = document.produktyLecznicze;
  if (!root) throw new Error("Not an RPL export: no <produktyLecznicze> root element.");

  const products = [];
  const rejectedAtcCodes = [];
  let veterinary = 0;
  for (const element of list(root, "produktLeczniczy")) {
    if (element.rodzajPreparatu !== HUMAN) {
      veterinary += 1;
      continue;
    }
    const { product, rejectedAtcCodes: rejected } = toProduct(element);
    products.push(product);
    for (const value of rejected) {
      rejectedAtcCodes.push({ rplId: product.rplId, productName: product.productName, value });
    }
  }

  return { stanNaDzien: root.stanNaDzien ?? null, products, rejectedAtcCodes, veterinary };
}
