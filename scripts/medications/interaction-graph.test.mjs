// The interaction graph (S-10, FR-014): what the layout model holds. Expected values are written by hand from the
// plan's rules, not computed with the module: fields of a 3-column grid numbered row by row from 0 (top left), a
// medication arriving at `createdAt` takes the lowest free field, one ending at `discontinuedAt` frees it; rows 90
// units high; the system 360 units wide; one line per unordered pair; partners alphabetically. Interactions never
// move a point (FR-012).
//
// Today is 18.10.2026. The field of a node is read back from its point: columns sit in x 54–90, 162–198 and 270–306,
// row r in y 33–57 plus 90 × r, so field = 3 × floor(y / 90) + floor(x / 120).

import assert from "node:assert/strict";
import { test } from "node:test";

import { buildInteractionGraph } from "../../src/lib/services/interaction-graph.ts";

const TODAY = "2026-10-18";
const HALF_COLUMN = 54;

const fieldOf = (node) => 3 * Math.floor(node.y / 90) + Math.floor(node.x / 120);
const fields = (model) => Object.fromEntries(model.nodes.map((node) => [node.name, fieldOf(node)]));
const points = (model) => Object.fromEntries(model.nodes.map((node) => [node.id, [node.x, node.y]]));

// Ids like real ones (uuids), so the hash sees the same kind of text as in production.
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

// [n, name, createdAt, discontinuedAt?] → history row; a medication with discontinuedAt is ended, not current.
function account(rows) {
  return {
    history: rows.map(([n, , createdAt, discontinuedAt = null]) => ({ id: id(n), createdAt, discontinuedAt })),
    current: rows.filter(([, , , discontinuedAt]) => !discontinuedAt).map(([n, name]) => ({ id: id(n), name })),
  };
}

const interaction = (first, second, description, pair = "pair-1") => ({
  medication_id: id(first),
  other_medication_id: id(second),
  pair_id: pair,
  group_a: "M01A",
  group_b: "B01AA",
  description,
});

const build = ({ history, current }, interactions = []) =>
  buildInteractionGraph({ history, current, interactions, today: TODAY });

test("fewer than two current medications give no graph", () => {
  assert.equal(build(account([])), null);
  assert.equal(build(account([[1, "Apap", "2026-10-01T08:00:00Z"]])), null);
  // An ended medication does not count towards the two.
  assert.equal(
    build(
      account([
        [1, "Apap", "2026-10-01T08:00:00Z"],
        [2, "Ibuprom", "2026-10-02T08:00:00Z", "2026-10-05T08:00:00Z"],
      ]),
    ),
    null,
  );
});

test("medications take fields in the order they were added, not by name or input order", () => {
  const rows = [
    [3, "Apap", "2026-10-03T08:00:00Z"],
    [1, "Zyrtec", "2026-10-01T08:00:00Z"],
    [2, "Ibuprom", "2026-10-02T08:00:00Z"],
  ];
  const expected = { Zyrtec: 0, Ibuprom: 1, Apap: 2 };
  assert.deepEqual(fields(build(account(rows))), expected);
  assert.deepEqual(fields(build(account([...rows].reverse()))), expected);
});

test("nodes go alphabetically in Polish, whatever the order of adding", () => {
  const model = build(
    account([
      [1, "Zyrtec", "2026-10-01T08:00:00Z"],
      [2, "Łzawin", "2026-10-02T08:00:00Z"],
      [3, "Lakcid", "2026-10-03T08:00:00Z"],
      [4, "Apap", "2026-10-04T08:00:00Z"],
      [5, "Ćmin", "2026-10-05T08:00:00Z"],
    ]),
  );
  assert.deepEqual(
    model.nodes.map((node) => node.name),
    ["Apap", "Ćmin", "Lakcid", "Łzawin", "Zyrtec"],
  );
});

