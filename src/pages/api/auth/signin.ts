import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { signInErrorCode } from "@/lib/auth/auth-errors";

export const prerender = false;

export const POST: APIRoute = async (context) => {
  const form = await context.request.formData();
  const email = form.get("email");
  const password = form.get("password");
  if (typeof email !== "string" || typeof password !== "string") {
    return context.redirect("/auth/signin?error=credentials");
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return context.redirect("/auth/signin?error=unknown");
  }
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return context.redirect(`/auth/signin?error=${signInErrorCode(error.code)}`);
  }

  return context.redirect("/");
};
