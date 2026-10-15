// The icon files in public/ are generated (npm run icons) from the brand mark and the light-mode tokens.
// favicon.svg must equal the generated text. PNGs are checked by size and at two pixels: one inside the
// filled half of the mark and one on the background, both against the tokens, so a stale PNG fails after
// a color change. The manifest and the <head> links must keep the agreed fields.

import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";

import sharp from "sharp";

import { MARK_BOX, PUBLIC_DIR, RASTER_ICONS, TAB_PADDING, buildIconSvg, loadIconColors } from "./generate-icons.mjs";

const LAYOUT_PATH = path.join(import.meta.dirname, "../../src/layouts/Layout.astro");

const EXPECTED_SIZES = {
  "favicon.png": 32,
  "apple-touch-icon.png": 180,
  "icon-192.png": 192,
  "icon-512.png": 512,
};

// A point well inside the filled (lower-left) half of the capsule, in BRAND_MARK viewBox units.
// Move it when the shape changes: it must stay inside the filled half, away from its edges.
const POINT_IN_MARK = [9.5, 14.5];
// A point on the tile background, left of the mark and away from the rounded corners, in tile units.
const POINT_ON_BACKGROUND = [1.5, 12];
// Per-channel slack for libvips rasterization, not room for a different color.
const CHANNEL_TOLERANCE = 8;

function hexToRgb(hex) {
  assert.match(hex, /^#[0-9a-f]{6}$/i, `token ${hex} is not #rrggbb`);
  const value = Number.parseInt(hex.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

// Width and height from the IHDR chunk, which always follows the 8-byte PNG signature.
function pngSize(buffer) {
  assert.equal(buffer.toString("hex", 0, 8), "89504e470d0a1a0a", "not a PNG file");
  assert.equal(buffer.toString("ascii", 12, 16), "IHDR");
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

function tagsOf(source, tagName) {
  return [...source.matchAll(new RegExp(`<${tagName}\\b[^>]*>`, "g"))].map(([tag]) =>
    Object.fromEntries([...tag.matchAll(/([\w-]+)="([^"]*)"/g)].map(([, name, value]) => [name, value])),
  );
}

test("favicon.svg matches the brand mark and the light-mode tokens", async () => {
  const expected = buildIconSvg({ padding: TAB_PADDING, rounded: true, colors: await loadIconColors() });
  const actual = await readFile(path.join(PUBLIC_DIR, "favicon.svg"), "utf8");
  assert.equal(actual, expected, "public/favicon.svg is stale — run npm run icons");
});

test("favicon.svg draws the mark in one path, so the even-odd hole survives", async () => {
  const svg = await readFile(path.join(PUBLIC_DIR, "favicon.svg"), "utf8");
  assert.equal(svg.match(/<path\b/g)?.length, 1);
  assert.match(svg, /fill-rule="evenodd"/);
});

for (const [file, size] of Object.entries(EXPECTED_SIZES)) {
  test(`${file} is ${size}x${size}`, async () => {
    const { width, height } = pngSize(await readFile(path.join(PUBLIC_DIR, file)));
    assert.deepEqual({ width, height }, { width: size, height: size });
  });
}

// Full-background phone icons carry no alpha channel at all: iOS fills transparency with black.
for (const icon of RASTER_ICONS.filter(({ rounded }) => !rounded)) {
  test(`${icon.file} has no alpha channel`, async () => {
    const { hasAlpha } = await sharp(path.join(PUBLIC_DIR, icon.file)).metadata();
    assert.equal(hasAlpha, false, `${icon.file} has an alpha channel — run npm run icons`);
  });
}

for (const icon of RASTER_ICONS) {
  test(`${icon.file} draws the mark and the background in the light-mode tokens`, async () => {
    const colors = await loadIconColors();
    const { data, info } = await sharp(path.join(PUBLIC_DIR, icon.file))
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const scale = 1 - 2 * icon.padding;
    const offset = MARK_BOX * icon.padding;
    const markPoint = POINT_IN_MARK.map((value) => offset + scale * value);
    for (const [label, [x, y], hex] of [
      ["mark", markPoint, colors.mark],
      ["background", POINT_ON_BACKGROUND, colors.background],
    ]) {
      const px = Math.floor((x * info.width) / MARK_BOX);
      const py = Math.floor((y * info.height) / MARK_BOX);
      const start = (py * info.width + px) * info.channels;
      const actual = [...data.subarray(start, start + 3)];
      const expected = hexToRgb(hex);
      assert.ok(
        actual.every((channel, k) => Math.abs(channel - expected[k]) <= CHANNEL_TOLERANCE),
        `${icon.file}: ${label} pixel (${px}, ${py}) is rgb(${actual.join(", ")}), expected ${hex} — run npm run icons`,
      );
    }
  });
}

test("manifest keeps the agreed fields and points at existing icons", async () => {
  const manifest = JSON.parse(await readFile(path.join(PUBLIC_DIR, "manifest.webmanifest"), "utf8"));
  assert.equal(manifest.display, "browser");
  assert.equal(manifest.start_url, "/");
  assert.equal(manifest.name, "lekomapa");
  assert.ok(Array.isArray(manifest.icons) && manifest.icons.length > 0, "manifest has no icons");
  for (const icon of manifest.icons) {
    await assert.doesNotReject(access(path.join(PUBLIC_DIR, icon.src.replace(/^\//, ""))), `missing ${icon.src}`);
  }
  assert.ok(
    manifest.icons.some((icon) => icon.purpose === "maskable"),
    "manifest has no maskable icon",
  );
});

test("Layout.astro links the icons and the manifest in <head>", async () => {
  const source = await readFile(LAYOUT_PATH, "utf8");
  const head = /<head>([\s\S]*?)<\/head>/.exec(source)?.[1] ?? "";
  const links = tagsOf(head, "link");
  const has = (expected) =>
    links.some((link) => Object.entries(expected).every(([name, value]) => link[name] === value));

  assert.ok(has({ rel: "icon", href: "/favicon.svg", type: "image/svg+xml" }), "missing SVG favicon link");
  assert.ok(has({ rel: "icon", href: "/favicon.png", type: "image/png", sizes: "32x32" }), "missing PNG fallback");
  assert.ok(has({ rel: "apple-touch-icon", href: "/apple-touch-icon.png" }), "missing apple-touch-icon link");
  assert.ok(has({ rel: "manifest", href: "/manifest.webmanifest" }), "missing manifest link");
  assert.ok(
    tagsOf(head, "meta").some((meta) => meta.name === "apple-mobile-web-app-title" && meta.content === "lekomapa"),
    "missing apple-mobile-web-app-title",
  );
});
