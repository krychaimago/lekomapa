import assert from "node:assert/strict";
import { test } from "node:test";

import {
  checkName,
  containerName,
  errorStopWeakening,
  evaluateRun,
  hasCompletionMarker,
  migrationVersions,
  missingVersions,
  parseProjectId,
} from "./db-checks.mjs";

test("project_id is read from the top level of config.toml", () => {
  const toml = [
    "# For detailed configuration reference documentation, visit:",
    "# A string used to distinguish different Supabase projects on the same host.",
    'project_id = "10x-astro-starter" # used as the container suffix',
    "",
    "[auth.external.apple]",
    'project_id = "my-firebase-project"',
  ].join("\n");
  assert.equal(parseProjectId(toml), "10x-astro-starter");
  assert.equal(containerName(parseProjectId(toml)), "supabase_db_10x-astro-starter");
});

test("project_id accepts single quotes and ignores commented-out and section keys", () => {
  assert.equal(parseProjectId("# project_id = \"old\"\nproject_id = 'lekomapa'\n"), "lekomapa");
  assert.equal(parseProjectId('[auth]\nproject_id = "inside-a-section"\n'), null);
  assert.equal(parseProjectId("project_id = unquoted\n"), null);
});

test("migration versions come from the YYYYMMDDHHmmss prefix; other files are ignored", () => {
  const files = [
    "20260924120000_registry_schema.sql",
    "20260922120000_medication_schema.sql",
    "README.md",
    "draft.sql",
    "2026092412_short_prefix.sql",
  ];
  assert.deepEqual(migrationVersions(files), ["20260922120000", "20260924120000"]);
});

test("every applied migration leaves nothing missing", () => {
  const expected = ["20260922120000", "20260924120000"];
  assert.deepEqual(missingVersions(expected, ["20260922120000", "20260924120000", "20260101000000"]), []);
});

test("a migration missing from the database is reported", () => {
  const expected = ["20260922120000", "20260924120000", "20260926120000"];
  assert.deepEqual(missingVersions(expected, ["20260922120000", "20260924120000"]), ["20260926120000"]);
});

test("check name is the file name without .sql", () => {
  assert.equal(checkName("/repo/supabase/tests/rls_checks.sql"), "rls_checks");
  assert.equal(checkName("scripts/db-checks/probes/failing-check.sql"), "failing-check");
});

test("GATE_COMPLETE of the current file is recognised in a psql NOTICE line", () => {
  const output = [
    "BEGIN",
    "psql:<stdin>:1218: NOTICE:  CHECK 17 OK: position constraint deferred",
    "psql:<stdin>:1223: NOTICE:  GATE_COMPLETE rls_checks",
    "ROLLBACK",
  ].join("\n");
  assert.equal(hasCompletionMarker(output, "rls_checks"), true);
  assert.deepEqual(evaluateRun({ exitCode: 0, output, name: "rls_checks" }), { ok: true, reason: null });
});

test("GATE_COMPLETE of another file does not count for the current one", () => {
  const output = "psql:<stdin>:10: NOTICE:  GATE_COMPLETE account_isolation_checks\n";
  assert.equal(hasCompletionMarker(output, "rls_checks"), false);
  assert.equal(hasCompletionMarker("psql:<stdin>:10: NOTICE:  GATE_COMPLETE rls_checks_extra\n", "rls_checks"), false);
});

test("the marker outside a NOTICE line does not count", () => {
  assert.equal(hasCompletionMarker("-- raise notice 'GATE_COMPLETE rls_checks'\n", "rls_checks"), false);
});

test("exit code 0 without the marker is a failure with its own message", () => {
  const result = evaluateRun({ exitCode: 0, output: "BEGIN\nROLLBACK\n", name: "missing-marker" });
  assert.equal(result.ok, false);
  assert.match(result.reason, /file finished without completion marker/);
});

test("a non-zero exit code fails even when the marker was printed", () => {
  const output = "psql:<stdin>:3: NOTICE:  GATE_COMPLETE failing-check\n";
  const result = evaluateRun({ exitCode: 3, output, name: "failing-check" });
  assert.equal(result.ok, false);
  assert.match(result.reason, /psql exited with code 3/);
});

test("a file that keeps ON_ERROR_STOP on is not flagged", () => {
  assert.equal(errorStopWeakening("begin;\n\\set ON_ERROR_STOP on\nselect 1;\n"), null);
  assert.equal(errorStopWeakening("\\set ON_ERROR_STOP true\n\\set ON_ERROR_STOP 1\n"), null);
  assert.equal(errorStopWeakening("-- the runner forces ON_ERROR_STOP from the command line\n"), null);
  assert.equal(errorStopWeakening("-- There is deliberately no `\\set ON_ERROR_STOP on` here\n"), null);
});

test("a file that turns ON_ERROR_STOP off is flagged with its line", () => {
  assert.deepEqual(errorStopWeakening("begin;\n\\set ON_ERROR_STOP off\n"), {
    line: 2,
    text: "\\set ON_ERROR_STOP off",
  });
  assert.equal(errorStopWeakening("\\unset ON_ERROR_STOP\n")?.line, 1);
  assert.equal(errorStopWeakening("\\set ON_ERROR_STOP 0\n")?.line, 1);
  assert.equal(errorStopWeakening("\\set ON_ERROR_STOP\n")?.line, 1);
  assert.equal(errorStopWeakening("  \\set ON_ERROR_STOP off\n")?.line, 1);
});
