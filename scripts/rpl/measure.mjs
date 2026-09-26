// Measurement report: the numbers the author reads before the register becomes a migration.
// Usage: node scripts/rpl/measure.mjs --groups C09CA,M01AE,... [--file <path>] [--out <path>] [--corrections <path>]
//
// The input is always the file pinned in supabase/seed-data/rpl-snapshot.json. --file only points at another
// copy of it; that copy goes through the same hash check, so the report never describes unpinned data.
//
// Numbers are shown twice: "before" is bare RPL derivation, "after" adds the composition fill (point 7) and the
// verified rows of the corrections file (point 8), so the author sees what each step closes and what is left.
//
// loadPinnedRpl() and renderMeasurementReport() are shared with generate.mjs, which refreshes the same report on
// the groups of the verified pairs every time it writes the data migrations.

import { Buffer } from "node:buffer";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { buildCorrectionMaps, loadCorrections, prepareRegister } from "./corrections.mjs";
import { buildSubstanceIndex, deriveSubstanceCodes, inScope } from "./derive.mjs";
import { normalizeSubstanceName, resolveSubstanceName } from "./normalize.mjs";
import { ATC_SHAPE, parseRpl } from "./parse.mjs";
import { REPO_ROOT, loadVerifiedSnapshot } from "./snapshot.mjs";

export const DEFAULT_OUT = path.join(
  REPO_ROOT,
  "context",
  "changes",
  "interaction-rules-seed",
  "registry-measurement.md",
);
export const DEFAULT_CORRECTIONS = path.join(REPO_ROOT, "supabase", "seed-data", "substance-corrections.csv");
const CONTROL_SAMPLE = ["Exforge HCT", "Diovan", "Ibuprom"];

function flag(name) {
  const index = process.argv.indexOf(name);
  if (index === -1) return undefined;
  const value = process.argv[index + 1];
  if (value === undefined || value.startsWith("--")) {
    console.error(`${name} needs a value.`);
    process.exit(1);
  }
  return value;
}

function parseGroups(value) {
  if (!value) {
    console.error("Missing --groups: pass the working list of ATC groups, e.g. --groups C09CA,M01AE");
    process.exit(1);
  }
  const groups = [...new Set(value.split(",").map((group) => group.trim().toUpperCase()))].filter(Boolean);
  const invalid = groups.filter((group) => !ATC_SHAPE.test(group));
  if (invalid.length > 0) {
    console.error(`Not ATC codes: ${invalid.join(", ")}`);
    process.exit(1);
  }
  return groups;
}

function sqlLiteral(value) {
  return value === null ? "null" : `'${String(value).replace(/'/g, "''")}'`;
}

// Rough size of the data migration: one VALUES tuple per product (with the whole source element as jsonb)
// and one per substance row. The generator's exact statement shape is not written yet; this is its order.
function estimateBytes(products) {
  let bytes = 0;
  for (const product of products) {
    const productTuple = [
      product.rplId,
      product.productName,
      product.commonName,
      product.strength,
      product.form,
      product.procedureType,
      product.authorizationNumber,
      product.authorizationValidity,
      product.holder,
      `{${product.atcCodes.join(",")}}`,
      JSON.stringify(product.raw),
      product.compositionSource ?? "source",
      product.compositionSourceRplId ?? null,
      "2026-01-01",
    ]
      .map(sqlLiteral)
      .join(", ");
    bytes += Buffer.byteLength(`  (${productTuple}),\n`);
    for (const row of product.substanceCodes) {
      const tuple = [row.position, row.name, row.normalizedName, row.atcCode, row.atcSource].map(sqlLiteral);
      bytes += Buffer.byteLength(`  ('${product.rplId}', ${tuple.join(", ")}),\n`);
    }
  }
  return bytes;
}

function cell(value) {
  return String(value ?? "—")
    .replace(/\|/g, "\\|")
    .replace(/\n/g, " ");
}

