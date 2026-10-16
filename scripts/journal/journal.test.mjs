// Pure helpers behind the symptom journal screens (S-05): search over the closed symptom list, grouping by category
// and the times shown to the user. Expected values come from the PRD and the plan (FR-008, Q-3), not from the code:
// the search ignores case, Polish characters and extra spaces; every time on screen is Polish time.

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import {
  JOURNAL_MAX_DAYS_BACK,
  earliestEntryLocal,
  filterSymptoms,
  formatCorrectionDeadline,
  formatLocalDateTime,
  formatWarsawDateTime,
  groupSymptomsByCategory,
  minOccurredLocal,
  nowInWarsawLocal,
  searchSymptoms,
  selectedCountLabel,
} from "../../src/lib/services/journal.ts";
import { foldForSearch } from "../../src/lib/services/text-fold.ts";

// Run in a zone other than Warsaw: on a machine already in Europe/Warsaw, the helpers would pass even without their
// `timeZone` option. The Worker runs in UTC, so UTC is the zone that matters. Set before any test runs.
process.env.TZ = "UTC";

// A slice of the real catalog (20260926120100_symptom_catalog_seed.sql): names, categories and search terms as seeded.
const catalog = [
  { id: "nausea", name: "mdłości", category: "digestive", sort_order: 1 },
  { id: "diarrhea", name: "biegunka", category: "digestive", sort_order: 3 },
  { id: "headache", name: "ból głowy", category: "nervous", sort_order: 1 },
  { id: "dizziness", name: "zawroty głowy", category: "nervous", sort_order: 2 },
  { id: "rash", name: "wysypka", category: "skin", sort_order: 1 },
];
const terms = [
  { symptom_id: "nausea", term: "nudności" },
  { symptom_id: "diarrhea", term: "sraczka" },
];
const ids = (items) => items.map((item) => item.id);

test("folding drops case, Polish characters (also ł) and extra spaces; composed and decomposed forms fold the same", () => {
  assert.equal(foldForSearch("  Ból   GŁOWY\t"), "bol glowy");
  assert.equal(foldForSearch("Nudności".normalize("NFD")), foldForSearch("Nudności".normalize("NFC")));
  assert.equal(foldForSearch("Nudności"), "nudnosci");
});

test("'nudnosci' typed without Polish characters finds the symptom whose search term is 'nudności'", () => {
  assert.deepEqual(ids(filterSymptoms(catalog, terms, "nudnosci")), ["nausea"]);
  assert.deepEqual(ids(filterSymptoms(catalog, terms, "NUDNOŚCI")), ["nausea"]);
});

test("a symptom is found by its own name, without Polish characters", () => {
  assert.deepEqual(ids(filterSymptoms(catalog, terms, "mdlosci")), ["nausea"]);
});

test("a colloquial word finds its symptom", () => {
  assert.deepEqual(ids(filterSymptoms(catalog, terms, "sraczka")), ["diarrhea"]);
});

test("'ból głowy' with several spaces still matches, and a shared word matches every symptom that has it", () => {
  assert.deepEqual(ids(filterSymptoms(catalog, terms, "ból    głowy")), ["headache"]);
  assert.deepEqual(ids(filterSymptoms(catalog, terms, "  bol glowy ")), ["headache"]);
  assert.deepEqual(ids(filterSymptoms(catalog, terms, "glowy")), ["headache", "dizziness"]);
});

test("an empty or blank query gives null (grouped view), an unknown word an empty list", () => {
  assert.equal(filterSymptoms(catalog, terms, ""), null);
  assert.equal(filterSymptoms(catalog, terms, "   "), null);
  assert.deepEqual(filterSymptoms(catalog, terms, "xyzzy"), []);
});

