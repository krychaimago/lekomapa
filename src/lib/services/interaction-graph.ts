// Interaction graph under the medication list (S-10, FR-014): the whole geometry of the graph as plain numbers, ids
// and texts — no markup, no colours, no Supabase. No `@/` imports and no reportError, so
// scripts/medications/interaction-graph.test.mjs loads this file directly under `node --experimental-strip-types`.
//
// Three layouts are computed for every render and the component shows one by the width of the graph card's content,
// measured in rem so that a larger text size counts as less room:
//   - column (below 18.375 rem, 294 px at the default text size): one medication per row, alphabetically, pairs drawn
//     as arcs on the left; units are 1/16 rem, so the arcs meet the points at every text size (issue 126);
//   - phone (layout "C", 360 units wide, from 18.375 rem to 30 rem): 3 columns of 108 units, rows 100 units apart;
//   - wide (layout "10", 576 units wide, from 30 rem — 480 px at the default text size): 4 columns of 135 units, rows
//     105 units apart.
// Phone and wide were approved on mockups (context/archive/2026-10-17-interaction-graph/), the column on
// context/changes/graph-narrow-column/prototype/graf-luzny-uklad.html (version 8); each reproduces its geometry.
//
// Fields. Every render replays the account's history: a medication arriving (`createdAt`) takes the lowest free field
// number; a medication ending (`discontinuedAt`, the moment the end was saved, never the backdatable
// `discontinued_on`) frees it. A field number maps to a cell of a block of 12 cells (3 × 4 on the phone, 4 × 3 wide),
// scattered by a stride, so consecutive arrivals land far apart. Columns start at different heights and every cell is
// moved up or down by its own amount, so the points never form level rows.
//
// Places. A medication's point is computed once, at its arrival, against the medications standing on the map at that
// moment: the anchor of its field plus a scatter from a hash of its id. If its button would overlap a button already
// standing, 24 more attempts shrink the scatter; then the nearest free spot in growing rings around the field's
// anchor. A later arrival never moves it (it avoids those already standing, not the other way round) and a departure
// leaves a hole without moving anyone.
//
// FR-012 in the layout: a place comes only from the history and the ids. Interactions draw lines between points and
// fill `partners`; they never move a point, never change its size and never change the order of nodes. The name does
// not move a point either: the component fits the text with CSS.
//
// The column takes no history: a row is the medication's place in the alphabetical order of nodes, so adding one
// moves the rows below it down, and interactions still move nothing.
//
// Lines: a quadratic curve whose bend grows with its length, the side and the first bend taken from a hash of the
// pair of ids; if it passes too close to another medication's point, stronger and gentler bends on both sides are
// tried, else the clearest one is drawn.

import type {
  InteractionGraphEdge,
  InteractionGraphInput,
  InteractionGraphLayout,
  InteractionGraphLine,
  InteractionGraphModel,
  InteractionGraphNode,
  InteractionGraphPartner,
  InteractionGraphPoint,
} from "../../types.ts";

/** Width of the phone coordinate system (`viewBox`). */
export const GRAPH_PHONE_WIDTH = 360;
/** Width of the wide coordinate system (`viewBox`), used when the graph card's content is at least 30 rem wide. */
export const GRAPH_WIDE_WIDTH = 576;
/** Height of one column row, in 1/16 rem: room for a two-line name at 14 px (3 rem). */
export const GRAPH_COLUMN_ROW = 48;
/** Width of the column's strip for points and arcs, in 1/16 rem (3.5 rem). */
export const GRAPH_COLUMN_GUTTER = 56;
// Column points stand this far from the strip's right edge: the radius of the selected point's glow (15).
const COLUMN_POINT_INSET = 15;
// A column arc bends left by 10 units plus 0.18 of the distance between its rows, keeping 8 units from the left edge.
const COLUMN_ARC_BASE = 10;
const COLUMN_ARC_GROWTH = 0.18;
const COLUMN_ARC_MARGIN = 8;

// A medication button, in units: 90 wide and, with a two-line name, 72 px tall — about 88 units at 0.82 px per unit
// (a 360 px phone, and the wide layout from 30 rem of card content on — 480 px at the default text size). The button
// starts 10 px above the point.
export const GRAPH_BUTTON_WIDTH = 90;
export const GRAPH_BUTTON_HEIGHT = 88;
export const GRAPH_BUTTON_TOP = 10 / 0.82;
/** Buttons keep this vertical gap; side by side they may touch. */
export const GRAPH_BUTTON_GAP = 4;
// Points stay this far from the side edges (plus half a button) and below this line at the top.
const EDGE_MARGIN = 4;
const MIN_Y = 26;
// Room under the lowest button.
const BOTTOM_MARGIN = 12;
const ATTEMPTS = 24;
const RING_STEP = 6;
const RING_ANGLE_STEP = 15;

