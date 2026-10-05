import type { APIRoute } from "astro";
import { z } from "zod";
import { JOURNAL_COPY, type JournalApiErrorCode } from "@/lib/copy/journal";
import { JOURNAL_NOTE_MAX_LENGTH } from "@/lib/services/journal";
import { createClient } from "@/lib/supabase";
import type { SymptomSeverity } from "@/types";

export const prerender = false;

// The closed symptom list has 34 entries (20260926120100_symptom_catalog_seed.sql) and one symptom appears at most
// once per entry, so a longer list can only be a crafted request. Raise together with the catalog.
const MAX_ITEMS = 34;

// `datetime-local` value: Polish wall-clock time without a zone, read by add_symptom_entry as Europe/Warsaw.
const OCCURRED_LOCAL = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

// Database error codes raised by add_symptom_entry (see its function comment in
// supabase/migrations/20261005130000_symptom_journal.sql). Measured against the local Supabase: SE001–SE005 arrive as
// `error.code` with HTTP 400. 28000 (no session inside the function) cannot be reached through the API while the
// route checks the session first; mapped anyway so an expired session never reads as an unknown error.
const DB_ERROR_CODES: Record<string, JournalApiErrorCode> = {
  SE001: "noSymptoms",
  SE002: "occurredInFuture",
  SE003: "occurredTooOld",
  SE004: "duplicateSymptom",
  SE005: "unknownSymptom",
  "28000": "sessionExpired",
};

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

// Every issue message is a JournalApiErrorCode. zod checks only the shape; the database decides every rule about the
// history (time limits, at least one symptom, duplicates, symptoms on the list).
const entrySchema = z.object({
  // null: the field was left untouched, so the database records the moment of saving (FR-008).
  occurredLocal: z
    .string({ error: "invalidOccurred" satisfies JournalApiErrorCode })
    .refine(isRealLocalDateTime, "invalidOccurred" satisfies JournalApiErrorCode)
    .nullable(),
  items: z
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
    .max(MAX_ITEMS, "tooManySymptoms" satisfies JournalApiErrorCode),
  note: z
    .string({ error: "invalidRequest" satisfies JournalApiErrorCode })
    .trim()
    .max(JOURNAL_NOTE_MAX_LENGTH, "noteTooLong" satisfies JournalApiErrorCode)
    .nullish(),
});

function toErrorCode(message: string | undefined): JournalApiErrorCode {
  return message && Object.hasOwn(JOURNAL_COPY.apiErrors, message)
    ? (message as JournalApiErrorCode)
    : "invalidRequest";
}

// The answer depends on the session, so no cache may keep it or hand it to another account.
function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "private, no-store" },
  });
}

// Saves one journal entry. Everything the user chose or typed arrives in the JSON body, never in the URL; the answer
// carries only the new id or an error key looked up in JOURNAL_COPY.apiErrors.
export const POST: APIRoute = async (context) => {
  // /api/journal is outside PROTECTED_ROUTES, so the route guards itself. The middleware already redirects a session
  // opened from a password reset link away from every other route; the second check keeps that true here even if the
  // allowed paths ever change.
  if (!context.locals.user || context.locals.recoverySession) {
    return json({ error: "sessionExpired" satisfies JournalApiErrorCode }, 401);
  }

  // Only JSON. Astro's checkOrigin covers the form content types (urlencoded, multipart, text/plain); JSON from
  // another site needs a CORS preflight this route never answers. Refusing every other type keeps a cross-site
  // text/plain body with JSON inside from ever being parsed here.
  const contentType = context.request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("application/json")) {
    return json({ error: "invalidRequest" satisfies JournalApiErrorCode }, 415);
  }

  let body: unknown;
  try {
    body = await context.request.json();
  } catch {
    return json({ error: "invalidRequest" satisfies JournalApiErrorCode }, 422);
  }

  const parsed = entrySchema.safeParse(body);
  if (!parsed.success) {
    return json({ error: toErrorCode(parsed.error.issues[0]?.message) }, 422);
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return json({ error: "unknown" satisfies JournalApiErrorCode }, 500);
  }

  const entry = parsed.data;
  // One call writes the entry and its symptoms atomically, as the signed-in user (RLS applies). A blank note is
  // stored as no note by the function itself.
  const result = await supabase.rpc("add_symptom_entry", {
    p_occurred_local: entry.occurredLocal,
    p_items: entry.items.map((item) => ({ symptom_id: item.symptomId, severity: item.severity })),
    p_note: entry.note ?? null,
  });
  // Untyped client: the returned uuid is typed as any, so it is checked below before use.
  const data: unknown = result.data;
  const error = result.error;

  if (error) {
    // Only the code: the details may carry the symptoms or the note.
    console.error("Saving a journal entry failed", { code: error.code });
    if (Object.hasOwn(DB_ERROR_CODES, error.code)) {
      const key = DB_ERROR_CODES[error.code];
      return json({ error: key }, key === "sessionExpired" ? 401 : 422);
    }
    return json({ error: "unknown" satisfies JournalApiErrorCode }, 500);
  }

  if (typeof data !== "string") {
    console.error("Saving a journal entry returned no id");
    return json({ error: "unknown" satisfies JournalApiErrorCode }, 500);
  }

  return json({ id: data }, 201);
};
