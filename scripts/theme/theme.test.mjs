// Color mode rules (dark-mode phase 1): an unknown cookie value never breaks the page, the return path
// after saving the choice never leaves lekomapa, and saving it stays behind the terms gate.

import assert from "node:assert/strict";
import { test } from "node:test";

import { termsGateAction } from "../../src/lib/auth/terms-gate.ts";
import { parseThemePreference, safeReturnPath } from "../../src/lib/theme.ts";

test("parseThemePreference falls back to system for anything unknown", () => {
  for (const value of [undefined, "", "DARK", "blue"]) {
    assert.equal(parseThemePreference(value), "system", `value: ${JSON.stringify(value)}`);
  }
});

test("parseThemePreference keeps the three allowed values", () => {
  for (const value of ["light", "dark", "system"]) {
    assert.equal(parseThemePreference(value), value);
  }
});

test("safeReturnPath keeps paths inside lekomapa", () => {
  const uuid = "3f2b8c1e-7a4d-4e9b-9c2a-1d5e6f7a8b9c";
  for (const value of ["/leki", `/leki/${uuid}/zmiana-dawki`]) {
    assert.equal(safeReturnPath(value), value);
  }
});

test("safeReturnPath sends everything else to /", () => {
  for (const value of [
    "//example.com",
    "/\\example.com",
    "https://example.com",
    "leki",
    "/leki?q=x",
    "/leki#x",
    "/\t/example.com",
    "/\n/example.com",
    "/ł",
    "",
    undefined,
    42,
  ]) {
    assert.equal(safeReturnPath(value), "/", `value: ${JSON.stringify(value)}`);
  }
});

test("the theme route answers 403 without the current terms version", () => {
  assert.equal(termsGateAction("/api/preferences/theme", null, 1), "forbid");
});
