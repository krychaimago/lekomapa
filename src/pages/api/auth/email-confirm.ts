import type { APIRoute } from "astro";
import { z } from "zod";
import { createClient } from "@/lib/supabase";

export const prerender = false;

const CONFIRMED_PATH = "/auth/confirm?confirmed=1";
const EXPIRED_PATH = "/auth/confirm?expired=1";

const confirmSchema = z.object({
  token_hash: z.string().min(1),
  type: z.literal("email"),
});

// Consumes the one-time token only on an explicit POST, never when the link is merely opened
// (mail scanners prefetch GET links).
export const POST: APIRoute = async (context) => {
  const form = await context.request.formData();
  const parsed = confirmSchema.safeParse({
    token_hash: form.get("token_hash"),
    type: form.get("type"),
  });
  if (!parsed.success) {
    return context.redirect(EXPIRED_PATH);
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return context.redirect(EXPIRED_PATH);
  }

  const { error } = await supabase.auth.verifyOtp({ type: "email", token_hash: parsed.data.token_hash });
  if (error) {
    return context.redirect(EXPIRED_PATH);
  }

  // verifyOtp leaves a session whose amr is `otp`, which the app treats as a password-reset session
  // (src/lib/auth/recovery-session.ts). Sign it out and let the person sign in with the password instead of
  // adding `otp` to NORMAL_SESSION_METHODS, which would open the interior to reset-link sessions too.
  await supabase.auth.signOut();
  return context.redirect(CONFIRMED_PATH);
};
