// Migration generator: the pinned RPL file and the verified pairs become two data migrations, the registry seed
// and the interaction pairs seed. Every run also refreshes the measurement report on the groups of the verified
// pairs, so the report always describes the data the migrations carry.
//
// Usage: node scripts/rpl/generate.mjs [--timestamp YYYYMMDDHHmmss] [--overwrite] [--file <path>]
//          [--pairs <path>] [--corrections <path>] [--out-dir <path>] [--report <path>]
//
// Refuses to write migrations when:
//   - the RPL file does not match the hash pinned in supabase/seed-data/rpl-snapshot.json,
//   - the pairs file has errors, or no pair is verified,
//   - the corrections file has errors or pending rows (no verified_on). A top-up migration never touches
//     products already loaded, so a correction verified after generation would never reach them.
//   - the timestamp does not sort after every existing migration, or a target file exists without --overwrite.
//
// Idempotency: products `on conflict (rpl_id) do nothing`; substances only for the products inserted by the same
// statement (`returning`), never joined to the whole table; pairs `on conflict (group_a, group_b) do nothing`.
// Re-running a data migration, or a later top-up migration covering the same products, adds nothing twice.
//
// The scope (which groups are loaded) is a filter applied here, never a column in the database.

import { Buffer } from "node:buffer";
import { access, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import { loadCorrections, prepareRegister } from "./corrections.mjs";
import { inScope } from "./derive.mjs";
import { DEFAULT_CORRECTIONS, DEFAULT_OUT, loadPinnedRpl, renderMeasurementReport } from "./measure.mjs";
import { loadPairs } from "./pairs.mjs";
import { REPO_ROOT } from "./snapshot.mjs";

const DEFAULT_PAIRS = path.join(REPO_ROOT, "supabase", "seed-data", "interaction_pairs.csv");
const MIGRATIONS_DIR = path.join(REPO_ROOT, "supabase", "migrations");
const TIMESTAMP = /^\d{14}$/;

// --- SQL building (pure, tested in generate.test.mjs) ----------------------

// Standard SQL string literal. standard_conforming_strings is on in every supported Postgres, so a backslash is
// an ordinary character and only the quote needs doubling.
export function sqlString(value) {
  if (value === null || value === undefined) return "null";
  return `'${String(value).replace(/'/g, "''")}'`;
}

export function sqlTextArray(values) {
  if (values.length === 0) return "'{}'::text[]";
  return `array[${values.map(sqlString).join(", ")}]::text[]`;
}

// JSON text inside a string literal: JSON.stringify escapes what JSON needs, sqlString what SQL needs.
export function sqlJsonb(value) {
  return `${sqlString(JSON.stringify(value))}::jsonb`;
}

// One line of a `--` comment: a line break inside a source value would end the comment and turn the rest of
// the value into SQL.
export function commentText(value) {
  return String(value ?? "—")
    .replace(/\s+/g, " ")
    .trim();
}

// Groups of the filter: the union of group_a and group_b of the accepted pairs, sorted.
export function pairGroups(pairs) {
  return [...new Set(pairs.flatMap((pair) => [pair.groupA, pair.groupB]))].sort();
}

// `YYYYMMDDHHmmss` plus whole minutes, in UTC. The pairs migration takes the registry timestamp plus one minute,
// so the two always sort registry first.
export function addMinutes(timestamp, minutes) {
  const [, y, mo, d, h, mi, s] = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/.exec(timestamp);
  const date = new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi + minutes, +s));
  return date.toISOString().replace(/\D/g, "").slice(0, 14);
}

function countBy(items, key) {
  const counts = new Map();
  for (const item of items) counts.set(key(item), (counts.get(key(item)) ?? 0) + 1);
  return [...counts.entries()].sort(([a], [b]) => a.localeCompare(b));
}

const byRplId = (a, b) => a.rplId.localeCompare(b.rplId, "en", { numeric: true });

