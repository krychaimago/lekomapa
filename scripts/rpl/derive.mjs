// Per-substance ATC codes and the scope filter. RPL gives ATC codes per product only; a combination product
// carries the combination code (Exforge HCT → C09DX01), while interaction pairs match substance codes.
// Every substance therefore gets the code its single-substance products carry.
//
// `corrections` below is the shape built by buildCorrectionMaps() in corrections.mjs; every field is optional,
// so the functions also run on bare RPL data (the "before corrections" numbers of the measurement report).

import { resolveSubstanceName } from "./normalize.mjs";

// A product feeds the index only with a composition written in the source. Missing compositionSource means a
// freshly parsed product, which is source data too. Filled compositions never feed the index: the fill reads
// the index, and letting it write back would let one guess confirm the next.
function feedsIndex(product, excluded) {
  if ((product.compositionSource ?? "source") !== "source") return false;
  if (excluded?.has(product.rplId)) return false;
  return product.substances.length === 1 && product.atcCodes.length > 0;
}

// normalized name → Set of ATC codes, from every single-substance human product. Built from the whole
// register, never the scoped subset: a combination's substance may only exist alone outside the scope.
// `index_exclude` products are skipped and `alias` corrections applied before a name becomes a key.
export function buildSubstanceIndex(products, corrections = {}) {
  const index = new Map();
  for (const product of products) {
    if (!feedsIndex(product, corrections.excluded)) continue;
    const key = resolveSubstanceName(product.substances[0].name, corrections.aliases);
    if (key === "") continue;
    let codes = index.get(key);
    if (!codes) {
      codes = new Set();
      index.set(key, codes);
    }
    for (const code of product.atcCodes) codes.add(code);
  }
  return index;
}

function commonPrefixLength(a, b) {
  let length = 0;
  while (length < a.length && length < b.length && a[length] === b[length]) length += 1;
  return length;
}

// Candidates sorted, winners chosen by the longest common prefix with any product code. A tie keeps every
// winner: more flags rather than a silent miss.
export function pickCandidates(candidates, productCodes) {
  const sorted = [...candidates].sort();
  if (sorted.length <= 1) return { winners: sorted, ambiguous: false };
  const scored = sorted.map((code) => ({
    code,
    score: Math.max(0, ...productCodes.map((productCode) => commonPrefixLength(code, productCode))),
  }));
  const best = Math.max(...scored.map((entry) => entry.score));
  const winners = scored.filter((entry) => entry.score === best).map((entry) => entry.code);
  return { winners, ambiguous: winners.length > 1 };
}

// → [{ position, name, normalizedName, atcCode, atcSource, candidates }]. `candidates` is informational for
// the measurement report; the migration uses the other fields.
//
// Corrections, in order of precedence: a `product_substance_code` for this product and substance, then a code
// carried by a `product_composition` substance, then derivation. `substance_code` adds candidates for names the
// index does not know. A code taken from a correction gives atcSource 'corrected'.
export function deriveSubstanceCodes(product, index, corrections = {}) {
  const { substances, atcCodes } = product;
  if (substances.length === 0) return [];

  const productCodes = corrections.productSubstanceCodes?.get(product.rplId);
  const rows = [];
  for (const substance of substances) {
    const normalizedName = resolveSubstanceName(substance.name, corrections.aliases);
    const indexCodes = index.get(normalizedName) ?? new Set();
    const correctionCodes = corrections.substanceCodes?.get(normalizedName) ?? new Set();
    const candidates = [...new Set([...indexCodes, ...correctionCodes])].sort();
    const base = { position: substance.position, name: substance.name, normalizedName };

    const pinned = productCodes?.get(normalizedName) ?? substance.atcCode ?? null;
    if (pinned !== null) {
      rows.push({ ...base, atcCode: pinned, atcSource: "corrected", candidates });
      continue;
    }

    if (substances.length === 1) {
      // A single-substance product without a valid code still keeps its substance, as unmatched.
      if (atcCodes.length === 0) {
        rows.push({ ...base, atcCode: null, atcSource: "unmatched", candidates: [] });
      } else {
        for (const atcCode of atcCodes) rows.push({ ...base, atcCode, atcSource: "product", candidates: [] });
      }
      continue;
    }

    if (candidates.length === 0) {
      rows.push({ ...base, atcCode: null, atcSource: "unmatched", candidates });
      continue;
    }
    const { winners, ambiguous } = pickCandidates(candidates, atcCodes);
    for (const atcCode of winners) {
      let atcSource = "derived";
      if (ambiguous) atcSource = "derived_ambiguous";
      else if (!indexCodes.has(atcCode)) atcSource = "corrected";
      rows.push({ ...base, atcCode, atcSource, candidates });
    }
  }
  return rows;
}

// Sorted, de-duplicated normalized names: "Paroxetinum" and "Paroxetini hydrochloridum" are one composition,
// and a substance listed twice counts once.
export function compositionKey(product, aliases) {
  const names = new Set(product.substances.map((substance) => resolveSubstanceName(substance.name, aliases)));
  return [...names].sort().join(" + ");
}

