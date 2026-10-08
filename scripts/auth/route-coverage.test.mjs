// Every page must be a deliberate decision: public, the acceptance screen, or interior. Interior protection
// (sign-in redirect) and the terms version gate both come from INTERIOR_ROUTES; a page missing from it would be
// open to signed-out visitors and accounts without acceptance, and nothing else would report it.

import assert from "node:assert/strict";
import { readdir } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";

import { TERMS_ACCEPTANCE_PATH, isTermsGatedPath } from "../../src/lib/auth/terms-gate.ts";
import { INTERIOR_ROUTES, matchesNavHref } from "../../src/lib/navigation.ts";

const PAGES_DIR = path.join(import.meta.dirname, "../../src/pages");

// Reachable without signing in. Exact paths: "/warunki" does not cover "/warunki/akceptacja".
const PUBLIC_PATHS = ["/", "/warunki", "/prywatnosc"];
const PUBLIC_PREFIXES = ["/auth/"];

// "leki/[id]/usun.astro" -> "/leki/id/usun"; a dynamic segment becomes a plain one so prefix matching applies.
function pageRoute(relativeFile) {
  const route = relativeFile
    .replace(/\.astro$/, "")
    .replace(/(^|\/)index$/, "")
    .replace(/\[\.{0,3}([^\]]+)\]/g, "$1");
  return `/${route}`.replace(/\/$/, "") || "/";
}

function classify(route) {
  if (PUBLIC_PATHS.includes(route) || PUBLIC_PREFIXES.some((prefix) => route.startsWith(prefix))) return "public";
  if (route === TERMS_ACCEPTANCE_PATH) return "acceptance";
  if (INTERIOR_ROUTES.some((href) => matchesNavHref(route, href))) return "interior";
  return "unclassified";
}

async function listPageRoutes() {
  const entries = await readdir(PAGES_DIR, { recursive: true, withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".astro"))
    .map((entry) =>
      pageRoute(path.relative(PAGES_DIR, path.join(entry.parentPath, entry.name)).split(path.sep).join("/")),
    );
}

test("page routes are derived from file paths, dynamic segments included", () => {
  assert.equal(pageRoute("index.astro"), "/");
  assert.equal(pageRoute("dzienniczek/index.astro"), "/dzienniczek");
  assert.equal(pageRoute("leki/[id]/okresy/[periodId]/poprawa.astro"), "/leki/id/okresy/periodId/poprawa");
});

test("a page outside every list is reported, not allowed", () => {
  assert.equal(classify("/raport"), "unclassified");
  assert.equal(classify("/warunki/inne"), "unclassified");
});

test("every page is public, the acceptance screen, or listed in INTERIOR_ROUTES", async () => {
  const routes = await listPageRoutes();
  assert.ok(routes.length > 10, `expected the real page tree, found ${routes.length} pages`);
  const unclassified = routes.filter((route) => classify(route) === "unclassified");
  assert.deepEqual(
    unclassified,
    [],
    "add each page to INTERIOR_ROUTES (src/lib/navigation.ts) or, if it is truly public, to PUBLIC_PATHS here",
  );
});

test("every interior page is behind the terms version gate", async () => {
  const interior = (await listPageRoutes()).filter((route) => classify(route) === "interior");
  for (const route of interior) assert.ok(isTermsGatedPath(route), `${route} is interior but not gated`);
});
