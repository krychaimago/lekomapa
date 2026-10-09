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

export const prerender = false;

// Database error codes raised by correct_symptom_entry (see its function comment in
// supabase/migrations/20261009120000_journal_correction.sql). SE001–SE005 as in POST /api/journal; SE006 = no such
// entry of this account (another account's entry reads the same as none at all), SE007 = correction window closed.
// 28000 cannot be reached while the route checks the session first; mapped so an expired session never reads as an
// unknown error.
const DB_ERROR_CODES: Record<string, JournalApiErrorCode> = {
  SE001: "noSymptoms",
  SE002: "occurredInFuture",
  SE003: "occurredTooOld",
  SE004: "duplicateSymptom",
  SE005: "unknownSymptom",
  SE006: "entryNotFound",
  SE007: "correctionWindowClosed",
  "28000": "sessionExpired",
};

function statusOf(key: JournalApiErrorCode): number {
  if (key === "sessionExpired") return 401;
  if (key === "entryNotFound") return 404;
  if (key === "correctionWindowClosed") return 409;
  return 422;
}

// Same shapes as saving an entry (journal-api.ts).
const correctionSchema = z.object({
  // null: the field was left untouched, so the date stays as saved — not the moment of correcting.
  occurredLocal: occurredLocalSchema,
  items: entryItemsSchema,
  note: noteTextSchema.nullish(),
});

// Corrects one journal entry while its correction window is open. Everything the user chose or typed arrives in the
// JSON body, never in the URL; the path carries only the entry's uuid, the answer only the id or an error key looked
// up in JOURNAL_COPY.apiErrors.
export const POST: APIRoute = async (context) => {
  // /api/journal is outside PROTECTED_ROUTES, so the route guards itself, the same way as POST /api/journal.
  if (!context.locals.user || context.locals.recoverySession) {
    return json({ error: "sessionExpired" satisfies JournalApiErrorCode }, 401);
  }

  // A malformed id never reaches the database and is never echoed back.
  const id = z.uuid().safeParse(context.params.id);
  if (!id.success) {
    return json({ error: "entryNotFound" satisfies JournalApiErrorCode }, 404);
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

  const parsed = correctionSchema.safeParse(body);
  if (!parsed.success) {
    return json({ error: toErrorCode(parsed.error.issues[0]?.message) }, 422);
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return json({ error: "unknown" satisfies JournalApiErrorCode }, 500);
  }

  const correction = parsed.data;
  // One call rewrites the date, the symptoms and the note atomically, as the signed-in user (RLS and the history
  // guards apply). The function checks the window before the content, so a closed window wins over a content error.
  const result = await supabase.rpc("correct_symptom_entry", {
    p_entry_id: id.data,
    p_occurred_local: correction.occurredLocal,
    p_items: toDbItems(correction.items),
    p_note: correction.note ?? null,
  });
  // Untyped client: the returned uuid is typed as any, so it is checked below before use.
  const data: unknown = result.data;
  const error = result.error;

  if (error) {
    // Only the code: the details may carry the symptoms or the note.
    console.error("Correcting a journal entry failed", { code: error.code });
    if (Object.hasOwn(DB_ERROR_CODES, error.code)) {
      const key = DB_ERROR_CODES[error.code];
      return json({ error: key }, statusOf(key));
    }
    return json({ error: "unknown" satisfies JournalApiErrorCode }, 500);
  }

  if (typeof data !== "string") {
    console.error("Correcting a journal entry returned no id");
    return json({ error: "unknown" satisfies JournalApiErrorCode }, 500);
  }

  return json({ id: data }, 200);
};
