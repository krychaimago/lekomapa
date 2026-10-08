// Terms of use (S-01): the text shown in the app is the approved text from context/foundation, word for word, and
// the current version exists both as a file and as a terms_versions row. The approved file is the oracle — the
// expected structure is parsed from it, never built from src/lib/copy/terms.ts.

import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { CURRENT_TERMS_VERSION, TERMS_V1, TERMS_V1_EFFECTIVE_ON } from "../../src/lib/copy/terms.ts";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const FOUNDATION = path.join(REPO_ROOT, "context", "foundation");
const MIGRATIONS = path.join(REPO_ROOT, "supabase", "migrations");

// Placeholders of the approved file, filled in the app by a link and by the effective date.
const DATE_PLACEHOLDER = "[data wdrożenia S-01]";
const PRIVACY_PLACEHOLDER = "[strona prywatności]";

// The approved text sits between the first two `---` lines; the rest of the file is notes for the author.
// → { title, versionLine, sections: [{ heading, points }] }
function parseApprovedTerms(markdown) {
  const block = markdown.split("\n---\n")[1];
  assert.ok(block, "approved block between `---` lines not found");
  const lines = block.split("\n").filter((line) => line.trim() !== "");
  const [titleLine, versionLine, ...rest] = lines;
  const sections = [];
  for (const line of rest) {
    const heading = /^\*\*(.+)\*\*$/.exec(line);
    if (heading) {
      sections.push({ heading: heading[1], points: [] });
      continue;
    }
    assert.ok(line.startsWith("- ") && sections.length > 0, `unexpected line in the approved block: "${line}"`);
    sections.at(-1).points.push(line.slice(2));
  }
  return { title: /^\*\*(.+)\*\*$/.exec(titleLine)?.[1], versionLine, sections };
}

// Dates are shown as DD.MM.YYYY, the same in the app and in the approved file.
function displayDate(isoDate) {
  return isoDate.split("-").reverse().join(".");
}

test("terms v1 in the app are the approved text, word for word", () => {
  const approved = parseApprovedTerms(readFileSync(path.join(FOUNDATION, "terms-of-use-v1.md"), "utf8"));
  const effectiveOn = TERMS_V1_EFFECTIVE_ON === null ? DATE_PLACEHOLDER : displayDate(TERMS_V1_EFFECTIVE_ON);
  const inApp = {
    title: TERMS_V1.title,
    versionLine: TERMS_V1.versionLine.replace("{effectiveOn}", effectiveOn),
    sections: TERMS_V1.sections.map(({ heading, points }) => ({
      heading,
      points: points.map((point) => point.replace("{privacyLink}", PRIVACY_PLACEHOLDER)),
    })),
  };
  assert.deepEqual(inApp, approved);
});

test("the approved file of the current version exists", () => {
  assert.ok(existsSync(path.join(FOUNDATION, `terms-of-use-v${CURRENT_TERMS_VERSION}.md`)));
});

test("a migration inserts the current version into terms_versions", () => {
  const inserted = new Set();
  for (const file of readdirSync(MIGRATIONS).filter((name) => name.endsWith(".sql"))) {
    const sql = readFileSync(path.join(MIGRATIONS, file), "utf8");
    for (const [, values] of sql.matchAll(/insert into public\.terms_versions\s*\(version\)\s*values\s*([^;]+);/gi)) {
      for (const [, version] of values.matchAll(/\(\s*(\d+)\s*\)/g)) inserted.add(Number(version));
    }
  }
  assert.ok(inserted.has(CURRENT_TERMS_VERSION), `inserted versions: ${[...inserted].join(", ") || "none"}`);
});
