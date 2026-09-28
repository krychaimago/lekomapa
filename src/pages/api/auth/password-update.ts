import type { APIRoute } from "astro";
import { z } from "zod";
import { createClient } from "@/lib/supabase";
import { RECOVERY_EXPIRED_PATH, RESET_PASSWORD_PATH, isRecoverySession } from "@/lib/auth/recovery-session";
import { MIN_PASSWORD_LENGTH, type ApiErrorCode } from "@/lib/copy/password-recovery";

export const prerender = false;

const DONE_PATH = "/auth/signin?reset=done";

// Errors travel as codes from PASSWORD_RECOVERY_COPY.apiErrors; never a raw Supabase error.message.
const UPDATE_ERROR_CODES: Record<string, ApiErrorCode> = {
  same_password: "samePassword",
  weak_password: "weakPassword",
};

const GENERIC: ApiErrorCode = "generic";

const updateSchema = z
  .object({
    password: z.string({ error: GENERIC }).min(MIN_PASSWORD_LENGTH, "passwordTooShort" satisfies ApiErrorCode),
    password_confirm: z.string({ error: GENERIC }),
  })
  .refine((data) => data.password === data.password_confirm, {
    message: "mismatch" satisfies ApiErrorCode,
    path: ["password_confirm"],
  });

// Zod issue messages are always ApiErrorCode values set in updateSchema above; the page ignores any other.
function errorRedirect(code: string): string {
  return `${RESET_PASSWORD_PATH}?error=${encodeURIComponent(code)}`;
}

export const POST: APIRoute = async (context) => {
  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return context.redirect(RECOVERY_EXPIRED_PATH);
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return context.redirect(RECOVERY_EXPIRED_PATH);
  }

  // Only a session opened from a reset link may set a password here.
  // isRecoverySession fails closed to `true` on missing claims; here that would grant the update,
  // so missing or unreadable claims are rejected before it is asked.
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
  if (claimsError || !claimsData?.claims || !isRecoverySession(claimsData.claims)) {
    return context.redirect(RECOVERY_EXPIRED_PATH);
  }

  const form = await context.request.formData();
  const parsed = updateSchema.safeParse({
    password: form.get("password"),
    password_confirm: form.get("password_confirm"),
  });
  if (!parsed.success) {
    return context.redirect(errorRedirect(parsed.error.issues[0]?.message ?? GENERIC));
  }

  // Order matters: update the password first, sign out everywhere only after it succeeded.
  // The reverse would leave the account on the old password with no session to retry from.
  const { error: updateError } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (updateError) {
    const code = (updateError.code ? UPDATE_ERROR_CODES[updateError.code] : undefined) ?? GENERIC;
    return context.redirect(errorRedirect(code));
  }

  const { error: signOutError } = await supabase.auth.signOut({ scope: "global" });
  if (signOutError) {
    // Password is already changed and the local session is gone; other sessions may survive.
    // Never log the address.
    console.error("Global sign-out after password reset failed", {
      code: signOutError.code,
      status: signOutError.status,
    });
  }

  return context.redirect(DONE_PATH);
};
