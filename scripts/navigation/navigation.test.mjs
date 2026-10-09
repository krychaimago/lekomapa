// NAV_ITEMS drives the menu and route protection in src/middleware.ts. An href in the wrong shape ("/leki/",
// "leki") matches nothing, so its screen would be neither highlighted nor protected — with no visible error.

import assert from "node:assert/strict";
import { test } from "node:test";

import { INTERIOR_ROUTES, NAV_ITEMS, findActiveNavItem, matchesNavHref } from "../../src/lib/navigation.ts";

const HREF_SHAPE = /^\/[^/]+(\/[^/]+)*$/;

test("every NAV_ITEMS href starts with / and has no trailing /", () => {
  for (const { href } of NAV_ITEMS) assert.match(href, HREF_SHAPE, href);
  // The shape check itself rejects the forms that would silently drop protection.
  for (const bad of ["/leki/", "leki", "/", "//leki", "/leki//nowe"]) assert.doesNotMatch(bad, HREF_SHAPE, bad);
});

test("a path matches its href, the .html variant and anything below it, never a sibling", () => {
  for (const path of ["/leki", "/leki.html", "/leki/", "/leki/nowe", "/leki/12/edycja"]) {
    assert.equal(matchesNavHref(path, "/leki"), true, path);
  }
  for (const path of ["/leki-archiwum", "/lekiX", "/lek", "/", "/objawy/leki"]) {
    assert.equal(matchesNavHref(path, "/leki"), false, path);
  }
});

test("the longest matching href is the active item", () => {
  const items = [
    { href: "/leki", label: "Leki" },
    { href: "/leki/archiwum", label: "Archiwum" },
    { href: "/objawy", label: "Objawy" },
  ];
  assert.equal(findActiveNavItem("/leki/archiwum/3", items)?.href, "/leki/archiwum");
  assert.equal(findActiveNavItem("/leki/nowe", items)?.href, "/leki");
  assert.equal(findActiveNavItem("/ustawienia", items), undefined);
});

test("the journal is in the menu, so its screens are highlighted and protected", () => {
  // /dzienniczek/nowy is not in PROTECTED_ROUTES on its own: it is protected only through this menu item.
  for (const path of ["/dzienniczek", "/dzienniczek/nowy"]) {
    assert.equal(findActiveNavItem(path, NAV_ITEMS)?.href, "/dzienniczek", path);
  }
});

test("the doctor visit section is the third menu item, so it is protected and terms-gated", () => {
  assert.deepEqual(
    NAV_ITEMS.map((item) => item.href),
    ["/leki", "/dzienniczek", "/wizyta"],
  );
  assert.equal(NAV_ITEMS[2].label, "Wizyta");
  assert.ok(INTERIOR_ROUTES.includes("/wizyta"));
});
