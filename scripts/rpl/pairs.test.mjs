import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

import { FORBIDDEN_WORDS, PAIR_COLUMNS, loadPairs, parsePairs, validatePairs } from "./pairs.mjs";
import { REPO_ROOT } from "./snapshot.mjs";

const HEADER = PAIR_COLUMNS.map((column) => `"${column}"`).join(";");
const DESCRIPTION = "Sartany i leki z grupy ibuprofenu mogą wchodzić w interakcję; może mieć związek z objawami.";
const SOURCE = "ChPL Diovan pkt 4.5";

// rows: [group_a, group_b, verified_on, description, source]
function csv(rows) {
  const lines = rows.map(([groupA, groupB, verifiedOn = "2026-10-02", description = DESCRIPTION, source = SOURCE]) =>
    [groupA, groupB, description, source, verifiedOn].map((value) => `"${value}"`).join(";"),
  );
  return [HEADER, ...lines].join("\n") + "\n";
}

const validate = (rows) => validatePairs(parsePairs(csv(rows)));
const reasons = (result) => result.errors.map((error) => [error.line, error.reason]);
const groups = (pairs) => pairs.map((pair) => [pair.groupA, pair.groupB]);

test("a verified pair in canonical order is accepted as written", () => {
  const result = validate([["C09CA", "M01AE"]]);
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.skipped, []);
  assert.deepEqual(groups(result.accepted), [["C09CA", "M01AE"]]);
  assert.equal(result.accepted[0].description, DESCRIPTION);
  assert.equal(result.accepted[0].source, SOURCE);
  assert.equal(result.accepted[0].verifiedOn, "2026-10-02");
  assert.equal(result.accepted[0].line, 2);
});

test("groups written in reverse order are brought to canonical order", () => {
  const result = validate([["M01AE", "C09CA"]]);
  assert.deepEqual(result.errors, []);
  assert.deepEqual(groups(result.accepted), [["C09CA", "M01AE"]]);
});

test("a group paired with itself is allowed", () => {
  const result = validate([["M01AE", "M01AE"]]);
  assert.deepEqual(result.errors, []);
  assert.deepEqual(groups(result.accepted), [["M01AE", "M01AE"]]);
});

test("a repeated pair is a duplicate error", () => {
  const result = validate([
    ["C09CA", "M01AE"],
    ["C09CA", "M01AE"],
  ]);
  assert.deepEqual(reasons(result), [[3, "duplicate_pair"]]);
  assert.match(result.errors[0].message, /line 2/);
  assert.deepEqual(groups(result.accepted), [["C09CA", "M01AE"]]);
});

test("A x B and B x A are one pair: the reversed row is a duplicate error", () => {
  const result = validate([
    ["C09CA", "M01AE"],
    ["M01AE", "C09CA"],
  ]);
  assert.deepEqual(reasons(result), [[3, "duplicate_pair"]]);
});

test("an unverified row still counts for duplicates", () => {
  const result = validate([
    ["C09CA", "M01AE", ""],
    ["M01AE", "C09CA"],
  ]);
  assert.deepEqual(reasons(result), [[3, "duplicate_pair"]]);
  assert.deepEqual(result.accepted, []);
});

test("codes are checked with the database shape", () => {
  const result = validate([
    ["C09CA", "M01AE"],
    ["c09ca", "M01AE"],
    ["C9CA", "M01AE"],
    ["C09CA", "M01AE011"],
    ["", "M01AE"],
    ["C09CA", "M01 AE"],
  ]);
  assert.deepEqual(reasons(result), [
    [3, "invalid_atc_code"],
    [4, "invalid_atc_code"],
    [5, "invalid_atc_code"],
    [6, "invalid_atc_code"],
    [7, "invalid_atc_code"],
  ]);
  assert.match(result.errors[3].message, /group_a/);
  assert.match(result.errors[4].message, /group_b/);
});

test("every level of the ATC code the database accepts is accepted", () => {
  const result = validate([
    ["C09", "M01"],
    ["C09C", "M01A"],
    ["C09CA", "M01AE01"],
  ]);
  assert.deepEqual(result.errors, []);
  assert.deepEqual(groups(result.accepted), [
    ["C09", "M01"],
    ["C09C", "M01A"],
    ["C09CA", "M01AE01"],
  ]);
});

test("a row without verified_on is skipped with a reason, not an error", () => {
  const result = validate([
    ["C09CA", "M01AE", ""],
    ["B01AA", "M01AE"],
  ]);
  assert.deepEqual(result.errors, []);
  assert.deepEqual(groups(result.accepted), [["B01AA", "M01AE"]]);
  assert.equal(result.skipped.length, 1);
  assert.equal(result.skipped[0].line, 2);
  assert.equal(result.skipped[0].reason, "not_verified");
  assert.deepEqual([result.skipped[0].row.groupA, result.skipped[0].row.groupB], ["C09CA", "M01AE"]);
});