test("interactions do not move a point (FR-012): the same x and y with and without them", () => {
  const medications = account([
    [1, "Apap", "2026-10-01T08:00:00Z"],
    [2, "Ibuprom", "2026-10-02T08:00:00Z"],
    [3, "Acenokumarol", "2026-10-03T08:00:00Z"],
    [4, "Sertralina", "2026-10-04T08:00:00Z"],
  ]);
  const without = build(medications);
  const withPairs = build(medications, [
    interaction(2, 3, "Opis A."),
    interaction(3, 2, "Opis A."),
    interaction(2, 4, "Opis B.", "pair-2"),
    interaction(4, 2, "Opis B.", "pair-2"),
  ]);
  assert.deepEqual(points(withPairs), points(without));
  assert.deepEqual(
    withPairs.nodes.map((node) => node.id),
    without.nodes.map((node) => node.id),
  );
  assert.equal(withPairs.height, without.height);
  assert.equal(without.edges.length, 0);
  assert.equal(withPairs.edges.length, 2);
});

test("adding a medication leaves every other point where it was", () => {
  const before = account([
    [1, "Apap", "2026-10-01T08:00:00Z"],
    [2, "Ibuprom", "2026-10-02T08:00:00Z"],
    [3, "Zyrtec", "2026-10-03T08:00:00Z"],
  ]);
  const after = account([
    [1, "Apap", "2026-10-01T08:00:00Z"],
    [2, "Ibuprom", "2026-10-02T08:00:00Z"],
    [3, "Zyrtec", "2026-10-03T08:00:00Z"],
    [4, "Aspiryna", "2026-10-18T08:00:00Z"],
  ]);
  const oldPoints = points(build(before));
  const newPoints = points(build(after));
  for (const [nodeId, point] of Object.entries(oldPoints)) assert.deepEqual(newPoints[nodeId], point, nodeId);
  assert.equal(fields(build(after)).Aspiryna, 3);
});

test("ending a medication frees its field, and the next one added takes it", () => {
  const ended = account([
    [1, "Apap", "2026-10-01T08:00:00Z"],
    [2, "Ibuprom", "2026-10-02T08:00:00Z", "2026-10-10T08:00:00Z"],
    [3, "Zyrtec", "2026-10-03T08:00:00Z"],
  ]);
  const before = build(ended);
  assert.deepEqual(fields(before), { Apap: 0, Zyrtec: 2 });

  const added = account([
    [1, "Apap", "2026-10-01T08:00:00Z"],
    [2, "Ibuprom", "2026-10-02T08:00:00Z", "2026-10-10T08:00:00Z"],
    [3, "Zyrtec", "2026-10-03T08:00:00Z"],
    [4, "Aspiryna", "2026-10-12T08:00:00Z"],
    [5, "Lakcid", "2026-10-13T08:00:00Z"],
  ]);
  const after = build(added);
  assert.deepEqual(fields(after), { Apap: 0, Aspiryna: 1, Lakcid: 3, Zyrtec: 2 });
  // Apap and Zyrtec did not move.
  assert.deepEqual(points(after)[id(1)], points(before)[id(1)]);
  assert.deepEqual(points(after)[id(3)], points(before)[id(3)]);
});

test("a backdated end does not move a medication added between the end date and the moment it was saved", () => {
  // Ibuprom ended with discontinued_on 05.10.2026 (backdated), saved on 15.10.2026 (discontinued_at). Zyrtec was
  // added on 10.10.2026, between the two: Ibuprom still held field 1 then, so Zyrtec took field 2, and keeps it.
  const medications = account([
    [1, "Apap", "2026-10-01T08:00:00Z"],
    [2, "Ibuprom", "2026-10-02T08:00:00Z", "2026-10-15T08:00:00Z"],
    [3, "Zyrtec", "2026-10-10T08:00:00Z"],
  ]);
  medications.history[1].discontinuedOn = "2026-10-05";
  assert.deepEqual(fields(build(medications)), { Apap: 0, Zyrtec: 2 });
});

test("at the same moment an end goes before an arrival, so the new medication takes the field just freed", () => {
  const medications = account([
    [1, "Apap", "2026-10-01T08:00:00Z"],
    [2, "Ibuprom", "2026-10-02T08:00:00Z", "2026-10-12T08:00:00Z"],
    [3, "Zyrtec", "2026-10-03T08:00:00Z"],
    [4, "Aspiryna", "2026-10-12T08:00:00Z"],
  ]);
  assert.deepEqual(fields(build(medications)), { Apap: 0, Aspiryna: 1, Zyrtec: 2 });
});