function table(headers, rows) {
  if (rows.length === 0) return "_brak_\n";
  const lines = [`| ${headers.join(" | ")} |`, `| ${headers.map(() => "---").join(" | ")} |`];
  for (const row of rows) lines.push(`| ${row.map(cell).join(" | ")} |`);
  return lines.join("\n") + "\n";
}

function codesOf(rows) {
  return rows.map((row) => `${row.atcCode ?? "null"} (${row.atcSource})`).join(", ");
}

// Groups substance rows back into one entry per substance (a tie yields several rows for one position).
function bySubstance(rows) {
  const map = new Map();
  for (const row of rows) {
    const entry = map.get(row.position) ?? { ...row, rows: [] };
    entry.rows.push(row);
    map.set(row.position, entry);
  }
  return [...map.values()];
}

const FILL_REASONS = {
  sibling_tie: "remis składów odpowiedników o tej samej nazwie i kodach",
  no_single_full_code: "brak dokładnie jednego pełnego (siedmioznakowego) kodu produktu",
  code_not_in_index: "słownik nie zna kodu produktu",
  code_ambiguous: "słownik przypisuje kod produktu kilku nazwom",
};
const COMPOSITION_SOURCE_LABEL = {
  sibling: "produkt o tej samej nazwie i kodach",
  atc_reverse: "kod produktu",
  correction: "plik poprawek",
};

// Everything the report counts for one variant (before or after). `products` carry substanceCodes.
function analyze(products, index, groups, maps) {
  const scoped = products.filter((product) => inScope(product, groups));
  const scopedIds = new Set(scoped.map((product) => product.rplId));
  const combos = scoped.filter((product) => product.substances.length > 1);
  // Substances of in-scope combination products, one entry per substance.
  const comboSubstances = combos.flatMap((product) =>
    bySubstance(product.substanceCodes).map((entry) => ({ product, ...entry })),
  );
  const countBy = (source) => comboSubstances.filter((entry) => entry.atcSource === source).length;
  const rowsBy = (source) =>
    combos.flatMap((product) => product.substanceCodes).filter((row) => row.atcSource === source).length;

  // Normalized names whose single-substance codes span several anatomical groups. The source-spellings column
  // tells a normalization merge (several source spellings behind one key) from one substance used by several
  // routes. Spellings come from the same products that feed the index.
  const spellings = new Map();
  for (const product of products) {
    if ((product.compositionSource ?? "source") !== "source" || maps.excluded.has(product.rplId)) continue;
    if (product.substances.length !== 1 || product.atcCodes.length === 0) continue;
    const key = resolveSubstanceName(product.substances[0].name, maps.aliases);
    const set = spellings.get(key) ?? new Set();
    set.add(product.substances[0].name);
    spellings.set(key, set);
  }
  const usedByScopedCombos = new Set(comboSubstances.map((entry) => entry.normalizedName));
  const crossGroup = [...index]
    .filter(([, codes]) => new Set([...codes].map((code) => code[0])).size > 1)
    .map(([name, codes]) => ({
      name,
      codes: [...codes].sort(),
      spellings: [...(spellings.get(name) ?? [])].sort(),
      usedInScope: usedByScopedCombos.has(name),
    }))
    .sort((a, b) => Number(b.usedInScope) - Number(a.usedInScope) || a.name.localeCompare(b.name));

  return {
    scoped,
    scopedIds,
    combos,
    comboSubstances,
    countBy,
    rowsBy,
    unmatched: comboSubstances.filter((entry) => entry.atcSource === "unmatched"),
    ambiguous: comboSubstances.filter((entry) => entry.atcSource === "derived_ambiguous"),
    singleWithoutCode: scoped.filter(
      (product) => product.substances.length === 1 && product.substanceCodes[0]?.atcSource === "unmatched",
    ),
    withoutComposition: scoped.filter((product) => product.substances.length === 0),
    emptyNames: scoped.flatMap((product) =>
      product.substances.filter((substance) => substance.name === "").map(() => product),
    ),
    crossGroup,
    indexSize: index.size,
    megabytes: (estimateBytes(scoped) / 1024 / 1024).toFixed(1),
  };
}

