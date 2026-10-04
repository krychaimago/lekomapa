#!/usr/bin/env node
// PostToolUse (Write|Edit): lint only the file the agent just edited.
// Exit 2 + stderr is the only combination Claude sees; any other outcome exits 0.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

// Extensions covered by eslint.config.js (typescript-eslint, react, eslint-plugin-astro).
const LINTED = /\.(ts|tsx|js|jsx|mjs|cjs|astro)$/;

const root = process.env.CLAUDE_PROJECT_DIR || process.cwd();

let payload = {};
try {
  payload = JSON.parse(readFileSync(0, "utf8") || "{}");
} catch {
  process.exit(0);
}

const file = payload?.tool_input?.file_path ?? payload?.tool_input?.path;
if (typeof file !== "string" || file === "") process.exit(0);

const rel = path.relative(root, path.resolve(root, file));
// Outside the repo, or under .claude/ (ignored by the lint config).
if (rel.startsWith("..") || path.isAbsolute(rel) || rel.startsWith(".claude" + path.sep)) process.exit(0);
if (!LINTED.test(rel) || !existsSync(path.join(root, rel))) process.exit(0);

const result = spawnSync("npx", ["eslint", "--quiet", "--no-warn-ignored", rel], {
  cwd: root,
  encoding: "utf8",
  env: { ...process.env, NO_COLOR: "1", FORCE_COLOR: "0" },
});

if (result.status !== 0) {
  process.stderr.write(`ESLint reported errors in ${rel}:\n${result.stdout}${result.stderr}`);
  process.exit(2);
}
process.exit(0);
