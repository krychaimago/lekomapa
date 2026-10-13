// Proves that an error report sent to Sentry carries no health data and no field outside the allow-list
// (roadmap F-06: a test, not a comment). The message of a Postgres error can quote a medication name, a dose or row
// values, so the report keeps only the error class, a fixed label, a code, the route pattern and code locations.

import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { buildEnvelope, buildErrorEvent, parseDsn, sendEvent } from "../../src/lib/observability/error-report.ts";

const DSN = parseDsn("https://abc123public@o1.ingest.de.sentry.io/4500000000000001");
const NOW = new Date("2026-10-13T12:00:00.000Z");
const EVENT_ID = "0123456789abcdef0123456789abcdef";

const TOP_LEVEL_KEYS = [
  "environment",
  "event_id",
  "exception",
  "fingerprint",
  "level",
  "platform",
  "tags",
  "timestamp",
];
const TAG_KEYS = ["code", "route", "where"];
const FRAME_KEYS = new Set(["colno", "filename", "function", "lineno"]);

class DataError extends Error {
  constructor(message, details) {
    super(message);
    this.details = details;
  }
}

function errorWithStack(error, stack) {
  error.stack = stack;
  return error;
}

function build(overrides = {}) {
  return buildErrorEvent({
    where: "medications.create",
    code: "42501",
    route: "/leki/[id]",
    environment: "local",
    now: NOW,
    eventId: EVENT_ID,
    ...overrides,
  });
}

// Every way a medication name can reach the reporter: the message, a custom field, and a location with a query.
function leakyErrors() {
  const plain = errorWithStack(
    new Error("Ibuprofen 400 mg"),
    [
      "Error: Ibuprofen 400 mg",
      "    at insertMedication (https://lekomapa.pl/_worker.js/chunks/medications.mjs?q=Ibuprofen:12:34)",
      "    at async POST (https://lekomapa.pl/_worker.js/pages/api/medications.mjs#Ibuprofen:5:6)",
      "    at https://lekomapa.pl/_worker.js/index.js?q=Ibuprofen%20400%20mg:1:2",
    ].join("\n"),
  );
  const withDetails = new DataError("insert failed", { name: "Ibuprofen 400 mg", dose: "400 mg" });
  const multiline = errorWithStack(
    new Error("Ibuprofen 400 mg\n    at Ibuprofen (400 mg:1:1)"),
    "Error: Ibuprofen 400 mg\n    at Ibuprofen (400 mg:1:1)\n    at handler (https://lekomapa.pl/_worker.js/index.js:7:8)",
  );
  return { plain, withDetails, multiline };
}

