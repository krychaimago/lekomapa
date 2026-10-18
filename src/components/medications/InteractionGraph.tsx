import { useId, useState } from "react";
import { ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { INTERACTION_COPY } from "@/lib/copy/interactions";
import { GRAPH_COLUMN_GUTTER, GRAPH_COLUMN_ROW } from "@/lib/services/interaction-graph";
import { cn } from "@/lib/utils";
import type {
  InteractionGraphLayout,
  InteractionGraphModel,
  InteractionGraphNode,
  InteractionGraphPartner,
} from "@/types";

interface Props {
  model: InteractionGraphModel;
}

// Radius of a point and of the glow around the selected one, in viewBox units. The phone stage never grows past 24 rem
// (max-w-sm), so one unit is at most about 1.07 px there at the default text size; the wide stage starts at 30 rem
// (480 px at the default text size) for 576 units; in the column one unit is always 1/16 rem.
const POINT_RADIUS = 9;
const GLOW_RADIUS = 15;
// Width of a medication button in viewBox units, the width the layout keeps buttons apart by (GRAPH_BUTTON_WIDTH in
// src/lib/services/interaction-graph.ts).
const BUTTON_WIDTH = 90;

// Distance of a column button's left edge from the left of its point, in column units (1/16 rem): the button covers
// the point, as in the mockup (context/changes/graph-narrow-column/prototype/graf-luzny-uklad.html, version 8).
const COLUMN_BUTTON_REACH = 12;

const rem = (units: number) => `${String(units / 16)}rem`;

// One card under the graph, folded at the start: the partner's name toggles the descriptions, the note stays in view
// when folded.
function PartnerCard({ partner }: { partner: InteractionGraphPartner }) {
  const [open, setOpen] = useState(false);
  const bodyId = useId();
  return (
    <li className="border-interaction-border bg-interaction text-interaction-foreground flex flex-col gap-2 rounded-xl border p-3">
      <Button
        type="button"
        variant="ghost"
        aria-expanded={open}
        aria-controls={bodyId}
        className="hover:text-interaction-foreground h-auto min-h-11 w-full justify-start px-1 text-left font-semibold whitespace-normal hover:bg-transparent"
        onClick={() => {
          setOpen((current) => !current);
        }}
      >
        <ChevronRight
          aria-hidden="true"
          className={cn("shrink-0 transition-transform motion-reduce:transition-none", open && "rotate-90")}
        />
        <span>{INTERACTION_COPY.graphPartner.replace("{nazwa}", partner.name)}</span>
      </Button>
      <div id={bodyId} hidden={!open} className="flex flex-col gap-2 px-1">
        {partner.descriptions.map((description) => (
          <p key={description}>{description}</p>
        ))}
      </div>
      <p className="px-1 text-sm">{INTERACTION_COPY.note}</p>
    </li>
  );
}

interface DrawingProps {
  layout: InteractionGraphLayout;
  selectedId: string | null;
  partnerIds: ReadonlySet<string>;
}

// Lines and points of one layout, drawn inside its aria-hidden SVG. Shared by every layout, so the colours and states
// of the selection are the same in all three.
function GraphDrawing({ layout, selectedId, partnerIds }: DrawingProps) {
  // Lines grouped by state into a few paths, never one element per pair.
  const faint: string[] = [];
  const highlighted: string[] = [];
  for (const line of layout.lines) {
    if (selectedId !== null && (line.a === selectedId || line.b === selectedId)) highlighted.push(line.path);
    else faint.push(line.path);
  }

  return (
    <>
      {faint.length > 0 && (
        <path
          d={faint.join(" ")}
          fill="none"
          stroke="var(--input)"
          strokeWidth={1.5}
          strokeLinecap="round"
          opacity={selectedId !== null ? 0.5 : 1}
        />
      )}
      {highlighted.length > 0 && (
        <>
          <path
            d={highlighted.join(" ")}
            fill="none"
            stroke="var(--interaction-border)"
            strokeWidth={6}
            strokeLinecap="round"
          />
          <path
            d={highlighted.join(" ")}
            fill="none"
            stroke="var(--interaction-foreground)"
            strokeWidth={1.5}
            strokeLinecap="round"
          />
        </>
      )}
      {layout.points.map((point) => {
        const isSelected = point.id === selectedId;
        const isPartner = partnerIds.has(point.id);
        const dimmed = selectedId !== null && !isSelected && !isPartner;
        if (isSelected) {
          return (
            <g key={point.id}>
              <circle cx={point.x} cy={point.y} r={GLOW_RADIUS} fill="var(--accent)" />
              <circle cx={point.x} cy={point.y} r={POINT_RADIUS} fill="var(--primary)" />
            </g>
          );
        }
        return (
          <circle
            key={point.id}
            cx={point.x}
            cy={point.y}
            r={POINT_RADIUS}
            fill={isPartner ? "var(--interaction)" : "var(--card)"}
            stroke={isPartner ? "var(--interaction-foreground)" : "var(--input)"}
            strokeWidth={isPartner ? 2 : 1.5}
            opacity={dimmed ? 0.5 : 1}
          />
        );
      })}
    </>
  );
}

interface StageProps {
  layout: InteractionGraphLayout;
  nodes: InteractionGraphNode[];
  selectedId: string | null;
  partnerIds: ReadonlySet<string>;
  onToggle: (id: string) => void;
  /** Width limit of the stage: the phone layout never grows past 24 rem, the wide one fills the card. */
  className?: string;
}

// One layout of the graph: lines and points in an aria-hidden SVG, every medication a real button over its point.
function GraphStage({ layout, nodes, selectedId, partnerIds, onToggle, className }: StageProps) {
  const pointById = new Map(layout.points.map((point) => [point.id, point]));

  const percentX = (value: number) => `${String((value / layout.width) * 100)}%`;
  const percentY = (value: number) => `${String((value / layout.height) * 100)}%`;

  return (
    <div
      className={cn("relative mx-auto w-full", className)}
      style={{ aspectRatio: `${String(layout.width)} / ${String(layout.height)}` }}
    >
      <svg
        aria-hidden="true"
        viewBox={`0 0 ${String(layout.width)} ${String(layout.height)}`}
        className="absolute inset-0 size-full overflow-visible"
      >
        <GraphDrawing layout={layout} selectedId={selectedId} partnerIds={partnerIds} />
      </svg>

      <div role="group" aria-label={INTERACTION_COPY.graphLabel}>
        {nodes.map((node) => {
          const point = pointById.get(node.id);
          if (!point) return null;
          const isSelected = node.id === selectedId;
          const isPartner = partnerIds.has(node.id);
          const dimmed = selectedId !== null && !isSelected && !isPartner;
          return (
            <button
              key={node.id}
              type="button"
              data-graph-node={node.id}
              aria-pressed={isSelected}
              // The button starts at the top of the point and holds the name under it: the touch target covers
              // both and stays at least 44 px tall.
              className={cn(
                "absolute flex min-h-11 -translate-x-1/2 -translate-y-[10px] cursor-pointer flex-col items-center rounded-md px-0.5 pt-6 pb-0.5",
                "focus-visible:ring-ring outline-none focus-visible:ring-[3px]",
              )}
              style={{ left: percentX(point.x), top: percentY(point.y), width: percentX(BUTTON_WIDTH) }}
              onClick={() => {
                onToggle(node.id);
              }}
            >
              <span
                className={cn(
                  "line-clamp-2 w-full pb-px text-center text-xs leading-normal break-words",
                  isSelected && "font-semibold",
                  dimmed && "text-muted-foreground",
                )}
              >
                {node.name}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// The column layout: one row per medication in the order of `nodes`, the points and arcs in an aria-hidden SVG on the
// left, every row a real button over its point and holding the name. Sizes are in rem (one column unit = 1/16 rem), so
// the SVG and the rows grow together with the text and the arcs keep meeting the points.
function ColumnStage({ layout, nodes, selectedId, partnerIds, onToggle }: Omit<StageProps, "className">) {
  const pointById = new Map(layout.points.map((point) => [point.id, point]));
  // Every point of the column stands at the same x; the button starts a little left of it and its name starts at the
  // strip's right edge.
  const buttonLeft = Math.max(0, (layout.points[0]?.x ?? GRAPH_COLUMN_GUTTER) - COLUMN_BUTTON_REACH);

  return (
    <div className="relative w-full" style={{ height: rem(layout.height) }}>
      <svg
        aria-hidden="true"
        viewBox={`0 0 ${String(layout.width)} ${String(layout.height)}`}
        className="absolute top-0 left-0 overflow-visible"
        style={{ width: rem(GRAPH_COLUMN_GUTTER), height: rem(layout.height) }}
      >
        <GraphDrawing layout={layout} selectedId={selectedId} partnerIds={partnerIds} />
      </svg>

      <div
        role="group"
        aria-label={INTERACTION_COPY.graphLabel}
        className="relative flex flex-col"
        style={{ paddingLeft: rem(buttonLeft) }}
      >
        {nodes.map((node) => {
          if (!pointById.has(node.id)) return null;
          const isSelected = node.id === selectedId;
          const isPartner = partnerIds.has(node.id);
          const dimmed = selectedId !== null && !isSelected && !isPartner;
          return (
            <button
              key={node.id}
              type="button"
              data-graph-node={node.id}
              aria-pressed={isSelected}
              // A row 3 rem tall covering the point and the name: the touch target stays at least 44 px tall.
              className={cn(
                "flex w-full min-w-0 cursor-pointer items-center rounded-md pr-1 text-left",
                "focus-visible:ring-ring outline-none focus-visible:ring-[3px]",
              )}
              style={{ height: rem(GRAPH_COLUMN_ROW), paddingLeft: rem(GRAPH_COLUMN_GUTTER - buttonLeft) }}
              onClick={() => {
                onToggle(node.id);
              }}
            >
              <span
                className={cn(
                  "line-clamp-2 min-w-0 text-left text-sm break-words",
                  isSelected && "font-semibold",
                  dimmed && "text-muted-foreground",
                )}
              >
                {node.name}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// Interaction graph under the medication list (S-10, FR-014). The geometry comes ready from buildInteractionGraph in
// three layouts; this component draws all three and keeps which medication is selected, shared by them. A container
// query on the card's content, in rem so that a larger text size counts as less room, shows exactly one: the column
// below 18.375 rem (294 px at the default text size), the phone layout "C" from 18.375 rem to 30 rem, the wide layout
// "10" from 30 rem (480 px at the default text size). The other two are display:none, so they are out of the
// accessibility tree and the tab order, and the server's HTML already shows the right one without JS. `data-graph-scene` names
// each layout for tests/e2e/interaction-graph.spec.ts. Every medication is a real button in alphabetical order, so Tab walks the names and Enter or
// space selects. Points never move or change size with the selection or with interactions (FR-012): only colours
// change. Colours come only from tokens through var(--…), so the dark mode follows the token blocks.
export default function InteractionGraph({ model }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const titleId = useId();

  const selected = selectedId === null ? null : (model.nodes.find((node) => node.id === selectedId) ?? null);
  const partners = selected ? (model.partners[selected.id] ?? []) : [];
  const partnerIds = new Set(partners.map((partner) => partner.id));
  const onToggle = (id: string) => {
    setSelectedId((current) => (current === id ? null : id));
  };
  const stage = { nodes: model.nodes, selectedId: selected?.id ?? null, partnerIds, onToggle };
  // The only text announced on a selection: the name and the partner count, never the cards, so the note is not read
  // once per partner on every press. The cards stay outside the live region for the reader to walk through.
  const status =
    selected === null
      ? INTERACTION_COPY.graphNoSelection
      : partners.length === 0
        ? `${selected.name}: ${INTERACTION_COPY.noInteractionsForMedication}`
        : (partners.length === 1 ? INTERACTION_COPY.graphStatusOne : INTERACTION_COPY.graphStatusMany)
            .replace("{nazwa}", selected.name)
            .replace("{liczba}", String(partners.length));

  return (
    <div className="flex flex-col gap-4">
      <div className="border-border bg-card text-card-foreground @container rounded-xl border px-4 pt-4 pb-14 shadow-sm">
        <div data-graph-scene="column" className="@min-[18.375rem]:hidden">
          <ColumnStage layout={model.column} {...stage} />
        </div>
        <div data-graph-scene="phone" className="hidden @min-[18.375rem]:block @min-[30rem]:hidden">
          <GraphStage layout={model.phone} className="max-w-sm" {...stage} />
        </div>
        <div data-graph-scene="wide" className="hidden @min-[30rem]:block">
          <GraphStage layout={model.wide} {...stage} />
        </div>
      </div>

      <p role="status" aria-live="polite" className="sr-only">
        {status}
      </p>
      <div className="flex flex-col gap-3">
        {selected === null ? (
          <p className="text-muted-foreground text-sm">{INTERACTION_COPY.graphNoSelection}</p>
        ) : (
          // Keyed by the medication, so cards fold again after switching the selection.
          <section key={selected.id} aria-labelledby={titleId} className="flex flex-col gap-3">
            <h3 id={titleId} className="font-semibold break-words">
              {selected.name}
            </h3>
            {partners.length > 0 ? (
              <ul className="flex flex-col gap-3">
                {partners.map((partner) => (
                  <PartnerCard key={partner.id} partner={partner} />
                ))}
              </ul>
            ) : (
              <p className="text-sm">{INTERACTION_COPY.noInteractionsForMedication}</p>
            )}
          </section>
        )}
        <p className="text-muted-foreground text-sm">{INTERACTION_COPY.graphNoLineIsNotSafe}</p>
      </div>
    </div>
  );
}
