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
// `violations` pins the exact count, so a color added to an excepted file fails the test instead of hiding
// behind the exception. Removing one lowers the count; update it in the same change.
export const EXCEPTIONS = [];

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

// The full CSS named-color list. `transparent` and `currentColor` are not listed: they carry no hue of their own.
export const CSS_NAMED_COLORS = [
  "aliceblue",
  "antiquewhite",
  "aqua",
  "aquamarine",
  "azure",
  "beige",
  "bisque",
  "black",
  "blanchedalmond",
  "blue",
  "blueviolet",
  "brown",
  "burlywood",
  "cadetblue",
  "chartreuse",
  "chocolate",
  "coral",
  "cornflowerblue",
  "cornsilk",
  "crimson",
  "cyan",
  "darkblue",
  "darkcyan",
  "darkgoldenrod",
  "darkgray",
  "darkgreen",
  "darkgrey",
  "darkkhaki",
  "darkmagenta",
  "darkolivegreen",
  "darkorange",
  "darkorchid",
  "darkred",
  "darksalmon",
  "darkseagreen",
  "darkslateblue",
  "darkslategray",
  "darkslategrey",
  "darkturquoise",
  "darkviolet",
  "deeppink",
  "deepskyblue",
  "dimgray",
  "dimgrey",
  "dodgerblue",
  "firebrick",
  "floralwhite",
  "forestgreen",
  "fuchsia",
  "gainsboro",
  "ghostwhite",
  "gold",
  "goldenrod",
  "gray",
  "green",
  "greenyellow",
  "grey",
  "honeydew",
  "hotpink",
  "indianred",
  "indigo",
  "ivory",
  "khaki",
  "lavender",
  "lavenderblush",
  "lawngreen",
  "lemonchiffon",
  "lightblue",
  "lightcoral",
  "lightcyan",
  "lightgoldenrodyellow",
  "lightgray",
  "lightgreen",
  "lightgrey",
  "lightpink",
  "lightsalmon",
  "lightseagreen",
  "lightskyblue",
  "lightslategray",
  "lightslategrey",
  "lightsteelblue",
  "lightyellow",
  "lime",
  "limegreen",
  "linen",
  "magenta",
  "maroon",
  "mediumaquamarine",
  "mediumblue",
  "mediumorchid",
  "mediumpurple",
  "mediumseagreen",
  "mediumslateblue",
  "mediumspringgreen",
  "mediumturquoise",
  "mediumvioletred",
  "midnightblue",
  "mintcream",
  "mistyrose",
  "moccasin",
  "navajowhite",
  "navy",
  "oldlace",
  "olive",
  "olivedrab",
  "orange",
  "orangered",
  "orchid",
  "palegoldenrod",
  "palegreen",
  "paleturquoise",
  "palevioletred",
  "papayawhip",
  "peachpuff",
  "peru",
  "pink",
  "plum",
  "powderblue",
  "purple",
  "rebeccapurple",
  "red",
  "rosybrown",
  "royalblue",
  "saddlebrown",
  "salmon",
  "sandybrown",
  "seagreen",
  "seashell",
  "sienna",
  "silver",
  "skyblue",
  "slateblue",
  "slategray",
  "slategrey",
  "snow",
  "springgreen",
  "steelblue",
  "tan",
  "teal",
  "thistle",
  "tomato",
  "turquoise",
  "violet",
  "wheat",
  "white",
  "whitesmoke",
  "yellow",
  "yellowgreen",
];

// Properties and SVG attributes whose value is a single color. A named color is reported only here and inside a
// Tailwind arbitrary value, never as a bare word — "red" in prose or an identifier is not a color.
const COLOR_PROPERTIES = String.raw`(?:(?:background|border(?:-[a-z]+)?|outline|caret|accent|text-decoration|column-rule|stop|flood|lighting)-color|color|background|fill|stroke)`;
const NAMED = `(?:${CSS_NAMED_COLORS.join("|")})`;

const HEX = /(?<![\w&])(?<!href=["'])#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})(?![\w-])/g;
// CSS function names are case-insensitive: RGB( renders exactly like rgb(.
const COLOR_FUNCTION = /\b(?:rgba?|hsla?|oklch|oklab|lab|lch|hwb|color-mix|color)\(/gi;
const PALETTE_CLASS = new RegExp(
  `${CLASS_START}${PREFIX}-(?:(?:${TAILWIND_PALETTES.join("|")})-(?:50|[1-9]00|950)|white|black)${OPACITY}${CLASS_END}`,
  "g",
);
// Tailwind v4 publishes its palette as CSS variables: var(--color-red-500), bg-(--color-red-500).
const PALETTE_VARIABLE = new RegExp(
  `--color-(?:(?:${TAILWIND_PALETTES.join("|")})-(?:50|[1-9]00|950)|white|black)(?![\\w-])`,
  "g",
);
const NAMED_COLOR = new RegExp(
  [`(?<![\\w-])${COLOR_PROPERTIES}\\s*[:=]\\s*(?:\\{\\s*)?["'\`]?${NAMED}(?![\\w-])`, `-\\[${NAMED}\\]`].join("|"),
  "gi",
);

// Opacity on a text token (text-foreground/50) mixes the text with whatever is behind it, and the result is
// never measured by the contrast test: foreground at /50 drops to about 3:1 in the dark mode. Font size with
// line height (text-sm/6) is not a token, so it is not matched.
function textOpacityPattern(tokenNames) {
  const alternatives = [...tokenNames].sort((a, b) => b.length - a.length).join("|");
  return new RegExp(`${CLASS_START}text-(?:${alternatives})\\/(?:\\d+|\\[[^\\]\\s]+\\])${CLASS_END}`, "g");
}

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
// Only the first block of each selector is masked — the one the contrast test measures. A repeated block stays
// visible, so its colors are violations.
export function maskTokenDeclarations(css) {
  // Block detection runs on a copy with comments blanked, so a `;` or `{` inside a comment cannot shift it.
  const structure = css.replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, " "));
  const ranges = [];
  const seen = new Set();
  let depth = 0;
  let ruleStart = 0;
  let bodyStart = -1;
  for (let i = 0; i < structure.length; i++) {
    const char = structure[i];
    if (char === "{") {
      if (depth === 0) {
        const head = structure.slice(ruleStart, i).trim();
        const isFirstTokenBlock = (head === ":root" || head === ".dark") && !seen.has(head);
        if (isFirstTokenBlock) seen.add(head);
        bodyStart = isFirstTokenBlock ? i + 1 : -1;
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
    { rule: "Tailwind palette variable", pattern: PALETTE_VARIABLE },
    { rule: "named color", pattern: NAMED_COLOR },
    { rule: "opacity on text token", pattern: textOpacityPattern(tokenNames) },
    { rule: "dark: color class", pattern: darkColorPattern(tokenNames) },
  ];
  const found = [];
  for (const { rule, pattern } of rules) {
    for (const match of text.matchAll(pattern)) {
      found.push({ index: match.index, line: lineOf(text, match.index), match: match[0], rule });
    }
  }
  // A dark: palette class or dark: text opacity is reported once, as a dark: color class.
  const darkSpans = found.filter((v) => v.rule === "dark: color class");
  const nestedRules = new Set(["Tailwind palette class", "opacity on text token"]);
  return found
    .filter(
      (v) =>
        !nestedRules.has(v.rule) || !darkSpans.some((d) => v.index > d.index && v.index < d.index + d.match.length),
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