// Bends of a line as a fraction of its length, tried in order after the pair's own (0.18–0.24).
const BEND_FIRST = 0.18;
const BEND_SPREAD = 0.06;
const BEND_FALLBACKS = [0.3, 0.12, 0.42, 0.06, 0.55];
// A line is clear when it stays this far from every other point (radius 9 plus 8).
const LINE_CLEARANCE = 17;
const LINE_SAMPLES = 40;

interface Field {
  cell: number;
  column: number;
  row: number;
}

// Field number → cell of a block of `columns × rows` cells, scattered by `stride`; block b fills rows below block b−1.
function cellOf(field: number, columns: number, rows: number, stride: number): Field {
  const block = columns * rows;
  const cell = (field * stride) % block;
  return {
    cell,
    column: cell % columns,
    row: rows * Math.floor(field / block) + Math.floor(cell / columns),
  };
}

// Each cell's own vertical shift, −0.5…0.5, before scaling.
const cellLift = (cell: number) => ((cell * 5 + 3) % 7) / 6 - 0.5;

/** How one layout places a point: its width and the candidate for attempt `attempt` (scatter scaled by `scale`). */
interface LayoutRule {
  width: number;
  /** Centre of the field, around which the rings search when every attempt collides. */
  anchor: (field: number) => { x: number; y: number };
  /** Attempt `i` of placing `id` in `field`; `scale` = 1 − i / 24. */
  candidate: (field: number, id: string, attempt: number, scale: number) => { x: number; y: number };
}

// Phone, layout "C": 3 columns of 108 units, margin 18, rows 100 apart; cells of a 3 × 4 block by stride 7; columns
// start 0, 0.45 and 0.2 of a row lower; each cell moves by half a row × its own lift; odd rows shift 0.28 of a column
// right, even rows 0.12 left (the shift shrinks with the scatter); scatter ±32 % of a column sideways, ±35 % of a row.
const PHONE_COLUMN = 108;
const PHONE_ROW = 100;
const PHONE_OFFSETS = [0, 0.45, 0.2];
const PHONE_CELL_SHIFT = 0.5;
const PHONE_JITTER_X = 0.32 * PHONE_COLUMN;
const PHONE_JITTER_Y = 0.35 * PHONE_ROW;

function phoneField(field: number) {
  const { cell, column, row } = cellOf(field, 3, 4, 7);
  const lift = PHONE_ROW * (PHONE_OFFSETS[column] + PHONE_CELL_SHIFT * cellLift(cell));
  return {
    x: 18 + PHONE_COLUMN * (column + 0.5),
    y: MIN_Y + lift + PHONE_ROW * row + PHONE_ROW * 0.3,
    shift: row % 2 ? PHONE_COLUMN * 0.28 : -PHONE_COLUMN * 0.12,
  };
}

const PHONE_RULE: LayoutRule = {
  width: GRAPH_PHONE_WIDTH,
  anchor: (field) => {
    const { x, y } = phoneField(field);
    return { x, y };
  },
  candidate: (field, id, attempt, scale) => {
    const { x, y, shift } = phoneField(field);
    return {
      x: x + shift * scale + (seededHash(id, 2 + 2 * attempt) - 0.5) * 2 * PHONE_JITTER_X * scale,
      y: y + (seededHash(id, 3 + 2 * attempt) - 0.5) * 2 * PHONE_JITTER_Y * scale,
    };
  },
};

// Wide, layout "10": 4 columns of 135 units, margin 18, rows 105 apart from y 56; cells of a 4 × 3 block by stride 5;
// columns start 0, 0.4, 0.15 and 0.55 of a row lower; each cell moves by 0.4 of a row × its own lift; no row shift;
// scatter ±42 % of a column sideways, ±40 units vertically.
const WIDE_COLUMN = 135;
const WIDE_ROW = 105;
const WIDE_OFFSETS = [0, 0.4, 0.15, 0.55];
const WIDE_CELL_SHIFT = 0.4;
const WIDE_JITTER_X = 0.42 * WIDE_COLUMN;
const WIDE_JITTER_Y = 40;

function wideAnchor(field: number) {
  const { cell, column, row } = cellOf(field, 4, 3, 5);
  const offset = WIDE_OFFSETS[column] + WIDE_CELL_SHIFT * cellLift(cell);
  return { x: 18 + WIDE_COLUMN * (column + 0.5), y: 56 + WIDE_ROW * (row + offset) };
}

