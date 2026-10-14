import type { APIRoute } from "astro";
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_KEY } from "astro:env/server";

export const prerender = false;

const HEADERS = { "content-type": "application/json", "cache-control": "no-store" };
// Shorter than the monitor's 5 s, so a hung database gives a clear 503 instead of a timeout.
const DATABASE_TIMEOUT_MS = 3000;

function answer(status: 200 | 503): Response {
  return new Response(JSON.stringify({ status: status === 200 ? "ok" : "unavailable" }), { status, headers: HEADERS });
}

// Target of the uptime monitor and the traffic that keeps Supabase from pausing. Public, no session: the client reads
// no cookies, and public.health_ping() returns a constant without reading any table, so the answer carries no data.
// A failure is not reported through reportError: the monitor already alarms on the 503, and a second mail about the
// same outage would be noise (the middleware skips the 5xx report for this route too). Every failure, a throw
// included, ends as 503, never 500, so the monitor sees one state for "the database does not answer".
export const GET: APIRoute = async () => {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return answer(503);
  }
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    // Untyped client, so `data` is unknown here; only the exact constant counts as an answer from the database.
    const response: { data: unknown; error: unknown } = await supabase
      .rpc("health_ping")
      .abortSignal(AbortSignal.timeout(DATABASE_TIMEOUT_MS));
    return answer(!response.error && response.data === 1 ? 200 : 503);
  } catch {
    return answer(503);
  }
};
