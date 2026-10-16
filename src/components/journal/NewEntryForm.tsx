import { useState, type SubmitEvent } from "react";
import { Save } from "lucide-react";
import { ServerError } from "@/components/auth/ServerError";
import { SubmitButton } from "@/components/auth/SubmitButton";
import SymptomPicker, {
  type PickerSearchTerm,
  type PickerSymptom,
  type SelectedSymptom,
} from "@/components/journal/SymptomPicker";
import { Card, CardContent } from "@/components/ui/card";
import { Input, inputClassName } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { JOURNAL_COPY, apiErrorMessage } from "@/lib/copy/journal";
import { JOURNAL_NOTE_MAX_LENGTH, earliestEntryLocal, formatLocalDateTime } from "@/lib/services/journal";
import { cn } from "@/lib/utils";
import type { SymptomSeverity } from "@/types";

const copy = JOURNAL_COPY.form;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface Props {
  symptoms: PickerSymptom[];
  terms: PickerSearchTerm[];
  // `YYYY-MM-DDTHH:MM` in Europe/Warsaw from the server: default and upper bound (nowInWarsawLocal), lower bound
  // (earliestEntryLocal).
  defaultOccurred: string;
  minOccurred: string;
}

// New journal entry. Sent with fetch as JSON in the POST body, so the chosen symptoms and the note never appear in a
// URL, and the form keeps its state when the server answers with an error.
export default function NewEntryForm({ symptoms, terms, defaultOccurred, minOccurred }: Props) {
  const [selected, setSelected] = useState<SelectedSymptom[]>([]);
  // Until the user changes the time, the entry gets the moment of saving, not the moment the screen was opened.
  const [occurredTouched, setOccurredTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggle(symptomId: string) {
    setSelected((current) =>
      current.some((item) => item.symptomId === symptomId)
        ? current.filter((item) => item.symptomId !== symptomId)
        : [...current, { symptomId, severity: null }],
    );
  }

  function changeSeverity(symptomId: string, severity: SymptomSeverity | null) {
    setSelected((current) => current.map((item) => (item.symptomId === symptomId ? { ...item, severity } : item)));
  }

  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    if (selected.length === 0) {
      setError(copy.noSymptomsSelected);
      return;
    }

    const form = new FormData(event.currentTarget);
    const occurred = form.get("occurredLocal");
    const note = form.get("note");
    setError(null);
    setSubmitting(true);

    let errorKey: string | null = null;
    try {
      const response = await fetch("/api/journal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          occurredLocal: occurredTouched && typeof occurred === "string" ? occurred : null,
          items: selected.map((item) => ({ symptomId: item.symptomId, severity: item.severity })),
          note: typeof note === "string" ? note : null,
        }),
      });
      const body = (await response.json().catch(() => null)) as { id?: unknown; error?: unknown } | null;
      if (response.status === 201 && typeof body?.id === "string" && UUID.test(body.id)) {
        // Only the id travels in the URL: never a symptom or the note.
        window.location.assign(`/dzienniczek?dodano=${body.id}`);
        return;
      }
      errorKey = typeof body?.error === "string" ? body.error : null;
    } catch {
      // Network failure: no key, so the generic message below.
    }

    let message = apiErrorMessage(errorKey) ?? JOURNAL_COPY.apiErrors.unknown;
    // The lower bound moves with the clock: computed now, when the answer arrives, not when the screen was opened.
    if (errorKey === "occurredTooOld") {
      message = `${message} ${copy.earliestAllowed.replace("{od}", formatLocalDateTime(earliestEntryLocal()))}`;
    }
    setError(message);
    setSubmitting(false);
  }

  return (
    <Card>
      <CardContent>
        <form className="flex flex-col gap-6" onSubmit={(event) => void submit(event)}>
          <ServerError message={error} />

          <div className="flex flex-col gap-2">
            <Label htmlFor="occurredLocal">
              {copy.occurredLabel} <span className="text-muted-foreground font-normal">{copy.requiredMark}</span>
            </Label>
            <Input
              id="occurredLocal"
              name="occurredLocal"
              type="datetime-local"
              defaultValue={defaultOccurred}
              min={minOccurred}
              required
              aria-describedby="occurredLocal-hint"
              onChange={() => {
                setOccurredTouched(true);
              }}
            />
            <p id="occurredLocal-hint" className="text-muted-foreground text-sm">
              {copy.occurredHint.replace("{od}", formatLocalDateTime(minOccurred))}
            </p>
          </div>

          <SymptomPicker
            symptoms={symptoms}
            terms={terms}
            selected={selected}
            onToggle={toggle}
            onSeverityChange={changeSeverity}
          />

          <div className="flex flex-col gap-2">
            <Label htmlFor="note">
              {copy.noteLabel} <span className="text-muted-foreground font-normal">{copy.noteOptional}</span>
            </Label>
            <textarea
              id="note"
              name="note"
              rows={3}
              maxLength={JOURNAL_NOTE_MAX_LENGTH}
              aria-describedby="note-hint"
              className={cn(inputClassName, "h-auto min-h-24 py-2")}
            />
            <p id="note-hint" className="text-muted-foreground text-sm">
              {copy.noteHint}
            </p>
          </div>

          <SubmitButton pending={submitting} pendingText={copy.pending} icon={<Save className="size-4" />}>
            {copy.submit}
          </SubmitButton>
        </form>
      </CardContent>
    </Card>
  );
}