function correctionRows(rows) {
  return rows.map((row) => [
    row.line,
    row.kind,
    row.rplId,
    row.substance,
    row.target,
    row.source,
    row.note,
    row.verifiedOn,
  ]);
}
const CORRECTION_HEADERS = ["Wiersz", "Rodzaj", "RPL id", "Substancja", "Cel", "Źródło", "Uwagi", "Sprawdzone"];

// The pinned snapshot, parsed: the hash gate first, then the file's own stanNaDzien against the manifest.
// Shared with generate.mjs, so the migration and the report always read the same data the same way.
export async function loadPinnedRpl(fileOverride) {
  const snapshot = await loadVerifiedSnapshot(fileOverride);
  const { manifest, filePath } = snapshot;
  const parsed = parseRpl(await readFile(filePath, "utf8"));
  if (parsed.stanNaDzien !== manifest.stanNaDzien) {
    throw new Error(`File says stanNaDzien=${parsed.stanNaDzien}, manifest says ${manifest.stanNaDzien}.`);
  }
  return { manifest, filePath, parsed };
}

const WORKING_GROUPS = {
  heading: "Robocza lista grup",
  intro: "Grupy kandydujące przygotowane przez agenta, do przeglądu przez autorkę w fazie 3:",
};

// → { report, summary }. Pure: the caller loads the snapshot and corrections and writes the file. `groupsLabel`
// names where the groups come from (the working list here, the verified pairs in generate.mjs); `generatedBy`
// is the command the report tells the reader to re-run.
export function renderMeasurementReport({
  manifest,
  filePath,
  correctionsPath,
  groups,
  parsed,
  corrections,
  groupsLabel = WORKING_GROUPS,
  generatedBy = "node scripts/rpl/measure.mjs",
}) {
  const { products, rejectedAtcCodes, veterinary } = parsed;

  // Before: bare RPL, no fill, no corrections.
  const noCorrections = buildCorrectionMaps([]);
  const beforeIndex = buildSubstanceIndex(products);
  const beforeProducts = products.map((product) => ({
    ...product,
    substanceCodes: deriveSubstanceCodes(product, beforeIndex),
  }));
  const before = analyze(beforeProducts, beforeIndex, groups, noCorrections);

  // After: fill (point 7) and verified corrections (point 8).
  const register = prepareRegister(products, corrections.applied);
  const { maps } = register;
  const after = analyze(register.products, register.index, groups, maps);

  // Coverage: any correction row, verified or pending, counts as "this gap has a source". Rows rejected by
  // validation do not.
  const cover = buildCorrectionMaps([...corrections.applied, ...corrections.pending]);
  const coverRows = [...corrections.applied, ...corrections.pending];
  const coveredNames = new Set([
    ...coverRows.filter((row) => row.substance !== "").map((row) => normalizeSubstanceName(row.substance)),
    ...coverRows.filter((row) => row.kind === "alias").map((row) => normalizeSubstanceName(row.target)),
    ...products
      .filter((product) => cover.excluded.has(product.rplId) && product.substances.length === 1)
      .map((product) => resolveSubstanceName(product.substances[0].name, maps.aliases)),
  ]);
  const productNameCovered = (rplId, name) => cover.productSubstanceCodes.get(rplId)?.has(name) ?? false;

  const confirmedUnmatched = after.unmatched.filter((entry) => maps.confirmedUnmatched.has(entry.normalizedName));
  const unexplainedUnmatched = after.unmatched.filter((entry) => !maps.confirmedUnmatched.has(entry.normalizedName));
  const isConfirmedAmbiguous = (entry) =>
    maps.confirmedAmbiguous.get(entry.product.rplId)?.has(entry.normalizedName) ?? false;
  const confirmedAmbiguous = after.ambiguous.filter(isConfirmedAmbiguous);
  const unresolvedAmbiguous = after.ambiguous.filter((entry) => !isConfirmedAmbiguous(entry));

  const gaps = [
    ...after.withoutComposition
      .filter((product) => !cover.productCompositions.has(product.rplId))
      .map((product) => ["produkt bez składu", product.productName, product.rplId, "—", product.atcCodes.join(", ")]),
    ...after.unmatched
      .filter(
        (entry) =>
          !cover.confirmedUnmatched.has(entry.normalizedName) &&
          !cover.substanceCodes.has(entry.normalizedName) &&
          !cover.aliases.has(normalizeSubstanceName(entry.name)) &&
          !productNameCovered(entry.product.rplId, entry.normalizedName),
      )
      .map((entry) => ["`unmatched`", entry.product.productName, entry.product.rplId, entry.name, "brak kandydatów"]),
    ...after.ambiguous
      .filter(
        (entry) =>
          !productNameCovered(entry.product.rplId, entry.normalizedName) &&
          !(cover.confirmedAmbiguous.get(entry.product.rplId)?.has(entry.normalizedName) ?? false),
      )
      .map((entry) => [
        "remis",
        entry.product.productName,
        entry.product.rplId,
        entry.name,
        entry.candidates.join(", "),
      ]),
    ...after.crossGroup
      .filter((entry) => entry.usedInScope && !coveredNames.has(entry.name))
      .map((entry) => ["kody z różnych grup anatomicznych", "—", "—", entry.name, entry.codes.join(", ")]),
  ];

  const scopedFilled = register.filled.filter((entry) => after.scopedIds.has(entry.product.rplId));
  const scopedCorrected = register.correctedComposition.filter((entry) => after.scopedIds.has(entry.product.rplId));
  const unfilledById = new Map(register.unfilled.map((entry) => [entry.product.rplId, entry]));
  const filledCount = (source) => scopedFilled.filter((entry) => entry.compositionSource === source).length;

  const control = register.products
    .filter((product) =>
      CONTROL_SAMPLE.some((name) => product.productName === name || product.productName.startsWith(`${name} `)),
    )
    .sort((a, b) => a.productName.localeCompare(b.productName) || a.rplId.localeCompare(b.rplId));

  const scopedRejected = rejectedAtcCodes.filter((entry) => after.scopedIds.has(entry.rplId));
  const relative = (target) => path.relative(REPO_ROOT, target);
  const both = (pick) => [pick(before), pick(after)];

  const report = `# Pomiar rejestru RPL dla zakresu par

> Wygenerowane przez \`${generatedBy}\`. Nie edytuj ręcznie — uruchom skrypt ponownie.
> Źródło: Rejestr Produktów Leczniczych, licencja CC BY 4.0.

## Plik źródłowy

- Adres: ${manifest.url}
- Wersja schematu: ${manifest.schemaVersion}
- \`stanNaDzien\`: ${manifest.stanNaDzien}
- sha256: \`${manifest.sha256}\` (zgodny z \`supabase/seed-data/rpl-snapshot.json\`)
- Plik: \`${relative(filePath)}\`
- Plik poprawek: \`${relative(correctionsPath)}\`

## ${groupsLabel.heading}

${groupsLabel.intro}

${groups.map((group) => `\`${group}\``).join(", ")}

