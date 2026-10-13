// The 15-minute check for runs killed for exceeding the CPU limit (Cloudflare 1102). A check that could not read the
// statistics must say `check-failed`, never `none`: otherwise a broken token or a changed API looks like a healthy
// Worker. The check-in sent to Sentry Crons carries only the allowed fields and never configures the monitor.

import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { parseDsn } from "../../src/lib/observability/error-report.ts";
import {
  buildCheckInEnvelope,
  buildQuery,
  checkWindow,
  decide,
  runExceededCpuCheck,
} from "../../src/lib/observability/exceeded-cpu.ts";

const DSN = parseDsn("https://abc123public@o1.ingest.de.sentry.io/4500000000000001");
const FIFTEEN_MINUTES = 15 * 60 * 1000;
const CHECK_IN_KEYS = ["check_in_id", "environment", "monitor_slug", "status"];

// The answer measured on the author's free-plan account, with an extra row for the status under test.
function measuredBody(extraRows = []) {
  return {
    data: {
      viewer: {
        accounts: [
          {
            workersInvocationsAdaptive: [
              { dimensions: { status: "success" }, sum: { errors: 0, requests: 1274 } },
              { dimensions: { status: "clientDisconnected" }, sum: { errors: 0, requests: 10 } },
              ...extraRows,
            ],
          },
        ],
      },
    },
    errors: null,
  };
}

function exceededRow(requests) {
  return { dimensions: { status: "exceededResources" }, sum: { errors: requests, requests } };
}

function ok(body) {
  return { kind: "response", status: 200, body };
}

describe("checkWindow", () => {
  test("runs 15 minutes apart give windows that touch, without gap or overlap", () => {
    const first = checkWindow(Date.parse("2026-10-13T12:00:00.000Z"));
    const second = checkWindow(Date.parse("2026-10-13T12:15:00.000Z"));
    assert.equal(second.start.getTime(), first.end.getTime());
    assert.equal(first.end.getTime() - first.start.getTime(), FIFTEEN_MINUTES);
    assert.equal(second.end.getTime() - second.start.getTime(), FIFTEEN_MINUTES);
  });

  test("the window is aligned to the schedule and ends 5 minutes before it", () => {
    const window = checkWindow(Date.parse("2026-10-13T12:15:03.412Z"));
    assert.equal(window.start.toISOString(), "2026-10-13T11:55:00.000Z");
    assert.equal(window.end.toISOString(), "2026-10-13T12:10:00.000Z");
  });
});

describe("buildQuery", () => {
  test("asks for the lekomapa script in the window, end excluded", () => {
    const window = checkWindow(Date.parse("2026-10-13T12:00:00.000Z"));
    const { query, variables } = buildQuery("account-1", "lekomapa", window);
    assert.deepEqual(variables, {
      accountTag: "account-1",
      start: "2026-10-13T11:40:00.000Z",
      end: "2026-10-13T11:55:00.000Z",
      script: "lekomapa",
    });
    assert.match(query, /workersInvocationsAdaptive/);
    assert.match(query, /datetime_geq: \$start/);
    assert.match(query, /datetime_lt: \$end/);
    assert.match(query, /dimensions \{ status \}/);
  });
});

