// Request shapes and answers shared by the journal API routes: saving an entry (S-05, src/pages/api/journal/index.ts)
// and correcting it (S-07, src/pages/api/journal/[id].ts, [id]/note.ts). One copy of the symptom, date and note
// schemas, so a rule tightened for one route cannot silently stay loose in the other.

import { z } from "zod";
import { JOURNAL_COPY, type JournalApiErrorCode } from "@/lib/copy/journal";
import { JOURNAL_NOTE_MAX_LENGTH } from "@/lib/services/journal";
import type { SymptomSeverity } from "@/types";

// The closed symptom list has 34 entries (20260926120100_symptom_catalog_seed.sql) and one symptom appears at most
// once per entry, so a longer list can only be a crafted request. Raise together with the catalog.
const MAX_ITEMS = 34;

// `datetime-local` value: Polish wall-clock time without a zone, read by the database functions as Europe/Warsaw.
const OCCURRED_LOCAL = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

// A calendar date and time that exist ("2026-02-30T10:00" and "25:00" do not), so the database never gets a value it
// would reject with a parse error instead of a named code.
function isRealLocalDateTime(value: string): boolean {
  const match = OCCURRED_LOCAL.exec(value);
  if (!match) return false;
  const [year, month, day, hour, minute] = match.slice(1).map(Number);
  const date = new Date(Date.UTC(year, month - 1, day, hour, minute));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day &&
    date.getUTCHours() === hour &&
    date.getUTCMinutes() === minute
  );
}

// Every issue message below is a JournalApiErrorCode. zod checks only the shape; the database decides every rule
// about the history (time limits, at least one symptom, duplicates, symptoms on the list, the correction window).

// null: the field was left untouched. What that means is the route's call: the moment of saving when adding an
// entry (FR-008), the saved date when correcting one.
export const occurredLocalSchema = z
  .string({ error: "invalidOccurred" satisfies JournalApiErrorCode })
  .refine(isRealLocalDateTime, "invalidOccurred" satisfies JournalApiErrorCode)
  .nullable();

export const entryItemsSchema = z
  .array(
    z.object({
      symptomId: z.uuid({ error: "unknownSymptom" satisfies JournalApiErrorCode }),
      severity: z
        .enum(["mild", "moderate", "severe"] satisfies SymptomSeverity[], {
          error: "invalidSeverity" satisfies JournalApiErrorCode,
        })
        .nullable(),
    }),
    { error: "noSymptoms" satisfies JournalApiErrorCode },
  )
  .min(1, "noSymptoms" satisfies JournalApiErrorCode)
  .max(MAX_ITEMS, "tooManySymptoms" satisfies JournalApiErrorCode);

// The note text alone; each route decides whether it may be missing. A blank note is stored as no note by the
// database functions themselves.
export const noteTextSchema = z
  .string({ error: "invalidRequest" satisfies JournalApiErrorCode })
  .trim()
  .max(JOURNAL_NOTE_MAX_LENGTH, "noteTooLong" satisfies JournalApiErrorCode);

// The shape the database functions take for p_items.
export function toDbItems(items: z.infer<typeof entryItemsSchema>): { symptom_id: string; severity: string | null }[] {
  return items.map((item) => ({ symptom_id: item.symptomId, severity: item.severity }));
}

export function toErrorCode(message: string | undefined): JournalApiErrorCode {
  return message && Object.hasOwn(JOURNAL_COPY.apiErrors, message)
    ? (message as JournalApiErrorCode)
    : "invalidRequest";
}

// The answer depends on the session, so no cache may keep it or hand it to another account.
export function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "private, no-store" },
  });
}

// Only JSON. Astro's checkOrigin covers the form content types (urlencoded, multipart, text/plain); JSON from
// another site needs a CORS preflight these routes never answer. Refusing every other type keeps a cross-site
// text/plain body with JSON inside from ever being parsed.
export function isJsonRequest(request: Request): boolean {
  return (request.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json");
}