## Liczby

„Przed” to samo wyprowadzenie z RPL. „Po” dodaje uzupełnienie składu produktów bez substancji i sprawdzone poprawki z pliku poprawek (tylko wiersze z \`verified_on\`).

${table(
  ["Miara", "Przed", "Po"],
  [
    ["Produkty dla ludzi", products.length, products.length],
    ["Produkty weterynaryjne (odrzucone)", veterinary, veterinary],
    ["Produkty w zakresie", ...both((variant) => variant.scoped.length)],
    ["— w tym wieloskładnikowe", ...both((variant) => variant.combos.length)],
    [
      "— w tym jednoskładnikowe",
      ...both((variant) => variant.scoped.filter((product) => product.substances.length === 1).length),
    ],
    ["— w tym bez składu", ...both((variant) => variant.withoutComposition.length)],
    ["Produkty w zakresie z uzupełnionym składem: odpowiednik (`sibling`)", 0, filledCount("sibling")],
    ["Produkty w zakresie z uzupełnionym składem: kod produktu (`atc_reverse`)", 0, filledCount("atc_reverse")],
    ["Produkty w zakresie ze składem z poprawki (`correction`)", 0, scopedCorrected.length],
    ["Substancje z pustą nazwą w zakresie", ...both((variant) => variant.emptyNames.length)],
    ["Hasła w słowniku substancji", ...both((variant) => variant.indexSize)],
    ["Poprawki zastosowane", 0, corrections.applied.length],
    ["Poprawki oczekujące (bez `verified_on`)", "—", corrections.pending.length],
    ["Poprawki odrzucone przez walidację", "—", corrections.errors.length],
    ["Luki bez źródła", "—", gaps.length],
    ["Szacowany rozmiar migracji danych", ...both((variant) => `${variant.megabytes} MB`)],
  ],
)}
### Substancje produktów wieloskładnikowych w zakresie

Liczone per substancja. Remis daje kilka wierszy jednej substancji, więc liczba wierszy jest podana osobno.

${table(
  ["`atc_source`", "Substancje przed", "Wiersze przed", "Substancje po", "Wiersze po"],
  ["derived", "derived_ambiguous", "corrected", "unmatched"].map((source) => [
    `\`${source}\``,
    before.countBy(source),
    before.rowsBy(source),
    after.countBy(source),
    after.rowsBy(source),
  ]),
)}
- Remisy potwierdzone poprawką \`confirmed_ambiguous\`: ${confirmedAmbiguous.length}, nierozstrzygnięte: ${unresolvedAmbiguous.length}.
- Substancje \`unmatched\` potwierdzone poprawką \`confirmed_unmatched\`: ${confirmedUnmatched.length}, niewyjaśnione: ${unexplainedUnmatched.length}.

Produkty jednoskładnikowe w zakresie bez poprawnego kodu ATC (substancja zapisana jako \`unmatched\`): przed ${before.singleWithoutCode.length}, po ${after.singleWithoutCode.length}.

## Próbka kontrolna

Stan „po”.

${table(
  ["Produkt", "RPL id", "Moc", "Kody produktu", "W zakresie", "Substancje i kody"],
  control.map((product) => [
    product.productName,
    product.rplId,
    product.strength,
    product.atcCodes.join(", ") || "—",
    inScope(product, groups) ? "tak" : "nie",
    bySubstance(product.substanceCodes)
      .map((entry) => `${entry.name}: ${codesOf(entry.rows)}`)
      .join("; ") || "brak substancji",
  ]),
)}
## Luki bez źródła (${gaps.length})

Luki w zakresie („po”), dla których plik poprawek nie ma żadnego wiersza — ani sprawdzonego, ani oczekującego: produkty bez składu, substancje \`unmatched\`, remisy i używane w zakresie hasła z kodami z różnych grup anatomicznych.

${table(["Luka", "Produkt", "RPL id", "Substancja", "Kody / kandydaci"], gaps)}
## Produkty z uzupełnionym składem w zakresie (${scopedFilled.length + scopedCorrected.length})

Skład dopisany polami \`composition_source\` i \`composition_source_rpl_id\`; treść źródłowa (\`raw\`) zostaje nietknięta.

${table(
  ["Produkt", "RPL id", "Typ procedury", "Kody produktu", "Skąd", "RPL id odpowiednika", "Skład"],
  [
    ...scopedFilled.map((entry) => [
      entry.product.productName,
      entry.product.rplId,
      entry.product.procedureType,
      entry.product.atcCodes.join(", "),
      COMPOSITION_SOURCE_LABEL[entry.compositionSource],
      entry.sourceRplId,
      entry.product.substances.map((substance) => substance.name).join(" + "),
    ]),
    ...scopedCorrected.map((entry) => [
      entry.product.productName,
      entry.product.rplId,
      entry.product.procedureType,
      entry.product.atcCodes.join(", "),
      COMPOSITION_SOURCE_LABEL.correction,
      null,
      entry.product.substances.map((substance) => substance.name).join(" + "),
    ]),
  ].sort((a, b) => a[0].localeCompare(b[0]) || a[1].localeCompare(b[1])),
)}
## Produkty w zakresie nadal bez składu (${after.withoutComposition.length})

${table(
  ["Produkt", "RPL id", "Kody produktu", "Dlaczego nie uzupełniono", "Szczegóły"],
  after.withoutComposition.map((product) => {
    const entry = unfilledById.get(product.rplId);
    return [
      product.productName,
      product.rplId,
      product.atcCodes.join(", "),
      entry ? FILL_REASONS[entry.reason] : "—",
      entry?.details.join("; ") || "—",
    ];
  }),
)}
## Poprawki zastosowane (${corrections.applied.length})

${table(CORRECTION_HEADERS, correctionRows(corrections.applied))}
## Poprawki oczekujące (${corrections.pending.length})

Wiersze bez \`verified_on\`. Nie zmieniają wyniku, dopóki autorka ich nie sprawdzi.

${table(CORRECTION_HEADERS, correctionRows(corrections.pending))}
## Poprawki odrzucone przez walidację (${corrections.errors.length})

${table(
  ["Wiersz", "Rodzaj", "RPL id", "Substancja", "Powód", "Opis"],
  corrections.errors.map((error) => [
    error.line,
    error.row.kind,
    error.row.rplId,
    error.row.substance,
    `\`${error.reason}\``,
    error.message,
  ]),
)}
## Substancje \`unmatched\` w zakresie — niewyjaśnione (${unexplainedUnmatched.length})

