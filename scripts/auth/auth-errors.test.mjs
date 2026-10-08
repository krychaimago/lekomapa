// Error codes the sign-in and sign-up routes put in the URL (S-01, decision #34). The routes never pass a raw Supabase
// message on: every Supabase error becomes one of a fixed set of codes, and the page looks the text up in AUTH_COPY.

import assert from "node:assert/strict";
import { test } from "node:test";

import { signInErrorCode, signUpErrorCode } from "../../src/lib/auth/auth-errors.ts";
import { AUTH_COPY, authErrorMessage } from "../../src/lib/copy/auth.ts";

test("sign-up to an existing address ends like a new account, without an error code", () => {
  // Production answers an existing address with a fake success; local Supabase returns user_already_exists.
  // Both must reach the same "check your inbox" screen, so the form never reveals that an account exists.
  assert.equal(signUpErrorCode("user_already_exists"), null);
});

test("sign-up maps weak password and rate limits to their own codes, anything else to unknown", () => {
  assert.equal(signUpErrorCode("weak_password"), "weak_password");
  assert.equal(signUpErrorCode("over_email_send_rate_limit"), "rate_limit");
  assert.equal(signUpErrorCode("over_request_rate_limit"), "rate_limit");
  assert.equal(signUpErrorCode("unexpected_failure"), "unknown");
  assert.equal(signUpErrorCode(undefined), "unknown");
});

test("sign-in gives one code for a wrong password and a missing account", () => {
  assert.equal(signInErrorCode("invalid_credentials"), "credentials");
  assert.equal(signInErrorCode("user_not_found"), "credentials");
  assert.equal(signInErrorCode(undefined), "credentials");
  assert.equal(signInErrorCode("email_not_confirmed"), "unconfirmed");
});

test("every code a route can put in the URL has a message", () => {
  const routeCodes = [
    "weak_password",
    "over_email_send_rate_limit",
    "unexpected_failure",
    "invalid_credentials",
    "email_not_confirmed",
  ].flatMap((code) => [signUpErrorCode(code), signInErrorCode(code)]);
  // Validation codes the sign-up route sets itself, before Supabase is called.
  const validationCodes = ["invalid", "terms", "password_mismatch", "weak_password", "unknown"];
  for (const code of [...routeCodes, ...validationCodes].filter((code) => code !== null)) {
    assert.equal(typeof authErrorMessage(code), "string", code);
  }
});

test("a crafted error code in the URL shows nothing", () => {
  assert.equal(authErrorMessage("Invalid login credentials"), null);
  assert.equal(authErrorMessage("toString"), null);
  assert.equal(authErrorMessage(null), null);
  assert.equal(authErrorMessage("credentials"), AUTH_COPY.errors.credentials);
});
