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

// The text arrives in a JSON body, never in the URL: a trade name typed by the user is health data.
const bodySchema = z.object({ q: z.string().trim().min(SUGGESTION_QUERY_MIN).max(SUGGESTION_QUERY_MAX) });

// The answer depends on the session, so no cache may keep it or hand it to another account.
function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "private, no-store" },
  });
}

// Trade names for the suggestions under the name field on /leki/nowy: POST `{ q }` as JSON, answer
// `{ names: { name, variants, productId }[] }`, at most MAX_SUGGESTIONS, alphabetically. The same search as the
// page's "Szukaj", so a suggestion's productId opens the same name on /leki/nowy?wariant=. No GET handler.
export const POST: APIRoute = async (context) => {
  // /api/registry is outside PROTECTED_ROUTES, so the route guards itself. The middleware already redirects a
  // session opened from a password reset link away from every other route; the second check keeps that true here
  // even if the allowed paths ever change.
  if (!context.locals.user || context.locals.recoverySession) {
    return json({ error: "unauthorized" }, 401);
  }

  // A body that is not JSON counts as an invalid query.
  const body: unknown = await context.request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return json({ error: "invalidQuery" }, 400);
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return json({ error: "unavailable" }, 503);
  }

  const groups = await searchRegistryNames(supabase, parsed.data.q);
  if (groups === null) {
    return json({ error: "searchFailed" }, 500);
  }

  return json({ names: groups.slice(0, MAX_SUGGESTIONS) }, 200);
};