// Header shared by both migrations: where the data comes from and what the filter was.
function sourceHeader({ manifest, groups, products, rejectedAtcCodes }) {
  const substances = products.flatMap((product) => product.substanceCodes);
  const scopedIds = new Set(products.map((product) => product.rplId));
  const lines = [
    "Source: Rejestr Produktów Leczniczych (RPL), licensed CC BY 4.0 — the source must be credited.",
    `  url:            ${manifest.url}`,
    `  schema version: ${manifest.schemaVersion}`,
    `  stanNaDzien:    ${manifest.stanNaDzien}`,
    `  sha256:         ${manifest.sha256}`,
    "",
    `Groups (union of group_a and group_b of the verified pairs): ${groups.join(", ")}`,
    "",
    `Registry products in scope: ${products.length}`,
    `Registry substance rows: ${substances.length}`,
    ...countBy(substances, (row) => row.atcSource).map(([source, count]) => `  atc_source ${source}: ${count}`),
    "",
    `ATC codes rejected while cleaning (${rejectedAtcCodes.length}; kept raw in atc_codes and source_payload):`,
    ...(rejectedAtcCodes.length === 0
      ? ["  none"]
      : rejectedAtcCodes.map(
          (entry) =>
            `  ${entry.rplId} ${commentText(entry.productName)}: ${JSON.stringify(entry.value)}` +
            (scopedIds.has(entry.rplId) ? " (in scope)" : " (out of scope)"),
        )),
  ];
  return lines;
}

function commentBlock(lines) {
  return lines.map((line) => (line === "" ? "--" : `-- ${line}`)).join("\n");
}

// Product-level codes as the schema describes them: valid codes after cleaning, then the rejected source values
// untouched ("BRAK"), so the column keeps everything the source said.
function productAtcCodes(product, rejectedByProduct) {
  return [...product.atcCodes, ...(rejectedByProduct.get(product.rplId) ?? [])];
}

// `products`: in-scope products from prepareRegister(), each with substanceCodes, compositionSource and
// compositionSourceRplId. → SQL text of the registry seed migration.
export function buildRegistrySeedSql({ manifest, groups, products, rejectedAtcCodes, appliedCorrections, title }) {
  const sorted = [...products].sort(byRplId);
  const rejectedByProduct = new Map();
  for (const entry of rejectedAtcCodes) {
    rejectedByProduct.set(entry.rplId, [...(rejectedByProduct.get(entry.rplId) ?? []), entry.value]);
  }
  const productNames = new Map(sorted.map((product) => [product.rplId, product.productName]));

  const header = [
    `Migration: ${title}`,
    "Generated by node scripts/rpl/generate.mjs — do not edit by hand. A new group means a new top-up migration",
    "from the generator; an applied migration is never edited.",
    "",
    ...sourceHeader({ manifest, groups, products: sorted, rejectedAtcCodes }),
    "",
    "Products by composition_source:",
    ...countBy(sorted, (product) => product.compositionSource).map(([source, count]) => `  ${source}: ${count}`),
    "Substance rows by composition_source:",
    ...countBy(
      sorted.flatMap((product) => product.substanceCodes.map(() => product.compositionSource)),
      (source) => source,
    ).map(([source, count]) => `  ${source}: ${count}`),
    "",
    `Applied substance corrections (${appliedCorrections.length}; kind | product | substance | source | verified_on):`,
    ...appliedCorrections.map((row) => {
      const product = row.rplId === "" ? "—" : `${row.rplId} ${commentText(productNames.get(row.rplId) ?? "")}`;
      return `  ${row.kind} | ${commentText(product)} | ${commentText(row.substance || "—")} | ${commentText(row.source)} | ${row.verifiedOn}`;
    }),
    "",
    "Idempotent: products on conflict (rpl_id) do nothing; substances only for products inserted by this",
    "statement (returning), so a re-run or a later top-up never duplicates the composition of a loaded product.",
  ];

  const productTuples = sorted.map(
    (product) =>
      `    (${[
        sqlString(product.rplId),
        sqlString(product.productName),
        sqlString(product.commonName),
        sqlString(product.strength),
        sqlString(product.form),
        sqlString(product.procedureType),
        sqlString(product.authorizationNumber),
        sqlString(product.authorizationValidity),
        sqlString(product.holder),
        sqlTextArray(productAtcCodes(product, rejectedByProduct)),
        sqlJsonb(product.raw),
        `${sqlString(manifest.stanNaDzien)}::date`,
      ].join(", ")})`,
  );

  const substanceTuples = sorted.flatMap((product) =>
    product.substanceCodes.map(
      (row) =>
        `    (${[
          sqlString(product.rplId),
          `${Number(row.position)}::smallint`,
          sqlString(row.name),
          sqlString(row.normalizedName),
          sqlString(row.atcCode),
          sqlString(row.atcSource),
          sqlString(product.compositionSource),
          sqlString(product.compositionSourceRplId),
        ].join(", ")})`,
    ),
  );

  const insertProducts = [
    "insert into public.registry_products (",
    "    rpl_id, product_name, common_name, strength, pharmaceutical_form, procedure_type,",
    "    authorization_number, authorization_validity, marketing_authorization_holder,",
    "    atc_codes, source_payload, snapshot_date",
    "  )",
    "  values",
    productTuples.join(",\n"),
    "  on conflict (rpl_id) do nothing",
    "  returning id, rpl_id",
  ];

  let statement;
  if (substanceTuples.length === 0) {
    statement = `${insertProducts.join("\n")};`;
  } else {
    statement = [
      "with inserted_products as (",
      `  ${insertProducts.join("\n")}`,
      "),",
      "substance_rows (",
      "  rpl_id, position, substance_name, normalized_name, atc_code, atc_source,",
      "  composition_source, composition_source_rpl_id",
      ") as (",
      "  values",
      substanceTuples.join(",\n"),
      ")",
      "insert into public.registry_substances (",
      "  registry_product_id, position, substance_name, normalized_name, atc_code, atc_source,",
      "  composition_source, composition_source_rpl_id",
      ")",
      "select",
      "  inserted_products.id, substance_rows.position, substance_rows.substance_name,",
      "  substance_rows.normalized_name, substance_rows.atc_code, substance_rows.atc_source,",
      "  substance_rows.composition_source, substance_rows.composition_source_rpl_id",
      "from substance_rows",
      "join inserted_products on inserted_products.rpl_id = substance_rows.rpl_id;",
    ].join("\n");
  }

  return `${commentBlock(header)}\n\n${statement}\n`;
}

