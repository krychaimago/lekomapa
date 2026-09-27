// Color tokens of src/styles/global.css and the contrast rule they must hold: every text/background pair
// reaches at least 7:1 (WCAG 2.x relative luminance) in both the light (:root) and dark (.dark) mode.
// checkPalette returns a list of named failures instead of throwing on the first one, so a single run
// shows every broken token and pair.

import { readFile } from "node:fs/promises";
import path from "node:path";

export const REPO_ROOT = path.resolve(import.meta.dirname, "..", "..");
export const GLOBAL_CSS_PATH = path.join(REPO_ROOT, "src", "styles", "global.css");

export const MIN_CONTRAST = 7;

// Tokens that are not colors. They are excluded from the hex check and the name comparison between modes,
// and only these may appear in one mode alone. Any other non-hex value is a failure.
export const NON_COLOR_TOKENS = new Set(["radius"]);

// Pairs whose names do not reveal them: [text, background]. Every `X-foreground` / `X` pair is derived
// mechanically on top of this list (see derivePairs).
export const EXPLICIT_PAIRS = [
  ["foreground", "background"],
  ["foreground", "card"],
  ["muted-foreground", "background"],
  ["muted-foreground", "card"],
  ["muted-foreground", "muted"],
  ["primary", "background"],
  ["primary", "card"],
  ["primary", "accent"],
  ["destructive", "background"],
  ["destructive", "card"],
  ["destructive", "destructive-surface"],
];

export const MODES = [
  { name: "light", selector: ":root" },
  { name: "dark", selector: ".dark" },
];

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
const FOREGROUND_SUFFIX = "-foreground";

function stripComments(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, "");
}

// Returns the bodies of every top-level rule whose selector is exactly `selector`, in file order.
function findRuleBodies(css, selector) {
  const bodies = [];
  let depth = 0;
  let ruleStart = 0;
  let bodyStart = -1;
  for (let i = 0; i < css.length; i++) {
    const char = css[i];
    if (char === "{") {
      if (depth === 0) {
        const head = css.slice(ruleStart, i).trim();
        bodyStart = head === selector ? i + 1 : -1;
      }
      depth++;
    } else if (char === "}") {
      depth--;
      if (depth === 0) {
        if (bodyStart !== -1) bodies.push(css.slice(bodyStart, i));
        ruleStart = i + 1;
      }
    } else if (char === ";" && depth === 0) {
      ruleStart = i + 1;
    }
  }
  return bodies;
}

// Parses `--<name>: <value>` declarations of :root and .dark into { light: Map, dark: Map }.
// A missing block is an error, not an empty map — an unparsed file must never look like a passing palette.
// A repeated block is an error too: a later :root would override measured values in the browser unmeasured.
export function parseTokenBlocks(css) {
  const clean = stripComments(css);
  const blocks = {};
  for (const { name, selector } of MODES) {
    const bodies = findRuleBodies(clean, selector);
    if (bodies.length === 0) throw new Error(`No "${selector}" block (${name} mode) found in the stylesheet.`);
    if (bodies.length > 1)
      throw new Error(`"${selector}" block (${name} mode) declared ${bodies.length} times; keep one.`);
    const tokens = new Map();
    // Split on ";" so the last declaration counts even without a trailing semicolon.
    for (const declaration of bodies[0].split(";")) {
      const match = /^\s*--([\w-]+)\s*:\s*([\s\S]+?)\s*$/.exec(declaration);
      if (match) tokens.set(match[1], match[2]);
    }
    blocks[name] = tokens;
  }
  return blocks;
}

function channelToLinear(channel) {
  const value = channel / 255;
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance(hex) {
  if (!HEX_COLOR.test(hex)) throw new Error(`Not a #RRGGBB color: "${hex}"`);
  const [r, g, b] = [1, 3, 5].map((start) => channelToLinear(parseInt(hex.slice(start, start + 2), 16)));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(hexA, hexB) {
  const [lighter, darker] = [relativeLuminance(hexA), relativeLuminance(hexB)].sort((a, b) => b - a);
  return (lighter + 0.05) / (darker + 0.05);
}

export function passesContrast(hexA, hexB, minimum = MIN_CONTRAST) {
  return contrastRatio(hexA, hexB) >= minimum;
}

// Every `X-foreground` token paired with `X`, plus the explicit list. An `X-foreground` without `X`
// is reported as an orphan, so a typo cannot silently drop its pair.
export function derivePairs(names) {
  const pairs = [];
  const orphans = [];
  for (const name of names) {
    if (!name.endsWith(FOREGROUND_SUFFIX) || name === "foreground") continue;
    const background = name.slice(0, -FOREGROUND_SUFFIX.length);
    if (names.has(background)) pairs.push([name, background]);
    else orphans.push(name);
  }
  return { pairs: [...EXPLICIT_PAIRS, ...pairs], orphans };
}

function colorNames(tokens) {
  return new Set([...tokens.keys()].filter((name) => !NON_COLOR_TOKENS.has(name)));
}

// Returns a list of human-readable failures; an empty list means the palette holds.
export function checkPalette(blocks) {
  const errors = [];

  for (const { name: mode, selector } of MODES) {
    if (colorNames(blocks[mode]).size === 0) errors.push(`${mode} (${selector}): no color tokens parsed`);
  }
  if (errors.length > 0) return errors;

  const light = colorNames(blocks.light);
  const dark = colorNames(blocks.dark);
  for (const name of light)
    if (!dark.has(name)) errors.push(`--${name}: declared in light (:root), missing in dark (.dark)`);
  for (const name of dark)
    if (!light.has(name)) errors.push(`--${name}: declared in dark (.dark), missing in light (:root)`);

  const invalid = new Set();
  for (const { name: mode } of MODES) {
    for (const name of colorNames(blocks[mode])) {
      const value = blocks[mode].get(name);
      if (!HEX_COLOR.test(value)) {
        invalid.add(`${mode}:${name}`);
        errors.push(`--${name} (${mode}): value "${value}" is not a #RRGGBB hex color`);
      }
    }
  }

  const allNames = new Set([...light, ...dark]);
  const { pairs, orphans } = derivePairs(allNames);
  for (const name of orphans) {
    errors.push(`--${name}: no matching --${name.slice(0, -FOREGROUND_SUFFIX.length)} token to pair with`);
  }

  for (const { name: mode } of MODES) {
    const tokens = blocks[mode];
    for (const [text, background] of pairs) {
      const label = `${text} / ${background} (${mode})`;
      if (!tokens.has(text) || !tokens.has(background)) {
        const missing = [text, background].filter((name) => !tokens.has(name)).map((name) => `--${name}`);
        errors.push(`${label}: pair cannot be measured, missing ${missing.join(", ")}`);
        continue;
      }
      if (invalid.has(`${mode}:${text}`) || invalid.has(`${mode}:${background}`)) {
        errors.push(`${label}: pair cannot be measured, non-hex value`);
        continue;
      }
      const ratio = contrastRatio(tokens.get(text), tokens.get(background));
      if (ratio < MIN_CONTRAST) {
        errors.push(
          `${label}: contrast ${ratio.toFixed(2)}:1 is below ${MIN_CONTRAST}:1 (${tokens.get(text)} on ${tokens.get(background)})`,
        );
      }
    }
  }

  return errors;
}

export async function loadTokenBlocks(cssPath = GLOBAL_CSS_PATH) {
  return parseTokenBlocks(await readFile(cssPath, "utf8"));
}
