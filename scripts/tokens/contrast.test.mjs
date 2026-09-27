import assert from "node:assert/strict";
import { test } from "node:test";

import {
  EXPLICIT_PAIRS,
  checkPalette,
  contrastRatio,
  derivePairs,
  loadTokenBlocks,
  parseTokenBlocks,
  passesContrast,
} from "./contrast.mjs";

// Minimal palette covering every explicit pair, all at 21:1 or 16:1.
const LIGHT = {
  background: "#FFFFFF",
  foreground: "#000000",
  card: "#FFFFFF",
  "card-foreground": "#000000",
  muted: "#FFFFFF",
  "muted-foreground": "#000000",
  primary: "#000000",
  "primary-foreground": "#FFFFFF",
  accent: "#FFFFFF",
  destructive: "#000000",
  "destructive-surface": "#FFFFFF",
};
const DARK = Object.fromEntries(
  Object.entries(LIGHT).map(([name, value]) => [name, value === "#FFFFFF" ? "#000000" : "#FFFFFF"]),
);

function declarations(tokens) {
  return Object.entries(tokens)
    .map(([name, value]) => `  --${name}: ${value};`)
    .join("\n");
}

function css(light = LIGHT, dark = DARK) {
  return `@import "tailwindcss";\n\n:root {\n  --radius: 0.625rem;\n${declarations(light)}\n}\n\n.dark {\n${declarations(dark)}\n}\n\n@theme inline {\n  --color-background: var(--background);\n}\n`;
}

const check = (light, dark) => checkPalette(parseTokenBlocks(css(light, dark)));

test("contrast ratio matches known WCAG values", () => {
  assert.equal(contrastRatio("#000000", "#FFFFFF").toFixed(2), "21.00");
  assert.equal(contrastRatio("#FFFFFF", "#FFFFFF").toFixed(2), "1.00");
  assert.equal(contrastRatio("#5A6259", "#FFFFFF").toFixed(2), "6.31");
});

test("control case: #5A6259 on white (6.31:1) is rejected at the 7:1 threshold", () => {
  assert.equal(passesContrast("#5A6259", "#FFFFFF"), false);
  const errors = check({ ...LIGHT, "muted-foreground": "#5A6259" });
  assert.ok(
    errors.some((error) => error.startsWith("muted-foreground / card (light): contrast 6.31:1")),
    `expected the muted-foreground / card pair to fail, got: ${errors.join("; ")}`,
  );
});

test("a palette where every pair holds 7:1 passes", () => {
  assert.deepEqual(check(), []);
});

test("parser reads :root and .dark separately and ignores other blocks and comments", () => {
  const blocks = parseTokenBlocks(`/* :root { --ghost: #123456; } */\n${css()}`);
  assert.equal(blocks.light.get("radius"), "0.625rem");
  assert.equal(blocks.light.get("background"), "#FFFFFF");
  assert.equal(blocks.dark.get("background"), "#000000");
  assert.equal(blocks.light.has("ghost"), false);
  assert.equal(blocks.light.has("color-background"), false);
});

test("a missing mode block is an error, not an empty palette", () => {
  assert.throws(() => parseTokenBlocks(`:root {\n${declarations(LIGHT)}\n}\n`), /"\.dark" block \(dark mode\)/);
});

test("empty mode blocks fail instead of passing with nothing measured", () => {
  const errors = checkPalette(parseTokenBlocks(":root { --radius: 1rem; }\n.dark {}\n"));
  assert.deepEqual(errors, ["light (:root): no color tokens parsed", "dark (.dark): no color tokens parsed"]);
});

test("a non-hex color value fails with the token name and mode", () => {
  const errors = check(LIGHT, { ...DARK, border: "oklch(1 0 0 / 10%)" });
  assert.ok(
    errors.includes('--border (dark): value "oklch(1 0 0 / 10%)" is not a #RRGGBB hex color'),
    errors.join("; "),
  );
});

test("a non-hex value inside a measured pair fails the pair instead of skipping it", () => {
  const errors = check({ ...LIGHT, primary: "black" });
  assert.ok(errors.includes('--primary (light): value "black" is not a #RRGGBB hex color'), errors.join("; "));
  assert.ok(errors.includes("primary / background (light): pair cannot be measured, non-hex value"), errors.join("; "));
});

test("different color names between modes fail with the token name", () => {
  const errors = check({ ...LIGHT, border: "#EEEEEE" });
  assert.ok(errors.includes("--border: declared in light (:root), missing in dark (.dark)"), errors.join("; "));
});

test("an X-foreground token without X fails with its name", () => {
  const errors = check(
    { ...LIGHT, "interactoin-foreground": "#000000" },
    { ...DARK, "interactoin-foreground": "#FFFFFF" },
  );
  assert.ok(
    errors.includes("--interactoin-foreground: no matching --interactoin token to pair with"),
    errors.join("; "),
  );
});

test("every X-foreground token is paired with X without being listed", () => {
  const { pairs, orphans } = derivePairs(new Set(["foreground", "demo-bar", "demo-bar-foreground", "background"]));
  assert.deepEqual(orphans, []);
  assert.deepEqual(pairs.slice(EXPLICIT_PAIRS.length), [["demo-bar-foreground", "demo-bar"]]);
});

test("a derived pair below 7:1 fails with the pair name and mode", () => {
  const errors = check(LIGHT, { ...DARK, "primary-foreground": "#777777" });
  assert.ok(
    errors.some((error) => error.startsWith("primary-foreground / primary (dark): contrast")),
    errors.join("; "),
  );
});

test("global.css: both modes declare the same hex color tokens and every pair holds 7:1", async () => {
  const blocks = await loadTokenBlocks();
  // Guard against a vacuous pass: the file was actually parsed and holds the palette.
  for (const name of ["background", "foreground", "primary", "interaction", "demo-bar", "destructive-surface"]) {
    assert.ok(blocks.light.has(name), `--${name} missing in light (:root)`);
    assert.ok(blocks.dark.has(name), `--${name} missing in dark (.dark)`);
  }
  const errors = checkPalette(blocks);
  assert.deepEqual(errors, [], `palette failures:\n${errors.join("\n")}`);
});

test("a repeated mode block is an error, not an unmeasured override", () => {
  assert.throws(
    () => parseTokenBlocks(`${css()}\n:root { --primary: #d0d0d0; }\n`),
    /":root" block \(light mode\) declared 2 times/,
  );
});

test("the last declaration of a block is read without a trailing semicolon", () => {
  const blocks = parseTokenBlocks(":root { --radius: 1rem; --primary: #123456 }\n.dark { --primary: #654321 }\n");
  assert.equal(blocks.light.get("primary"), "#123456");
  assert.equal(blocks.dark.get("primary"), "#654321");
});
