#!/usr/bin/env node
// Stop: sweep everything this turn changed before the agent finishes, with one retry.
// Catches files rewritten through Bash too, which never reach the per-edit hook.
// Exit 2 + stderr sends the agent back to work; exit 0 lets it finish.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

const LINTED = /\.(ts|tsx|js|jsx|mjs|cjs|astro)$/;

const root = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const env = { ...process.env, NO_COLOR: "1", FORCE_COLOR: "0" };

let payload = {};
try {
  payload = JSON.parse(readFileSync(0, "utf8") || "{}");
} catch {
  payload = {};
}

// Already sent back once by this hook: let it finish. The commit gate and CI catch the rest.
// (loop_count covers Cursor, which imports hooks from .claude/settings.json.)
if (payload?.stop_hook_active === true || Number(payload?.loop_count ?? 0) > 0) process.exit(0);

// astro check colours its output even with NO_COLOR; the reader is a model, so strip ANSI codes.
const plain = (text) => (text ?? "").replace(/\x1b\[[0-9;]*m/g, "");
const run = (cmd, args) => {
  const result = spawnSync(cmd, args, { cwd: root, encoding: "utf8", env });
  return { status: result.status, stdout: plain(result.stdout), stderr: plain(result.stderr) };
};
const lines = (out) => (out ?? "").split("\n").filter(Boolean);

const changed = new Set([
  ...lines(run("git", ["diff", "--name-only", "HEAD"]).stdout),
  ...lines(run("git", ["ls-files", "-o", "--exclude-standard"]).stdout),
]);
// Nothing changed (a Q&A turn): nothing to check.
if (changed.size === 0) process.exit(0);

const files = [...changed].filter((f) => LINTED.test(f) && !f.startsWith(".claude/") && existsSync(`${root}/${f}`));

const report = [];

if (files.length > 0) {
  const lint = run("npx", ["eslint", "--quiet", "--no-warn-ignored", ...files]);
  if (lint.status !== 0) report.push(`ESLint errors in changed files:\n${lint.stdout}${lint.stderr}`);
}

// The whole unit suite runs in about a second, so run all of it: it also catches
// a red test in a module this turn only imported.
const tests = run("npm", ["test", "--silent"]);
if (tests.status !== 0) {
  const failing = `${tests.stdout}${tests.stderr}`
    .split("\n")
    .filter((l) => /^\s*(✖|not ok|ℹ (tests|pass|fail))|Error|expected|actual|\.test\.mjs/.test(l))
    .join("\n");
  report.push(`Unit tests fail (npm test):\n${failing || tests.stdout + tests.stderr}`);
}

// astro check runs astro sync itself, so gitignored .astro/ types are regenerated here.
const types = run("npx", ["astro", "check"]);
if (types.status !== 0) {
  const diagnostics = `${types.stdout}${types.stderr}`
    .split("\n")
    .filter((l) => /error|warning ts|- \d+ errors/i.test(l))
    .join("\n");
  report.push(`Typecheck fails (astro check):\n${diagnostics || types.stdout + types.stderr}`);
}

if (report.length > 0) {
  process.stderr.write(`Fix these before you finish:\n\n${report.join("\n\n")}\n`);
  process.exit(2);
}
process.exit(0);
