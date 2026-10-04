import type { APIRoute } from "astro";
import { z } from "zod";
import { createClient } from "@/lib/supabase";
import { MEDICATION_COPY, type MedicationApiErrorCode } from "@/lib/copy/medications";
import { todayInWarsaw } from "@/lib/services/medications";

export const prerender = false;

const GENERIC: MedicationApiErrorCode = "generic";
const MAX_TEXT_LENGTH = 200;

// Database error codes raised by change_dosage (see its function comment in
// supabase/migrations/20261004120000_dosage_change.sql). Anything else is `generic`. Measured: DP00x arrive as
// `error.code`; P0002 arrives locally without a code (HTTP 500 body replaced), so in practice it falls to `generic`.
const DB_ERROR_CODES: Record<string, MedicationApiErrorCode> = {
  DP001: "medicationDiscontinued",
  DP002: "changeDateTooEarly",
  DP003: "changeDateInFuture",
  DP004: "sameDose",
  DP005: "variantNotAllowed",
  DP006: "noCurrentPeriod",
  DP007: "changeDateTooOld",
  P0002: "medicationNotFound",
};

// Every issue message is a MedicationApiErrorCode; the error redirect checks it against the copy before use.
// The database decides every rule about the history (dates against the current period, same dose, variant); zod
// checks only the shape.
const dosageChangeSchema = z.object({
  doseText: z
    .string({ error: "doseRequired" satisfies MedicationApiErrorCode })
    .trim()
    .min(1, "doseRequired" satisfies MedicationApiErrorCode)
    .max(MAX_TEXT_LENGTH, "doseTooLong" satisfies MedicationApiErrorCode),
  // Compared as ISO strings: `YYYY-MM-DD` orders lexically. "Today" is Polish time, not the Worker's UTC.
  changedOn: z.iso
    .date({ error: "invalidChangeDate" satisfies MedicationApiErrorCode })
    .refine((date) => date <= todayInWarsaw(), "changeDateInFuture" satisfies MedicationApiErrorCode),
  // A leaflet medication sends no variant; an empty value means the same (keep the current variant).
  registryProductId: z.uuid({ error: "invalidProduct" satisfies MedicationApiErrorCode }).optional(),
});

function toErrorCode(message: string | undefined): MedicationApiErrorCode {
  return message && Object.hasOwn(MEDICATION_COPY.apiErrors, message) ? (message as MedicationApiErrorCode) : GENERIC;
}

function formText(form: FormData, name: string): string | undefined {
  const value = form.get(name);
  return typeof value === "string" ? value : undefined;
}

// Only the error key travels back: never the dose and never the date (health data does not go into URLs).
// `medicationId` is a validated uuid.
function errorRedirect(medicationId: string, code: MedicationApiErrorCode): string {
  return `/leki/${medicationId}/zmiana-dawki?${new URLSearchParams({ error: code }).toString()}`;
}

export const POST: APIRoute = async (context) => {
  // /api/medications is outside PROTECTED_ROUTES, so the route guards itself. The middleware already redirects a
  // session opened from a password reset link away from every other route; the second check keeps that true here
  // even if the allowed paths ever change.
  if (!context.locals.user || context.locals.recoverySession) {
    return new Response(null, { status: 401 });
  }

  // A malformed id never reaches the database and is never echoed back: there is no screen to return to.
  const id = z.uuid().safeParse(context.params.id);
  if (!id.success) {
    return new Response(null, { status: 404 });
  }
  const medicationId = id.data;

  const form = await context.request.formData();
  const variant = formText(form, "registryProductId");
  const parsed = dosageChangeSchema.safeParse({
    doseText: formText(form, "doseText"),
    changedOn: formText(form, "changedOn"),
    registryProductId: variant === "" ? undefined : variant,
  });
  if (!parsed.success) {
    return context.redirect(errorRedirect(medicationId, toErrorCode(parsed.error.issues[0]?.message)));
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return context.redirect(errorRedirect(medicationId, GENERIC));
  }

  const command = parsed.data;
  // One call closes the current period and opens the new one atomically, as the signed-in user (RLS applies).
  const { error } = await supabase.rpc("change_dosage", {
    p_medication_id: medicationId,
    p_dose_text: command.doseText,
    p_changed_on: command.changedOn,
    p_registry_product_id: command.registryProductId ?? null,
  });

  if (error) {
    // Only the code: the details may carry the dose.
    console.error("Changing a dosage failed", { code: error.code });
    return context.redirect(
      errorRedirect(medicationId, Object.hasOwn(DB_ERROR_CODES, error.code) ? DB_ERROR_CODES[error.code] : GENERIC),
    );
  }

  return context.redirect(`/leki/${medicationId}?zmieniono=1`);
};