test("a malformed verified_on is an error", () => {
  const result = validate([
    ["C09CA", "M01AE", "02.10.2026"],
    ["C09AA", "M01AE", "2026-10"],
    ["C09CA", "M01AB", "2026-02-30"],
    ["C09AA", "M01AB", "tak"],
  ]);
  assert.deepEqual(reasons(result), [
    [2, "invalid_verified_on"],
    [3, "invalid_verified_on"],
    [4, "invalid_verified_on"],
    [5, "invalid_verified_on"],
  ]);
});

test("an empty description or source is an error, also on an unverified row", () => {
  const result = validate([
    ["C09CA", "M01AE", "2026-10-02", "   "],
    ["C09AA", "M01AE", "2026-10-02", DESCRIPTION, ""],
    ["C09CA", "M01AB", "", ""],
  ]);
  assert.deepEqual(reasons(result), [
    [2, "missing_description"],
    [3, "missing_source"],
    [4, "missing_description"],
  ]);
});

test("a row with too many or too few columns is an error", () => {
  const text = `${HEADER}\n"C09CA";"M01AE";"${DESCRIPTION}";"${SOURCE}";"2026-10-02";"extra"\n"C09AA";"M01AE"\n`;
  const result = validatePairs(parsePairs(text));
  assert.deepEqual(reasons(result), [
    [2, "column_count"],
    [3, "column_count"],
  ]);
});

test("the forbidden-word list is the one the plan names", () => {
  assert.deepEqual(FORBIDDEN_WORDS, [
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
  ]);
});

test("a description without the required wording is an error, also on an unverified row", () => {
  const result = validate([
    ["C09CA", "M01AE", "2026-10-02", "Sartany i leki z grupy ibuprofenu mogą wchodzić w interakcję."],
    ["C09AA", "M01AE", "", "Może to mieć związek z objawami."],
  ]);
  assert.deepEqual(reasons(result), [
    [2, "missing_required_wording"],
    [3, "missing_required_wording"],
  ]);
  assert.deepEqual(result.skipped, []);
});

test("the required wording is matched regardless of case and diacritic encoding", () => {
  const result = validate([["C09CA", "M01AE", "2026-10-02", "MOŻE MIEĆ ZWIĄZEK z objawami.".normalize("NFD")]]);
  assert.deepEqual(result.errors, []);
});

test("forbidden wording is caught regardless of case, diacritic encoding and spacing", () => {
  const cases = [
    "Ta para POWODUJE objawy.",
    "Lek Wywołuje objawy.",
    "Rozważ ODSTAWIENIE leku.",
    "ZMIEŃ DAWKĘ leku.",
    "Zmień \t  dawkę leku.",
    "Sytuacja GROŹNA.",
    "Nie Wolno ich przyjmować razem.",
    "Połączenie niebezpieczne.".normalize("NFD"),
    "Zmień dawkę leku.".normalize("NFD"),
  ];
  const result = validate(
    cases.map((description, index) => ["C09CA", `M01AE0${index + 1}`, "2026-10-02", description]),
  );
  assert.deepEqual(
    reasons(result),
    cases.map((_, index) => [index + 2, "forbidden_word"]),
  );
});

test("the forbidden-word check applies to unverified rows too", () => {
  const result = validate([["C09CA", "M01AE", "", "Sartany powodują objawy."]]);
  assert.deepEqual(reasons(result), [[2, "forbidden_word"]]);
  assert.deepEqual(result.skipped, []);
});

test("FR-012 wording passes the check", () => {
  const result = validate([
    [
      "C09CA",
      "M01AE",
      "2026-10-02",
      "Sartany i leki z grupy ibuprofenu mogą wchodzić w interakcję; jednoczesne przyjmowanie może mieć związek ze zmianą ciśnienia.",
    ],
  ]);
  assert.deepEqual(result.errors, []);
});

test("a wrong header throws instead of validating shifted columns", () => {
  assert.throws(() => parsePairs('"group_a";"group_b";"description";"source"\n'), /header must be/);
  assert.throws(() => parsePairs('"group_b";"group_a";"description";"source";"verified_on"\n'), /header must be/);
  assert.throws(() => parsePairs(""), /empty file/);
});

test("loadPairs reads a file and reports a missing one", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "pairs-"));
  const file = path.join(dir, "pairs.csv");
  await writeFile(file, csv([["M01AE", "C09CA"]]));
  const result = await loadPairs(file);
  assert.deepEqual(groups(result.accepted), [["C09CA", "M01AE"]]);
  await assert.rejects(loadPairs(path.join(dir, "missing.csv")), /No pairs file/);
});

test("the pairs file in the repository loads without errors", async () => {
  const file = path.join(REPO_ROOT, "supabase", "seed-data", "interaction_pairs.csv");
  const result = await loadPairs(file);
  assert.deepEqual(result.errors, []);
});