const byRplId = (a, b) => a.rplId.localeCompare(b.rplId, "en", { numeric: true });
const FULL_ATC = /^[A-Z][0-9]{2}[A-Z]{2}[0-9]{2}$/;

// Composition for human products RPL lists without any substance, taken from what RPL knows elsewhere:
//   1. 'sibling': a source-composed product with the same name (case-insensitive) and the same set of product
//      codes. The most frequent composition among siblings wins; a tie fills nothing. The winner's source
//      substances are copied from the sibling with the lowest rplId.
//   2. 'atc_reverse': exactly one full (seven-character) product code that the index assigns to exactly one normalized name. One
//      substance under the most frequent source spelling of that name (alphabetically first on a tie).
// Returns new product objects with compositionSource / compositionSourceRplId; `raw` is never touched.
// `filled` and `unfilled` list what happened to each product that had no substances.
export function fillMissingComposition(products, index, corrections = {}) {
  const { aliases, excluded } = corrections;
  const codeSet = (product) => [...product.atcCodes].sort().join(",");
  const siblingKey = (product) => `${product.productName.toLowerCase()}\u0000${codeSet(product)}`;

  const siblings = new Map();
  for (const product of products) {
    if (product.substances.length === 0 || (product.compositionSource ?? "source") !== "source") continue;
    const key = siblingKey(product);
    const list = siblings.get(key) ?? [];
    list.push(product);
    siblings.set(key, list);
  }

  // code → normalized names holding it, and (name, code) → source spelling counts, from the index's own inputs.
  const namesByCode = new Map();
  for (const [name, codes] of index) {
    for (const code of codes) {
      const names = namesByCode.get(code) ?? new Set();
      names.add(name);
      namesByCode.set(code, names);
    }
  }
  const spellingCounts = new Map();
  for (const product of products) {
    if (!feedsIndex(product, excluded)) continue;
    const spelling = product.substances[0].name;
    const name = resolveSubstanceName(spelling, aliases);
    for (const code of product.atcCodes) {
      const key = `${name}\u0000${code}`;
      const counts = spellingCounts.get(key) ?? new Map();
      counts.set(spelling, (counts.get(spelling) ?? 0) + 1);
      spellingCounts.set(key, counts);
    }
  }

  const filled = [];
  const unfilled = [];
  const result = products.map((product) => {
    if (product.substances.length > 0) {
      return {
        ...product,
        compositionSource: product.compositionSource ?? "source",
        compositionSourceRplId: product.compositionSourceRplId ?? null,
      };
    }
    const empty = { ...product, compositionSource: "source", compositionSourceRplId: null };

    const candidates = siblings.get(siblingKey(product)) ?? [];
    if (candidates.length > 0) {
      const groups = new Map();
      for (const sibling of candidates) {
        const key = compositionKey(sibling, aliases);
        const group = groups.get(key) ?? [];
        group.push(sibling);
        groups.set(key, group);
      }
      const ranked = [...groups.entries()].sort((a, b) => b[1].length - a[1].length);
      if (ranked.length > 1 && ranked[0][1].length === ranked[1][1].length) {
        const top = ranked.filter(([, group]) => group.length === ranked[0][1].length).map(([key]) => key);
        unfilled.push({ product: empty, reason: "sibling_tie", details: top });
        return empty;
      }
      const source = [...ranked[0][1]].sort(byRplId)[0];
      const next = {
        ...product,
        substances: source.substances.map((substance) => ({ position: substance.position, name: substance.name })),
        compositionSource: "sibling",
        compositionSourceRplId: source.rplId,
      };
      filled.push({ product: next, compositionSource: "sibling", sourceRplId: source.rplId });
      return next;
    }

    const fullCodes = product.atcCodes.filter((code) => FULL_ATC.test(code));
    if (fullCodes.length !== 1) {
      unfilled.push({ product: empty, reason: "no_single_full_code", details: product.atcCodes });
      return empty;
    }
    const [code] = fullCodes;
    const names = [...(namesByCode.get(code) ?? [])].sort();
    if (names.length !== 1) {
      unfilled.push({
        product: empty,
        reason: names.length === 0 ? "code_not_in_index" : "code_ambiguous",
        details: names,
      });
      return empty;
    }
    const counts = [...(spellingCounts.get(`${names[0]}\u0000${code}`) ?? new Map())];
    counts.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    // No spelling only when the index was built with other corrections than these; the name is still right.
    const spelling = counts[0]?.[0] ?? names[0];
    const next = {
      ...product,
      substances: [{ position: 1, name: spelling }],
      compositionSource: "atc_reverse",
      compositionSourceRplId: null,
    };
    filled.push({ product: next, compositionSource: "atc_reverse", sourceRplId: null });
    return next;
  });

  return { products: result, filled, unfilled };
}

// In scope when any substance code or any product code starts with any group.
export function inScope(productWithCodes, groups) {
  const codes = [
    ...productWithCodes.atcCodes,
    ...productWithCodes.substanceCodes.map((row) => row.atcCode).filter((code) => code !== null),
  ];
  return codes.some((code) => groups.some((group) => code.startsWith(group)));
}
