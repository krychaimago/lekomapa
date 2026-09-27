import assert from "node:assert/strict";
import { access, readdir } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";

import { REPO_ROOT } from "./contrast.mjs";
import {
  EXCEPTIONS,
  SRC_DIR,
  findViolations,
  formatViolation,
  maskTokenDeclarations,
  scanSource,
} from "./hardcoded-colors.mjs";

const TOKEN_NAMES = new Set(["primary", "accent", "input", "muted", "muted-foreground", "destructive"]);
const matches = (content, options = {}) =>
  findViolations(content, { tokenNames: TOKEN_NAMES, ...options }).map((v) => v.match);

test("every hardcoded color pattern is detected", () => {
  const samples = [
    ["color: #fff;", "#fff"],
    ["color: #ffff;", "#ffff"],
    ["color: #2C4A33;", "#2C4A33"],
    ["color: #2c4a3380;", "#2c4a3380"],
    ['class="bg-[#2c4a33]"', "#2c4a33"],
    ["color: rgb(0 0 0);", "rgb("],
    ["color: rgba(0, 0, 0, 0.5);", "rgba("],
    ["color: hsl(120 50% 50%);", "hsl("],
    ["color: hsla(120, 50%, 50%, 1);", "hsla("],
    ["color: oklch(0.5 0.1 120);", "oklch("],
  ];
  for (const [content, expected] of samples) {
    assert.deepEqual(matches(content), [expected], content);
  }
  const prefixes = [
    "bg",
    "text",
    "border",
    "ring",
    "outline",
    "from",
    "via",
    "to",
    "fill",
    "stroke",
    "shadow",
    "divide",
    "placeholder",
    "caret",
    "decoration",
  ];
  for (const prefix of prefixes) {
    for (const cls of [`${prefix}-purple-600`, `${prefix}-white`, `${prefix}-black/40`, `${prefix}-slate-950/[0.3]`]) {
      assert.deepEqual(matches(`<div class="p-4 ${cls} m-2">`), [cls], cls);
    }
  }
  assert.deepEqual(matches('className="hover:bg-red-500 border-t-white"'), ["bg-red-500", "border-t-white"]);
});

test("color forms that look like valid Tailwind or CSS are detected", () => {
  const samples = [
    ["color: RGB(0 0 0);", "RGB(", "color function"],
    ["color: Oklch(0.5 0.1 120);", "Oklch(", "color function"],
    ["color: color-mix(in srgb, var(--primary), white);", "color-mix(", "color function"],
    ["color: color(display-p3 1 0 0);", "color(", "color function"],
    ["color: var(--color-red-500);", "--color-red-500", "Tailwind palette variable"],
    ['class="bg-(--color-slate-950)"', "--color-slate-950", "Tailwind palette variable"],
    ["fill: var(--color-white);", "--color-white", "Tailwind palette variable"],
    ['<p style="color: red">', "color: red", "named color"],
    ['style={{ backgroundColor: x, color: "Tomato" }}', 'color: "Tomato', "named color"],
    ["border-left-color:navy;", "border-left-color:navy", "named color"],
    ['<path fill="black" />', 'fill="black', "named color"],
    ['<stop stop-color="white" />', 'stop-color="white', "named color"],
    ['class="bg-[red]"', "-[red]", "named color"],
    ['class="text-muted-foreground/70"', "text-muted-foreground/70", "opacity on text token"],
    ['class="hover:text-primary/[0.4]"', "text-primary/[0.4]", "opacity on text token"],
  ];
  for (const [content, match, rule] of samples) {
    const violations = findViolations(content, { tokenNames: TOKEN_NAMES });
    assert.deepEqual(
      violations.map((v) => [v.match, v.rule]),
      [[match, rule]],
      content,
    );
  }
  // Text opacity under dark: is reported once, as a dark: color class.
  assert.deepEqual(matches('class="dark:text-primary/50"'), ["dark:text-primary/50"]);
});

test("token classes, anchors and HTML entities are not violations", () => {
  const clean = [
    'class="bg-primary text-muted-foreground border-accent"',
    'class="bg-primary/90 hover:bg-accent ring-ring"',
    '<a href="#main">Skip</a>',
    "<a href='#add'>Add</a>",
    "<span>&#123;</span>",
    "<span>&#x1F4A9;</span>",
    'class="text-sm text-center border-2 shadow-sm to-transparent"',
    'class="bg-whitesmoke-ish text-white-label"',
    "const total = items.length; // see #12 in the tracker",
    'class="text-sm/6 text-lg/[1.2] bg-primary/90 border-accent/50"',
    "--color-primary: var(--primary);",
    '<svg fill="currentColor" stroke="none" stroke-width="2">',
    "A red flag in prose; const color = variant;",
    'const colorScheme = "dark"; getColor(x);',
  ];
  for (const content of clean) {
    assert.deepEqual(matches(content), [], content);
  }
});

