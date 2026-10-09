import type { APIRoute } from "astro";
import { z } from "zod";
import type { JournalApiErrorCode } from "@/lib/copy/journal";
import { createClient } from "@/lib/supabase";

export const prerender = false;

const GENERIC: JournalApiErrorCode = "deleteGeneric";

// Database error codes raised by delete_symptom_entry (see its function comment in
// supabase/migrations/20261009120000_journal_correction.sql). Anything else is `deleteGeneric`; 28000 cannot be
// reached while the route checks the session first, mapped so an expired session never reads as an unknown error.
const DB_ERROR_CODES: Record<string, JournalApiErrorCode> = {
  SE006: "entryNotFound",
  SE007: "deleteWindowClosed",
  "28000": "sessionExpired",
};

// Only the error key travels back: never a symptom or the note (health data does not go into URLs). `entryId` is a
// validated uuid.
function errorRedirect(entryId: string, code: JournalApiErrorCode): string {
  return `/dzienniczek/${entryId}/usun?${new URLSearchParams({ error: code }).toString()}`;
}

// No-store on every answer: a redirect decided by the session must not be kept by a cache.
function redirect(location: string): Response {
  return new Response(null, { status: 302, headers: { Location: location, "Cache-Control": "private, no-store" } });
}

// Deletes one journal entry added by mistake, while its correction window is open. A plain form POST from the
// confirmation screen (Astro's checkOrigin applies); the form sends no fields: the id in the path is all the call needs.
export const POST: APIRoute = async (context) => {
  // /api/journal is outside PROTECTED_ROUTES, so the route guards itself, the same way as POST /api/journal.
  if (!context.locals.user || context.locals.recoverySession) {
    return new Response(null, { status: 401, headers: { "Cache-Control": "private, no-store" } });
  }

  // A malformed id never reaches the database and is never echoed back: there is no screen to return to.
  const id = z.uuid().safeParse(context.params.id);
  if (!id.success) {
    return new Response(null, { status: 404, headers: { "Cache-Control": "private, no-store" } });
  }
  const entryId = id.data;

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return redirect(errorRedirect(entryId, GENERIC));
  }

  // One call deletes the entry with its symptoms (on delete cascade), as the signed-in user (RLS and
  // symptom_entries_guard_delete apply).
  const { error } = await supabase.rpc("delete_symptom_entry", { p_entry_id: entryId });

  if (error) {
    // Only the code: the details may carry data about the entry.
    console.error("Deleting a journal entry failed", { code: error.code });
    return redirect(
      errorRedirect(entryId, Object.hasOwn(DB_ERROR_CODES, error.code) ? DB_ERROR_CODES[error.code] : GENERIC),
    );
  }

  return redirect("/dzienniczek?usunieto=1");
};
