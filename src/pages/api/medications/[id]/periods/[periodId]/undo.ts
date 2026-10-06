import type { APIRoute } from "astro";
import { z } from "zod";
import { createClient } from "@/lib/supabase";
import type { MedicationApiErrorCode } from "@/lib/copy/medications";

export const prerender = false;

const GENERIC: MedicationApiErrorCode = "undoGeneric";

// Database error codes raised by undo_dosage_change (see its function comment in
// supabase/migrations/20261007120000_undo_dosage_change.sql). Anything else, 28000 included, is `undoGeneric`: the
// session is checked below before the call.
const DB_ERROR_CODES: Record<string, MedicationApiErrorCode> = {
  DP008: "periodNotFound",
  DP009: "undoWindowClosed",
  DP011: "undoFirstPeriod",
  DP012: "undoNotLatest",
  DP013: "undoDiscontinued",
};

// Only the error key travels back: never a dose or a name (health data does not go into URLs). Both ids are validated
// uuids.
function errorRedirect(medicationId: string, periodId: string, code: MedicationApiErrorCode): string {
  return `/leki/${medicationId}/okresy/${periodId}/cofniecie?${new URLSearchParams({ error: code }).toString()}`;
}

export const POST: APIRoute = async (context) => {
  // /api/medications is outside PROTECTED_ROUTES, so the route guards itself, the same way as the correction route.
  if (!context.locals.user || context.locals.recoverySession) {
    return new Response(null, { status: 401 });
  }

  // Malformed ids never reach the database and are never echoed back: there is no screen to return to.
  const medicationParam = z.uuid().safeParse(context.params.id);
  const periodParam = z.uuid().safeParse(context.params.periodId);
  if (!medicationParam.success || !periodParam.success) {
    return new Response(null, { status: 404 });
  }
  const medicationId = medicationParam.data;
  const periodId = periodParam.data;

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return context.redirect(errorRedirect(medicationId, periodId, GENERIC));
  }

  // The function finds the period by its id among the caller's medications; the medication id from the URL only picks
  // the screen to return to. The check keeps the URL and the undone period consistent, as in the correction route.
  const owner = await supabase
    .from("dosage_periods")
    .select("id")
    .eq("id", periodId)
    .eq("medication_id", medicationId)
    .maybeSingle();
  if (owner.error) {
    console.error("Reading a dosage period for an undo failed", { code: owner.error.code });
    return context.redirect(errorRedirect(medicationId, periodId, GENERIC));
  }
  if (!owner.data) {
    return context.redirect(errorRedirect(medicationId, periodId, "periodNotFound"));
  }

  // One call deletes the newest period and reopens the one before it, as the signed-in user (RLS and the history
  // guards apply). The form sends no fields: the ids in the path are all the call needs.
  const { error } = await supabase.rpc("undo_dosage_change", { p_period_id: periodId });

  if (error) {
    // Only the code: the details may carry the dose.
    console.error("Undoing a dose change failed", { code: error.code });
    return context.redirect(
      errorRedirect(
        medicationId,
        periodId,
        Object.hasOwn(DB_ERROR_CODES, error.code) ? DB_ERROR_CODES[error.code] : GENERIC,
      ),
    );
  }

  // The flag carries no data: the details screen says the change was undone.
  return context.redirect(`/leki/${medicationId}?cofnieto=1`);
};
