// Scheduled check for Worker runs killed for exceeding the CPU limit (Cloudflare error 1102). Such a run never reaches
// the middleware, so reportError cannot see it; only the Cloudflare statistics count it. Every 15 minutes the job asks
// the GraphQL Analytics API how many runs of the `lekomapa` script ended with status `exceededResources` and reports a
// non-zero count to Sentry. A check that could not read the statistics is reported as `check-failed`, never as `none`:
// a silent failure would look exactly like a healthy Worker. Each run also sends a Sentry Crons check-in, so a job
// that stopped running produces a mail too.
// No `astro:*` or `cloudflare:*` imports here, so `node --test` can load this module
// (scripts/observability/exceeded-cpu.test.mjs). src/worker.ts wires it to the `scheduled` handler.

import { buildEnvelope, buildErrorEvent, envelopeTarget, errorType, parseDsn, sendEvent } from "./error-report.ts";
import type { SentryDsn, SentryEnvelope } from "./error-report.ts";

export const SCRIPT_NAME = "lekomapa";
export const MONITOR_SLUG = "exceeded-cpu-check";
export const GRAPHQL_URL = "https://api.cloudflare.com/client/v4/graphql";

const WINDOW_MS = 15 * 60 * 1000;
// Cloudflare statistics reach the API a few minutes late, so the window ends this long before the scheduled time.
const DATA_DELAY_MS = 5 * 60 * 1000;
const EXCEEDED_STATUS = "exceededResources";
const DEFAULT_ENVIRONMENT = "production";

export interface CheckWindow {
  start: Date;
  end: Date;
}

export type CheckDecision =
  { kind: "exceeded"; count: number } | { kind: "none" } | { kind: "check-failed"; code: string };

// What the statistics request produced: a response (any HTTP status, body already parsed or null when it was not
// JSON) or no response at all.
export type QueryResult = { kind: "response"; status: number; body: unknown } | { kind: "network-error" };

export type CheckInStatus = "in_progress" | "ok" | "error";

export interface CheckInInput {
  slug: string;
  status: CheckInStatus;
  checkInId: string;
  environment: string;
  // Seconds, only on the closing check-in.
  duration?: number;
}

// The window ends on the last 15-minute boundary at or before the scheduled time, minus the data delay, and starts
// 15 minutes earlier. Runs 15 minutes apart give windows that touch: the start is included and the end is not
// (`datetime_geq` / `datetime_lt`), so no moment is counted twice or skipped.
export function checkWindow(scheduledTime: number): CheckWindow {
  const boundary = Math.floor(scheduledTime / WINDOW_MS) * WINDOW_MS;
  const end = boundary - DATA_DELAY_MS;
  return { start: new Date(end - WINDOW_MS), end: new Date(end) };
}

const QUERY = `query ExceededCpu($accountTag: string!, $start: Time!, $end: Time!, $script: string!) {
  viewer {
    accounts(filter: { accountTag: $accountTag }) {
      workersInvocationsAdaptive(
        limit: 100
        filter: { scriptName: $script, datetime_geq: $start, datetime_lt: $end }
      ) {
        sum { requests errors }
        dimensions { status }
      }
    }
  }
}`;

