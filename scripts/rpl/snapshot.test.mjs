import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, test } from "node:test";

import { HashMismatchError, loadVerifiedSnapshot, sha256File } from "./snapshot.mjs";

const dir = await mkdtemp(path.join(tmpdir(), "rpl-snapshot-"));
after(() => rm(dir, { recursive: true, force: true }));

const file = path.join(dir, "overall.xml");
await writeFile(file, "<produktyLecznicze/>");
const manifestPath = path.join(dir, "manifest.json");

async function writeManifest(sha256) {
  await writeFile(manifestPath, JSON.stringify({ stanNaDzien: "2026-09-23", sha256 }));
}

test("file matching the manifest hash passes", async () => {
  await writeManifest(await sha256File(file));
  const { filePath } = await loadVerifiedSnapshot(file, manifestPath);
  assert.equal(filePath, file);
});

test("file with a hash other than the manifest is rejected with a hash mismatch error", async () => {
  await writeManifest("0".repeat(64));
  await assert.rejects(loadVerifiedSnapshot(file, manifestPath), (error) => {
    assert.ok(error instanceof HashMismatchError);
    assert.match(error.message, /RPL hash mismatch/);
    return true;
  });
});
