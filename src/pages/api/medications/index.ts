import type { APIRoute, AstroCookies } from "astro";
import { z } from "zod";
import { createClient } from "@/lib/supabase";
import { MEDICATION_COPY, type MedicationApiErrorCode } from "@/lib/copy/medications";
import { clearMedicationDrafts, writeLeafletDraft } from "@/lib/medication-draft";
import { todayInWarsaw } from "@/lib/services/medications";

export const prerender = false;

const ADD_PATH = "/leki/nowy";
const LEAFLET_PATH = "/leki/nowy/z-ulotki";
const LIST_PATH = "/leki";
const GENERIC: MedicationApiErrorCode = "generic";
const MAX_TEXT_LENGTH = 200;

// Database error codes raised by add_medication_from_registry (see its function comment in
// supabase/migrations/20260930120000_medication_write_and_interactions.sql). Anything else is `generic`.
const DB_ERROR_CODES: Record<string, MedicationApiErrorCode> = {
  P0002: "invalidProduct",
};

// add_medication_from_leaflet raises P0002 when a substance sent as verified has no coded dictionary entry.
const LEAFLET_NO_MATCH = "P0002";

const doseText = z
  .string({ error: "doseRequired" satisfies MedicationApiErrorCode })
  .trim()
  .min(1, "doseRequired" satisfies MedicationApiErrorCode)
  .max(MAX_TEXT_LENGTH, "doseTooLong" satisfies MedicationApiErrorCode);

// Compared as ISO strings: `YYYY-MM-DD` orders lexically. "Today" is Polish time, not the Worker's UTC.
const startedOn = z.iso
  .date({ error: "invalidDate" satisfies MedicationApiErrorCode })
  .refine((date) => date <= todayInWarsaw(), "futureDate" satisfies MedicationApiErrorCode);

// Every issue message is a MedicationApiErrorCode; the error redirect checks it against the copy before use.
const registrySchema = z.object({
  source: z.literal("registry"),
  registryProductId: z.uuid({ error: "invalidProduct" satisfies MedicationApiErrorCode }),
  doseText,
  startedOn,
});

const leafletSchema = z.object({
  source: z.literal("leaflet"),
  productName: z
    .string({ error: "productNameRequired" satisfies MedicationApiErrorCode })
    .trim()
    .min(1, "productNameRequired" satisfies MedicationApiErrorCode)
    .max(MAX_TEXT_LENGTH, "productNameTooLong" satisfies MedicationApiErrorCode),
  // Trimmed here, so the btrim() inside add_medication_from_leaflet has nothing left to remove and the route and
  // the function compare the same text.
  substanceName: z
    .string({ error: "substanceRequired" satisfies MedicationApiErrorCode })
    .trim()
    .min(1, "substanceRequired" satisfies MedicationApiErrorCode)
    .max(MAX_TEXT_LENGTH, "substanceTooLong" satisfies MedicationApiErrorCode),
  // A native checkbox: sent as "1" when ticked, absent otherwise. Any other value is a crafted request.
  confirmUnverified: z.literal("1").optional(),
  doseText,
  startedOn,
});

const medicationSchema = z.discriminatedUnion("source", [registrySchema, leafletSchema]);

function toErrorCode(message: string | undefined): MedicationApiErrorCode {
  return message && Object.hasOwn(MEDICATION_COPY.apiErrors, message) ? (message as MedicationApiErrorCode) : GENERIC;
}

function formText(form: FormData, name: string): string | undefined {
  const value = form.get(name);
  return typeof value === "string" ? value : undefined;
}

// Where a failed leaflet save keeps the typed fields: the cookies of this response, for this account.
interface DraftTarget {
  cookies: AstroCookies;
  userId: string;
  secure: boolean;
}

// The typed product name, substance and date of the leaflet form; trimming, the length cap and the date check live in
// medication-draft.ts. The dose is not passed, so it cannot reach the cookie.
function saveLeafletDraft(form: FormData, draft: DraftTarget, unmatched: boolean): void {
  writeLeafletDraft(
    draft.cookies,
    {
      userId: draft.userId,
      productName: formText(form, "productName"),
      substanceName: formText(form, "substanceName"),
      startedOn: formText(form, "startedOn"),
      unmatched,
    },
    draft.secure,
  );
}

