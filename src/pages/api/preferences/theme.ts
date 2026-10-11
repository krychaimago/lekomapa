import type { APIRoute } from "astro";
import { z } from "zod";
import { THEME_COOKIE, THEME_COOKIE_OPTIONS, THEME_PREFERENCES, safeReturnPath } from "@/lib/theme";

export const prerender = false;

const themeSchema = z.enum(THEME_PREFERENCES);

// Saves the color mode chosen in the header icon or on Konto and returns to the screen the form came from.
// No login required and no Supabase call; the terms gate in middleware applies as on every /api/* route.
// An invalid theme leaves the cookie untouched; the redirect happens either way.
export const POST: APIRoute = async (context) => {
  // A body that is not a form counts as an invalid choice: no cookie change, plain redirect.
  const form = await context.request.formData().catch(() => null);

  const theme = themeSchema.safeParse(form?.get("theme"));
  if (theme.success) {
    context.cookies.set(THEME_COOKIE, theme.data, {
      ...THEME_COOKIE_OPTIONS,
      secure: context.url.protocol === "https:",
    });
  }

  // No-store like the other redirecting routes: the answer carries Set-Cookie and must not be kept by a cache.
  return new Response(null, {
    status: 303,
    headers: { Location: safeReturnPath(form?.get("returnTo")), "Cache-Control": "private, no-store" },
  });
};
