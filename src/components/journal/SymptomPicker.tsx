import { useId, useMemo, useRef, useState, type ReactNode } from "react";
import { ChevronRight, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { JOURNAL_COPY } from "@/lib/copy/journal";
import { groupSymptomsByCategory, searchSymptoms, selectedCountLabel } from "@/lib/services/journal";
import { cn } from "@/lib/utils";
import {
  SYMPTOM_SEVERITIES,
  type Symptom,
  type SymptomCategory,
  type SymptomSearchTerm,
  type SymptomSeverity,
} from "@/types";

const copy = JOURNAL_COPY.form;
const severityLabels = new Map(SYMPTOM_SEVERITIES.map(({ value, label }) => [value, label]));

export type PickerSymptom = Pick<Symptom, "id" | "name" | "category" | "sort_order">;
export type PickerSearchTerm = Pick<SymptomSearchTerm, "symptom_id" | "term">;

export interface SelectedSymptom {
  symptomId: string;
  severity: SymptomSeverity | null;
}

interface Props {
  symptoms: PickerSymptom[];
  terms: PickerSearchTerm[];
  selected: SelectedSymptom[];
  onToggle: (symptomId: string) => void;
  onSeverityChange: (symptomId: string, severity: SymptomSeverity | null) => void;
}

// One bordered row per symptom: the checkbox label and, once ticked, the severity under it.
const optionClass = cn(
  "flex flex-col rounded-lg border border-border bg-card text-card-foreground",
  "has-[:checked]:border-primary has-[:checked]:ring-2 has-[:checked]:ring-primary",
);

const listClass = "grid items-start gap-2 sm:grid-cols-2";

// Symptom choice for a journal entry. The search filters in the browser over the catalog sent with the page: nothing
// typed here leaves the page (no request, no URL). Without a query the symptoms are grouped by category, every group
// folded at the start, so the screen never shows a flat list of the whole catalog.
export default function SymptomPicker({ symptoms, terms, selected, onToggle, onSeverityChange }: Props) {
  const [query, setQuery] = useState("");
  // Lives here, not in the query: typing and clearing a search brings the groups back as they were before it, except
  // the group of a symptom ticked in the results, which unfolds (impl-review F4).
  const [expanded, setExpanded] = useState<ReadonlySet<SymptomCategory>>(() => new Set());
  const searchRef = useRef<HTMLInputElement>(null);
  const baseId = useId();
  const searchId = `${baseId}-search`;
  const hintId = `${baseId}-hint`;

  const groups = useMemo(() => groupSymptomsByCategory(symptoms), [symptoms]);
  const byId = useMemo(() => new Map(symptoms.map((symptom) => [symptom.id, symptom])), [symptoms]);
  const selectedIds = useMemo(() => selected.map((item) => item.symptomId), [selected]);
  const results = useMemo(
    () => searchSymptoms(symptoms, terms, query, selectedIds),
    [symptoms, terms, query, selectedIds],
  );

  const selectedById = new Map(selected.map((item) => [item.symptomId, item]));

  function toggleGroup(category: SymptomCategory) {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  }

  // Severity sits under the ticked symptom, in the same row, so on a phone it appears next to the finger, also for the
  // last symptom of the list. It stays outside the <label>, so the checkbox keeps the symptom name as its accessible
  // name. While a search hides a ticked symptom, searchSymptoms pins it first in the results, so its severity stays
  // reachable (impl-review F5 of the first journal version). The buttons wrap to a new row on a narrow screen instead
  // of squeezing a word.
  const severityGroup = (item: SelectedSymptom, symptom: PickerSymptom) => (
    <div role="group" aria-label={`${copy.severityLegend}: ${symptom.name}`} className="flex flex-col gap-2 px-3 pb-3">
      <span className="text-muted-foreground text-sm">
        {copy.severityLegend} {copy.severityOptional}
      </span>
      <div className="flex flex-wrap gap-2">
        {SYMPTOM_SEVERITIES.map((severity) => {
          const pressed = item.severity === severity.value;
          return (
            <Button
              key={severity.value}
              type="button"
              variant={pressed ? "default" : "outline"}
              size="sm"
              aria-pressed={pressed}
              className="min-w-fit grow basis-0"
              onClick={() => {
                // A second press clears the severity: it stays optional.
                onSeverityChange(item.symptomId, pressed ? null : severity.value);
              }}
            >
              {severity.label}
            </Button>
          );
        })}
      </div>
    </div>
  );

  const option = (symptom: PickerSymptom, pinned: boolean) => {
    const item = selectedById.get(symptom.id);
    return (
      <li key={symptom.id} className={optionClass}>
        <label className="flex min-h-12 cursor-pointer items-center gap-3 px-3 py-2">
          <input
            type="checkbox"
            checked={item !== undefined}
            onChange={() => {
              onToggle(symptom.id);
              // Ticked from the search results: unfold its group, so after clearing the search the severity stays in view.
              if (results !== null && item === undefined) {
                setExpanded((current) => new Set(current).add(symptom.category));
              }
              // Unticking a pinned symptom removes its row, and the focus with it: send it back to the search field.
              if (pinned) searchRef.current?.focus();
            }}
            className="accent-primary size-5 shrink-0"
          />
          <span className="first-letter:uppercase">{symptom.name}</span>
        </label>
        {item && severityGroup(item, symptom)}
      </li>
    );
  };

  const noMatch = (
    <p role="status" className="text-muted-foreground">
      {copy.noMatch}
    </p>
  );

  let list: ReactNode;
  if (results === null) {
    list = (
      <div className="flex flex-col gap-2">
        {groups.map((group) => {
          const open = expanded.has(group.category);
          const listId = `${baseId}-${group.category}-list`;
          const count = selectedCountLabel(group.symptoms.filter((symptom) => selectedById.has(symptom.id)).length);
          return (
            <section key={group.category} className="flex flex-col gap-2">
              <h3>
                <Button
                  type="button"
                  variant="ghost"
                  aria-expanded={open}
                  aria-controls={listId}
                  className="w-full justify-start px-2 text-base font-semibold"
                  onClick={() => {
                    toggleGroup(group.category);
                  }}
                >
                  <ChevronRight
                    aria-hidden="true"
                    className={cn("transition-transform motion-reduce:transition-none", open && "rotate-90")}
                  />
                  <span className="first-letter:uppercase">{group.label}</span>
                  {/* A real space, not only CSS gap: otherwise the button's name reads "pokarmowy1 wybrany". */}
                  {count && (
                    <>
                      {" "}
                      <Badge variant="secondary">{count}</Badge>
                    </>
                  )}
                </Button>
              </h3>
              <ul id={listId} hidden={!open} className={listClass}>
                {group.symptoms.map((symptom) => option(symptom, false))}
              </ul>
            </section>
          );
        })}
      </div>
    );
  } else if (results.pinned.length === 0 && results.matches.length === 0) {
    list = noMatch;
  } else {
    list = (
      <div className="flex flex-col gap-4">
        {results.pinned.length > 0 && (
          <section aria-labelledby={`${baseId}-pinned`} className="flex flex-col gap-2">
            <h3 id={`${baseId}-pinned`} className="font-semibold">
              {copy.pinnedHeading}
            </h3>
            <ul className={listClass}>{results.pinned.map((symptom) => option(symptom, true))}</ul>
          </section>
        )}
        <section aria-labelledby={`${baseId}-results`} className="flex flex-col gap-2">
          <h3 id={`${baseId}-results`} className="font-semibold">
            {copy.resultsLabel}
          </h3>
          {results.matches.length === 0 ? (
            noMatch
          ) : (
            <ul className={listClass}>{results.matches.map((symptom) => option(symptom, false))}</ul>
          )}
        </section>
      </div>
    );
  }

  return (
    <fieldset className="flex flex-col gap-4">
      <legend className="mb-3 text-lg font-semibold">
        {copy.symptomsLegend} <span className="text-muted-foreground font-normal">{copy.requiredMark}</span>
      </legend>

      <div className="flex flex-col gap-2">
        <Label htmlFor={searchId}>{copy.searchLabel}</Label>
        <Input
          ref={searchRef}
          id={searchId}
          type="search"
          value={query}
          autoComplete="off"
          aria-describedby={hintId}
          onChange={(event) => {
            setQuery(event.target.value);
          }}
          onKeyDown={(event) => {
            // Enter in the search field must not send the entry before the user has chosen.
            if (event.key === "Enter") event.preventDefault();
          }}
        />
        <p id={hintId} className="text-muted-foreground text-sm">
          {copy.searchHint}
        </p>
      </div>

      {list}

      <p className="text-muted-foreground text-sm">{copy.notFoundHint}</p>

      {/* Summary just before the note: what the entry will save. Severity is chosen only next to the symptom. */}
      <section aria-labelledby={`${baseId}-selected`} className="flex flex-col gap-3">
        <h3 id={`${baseId}-selected`} className="font-semibold">
          {copy.selectedHeading}
        </h3>
        {selected.length === 0 ? (
          <p className="text-muted-foreground text-sm">{copy.noneSelected}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {selected.map((item) => {
              const symptom = byId.get(item.symptomId);
              if (!symptom) return null;
              return (
                <li
                  key={item.symptomId}
                  className="border-border bg-card text-card-foreground flex items-center justify-between gap-3 rounded-lg border py-1 pr-1 pl-3"
                >
                  <p className="min-w-0">
                    <span className="inline-block font-medium first-letter:uppercase">{symptom.name}</span>
                    {item.severity && (
                      <span className="text-muted-foreground"> · {severityLabels.get(item.severity)}</span>
                    )}
                  </p>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      onToggle(item.symptomId);
                    }}
                  >
                    <X aria-hidden="true" />
                    <span className="sr-only">
                      {copy.removeSymptom}: {symptom.name}
                    </span>
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </fieldset>
  );
}
