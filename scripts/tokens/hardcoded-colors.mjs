// Hardcoded-color scanner for src/. Product colors live only as tokens in src/styles/global.css; every other
// file uses token classes (bg-primary, text-muted-foreground). A literal color anywhere else escapes the
// contrast test in contrast.test.mjs and the dark mode, so it is reported with file, line and the match.

import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

import { GLOBAL_CSS_PATH, NON_COLOR_TOKENS, REPO_ROOT, loadTokenBlocks } from "./contrast.mjs";

export const SRC_DIR = path.join(REPO_ROOT, "src");
export const SCANNED_EXTENSIONS = new Set([".astro", ".ts", ".tsx", ".js", ".jsx", ".css"]);

// Files allowed to keep hardcoded colors for now. Each entry names the slice that rebuilds the file and must
// remove it from this list; a stale entry (missing file or no violation left) fails hardcoded-colors.test.mjs.
export const EXCEPTIONS = [
  { path: "src/pages/auth/signin.astro", reason: "starter auth screen", removedBy: "S-01" },
  { path: "src/pages/auth/signup.astro", reason: "starter auth screen", removedBy: "S-01" },
  { path: "src/pages/auth/confirm-email.astro", reason: "starter auth screen", removedBy: "S-01" },
  { path: "src/components/auth/SubmitButton.tsx", reason: "starter auth form component", removedBy: "S-01" },
  { path: "src/components/auth/PasswordToggle.tsx", reason: "starter auth form component", removedBy: "S-01" },
  { path: "src/components/auth/FormField.tsx", reason: "starter auth form component", removedBy: "S-01" },
  { path: "src/components/auth/ServerError.tsx", reason: "starter auth form component", removedBy: "S-01" },
  { path: "src/components/auth/SignUpForm.tsx", reason: "starter auth form component", removedBy: "S-01" },
  {
    path: "src/styles/starter-auth.css",
    reason: "bg-cosmic background of the starter auth screens",
    removedBy: "S-01",
  },
];

export const TAILWIND_PALETTES = [
  "slate",
  "gray",
  "zinc",
  "neutral",
  "stone",
  "mauve",
  "olive",
  "mist",
  "taupe",
  "red",
  "orange",
  "amber",
  "yellow",
  "lime",
  "green",
  "emerald",
  "teal",
  "cyan",
  "sky",
  "blue",
  "indigo",
  "violet",
  "purple",
  "fuchsia",
  "pink",
  "rose",
];

// Utilities that take a color. `border` also takes a side (border-t-red-500).
export const COLOR_UTILITY_PREFIXES = [
  "bg",
  "text",
  "border(?:-[xytrblse])?",
  "ring-offset",
  "ring",
  "outline",
  "from",
  "via",
  "to",
  "fill",
  "stroke",
  "shadow",
  "inset-shadow",
  "inset-ring",
  "drop-shadow",
  "divide",
  "placeholder",
  "caret",
  "accent",
  "decoration",
];

const PREFIX = `(?:${COLOR_UTILITY_PREFIXES.join("|")})`;
const OPACITY = String.raw`(?:\/(?:\d+|\[[^\]\s]+\]))?`;
// A class starts after whitespace, a quote, a backtick, `{`, `(`, `!` or a variant colon — never mid-word.
const CLASS_START = String.raw`(?<![\w-])`;
const CLASS_END = String.raw`(?![\w-])`;

