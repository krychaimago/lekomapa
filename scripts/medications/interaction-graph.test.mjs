// The interaction graph (S-10, FR-014): what the layout model holds. Expected values are written by hand from the
// plan's rules and change.md ("Stan na 18.10.2026"), not computed with the module's formulas:
//   - fields: a medication arriving at `createdAt` takes the lowest free field number, one ending at `discontinuedAt`
//     frees it (read back through replayHistory, since a field is no longer visible in a point);
//   - places: a point is taken once, at arrival, and never moves afterwards — not when another medication is added,
//     not when one ends; interactions and names never move it (FR-012);
//   - buttons: 90 units wide and 88 tall, starting about 12.2 units above the point; two buttons overlap when their
//     points are less than 90 apart sideways and less than 88 + 4 (the vertical gap) apart vertically;
//   - two coordinate systems: phone 360 units wide, wide 576.
//
// Today is 18.10.2026.

import assert from "node:assert/strict";
import { test } from "node:test";

import { buildInteractionGraph, replayHistory } from "../../src/lib/services/interaction-graph.ts";

const TODAY = "2026-10-18";
const LAYOUTS = ["phone", "wide"];
// Half a button plus the 4-unit side margin: the lowest and highest x a point may take.
const SIDE = 49;
const BUTTON_TOP = 10 / 0.82;

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

// Field of every current medication, by name.
function fields({ history, current }) {
  const replayed = replayHistory({ history, current, interactions: [], today: TODAY });
  return Object.fromEntries(current.map((medication) => [medication.name, replayed.fields.get(medication.id)]));
}

// Point of every node in one layout, by id.
const points = (model, layout) => Object.fromEntries(model[layout].points.map((p) => [p.id, [p.x, p.y]]));

// `count` medications, one a minute from 01.09.2026 08:00; every `endEvery`-th one ends 90 minutes after it arrived.
function many(count, endEvery = 0) {
  return Array.from({ length: count }, (_, i) => {
    const n = i + 1;
    const ended = endEvery > 0 && n % endEvery === 0;
    return [
      n,
      `Lek ${String(n)}`,
      new Date(Date.UTC(2026, 8, 1, 8, i)).toISOString(),
      ended ? new Date(Date.UTC(2026, 8, 1, 8, i + 90)).toISOString() : undefined,
    ];
  });
}

function assertNoOverlap(model, layout) {
  const list = model[layout].points;
  for (let i = 0; i < list.length; i += 1) {
    for (let j = i + 1; j < list.length; j += 1) {
      const [a, b] = [list[i], list[j]];
      const apart = Math.abs(a.x - b.x) >= 90 || Math.abs(a.y - b.y) >= 92;
      assert.ok(
        apart,
        `${layout}: ${a.id} (${String(a.x)}, ${String(a.y)}) and ${b.id} (${String(b.x)}, ${String(b.y)})`,
      );
    }
  }
}

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

test("the phone layout is 360 units wide and the wide layout 576", () => {
  const model = build(account(many(12)));
  assert.equal(model.phone.width, 360);
  assert.equal(model.wide.width, 576);
});

test("more medications give a taller graph, in both layouts", () => {
  const small = build(account(many(6)));
  const large = build(account(many(24)));
  for (const layout of LAYOUTS) {
    assert.ok(large[layout].height > small[layout].height, layout);
  }
});

test("medications take fields in the order they were added, not by name or input order", () => {
  const rows = [
    [3, "Apap", "2026-10-03T08:00:00Z"],
    [1, "Zyrtec", "2026-10-01T08:00:00Z"],
    [2, "Ibuprom", "2026-10-02T08:00:00Z"],
  ];
  const expected = { Zyrtec: 0, Ibuprom: 1, Apap: 2 };
  assert.deepEqual(fields(account(rows)), expected);
  assert.deepEqual(fields(account([...rows].reverse())), expected);
});

test("nodes go alphabetically in Polish, and both layouts list their points in the same order", () => {
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
  for (const layout of LAYOUTS) {
    assert.deepEqual(
      model[layout].points.map((point) => point.id),
      model.nodes.map((node) => node.id),
      layout,
    );
  }
});

