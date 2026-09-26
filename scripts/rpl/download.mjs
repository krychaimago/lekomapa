// Downloads the RPL XML v6.0.0 into .cache/rpl/ and pins it in supabase/seed-data/rpl-snapshot.json.
// Usage: node scripts/rpl/download.mjs [--refresh]
//
// An existing manifest is never overwritten without --refresh: the manifest is what makes the generated data
// reproducible, and a silent re-pin would change the data under every migration generated from it.
// Without --refresh and with a manifest in place, the script only fetches the file when the cache lacks it,
// and refuses to keep a download whose hash differs from the pinned one.

import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, open, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { TextDecoder } from "node:util";

import {
  CACHE_DIR,
  MANIFEST_PATH,
  RPL_URL,
  SCHEMA_VERSION,
  cachedFilePath,
  readManifest,
  sha256File,
} from "./snapshot.mjs";

const refresh = process.argv.includes("--refresh");

// The file is ~75 MB; a stalled connection would otherwise hang the script forever.
const DOWNLOAD_TIMEOUT_MS = 10 * 60 * 1000;

async function exists(filePath) {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

// stanNaDzien is an attribute of the root element, so the first few kilobytes are enough.
async function readStanNaDzien(filePath) {
  const handle = await open(filePath, "r");
  try {
    const { buffer, bytesRead } = await handle.read({ buffer: new Uint8Array(8192), position: 0 });
    const head = new TextDecoder().decode(buffer.subarray(0, bytesRead));
    const match = /stanNaDzien="(\d{4}-\d{2}-\d{2})/.exec(head);
    if (!match) throw new Error(`No stanNaDzien attribute in the first ${bytesRead} bytes of ${filePath}.`);
    return match[1];
  } finally {
    await handle.close();
  }
}

async function download(target) {
  const response = await fetch(RPL_URL, { signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS) });
  if (!response.ok || !response.body) throw new Error(`GET ${RPL_URL} → HTTP ${response.status}`);
  const expectedBytes = Number(response.headers.get("content-length") ?? NaN);
  const hash = createHash("sha256");
  let bytes = 0;
  const counter = new Transform({
    transform(chunk, _encoding, callback) {
      hash.update(chunk);
      bytes += chunk.length;
      callback(null, chunk);
    },
  });
  await pipeline(Readable.fromWeb(response.body), counter, createWriteStream(target));
  // A connection cut mid-body can end the stream without an error; a short file must not be pinned.
  if (Number.isFinite(expectedBytes) && bytes !== expectedBytes) {
    throw new Error(`Downloaded ${bytes} bytes, Content-Length announced ${expectedBytes}.`);
  }
  return { sha256: hash.digest("hex"), bytes };
}

await mkdir(CACHE_DIR, { recursive: true });
const existing = (await exists(MANIFEST_PATH)) ? await readManifest() : null;

if (existing && !refresh) {
  const pinned = cachedFilePath(existing.stanNaDzien);
  if ((await exists(pinned)) && (await sha256File(pinned)) === existing.sha256) {
    console.log(`Manifest and cached file agree (stanNaDzien=${existing.stanNaDzien}). Nothing to do.`);
    console.log("Use --refresh to pin a new snapshot.");
    process.exit(0);
  }
}

const temp = path.join(CACHE_DIR, `download-${Date.now()}.tmp`);
console.log(`Downloading ${RPL_URL} …`);
let sha256, bytes, stanNaDzien;
try {
  ({ sha256, bytes } = await download(temp));
  stanNaDzien = await readStanNaDzien(temp);
} catch (error) {
  await rm(temp, { force: true });
  throw error;
}

if (existing && !refresh && sha256 !== existing.sha256) {
  await rm(temp);
  console.error(
    `Downloaded snapshot (stanNaDzien=${stanNaDzien}, sha256 ${sha256}) differs from the pinned one ` +
      `(stanNaDzien=${existing.stanNaDzien}, sha256 ${existing.sha256}). RPL publishes one file per day and ` +
      "the pinned one is no longer served. Re-run with --refresh to pin the new snapshot deliberately.",
  );
  process.exit(1);
}

const target = cachedFilePath(stanNaDzien);
await rename(temp, target);

const manifest = {
  url: RPL_URL,
  schemaVersion: SCHEMA_VERSION,
  stanNaDzien,
  sha256,
  bytes,
  downloadedAt: new Date().toISOString(),
};
if (!existing || refresh) {
  await writeFile(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + "\n");
  console.log(`Pinned ${path.relative(process.cwd(), target)} in ${path.relative(process.cwd(), MANIFEST_PATH)}.`);
} else {
  console.log(`Restored ${path.relative(process.cwd(), target)}; it matches the pinned manifest.`);
}
console.log(`stanNaDzien=${stanNaDzien} sha256=${sha256} bytes=${bytes}`);
