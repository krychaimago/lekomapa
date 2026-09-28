import { defineMiddleware } from "astro:middleware";
import { createClient } from "@/lib/supabase";
import { NAV_ITEMS, matchesNavHref } from "@/lib/navigation";
import {
  RECOVERY_EXPIRED_PATH,
  RESET_PASSWORD_PATH,
  isRecoveryAllowedPath,
  isRecoverySession,
  isResetPasswordPath,
} from "@/lib/auth/recovery-session";

// Every menu screen is protected automatically; interior routes outside the menu must be listed here.
const PROTECTED_ROUTES = ["/dashboard", ...NAV_ITEMS.map((item) => item.href)];

export const onRequest = defineMiddleware(async (context, next) => {
  const supabase = createClient(context.request.headers, context.cookies);

  context.locals.user = null;
  context.locals.recoverySession = false;

  if (supabase) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    context.locals.user = user ?? null;

    if (user) {
      // Decided on the signed `amr` claim, never on a cookie the browser could set.
      // An error or a throw fails closed: missing claims count as recovery and lock the interior.
      // Log only code/status/name, never the address or the token.
      try {
        const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
        if (claimsError) {
          console.error("Reading session claims failed", { code: claimsError.code, status: claimsError.status });
        }
        context.locals.recoverySession = isRecoverySession(claimsData?.claims);
      } catch (thrown) {
        console.error("Reading session claims threw", { name: thrown instanceof Error ? thrown.name : typeof thrown });
        context.locals.recoverySession = true;
      }
    }
  }

  const path = context.url.pathname;

  // A session opened from a reset link reaches only the new password screen and its endpoints:
  // a link from an intercepted mail must not open health data.
  if (context.locals.recoverySession && !isRecoveryAllowedPath(path)) {
    return context.redirect(RESET_PASSWORD_PATH);
  }

  if (!context.locals.recoverySession && isResetPasswordPath(path)) {
    return context.redirect(RECOVERY_EXPIRED_PATH);
  }

  if (PROTECTED_ROUTES.some((route) => matchesNavHref(path, route))) {
    if (!context.locals.user) {
      return context.redirect("/auth/signin");
    }
  }

  return next();
});