// `pairs`: accepted pairs from loadPairs(), groups already in canonical order. → SQL text of the pairs migration.
export function buildPairsSeedSql({ manifest, groups, products, rejectedAtcCodes, pairs, title }) {
  const sorted = [...pairs].sort((a, b) => a.groupA.localeCompare(b.groupA) || a.groupB.localeCompare(b.groupB));
  const header = [
    `Migration: ${title}`,
    "Generated by node scripts/rpl/generate.mjs from supabase/seed-data/interaction_pairs.csv — do not edit by",
    "hand. Only pairs with verified_on (accepted by loadPairs) are included. A new pair means a new migration.",
    "",
    ...sourceHeader({ manifest, groups, products, rejectedAtcCodes }),
    "",
    `Interaction pairs: ${sorted.length}`,
    "",
    "Idempotent: on conflict (group_a, group_b) do nothing.",
  ];
  const tuples = sorted.map(
    (pair) =>
      `  (${[
        sqlString(pair.groupA),
        sqlString(pair.groupB),
        sqlString(pair.description),
        sqlString(pair.source),
        `${sqlString(pair.verifiedOn)}::date`,
      ].join(", ")})`,
  );
  const statement = [
    "insert into public.interaction_pairs (group_a, group_b, description, source, verified_on)",
    "values",
    tuples.join(",\n"),
    "on conflict (group_a, group_b) do nothing;",
  ].join("\n");
  return `${commentBlock(header)}\n\n${statement}\n`;
}

// --- CLI ------------------------------------------------------------------

