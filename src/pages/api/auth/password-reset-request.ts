import type { APIRoute } from "astro";
import { z } from "zod";
import { createClient } from "@/lib/supabase";

export const prerender = false;

const FORGOT_PASSWORD_PATH = "/auth/forgot-password";
const SENT_PATH = "/auth/forgot-password/sent";

// User-visible messages (Polish). Phase 2 moves them to a shared copy module.
const MESSAGES = {
  invalidEmail: "Wpisz poprawny adres e-mail.",
  notConfigured: "Usługa logowania jest chwilowo niedostępna. Spróbuj ponownie później.",
} as const;

const requestSchema = z.object({
  email: z.string().trim().min(1).pipe(z.email()),
});

export const POST: APIRoute = async (context) => {
  const form = await context.request.formData();
  const parsed = requestSchema.safeParse({ email: form.get("email") });
  if (!parsed.success) {
    return context.redirect(`${FORGOT_PASSWORD_PATH}?error=${encodeURIComponent(MESSAGES.invalidEmail)}`);
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return context.redirect(`${FORGOT_PASSWORD_PATH}?error=${encodeURIComponent(MESSAGES.notConfigured)}`);
  }

  // Every outcome ends on the same screen, so the response never reveals whether an account exists.
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${context.url.origin}/auth/reset-password/confirm`,
  });
  if (error) {
    // Never log the address.
    console.error("Password reset request failed", { code: error.code, status: error.status });
  }

  return context.redirect(SENT_PATH);
};
