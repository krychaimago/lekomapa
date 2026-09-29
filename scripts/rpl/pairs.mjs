// Interaction pairs: the file the author reads, corrects and approves before any pair reaches a migration.
// Only rows with verified_on are accepted; rows without it are skipped with a reason, never acted on.
// Every row, verified or not, goes through the same checks: code shape as in the database, canonical order,
// duplicates after canonicalization, and the FR-012 language check on `description`.
//
// Usage: node scripts/rpl/pairs.mjs <path to interaction_pairs.csv>
// Exit code is non-zero only when the file has errors; skipped rows are expected while the author works.

import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import { parseCsv } from "./corrections.mjs";
import { ATC_SHAPE } from "./parse.mjs";

export const PAIR_COLUMNS = ["group_a", "group_b", "description", "source", "verified_on"];

// FR-012: a description never states a cause, never suggests stopping or changing a dose, never bans, never claims
// safety and never ranks by suspicion. Stems, matched as substrings, case-insensitive. The list is a check, not a
// style guide — a description that passes it can still be wrong, which is why the author reads every one.
// Test cases live in scripts/fr012/corpus.mjs, written from the PRD, not from this list. Every stem can also block a
// neutral word (like `dawk` blocks any mention of a dose); a stem that would reject a compliant corpus sentence is
// narrowed to the forbidden phrasing (`zwiększa ryzyk`, `ogranicz przyjm`) instead of being dropped.
export const FORBIDDEN_WORDS = [
  "powoduj",
  "wywoł",
  "odstaw",
  "przerwij",
  "przerwan",
  "zmień daw",
  "zmniejsz daw",
  "zmniejsz ilość",
  "zwiększ daw",
  "ogranicz przyjm",
  "zamień",
  "zamien",
  "zmień lek",
  "rezygn",
  "nie bierz",
  "nie łącz",
  "nie przyjmuj",
  "nie stosuj",
  "zakaz",
  "nie wolno",
  "bezpieczn",
  "nieszkodliw",
  "dozwolon",
  "groźn",
  "grozi",
  "prowadz",
  "przyczyn",
  "skutk",
  "wynikiem",
  "wynikaj",
  "odpowiada za objaw",
  "zwiększa ryzyk",
  "podejrz",
  "dawk",
  "przesta",
  "unika",
];

// FR-012: the only wording a description may use for the link between a pair and a symptom. Required, because
// the stem list above will always be incomplete.
export const REQUIRED_WORDING = "może mieć związek";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

// Same lowering for text and stems: NFC so a decomposed "ł" or "ź" still matches, Polish locale for case,
// whitespace collapsed so "zmień  dawkę" split by a double space or a line break is still caught.
function foldText(text) {
  return text.normalize("NFC").toLocaleLowerCase("pl").replace(/\s+/g, " ");
}

export function forbiddenWordsIn(description) {
  const folded = foldText(description);
  return FORBIDDEN_WORDS.filter((word) => folded.includes(foldText(word)));
}

function isCalendarDate(value) {
  if (!ISO_DATE.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

// → [{ line, groupA, groupB, description, source, verifiedOn, extraFields }]. Throws on a wrong header: a file
// with shifted columns would otherwise validate row by row into nonsense.
export function parsePairs(text) {
  const [header, ...records] = parseCsv(text);
  const actual = header?.fields.map((name) => name.trim()) ?? [];
  if (actual.join(";") !== PAIR_COLUMNS.join(";")) {
    throw new Error(`Pairs CSV header must be ${PAIR_COLUMNS.join(";")}, got ${actual.join(";") || "(empty file)"}.`);
  }
  return records.map(({ line, fields }) => {
    const [groupA, groupB, description, source, verifiedOn] = PAIR_COLUMNS.map((_, index) =>
      (fields[index] ?? "").trim(),
    );
    return {
      line,
      groupA,
      groupB,
      description,
      source,
      verifiedOn,
      extraFields: fields.length - PAIR_COLUMNS.length,
    };
  });
}

// Checks that need nothing but the row itself. → { reason, message } or null.
function rowReason(row) {
  if (row.extraFields !== 0) {
    return { reason: "column_count", message: `expected ${PAIR_COLUMNS.length} columns` };
  }
  for (const [column, value] of [
    ["group_a", row.groupA],
    ["group_b", row.groupB],
  ]) {
    if (!ATC_SHAPE.test(value)) {
      return { reason: "invalid_atc_code", message: `${column} "${value}" is not an ATC code` };
    }
  }
  if (row.description === "") return { reason: "missing_description", message: "description is empty" };
  if (row.source === "") return { reason: "missing_source", message: "source is empty" };
  const forbidden = forbiddenWordsIn(row.description);
  if (forbidden.length > 0) {
    return {
      reason: "forbidden_word",
      message: `description contains forbidden wording (FR-012): ${forbidden.join(", ")}`,
    };
  }
  if (!foldText(row.description).includes(foldText(REQUIRED_WORDING))) {
    return { reason: "missing_required_wording", message: `description must contain "${REQUIRED_WORDING}" (FR-012)` };
  }
  if (row.verifiedOn !== "" && !isCalendarDate(row.verifiedOn)) {
    return { reason: "invalid_verified_on", message: `verified_on "${row.verifiedOn}" is not a YYYY-MM-DD date` };
  }
  return null;
}

// → { accepted, skipped, errors }. Accepted and skipped rows carry groups in canonical order (group_a <= group_b),
// the order the database enforces. Errors are { line, row, reason, message }: `reason` is a stable code for tests
// and tools. A row that fails validation is an error whether it is verified or not.
export function validatePairs(rows) {
  const accepted = [];
  const skipped = [];
  const errors = [];
  const seen = new Map();

  for (const row of rows) {
    const invalid = rowReason(row);
    if (invalid) {
      errors.push({ line: row.line, row, ...invalid });
      continue;
    }
    const [groupA, groupB] = row.groupA <= row.groupB ? [row.groupA, row.groupB] : [row.groupB, row.groupA];
    const pair = { ...row, groupA, groupB };
    const key = `${groupA}\u0000${groupB}`;
    if (seen.has(key)) {
      errors.push({
        line: row.line,
        row: pair,
        reason: "duplicate_pair",
        message: `${groupA} x ${groupB} is already on line ${seen.get(key)}`,
      });
      continue;
    }
    seen.set(key, row.line);
    if (pair.verifiedOn === "") {
      skipped.push({ line: row.line, row: pair, reason: "not_verified", message: "verified_on is empty" });
    } else {
      accepted.push(pair);
    }
  }
  return { accepted, skipped, errors };
}

export async function loadPairs(filePath) {
  let text;
  try {
    text = await readFile(filePath, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") throw new Error(`No pairs file at ${filePath}.`, { cause: error });
    throw error;
  }
  return validatePairs(parsePairs(text));
}

async function main() {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error("Usage: node scripts/rpl/pairs.mjs <path to interaction_pairs.csv>");
    process.exit(1);
  }
  let result;
  try {
    result = await loadPairs(filePath);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
  const { accepted, skipped, errors } = result;
  for (const pair of accepted) console.log(`accepted  line ${pair.line}: ${pair.groupA} x ${pair.groupB}`);
  for (const entry of skipped) {
    console.log(`skipped   line ${entry.line}: ${entry.row.groupA} x ${entry.row.groupB} — ${entry.message}`);
  }
  for (const entry of errors) console.error(`error     line ${entry.line}: ${entry.message} [${entry.reason}]`);
  console.log(`accepted=${accepted.length} skipped=${skipped.length} errors=${errors.length}`);
  if (errors.length > 0) process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === import.meta.filename) await main();