export function buildQuery(
  accountId: string,
  scriptName: string,
  window: CheckWindow,
): { query: string; variables: Record<string, string> } {
  return {
    query: QUERY,
    variables: {
      accountTag: accountId,
      start: window.start.toISOString(),
      end: window.end.toISOString(),
      script: scriptName,
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// Only a well-formed answer can say "none". Measured on the free plan: a successful answer has `errors: null`, and a
// status that did not occur in the window has no row at all, so a missing `exceededResources` row means zero.
export function decide(result: QueryResult): CheckDecision {
  if (result.kind === "network-error") {
    return { kind: "check-failed", code: "network" };
  }
  if (result.status < 200 || result.status >= 300) {
    return { kind: "check-failed", code: `http-${result.status}` };
  }
  const body = result.body;
  if (!isRecord(body)) {
    return { kind: "check-failed", code: "invalid-body" };
  }
  const errors = body.errors;
  if (errors !== undefined && errors !== null && !(Array.isArray(errors) && errors.length === 0)) {
    return { kind: "check-failed", code: "graphql-errors" };
  }
  const data = body.data;
  const viewer = isRecord(data) ? data.viewer : undefined;
  const accounts = isRecord(viewer) ? viewer.accounts : undefined;
  const account: unknown = Array.isArray(accounts) ? accounts[0] : undefined;
  const rows = isRecord(account) ? account.workersInvocationsAdaptive : undefined;
  if (!Array.isArray(rows)) {
    return { kind: "check-failed", code: "missing-field" };
  }
  let count = 0;
  for (const row of rows) {
    if (!isRecord(row) || !isRecord(row.dimensions) || !isRecord(row.sum)) {
      return { kind: "check-failed", code: "missing-field" };
    }
    if (row.dimensions.status !== EXCEEDED_STATUS) {
      continue;
    }
    const requests = row.sum.requests;
    if (typeof requests !== "number" || !Number.isInteger(requests) || requests < 0) {
      return { kind: "check-failed", code: "missing-field" };
    }
    count += requests;
  }
  return count > 0 ? { kind: "exceeded", count } : { kind: "none" };
}

// A `check_in` envelope item. No `monitor_config`: the monitor is created by hand in Sentry, so a check-in never
// creates or reconfigures one.
export function buildCheckInEnvelope(input: CheckInInput, dsn: SentryDsn): SentryEnvelope {
  const payload = {
    check_in_id: input.checkInId,
    monitor_slug: input.slug,
    status: input.status,
    environment: input.environment,
    ...(input.duration === undefined ? {} : { duration: input.duration }),
  };
  const envelopeHeader = JSON.stringify({ sent_at: new Date().toISOString() });
  const itemHeader = JSON.stringify({ type: "check_in" });
  return { ...envelopeTarget(dsn), body: `${envelopeHeader}\n${itemHeader}\n${JSON.stringify(payload)}` };
}

export interface CronEnv {
  SENTRY_DSN?: string;
  SENTRY_ENVIRONMENT?: string;
  CLOUDFLARE_ANALYTICS_TOKEN?: string;
  CLOUDFLARE_ACCOUNT_ID?: string;
}

export interface RunInput {
  env: CronEnv;
  scheduledTime: number;
  fetchImpl: typeof fetch;
  now?: () => Date;
  newId?: () => string;
}

// An empty secret behaves like a missing one (`wrangler secret put` accepts "").
function secret(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) {
    return undefined;
  }
  return trimmed;
}

function randomId(): string {
  return crypto.randomUUID().replaceAll("-", "");
}

// The token and the response body are never logged: only the decision and a fixed code leave this function.
async function queryStatistics(
  token: string,
  accountId: string,
  window: CheckWindow,
  fetchImpl: typeof fetch,
): Promise<QueryResult> {
  try {
    const response = await fetchImpl(GRAPHQL_URL, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify(buildQuery(accountId, SCRIPT_NAME, window)),
    });
    let body: unknown = null;
    try {
      body = await response.json();
    } catch {
      body = null;
    }
    return { kind: "response", status: response.status, body };
  } catch {
    return { kind: "network-error" };
  }
}

async function check(env: CronEnv, scheduledTime: number, fetchImpl: typeof fetch): Promise<CheckDecision> {
  const token = secret(env.CLOUDFLARE_ANALYTICS_TOKEN);
  if (!token) {
    return { kind: "check-failed", code: "missing-token" };
  }
  const accountId = secret(env.CLOUDFLARE_ACCOUNT_ID);
  if (!accountId) {
    return { kind: "check-failed", code: "missing-account-id" };
  }
  return decide(await queryStatistics(token, accountId, checkWindow(scheduledTime), fetchImpl));
}

// One scheduled run. Never rejects: a failure anywhere ends with a warning that names no content.
export async function runExceededCpuCheck(input: RunInput): Promise<CheckDecision | undefined> {
  const now = input.now ?? (() => new Date());
  const newId = input.newId ?? randomId;
  try {
    const rawDsn = secret(input.env.SENTRY_DSN);
    const dsn = rawDsn ? parseDsn(rawDsn) : null;
    if (rawDsn && !dsn) {
      console.warn("SENTRY_DSN is not a valid DSN");
    }
    const environment = secret(input.env.SENTRY_ENVIRONMENT) ?? DEFAULT_ENVIRONMENT;
    const checkInId = newId();
    const startedAt = now().getTime();

    if (dsn) {
      await sendEvent(
        buildCheckInEnvelope({ slug: MONITOR_SLUG, status: "in_progress", checkInId, environment }, dsn),
        input.fetchImpl,
      );
    }

    const decision = await check(input.env, input.scheduledTime, input.fetchImpl);

    if (decision.kind === "none") {
      console.info("cron.exceeded-cpu-check", { result: "none" });
    } else if (decision.kind === "exceeded") {
      console.error("cron.exceeded-cpu", { code: 1102, count: decision.count });
      if (dsn) {
        const event = buildErrorEvent({
          where: "cron.exceeded-cpu",
          code: 1102,
          count: decision.count,
          environment,
          now: now(),
          eventId: newId(),
        });
        await sendEvent(buildEnvelope(event, dsn), input.fetchImpl);
      }
    } else {
      console.error("cron.exceeded-cpu-check-failed", { code: decision.code });
      if (dsn) {
        const event = buildErrorEvent({
          where: "cron.exceeded-cpu-check-failed",
          code: decision.code,
          environment,
          now: now(),
          eventId: newId(),
        });
        await sendEvent(buildEnvelope(event, dsn), input.fetchImpl);
      }
    }

    if (dsn) {
      const duration = Math.max(0, (now().getTime() - startedAt) / 1000);
      await sendEvent(
        buildCheckInEnvelope(
          {
            slug: MONITOR_SLUG,
            status: decision.kind === "check-failed" ? "error" : "ok",
            checkInId,
            environment,
            duration,
          },
          dsn,
        ),
        input.fetchImpl,
      );
    }
    return decision;
  } catch (thrown) {
    console.warn("Exceeded CPU check failed", { name: errorType(thrown) });
    return undefined;
  }
}
