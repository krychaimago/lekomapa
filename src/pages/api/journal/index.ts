import type { APIRoute } from "astro";
import { z } from "zod";
import type { JournalApiErrorCode } from "@/lib/copy/journal";
import {
  entryItemsSchema,
  isJsonRequest,
  json,
  noteTextSchema,
  occurredLocalSchema,
  toDbItems,
  toErrorCode,
} from "@/lib/services/journal-api";
import { createClient } from "@/lib/supabase";
import { reportError } from "@/lib/observability/report";

export const prerender = false;

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

// The shared schemas live in journal-api.ts, so the correction route checks the same shape.
const entrySchema = z.object({
  // null: the field was left untouched, so the database records the moment of saving (FR-008).
  occurredLocal: occurredLocalSchema,
  items: entryItemsSchema,
  note: noteTextSchema.nullish(),
});

// Saves one journal entry. Everything the user chose or typed arrives in the JSON body, never in the URL; the answer
// carries only the new id or an error key looked up in JOURNAL_COPY.apiErrors.
export const POST: APIRoute = async (context) => {
  // /api/journal is outside PROTECTED_ROUTES, so the route guards itself. The middleware already redirects a session
  // opened from a password reset link away from every other route; the second check keeps that true here even if the
  // allowed paths ever change.
  if (!context.locals.user || context.locals.recoverySession) {
    return json({ error: "sessionExpired" satisfies JournalApiErrorCode }, 401);
  }

  // Only JSON (see isJsonRequest).
  if (!isJsonRequest(context.request)) {
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
    p_items: toDbItems(entry.items),
    p_note: entry.note ?? null,
  });
  // Untyped client: the returned uuid is typed as any, so it is checked below before use.
  const data: unknown = result.data;
  const error = result.error;

  if (error) {
    // Only the code: the details may carry the symptoms or the note.
    reportError("journal.create", { code: error.code, route: context.routePattern });
    if (Object.hasOwn(DB_ERROR_CODES, error.code)) {
      const key = DB_ERROR_CODES[error.code];
      return json({ error: key }, key === "sessionExpired" ? 401 : 422);
    }
    return json({ error: "unknown" satisfies JournalApiErrorCode }, 500);
  }

  if (typeof data !== "string") {
    reportError("journal.create-no-id", { route: context.routePattern });
    return json({ error: "unknown" satisfies JournalApiErrorCode }, 500);
  }

  return json({ id: data }, 201);
};