${table(
  ["Produkt", "RPL id", "Kody produktu", "Substancja", "Znormalizowana", "Kandydaci"],
  unexplainedUnmatched.map((entry) => [
    entry.product.productName,
    entry.product.rplId,
    entry.product.atcCodes.join(", "),
    entry.name,
    entry.normalizedName,
    "brak",
  ]),
)}
## Substancje \`unmatched\` w zakresie — potwierdzone poprawką \`confirmed_unmatched\` (${confirmedUnmatched.length})

${table(
  ["Produkt", "RPL id", "Substancja", "Znormalizowana", "Uwagi poprawki"],
  confirmedUnmatched.map((entry) => [
    entry.product.productName,
    entry.product.rplId,
    entry.name,
    entry.normalizedName,
    maps.confirmedUnmatched.get(entry.normalizedName).note,
  ]),
)}
## Remisy \`derived_ambiguous\` w zakresie — nierozstrzygnięte (${unresolvedAmbiguous.length})

${table(
  ["Produkt", "RPL id", "Kody produktu", "Substancja", "Kandydaci", "Zapisane kody (remis)"],
  unresolvedAmbiguous.map((entry) => [
    entry.product.productName,
    entry.product.rplId,
    entry.product.atcCodes.join(", "),
    entry.name,
    entry.candidates.join(", "),
    entry.rows.map((row) => row.atcCode).join(", "),
  ]),
)}
## Remisy \`derived_ambiguous\` w zakresie — potwierdzone poprawką \`confirmed_ambiguous\` (${confirmedAmbiguous.length})

