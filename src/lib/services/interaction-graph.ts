// Interaction graph under the medication list (S-10, FR-014): the whole geometry of the graph as plain numbers, ids
// and texts — no markup, no colours, no Supabase. No `@/` imports and no reportError, so
// scripts/medications/interaction-graph.test.mjs loads this file directly under `node --experimental-strip-types`.
//
// FR-012 in the layout: a medication's place comes only from the order medications were added and from a hash of its
// id. Interactions draw lines between points and fill `partners`; they never move a point, never change its size and
// never change the order of nodes. The name does not move a point either: the component fits the text with CSS.
//
// A stable map without storing places: every render replays the account's history. A medication arriving
// (`createdAt`) takes the lowest free field of a 3-column grid; a medication ending (`discontinuedAt`, the moment the
// end was saved, never the backdatable `discontinued_on`) frees its field. The hole stays until the next medication is
// added. The grid always has 3 columns in a 360-unit-wide system, so the picture is the same on every screen.

import type {
  InteractionGraphEdge,
  InteractionGraphInput,
  InteractionGraphModel,
  InteractionGraphNode,
  InteractionGraphPartner,
} from "../../types.ts";

/** Width of the coordinate system (`viewBox`), whatever the screen. */
export const GRAPH_WIDTH = 360;
export const GRAPH_COLUMNS = 3;
/** Width of one medication's field; the field (`x` ± half of it) always fits inside GRAPH_WIDTH. */
export const GRAPH_COLUMN_WIDTH = 108;
export const GRAPH_ROW_HEIGHT = 90;

// Room left by the three columns (360 − 3 × 108 = 36), split into the row shift and the scatter within the field:
// even rows move left by ROW_SHIFT, odd rows right, and each point by up to ±JITTER_X more, so x ± 54 stays in 0–360.
const ROW_SHIFT = 9;
const JITTER_X = 9;
const JITTER_Y = 12;
const MARGIN_X = (GRAPH_WIDTH - GRAPH_COLUMNS * GRAPH_COLUMN_WIDTH) / 2;
// Bend of a line, in units, sideways from the straight segment between two points.
const BEND_MIN = 12;
const BEND_SPREAD = 13;

// One collator for every comparison: creating it per call would be Intl work inside the sort loop.
const collator = new Intl.Collator("pl");
const byId = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

// FNV-1a, 32 bits: a stable hash of a string, the same on every run and machine.
function hash(text: string): number {
  let value = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    value ^= text.charCodeAt(i);
    value = Math.imul(value, 0x01000193);
  }
  return value >>> 0;
}

const round = (value: number) => Math.round(value * 10) / 10;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

interface GraphEvent {
  time: number;
  arrival: boolean;
  id: string;
}

// Replays the history and returns the field of every medication still holding one. Only medications that are not
// current leave: the current list is the source of truth for who is on the graph, so a saved end that the list does
// not count (none exist today, future end dates are refused) never frees a field a point still stands on.
function assignFields(input: InteractionGraphInput, currentIds: ReadonlySet<string>): Map<string, number> {
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
  const fieldOf = new Map<string, number>();
  const arrive = (id: string) => {
    if (fieldOf.has(id)) return;
    let field = occupied.indexOf(false);
    if (field === -1) field = occupied.length;
    occupied[field] = true;
    fieldOf.set(id, field);
  };
  for (const event of events) {
    if (event.arrival) {
      arrive(event.id);
      continue;
    }
    const field = fieldOf.get(event.id);
    if (field === undefined) continue;
    occupied[field] = false;
    fieldOf.delete(event.id);
  }
  // A current medication missing from the history (it should not happen: both come from the same table) arrives
  // after everything else, by id, instead of being left off the graph.
  const missing = input.current
    .map((medication) => medication.id)
    .filter((id) => !known.has(id))
    .sort(byId);
  for (const id of missing) arrive(id);
  return fieldOf;
}

function placeNode(id: string, name: string, field: number): InteractionGraphNode {
  const row = Math.floor(field / GRAPH_COLUMNS);
  const column = field % GRAPH_COLUMNS;
  const h = hash(id);
  const jitterX = (h % (2 * JITTER_X + 1)) - JITTER_X;
  const jitterY = ((h >>> 8) % (2 * JITTER_Y + 1)) - JITTER_Y;
  const shift = row % 2 === 0 ? -ROW_SHIFT : ROW_SHIFT;
  return {
    id,
    name,
    x: MARGIN_X + GRAPH_COLUMN_WIDTH * column + GRAPH_COLUMN_WIDTH / 2 + shift + jitterX,
    y: GRAPH_ROW_HEIGHT * row + GRAPH_ROW_HEIGHT / 2 + jitterY,
  };
}

// A quadratic curve bending sideways by an amount and direction taken from the hash of the pair of ids.
function curve(from: InteractionGraphNode, to: InteractionGraphNode, height: number): string {
  const h = hash(`${from.id}|${to.id}`);
  const bend = (BEND_MIN + (h % BEND_SPREAD)) * ((h >>> 4) % 2 === 0 ? 1 : -1);
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy) || 1;
  const cx = clamp((from.x + to.x) / 2 + (-dy / length) * bend, 0, GRAPH_WIDTH);
  const cy = clamp((from.y + to.y) / 2 + (dx / length) * bend, 0, height);
  return `M ${round(from.x)} ${round(from.y)} Q ${round(cx)} ${round(cy)} ${round(to.x)} ${round(to.y)}`;
}

export function buildInteractionGraph(input: InteractionGraphInput): InteractionGraphModel | null {
  if (input.current.length < 2) return null;

  const currentIds = new Set(input.current.map((medication) => medication.id));
  const fieldOf = assignFields(input, currentIds);

  const nodes = input.current
    .map((medication) => placeNode(medication.id, medication.name, fieldOf.get(medication.id) ?? 0))
    .sort((a, b) => collator.compare(a.name, b.name) || byId(a.id, b.id));
  const nodeById = new Map(nodes.map((node) => [node.id, node]));

  let lastRow = 0;
  for (const node of nodes) lastRow = Math.max(lastRow, Math.floor((fieldOf.get(node.id) ?? 0) / GRAPH_COLUMNS));
  const height = (lastRow + 1) * GRAPH_ROW_HEIGHT;

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
    edges.push({ a: a.id, b: b.id, path: curve(a, b, height) });
    const descriptions = [...pair.descriptions].sort((x, y) => collator.compare(x, y));
    partners[a.id].push({ id: b.id, name: b.name, descriptions });
    partners[b.id].push({ id: a.id, name: a.name, descriptions: [...descriptions] });
  }
  for (const list of Object.values(partners)) {
    list.sort((p, q) => collator.compare(p.name, q.name) || byId(p.id, q.id));
  }

  return { width: GRAPH_WIDTH, height, nodes, edges, partners };
}
