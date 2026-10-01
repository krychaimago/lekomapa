import type { APIRoute } from "astro";
import { z } from "zod";
import { createClient } from "@/lib/supabase";
import { MEDICATION_COPY, type MedicationApiErrorCode } from "@/lib/copy/medications";
import { todayInWarsaw } from "@/lib/services/medications";

export const prerender = false;

const ADD_PATH = "/leki/nowy";
const LIST_PATH = "/leki";
const GENERIC: MedicationApiErrorCode = "generic";
const MAX_DOSE_LENGTH = 200;

// Database error codes raised by add_medication_from_registry (see its function comment in
// supabase/migrations/20260930120000_medication_write_and_interactions.sql). Anything else is `generic`.
const DB_ERROR_CODES: Record<string, MedicationApiErrorCode> = {
  P0002: "invalidProduct",
};

// Every issue message is a MedicationApiErrorCode; the error redirect checks it against the copy before use.
const registrySchema = z.object({
  source: z.literal("registry"),
  registryProductId: z.uuid({ error: "invalidProduct" satisfies MedicationApiErrorCode }),
  doseText: z
    .string({ error: "doseRequired" satisfies MedicationApiErrorCode })
    .trim()
    .min(1, "doseRequired" satisfies MedicationApiErrorCode)
    .max(MAX_DOSE_LENGTH, "doseTooLong" satisfies MedicationApiErrorCode),
  // Compared as ISO strings: `YYYY-MM-DD` orders lexically. "Today" is Polish time, not the Worker's UTC.
  startedOn: z.iso
    .date({ error: "invalidDate" satisfies MedicationApiErrorCode })
    .refine((date) => date <= todayInWarsaw(), "futureDate" satisfies MedicationApiErrorCode),
});

// The leaflet variant joins in phase 4.
const medicationSchema = z.discriminatedUnion("source", [registrySchema]);

function toErrorCode(message: string | undefined): MedicationApiErrorCode {
  return message && Object.hasOwn(MEDICATION_COPY.apiErrors, message) ? (message as MedicationApiErrorCode) : GENERIC;
}

function formText(form: FormData, name: string): string | undefined {
  const value = form.get(name);
  return typeof value === "string" ? value : undefined;
}

// Back to the step the form was sent from: the chosen name and variant stay, the typed dose does not
// (health data does not travel in URLs).
function errorRedirect(code: MedicationApiErrorCode, form: FormData): string {
  const params = new URLSearchParams();
  const name = formText(form, "nazwa")?.trim();
  if (name) params.set("nazwa", name);
  const variant = formText(form, "registryProductId");
  if (variant && z.uuid().safeParse(variant).success) params.set("wariant", variant);
  params.set("error", code);
  return `${ADD_PATH}?${params.toString()}`;
}

export const POST: APIRoute = async (context) => {
  // /api/medications is outside PROTECTED_ROUTES, so the route guards itself. The middleware already redirects a
  // session opened from a password reset link away from every other route; the second check keeps that true here
  // even if the allowed paths ever change.
  if (!context.locals.user || context.locals.recoverySession) {
    return new Response(null, { status: 401 });
  }

  const form = await context.request.formData();
  const parsed = medicationSchema.safeParse({
    source: formText(form, "source"),
    registryProductId: formText(form, "registryProductId"),
    doseText: formText(form, "doseText"),
    startedOn: formText(form, "startedOn"),
  });
  if (!parsed.success) {
    return context.redirect(errorRedirect(toErrorCode(parsed.error.issues[0]?.message), form));
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return context.redirect(errorRedirect(GENERIC, form));
  }

  const { registryProductId, doseText, startedOn } = parsed.data;
  // One call saves the medication, its composition and the first dosage period atomically, as the signed-in user.
  const response = await supabase.rpc("add_medication_from_registry", {
    p_registry_product_id: registryProductId,
    p_dose_text: doseText,
    p_started_on: startedOn,
  });
  const { error } = response;
  if (error) {
    // Only the code: the message may carry the product id and the details the dose.
    console.error("Adding a medication from the registry failed", { code: error.code });
    return context.redirect(
      errorRedirect(Object.hasOwn(DB_ERROR_CODES, error.code) ? DB_ERROR_CODES[error.code] : GENERIC, form),
    );
  }

  const medicationId = z.uuid().safeParse(response.data as unknown);
  if (!medicationId.success) {
    console.error("Adding a medication from the registry returned no id");
    return context.redirect(errorRedirect(GENERIC, form));
  }

  return context.redirect(`${LIST_PATH}?dodano=${medicationId.data}`);
};
