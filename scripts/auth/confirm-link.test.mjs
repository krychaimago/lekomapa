// Screen chosen by /auth/confirm (S-01, phase 6). The URLs below are the redirects measured on 2026-10-08 against
// Supabase's default confirmation template, which production sends until custom SMTP (F-05) allows our own.

import assert from "node:assert/strict";
import { test } from "node:test";

import { confirmLinkScreen } from "../../src/lib/auth/confirm-link.ts";

const screenOf = (query) => confirmLinkScreen(new URLSearchParams(query)).screen;

test("our template's token shows the confirm button and carries the token", () => {
  assert.deepEqual(confirmLinkScreen(new URLSearchParams("token_hash=abc123&type=email")), {
    screen: "token",
    tokenHash: "abc123",
  });
});

test("default template, first click: Supabase already confirmed the address", () => {
  assert.equal(screenOf("code=3f5882a1-0000-4000-8000-000000000000"), "confirmed");
});

test("default template, used or expired link: Supabase sends an error", () => {
  assert.equal(
    screenOf("error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired"),
    "expired",
  );
  // An error wins over anything else in the query.
  assert.equal(screenOf("error=access_denied&code=abc"), "expired");
  assert.equal(screenOf("error=access_denied&token_hash=abc&type=email"), "expired");
});

test("results of the confirm POST", () => {
  assert.equal(screenOf("confirmed=1"), "confirmed");
  assert.equal(screenOf("expired=1"), "expired");
  assert.equal(screenOf("expired=1&token_hash=abc&type=email"), "expired");
});

test("a link without a usable token or code shows the expired screen", () => {
  for (const query of ["", "token_hash=abc", "token_hash=abc&type=recovery", "type=email", "code="]) {
    assert.equal(screenOf(query), "expired", query || "(empty)");
  }
});
