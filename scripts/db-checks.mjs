// SQL gate runner: runs the SQL checks against the database container started by `npx supabase start`.
// Usage: npm run db:check                  -> every supabase/tests/*.sql, sorted by name
//        node scripts/db-checks.mjs <file>  -> only the given files (used by the probes in CI)
//
// The runner does not trust the SQL files to keep the gate honest, so it enforces three conditions itself:
//   - ON_ERROR_STOP comes from the command line, so a failed check ends psql with a non-zero code even when the
//     file forgets `\set ON_ERROR_STOP on`,
//   - the target is the local container named after project_id in supabase/config.toml, never SUPABASE_URL or
//     .env (which point at production), and every migration in supabase/migrations/ must be applied there,
//   - a file passes only when psql exits with 0 AND prints the notice `GATE_COMPLETE <file name without .sql>`,
//     so a file that stopped early or never ran its last check cannot count as green.
// Exits with 0 only when every file passed.

import { spawn, spawnSync } from "node:child_process";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

export const REPO_ROOT = path.resolve(import.meta.dirname, "..");
export const CONFIG_PATH = path.join(REPO_ROOT, "supabase", "config.toml");
export const MIGRATIONS_DIR = path.join(REPO_ROOT, "supabase", "migrations");
export const TESTS_DIR = path.join(REPO_ROOT, "supabase", "tests");

const MIGRATION_VERSION = /^(\d{14})_.+\.sql$/;
const COMPLETION_MARKER = /NOTICE:\s+GATE_COMPLETE\s+(\S+)\s*$/;

// Reads the top-level project_id from supabase/config.toml. Keys inside [sections] (e.g. a commented-out
// project_id of an auth provider) are ignored.
export function parseProjectId(toml) {
  for (const rawLine of toml.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.startsWith("[")) break;
    const match = /^project_id\s*=\s*(["'])([^"']+)\1\s*(#.*)?$/.exec(line);
    if (match) return match[2];
  }
  return null;
}

export function containerName(projectId) {
  return `supabase_db_${projectId}`;
}

// Migration versions (YYYYMMDDHHmmss prefix) from file names; files without the prefix are ignored.
export function migrationVersions(fileNames) {
  return fileNames
    .map((name) => MIGRATION_VERSION.exec(name)?.[1])
    .filter((version) => version !== undefined)
    .sort();
}

export function missingVersions(expected, applied) {
  const appliedSet = new Set(applied);
  return expected.filter((version) => !appliedSet.has(version));
}

export function checkName(filePath) {
  return path.basename(filePath, ".sql");
}

// True only when the psql output has a NOTICE line with the completion marker of exactly this file.
export function hasCompletionMarker(output, name) {
  return output.split(/\r?\n/).some((line) => COMPLETION_MARKER.exec(line)?.[1] === name);
}

// Decides the result of one file from the psql exit code and its combined output.
export function evaluateRun({ exitCode, output, name }) {
  if (exitCode !== 0) return { ok: false, reason: `psql exited with code ${String(exitCode)}` };
  if (!hasCompletionMarker(output, name)) {
    return { ok: false, reason: `file finished without completion marker (expected NOTICE GATE_COMPLETE ${name})` };
  }
  return { ok: true, reason: null };
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

function assertContainerRunning(container) {
  const result = spawnSync("docker", ["inspect", "-f", "{{.State.Running}}", container], { encoding: "utf8" });
  if (result.error) fail(`Cannot run docker: ${result.error.message}`);
  if (result.status !== 0) {
    fail(`Database container ${container} not found. Start the local database with: npx supabase start`);
  }
  if (result.stdout.trim() !== "true") {
    fail(`Database container ${container} is not running. Start the local database with: npx supabase start`);
  }
}

async function assertMigrationsApplied(container) {
  const expected = migrationVersions(await readdir(MIGRATIONS_DIR));
  const result = spawnSync(
    "docker",
    [
      "exec",
      container,
      "psql",
      "-X",
      "-At",
      "-v",
      "ON_ERROR_STOP=1",
      "-U",
      "postgres",
      "-d",
      "postgres",
      "-c",
      "select version from supabase_migrations.schema_migrations",
    ],
    { encoding: "utf8" },
  );
  if (result.error || result.status !== 0) {
    fail(`Cannot read applied migrations from ${container}: ${result.error?.message ?? result.stderr.trim()}`);
  }
  const applied = result.stdout.split(/\r?\n/).map((line) => line.trim());
  const missing = missingVersions(expected, applied);
  if (missing.length > 0) {
    fail(
      `Migrations not applied in ${container}: ${missing.join(", ")}. Reset the local database with: npx supabase db reset`,
    );
  }
  console.log(`Migrations applied in ${container}: ${String(expected.length)} of ${String(expected.length)}`);
}

// Runs one file through psql inside the container, streaming its output live and returning the exit code
// together with the combined output.
function runFile(container, sql) {
  return new Promise((resolve) => {
    const child = spawn("docker", [
      "exec",
      "-i",
      container,
      "psql",
      "-X",
      "-v",
      "ON_ERROR_STOP=1",
      "-U",
      "postgres",
      "-d",
      "postgres",
      "-f",
      "-",
    ]);
    let output = "";
    child.stdout.on("data", (chunk) => {
      process.stdout.write(chunk);
      output += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      process.stderr.write(chunk);
      output += String(chunk);
    });
    child.on("error", (error) => {
      output += `\n${error.message}`;
      resolve({ exitCode: -1, output });
    });
    child.on("close", (code) => {
      resolve({ exitCode: code ?? -1, output });
    });
    child.stdin.end(sql);
  });
}

async function defaultFiles() {
  const names = (await readdir(TESTS_DIR)).filter((name) => name.endsWith(".sql")).sort();
  return names.map((name) => path.join(TESTS_DIR, name));
}

async function main() {
  const projectId = parseProjectId(await readFile(CONFIG_PATH, "utf8"));
  if (!projectId) fail(`No top-level project_id in ${path.relative(REPO_ROOT, CONFIG_PATH)}`);
  const container = containerName(projectId);

  const args = process.argv.slice(2);
  const files = args.length > 0 ? args.map((file) => path.resolve(file)) : await defaultFiles();
  if (files.length === 0) fail(`No SQL files to run in ${path.relative(REPO_ROOT, TESTS_DIR)}`);

  assertContainerRunning(container);
  await assertMigrationsApplied(container);

  const failed = [];
  for (const file of files) {
    const relative = path.relative(REPO_ROOT, file);
    const name = checkName(file);
    console.log(`\n=== RUN ${relative} (container ${container}) ===`);
    let sql;
    try {
      sql = await readFile(file, "utf8");
    } catch (error) {
      console.error(`FAIL ${relative}: cannot read file (${error instanceof Error ? error.message : String(error)})`);
      failed.push(relative);
      continue;
    }
    const { ok, reason } = evaluateRun({ ...(await runFile(container, sql)), name });
    if (ok) {
      console.log(`PASS ${relative}`);
    } else {
      console.error(`FAIL ${relative}: ${String(reason)}`);
      failed.push(relative);
    }
  }

  if (failed.length > 0) {
    fail(`\nSQL checks failed: ${failed.join(", ")}`);
  }
  console.log(`\nAll SQL checks passed (${String(files.length)} file(s)).`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === import.meta.filename) await main();