${table(
  ["Produkt", "RPL id", "Substancja", "Zapisane kody (remis)", "Uzasadnienie"],
  confirmedAmbiguous.map((entry) => [
    entry.product.productName,
    entry.product.rplId,
    entry.name,
    entry.rows.map((row) => row.atcCode).join(", "),
    maps.confirmedAmbiguous.get(entry.product.rplId).get(entry.normalizedName).note,
  ]),
)}
## Nazwy z kodami z różnych grup anatomicznych (${after.crossGroup.length})

Podejrzenie błędnej normalizacji. Jeden zapis źródłowy przy kilku grupach to zwykle ta sama substancja podawana różnymi drogami (tabletki i żel). Kilka różnych zapisów źródłowych pod jednym hasłem wymaga sprawdzenia, czy normalizacja nie złączyła różnych substancji. Najpierw hasła używane przez substancje leków złożonych w zakresie (${after.crossGroup.filter((entry) => entry.usedInScope).length}). Stan „po” (przed: ${before.crossGroup.length}).

${table(
  ["Hasło", "Kody", "Zapisy źródłowe", "Używane w zakresie"],
  after.crossGroup.map((entry) => [
    entry.name,
    entry.codes.join(", "),
    entry.spellings.join("; "),
    entry.usedInScope ? "tak" : "nie",
  ]),
)}
## Odrzucone kody ATC (${rejectedAtcCodes.length}, w zakresie ${scopedRejected.length})

