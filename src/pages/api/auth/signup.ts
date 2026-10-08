import type { APIRoute } from "astro";
import { z } from "zod";
import { createClient } from "@/lib/supabase";
import { signUpErrorCode } from "@/lib/auth/auth-errors";
import type { AuthErrorCode } from "@/lib/copy/auth";
import { MIN_PASSWORD_LENGTH } from "@/lib/copy/password-recovery";
import { CURRENT_TERMS_VERSION } from "@/lib/copy/terms";

export const prerender = false;

const CHECK_INBOX_PATH = "/auth/confirm-email";

// Every issue message is an AuthErrorCode; the sign-up page looks the text up in AUTH_COPY.errors.
const signUpSchema = z
  .object({
    email: z.email({ error: "invalid" satisfies AuthErrorCode }),
    password: z
      .string({ error: "invalid" satisfies AuthErrorCode })
      .min(MIN_PASSWORD_LENGTH, "weak_password" satisfies AuthErrorCode),
    confirmPassword: z.string({ error: "password_mismatch" satisfies AuthErrorCode }),
    // A native checkbox: sent as "accepted" when ticked, absent otherwise. Any other value is a crafted request.
    terms: z.literal("accepted", { error: "terms" satisfies AuthErrorCode }),
  })
  .refine((form) => form.password === form.confirmPassword, {
    error: "password_mismatch" satisfies AuthErrorCode,
    path: ["confirmPassword"],
  });

const errorRedirect = (code: AuthErrorCode) => `/auth/signup?error=${code}`;

export const POST: APIRoute = async (context) => {
  const form = await context.request.formData();
  const parsed = signUpSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) {
    // The missing terms box wins over other issues: it is the one the person cannot guess from the fields.
    const codes = parsed.error.issues.map((issue) => issue.message as AuthErrorCode);
    return context.redirect(errorRedirect(codes.includes("terms") ? "terms" : codes[0]));
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return context.redirect(errorRedirect("unknown"));
  }

  // The version travels in the account metadata: the database writes the acceptance row when the account is
  // created (trigger on auth.users), because with e-mail confirmation on, sign-up returns no session to write with.
  const { email, password } = parsed.data;
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { terms_version: CURRENT_TERMS_VERSION },
      // The confirmation mail links here (supabase/templates/confirmation.html); the page consumes the token on POST.
      emailRedirectTo: `${context.url.origin}/auth/confirm`,
    },
  });

  if (error) {
    const code = signUpErrorCode(error.code);
    if (code) return context.redirect(errorRedirect(code));
  }

  return context.redirect(CHECK_INBOX_PATH);
};
