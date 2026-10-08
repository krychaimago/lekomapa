// Menu of the app interior. A slice adds its screen here; the same list drives the sidebar,
// the phone tab bar and route protection in middleware.
export interface NavItem {
  href: string;
  label: string;
}

export const NAV_ITEMS: readonly NavItem[] = [
  { href: "/leki", label: "Leki" },
  { href: "/dzienniczek", label: "Dzienniczek" },
];

// Every interior screen: signed-out visitors are sent to sign-in, accounts without the current terms version to
// the acceptance screen (src/lib/auth/terms-gate.ts). Menu screens are included automatically; an interior route
// outside the menu must be listed here, otherwise it is neither protected nor gated.
export const INTERIOR_ROUTES: readonly string[] = ["/dashboard", ...NAV_ITEMS.map((item) => item.href)];

// A path matches an href when it is equal to it or lies below it:
// "/leki" matches "/leki" and "/leki/nowe", but not "/leki-archiwum".
// "/leki.html" matches too: astro dev (and build.format "file") serves the same page under it.
export function matchesNavHref(path: string, href: string): boolean {
  return path === href || path === `${href}.html` || path.startsWith(`${href}/`);
}

// At most one item is active: among matching items, the one with the longest href wins.
export function findActiveNavItem(path: string, items: readonly NavItem[]): NavItem | undefined {
  let active: NavItem | undefined;
  for (const item of items) {
    if (matchesNavHref(path, item.href) && (!active || item.href.length > active.href.length)) {
      active = item;
    }
  }
  return active;
}
