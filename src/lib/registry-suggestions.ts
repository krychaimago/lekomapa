// Bounds of the text the suggestions route accepts, shared with the hook so it never asks for what the route
// rejects. One letter matches too much of the registry to be a useful suggestion. Kept apart from
// ./services/registry-search.ts, which reports errors through server-only code the browser bundle cannot load.
export const SUGGESTION_QUERY_MIN = 2;
export const SUGGESTION_QUERY_MAX = 60;
export const MAX_SUGGESTIONS = 10;