test("color classes with the dark: variant are violations, also on tokens", () => {
  assert.deepEqual(matches('class="dark:bg-primary"'), ["dark:bg-primary"]);
  assert.deepEqual(matches('class="dark:hover:bg-accent/50"'), ["dark:hover:bg-accent/50"]);
  assert.deepEqual(matches('class="dark:bg-input/30"'), ["dark:bg-input/30"]);
  assert.deepEqual(matches('class="dark:text-muted-foreground"'), ["dark:text-muted-foreground"]);
  assert.deepEqual(matches('class="dark:aria-invalid:ring-destructive/40"'), ["dark:aria-invalid:ring-destructive/40"]);
  // A palette class under dark: is reported once, as a dark: color class.
  assert.deepEqual(matches('class="dark:bg-red-500"'), ["dark:bg-red-500"]);
  assert.deepEqual(matches('class="dark:hidden dark:text-lg dark:border-2"'), []);
});

test("violations carry their line number and rule", () => {
  const violations = findViolations('<div>\n  <p class="text-white">\n</div>', { tokenNames: TOKEN_NAMES });
  assert.deepEqual(violations, [{ line: 2, match: "text-white", rule: "Tailwind palette class" }]);
  assert.equal(
    formatViolation({ file: "src/x.astro", ...violations[0] }),
    "src/x.astro:2  text-white  (Tailwind palette class)",
  );
});

test("findViolations refuses to run without token names", () => {
  assert.throws(() => findViolations("text-white", { tokenNames: new Set() }), /token names/);
});

test("token file: colors are allowed only as --name values inside :root and .dark", () => {
  const css = [
    "/* palette; see :root { } */",
    ":root {",
    "  --primary: #2c4a33;",
    "  /* comment; with { braces */",
    "  --ring: oklch(0.5 0.1 120);",
    "}",
    ".dark {",
    "  --primary: #b4d6bc;",
    "}",
    "@theme inline {",
    "  --color-rogue: #123456;",
    "}",
    "body { color: #000000; }",
    ":root { --late: #abcdef; }",
  ].join("\n");
  const violations = findViolations(css, { tokenNames: TOKEN_NAMES, isTokenFile: true });
  assert.deepEqual(
    violations.map((v) => `${v.line}:${v.match}`),
    ["11:#123456", "13:#000000", "14:#abcdef"],
  );
  assert.equal(maskTokenDeclarations(css).split("\n").length, css.split("\n").length);
  // Outside the token file the same declarations are violations.
  assert.equal(findViolations(css, { tokenNames: TOKEN_NAMES }).length, 6);
});

async function countFilesWithExtensions(dir, extensions) {
  const entries = await readdir(dir, { recursive: true, withFileTypes: true });
  return entries.filter((entry) => entry.isFile() && extensions.includes(path.extname(entry.name))).length;
}

test("src/: no hardcoded color outside the exception list", async () => {
  const { files, violations } = await scanSource();
  // Proof that the scan ran: it read every .astro and .tsx file, not an empty or wrong directory.
  const componentFiles = await countFilesWithExtensions(SRC_DIR, [".astro", ".tsx"]);
  assert.ok(files.length > 0, "no files scanned in src/");
  assert.ok(
    files.length >= componentFiles,
    `scanned ${files.length} files, but src/ has ${componentFiles} .astro/.tsx files`,
  );
  assert.ok(files.includes("src/styles/global.css"), "src/styles/global.css was not scanned");

  const excepted = new Set(EXCEPTIONS.map((exception) => exception.path));
  const unexpected = violations.filter((violation) => !excepted.has(violation.file));
  assert.deepEqual(
    unexpected.map(formatViolation),
    [],
    `hardcoded colors found — use token classes from src/styles/global.css:\n${unexpected.map(formatViolation).join("\n")}`,
  );
});

test("exception list: every entry exists, keeps its pinned violation count and names its slice", async () => {
  const { violations } = await scanSource();
  const paths = EXCEPTIONS.map((exception) => exception.path);
  assert.equal(new Set(paths).size, paths.length, "duplicate path in EXCEPTIONS");
  for (const exception of EXCEPTIONS) {
    assert.ok(["S-01", "S-10"].includes(exception.removedBy), `${exception.path}: removedBy must be S-01 or S-10`);
    assert.ok(exception.reason.length > 0, `${exception.path}: missing reason`);
    await assert.doesNotReject(
      access(path.join(REPO_ROOT, exception.path)),
      `${exception.path}: listed in EXCEPTIONS but does not exist — remove it from the list`,
    );
    const count = violations.filter((violation) => violation.file === exception.path).length;
    assert.ok(
      count > 0,
      `${exception.path}: listed in EXCEPTIONS but has no hardcoded color left — remove it from the list`,
    );
    assert.equal(
      count,
      exception.violations,
      `${exception.path}: ${count} hardcoded colors, EXCEPTIONS pins ${exception.violations} — a new color is not covered by the exception; after removing one, lower the count`,
    );
  }
});
