// Color mode preference: one cookie, three allowed values, read by the server on every request.
// Kept free of imports so scripts/theme/theme.test.mjs can load it under plain node.

export const THEME_COOKIE = "lekomapa-theme";

export type ThemePreference = "light" | "dark" | "system";

export const THEME_PREFERENCES = ["light", "dark", "system"] as const satisfies readonly ThemePreference[];

// `secure` is left to the route: it follows the request protocol, because the local preview runs on http.
export const THEME_COOKIE_OPTIONS = {
  path: "/",
  sameSite: "lax",
  httpOnly: true,
  maxAge: 60 * 60 * 24 * 365,
} as const;

// Exactly one of the three values (case-sensitive); anything else or no cookie → "system".
// An unknown cookie value must never break the page.
export function parseThemePreference(value: string | undefined): ThemePreference {
  return (THEME_PREFERENCES as readonly string[]).includes(value ?? "") ? (value as ThemePreference) : "system";
}

// Only a path inside lekomapa: a single leading "/", no "//", no "\", no query or fragment, no control characters.
// Anything else → "/". Rejecting "?" also keeps query strings (which could carry health data) out of redirects.
export function safeReturnPath(value: unknown): string {
  if (typeof value !== "string") return "/";
  if (!value.startsWith("/")) return "/";
  if (value.includes("//") || value.includes("\\")) return "/";
  if (value.includes("?") || value.includes("#")) return "/";
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(value)) return "/";
  return value;
}
