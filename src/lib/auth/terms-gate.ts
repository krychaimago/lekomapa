import { INTERIOR_ROUTES, matchesNavHref } from "../navigation.ts";
import { normalizePath } from "../normalize-path.ts";

// Screen where a signed-in account without acceptance of the current terms version accepts them or signs out.
export const TERMS_ACCEPTANCE_PATH = "/warunki/akceptacja";

export type TermsGateAction = "allow" | "redirect" | "forbid";

// Reachable without acceptance: the terms and privacy pages, the acceptance screen and its endpoint, the auth screens
// and endpoints (sign-out in particular). Gating any of them loops the redirect or locks the account in.
// The acceptance endpoint is an exact path: a later route under /api/terms/ that reads or writes account data
// must stay gated.
const EXEMPT_PATHS: readonly string[] = ["/", "/warunki", "/prywatnosc", TERMS_ACCEPTANCE_PATH, "/api/terms/accept"];
const EXEMPT_PREFIXES: readonly string[] = ["/api/auth/", "/auth/"];

function isExempt(path: string): boolean {
  return EXEMPT_PATHS.includes(path) || EXEMPT_PREFIXES.some((prefix) => path.startsWith(prefix));
}

function isInteriorPath(path: string): boolean {
  return INTERIOR_ROUTES.some((route) => matchesNavHref(path, route));
}

function isApiPath(path: string): boolean {
  return path.startsWith("/api/");
}

// Tells middleware whether the path needs the accepted version at all, so other paths cost no database query.
export function isTermsGatedPath(rawPath: string): boolean {
  const path = normalizePath(rawPath);
  return !isExempt(path) && (isInteriorPath(path) || isApiPath(path));
}

// `latestAcceptedVersion` is the highest version the account accepted, null when it accepted none.
export function termsGateAction(
  rawPath: string,
  latestAcceptedVersion: number | null,
  currentVersion: number,
): TermsGateAction {
  const path = normalizePath(rawPath);
  if (!isTermsGatedPath(path)) return "allow";
  if (latestAcceptedVersion !== null && latestAcceptedVersion >= currentVersion) return "allow";
  return isApiPath(path) ? "forbid" : "redirect";
}