describe("decide", () => {
  test("no exceededResources row means none", () => {
    assert.deepEqual(decide(ok(measuredBody())), { kind: "none" });
  });

  test("an exceededResources row with 0 means none", () => {
    assert.deepEqual(decide(ok(measuredBody([exceededRow(0)]))), { kind: "none" });
  });

  test("an exceededResources row with 3 means exceeded with count 3", () => {
    assert.deepEqual(decide(ok(measuredBody([exceededRow(3)]))), { kind: "exceeded", count: 3 });
  });

  test("an empty errors array is not a failure", () => {
    const body = { ...measuredBody([exceededRow(2)]), errors: [] };
    assert.deepEqual(decide(ok(body)), { kind: "exceeded", count: 2 });
  });

  test("a response with GraphQL errors is check-failed", () => {
    const body = { data: null, errors: [{ message: "not authorized for that account" }] };
    assert.deepEqual(decide(ok(body)), { kind: "check-failed", code: "graphql-errors" });
  });

  test("errors next to data still mean check-failed", () => {
    const body = { ...measuredBody(), errors: [{ message: "partial" }] };
    assert.equal(decide(ok(body)).kind, "check-failed");
  });

  test("a response without the expected field is check-failed", () => {
    for (const body of [
      { errors: null },
      { data: { viewer: { accounts: [] } }, errors: null },
      { data: { viewer: { accounts: [{}] } }, errors: null },
      { data: { viewer: { accounts: [{ workersInvocationsAdaptive: null }] } }, errors: null },
      { data: { viewer: { accounts: [{ workersInvocationsAdaptive: [{ sum: { requests: 1 } }] }] } }, errors: null },
      measuredBody([{ dimensions: { status: "exceededResources" }, sum: {} }]),
    ]) {
      assert.deepEqual(decide(ok(body)), { kind: "check-failed", code: "missing-field" }, JSON.stringify(body));
    }
  });

  test("a body that is not JSON is check-failed", () => {
    assert.equal(decide(ok(null)).kind, "check-failed");
  });

  test("an HTTP error is check-failed", () => {
    assert.deepEqual(decide({ kind: "response", status: 403, body: measuredBody() }), {
      kind: "check-failed",
      code: "http-403",
    });
  });

  test("a network error is check-failed", () => {
    assert.deepEqual(decide({ kind: "network-error" }), { kind: "check-failed", code: "network" });
  });
});

describe("buildCheckInEnvelope", () => {
  function payloadOf(envelope) {
    const lines = envelope.body.split("\n");
    assert.equal(lines.length, 3);
    assert.deepEqual(JSON.parse(lines[1]), { type: "check_in" });
    return JSON.parse(lines[2]);
  }

  const base = { slug: "exceeded-cpu-check", checkInId: "0123456789abcdef0123456789abcdef", environment: "local" };

  test("without duration the payload has exactly the allowed keys", () => {
    assert.ok(DSN);
    const payload = payloadOf(buildCheckInEnvelope({ ...base, status: "in_progress" }, DSN));
    assert.deepEqual(Object.keys(payload).sort(), CHECK_IN_KEYS);
    assert.equal(payload.monitor_slug, "exceeded-cpu-check");
    assert.equal(payload.status, "in_progress");
    assert.ok(!("monitor_config" in payload));
  });

  test("with duration the payload has exactly the allowed keys plus duration", () => {
    assert.ok(DSN);
    const payload = payloadOf(buildCheckInEnvelope({ ...base, status: "ok", duration: 1.5 }, DSN));
    assert.deepEqual(Object.keys(payload).sort(), ["check_in_id", "duration", "environment", "monitor_slug", "status"]);
    assert.equal(payload.duration, 1.5);
    assert.ok(!("monitor_config" in payload));
  });

  test("goes to the project envelope endpoint with the public key", () => {
    assert.ok(DSN);
    const envelope = buildCheckInEnvelope({ ...base, status: "error", duration: 0 }, DSN);
    assert.equal(envelope.url, "https://o1.ingest.de.sentry.io/api/4500000000000001/envelope/");
    assert.match(envelope.headers["X-Sentry-Auth"], /sentry_key=abc123public/);
  });
});

