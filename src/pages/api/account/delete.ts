import type { APIContext, APIRoute } from "astro";
import { parseCookieHeader } from "@supabase/ssr";
import { z } from "zod";
import type { AccountApiErrorCode } from "@/lib/copy/account";
import { clearMedicationDrafts } from "@/lib/medication-draft";
import { createClient } from "@/lib/supabase";
import { reportError } from "@/lib/observability/report";

export const prerender = false;

const GENERIC: AccountApiErrorCode = "deleteGeneric";

// Database error codes raised by delete_own_account (see its function comment in
// supabase/migrations/20261010120000_delete_own_account.sql). 28000: no session; AD001: no fresh password sign-in in
// `amr`. Both read as an expired session. AD002 (no row deleted) and anything else are `deleteGeneric`.
const DB_ERROR_CODES: Record<string, AccountApiErrorCode> = {
  "28000": "sessionExpired",
  AD001: "sessionExpired",
};

const RATE_LIMIT_CODES = new Set(["over_request_rate_limit"]);

const FormSchema = z.object({ password: z.string().min(1) });

// Only the error key travels back: never the password nor the address.
function errorLocation(code: AccountApiErrorCode): string {
  return `/konto/usun?${new URLSearchParams({ error: code }).toString()}`;
}

// No-store on every answer: a redirect decided by the session must not be kept by a cache.
function redirect(location: string): Response {
  return new Response(null, { status: 303, headers: { Location: location, "Cache-Control": "private, no-store" } });
}

function signInErrorKey(code: string | undefined, status: number | undefined): AccountApiErrorCode {
  if (code === "invalid_credentials") return "wrongPassword";
  if (status === 429 || (code !== undefined && RATE_LIMIT_CODES.has(code))) return "rateLimit";
  return GENERIC;
}

// The session cookies are `sb-<project>-auth-token`, split into `.0`, `.1`… when long. Names come from the request
// (the old session) and from what this response already sets (the session opened by signInWithPassword).
function sessionCookieNames(context: APIContext): Set<string> {
  const names = new Set<string>();
  for (const { name } of parseCookieHeader(context.request.headers.get("Cookie") ?? "")) {
    if (name.startsWith("sb-")) names.add(name);
  }
  for (const header of context.cookies.headers()) {
    const name = header.slice(0, header.indexOf("="));
    if (name.startsWith("sb-")) names.add(name);
  }
  return names;
}

// Deletes the signed-in account with all its data (S-09). A plain form POST from /konto/usun (Astro's checkOrigin
// applies). Order: a fresh password sign-in for the current account, then delete_own_account on the same client
// (it now carries the fresh session whose `amr` the function demands), then the session cookies are cleared.
export const POST: APIRoute = async (context) => {
  // /api/account is outside PROTECTED_ROUTES, so the route guards itself, the same way as the journal routes. A
  // session from a reset link never reaches this point (middleware), checked here as well.
  const user = context.locals.user;
  if (!user || context.locals.recoverySession) {
    return new Response(null, { status: 401, headers: { "Cache-Control": "private, no-store" } });
  }

  let form: FormData;
  try {
    form = await context.request.formData();
  } catch {
    return redirect(errorLocation(GENERIC));
  }
  // The browser's `required` stops an empty field; one that gets through reads as a wrong password.
  const parsed = FormSchema.safeParse({ password: form.get("password") });
  if (!parsed.success) {
    return redirect(errorLocation("wrongPassword"));
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase || !user.email) {
    return redirect(errorLocation(GENERIC));
  }

  // Supabase counts the attempts and applies its own rate limit. A wrong password leaves the current session as is.
  const signIn = await supabase.auth.signInWithPassword({ email: user.email, password: parsed.data.password });
  if (signIn.error) {
    // Only code and status: never the password nor the address.
    reportError("account.delete-password-check", {
      code: signIn.error.code,
      status: signIn.error.status,
      route: context.routePattern,
    });
    return redirect(errorLocation(signInErrorKey(signIn.error.code, signIn.error.status)));
  }
  if (signIn.data.user.id !== user.id) {
    reportError("account.delete-user-mismatch", { code: "user_mismatch", route: context.routePattern });
    return redirect(errorLocation(GENERIC));
  }

  // One call deletes the auth.users row; the existing cascade removes every row of the account.
  const { error } = await supabase.rpc("delete_own_account");
  if (error) {
    reportError("account.delete", { code: error.code, route: context.routePattern });
    return redirect(errorLocation(Object.hasOwn(DB_ERROR_CODES, error.code) ? DB_ERROR_CODES[error.code] : GENERIC));
  }

  // The account is gone, so signOut may fail; its result is logged (code and status only) and the session cookies are
  // deleted regardless.
  try {
    const { error: signOutError } = await supabase.auth.signOut();
    if (signOutError) {
      reportError("account.delete-sign-out", {
        code: signOutError.code,
        status: signOutError.status,
        route: context.routePattern,
      });
    }
  } catch (thrown) {
    reportError("account.delete-sign-out-threw", { error: thrown, route: context.routePattern });
  }
  for (const name of sessionCookieNames(context)) {
    context.cookies.delete(name, { path: "/" });
  }
  clearMedicationDrafts(context.cookies);

  return redirect("/auth/konto-usuniete");
};
