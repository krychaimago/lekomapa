// The journal tab is called "Dziennik" (journal-tab-rename, MS-02): "Dzienniczek" did not fit the menu on a small
// screen. Every interior text uses the same name, so a link in Wizyta leads to a tab with the name it promises.
// Addresses stay /dzienniczek/* on purpose — only the visible name changed. The one exception is the product tagline
// on the entry screens (AUTH_COPY.spread.heading), which describes the product, not the tab.

import assert from "node:assert/strict";
import { test } from "node:test";

import { ACCOUNT_COPY } from "../../src/lib/copy/account.ts";
import { AUTH_COPY } from "../../src/lib/copy/auth.ts";
import { DOCTOR_QUESTION_COPY } from "../../src/lib/copy/doctor-question.ts";
import { JOURNAL_COPY } from "../../src/lib/copy/journal.ts";
import { VISIT_SUMMARY_COPY } from "../../src/lib/copy/visit-summary.ts";
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

const texts = [
  ...collectTexts(ACCOUNT_COPY, ["ACCOUNT_COPY"]),
  ...collectTexts(AUTH_COPY, ["AUTH_COPY"]),
  ...collectTexts(DOCTOR_QUESTION_COPY, ["DOCTOR_QUESTION_COPY"]),
  ...collectTexts(JOURNAL_COPY, ["JOURNAL_COPY"]),
  ...collectTexts(VISIT_SUMMARY_COPY, ["VISIT_SUMMARY_COPY"]),
];

test("the journal menu item is labelled Dziennik and keeps its address", () => {
  const item = NAV_ITEMS.find(({ href }) => href === "/dzienniczek");
  assert.ok(item, "no menu item for /dzienniczek");
  assert.equal(item.label, "Dziennik");
});

test("the journal screen title is Dziennik", () => {
  assert.equal(JOURNAL_COPY.list.title, "Dziennik");
});

test("no interior text uses the old name, except the product tagline", () => {
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
