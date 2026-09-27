import type { APIRoute } from "astro";
import { z } from "zod";
import { createClient } from "@/lib/supabase";
import { RESET_PASSWORD_PATH } from "@/lib/auth/recovery-session";

export const prerender = false;

const EXPIRED_PATH = "/auth/reset-password/confirm?expired=1";

const verifySchema = z.object({
  token_hash: z.string().min(1),
  type: z.literal("recovery"),
});

// Consumes the one-time token only on an explicit POST, never when the link is merely opened
// (mail scanners prefetch GET links).
export const POST: APIRoute = async (context) => {
  const form = await context.request.formData();
  const parsed = verifySchema.safeParse({
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

  const { error } = await supabase.auth.verifyOtp({ type: "recovery", token_hash: parsed.data.token_hash });
  if (error) {
    return context.redirect(EXPIRED_PATH);
  }

  return context.redirect(RESET_PASSWORD_PATH);
};