function flag(name) {
  const index = process.argv.indexOf(name);
  if (index === -1) return undefined;
  const value = process.argv[index + 1];
  if (value === undefined || value.startsWith("--")) fail(`${name} needs a value.`);
  return value;
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

function nowTimestamp() {
  return new Date().toISOString().replace(/\D/g, "").slice(0, 14);
}

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const timestamp = flag("--timestamp") ?? nowTimestamp();
  if (!TIMESTAMP.test(timestamp)) fail(`--timestamp must be YYYYMMDDHHmmss, got ${timestamp}.`);
  const outDir = path.resolve(flag("--out-dir") ?? MIGRATIONS_DIR);
  const pairsPath = path.resolve(flag("--pairs") ?? DEFAULT_PAIRS);
  const correctionsPath = path.resolve(flag("--corrections") ?? DEFAULT_CORRECTIONS);
  const reportPath = path.resolve(flag("--report") ?? DEFAULT_OUT);
  const overwrite = process.argv.includes("--overwrite");
  const relative = (target) => path.relative(REPO_ROOT, target);

  let pinned;
  let pairs;
  try {
    pinned = await loadPinnedRpl(flag("--file"));
    pairs = await loadPairs(pairsPath);
  } catch (error) {
    fail(error.message);
  }

  for (const entry of pairs.skipped) {
    console.log(`pairs: skipped line ${entry.line} ${entry.row.groupA} x ${entry.row.groupB} — ${entry.message}`);
  }
  if (pairs.errors.length > 0) {
    for (const entry of pairs.errors) console.error(`pairs: error line ${entry.line}: ${entry.message}`);
    fail(`Refusing to generate: ${relative(pairsPath)} has ${pairs.errors.length} error(s).`);
  }
  if (pairs.accepted.length === 0) fail(`Refusing to generate: no verified pair in ${relative(pairsPath)}.`);
  const groups = pairGroups(pairs.accepted);

  let corrections;
  try {
    corrections = await loadCorrections(correctionsPath, pinned.parsed.products);
  } catch (error) {
    fail(error.message);
  }

  // The report is refreshed before any refusal on corrections: it lists the pending and rejected rows with their
  // reasons, which is exactly what the author needs to clear them.
  const { report, summary } = renderMeasurementReport({
    ...pinned,
    correctionsPath,
    groups,
    corrections,
    groupsLabel: {
      heading: "Grupy ze sprawdzonych par",
      intro:
        "Suma `group_a` i `group_b` par zaakceptowanych przez `loadPairs` (z `verified_on`) — ta sama lista, którą filtruje generator migracji:",
    },
    generatedBy: "node scripts/rpl/generate.mjs",
  });
  await writeFile(reportPath, report);
  console.log(`Report written to ${relative(reportPath)}`);
  for (const line of summary) console.log(line);

  if (corrections.errors.length > 0 || corrections.pending.length > 0) {
    fail(
      `Refusing to generate: ${relative(correctionsPath)} has ${corrections.errors.length} error(s) and ` +
        `${corrections.pending.length} pending row(s). Verify or remove every pending row first — a top-up ` +
        "migration never touches products already loaded, so a later correction would not reach them.",
    );
  }

  const registryFile = path.join(outDir, `${timestamp}_registry_seed.sql`);
  const pairsFile = path.join(outDir, `${addMinutes(timestamp, 1)}_interaction_pairs_seed.sql`);
  const targets = new Set([path.basename(registryFile), path.basename(pairsFile)]);
  const existing = (await readdir(outDir)).filter((name) => name.endsWith(".sql") && !targets.has(name));
  const latest = existing
    .map((name) => name.slice(0, 14))
    .sort()
    .at(-1);
  if (latest !== undefined && timestamp <= latest) {
    fail(`Refusing to generate: timestamp ${timestamp} must sort after the latest migration (${latest}).`);
  }
  for (const target of [registryFile, pairsFile]) {
    if (!overwrite && (await exists(target))) {
      fail(`Refusing to overwrite ${relative(target)} — pass --overwrite only for a migration not applied anywhere.`);
    }
  }

  const register = prepareRegister(pinned.parsed.products, corrections.applied);
  const products = register.products.filter((product) => inScope(product, groups));
  const context = { manifest: pinned.manifest, groups, products, rejectedAtcCodes: pinned.parsed.rejectedAtcCodes };

  const registrySql = buildRegistrySeedSql({
    ...context,
    appliedCorrections: corrections.applied,
    title: "registry seed (RPL products and substances in the scope of the verified pairs)",
  });
  const pairsSql = buildPairsSeedSql({
    ...context,
    pairs: pairs.accepted,
    title: "interaction pairs seed (pairs verified by the author)",
  });
  await writeFile(registryFile, registrySql);
  await writeFile(pairsFile, pairsSql);

  const megabytes = (bytes) => (bytes / 1024 / 1024).toFixed(1);
  console.log(
    `Wrote ${relative(registryFile)} (${products.length} products, ` +
      `${products.reduce((sum, product) => sum + product.substanceCodes.length, 0)} substance rows, ` +
      `${megabytes(Buffer.byteLength(registrySql))} MB)`,
  );
  console.log(`Wrote ${relative(pairsFile)} (${pairs.accepted.length} pairs, groups: ${groups.join(", ")})`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === import.meta.filename) await main();
