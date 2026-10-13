import type { APIRoute } from "astro";
import { z } from "zod";
import { createClient } from "@/lib/supabase";
import { reportError } from "@/lib/observability/report";
import { MEDICATION_COPY, type MedicationApiErrorCode } from "@/lib/copy/medications";
import { todayInWarsaw } from "@/lib/services/medications";

export const prerender = false;

const GENERIC: MedicationApiErrorCode = "discontinuationGeneric";

// Database error codes raised by discontinue_medication (see its function comment in
// supabase/migrations/20261006120000_discontinue_medication.sql). Anything else, 28000 included, is
// `discontinuationGeneric`: the session is checked below before the call.
const DB_ERROR_CODES: Record<string, MedicationApiErrorCode> = {
  MD001: "medicationNotFound",
  MD002: "alreadyDiscontinued",
  MD003: "discontinuedOnInFuture",
  MD004: "discontinuedOnTooOld",
  MD005: "discontinuedOnTooEarly",
  MD006: "discontinuationNoCurrentPeriod",
};

// Every issue message is a MedicationApiErrorCode; the error redirect checks it against the copy before use. The
// database decides every rule about the history (14 days back, the start of the ongoing period); zod checks the shape.
const discontinuationSchema = z.object({
  // Compared as ISO strings: `YYYY-MM-DD` orders lexically. "Today" is Polish time, not the Worker's UTC.
  discontinuedOn: z.iso
    .date({ error: "invalidDiscontinuedOn" satisfies MedicationApiErrorCode })
    .refine((date) => date <= todayInWarsaw(), "discontinuedOnInFuture" satisfies MedicationApiErrorCode),
});

function toErrorCode(message: string | undefined): MedicationApiErrorCode {
  return message && Object.hasOwn(MEDICATION_COPY.apiErrors, message) ? (message as MedicationApiErrorCode) : GENERIC;
}

function formText(form: FormData, name: string): string | undefined {
  const value = form.get(name);
  return typeof value === "string" ? value : undefined;
}

// Only the error key travels back: never the date and never the medication's name (health data does not go into
// URLs). `medicationId` is a validated uuid.
function errorRedirect(medicationId: string, code: MedicationApiErrorCode): string {
  return `/leki/${medicationId}/zakonczenie?${new URLSearchParams({ error: code }).toString()}`;
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

  const form = await context.request.formData();
  const parsed = discontinuationSchema.safeParse({ discontinuedOn: formText(form, "discontinuedOn") });
  if (!parsed.success) {
    return context.redirect(errorRedirect(medicationId, toErrorCode(parsed.error.issues[0]?.message)));
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return context.redirect(errorRedirect(medicationId, GENERIC));
  }

  // One call sets the end date and closes the ongoing period (trigger medications_sync_discontinuation), as the
  // signed-in user (RLS and the history guards apply).
  const { error } = await supabase.rpc("discontinue_medication", {
    p_medication_id: medicationId,
    p_discontinued_on: parsed.data.discontinuedOn,
  });

  if (error) {
    // Only the code: the details may carry the date.
    reportError("discontinuation.save", { code: error.code, route: context.routePattern });
    return context.redirect(
      errorRedirect(medicationId, Object.hasOwn(DB_ERROR_CODES, error.code) ? DB_ERROR_CODES[error.code] : GENERIC),
    );
  }

  return context.redirect(`/leki/${medicationId}?zakonczenie=zapisane`);
};
