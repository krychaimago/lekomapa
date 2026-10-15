// The journal tab is called "Dziennik" (journal-tab-rename, MS-02): "Dzienniczek" did not fit the menu on a small
// screen. Every interior text uses the same name, so a link in Wizyta leads to a tab with the name it promises.
// Addresses stay /dzienniczek/* on purpose — only the visible name changed. The one exception is the product tagline
// on the entry screens (AUTH_COPY.spread.heading), which describes the product, not the tab.

import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { test } from "node:test";

import { JOURNAL_COPY } from "../../src/lib/copy/journal.ts";
import { NAV_ITEMS } from "../../src/lib/navigation.ts";

// The stem shared by every form: "Dzienniczek", "dzienniczka", "dzienniczku". "dzienniczk" would miss the nominative.
const OLD_NAME = /dziennicz/i;
const ALLOWED_OLD_NAME = new Set(["AUTH_COPY.spread.heading"]);

// → [[path, text]] for every string in the module.
function collectTexts(value, path) {
  if (typeof value === "string") return [[path.join("."), value]];
  if (value !== null && typeof value === "object") {
    return Object.entries(value).flatMap(([key, child]) => collectTexts(child, [...path, key]));
  }
  return [];
}

// Every module in src/lib/copy/, so a new sentence in any of them is covered, not only the ones that named the
// journal when the tab was renamed. Paths start at the export name ("AUTH_COPY.spread.heading").
const COPY_DIR = new URL("../../src/lib/copy/", import.meta.url);
const copyModules = readdirSync(COPY_DIR).filter((name) => name.endsWith(".ts"));
const texts = [];
for (const name of copyModules) {
  const module = await import(new URL(name, COPY_DIR).href);
  for (const [exportName, value] of Object.entries(module)) texts.push(...collectTexts(value, [exportName]));
}

test("the journal menu item is labelled Dziennik and keeps its address", () => {
  const item = NAV_ITEMS.find(({ href }) => href === "/dzienniczek");
  assert.ok(item, "no menu item for /dzienniczek");
  assert.equal(item.label, "Dziennik");
});

test("the journal screen title is Dziennik", () => {
  assert.equal(JOURNAL_COPY.list.title, "Dziennik");
});

test("no interior text uses the old name, except the product tagline", () => {
  assert.ok(copyModules.length >= 10, `only ${copyModules.length} copy modules found`);
  assert.ok(texts.length > 0, "no texts collected");
  const offenders = texts.filter(([path, text]) => OLD_NAME.test(text) && !ALLOWED_OLD_NAME.has(path));
  assert.deepEqual(offenders, []);
  // The exception still exists — otherwise the allowance is stale and should go.
  for (const path of ALLOWED_OLD_NAME) {
    assert.ok(
      texts.some(([p, text]) => p === path && OLD_NAME.test(text)),
      `${path} no longer carries the old name`,
    );
  }
});
