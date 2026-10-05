// Text folding for search and comparison. No `@/` imports and no Supabase client, so the scripts under
// scripts/**/*.test.mjs can load this file directly under `node --experimental-strip-types`.

// Lower case (Polish locale) without diacritics, whitespace collapsed to single spaces and trimmed:
// "  Ból   GŁOWY " and "bol glowy" fold the same. NFC first, so a decomposed "ó" typed on another keyboard folds like
// the composed one. `ł` has no combining form in NFD, so it is mapped by hand.
export function foldForSearch(text: string): string {
  return text
    .normalize("NFC")
    .toLocaleLowerCase("pl")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replaceAll("ł", "l")
    .replace(/\s+/g, " ")
    .trim();
}
