import type { APIRoute } from "astro";
import { TERMS_ACCEPTANCE_PATH } from "@/lib/auth/terms-gate";
import { CURRENT_TERMS_VERSION } from "@/lib/copy/terms";
import { createClient } from "@/lib/supabase";

export const prerender = false;

// Accepting the current terms from the acceptance screen. The version always comes from CURRENT_TERMS_VERSION, never
// from the form, and the insert runs with the account's own session (RLS); accepted_at is set by the database.
export const POST: APIRoute = async (context) => {
  const user = context.locals.user;
  const supabase = createClient(context.request.headers, context.cookies);
  if (!user || context.locals.recoverySession || !supabase) {
    return new Response(null, { status: 401 });
  }

  const { error } = await supabase
    .from("terms_acceptances")
    .insert({ user_id: user.id, version: CURRENT_TERMS_VERSION });

  // 23505: this version is already accepted (double click, a second tab) — the outcome the person wanted.
  if (error && error.code !== "23505") {
    console.error("Accepting the terms failed", { code: error.code });
    return context.redirect(`${TERMS_ACCEPTANCE_PATH}?error=unknown`, 303);
  }
  return context.redirect("/", 303);
};
