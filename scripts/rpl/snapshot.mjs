// The pinned RPL snapshot: where the manifest lives, where the cached XML lands, and the hash gate every
// consumer (measure.mjs now, the migration generator later) runs before trusting the file. RPL changes every
// day, so a re-download gives different data than the manifest describes — only a matching hash counts.

import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";

export const REPO_ROOT = path.resolve(import.meta.dirname, "..", "..");
export const MANIFEST_PATH = path.join(REPO_ROOT, "supabase", "seed-data", "rpl-snapshot.json");
export const CACHE_DIR = path.join(REPO_ROOT, ".cache", "rpl");
export const RPL_URL = "https://rejestry.ezdrowie.gov.pl/api/rpl/medicinal-products/public-pl-report/6.0.0/overall.xml";
export const SCHEMA_VERSION = "6.0.0";

export function cachedFilePath(stanNaDzien) {
  return path.join(CACHE_DIR, `overall-${SCHEMA_VERSION}-${stanNaDzien}.xml`);
}

export async function sha256File(filePath) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filePath)) hash.update(chunk);
  return hash.digest("hex");
}

export async function readManifest(manifestPath = MANIFEST_PATH) {
  let text;
  try {
    text = await readFile(manifestPath, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") {
      throw new Error(`No RPL manifest at ${manifestPath} — run node scripts/rpl/download.mjs first.`, {
        cause: error,
      });
    }
    throw error;
  }
  return JSON.parse(text);
}

// Returns { manifest, filePath } only when the file's sha256 equals the manifest's. Any mismatch throws with
// both hashes in the message, so a refusal is never mistaken for some other failure.
export async function loadVerifiedSnapshot(fileOverride, manifestPath = MANIFEST_PATH) {
  const manifest = await readManifest(manifestPath);
  const filePath = fileOverride ? path.resolve(fileOverride) : cachedFilePath(manifest.stanNaDzien);
  let actual;
  try {
    actual = await sha256File(filePath);
  } catch (error) {
    if (error.code === "ENOENT") {
      throw new Error(`RPL file ${filePath} not found — the manifest pins stanNaDzien=${manifest.stanNaDzien}.`, {
        cause: error,
      });
    }
    throw error;
  }
  if (actual !== manifest.sha256) {
    throw new HashMismatchError(filePath, manifest.sha256, actual);
  }
  return { manifest, filePath };
}

export class HashMismatchError extends Error {
  constructor(filePath, expected, actual) {
    super(
      `RPL hash mismatch: ${filePath} has sha256 ${actual}, the manifest pins ${expected}. ` +
        "Refusing to work on data the manifest does not describe.",
    );
    this.name = "HashMismatchError";
  }
}
