// Where a shared screen was opened from (author's decision 20.10.2026): the timeline opens from "Wizyta" and from
// "Dziennik", the graph on /leki also from "Wizyta". Links into them carry the fixed flag `?z=wizyta` / `?z=dziennik`,
// so the screen can show the same "Wróć do …" link as every other inner screen. Only these fixed values, never text
// the user typed (lessons.md, "Żadna nazwa leku ani dawka w adresie URL"); `z` is listed in ALLOWED_URL_PARAMS.

export type BackOrigin = "wizyta" | "dziennik";

// The `?z=` value, or null for anything else (no link is then shown).
export function backOriginOf(url: URL): BackOrigin | null {
  // A literal name, so scripts/pages/url-params.test.mjs can check it against ALLOWED_URL_PARAMS.
  const value = url.searchParams.get("z");
  return value === "wizyta" || value === "dziennik" ? value : null;
}

export const BACK_HREF: Record<BackOrigin, string> = { wizyta: "/wizyta", dziennik: "/dzienniczek" };
