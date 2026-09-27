import type { APIRoute } from "astro";
import { z } from "zod";
import { createClient } from "@/lib/supabase";
import { RESET_PASSWORD_PATH, isRecoverySession } from "@/lib/auth/recovery-session";

export const prerender = false;

const EXPIRED_PATH = "/auth/reset-password/confirm?expired=1";
const DONE_PATH = "/auth/signin?reset=done";

// User-visible messages (Polish). Phase 2 moves them to a shared copy module.
// Never show a raw Supabase error.message to the user.
const MESSAGES = {
  tooShort: "Hasło musi mieć co najmniej 6 znaków.",
  mismatch: "Hasła nie są takie same.",
  samePassword: "Nowe hasło musi się różnić od poprzedniego.",
  weakPassword: "To hasło jest zbyt słabe. Wybierz inne.",
  generic: "Nie udało się zapisać nowego hasła. Spróbuj ponownie.",
} as const;

const UPDATE_ERROR_MESSAGES: Record<string, string> = {
  same_password: MESSAGES.samePassword,
  weak_password: MESSAGES.weakPassword,
};

const updateSchema = z
  .object({
    password: z.string().min(6, MESSAGES.tooShort),
    password_confirm: z.string(),
  })
  .refine((data) => data.password === data.password_confirm, {
    message: MESSAGES.mismatch,
    path: ["password_confirm"],
  });

function errorRedirect(message: string): string {
  return `${RESET_PASSWORD_PATH}?error=${encodeURIComponent(message)}`;
}

export const POST: APIRoute = async (context) => {
  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return context.redirect(EXPIRED_PATH);
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return context.redirect(EXPIRED_PATH);
  }

  // Only a session opened from a reset link may set a password here.
  const { data: claimsData } = await supabase.auth.getClaims();
  if (!isRecoverySession(claimsData?.claims)) {
    return context.redirect(EXPIRED_PATH);
  }

  const form = await context.request.formData();
  const parsed = updateSchema.safeParse({
    password: form.get("password"),
    password_confirm: form.get("password_confirm"),
  });
  if (!parsed.success) {
    return context.redirect(errorRedirect(parsed.error.issues[0]?.message ?? MESSAGES.generic));
  }

  // Order matters: update the password first, sign out everywhere only after it succeeded.
  // The reverse would leave the account on the old password with no session to retry from.
  const { error: updateError } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (updateError) {
    const message = (updateError.code ? UPDATE_ERROR_MESSAGES[updateError.code] : undefined) ?? MESSAGES.generic;
    return context.redirect(errorRedirect(message));
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
