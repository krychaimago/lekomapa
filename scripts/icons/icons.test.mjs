// The icon files in public/ are generated (npm run icons) from the brand mark and the light-mode tokens.
// These tests fail when the files drift from that source, when a size or the full background is lost,
// or when the manifest and the <head> links lose the agreed fields.

import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";

import sharp from "sharp";

import { PUBLIC_DIR, TAB_PADDING, buildIconSvg, loadIconColors } from "./generate-icons.mjs";

const LAYOUT_PATH = path.join(import.meta.dirname, "../../src/layouts/Layout.astro");

const EXPECTED_SIZES = {
  "favicon.png": 32,
  "apple-touch-icon.png": 180,
  "icon-192.png": 192,
  "icon-512.png": 512,
};

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

for (const file of ["apple-touch-icon.png", "icon-512.png"]) {
  test(`${file} has an opaque background up to the corners`, async () => {
    const { data, info } = await sharp(path.join(PUBLIC_DIR, file))
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const last = info.width - 1;
    const bottom = info.height - 1;
    for (const [x, y] of [
      [0, 0],
      [last, 0],
      [0, bottom],
      [last, bottom],
    ]) {
      const alpha = data[(y * info.width + x) * info.channels + 3];
      assert.equal(alpha, 255, `corner (${x}, ${y}) is not opaque`);
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