// Search keeps every ticked symptom reachable (impl-review F5 of the first journal version): a ticked symptom the
// query does not find is pinned above the matches, so its severity buttons stay on screen while searching.
test("an empty or blank query gives null, so the screen shows the grouped list", () => {
  assert.equal(searchSymptoms(catalog, terms, "", ["headache"]), null);
  assert.equal(searchSymptoms(catalog, terms, "   ", ["headache"]), null);
});

test("a ticked symptom the query does not find is pinned; the matches are the plain search result", () => {
  const result = searchSymptoms(catalog, terms, "biegunka", ["headache"]);
  assert.deepEqual(ids(result.pinned), ["headache"]);
  assert.deepEqual(ids(result.matches), ["diarrhea"]);
});

test("a ticked symptom the query finds stays only among the matches, never twice", () => {
  const result = searchSymptoms(catalog, terms, "głowy", ["headache", "rash"]);
  assert.deepEqual(ids(result.pinned), ["rash"]);
  assert.deepEqual(ids(result.matches), ["headache", "dizziness"]);
});

test("pinned symptoms keep the order they were ticked in, not the alphabet", () => {
  const result = searchSymptoms(catalog, terms, "sraczka", ["rash", "headache", "nausea"]);
  assert.deepEqual(ids(result.pinned), ["rash", "headache", "nausea"]);
});

test("an id outside the catalog is skipped; with nothing ticked nothing is pinned", () => {
  assert.deepEqual(ids(searchSymptoms(catalog, terms, "wysypka", ["gone", "headache"]).pinned), ["headache"]);
  assert.deepEqual(searchSymptoms(catalog, terms, "wysypka", []).pinned, []);
});

test("the count next to a category heading is Polish: none at zero, 1 wybrany, 2–4 wybrane, 5+ and 12–14 wybranych", () => {
  assert.equal(selectedCountLabel(0), null);
  const expected = {
    1: "1 wybrany",
    2: "2 wybrane",
    4: "4 wybrane",
    5: "5 wybranych",
    11: "11 wybranych",
    12: "12 wybranych",
    14: "14 wybranych",
    21: "21 wybranych",
    22: "22 wybrane",
    25: "25 wybranych",
  };
  for (const [count, label] of Object.entries(expected)) {
    assert.equal(selectedCountLabel(Number(count)), label, `count ${count}`);
  }
});

test("grouping follows the category order of the screen and sort_order inside a category", () => {
  const shuffled = [catalog[4], catalog[3], catalog[1], catalog[2], catalog[0]];
  const groups = groupSymptomsByCategory(shuffled);
  assert.deepEqual(
    groups.map((group) => [group.category, group.label, ids(group.symptoms)]),
    [
      ["digestive", "pokarmowy", ["nausea", "diarrhea"]],
      ["nervous", "nerwowy", ["headache", "dizziness"]],
      ["skin", "skóra", ["rash"]],
    ],
  );
});

test("a category missing from the screen's list throws with its name instead of showing a symptom without a heading", () => {
  const unknown = [...catalog, { id: "x", name: "objaw", category: "endocrine", sort_order: 1 }];
  assert.throws(() => groupSymptomsByCategory(unknown), /endocrine/);
});

test("deadline later the same Polish day reads 'dziś' with the date", () => {
  // 07:00 and 21:14 in Warsaw (CEST, UTC+2).
  assert.equal(formatCorrectionDeadline("2026-10-20T19:14:00Z", "2026-10-20T05:00:00Z"), "dziś (20.10), godz. 21:14");
});

test("deadline on the next Polish day reads 'jutra' with the date", () => {
  assert.equal(formatCorrectionDeadline("2026-10-21T19:14:00Z", "2026-10-20T19:14:00Z"), "jutra (21.10), godz. 21:14");
});