test("two medications added at the same moment take fields by id", () => {
  const medications = account([
    [9, "Apap", "2026-10-01T08:00:00Z"],
    [7, "Zyrtec", "2026-10-01T08:00:00Z"],
    [8, "Ibuprom", "2026-10-01T08:00:00Z"],
  ]);
  assert.deepEqual(fields(build(medications)), { Zyrtec: 0, Ibuprom: 1, Apap: 2 });
});

test("a current medication missing from the history is placed after the others instead of being dropped", () => {
  const medications = account([
    [1, "Apap", "2026-10-01T08:00:00Z"],
    [2, "Ibuprom", "2026-10-02T08:00:00Z"],
  ]);
  medications.current.push({ id: id(3), name: "Aspiryna" });
  assert.deepEqual(fields(build(medications)), { Apap: 0, Aspiryna: 2, Ibuprom: 1 });
});

test("two medications never share a field, through many arrivals and ends", () => {
  const rows = [];
  for (let n = 1; n <= 20; n += 1) {
    const day = String(n).padStart(2, "0");
    // Every third medication ended two days after it was added.
    const ended = n % 3 === 0 ? `2026-09-${String(n + 2).padStart(2, "0")}T12:00:00Z` : undefined;
    rows.push([n, `Lek ${day}`, `2026-09-${day}T08:00:00Z`, ended]);
  }
  const model = build(account(rows));
  const taken = model.nodes.map(fieldOf);
  assert.equal(model.nodes.length, 14);
  assert.equal(new Set(taken).size, taken.length);
  // Lek 03 takes field 2 and ends on 05.09.2026 at 12:00, after Lek 05 arrived; Lek 06 takes field 2 again, and so on
  // for every third medication. Lek 18 (field 2) ends on 20.09.2026 at 12:00, after Lek 20 took field 14, and nobody
  // is added after it: field 2 stays a hole, the 14 current medications stand in 0–1 and 3–14.
  assert.deepEqual(
    [...taken].sort((a, b) => a - b),
    [0, 1, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14],
  );
});

test("13 medications take 5 rows, and the graph is taller than with 12", () => {
  const rows = (count) =>
    Array.from({ length: count }, (_, i) => [
      i + 1,
      `Lek ${i + 1}`,
      `2026-10-${String(i + 1).padStart(2, "0")}T08:00:00Z`,
    ]);
  const twelve = build(account(rows(12)));
  const thirteen = build(account(rows(13)));
  assert.equal(twelve.width, 360);
  assert.equal(twelve.height, 360);
  assert.equal(thirteen.height, 450);
  assert.equal(Math.max(...thirteen.nodes.map((node) => Math.floor(node.y / 90))), 4);
});

test("every field fits the width: x ± half a column stays in 0–360", () => {
  const rows = Array.from({ length: 30 }, (_, i) => [
    i + 1,
    `Lek ${i + 1}`,
    `2026-09-${String((i % 28) + 1).padStart(2, "0")}T0${i % 10}:00:00Z`,
  ]);
  const model = build(account(rows));
  assert.equal(model.nodes.length, 30);
  for (const node of model.nodes) {
    assert.ok(node.x - HALF_COLUMN >= 0, `${node.name}: x ${node.x}`);
    assert.ok(node.x + HALF_COLUMN <= model.width, `${node.name}: x ${node.x}`);
    assert.ok(node.y > 0 && node.y < model.height, `${node.name}: y ${node.y}`);
  }
});

test("a long name does not move a point", () => {
  const short = account([
    [1, "Apap", "2026-10-01T08:00:00Z"],
    [2, "Ibuprom", "2026-10-02T08:00:00Z"],
  ]);
  const long = account([
    [1, "Apap", "2026-10-01T08:00:00Z"],
    [
      2,
      "Ibuprom Max Forte 400 mg tabletki powlekane o przedłużonym uwalnianiu, opakowanie 60 sztuk",
      "2026-10-02T08:00:00Z",
    ],
  ]);
  assert.deepEqual(points(build(long)), points(build(short)));
});