const HEX = /(?<![\w&])(?<!href=["'])#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})(?![\w-])/g;
const COLOR_FUNCTION = /\b(?:rgba?|hsla?|oklch|oklab|lab|lch|hwb)\(/g;
const PALETTE_CLASS = new RegExp(
  `${CLASS_START}${PREFIX}-(?:(?:${TAILWIND_PALETTES.join("|")})-(?:50|[1-9]00|950)|white|black)${OPACITY}${CLASS_END}`,
  "g",
);

// Colors with the dark: variant are forbidden even on tokens: the dark mode belongs to the .dark token block,
// and a dark: color class would change the effective color outside the contrast test.
function darkColorPattern(tokenNames) {
  const names = [...tokenNames, ...TAILWIND_PALETTES.map((p) => `${p}-(?:50|[1-9]00|950)`)];
  names.push("white", "black", "transparent", "current", "inherit", String.raw`\[[^\]\s]+\]`);
  // Longest names first, so "muted-foreground" is not cut to "muted".
  const alternatives = names.sort((a, b) => b.length - a.length).join("|");
  return new RegExp(
    `${CLASS_START}dark:(?:[\\w\\[\\]&*=-]+:)*${PREFIX}-(?:${alternatives})${OPACITY}${CLASS_END}`,
    "g",
  );
}

// In global.css a color may appear only as the value of a `--name:` declaration inside the :root and .dark
// token blocks. Those values are blanked (length and newlines kept, so line numbers stay right) before scanning.
export function maskTokenDeclarations(css) {
  // Block detection runs on a copy with comments blanked, so a `;` or `{` inside a comment cannot shift it.
  const structure = css.replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, " "));
  const ranges = [];
  let depth = 0;
  let ruleStart = 0;
  let bodyStart = -1;
  for (let i = 0; i < structure.length; i++) {
    const char = structure[i];
    if (char === "{") {
      if (depth === 0) {
        const head = structure.slice(ruleStart, i).trim();
        bodyStart = head === ":root" || head === ".dark" ? i + 1 : -1;
      }
      depth++;
    } else if (char === "}") {
      depth--;
      if (depth === 0) {
        if (bodyStart !== -1) ranges.push([bodyStart, i]);
        ruleStart = i + 1;
      }
    } else if (char === ";" && depth === 0) {
      ruleStart = i + 1;
    }
  }
  let masked = css;
  for (const [start, end] of ranges) {
    const body = masked.slice(start, end).replace(/(--[\w-]+\s*:)([^;]*)/g, (_, name, value) => {
      return name + value.replace(/[^\n]/g, " ");
    });
    masked = masked.slice(0, start) + body + masked.slice(end);
  }
  return masked;
}

function lineOf(text, index) {
  let line = 1;
  for (let i = 0; i < index; i++) if (text[i] === "\n") line++;
  return line;
}

// Returns every hardcoded color in `content` as { line, match, rule }, sorted by position.
// `tokenNames` are the color token names from global.css, needed to recognize dark:<token> classes.
export function findViolations(content, { tokenNames, isTokenFile = false }) {
  if (!tokenNames || tokenNames.size === 0) throw new Error("findViolations needs the color token names.");
  const text = isTokenFile ? maskTokenDeclarations(content) : content;
  const rules = [
    { rule: "hex color", pattern: HEX },
    { rule: "color function", pattern: COLOR_FUNCTION },
    { rule: "Tailwind palette class", pattern: PALETTE_CLASS },
    { rule: "dark: color class", pattern: darkColorPattern(tokenNames) },
  ];
  const found = [];
  for (const { rule, pattern } of rules) {
    for (const match of text.matchAll(pattern)) {
      found.push({ index: match.index, line: lineOf(text, match.index), match: match[0], rule });
    }
  }
  // A dark: palette class is reported once, as a dark: color class.
  const darkSpans = found.filter((v) => v.rule === "dark: color class");
  return found
    .filter(
      (v) =>
        v.rule !== "Tailwind palette class" ||
        !darkSpans.some((d) => v.index > d.index && v.index < d.index + d.match.length),
    )
    .sort((a, b) => a.index - b.index)
    .map(({ line, match, rule }) => ({ line, match, rule }));
}

export async function listSourceFiles(dir = SRC_DIR) {
  const entries = await readdir(dir, { recursive: true, withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && SCANNED_EXTENSIONS.has(path.extname(entry.name)))
    .map((entry) => path.relative(REPO_ROOT, path.join(entry.parentPath, entry.name)).split(path.sep).join("/"))
    .sort();
}

export async function loadColorTokenNames() {
  const { light, dark } = await loadTokenBlocks();
  return new Set([...light.keys(), ...dark.keys()].filter((name) => !NON_COLOR_TOKENS.has(name)));
}

// Scans src/ and returns { files, violations }, where violations is a list of { file, line, match, rule }.
export async function scanSource() {
  const tokenNames = await loadColorTokenNames();
  const files = await listSourceFiles();
  const tokenFile = path.relative(REPO_ROOT, GLOBAL_CSS_PATH).split(path.sep).join("/");
  const violations = [];
  for (const file of files) {
    const content = await readFile(path.join(REPO_ROOT, file), "utf8");
    for (const violation of findViolations(content, { tokenNames, isTokenFile: file === tokenFile })) {
      violations.push({ file, ...violation });
    }
  }
  return { files, violations };
}

export function formatViolation({ file, line, match, rule }) {
  return `${file}:${line}  ${match}  (${rule})`;
}