test("the day boundary is Polish midnight, not UTC midnight", () => {
  // Now 00:30 on 21.10 in Warsaw (still 20.10 in UTC); deadline 07:00 on 21.10: today.
  assert.equal(formatCorrectionDeadline("2026-10-21T05:00:00Z", "2026-10-20T22:30:00Z"), "dziś (21.10), godz. 07:00");
  // Now 23:30 on 20.10 in Warsaw; deadline 00:30 on 21.10 (same UTC date 20.10): tomorrow.
  assert.equal(formatCorrectionDeadline("2026-10-20T22:30:00Z", "2026-10-20T21:30:00Z"), "jutra (21.10), godz. 00:30");
});

test("on the clock change (25.10.2026) a 24-hour window ends an hour earlier on the wall clock", () => {
  // Saved 24.10 at 21:14 CEST (19:14 UTC); 24 hours later is 25.10 19:14 UTC = 20:14 CET.
  assert.equal(formatCorrectionDeadline("2026-10-25T19:14:00Z", "2026-10-24T19:14:00Z"), "jutra (25.10), godz. 20:14");
});

test("a deadline on any other day shows its date", () => {
  assert.equal(formatCorrectionDeadline("2026-10-23T10:00:00Z", "2026-10-20T10:00:00Z"), "23.10, godz. 12:00");
});

test("entry time default is Polish wall-clock time with seconds dropped", () => {
  assert.equal(nowInWarsawLocal(new Date("2026-10-20T19:14:59Z")), "2026-10-20T21:14");
  // After the clock change Warsaw is UTC+1.
  assert.equal(nowInWarsawLocal(new Date("2026-10-30T20:14:00Z")), "2026-10-30T21:14");
  // Polish midnight while UTC is still on the previous day.
  assert.equal(nowInWarsawLocal(new Date("2026-10-20T22:05:00Z")), "2026-10-21T00:05");
});

test("earliest entry time is 14 days back, rounded up to a full minute so the database never refuses it", () => {
  // 14 x 24 h before 10:00:30 UTC is 10:00:30 UTC; rounded up to 10:01 UTC = 12:01 CEST.
  assert.equal(earliestEntryLocal(new Date("2026-10-20T10:00:30Z")), "2026-10-06T12:01");
  // Across the clock change: 14 x 24 h before 30.10 10:00 UTC (11:00 CET) is 16.10 10:00 UTC = 12:00 CEST.
  assert.equal(earliestEntryLocal(new Date("2026-10-30T10:00:00Z")), "2026-10-16T12:00");
});

test("correcting an entry dated 26.09.2026 08:00 on 10.10.2026 09:00 keeps the saved time as the field's lower bound", () => {
  // Saved on 09.10.2026 (the limit was then 25.09.2026), corrected the next day inside its 24-hour window: the 14-day
  // limit (26.09.2026 09:00) is now later than the saved time, so the unchanged form must stay sendable.
  assert.equal(minOccurredLocal("2026-09-26T08:00", new Date("2026-10-10T07:00:00Z")), "2026-09-26T08:00");
});

test("correcting a fresh entry keeps the 14-day limit as the field's lower bound", () => {
  // 09.10.2026 12:00 CEST: the limit is 25.09.2026 12:00, earlier than the saved time.
  assert.equal(minOccurredLocal("2026-10-09T11:30", new Date("2026-10-09T10:00:00Z")), "2026-09-25T12:00");
});

test("times are shown as DD.MM.YYYY, HH:MM in Polish time", () => {
  assert.equal(formatWarsawDateTime("2026-10-20T19:14:00Z"), "20.10.2026, 21:14");
  assert.equal(formatWarsawDateTime("2026-10-30T20:14:00Z"), "30.10.2026, 21:14");
  assert.equal(formatLocalDateTime("2026-10-06T12:01"), "06.10.2026, 12:01");
});

test("the 14-day limit matches SE003 in the journal migration", async () => {
  const migration = await readFile(
    new URL("../../supabase/migrations/20261005130000_symptom_journal.sql", import.meta.url),
    "utf8",
  );
  assert.match(migration, new RegExp(`c_max_days_back constant interval := interval '${JOURNAL_MAX_DAYS_BACK} days'`));
});
