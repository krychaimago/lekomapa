// Builds the icon files in public/ from the brand mark (src/lib/brand-mark.ts) and the light-mode color tokens
// (src/styles/global.css): a --primary square with the mark in --primary-foreground. The output is deterministic,
// so a second run leaves every file byte-identical; scripts/icons/icons.test.mjs fails when the files drift.
//
// Run: npm run icons

import { Buffer } from "node:buffer";
import { writeFile } from "node:fs/promises";
import path from "node:path";

import sharp from "sharp";

import { BRAND_MARK, BRAND_TILE } from "../../src/lib/brand-mark.ts";
import { REPO_ROOT, loadTokenBlocks } from "../tokens/contrast.mjs";

export const PUBLIC_DIR = path.join(REPO_ROOT, "public");

// Side of the square viewBox the mark is drawn in.
export const MARK_BOX = BRAND_TILE.box;
// Corner radius of the rounded tab icon, in viewBox units: slightly rounded, not a circle.
const CORNER_RADIUS = BRAND_TILE.cornerRadius;

// Padding is the empty margin on each side, as a fraction of the tile.
// Tab icon: the mark fills the middle 80%. Phone icons: the middle 64%, inside the maskable safe zone
// (a circle of 80% diameter), so launchers that crop to a circle or squircle do not cut the mark.
export const TAB_PADDING = BRAND_TILE.padding;
export const PHONE_PADDING = 0.18;

export const RASTER_ICONS = [
  { file: "favicon.png", size: 32, padding: TAB_PADDING, rounded: true },
  { file: "apple-touch-icon.png", size: 180, padding: PHONE_PADDING, rounded: false },
  { file: "icon-192.png", size: 192, padding: PHONE_PADDING, rounded: false },
  { file: "icon-512.png", size: 512, padding: PHONE_PADDING, rounded: false },
];

function round(value) {
  return Number(value.toFixed(4));
}

// Light-mode colors of the icon, read from the token file — never typed in by hand.
export async function loadIconColors() {
  const { light } = await loadTokenBlocks();
  const background = light.get("primary");
  const mark = light.get("primary-foreground");
  if (!background || !mark) throw new Error("Missing --primary or --primary-foreground in the light (:root) block.");
  return { background, mark };
}

// Pure: the same input always yields the same SVG text.
// rounded: true only for the tab icon; phone icons get a full square background (the OS applies its own mask).
export function buildIconSvg({ padding, rounded, colors }) {
  const scale = round(1 - 2 * padding);
  const offset = round(MARK_BOX * padding);
  const corner = rounded ? ` rx="${CORNER_RADIUS}"` : "";
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${BRAND_MARK.viewBox}">` +
    `<rect width="${MARK_BOX}" height="${MARK_BOX}"${corner} fill="${colors.background}"/>` +
    `<g fill="${colors.mark}" fill-rule="evenodd" transform="translate(${offset} ${offset}) scale(${scale})">` +
    `<path d="${BRAND_MARK.paths.join(" ")}"/>` +
    `</g></svg>\n`
  );
}

async function renderPng(svg, { size, rounded }) {
  // Rasterize at the target size directly (density scales the 24-unit viewBox), so nothing is upscaled.
  let image = sharp(Buffer.from(svg), { density: (72 * size) / MARK_BOX }).resize(size, size);
  // Full-background icons carry no alpha channel at all: iOS fills transparency with black.
  if (!rounded) image = image.removeAlpha();
  return image.png({ compressionLevel: 9 }).toBuffer();
}

async function main() {
  const colors = await loadIconColors();

  const faviconSvg = buildIconSvg({ padding: TAB_PADDING, rounded: true, colors });
  await writeFile(path.join(PUBLIC_DIR, "favicon.svg"), faviconSvg);
  console.log("Wrote public/favicon.svg");

  for (const icon of RASTER_ICONS) {
    const svg = buildIconSvg({ padding: icon.padding, rounded: icon.rounded, colors });
    await writeFile(path.join(PUBLIC_DIR, icon.file), await renderPng(svg, icon));
    console.log(`Wrote public/${icon.file} (${icon.size}x${icon.size})`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === import.meta.filename) await main();
