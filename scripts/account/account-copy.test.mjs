// Account deletion screens (S-09): every text in src/lib/copy/account.ts passes the FR-012 stem filter, every error key
// the route can send back has a text, and /konto with everything below it is an interior screen behind the terms gate.
// No REQUIRED_PHRASE: these texts do not link a medicine to a symptom (see lessons.md, "Filtr języka…").

import assert from "node:assert/strict";
import { test } from "node:test";

import { termsGateAction } from "../../src/lib/auth/terms-gate.ts";
import { ACCOUNT_COPY, apiErrorMessage } from "../../src/lib/copy/account.ts";
import { INTERIOR_ROUTES, matchesNavHref } from "../../src/lib/navigation.ts";
import { forbiddenWordsIn } from "../rpl/pairs.mjs";

// → [[path, text]] for every string in the module. Any other value type fails loudly: a function or number
// would hide text from the filter.
function collectTexts(value, path = []) {
  if (typeof value === "string") return [[path.join("."), value]];
  if (value !== null && typeof value === "object") {
    return Object.entries(value).flatMap(([key, child]) => collectTexts(child, [...path, key]));
  }
  throw new TypeError(`${path.join(".")} is ${typeof value}, expected a string or an object of strings`);
}

const texts = collectTexts(ACCOUNT_COPY);

test("no account text hits a forbidden stem", () => {
  assert.ok(texts.length > 0, "module exports no texts");
  // No exception, not even the dose stem: "historia zmian", never "historia dawkowania".
  for (const [path, text] of texts) {
    assert.deepEqual(forbiddenWordsIn(text), [], `${path}: "${text}"`);
  }
});

test("every error key the deletion route sends back has a text", () => {
  // Written out by hand from the route's mapping, so a key dropped from the copy fails here.
  for (const code of ["wrongPassword", "rateLimit", "sessionExpired", "deleteGeneric"]) {
    const message = apiErrorMessage(code);
    assert.equal(typeof message, "string", code);
    assert.ok(message.trim().length > 0, code);
  }
});

test("an unknown or missing error key shows no text", () => {
  for (const code of [null, undefined, "", "toString", "__proto__", "invalid_credentials", "<b>x</b>"]) {
    assert.equal(apiErrorMessage(code), null, String(code));
  }
});

test("the confirmation says what goes and that it cannot be undone", () => {
  const deletion = ACCOUNT_COPY.deletion;
  const all = collectTexts(deletion)
    .map(([, text]) => text)
    .join(" ");
  for (const fragment of ["leki", "historią zmian", "dzienniczka", "akceptacji warunków", "Pytania do lekarza"]) {
    assert.ok(all.includes(fragment), fragment);
  }
  assert.ok(deletion.irreversible.includes("kopia"));
  assert.ok(deletion.irreversible.includes("cofnąć"));
});

test("the account screens are interior and behind the terms gate", () => {
  for (const path of ["/konto", "/konto/usun"]) {
    assert.ok(
      INTERIOR_ROUTES.some((route) => matchesNavHref(path, route)),
      path,
    );
    assert.equal(termsGateAction(path, null, 1), "redirect", path);
    assert.equal(termsGateAction(path, 1, 1), "allow", path);
  }
});

test("the deletion route answers 403 without the current terms version, the public page needs none", () => {
  assert.equal(termsGateAction("/api/account/delete", null, 1), "forbid");
  assert.equal(termsGateAction("/auth/konto-usuniete", null, 1), "allow");
});