// Back to the step the form was sent from. Only the error code travels in the address (lesson "Żadna nazwa leku ani
// dawka w adresie URL"). Registry: the chosen variant's id, never the name (the page reads the name back from the id).
// Leaflet: the typed name, substance and date go into the leaflet draft, a short-lived HttpOnly cookie of this account.
// The typed dose goes nowhere: neither the address nor the draft.
function errorRedirect(code: MedicationApiErrorCode, form: FormData, draft: DraftTarget): string {
  if (formText(form, "source") === "leaflet") {
    saveLeafletDraft(form, draft, false);
    return `${LEAFLET_PATH}?${new URLSearchParams({ error: code }).toString()}`;
  }
  const params = new URLSearchParams();
  const variant = formText(form, "registryProductId");
  if (variant && z.uuid().safeParse(variant).success) params.set("wariant", variant);
  params.set("error", code);
  return `${ADD_PATH}?${params.toString()}`;
}

// The "no match" state of the leaflet form: the page lists similar dictionary names and the "save without
// checking" checkbox. Saving without a code happens only after that checkbox is ticked. The typed substance is kept
// in the leaflet draft with `unmatched: true`; the address carries nothing.
function noMatchRedirect(form: FormData, draft: DraftTarget): string {
  saveLeafletDraft(form, draft, true);
  return LEAFLET_PATH;
}

// 302 as before (smoke expects it), with no-store like the other redirecting routes: the answer carries Set-Cookie
// (the drafts) and must not be kept by a cache.
function redirect(location: string): Response {
  return new Response(null, { status: 302, headers: { Location: location, "Cache-Control": "private, no-store" } });
}

export const POST: APIRoute = async (context) => {
  // /api/medications is outside PROTECTED_ROUTES, so the route guards itself. The middleware already redirects a
  // session opened from a password reset link away from every other route; the second check keeps that true here
  // even if the allowed paths ever change.
  const user = context.locals.user;
  if (!user || context.locals.recoverySession) {
    return new Response(null, { status: 401 });
  }
  const draft: DraftTarget = {
    cookies: context.cookies,
    userId: user.id,
    secure: context.url.protocol === "https:",
  };

  const form = await context.request.formData();
  const parsed = medicationSchema.safeParse({
    source: formText(form, "source"),
    registryProductId: formText(form, "registryProductId"),
    productName: formText(form, "productName"),
    substanceName: formText(form, "substanceName"),
    confirmUnverified: formText(form, "confirmUnverified"),
    doseText: formText(form, "doseText"),
    startedOn: formText(form, "startedOn"),
  });
  if (!parsed.success) {
    return redirect(errorRedirect(toErrorCode(parsed.error.issues[0]?.message), form, draft));
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return redirect(errorRedirect(GENERIC, form, draft));
  }

  const command = parsed.data;
  let response;
  if (command.source === "registry") {
    // One call saves the medication, its composition and the first dosage period atomically, as the signed-in user.
    response = await supabase.rpc("add_medication_from_registry", {
      p_registry_product_id: command.registryProductId,
      p_dose_text: command.doseText,
      p_started_on: command.startedOn,
    });
  } else {
    // Same rule as add_medication_from_leaflet: lower(btrim(name)) = normalized_name, only rows with a code.
    // Postgres lower() and toLowerCase() agree on the dictionary's Latin and Polish letters; should they ever
    // disagree, the function's P0002 below sends the user to the same "no match" state.
    const match = await supabase
      .from("registry_substances")
      .select("normalized_name")
      .eq("normalized_name", command.substanceName.toLowerCase())
      .not("atc_code", "is", null)
      .limit(1);
    if (match.error) {
      console.error("Matching a leaflet substance failed", { code: match.error.code });
      return redirect(errorRedirect(GENERIC, form, draft));
    }
    const verified = match.data.length > 0;
    if (!verified && command.confirmUnverified !== "1") {
      return redirect(noMatchRedirect(form, draft));
    }
    response = await supabase.rpc("add_medication_from_leaflet", {
      p_product_name: command.productName,
      p_substance_name: command.substanceName,
      p_verified: verified,
      p_dose_text: command.doseText,
      p_started_on: command.startedOn,
    });
    if (response.error?.code === LEAFLET_NO_MATCH) {
      return redirect(noMatchRedirect(form, draft));
    }
  }

  const { error } = response;
  if (error) {
    // Only the code: the message may carry the product id or the substance, and the details the dose.
    console.error("Adding a medication failed", { source: command.source, code: error.code });
    return redirect(
      errorRedirect(
        command.source === "registry" && Object.hasOwn(DB_ERROR_CODES, error.code)
          ? DB_ERROR_CODES[error.code]
          : GENERIC,
        form,
        draft,
      ),
    );
  }

  const medicationId = z.uuid().safeParse(response.data as unknown);
  if (!medicationId.success) {
    console.error("Adding a medication returned no id", { source: command.source });
    return redirect(errorRedirect(GENERIC, form, draft));
  }

  // The medication is saved: the search text and the leaflet draft have done their job.
  clearMedicationDrafts(context.cookies);
  return redirect(`${LIST_PATH}?dodano=${medicationId.data}`);
};