test("interactions do not move a point (FR-012): the same places and heights with and without them", () => {
  const medications = account(many(30));
  const without = build(medications);
  const pairs = [];
  for (let n = 2; n <= 30; n += 3) {
    pairs.push(interaction(1, n, `Opis ${String(n)}.`, `pair-${String(n)}`));
    pairs.push(interaction(n, 1, `Opis ${String(n)}.`, `pair-${String(n)}`));
    pairs.push(interaction(n, n + 1, `Opis ${String(n)}b.`, `pair-${String(n)}b`));
  }
  const withPairs = build(medications, pairs);
  for (const layout of LAYOUTS) {
    assert.deepEqual(points(withPairs, layout), points(without, layout), layout);
    assert.equal(withPairs[layout].height, without[layout].height, layout);
    assert.equal(without[layout].lines.length, 0);
    assert.ok(withPairs[layout].lines.length > 0);
  }
  assert.deepEqual(
    withPairs.nodes.map((node) => node.id),
    without.nodes.map((node) => node.id),
  );
});

test("names do not move a point: other names, a very long one included, give the same places", () => {
  const rows = many(20);
  const renamed = rows.map(([n, , createdAt, ended]) => [
    n,
    n === 7
      ? "Ibuprom Max Forte 400 mg tabletki powlekane o przedłużonym uwalnianiu, opakowanie 60 sztuk"
      : `Zupełnie inna nazwa ${String(100 - n)}`,
    createdAt,
    ended,
  ]);
  const a = build(account(rows));
  const b = build(account(renamed));
  for (const layout of LAYOUTS) assert.deepEqual(points(b, layout), points(a, layout), layout);
});

test("the same history always gives the same model, whatever the input order", () => {
  const medications = account(many(40, 4));
  const pairs = [interaction(1, 2, "Opis."), interaction(2, 1, "Opis."), interaction(5, 9, "Opis B.", "pair-2")];
  const first = build(medications, pairs);
  const again = build(medications, pairs);
  const shuffled = build(
    { history: [...medications.history].reverse(), current: [...medications.current].reverse() },
    [...pairs].reverse(),
  );
  assert.deepEqual(again, first);
  assert.deepEqual(shuffled, first);
});

test("adding a medication never moves one already on the map, in either layout", () => {
  const rows = many(60);
  let before = build(account(rows.slice(0, 2)));
  for (let count = 3; count <= rows.length; count += 1) {
    const after = build(account(rows.slice(0, count)));
    for (const layout of LAYOUTS) {
      const old = points(before, layout);
      const now = points(after, layout);
      for (const [nodeId, point] of Object.entries(old)) assert.deepEqual(now[nodeId], point, `${layout} ${nodeId}`);
    }
    before = after;
  }
});

test("with ends interleaved, neither an arrival nor a departure moves anyone, in either layout", () => {
  // Medication n arrives at minute n; every third one ends 90 minutes later. The history is cut at every moment
  // something happens, and every medication on the map at one cut stands in the same place at the next.
  const rows = many(60, 3);
  const times = new Set();
  for (const [, , createdAt, ended] of rows) {
    times.add(Date.parse(createdAt));
    if (ended) times.add(Date.parse(ended));
  }
  const cut = (time) =>
    rows
      .filter(([, , createdAt]) => Date.parse(createdAt) <= time)
      .map(([n, name, createdAt, ended]) => [
        n,
        name,
        createdAt,
        ended && Date.parse(ended) <= time ? ended : undefined,
      ]);

  let departures = 0;
  let before = null;
  for (const time of [...times].sort((a, b) => a - b)) {
    const model = build(account(cut(time)));
    if (model && before) {
      for (const layout of LAYOUTS) {
        const now = points(model, layout);
        for (const [nodeId, point] of Object.entries(points(before, layout))) {
          if (nodeId in now)
            assert.deepEqual(now[nodeId], point, `${layout} ${nodeId} at ${new Date(time).toISOString()}`);
          else if (layout === "phone") departures += 1;
        }
      }
    }
    before = model;
  }
  assert.ok(departures >= 15, `${String(departures)} departures checked`);
});