const WIDE_RULE: LayoutRule = {
  width: GRAPH_WIDE_WIDTH,
  anchor: wideAnchor,
  candidate: (field, id, attempt, scale) => {
    const { x, y } = wideAnchor(field);
    return {
      x: x + (seededHash(id, 2 + 2 * attempt) - 0.5) * 2 * WIDE_JITTER_X * scale,
      y: y + (seededHash(id, 3 + 2 * attempt) - 0.5) * 2 * WIDE_JITTER_Y * scale,
    };
  },
};

// One collator for every comparison: creating it per call would be Intl work inside the sort loop.
const collator = new Intl.Collator("pl");
const byId = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

// FNV-1a with a salt and a final mix: a stable number in 0–1 from a string, the same on every run and machine.
// Different salts give independent numbers from the same id.
function seededHash(text: string, salt: number): number {
  let value = 0x811c9dc5 ^ salt;
  for (let i = 0; i < text.length; i += 1) {
    value ^= text.charCodeAt(i);
    value = Math.imul(value, 0x01000193);
  }
  value ^= value >>> 13;
  value = Math.imul(value, 0x5bd1e995);
  value ^= value >>> 15;
  return (value >>> 0) / 4294967295;
}

const round = (value: number) => Math.round(value * 10) / 10;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

// The rectangle a button covers around its point; a vertical gap between two, touching side by side allowed.
function overlaps(p: { x: number; y: number }, q: { x: number; y: number }): boolean {
  const half = GRAPH_BUTTON_WIDTH / 2;
  const pTop = p.y - GRAPH_BUTTON_TOP;
  const qTop = q.y - GRAPH_BUTTON_TOP;
  return (
    p.x - half < q.x + half &&
    q.x - half < p.x + half &&
    pTop < qTop + GRAPH_BUTTON_HEIGHT + GRAPH_BUTTON_GAP &&
    qTop < pTop + GRAPH_BUTTON_HEIGHT + GRAPH_BUTTON_GAP
  );
}

// The points of one layout while the history is replayed: who stands on the map now, and where.
class Placement {
  readonly standing = new Map<string, { x: number; y: number }>();
  // A plain field, not a parameter property: `node --experimental-strip-types` only strips erasable syntax.
  private readonly rule: LayoutRule;

  constructor(rule: LayoutRule) {
    this.rule = rule;
  }

  // Coordinates are rounded to 0.1 before the collision check, so the stored point is the one that was checked.
  private fit(point: { x: number; y: number }) {
    const half = GRAPH_BUTTON_WIDTH / 2 + EDGE_MARGIN;
    return { x: round(clamp(point.x, half, this.rule.width - half)), y: round(Math.max(MIN_Y, point.y)) };
  }

  private free(point: { x: number; y: number }) {
    for (const other of this.standing.values()) if (overlaps(point, other)) return false;
    return true;
  }

  arrive(id: string, field: number) {
    for (let attempt = 0; attempt < ATTEMPTS; attempt += 1) {
      const point = this.fit(this.rule.candidate(field, id, attempt, 1 - attempt / ATTEMPTS));
      if (this.free(point)) {
        this.standing.set(id, point);
        return;
      }
    }
    // Nearest free spot to the field's anchor, in growing rings. The map grows downwards without limit, so a ring
    // always finds one.
    const anchor = this.rule.anchor(field);
    for (let radius = RING_STEP; ; radius += RING_STEP) {
      for (let angle = 0; angle < 360; angle += RING_ANGLE_STEP) {
        const point = this.fit({
          x: anchor.x + radius * Math.cos((angle * Math.PI) / 180),
          y: anchor.y + radius * Math.sin((angle * Math.PI) / 180),
        });
        if (this.free(point)) {
          this.standing.set(id, point);
          return;
        }
      }
    }
  }

  leave(id: string) {
    this.standing.delete(id);
  }
}

interface GraphEvent {
  time: number;
  arrival: boolean;
  id: string;
}

/** Field numbers of the medications still on the map, and their points in both layouts. */
export interface ReplayedHistory {
  fields: Map<string, number>;
  phone: Map<string, { x: number; y: number }>;
  wide: Map<string, { x: number; y: number }>;
}

