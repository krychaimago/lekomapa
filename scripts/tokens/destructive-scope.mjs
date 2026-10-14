// Scope of the red button. destructive* tokens are for form and technical errors only, never for health content
// (CLAUDE.md, "Konwencje kodu"). The one exception is the button of an irreversible account action: today only
// deleting the account. This scanner finds every red button in src/ — a destructive or destructive-outline variant
// picked through buttonVariants or a variant prop, or the full red fill class bg-destructive — so that
// destructive-scope.test.mjs can hold them to the files listed below.
//
// Error messages keep their tokens and are not matched: text-destructive, bg-destructive-surface,
// border-destructive-border, aria-invalid:border-destructive, and border-destructive on an invalid input.

import { readFile } from "node:fs/promises";
import path from "node:path";

import { REPO_ROOT } from "./contrast.mjs";
import { listSourceFiles } from "./hardcoded-colors.mjs";

// Files that define the red variants. They may hold the classes, but a page that picks a variant is listed below.
export const VARIANT_DEFINITIONS = ["src/components/ui/badge.tsx", "src/components/ui/button.tsx"];

// Screens of an irreversible account action and the red variant each one must use. A new entry is a decision of
// the author, not a fix for a failing test.
export const ACCOUNT_ACTION_SCREENS = [
  // Leads to the confirmation, deletes nothing: red outline only.
  { path: "src/pages/konto.astro", variant: "destructive-outline" },
  // The click that deletes the account: full red.
  { path: "src/pages/konto/usun.astro", variant: "destructive" },
];

export const ALLOWED_FILES = new Set([...VARIANT_DEFINITIONS, ...ACCOUNT_ACTION_SCREENS.map((screen) => screen.path)]);

// variant: "destructive", variant="destructive-outline", variant={"destructive"}.
const VARIANT_PICK = /\bvariant\s*[:=]\s*\{?\s*["'`](destructive(?:-outline)?)["'`]/g;
// bg-destructive and its state forms (hover:bg-destructive/90), never bg-destructive-surface.
const FULL_RED_CLASS = /(?<![\w-])(?:[\w[\]&*=-]+:)*bg-destructive(?:\/(?:\d+|\[[^\]\s]+\]))?(?![\w-])/g;

function lineOf(text, index) {
  return text.slice(0, index).split("\n").length;
}

// Returns every red button in `content` as { line, match, variant }, sorted by position. `variant` is the picked
// variant name, or null for a bare bg-destructive class.
export function findRedButtons(content) {
  const found = [];
  for (const match of content.matchAll(VARIANT_PICK)) {
    found.push({ index: match.index, line: lineOf(content, match.index), match: match[0], variant: match[1] });
  }
  for (const match of content.matchAll(FULL_RED_CLASS)) {
    found.push({ index: match.index, line: lineOf(content, match.index), match: match[0], variant: null });
  }
  return found.sort((a, b) => a.index - b.index).map(({ line, match, variant }) => ({ line, match, variant }));
}

// Scans src/ and returns { files, redButtons }, where redButtons is a list of { file, line, match, variant }.
export async function scanRedButtons() {
  const files = await listSourceFiles();
  const redButtons = [];
  for (const file of files) {
    const content = await readFile(path.join(REPO_ROOT, file), "utf8");
    for (const redButton of findRedButtons(content)) redButtons.push({ file, ...redButton });
  }
  return { files, redButtons };
}

export function formatRedButton({ file, line, match }) {
  return `${file}:${line}  ${match}`;
}
