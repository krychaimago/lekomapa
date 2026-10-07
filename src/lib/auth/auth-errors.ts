// Maps Supabase auth error codes to the fixed codes the sign-in and sign-up routes put in the URL (S-01, decision
// #34). The page shows only the text AUTH_COPY.errors holds for the code, so no Supabase message reaches the screen.

import type { AuthErrorCode } from "../copy/auth.ts";

const RATE_LIMIT_CODES = new Set(["over_email_send_rate_limit", "over_request_rate_limit"]);

// null = treat as success. An existing address must end on the same "check your inbox" screen as a new one:
// production already answers it with a fake success, local Supabase returns user_already_exists.
export function signUpErrorCode(supabaseCode: string | undefined): AuthErrorCode | null {
  if (supabaseCode === "user_already_exists") return null;
  if (supabaseCode === "weak_password") return "weak_password";
  if (supabaseCode !== undefined && RATE_LIMIT_CODES.has(supabaseCode)) return "rate_limit";
  return "unknown";
}

// A wrong password and a missing account share one code, so the form never reveals whether an account exists.
export function signInErrorCode(supabaseCode: string | undefined): AuthErrorCode {
  return supabaseCode === "email_not_confirmed" ? "unconfirmed" : "credentials";
}
