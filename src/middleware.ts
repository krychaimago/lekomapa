import { defineMiddleware } from "astro:middleware";
import { createClient } from "@/lib/supabase";
import { INTERIOR_ROUTES, matchesNavHref } from "@/lib/navigation";
import { CURRENT_TERMS_VERSION } from "@/lib/copy/terms";
import { latestAcceptedTermsVersion } from "@/lib/services/terms-acceptance";
import { TERMS_ACCEPTANCE_PATH, isTermsGatedPath, termsGateAction } from "@/lib/auth/terms-gate";
import {
  RECOVERY_EXPIRED_PATH,
  RESET_PASSWORD_PATH,
  isRecoveryAllowedPath,
  isRecoverySession,
  isResetPasswordPath,
} from "@/lib/auth/recovery-session";

// Interior routes (menu screens included) are listed in INTERIOR_ROUTES in src/lib/navigation.ts, which also drives
// the terms gate. Add here only signed-in screens outside the interior, such as terms acceptance.
const PROTECTED_ROUTES = [...INTERIOR_ROUTES, TERMS_ACCEPTANCE_PATH];

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

  // An account without acceptance of the current terms version neither enters the interior nor writes data
  // until it accepts them or signs out. Queried only on gated paths, so entry screens cost nothing extra.
  if (supabase && context.locals.user && !context.locals.recoverySession && isTermsGatedPath(path)) {
    const latest = await latestAcceptedTermsVersion(supabase, context.locals.user.id);
    const action = termsGateAction(path, latest, CURRENT_TERMS_VERSION);
    if (action === "redirect") {
      return context.redirect(TERMS_ACCEPTANCE_PATH);
    }
    if (action === "forbid") {
      return new Response(JSON.stringify({ error: "termsNotAccepted" }), {
        status: 403,
        headers: { "content-type": "application/json" },
      });
    }
  }

  return next();
});