describe("runExceededCpuCheck", () => {
  const env = {
    SENTRY_DSN: "https://abc123public@o1.ingest.de.sentry.io/4500000000000001",
    CLOUDFLARE_ANALYTICS_TOKEN: "secret-token-value",
    CLOUDFLARE_ACCOUNT_ID: "account-1",
    SENTRY_ENVIRONMENT: "local",
  };
  const scheduledTime = Date.parse("2026-10-13T12:00:00.000Z");

  function recorder(statistics) {
    const sentry = [];
    let statisticsCalls = 0;
    const fetchImpl = async (url, init) => {
      if (String(url).startsWith("https://api.cloudflare.com/")) {
        statisticsCalls += 1;
        return statistics();
      }
      const lines = String(init.body).split("\n");
      sentry.push({ type: JSON.parse(lines[1]).type, payload: JSON.parse(lines[2]) });
      return { ok: true, status: 200 };
    };
    return { fetchImpl, sentry, statisticsCalls: () => statisticsCalls };
  }

  function jsonResponse(status, body) {
    return { ok: status < 300, status, json: async () => body };
  }

  test("exceeded sends in_progress, an event with count, then ok with the same id", async () => {
    const { fetchImpl, sentry } = recorder(() => jsonResponse(200, measuredBody([exceededRow(3)])));
    const decision = await runExceededCpuCheck({ env, scheduledTime, fetchImpl });
    assert.deepEqual(decision, { kind: "exceeded", count: 3 });
    assert.deepEqual(
      sentry.map((item) => [item.type, item.payload.status ?? item.payload.tags.where]),
      [
        ["check_in", "in_progress"],
        ["event", "cron.exceeded-cpu"],
        ["check_in", "ok"],
      ],
    );
    assert.equal(sentry[0].payload.check_in_id, sentry[2].payload.check_in_id);
    assert.deepEqual(sentry[1].payload.tags, { where: "cron.exceeded-cpu", code: "1102", route: "", count: "3" });
  });

  test("a rejected token ends with a check-failed event and an error check-in, never none", async () => {
    const { fetchImpl, sentry } = recorder(() => jsonResponse(200, { data: null, errors: [{ message: "denied" }] }));
    const decision = await runExceededCpuCheck({ env, scheduledTime, fetchImpl });
    assert.deepEqual(decision, { kind: "check-failed", code: "graphql-errors" });
    assert.equal(sentry[1].payload.tags.where, "cron.exceeded-cpu-check-failed");
    assert.equal(sentry[2].payload.status, "error");
    assert.ok(!JSON.stringify(sentry).includes("secret-token-value"));
  });

  test("a network error is check-failed and does not reject", async () => {
    const { fetchImpl } = recorder(() => {
      throw new TypeError("network down");
    });
    assert.deepEqual(await runExceededCpuCheck({ env, scheduledTime, fetchImpl }), {
      kind: "check-failed",
      code: "network",
    });
  });

  test("a missing or empty token is check-failed without asking the statistics", async () => {
    for (const token of [undefined, "", "  "]) {
      const { fetchImpl, statisticsCalls } = recorder(() => jsonResponse(200, measuredBody()));
      const decision = await runExceededCpuCheck({
        env: { ...env, CLOUDFLARE_ANALYTICS_TOKEN: token },
        scheduledTime,
        fetchImpl,
      });
      assert.deepEqual(decision, { kind: "check-failed", code: "missing-token" });
      assert.equal(statisticsCalls(), 0);
    }
  });

  test("a missing account id is check-failed", async () => {
    const { fetchImpl } = recorder(() => jsonResponse(200, measuredBody()));
    const decision = await runExceededCpuCheck({
      env: { ...env, CLOUDFLARE_ACCOUNT_ID: "" },
      scheduledTime,
      fetchImpl,
    });
    assert.deepEqual(decision, { kind: "check-failed", code: "missing-account-id" });
  });

  test("without SENTRY_DSN nothing goes to Sentry, the check still runs", async () => {
    const { fetchImpl, sentry, statisticsCalls } = recorder(() => jsonResponse(200, measuredBody([exceededRow(1)])));
    const decision = await runExceededCpuCheck({ env: { ...env, SENTRY_DSN: undefined }, scheduledTime, fetchImpl });
    assert.deepEqual(decision, { kind: "exceeded", count: 1 });
    assert.equal(statisticsCalls(), 1);
    assert.deepEqual(sentry, []);
  });

  test("a failing Sentry does not reject and the check still decides", async () => {
    const fetchImpl = async (url) => {
      if (String(url).startsWith("https://api.cloudflare.com/")) {
        return jsonResponse(200, measuredBody());
      }
      throw new TypeError("sentry down");
    };
    assert.deepEqual(await runExceededCpuCheck({ env, scheduledTime, fetchImpl }), { kind: "none" });
  });
});
