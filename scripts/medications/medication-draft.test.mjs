// Drafts of the add-medication screens kept in HttpOnly cookies instead of the URL (lesson "Żadna nazwa leku ani
// dawka w adresie URL"). A cookie is input from the browser: the parse functions must give back only a well-formed
// draft of the signed-in account, never another account's text and never a dose.

import assert from "node:assert/strict";
import { test } from "node:test";

import { parseLeafletDraft, parseRegistrySearch } from "../../src/lib/medication-draft.ts";

const USER = "8f1c2d9e-0000-4000-8000-000000000001";
const OTHER_USER = "8f1c2d9e-0000-4000-8000-000000000002";

const leaflet = (fields) =>
  JSON.stringify({
    userId: USER,
    productName: "Ibuprom",
    substanceName: "ibuprofen",
    startedOn: "2026-10-01",
    unmatched: false,
    ...fields,
  });

test("a search draft of the signed-in account comes back with its text", () => {
  assert.deepEqual(parseRegistrySearch(JSON.stringify({ userId: USER, q: "Ibuprom" }), USER), {
    userId: USER,
    q: "Ibuprom",
  });
});

test("a leaflet draft of the signed-in account comes back with its fields", () => {
  assert.deepEqual(parseLeafletDraft(leaflet({ unmatched: true }), USER), {
    userId: USER,
    productName: "Ibuprom",
    substanceName: "ibuprofen",
    startedOn: "2026-10-01",
    unmatched: true,
  });
});

test("another account's draft reads as no draft", () => {
  assert.equal(parseRegistrySearch(JSON.stringify({ userId: OTHER_USER, q: "Ibuprom" }), USER), null);
  assert.equal(parseLeafletDraft(leaflet({ userId: OTHER_USER }), USER), null);
});

test("a draft without an account id reads as no draft", () => {
  assert.equal(parseRegistrySearch(JSON.stringify({ q: "Ibuprom" }), USER), null);
  assert.equal(parseLeafletDraft(leaflet({ userId: undefined }), USER), null);
});

test("a cookie that is not JSON reads as no draft", () => {
  assert.equal(parseRegistrySearch("not json", USER), null);
  assert.equal(parseLeafletDraft("{", USER), null);
  assert.equal(parseRegistrySearch(undefined, USER), null);
  assert.equal(parseLeafletDraft("", USER), null);
});

test("a cookie of the wrong shape reads as no draft", () => {
  assert.equal(parseRegistrySearch(JSON.stringify([USER, "Ibuprom"]), USER), null);
  assert.equal(parseRegistrySearch(JSON.stringify({ userId: USER, q: 42 }), USER), null);
  assert.equal(parseLeafletDraft(leaflet({ productName: 42 }), USER), null);
  assert.equal(parseLeafletDraft(leaflet({ unmatched: "true" }), USER), null);
});

test("text longer than 200 characters is cut to 200", () => {
  const long = "a".repeat(250);
  assert.equal(parseRegistrySearch(JSON.stringify({ userId: USER, q: long }), USER)?.q, "a".repeat(200));
  const draft = parseLeafletDraft(leaflet({ productName: long, substanceName: long }), USER);
  assert.equal(draft?.productName, "a".repeat(200));
  assert.equal(draft?.substanceName, "a".repeat(200));
});

test("a start date that is not a real ISO date is dropped, the rest of the draft stays", () => {
  for (const startedOn of ["2026-02-30", "01.10.2026", "2026-1-5", "2026-10-01T00:00:00Z", "yesterday"]) {
    const draft = parseLeafletDraft(leaflet({ startedOn }), USER);
    assert.equal(draft?.startedOn, null, startedOn);
    assert.equal(draft?.productName, "Ibuprom", startedOn);
  }
});

test("a dose in the cookie never comes out of the draft", () => {
  const draft = parseLeafletDraft(leaflet({ doseText: "2 tabletki rano" }), USER);
  assert.ok(draft);
  assert.equal(Object.hasOwn(draft, "doseText"), false);
  assert.doesNotMatch(JSON.stringify(draft), /tabletki/);

  const search = parseRegistrySearch(JSON.stringify({ userId: USER, q: "Ibuprom", doseText: "2 tabletki" }), USER);
  assert.deepEqual(search, { userId: USER, q: "Ibuprom" });
});