// Replays the history: an arrival takes the lowest free field and its points in both layouts, against those standing
// then; a departure frees the field and removes the points. Only medications that are not current leave: the current
// list is the source of truth for who is on the graph, so a saved end that the list does not count (none exist today,
// future end dates are refused) never frees a field a point still stands on. Exported for the unit tests of fields.
export function replayHistory(input: InteractionGraphInput): ReplayedHistory {
  const currentIds = new Set(input.current.map((medication) => medication.id));
  const events: GraphEvent[] = [];
  const known = new Set<string>();
  for (const item of input.history) {
    known.add(item.id);
    events.push({ time: Date.parse(item.createdAt), arrival: true, id: item.id });
    if (item.discontinuedAt !== null && !currentIds.has(item.id)) {
      events.push({ time: Date.parse(item.discontinuedAt), arrival: false, id: item.id });
    }
  }
  // At the same moment a departure goes first, so the arriving medication can take the field just freed; arrivals at
  // the same moment go by id. A medication's own arrival always precedes its own departure.
  events.sort((a, b) => {
    if (a.time !== b.time) return a.time - b.time;
    if (a.id === b.id) return a.arrival ? -1 : 1;
    if (a.arrival !== b.arrival) return a.arrival ? 1 : -1;
    return byId(a.id, b.id);
  });

  const occupied: boolean[] = [];
  const fields = new Map<string, number>();
  const phone = new Placement(PHONE_RULE);
  const wide = new Placement(WIDE_RULE);
  const arrive = (id: string) => {
    if (fields.has(id)) return;
    let field = occupied.indexOf(false);
    if (field === -1) field = occupied.length;
    occupied[field] = true;
    fields.set(id, field);
    phone.arrive(id, field);
    wide.arrive(id, field);
  };
  for (const event of events) {
    if (event.arrival) {
      arrive(event.id);
      continue;
    }
    const field = fields.get(event.id);
    if (field === undefined) continue;
    occupied[field] = false;
    fields.delete(event.id);
    phone.leave(event.id);
    wide.leave(event.id);
  }
  // A current medication missing from the history (it should not happen: both come from the same table) arrives
  // after everything else, by id, instead of being left off the graph.
  const missing = input.current
    .map((medication) => medication.id)
    .filter((id) => !known.has(id))
    .sort(byId);
  for (const id of missing) arrive(id);
  return { fields, phone: phone.standing, wide: wide.standing };
}

// A quadratic curve from `from` to `to`, bending sideways by a fraction of its length. The first bend and the
// preferred side come from the hash of the pair of ids; the first candidate keeping LINE_CLEARANCE from every other
// point wins, else the clearest.
function curve(
  from: InteractionGraphPoint,
  to: InteractionGraphPoint,
  others: InteractionGraphPoint[],
  width: number,
  height: number,
): string {
  const pair = `${from.id}|${to.id}`;
  const first = BEND_FIRST + seededHash(pair, 0) * BEND_SPREAD;
  const side = seededHash(pair, 1) < 0.5 ? 1 : -1;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy) || 1;
  let best: { path: string; clearance: number } | null = null;
  for (const fraction of [first, ...BEND_FALLBACKS]) {
    for (const sign of [side, -side]) {
      const bend = length * fraction * sign;
      const cx = clamp((from.x + to.x) / 2 - (dy / length) * bend, 0, width);
      const cy = clamp((from.y + to.y) / 2 + (dx / length) * bend, 0, height);
      let clearance = Infinity;
      for (let k = 1; k < LINE_SAMPLES; k += 1) {
        const u = k / LINE_SAMPLES;
        const x = (1 - u) ** 2 * from.x + 2 * (1 - u) * u * cx + u * u * to.x;
        const y = (1 - u) ** 2 * from.y + 2 * (1 - u) * u * cy + u * u * to.y;
        for (const other of others) clearance = Math.min(clearance, Math.hypot(x - other.x, y - other.y));
      }
      const path = `M ${String(from.x)} ${String(from.y)} Q ${String(round(cx))} ${String(round(cy))} ${String(to.x)} ${String(to.y)}`;
      if (clearance >= LINE_CLEARANCE) return path;
      if (!best || clearance > best.clearance) best = { path, clearance };
    }
  }
  return best?.path ?? "";
}

