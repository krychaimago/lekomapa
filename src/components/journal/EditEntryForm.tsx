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
import {
  JOURNAL_NOTE_MAX_LENGTH,
  earliestEntryLocal,
  formatLocalDateTime,
  formatWarsawDateTime,
} from "@/lib/services/journal";
import { cn } from "@/lib/utils";
import type { SymptomSeverity } from "@/types";

const formCopy = JOURNAL_COPY.form;
const copy = JOURNAL_COPY.entry;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface Props {
  entryId: string;
  // Decided by the server's clock when the page was rendered; the database decides again on saving (SE007).
  windowOpen: boolean;
  // End of the correction window, ISO timestamp from correction_window_ends_at.
  windowEndsAt: string;
  // Saved time of the entry, `YYYY-MM-DDTHH:MM` in Europe/Warsaw.
  occurred: string;
  // Lower bound of the time field: minOccurredLocal (never later than the saved time).
  minOccurred: string;
  // The 14-day limit (earliestEntryLocal), shown in the field's hint.
  earliestOccurred: string;
  items: SelectedSymptom[];
  note: string | null;
  // The symptom catalog, needed only while the window is open.
  symptoms: PickerSymptom[];
  terms: PickerSearchTerm[];
}

// Correction of one journal entry (S-07). While the correction window is open: the fields of a new entry, filled with
// the saved values, sent to /api/journal/<id>. Once it is closed: the note alone, sent to /api/journal/<id>/note.
// Sent with fetch as JSON in the POST body, so the symptoms and the note never appear in a URL; after an error the
// form keeps everything typed (nothing is saved in part).
export default function EditEntryForm({
  entryId,
  windowOpen,
  windowEndsAt,
  occurred,
  minOccurred,
  earliestOccurred,
  items,
  note,
  symptoms,
  terms,
}: Props) {
  const [selected, setSelected] = useState<SelectedSymptom[]>(items);
  // Untouched, the time field sends null: the saved time stays (unlike a new entry, where null is the moment of saving).
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

  function messageOf(errorKey: string | null): string {
    let message = apiErrorMessage(errorKey) ?? JOURNAL_COPY.apiErrors.unknown;
    if (errorKey === "correctionWindowClosed") {
      message = message.replace("{o}", formatWarsawDateTime(windowEndsAt));
    }
    // The lower bound moves with the clock: computed now, when the answer arrives, not when the screen was opened.
    if (errorKey === "occurredTooOld") {
      message = `${message} ${formCopy.earliestAllowed.replace("{od}", formatLocalDateTime(earliestEntryLocal()))}`;
    }
    return message;
  }

  async function send(path: string, body: unknown, successParam: "poprawiono" | "notatka") {
    setError(null);
    setSubmitting(true);

    let errorKey: string | null = null;
    try {
      const response = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const answer = (await response.json().catch(() => null)) as { id?: unknown; error?: unknown } | null;
      if (response.status === 200 && typeof answer?.id === "string" && UUID.test(answer.id)) {
        // Only the id travels in the URL: never a symptom or the note.
        window.location.assign(`/dzienniczek?${successParam}=${answer.id}`);
        return;
      }
      errorKey = typeof answer?.error === "string" ? answer.error : null;
    } catch {
      // Network failure: no key, so the generic message.
    }

    setError(messageOf(errorKey));
    setSubmitting(false);
  }

  async function submitCorrection(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    if (selected.length === 0) {
      setError(formCopy.noSymptomsSelected);
      return;
    }
    const form = new FormData(event.currentTarget);
    const occurredValue = form.get("occurredLocal");
    const noteValue = form.get("note");
    await send(
      `/api/journal/${entryId}`,
      {
        occurredLocal: occurredTouched && typeof occurredValue === "string" ? occurredValue : null,
        items: selected.map((item) => ({ symptomId: item.symptomId, severity: item.severity })),
        note: typeof noteValue === "string" ? noteValue : null,
      },
      "poprawiono",
    );
  }

  async function submitNote(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    const noteValue = new FormData(event.currentTarget).get("note");
    // A blank note clears it.
    await send(`/api/journal/${entryId}/note`, { note: typeof noteValue === "string" ? noteValue : null }, "notatka");
  }

  const noteField = (
    <div className="flex flex-col gap-2">
      <Label htmlFor="note">
        {formCopy.noteLabel} <span className="text-muted-foreground font-normal">{formCopy.severityOptional}</span>
      </Label>
      <textarea
        id="note"
        name="note"
        rows={3}
        maxLength={JOURNAL_NOTE_MAX_LENGTH}
        defaultValue={note ?? ""}
        aria-describedby="note-hint"
        className={cn(inputClassName, "h-auto min-h-24 py-2")}
      />
      <p id="note-hint" className="text-muted-foreground text-sm">
        {formCopy.noteHint}
      </p>
    </div>
  );

  if (!windowOpen) {
    return (
      <Card>
        <CardContent>
          <form className="flex flex-col gap-6" onSubmit={(event) => void submitNote(event)}>
            <ServerError message={error} />
            {noteField}
            <SubmitButton pending={submitting} pendingText={formCopy.pending} icon={<Save className="size-4" />}>
              {copy.submitNote}
            </SubmitButton>
          </form>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent>
        <form className="flex flex-col gap-6" onSubmit={(event) => void submitCorrection(event)}>
          <ServerError message={error} />

          <div className="flex flex-col gap-2">
            <Label htmlFor="occurredLocal">
              {formCopy.occurredLabel}{" "}
              <span className="text-muted-foreground font-normal">{formCopy.requiredMark}</span>
            </Label>
            <Input
              id="occurredLocal"
              name="occurredLocal"
              type="datetime-local"
              defaultValue={occurred}
              min={minOccurred}
              required
              aria-describedby="occurredLocal-hint"
              onChange={() => {
                setOccurredTouched(true);
              }}
            />
            <p id="occurredLocal-hint" className="text-muted-foreground text-sm">
              {copy.occurredHint.replace("{od}", formatLocalDateTime(earliestOccurred))}
            </p>
          </div>

          <SymptomPicker
            symptoms={symptoms}
            terms={terms}
            selected={selected}
            onToggle={toggle}
            onSeverityChange={changeSeverity}
          />

          {noteField}

          <SubmitButton pending={submitting} pendingText={formCopy.pending} icon={<Save className="size-4" />}>
            {copy.submit}
          </SubmitButton>
        </form>
      </CardContent>
    </Card>
  );
}
