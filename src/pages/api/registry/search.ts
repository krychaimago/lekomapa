import type { APIRoute } from "astro";
import { z } from "zod";
import {
  MAX_SUGGESTIONS,
  SUGGESTION_QUERY_MAX,
  SUGGESTION_QUERY_MIN,
  searchRegistryNames,
} from "@/lib/services/registry-search";
import { createClient } from "@/lib/supabase";

export const prerender = false;

const querySchema = z.string().trim().min(SUGGESTION_QUERY_MIN).max(SUGGESTION_QUERY_MAX);

// The answer depends on the session, so no cache may keep it or hand it to another account.
function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "private, no-store" },
  });
}

// Trade names for the suggestions under the name field on /leki/nowy: `{ names: { name, variants }[] }`, at most
// MAX_SUGGESTIONS, alphabetically. The same search as the page's "Szukaj", so a suggestion leads to a name the page
// can open.
export const GET: APIRoute = async (context) => {
  // /api/registry is outside PROTECTED_ROUTES, so the route guards itself. The middleware already redirects a
  // session opened from a password reset link away from every other route; the second check keeps that true here
  // even if the allowed paths ever change.
  if (!context.locals.user || context.locals.recoverySession) {
    return json({ error: "unauthorized" }, 401);
  }

  const parsed = querySchema.safeParse(context.url.searchParams.get("q") ?? "");
  if (!parsed.success) {
    return json({ error: "invalidQuery" }, 400);
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return json({ error: "unavailable" }, 503);
  }

  const groups = await searchRegistryNames(supabase, parsed.data);
  if (groups === null) {
    return json({ error: "searchFailed" }, 500);
  }

  return json({ names: groups.slice(0, MAX_SUGGESTIONS) }, 200);
};