function buildLayout(
  width: number,
  nodes: InteractionGraphNode[],
  standing: Map<string, { x: number; y: number }>,
  edges: InteractionGraphEdge[],
): InteractionGraphLayout {
  const points: InteractionGraphPoint[] = nodes.map((node) => {
    const point = standing.get(node.id) ?? { x: width / 2, y: MIN_Y };
    return { id: node.id, x: point.x, y: point.y };
  });
  const pointById = new Map(points.map((point) => [point.id, point]));
  let bottom = 0;
  for (const point of points) bottom = Math.max(bottom, point.y - GRAPH_BUTTON_TOP + GRAPH_BUTTON_HEIGHT);
  const height = round(bottom + BOTTOM_MARGIN);
  const lines: InteractionGraphLine[] = [];
  for (const edge of edges) {
    const a = pointById.get(edge.a);
    const b = pointById.get(edge.b);
    if (!a || !b) continue;
    const others = points.filter((point) => point !== a && point !== b);
    lines.push({ a: edge.a, b: edge.b, path: curve(a, b, others, width, height) });
  }
  return { width, height, points, lines };
}

// One row per node in the order of `nodes`; an arc is a cubic curve leaving and entering its points horizontally, both
// control points at the same x on the left of the points, never past the strip's left edge.
function buildColumn(nodes: InteractionGraphNode[], edges: InteractionGraphEdge[]): InteractionGraphLayout {
  const x = GRAPH_COLUMN_GUTTER - COLUMN_POINT_INSET;
  const points: InteractionGraphPoint[] = nodes.map((node, row) => ({
    id: node.id,
    x,
    y: (row + 0.5) * GRAPH_COLUMN_ROW,
  }));
  const pointById = new Map(points.map((point) => [point.id, point]));
  const lines: InteractionGraphLine[] = [];
  for (const edge of edges) {
    const a = pointById.get(edge.a);
    const b = pointById.get(edge.b);
    if (!a || !b) continue;
    const out = Math.min(x - COLUMN_ARC_MARGIN, COLUMN_ARC_BASE + Math.abs(b.y - a.y) * COLUMN_ARC_GROWTH);
    const cx = String(round(x - out));
    const path = `M ${String(a.x)} ${String(a.y)} C ${cx} ${String(a.y)} ${cx} ${String(b.y)} ${String(b.x)} ${String(b.y)}`;
    lines.push({ a: edge.a, b: edge.b, path });
  }
  return { width: GRAPH_COLUMN_GUTTER, height: nodes.length * GRAPH_COLUMN_ROW, points, lines };
}

export function buildInteractionGraph(input: InteractionGraphInput): InteractionGraphModel | null {
  if (input.current.length < 2) return null;

  const replayed = replayHistory(input);

  const nodes: InteractionGraphNode[] = input.current
    .map((medication) => ({ id: medication.id, name: medication.name }))
    .sort((a, b) => collator.compare(a.name, b.name) || byId(a.id, b.id));
  const nodeById = new Map(nodes.map((node) => [node.id, node]));

  // medication_interactions() gives each pair in both directions and one row per matching rule: one line per
  // unordered pair of medications, with every distinct description.
  const descriptionsByPair = new Map<string, { a: string; b: string; descriptions: Set<string> }>();
  for (const row of input.interactions) {
    if (row.medication_id === row.other_medication_id) continue;
    if (!nodeById.has(row.medication_id) || !nodeById.has(row.other_medication_id)) continue;
    const [a, b] = [row.medication_id, row.other_medication_id].sort(byId);
    const key = `${a}|${b}`;
    let pair = descriptionsByPair.get(key);
    if (!pair) {
      pair = { a, b, descriptions: new Set() };
      descriptionsByPair.set(key, pair);
    }
    pair.descriptions.add(row.description);
  }

  const pairs = [...descriptionsByPair.values()].sort((p, q) => byId(p.a, q.a) || byId(p.b, q.b));
  const edges: InteractionGraphEdge[] = [];
  const partners: Record<string, InteractionGraphPartner[]> = {};
  for (const node of nodes) partners[node.id] = [];
  for (const pair of pairs) {
    const a = nodeById.get(pair.a);
    const b = nodeById.get(pair.b);
    if (!a || !b) continue;
    edges.push({ a: a.id, b: b.id });
    const descriptions = [...pair.descriptions].sort((x, y) => collator.compare(x, y));
    partners[a.id].push({ id: b.id, name: b.name, descriptions });
    partners[b.id].push({ id: a.id, name: a.name, descriptions: [...descriptions] });
  }
  for (const list of Object.values(partners)) {
    list.sort((p, q) => collator.compare(p.name, q.name) || byId(p.id, q.id));
  }

  return {
    nodes,
    edges,
    partners,
    phone: buildLayout(GRAPH_PHONE_WIDTH, nodes, replayed.phone, edges),
    wide: buildLayout(GRAPH_WIDE_WIDTH, nodes, replayed.wide, edges),
    column: buildColumn(nodes, edges),
  };
}
