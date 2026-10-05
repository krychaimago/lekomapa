import { useId, useMemo, useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { JOURNAL_COPY } from "@/lib/copy/journal";
import { filterSymptoms, groupSymptomsByCategory } from "@/lib/services/journal";
import { cn } from "@/lib/utils";
import { SYMPTOM_SEVERITIES, type Symptom, type SymptomSearchTerm, type SymptomSeverity } from "@/types";

const copy = JOURNAL_COPY.form;

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

const optionClass = cn(
  "flex min-h-12 cursor-pointer items-center gap-3 rounded-lg border border-border bg-card px-3 py-2 text-card-foreground",
  "has-[:checked]:border-primary has-[:checked]:ring-2 has-[:checked]:ring-primary",
);

// Symptom choice for a journal entry. The search filters in the browser over the catalog sent with the page: nothing
// typed here leaves the page (no request, no URL). Without a query the symptoms are grouped by category, so the
// screen never shows a flat list of the whole catalog.
export default function SymptomPicker({ symptoms, terms, selected, onToggle, onSeverityChange }: Props) {
  const [query, setQuery] = useState("");
  const baseId = useId();
  const searchId = `${baseId}-search`;
  const hintId = `${baseId}-hint`;

  const groups = useMemo(() => groupSymptomsByCategory(symptoms), [symptoms]);
  const matches = useMemo(() => filterSymptoms(symptoms, terms, query), [symptoms, terms, query]);
  const byId = useMemo(() => new Map(symptoms.map((symptom) => [symptom.id, symptom])), [symptoms]);

  const selectedById = new Map(selected.map((item) => [item.symptomId, item]));

  // Severity sits in the "selected" block, under the symptom it belongs to, so it stays reachable while a search hides
  // that symptom from the list. The buttons wrap to a new row on a narrow screen instead of squeezing a word.
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

  const option = (symptom: PickerSymptom) => {
    const checked = selectedById.has(symptom.id);
    return (
      <li key={symptom.id}>
        <label className={optionClass}>
          <input
            type="checkbox"
            checked={checked}
            onChange={() => {
              onToggle(symptom.id);
            }}
            className="accent-primary size-5 shrink-0"
          />
          <span className="first-letter:uppercase">{symptom.name}</span>
        </label>
      </li>
    );
  };

  return (
    <fieldset className="flex flex-col gap-4">
      <legend className="mb-3 text-lg font-semibold">
        {copy.symptomsLegend} <span className="text-muted-foreground font-normal">{copy.requiredMark}</span>
      </legend>

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
                  className="border-primary bg-card text-card-foreground flex flex-col rounded-lg border"
                >
                  <div className="flex items-center justify-between gap-3 py-1 pr-1 pl-3">
                    <span className="font-medium first-letter:uppercase">{symptom.name}</span>
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
                  </div>
                  {severityGroup(item, symptom)}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <div className="flex flex-col gap-2">
        <Label htmlFor={searchId}>{copy.searchLabel}</Label>
        <Input
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

      {matches === null ? (
        <div className="flex flex-col gap-4">
          {groups.map((group) => (
            <section
              key={group.category}
              aria-labelledby={`${baseId}-${group.category}`}
              className="flex flex-col gap-2"
            >
              <h3 id={`${baseId}-${group.category}`} className="font-semibold first-letter:uppercase">
                {group.label}
              </h3>
              <ul className="grid gap-2 sm:grid-cols-2">{group.symptoms.map(option)}</ul>
            </section>
          ))}
        </div>
      ) : matches.length === 0 ? (
        <p role="status" className="text-muted-foreground">
          {copy.noMatch}
        </p>
      ) : (
        <section aria-label={copy.resultsLabel}>
          <ul className="grid gap-2 sm:grid-cols-2">{matches.map(option)}</ul>
        </section>
      )}

      <p className="text-muted-foreground text-sm">{copy.notFoundHint}</p>
    </fieldset>
  );
}
