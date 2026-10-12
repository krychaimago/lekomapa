import type { APIRoute } from "astro";
import { clearMedicationDrafts } from "@/lib/medication-draft";
import { createClient } from "@/lib/supabase";

export const prerender = false;

export const POST: APIRoute = async (context) => {
  const supabase = createClient(context.request.headers, context.cookies);
  if (supabase) {
    await supabase.auth.signOut();
  }
  // Typed medication text must not outlive the session in this browser.
  clearMedicationDrafts(context.cookies);
  return context.redirect("/");
};