test("ending a medication frees its field, and the next one added takes it", () => {
  const ended = account([
    [1, "Apap", "2026-10-01T08:00:00Z"],
    [2, "Ibuprom", "2026-10-02T08:00:00Z", "2026-10-10T08:00:00Z"],
    [3, "Zyrtec", "2026-10-03T08:00:00Z"],
  ]);
  assert.deepEqual(fields(ended), { Apap: 0, Zyrtec: 2 });

  const added = account([
    [1, "Apap", "2026-10-01T08:00:00Z"],
    [2, "Ibuprom", "2026-10-02T08:00:00Z", "2026-10-10T08:00:00Z"],
    [3, "Zyrtec", "2026-10-03T08:00:00Z"],
    [4, "Aspiryna", "2026-10-12T08:00:00Z"],
    [5, "Lakcid", "2026-10-13T08:00:00Z"],
  ]);
  assert.deepEqual(fields(added), { Apap: 0, Zyrtec: 2, Aspiryna: 1, Lakcid: 3 });
  // Apap and Zyrtec did not move.
  for (const layout of LAYOUTS) {
    const before = points(build(ended), layout);
    const after = points(build(added), layout);
    assert.deepEqual(after[id(1)], before[id(1)], layout);
    assert.deepEqual(after[id(3)], before[id(3)], layout);
  }
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
  assert.deepEqual(fields(medications), { Apap: 0, Zyrtec: 2 });
});

test("at the same moment an end goes before an arrival, so the new medication takes the field just freed", () => {
  const medications = account([
    [1, "Apap", "2026-10-01T08:00:00Z"],
    [2, "Ibuprom", "2026-10-02T08:00:00Z", "2026-10-12T08:00:00Z"],
    [3, "Zyrtec", "2026-10-03T08:00:00Z"],
    [4, "Aspiryna", "2026-10-12T08:00:00Z"],
  ]);
  assert.deepEqual(fields(medications), { Apap: 0, Zyrtec: 2, Aspiryna: 1 });
});

test("two medications added at the same moment take fields by id", () => {
  const medications = account([
    [9, "Apap", "2026-10-01T08:00:00Z"],
    [7, "Zyrtec", "2026-10-01T08:00:00Z"],
    [8, "Ibuprom", "2026-10-01T08:00:00Z"],
  ]);
  assert.deepEqual(fields(medications), { Apap: 2, Zyrtec: 0, Ibuprom: 1 });
});

test("a current medication missing from the history is placed after the others instead of being dropped", () => {
  const medications = account([
    [1, "Apap", "2026-10-01T08:00:00Z"],
    [2, "Ibuprom", "2026-10-02T08:00:00Z"],
  ]);
  medications.current.push({ id: id(3), name: "Aspiryna" });
  assert.deepEqual(fields(medications), { Apap: 0, Ibuprom: 1, Aspiryna: 2 });
  const model = build(medications);
  for (const layout of LAYOUTS) assert.equal(model[layout].points.length, 3);
});

test("two medications never share a field, through many arrivals and ends", () => {
  const rows = [];
  for (let n = 1; n <= 20; n += 1) {
    const day = String(n).padStart(2, "0");
    // Every third medication ended two days after it was added.
    const ended = n % 3 === 0 ? `2026-09-${String(n + 2).padStart(2, "0")}T12:00:00Z` : undefined;
    rows.push([n, `Lek ${day}`, `2026-09-${day}T08:00:00Z`, ended]);
  }
  const taken = Object.values(fields(account(rows)));
  assert.equal(taken.length, 14);
  // Lek 03 takes field 2 and ends on 05.09.2026 at 12:00, after Lek 05 arrived; Lek 06 takes field 2 again, and so on
  // for every third medication. Lek 18 (field 2) ends on 20.09.2026 at 12:00, after Lek 20 took field 14, and nobody
  // is added after it: field 2 stays a hole, the 14 current medications stand in 0–1 and 3–14.
  assert.deepEqual(
    [...taken].sort((a, b) => a - b),
    [0, 1, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14],
  );
});

// 150 medications so the scatter, which comes from the ids, reaches close to its extremes and every attempt and ring
// of the collision search is exercised.
test("no two medication buttons overlap in either layout, for 150 medications", () => {
  const model = build(account(many(150)));
  assert.equal(model.nodes.length, 150);
  for (const layout of LAYOUTS) assertNoOverlap(model, layout);
});

