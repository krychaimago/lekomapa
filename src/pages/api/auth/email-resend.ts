import type { APIRoute } from "astro";
import { z } from "zod";
import { createClient } from "@/lib/supabase";
import { isAuthRetryableFetchError } from "@supabase/supabase-js";
import { reportError } from "@/lib/observability/report";

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
  // A rate limit or an invalid address (4xx) is ordinary traffic and is not reported. Never log the address.
  if (error && (isAuthRetryableFetchError(error) || (error.status ?? 0) >= 500)) {
    reportError("auth.email-resend", { code: error.code, status: error.status, route: context.routePattern });
  }

  return context.redirect(CHECK_INBOX_PATH);
};
