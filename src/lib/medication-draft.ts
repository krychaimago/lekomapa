// Short-lived drafts of the add-medication screens: the text typed into the registry search and the leaflet form,
// kept in HttpOnly cookies so it never travels in a URL (lesson "Żadna nazwa leku ani dawka w adresie URL").
// The single place with the cookie names, options and rules; routes and pages call the functions below.
//
// Each draft carries the account id and is read only by that account: switching accounts without signing out
// (expired session, sign-in as someone else) must not show the previous search. The dose never goes into a draft.
//
// No `@/` imports (the AstroCookies import is type-only and erased), so scripts/medications/medication-draft.test.mjs
// can load this file under `node --experimental-strip-types`.

import type { AstroCookies } from "astro";

export const REGISTRY_SEARCH_COOKIE = "lekomapa-registry-search";
export const LEAFLET_DRAFT_COOKIE = "lekomapa-leaflet-draft";

// Each cookie reaches only the screen that reads it. Deleting needs the same path, or the browser keeps the cookie.
export const REGISTRY_SEARCH_PATH = "/leki/nowy";
export const LEAFLET_DRAFT_PATH = "/leki/nowy/z-ulotki";

export const MAX_DRAFT_TEXT_LENGTH = 200;

// `secure` is left to the caller: it follows the request protocol, because the local preview runs on http.
export const DRAFT_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax",
  maxAge: 600,
} as const;

export interface RegistrySearchDraft {
  userId: string;
  q: string;
}

export interface LeafletDraft {
  userId: string;
  productName: string;
  substanceName: string;
  // ISO `YYYY-MM-DD`, or null when none or not a real date.
  startedOn: string | null;
  // True after a save attempt whose substance has no coded dictionary entry ("no match" state of the leaflet form).
  unmatched: boolean;
}

function draftText(value: unknown): string {
  return typeof value === "string" ? value.trim().slice(0, MAX_DRAFT_TEXT_LENGTH) : "";
}

// A real calendar date in `YYYY-MM-DD`: 2026-02-30 is rejected, not rolled over to March.
function isoDate(value: unknown): string | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? value : null;
}

// The object stored in the cookie for `userId`, or null when it is not JSON, not an object or another account's.
function ownObject(raw: string | null | undefined, userId: string): Record<string, unknown> | null {
  if (!raw || !userId) return null;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  return record.userId === userId ? record : null;
}

// The search draft of `userId` stored in `raw`; null for bad JSON, a wrong shape, another account or empty text.
export function parseRegistrySearch(raw: string | null | undefined, userId: string): RegistrySearchDraft | null {
  const record = ownObject(raw, userId);
  if (!record || typeof record.q !== "string") return null;
  const q = draftText(record.q);
  return q ? { userId, q } : null;
}

// The leaflet draft of `userId` stored in `raw`; null for bad JSON, a wrong shape or another account. Only the listed
// fields come out: anything else in the cookie (a dose included) is dropped.
export function parseLeafletDraft(raw: string | null | undefined, userId: string): LeafletDraft | null {
  const record = ownObject(raw, userId);
  if (!record) return null;
  const { productName, substanceName, startedOn, unmatched } = record;
  if (typeof productName !== "string" || typeof substanceName !== "string" || typeof unmatched !== "boolean") {
    return null;
  }
  if (startedOn !== null && startedOn !== undefined && typeof startedOn !== "string") return null;
  return {
    userId,
    productName: draftText(productName),
    substanceName: draftText(substanceName),
    startedOn: isoDate(startedOn),
    unmatched,
  };
}

function clearCookie(cookies: AstroCookies, name: string, path: string): void {
  // Set with Max-Age=0 rather than cookies.delete, which sends only an Expires in the past.
  cookies.set(name, "", { ...DRAFT_COOKIE_OPTIONS, path, maxAge: 0 });
}

// Saves the search text of `userId`; empty text clears the draft instead.
export function writeRegistrySearch(cookies: AstroCookies, userId: string, q: unknown, secure: boolean): void {
  const text = draftText(q);
  if (!text) {
    clearCookie(cookies, REGISTRY_SEARCH_COOKIE, REGISTRY_SEARCH_PATH);
    return;
  }
  const draft: RegistrySearchDraft = { userId, q: text };
  cookies.set(REGISTRY_SEARCH_COOKIE, JSON.stringify(draft), {
    ...DRAFT_COOKIE_OPTIONS,
    path: REGISTRY_SEARCH_PATH,
    secure,
  });
}

export function readRegistrySearch(cookies: AstroCookies, userId: string): RegistrySearchDraft | null {
  return parseRegistrySearch(cookies.get(REGISTRY_SEARCH_COOKIE)?.value, userId);
}

// Saves the typed leaflet fields of `userId`. The object is built field by field, so nothing else (never the dose)
// can end up in the cookie.
export function writeLeafletDraft(
  cookies: AstroCookies,
  draft: {
    userId: string;
    productName: unknown;
    substanceName: unknown;
    startedOn: unknown;
    unmatched: boolean;
  },
  secure: boolean,
): void {
  const value: LeafletDraft = {
    userId: draft.userId,
    productName: draftText(draft.productName),
    substanceName: draftText(draft.substanceName),
    startedOn: isoDate(draft.startedOn),
    unmatched: draft.unmatched,
  };
  cookies.set(LEAFLET_DRAFT_COOKIE, JSON.stringify(value), {
    ...DRAFT_COOKIE_OPTIONS,
    path: LEAFLET_DRAFT_PATH,
    secure,
  });
}

export function readLeafletDraft(cookies: AstroCookies, userId: string): LeafletDraft | null {
  return parseLeafletDraft(cookies.get(LEAFLET_DRAFT_COOKIE)?.value, userId);
}

// Both drafts gone: after a successful save, on sign-out and on account deletion.
export function clearMedicationDrafts(cookies: AstroCookies): void {
  clearCookie(cookies, REGISTRY_SEARCH_COOKIE, REGISTRY_SEARCH_PATH);
  clearCookie(cookies, LEAFLET_DRAFT_COOKIE, LEAFLET_DRAFT_PATH);
}
