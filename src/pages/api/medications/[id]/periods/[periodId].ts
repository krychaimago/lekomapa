import type { APIRoute } from "astro";
import { z } from "zod";
import { createClient } from "@/lib/supabase";
import { MEDICATION_COPY, type MedicationApiErrorCode } from "@/lib/copy/medications";

export const prerender = false;

const GENERIC: MedicationApiErrorCode = "correctionGeneric";
const MAX_TEXT_LENGTH = 200;

// Database error codes raised by correct_dosage_period (see its function comment in
// supabase/migrations/20261005140000_correct_dosage_period.sql). Anything else is `correctionGeneric`. Measured
// through PostgREST before mapping: DP004, DP008, DP009 and DP010 arrive as `error.code` (HTTP 400).
const DB_ERROR_CODES: Record<string, MedicationApiErrorCode> = {
  DP004: "sameDoseInPeriod",
  DP005: "variantNotAllowed",
  DP008: "periodNotFound",
  DP009: "correctionWindowClosed",
  DP010: "sameAsPreviousPeriod",
};

// Every issue message is a MedicationApiErrorCode; the error redirect checks it against the copy before use. The
// database decides every rule about the history (window, same dose, previous period, variant); zod checks the shape.
const correctionSchema = z.object({
  doseText: z
    .string({ error: "doseRequired" satisfies MedicationApiErrorCode })
    .trim()
    .min(1, "doseRequired" satisfies MedicationApiErrorCode)
    .max(MAX_TEXT_LENGTH, "doseTooLong" satisfies MedicationApiErrorCode),
  // A leaflet medication sends no variant; an empty value means the same (keep the saved variant).
  registryProductId: z.uuid({ error: "invalidProduct" satisfies MedicationApiErrorCode }).optional(),
});

function toErrorCode(message: string | undefined): MedicationApiErrorCode {
  return message && Object.hasOwn(MEDICATION_COPY.apiErrors, message) ? (message as MedicationApiErrorCode) : GENERIC;
}

function formText(form: FormData, name: string): string | undefined {
  const value = form.get(name);
  return typeof value === "string" ? value : undefined;
}

// Only the error key travels back: never the dose (health data does not go into URLs). Both ids are validated uuids.
function errorRedirect(medicationId: string, periodId: string, code: MedicationApiErrorCode): string {
  return `/leki/${medicationId}/okresy/${periodId}/poprawa?${new URLSearchParams({ error: code }).toString()}`;
}

export const POST: APIRoute = async (context) => {
  // /api/medications is outside PROTECTED_ROUTES, so the route guards itself, the same way as the dose change route.
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

  const form = await context.request.formData();
  const variant = formText(form, "registryProductId");
  const parsed = correctionSchema.safeParse({
    doseText: formText(form, "doseText"),
    registryProductId: variant === "" ? undefined : variant,
  });
  if (!parsed.success) {
    return context.redirect(errorRedirect(medicationId, periodId, toErrorCode(parsed.error.issues[0]?.message)));
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return context.redirect(errorRedirect(medicationId, periodId, GENERIC));
  }

  // The function finds the period by its id among the caller's medications; the medication id from the URL only picks
  // the screen to return to. A period of another medication of the same account would still be the caller's own row,
  // so the check below keeps the URL and the corrected row consistent instead of correcting "somewhere else".
  const owner = await supabase
    .from("dosage_periods")
    .select("id")
    .eq("id", periodId)
    .eq("medication_id", medicationId)
    .maybeSingle();
  if (owner.error) {
    console.error("Reading a dosage period for a correction failed", { code: owner.error.code });
    return context.redirect(errorRedirect(medicationId, periodId, GENERIC));
  }
  if (!owner.data) {
    return context.redirect(errorRedirect(medicationId, periodId, "periodNotFound"));
  }

  const command = parsed.data;
  // One call rewrites the dose and variant of the period, as the signed-in user (RLS and the history guards apply).
  const { error } = await supabase.rpc("correct_dosage_period", {
    p_period_id: periodId,
    p_dose_text: command.doseText,
    p_registry_product_id: command.registryProductId ?? null,
  });

  if (error) {
    // Only the code: the details may carry the dose.
    console.error("Correcting a dosage period failed", { code: error.code });
    return context.redirect(
      errorRedirect(
        medicationId,
        periodId,
        Object.hasOwn(DB_ERROR_CODES, error.code) ? DB_ERROR_CODES[error.code] : GENERIC,
      ),
    );
  }

  // The period id (a uuid, no health data) lets the details screen say until when this period can still be corrected.
  return context.redirect(`/leki/${medicationId}?poprawiono=${periodId}`);
};