test("no two medication buttons overlap in either layout when ends are interleaved with arrivals", () => {
  const model = build(account(many(225, 3)));
  assert.equal(model.nodes.length, 150);
  for (const layout of LAYOUTS) assertNoOverlap(model, layout);
});

test("every button fits the width and the height of its layout", () => {
  const model = build(account(many(150, 4)));
  for (const layout of LAYOUTS) {
    const { width, height } = model[layout];
    for (const point of model[layout].points) {
      assert.ok(point.x >= SIDE && point.x <= width - SIDE, `${layout} ${point.id}: x ${String(point.x)}`);
      assert.ok(point.y >= 26, `${layout} ${point.id}: y ${String(point.y)}`);
      assert.ok(
        point.y - BUTTON_TOP + 88 <= height,
        `${layout} ${point.id}: y ${String(point.y)} of ${String(height)}`,
      );
    }
  }
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
  for (const layout of LAYOUTS) assert.equal(model[layout].lines.length, 1);
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
  assert.deepEqual(model.edges, [{ a: id(1), b: id(2) }]);
  for (const layout of LAYOUTS) {
    const [line] = model[layout].lines;
    assert.equal(line.a, id(1));
    assert.equal(line.b, id(2));
    assert.match(line.path, /^M -?[\d.]+ -?[\d.]+ Q -?[\d.]+ -?[\d.]+ -?[\d.]+ -?[\d.]+$/);
  }
});

test("every curve starts at the point of one medication of its pair and ends at the other's, in both layouts", () => {
  const pairs = [];
  for (let n = 1; n <= 40; n += 1) {
    const other = ((n * 7) % 40) + 1;
    if (other === n) continue;
    pairs.push(interaction(n, other, `Opis ${String(n)}.`, `pair-${String(n)}`));
  }
  const model = build(account(many(40)), pairs);
  assert.ok(model.edges.length > 20);
  for (const layout of LAYOUTS) {
    assert.equal(model[layout].lines.length, model.edges.length);
    const at = new Map(model[layout].points.map((point) => [point.id, point]));
    for (const line of model[layout].lines) {
      const numbers = line.path
        .split(" ")
        .filter((part) => part !== "M" && part !== "Q")
        .map(Number);
      const [a, b] = [at.get(line.a), at.get(line.b)];
      assert.deepEqual([numbers[0], numbers[1]], [a.x, a.y], `${layout} ${line.path}`);
      assert.deepEqual([numbers[4], numbers[5]], [b.x, b.y], `${layout} ${line.path}`);
    }
  }
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
  for (const layout of LAYOUTS) {
    assert.deepEqual(model[layout].lines, []);
    assert.equal(model[layout].points.length, 3);
  }
  assert.equal(model.partners[id(2)], undefined);
  assert.deepEqual(model.partners[id(1)], []);
});

// The column (#126): one medication per row, alphabetically. Units are 1/16 rem: a row is 48 (3 rem), the gutter for
// the arcs 80 (5 rem). Row i has its point at y = 48 × i + 24, every point at the same x.
const columnPath = (path) => {
  const match = /^M (-?[\d.]+) (-?[\d.]+) C (-?[\d.]+) (-?[\d.]+) (-?[\d.]+) (-?[\d.]+) (-?[\d.]+) (-?[\d.]+)$/.exec(
    path,
  );
  assert.ok(match, path);
  return match.slice(1).map(Number);
};

test("the column is 80 units wide and 48 units tall per current medication", () => {
  const model = build(account(many(12, 4)));
  assert.equal(model.column.width, 80);
  // 12 medications, every fourth ended: 9 current.
  assert.equal(model.column.height, 9 * 48);
});

test("column points go alphabetically in Polish, one per row, all at the same x", () => {
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
    model.column.points.map((point) => point.id),
    [id(4), id(5), id(3), id(2), id(1)],
  );
  assert.deepEqual(
    model.column.points.map((point) => point.y),
    [24, 72, 120, 168, 216],
  );
  const [first] = model.column.points;
  assert.ok(first.x > 0 && first.x < 80, String(first.x));
  for (const point of model.column.points) assert.equal(point.x, first.x);
});

