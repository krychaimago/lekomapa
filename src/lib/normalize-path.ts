// Astro dev also serves a page under "<path>.html" and may keep a trailing slash; normalize both,
// so a path rule cannot be bypassed by spelling the same page differently.
export function normalizePath(path: string): string {
  const withoutHtml = path.endsWith(".html") ? path.slice(0, -".html".length) : path;
  return withoutHtml.length > 1 && withoutHtml.endsWith("/") ? withoutHtml.slice(0, -1) : withoutHtml;
}