describe("buildErrorEvent and buildEnvelope", () => {
  test("the serialized envelope carries no medication name or dose", () => {
    assert.ok(DSN);
    for (const [label, error] of Object.entries(leakyErrors())) {
      const envelope = buildEnvelope(build({ error }), DSN);
      const serialized = JSON.stringify(envelope);
      assert.ok(!serialized.includes("Ibuprofen"), `${label}: envelope contains the medication name`);
      assert.ok(!serialized.includes("400 mg"), `${label}: envelope contains the dose`);
    }
  });

  test("the stack is still reported, as code locations without query or fragment", () => {
    const frames = build({ error: leakyErrors().plain }).exception.values[0].stacktrace.frames;
    assert.deepEqual(
      frames.map((frame) => frame.filename),
      [
        "https://lekomapa.pl/_worker.js/index.js",
        "https://lekomapa.pl/_worker.js/pages/api/medications.mjs",
        "https://lekomapa.pl/_worker.js/chunks/medications.mjs",
      ],
    );
    assert.deepEqual(frames[2], {
      filename: "https://lekomapa.pl/_worker.js/chunks/medications.mjs",
      function: "insertMedication",
      lineno: 12,
      colno: 34,
    });
  });

  test("the event has exactly the allowed keys at the top level, in tags and in every frame", () => {
    const { plain } = leakyErrors();
    const event = build({ error: plain });
    assert.deepEqual(Object.keys(event).sort(), TOP_LEVEL_KEYS);
    assert.deepEqual(Object.keys(event.tags).sort(), TAG_KEYS);
    assert.deepEqual(Object.keys(event.exception).sort(), ["values"]);
    assert.equal(event.exception.values.length, 1);
    assert.deepEqual(Object.keys(event.exception.values[0]).sort(), ["stacktrace", "type", "value"]);
    assert.deepEqual(Object.keys(event.exception.values[0].stacktrace).sort(), ["frames"]);
    const frames = event.exception.values[0].stacktrace.frames;
    assert.ok(frames.length > 0, "no frames parsed, so the frame key check would prove nothing");
    for (const frame of frames) {
      for (const key of Object.keys(frame)) {
        assert.ok(FRAME_KEYS.has(key), `frame key outside the allow-list: ${key}`);
      }
    }
  });

  test("the platform is node, so Sentry does not treat the event as a browser one and derive a location from the IP", () => {
    assert.equal(build({ error: new Error("x") }).platform, "node");
  });

  test("count is the only extra tag, present only when given", () => {
    const event = build({ where: "cron.exceeded-cpu", code: 1102, count: 3, error: undefined, route: undefined });
    assert.deepEqual(Object.keys(event).sort(), TOP_LEVEL_KEYS);
    assert.deepEqual(Object.keys(event.tags).sort(), ["code", "count", "route", "where"]);
    assert.equal(event.tags.count, "3");
    assert.equal(event.tags.code, "1102");
    assert.ok(!("count" in build({ error: new Error("x") }).tags));
  });

  test("the error text is replaced with a fixed value", () => {
    for (const error of Object.values(leakyErrors())) {
      assert.equal(build({ error }).exception.values[0].value, "redacted");
    }
  });

  test("the type is the error class name", () => {
    assert.equal(build({ error: new TypeError("Ibuprofen") }).exception.values[0].type, "TypeError");
    assert.equal(build({ error: leakyErrors().withDetails }).exception.values[0].type, "DataError");
  });

  test("a name set to arbitrary text does not become the type", () => {
    const error = new Error("x");
    error.name = "Ibuprofen 400 mg";
    assert.equal(build({ error }).exception.values[0].type, "Error");
  });

  test("a value that is not an Error gives type NonError", () => {
    for (const error of ["Ibuprofen 400 mg", null]) {
      const event = build({ error });
      assert.equal(event.exception.values[0].type, "NonError");
      assert.deepEqual(Object.keys(event.exception.values[0]).sort(), ["type", "value"]);
      assert.ok(!JSON.stringify(event).includes("Ibuprofen"));
    }
  });

  test("the same error on another route gets another fingerprint", () => {
    const onList = build({ error: new TypeError("a"), route: "/leki" });
    const onJournal = build({ error: new TypeError("a"), route: "/dzienniczek" });
    assert.deepEqual(onList.fingerprint, ["medications.create", "42501", "TypeError", "/leki"]);
    assert.notDeepEqual(onList.fingerprint, onJournal.fingerprint);
  });

  test("a numeric status code lands in tags.code and in the fingerprint", () => {
    const event = build({ where: "request.5xx", code: 503, error: undefined, route: "/leki" });
    assert.equal(event.tags.code, "503");
    assert.ok(event.fingerprint.includes("503"));
  });

  test("the envelope goes to the project envelope endpoint with the public key", () => {
    assert.ok(DSN);
    const envelope = buildEnvelope(build({ error: new Error("x") }), DSN);
    assert.equal(envelope.url, "https://o1.ingest.de.sentry.io/api/4500000000000001/envelope/");
    assert.match(envelope.headers["X-Sentry-Auth"], /sentry_key=abc123public/);
    const lines = envelope.body.split("\n");
    assert.equal(lines.length, 3);
    assert.equal(JSON.parse(lines[1]).type, "event");
    assert.equal(JSON.parse(lines[2]).event_id, EVENT_ID);
  });
});

describe("parseDsn", () => {
  test("reads host, project and public key", () => {
    assert.deepEqual(DSN, { host: "o1.ingest.de.sentry.io", projectId: "4500000000000001", publicKey: "abc123public" });
  });

  test("rejects an invalid DSN with null instead of throwing", () => {
    for (const dsn of [
      "",
      "not a url",
      "https://o1.ingest.de.sentry.io/4500000000000001",
      "https://key@o1.ingest.de.sentry.io/",
      "https://key@o1.ingest.de.sentry.io/project",
      "http://key@o1.ingest.de.sentry.io/1",
    ]) {
      assert.equal(parseDsn(dsn), null, `accepted: ${JSON.stringify(dsn)}`);
    }
  });
});

describe("sendEvent", () => {
  const envelope = { url: "https://example.invalid/api/1/envelope/", headers: {}, body: "{}" };

  test("posts the envelope", async () => {
    const calls = [];
    await sendEvent(envelope, async (url, init) => {
      calls.push({ url, method: init.method, body: init.body });
      return { ok: true, status: 200 };
    });
    assert.deepEqual(calls, [{ url: envelope.url, method: "POST", body: "{}" }]);
  });

  test("does not reject when fetch throws", async () => {
    let called = false;
    await sendEvent(envelope, async () => {
      called = true;
      throw new TypeError("network down");
    });
    assert.ok(called, "fetch was never called, so the test proves nothing");
  });

  test("does not reject when Sentry answers 500", async () => {
    let called = false;
    await sendEvent(envelope, async () => {
      called = true;
      return { ok: false, status: 500 };
    });
    assert.ok(called, "fetch was never called, so the test proves nothing");
  });
});
