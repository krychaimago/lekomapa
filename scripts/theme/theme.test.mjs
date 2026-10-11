// Color mode rules (dark-mode phase 1): an unknown cookie value never breaks the page, and the return path
// after saving the choice never leaves lekomapa.

import assert from "node:assert/strict";
import { test } from "node:test";

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
    "",
    undefined,
    42,
  ]) {
    assert.equal(safeReturnPath(value), "/", `value: ${JSON.stringify(value)}`);
  }
});
