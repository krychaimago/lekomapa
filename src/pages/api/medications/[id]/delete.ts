import type { APIRoute } from "astro";
import { z } from "zod";
import { createClient } from "@/lib/supabase";
import { reportError } from "@/lib/observability/report";
import type { MedicationApiErrorCode } from "@/lib/copy/medications";

export const prerender = false;

const GENERIC: MedicationApiErrorCode = "deleteGeneric";

// Database error codes raised by delete_medication (see its function comment in
// supabase/migrations/20261006120000_discontinue_medication.sql). Anything else, 28000 included, is `deleteGeneric`:
// the session is checked below before the call. A missing medication is MD001 and goes back to the screen, like DP008
// in the dose change route.
const DB_ERROR_CODES: Record<string, MedicationApiErrorCode> = {
  MD001: "medicationNotFound",
  MD010: "deleteWindowClosed",
};

// Only the error key travels back: never the medication's name (health data does not go into URLs). `medicationId` is
// a validated uuid.
function errorRedirect(medicationId: string, code: MedicationApiErrorCode): string {
  return `/leki/${medicationId}/usun?${new URLSearchParams({ error: code }).toString()}`;
}

export const POST: APIRoute = async (context) => {
  // /api/medications is outside PROTECTED_ROUTES, so the route guards itself, the same way as the dose change route.
  if (!context.locals.user || context.locals.recoverySession) {
    return new Response(null, { status: 401 });
  }

  // A malformed id never reaches the database and is never echoed back: there is no screen to return to.
  const id = z.uuid().safeParse(context.params.id);
  if (!id.success) {
    return new Response(null, { status: 404 });
  }
  const medicationId = id.data;

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return context.redirect(errorRedirect(medicationId, GENERIC));
  }

  // One call deletes the medication with its composition and periods (on delete cascade), as the signed-in user (RLS
  // and medications_guard_delete apply). The form sends no fields: the id in the path is all the call needs.
  const { error } = await supabase.rpc("delete_medication", { p_medication_id: medicationId });

  if (error) {
    // Only the code: the details may carry data about the medication.
    reportError("medications.delete", { code: error.code, route: context.routePattern });
    return context.redirect(
      errorRedirect(medicationId, Object.hasOwn(DB_ERROR_CODES, error.code) ? DB_ERROR_CODES[error.code] : GENERIC),
    );
  }

  return context.redirect("/leki?usunieto=1");
};
