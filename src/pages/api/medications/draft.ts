import type { APIRoute } from "astro";
import { z } from "zod";
import {
  LEAFLET_DRAFT_PATH,
  REGISTRY_SEARCH_PATH,
  writeLeafletDraft,
  writeRegistrySearch,
} from "@/lib/medication-draft";

export const prerender = false;

// Text fields are optional strings here; trimming, the length cap and the date check live in medication-draft.ts.
const draftSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("search"), q: z.string().optional() }),
  z.object({
    kind: z.literal("leaflet"),
    productName: z.string().optional(),
    substanceName: z.string().optional(),
    startedOn: z.string().optional(),
  }),
]);

function formText(form: FormData | null, name: string): string | undefined {
  const value = form?.get(name);
  return typeof value === "string" ? value : undefined;
}

function seeOther(location: string): Response {
  // No-store like the other redirecting routes: the answer carries Set-Cookie and must not be kept by a cache.
  return new Response(null, { status: 303, headers: { Location: location, "Cache-Control": "private, no-store" } });
}

// Takes the text typed on /leki/nowy (search) or /leki/nowy/z-ulotki (leaflet fields) in the form body, keeps it in a
// short-lived HttpOnly cookie and returns to the screen's address without any of it (Post/Redirect/Get). The dose is
// never accepted here. An unknown `kind` changes nothing and returns to /leki/nowy.
export const POST: APIRoute = async (context) => {
  // /api/medications is outside PROTECTED_ROUTES, so the route guards itself, as /api/medications does: no user or a
  // session opened from a password reset link gets 401.
  const user = context.locals.user;
  if (!user || context.locals.recoverySession) {
    return new Response(null, { status: 401 });
  }

  // A body that is not a form counts as an unknown kind: no cookie change, plain redirect.
  const form = await context.request.formData().catch(() => null);
  const parsed = draftSchema.safeParse({
    kind: formText(form, "kind"),
    q: formText(form, "q"),
    productName: formText(form, "productName"),
    substanceName: formText(form, "substanceName"),
    startedOn: formText(form, "startedOn"),
  });
  if (!parsed.success) {
    return seeOther(REGISTRY_SEARCH_PATH);
  }

  const secure = context.url.protocol === "https:";
  const draft = parsed.data;
  if (draft.kind === "search") {
    writeRegistrySearch(context.cookies, user.id, draft.q, secure);
    return seeOther(REGISTRY_SEARCH_PATH);
  }

  writeLeafletDraft(
    context.cookies,
    {
      userId: user.id,
      productName: draft.productName,
      substanceName: draft.substanceName,
      startedOn: draft.startedOn,
      unmatched: false,
    },
    secure,
  );
  return seeOther(LEAFLET_DRAFT_PATH);
};
