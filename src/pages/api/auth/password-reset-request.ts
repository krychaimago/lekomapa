import type { APIRoute } from "astro";
import { z } from "zod";
import { createClient } from "@/lib/supabase";
import type { ApiErrorCode } from "@/lib/copy/password-recovery";

export const prerender = false;

const FORGOT_PASSWORD_PATH = "/auth/forgot-password";
const SENT_PATH = "/auth/forgot-password/sent";

function errorRedirect(code: ApiErrorCode): string {
  return `${FORGOT_PASSWORD_PATH}?error=${code}`;
}

const requestSchema = z.object({
  email: z.string().trim().min(1).pipe(z.email()),
});

export const POST: APIRoute = async (context) => {
  const form = await context.request.formData();
  const parsed = requestSchema.safeParse({ email: form.get("email") });
  if (!parsed.success) {
    return context.redirect(errorRedirect("invalidEmail"));
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return context.redirect(errorRedirect("notConfigured"));
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
