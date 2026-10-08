// Terms version gate (S-01, phase 4). A signed-in account without acceptance of the current terms version must not
// reach the interior or write data: interior screens redirect to the acceptance screen, API routes answer 403.
// The exempt paths are what keeps the gate from looping or locking the account out of signing out.

import assert from "node:assert/strict";
import { test } from "node:test";

import { TERMS_ACCEPTANCE_PATH, isTermsGatedPath, termsGateAction } from "../../src/lib/auth/terms-gate.ts";

const CURRENT = 1;
const UUID = "3f1c2a9e-8b7d-4c6e-9a1f-2b3c4d5e6f70";

const EXEMPT_PATHS = [
  "/",
  "/warunki",
  "/prywatnosc",
  "/warunki/akceptacja",
  "/api/terms/accept",
  "/api/auth/signout",
  "/api/auth/signin",
  "/auth/signin",
  "/auth/confirm-email",
  "/auth/reset-password",
];

const INTERIOR_PATHS = ["/dashboard", "/leki", `/leki/${UUID}`, "/dzienniczek", "/dzienniczek/nowy"];

const API_PATHS = ["/api/journal", `/api/medications/${UUID}/dosage`, "/api/registry/search"];

test("the acceptance screen lives at /warunki/akceptacja", () => {
  assert.equal(TERMS_ACCEPTANCE_PATH, "/warunki/akceptacja");
});

test("exempt paths are allowed and never gated, whatever the accepted version", () => {
  for (const path of EXEMPT_PATHS) {
    assert.equal(isTermsGatedPath(path), false, path);
    for (const version of [null, 0, CURRENT]) {
      assert.equal(termsGateAction(path, version, CURRENT), "allow", `${path} with ${version}`);
    }
  }
});

test("interior screens redirect to acceptance when the current version is missing or older", () => {
  for (const path of INTERIOR_PATHS) {
    assert.equal(isTermsGatedPath(path), true, path);
    assert.equal(termsGateAction(path, null, CURRENT), "redirect", `${path} with null`);
    assert.equal(termsGateAction(path, 0, CURRENT), "redirect", `${path} with 0`);
  }
});

test("API routes answer forbid when the current version is missing or older", () => {
  for (const path of API_PATHS) {
    assert.equal(isTermsGatedPath(path), true, path);
    assert.equal(termsGateAction(path, null, CURRENT), "forbid", `${path} with null`);
    assert.equal(termsGateAction(path, 0, CURRENT), "forbid", `${path} with 0`);
  }
});

test("an account with the current or a newer version is allowed everywhere", () => {
  for (const path of [...INTERIOR_PATHS, ...API_PATHS]) {
    assert.equal(termsGateAction(path, CURRENT, CURRENT), "allow", path);
    assert.equal(termsGateAction(path, CURRENT + 1, CURRENT), "allow", path);
  }
  // Version 2 becomes current: an account that accepted only version 1 is sent back to acceptance.
  assert.equal(termsGateAction("/leki", 1, 2), "redirect");
  assert.equal(termsGateAction("/api/journal", 1, 2), "forbid");
});

test(".html and trailing slash variants are gated and exempted like the plain path", () => {
  for (const path of ["/leki.html", "/leki/", "/dashboard.html", "/dzienniczek/nowy/"]) {
    assert.equal(isTermsGatedPath(path), true, path);
    assert.equal(termsGateAction(path, null, CURRENT), "redirect", path);
  }
  assert.equal(termsGateAction("/api/journal/", null, CURRENT), "forbid");
  for (const path of ["/warunki/akceptacja.html", "/warunki/akceptacja/", "/prywatnosc/", "/warunki.html"]) {
    assert.equal(isTermsGatedPath(path), false, path);
    assert.equal(termsGateAction(path, null, CURRENT), "allow", path);
  }
});

test("lookalike paths do not borrow an exemption", () => {
  // A prefix match without the slash would open /api/termsx or /api/authx to an account without acceptance.
  for (const path of ["/api/termsx", "/api/authx/anything", "/api/terms-export"]) {
    assert.equal(termsGateAction(path, null, CURRENT), "forbid", path);
  }
  assert.equal(termsGateAction("/leki-archiwum", null, CURRENT), "allow");
});
