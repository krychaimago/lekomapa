import type { APIRoute } from "astro";
import { z } from "zod";
import { createClient } from "@/lib/supabase";

export const prerender = false;

const CHECK_INBOX_PATH = "/auth/confirm-email";

const resendSchema = z.object({
  email: z.string().trim().min(1).pipe(z.email()),
});

// New confirmation link from the expired-link screen. Every outcome, an invalid address included, ends on the
// same "check your inbox" screen, so the response never reveals whether an account exists or is confirmed.
export const POST: APIRoute = async (context) => {
  const form = await context.request.formData();
  const parsed = resendSchema.safeParse({ email: form.get("email") });
  const supabase = createClient(context.request.headers, context.cookies);
  if (!parsed.success || !supabase) {
    return context.redirect(CHECK_INBOX_PATH);
  }

  const { error } = await supabase.auth.resend({
    type: "signup",
    email: parsed.data.email,
    options: { emailRedirectTo: `${context.url.origin}/auth/confirm` },
  });
  if (error) {
    // Never log the address.
    console.error("Confirmation resend failed", { code: error.code, status: error.status });
  }

  return context.redirect(CHECK_INBOX_PATH);
};
