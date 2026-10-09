import type { APIRoute } from "astro";
import { z } from "zod";
import type { JournalApiErrorCode } from "@/lib/copy/journal";
import { isJsonRequest, json, noteTextSchema, toErrorCode } from "@/lib/services/journal-api";
import { createClient } from "@/lib/supabase";

export const prerender = false;

// Database error codes raised by set_symptom_entry_note (see its function comment in
// supabase/migrations/20261009120000_journal_correction.sql). The note has no window, so there is no SE007 here.
const DB_ERROR_CODES: Record<string, JournalApiErrorCode> = {
  SE006: "entryNotFound",
  "28000": "sessionExpired",
};

// `note: null` (or a blank note) clears it.
const noteSchema = z.object({ note: noteTextSchema.nullable() });

// Changes or clears the note of one journal entry, at any time (FR-009). The note travels in the JSON body, never in
// the URL; the answer carries only the id or an error key looked up in JOURNAL_COPY.apiErrors.
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

  const parsed = noteSchema.safeParse(body);
  if (!parsed.success) {
    return json({ error: toErrorCode(parsed.error.issues[0]?.message) }, 422);
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return json({ error: "unknown" satisfies JournalApiErrorCode }, 500);
  }

  // As the signed-in user (RLS applies). A blank note is stored as no note by the function itself.
  const result = await supabase.rpc("set_symptom_entry_note", {
    p_entry_id: id.data,
    p_note: parsed.data.note,
  });
  // Untyped client: the returned uuid is typed as any, so it is checked below before use.
  const data: unknown = result.data;
  const error = result.error;

  if (error) {
    // Only the code: the details may carry the note.
    console.error("Changing a journal note failed", { code: error.code });
    if (Object.hasOwn(DB_ERROR_CODES, error.code)) {
      const key = DB_ERROR_CODES[error.code];
      return json({ error: key }, key === "sessionExpired" ? 401 : 404);
    }
    return json({ error: "unknown" satisfies JournalApiErrorCode }, 500);
  }

  if (typeof data !== "string") {
    console.error("Changing a journal note returned no id");
    return json({ error: "unknown" satisfies JournalApiErrorCode }, 500);
  }

  return json({ id: data }, 200);
};
