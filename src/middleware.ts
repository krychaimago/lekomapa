import { defineMiddleware } from "astro:middleware";
import { createClient } from "@/lib/supabase";
import { NAV_ITEMS, matchesNavHref } from "@/lib/navigation";

// Every menu screen is protected automatically; interior routes outside the menu must be listed here.
const PROTECTED_ROUTES = ["/dashboard", ...NAV_ITEMS.map((item) => item.href)];

export const onRequest = defineMiddleware(async (context, next) => {
  const supabase = createClient(context.request.headers, context.cookies);

  if (supabase) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    context.locals.user = user ?? null;
  } else {
    context.locals.user = null;
  }

  if (PROTECTED_ROUTES.some((route) => matchesNavHref(context.url.pathname, route))) {
    if (!context.locals.user) {
      return context.redirect("/auth/signin");
    }
  }

  return next();
});