test("a pair matching two rules gives one line with both descriptions", () => {
  const model = build(
    account([
      [1, "Ibuprom", "2026-10-01T08:00:00Z"],
      [2, "Acenokumarol", "2026-10-02T08:00:00Z"],
    ]),
    [
      interaction(1, 2, "Opis drugi.", "pair-2"),
      interaction(2, 1, "Opis drugi.", "pair-2"),
      interaction(1, 2, "Opis pierwszy.", "pair-1"),
      interaction(2, 1, "Opis pierwszy.", "pair-1"),
    ],
  );
  assert.equal(model.edges.length, 1);
  assert.deepEqual(model.partners[id(1)], [
    { id: id(2), name: "Acenokumarol", descriptions: ["Opis drugi.", "Opis pierwszy."] },
  ]);
  assert.deepEqual(model.partners[id(2)], [
    { id: id(1), name: "Ibuprom", descriptions: ["Opis drugi.", "Opis pierwszy."] },
  ]);
});

test("symmetric rows give one line, between the two ids in id order, drawn as a quadratic curve", () => {
  const model = build(
    account([
      [2, "Ibuprom", "2026-10-01T08:00:00Z"],
      [1, "Acenokumarol", "2026-10-02T08:00:00Z"],
    ]),
    [interaction(2, 1, "Opis."), interaction(1, 2, "Opis.")],
  );
  assert.equal(model.edges.length, 1);
  const [edge] = model.edges;
  assert.equal(edge.a, id(1));
  assert.equal(edge.b, id(2));
  assert.match(edge.path, /^M -?[\d.]+ -?[\d.]+ Q -?[\d.]+ -?[\d.]+ -?[\d.]+ -?[\d.]+$/);
  // The curve runs from point a to point b.
  const a = model.nodes.find((node) => node.id === id(1));
  const b = model.nodes.find((node) => node.id === id(2));
  assert.ok(edge.path.startsWith(`M ${a.x} ${a.y} Q `));
  assert.ok(edge.path.endsWith(` ${b.x} ${b.y}`));
});

test("partners are listed alphabetically in Polish, and a medication without a pair has none", () => {
  const model = build(
    account([
      [1, "Ibuprom", "2026-10-01T08:00:00Z"],
      [2, "Sertralina", "2026-10-02T08:00:00Z"],
      [3, "Łzawin", "2026-10-03T08:00:00Z"],
      [4, "Acenokumarol", "2026-10-04T08:00:00Z"],
      [5, "Lakcid", "2026-10-05T08:00:00Z"],
      [6, "Apap", "2026-10-06T08:00:00Z"],
    ]),
    [
      interaction(1, 2, "Opis S."),
      interaction(2, 1, "Opis S."),
      interaction(1, 3, "Opis Ł.", "pair-2"),
      interaction(3, 1, "Opis Ł.", "pair-2"),
      interaction(1, 4, "Opis A.", "pair-3"),
      interaction(4, 1, "Opis A.", "pair-3"),
      interaction(1, 5, "Opis L.", "pair-4"),
      interaction(5, 1, "Opis L.", "pair-4"),
    ],
  );
  assert.deepEqual(
    model.partners[id(1)].map((partner) => partner.name),
    ["Acenokumarol", "Lakcid", "Łzawin", "Sertralina"],
  );
  assert.deepEqual(model.partners[id(6)], []);
  assert.equal(model.edges.length, 4);
});

test("an ended medication is not a node, and its rows draw no line", () => {
  const model = build(
    account([
      [1, "Ibuprom", "2026-10-01T08:00:00Z"],
      [2, "Acenokumarol", "2026-10-02T08:00:00Z", "2026-10-10T08:00:00Z"],
      [3, "Apap", "2026-10-03T08:00:00Z"],
      [4, "Zyrtec", "2026-10-04T08:00:00Z"],
    ]),
    [interaction(1, 2, "Opis."), interaction(2, 1, "Opis.")],
  );
  assert.deepEqual(
    model.nodes.map((node) => node.name),
    ["Apap", "Ibuprom", "Zyrtec"],
  );
  assert.deepEqual(model.edges, []);
  assert.equal(model.partners[id(2)], undefined);
  assert.deepEqual(model.partners[id(1)], []);
});
