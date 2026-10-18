import { useId, useState } from "react";
import { ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { INTERACTION_COPY } from "@/lib/copy/interactions";
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

// Radius of a point and of the glow around the selected one, in viewBox units. The phone stage never grows past 384 px
// (max-w-sm), so one unit is at most about 1.07 px there; the wide stage starts at 480 px of card content
// (about 514 px of the whole card) for 576 units.
const POINT_RADIUS = 9;
const GLOW_RADIUS = 15;
// Width of a medication button in viewBox units, the width the layout keeps buttons apart by (GRAPH_BUTTON_WIDTH in
// src/lib/services/interaction-graph.ts).
const BUTTON_WIDTH = 90;

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

interface StageProps {
  layout: InteractionGraphLayout;
  nodes: InteractionGraphNode[];
  selectedId: string | null;
  partnerIds: ReadonlySet<string>;
  onToggle: (id: string) => void;
  /** Width limit of the stage: the phone layout never grows past 384 px, the wide one fills the card. */
  className?: string;
}

// One layout of the graph: lines and points in an aria-hidden SVG, every medication a real button over its point.
function GraphStage({ layout, nodes, selectedId, partnerIds, onToggle, className }: StageProps) {
  const pointById = new Map(layout.points.map((point) => [point.id, point]));

  // Lines grouped by state into a few paths, never one element per pair.
  const faint: string[] = [];
  const highlighted: string[] = [];
  for (const line of layout.lines) {
    if (selectedId !== null && (line.a === selectedId || line.b === selectedId)) highlighted.push(line.path);
    else faint.push(line.path);
  }

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

// Interaction graph under the medication list (S-10, FR-014). The geometry comes ready from buildInteractionGraph in
// two layouts; this component draws both and keeps which medication is selected, shared by the two. A container query
// on the card shows exactly one: the phone layout below 480 px of card content (about 514 px of the whole card, padding
// and border included), the wide one from there on. The other is display:none, so it is out of the accessibility tree
// and the tab order, and the server's HTML already shows the right one without JS. Every medication is a real button in alphabetical order, so Tab walks the names and Enter or
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
        <div className="@min-[480px]:hidden">
          <GraphStage layout={model.phone} className="max-w-sm" {...stage} />
        </div>
        <div className="hidden @min-[480px]:block">
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