Kody produktów dla ludzi, które po oczyszczeniu (wielkie litery, bez spacji) nie spełniają reguły kształtu z \`medication_substances_atc_code_check\`. Nie trafiają do \`atcCodes\`; trafią do nagłówka migracji.

${table(
  ["Produkt", "RPL id", "Wartość źródłowa"],
  rejectedAtcCodes.map((entry) => [entry.productName, entry.rplId, JSON.stringify(entry.value)]),
)}
## Produkty w zakresie bez składu przed uzupełnieniem (${before.withoutComposition.length})

${table(
  ["Produkt", "RPL id", "Typ procedury", "Kody produktu"],
  before.withoutComposition.map((product) => [
    product.productName,
    product.rplId,
    product.procedureType,
    product.atcCodes.join(", "),
  ]),
)}`;

  const summarize = (variant) =>
    `inScope=${variant.scoped.length} withoutComposition=${variant.withoutComposition.length} ` +
    `derived=${variant.countBy("derived")} ambiguous=${variant.countBy("derived_ambiguous")} ` +
    `corrected=${variant.countBy("corrected")} unmatched=${variant.countBy("unmatched")} ` +
    `crossGroup=${variant.crossGroup.length} estimated=${variant.megabytes}MB`;
  const summary = [
    `human=${products.length} rejected=${rejectedAtcCodes.length}`,
    `before: ${summarize(before)}`,
    `after:  ${summarize(after)}`,
    `filled: sibling=${filledCount("sibling")} atc_reverse=${filledCount("atc_reverse")} correction=${scopedCorrected.length} ` +
      `corrections: applied=${corrections.applied.length} pending=${corrections.pending.length} ` +
      `errors=${corrections.errors.length} gapsWithoutSource=${gaps.length}`,
  ];
  return { report, summary };
}

async function main() {
  let pinned;
  try {
    pinned = await loadPinnedRpl(flag("--file"));
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
  const groups = parseGroups(flag("--groups"));
  const outPath = path.resolve(flag("--out") ?? DEFAULT_OUT);
  const correctionsPath = path.resolve(flag("--corrections") ?? DEFAULT_CORRECTIONS);

  let corrections;
  try {
    corrections = await loadCorrections(correctionsPath, pinned.parsed.products);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }

  const { report, summary } = renderMeasurementReport({ ...pinned, correctionsPath, groups, corrections });
  await writeFile(outPath, report);
  console.log(`Report written to ${path.relative(REPO_ROOT, outPath)}`);
  for (const line of summary) console.log(line);
}

if (process.argv[1] && path.resolve(process.argv[1]) === import.meta.filename) await main();
