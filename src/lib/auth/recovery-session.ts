import type { JwtPayload } from "@supabase/supabase-js";

// Screen where a session opened from a password reset link sets the new password.
export const RESET_PASSWORD_PATH = "/auth/reset-password";

// Where a missing, used or expired reset link (or a lost recovery session) ends up.
export const RECOVERY_EXPIRED_PATH = "/auth/reset-password/confirm?expired=1";

// The only paths a session opened from a password reset link may reach.
// Everything else (the app interior with health data in particular) redirects to RESET_PASSWORD_PATH.
export const RECOVERY_ALLOWED_PATHS: readonly string[] = [
  RESET_PASSWORD_PATH,
  "/api/auth/password-update",
  "/api/auth/signout",
];

// Authentication methods (`amr` claim) that ordinary sign-in flows of this app produce.
// Measured locally: signup and signInWithPassword give `password`; verifyOtp with a
// recovery token_hash gives `otp`.
// Every new sign-in method (magic link, OAuth, ...) MUST be added here, otherwise its
// sessions are treated as recovery sessions and the user is locked on the new password screen.
const NORMAL_SESSION_METHODS: ReadonlySet<string> = new Set(["password"]);

function methodName(entry: unknown): string | undefined {
  if (typeof entry === "string") return entry;
  if (entry && typeof entry === "object" && "method" in entry && typeof entry.method === "string") {
    return entry.method;
  }
  return undefined;
}

// A session counts as a recovery session when its signed `amr` claim holds any method outside
// NORMAL_SESSION_METHODS. Fails closed: missing claims or a missing/empty/unreadable `amr`
// also count as recovery, so an unknown session never opens the interior.
export function isRecoverySession(claims: JwtPayload | null | undefined): boolean {
  const amr: unknown = claims?.amr;
  if (!Array.isArray(amr) || amr.length === 0) return true;
  return amr.some((entry) => {
    const method = methodName(entry);
    return method === undefined || !NORMAL_SESSION_METHODS.has(method);
  });
}

// Astro dev also serves a page under "<path>.html" and may keep a trailing slash; normalize both.
function normalizePath(path: string): string {
  const withoutHtml = path.endsWith(".html") ? path.slice(0, -".html".length) : path;
  return withoutHtml.length > 1 && withoutHtml.endsWith("/") ? withoutHtml.slice(0, -1) : withoutHtml;
}

export function isRecoveryAllowedPath(path: string): boolean {
  return RECOVERY_ALLOWED_PATHS.includes(normalizePath(path));
}

export function isResetPasswordPath(path: string): boolean {
  return normalizePath(path) === RESET_PASSWORD_PATH;
}