test("interactions do not move a column point or change the column's height (FR-012)", () => {
  const rows = many(10);
  const plain = build(account(rows));
  const linked = build(account(rows), [
    interaction(1, 9, "Opis.", "pair-1"),
    interaction(9, 1, "Opis.", "pair-1"),
    interaction(3, 4, "Opis.", "pair-2"),
    interaction(4, 3, "Opis.", "pair-2"),
  ]);
  assert.deepEqual(linked.column.points, plain.column.points);
  assert.equal(linked.column.height, plain.column.height);
});

test("the history does not change the column: only the current medications and their names count", () => {
  const added = build(
    account([
      [1, "Zyrtec", "2026-10-01T08:00:00Z"],
      [2, "Apap", "2026-10-02T08:00:00Z"],
      [3, "Lakcid", "2026-10-03T08:00:00Z"],
    ]),
  );
  // Same three current medications, added in a different order, with two ended ones in between.
  const reordered = build(
    account([
      [3, "Lakcid", "2026-09-01T08:00:00Z"],
      [7, "Ibuprom", "2026-09-02T08:00:00Z", "2026-09-20T08:00:00Z"],
      [1, "Zyrtec", "2026-09-03T08:00:00Z"],
      [8, "Acenokumarol", "2026-09-04T08:00:00Z", "2026-09-21T08:00:00Z"],
      [2, "Apap", "2026-09-05T08:00:00Z"],
    ]),
  );
  assert.deepEqual(reordered.column, added.column);
});

test("every column arc runs from one point of its pair to the other, bending left within the gutter", () => {
  const pairs = [];
  for (let n = 1; n <= 20; n += 1) {
    const other = ((n * 7) % 20) + 1;
    if (other === n) continue;
    pairs.push(interaction(n, other, `Opis ${String(n)}.`, `pair-${String(n)}`));
  }
  const model = build(account(many(20)), pairs);
  assert.equal(model.column.lines.length, model.edges.length);
  const at = new Map(model.column.points.map((point) => [point.id, point]));
  for (const line of model.column.lines) {
    const [x0, y0, c1x, c1y, c2x, c2y, x1, y1] = columnPath(line.path);
    const [a, b] = [at.get(line.a), at.get(line.b)];
    assert.deepEqual([x0, y0], [a.x, a.y], line.path);
    assert.deepEqual([x1, y1], [b.x, b.y], line.path);
    assert.equal(c1x, c2x, line.path);
    assert.equal(c1y, a.y, line.path);
    assert.equal(c2y, b.y, line.path);
    assert.ok(c1x >= 0 && c1x < a.x, line.path);
  }
});

test("a column arc bends further left the more rows it spans", () => {
  const model = build(
    account([
      [1, "Apap", "2026-10-01T08:00:00Z"],
      [2, "Ibuprom", "2026-10-02T08:00:00Z"],
      [3, "Zyrtec", "2026-10-03T08:00:00Z"],
    ]),
    [interaction(1, 2, "Opis 1.", "pair-1"), interaction(1, 3, "Opis 2.", "pair-2")],
  );
  const isPair = (line, ids) => ids.includes(line.a) && ids.includes(line.b);
  const arcX = (ids) => columnPath(model.column.lines.find((line) => isPair(line, ids)).path)[2];
  // Point at 80 − 15 = 65; the arc reaches 10 + 0.18 per unit between the rows to the left of it.
  // Adjacent rows (48 apart): 65 − (10 + 48 × 0.18) = 46.4; two rows (96 apart): 65 − (10 + 96 × 0.18) = 37.7.
  assert.equal(arcX([id(1), id(2)]), 46.4);
  assert.equal(arcX([id(1), id(3)]), 37.7);
});

test("an ended medication has no row in the column and draws no arc", () => {
  const model = build(
    account([
      [1, "Ibuprom", "2026-10-01T08:00:00Z"],
      [2, "Acenokumarol", "2026-10-02T08:00:00Z", "2026-10-10T08:00:00Z"],
      [3, "Apap", "2026-10-03T08:00:00Z"],
    ]),
    [interaction(1, 2, "Opis."), interaction(2, 1, "Opis.")],
  );
  assert.deepEqual(
    model.column.points.map((point) => point.id),
    [id(3), id(1)],
  );
  assert.equal(model.column.height, 2 * 48);
  assert.deepEqual(model.column.lines, []);
});
