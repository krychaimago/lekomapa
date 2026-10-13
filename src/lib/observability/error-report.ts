// Builds and sends a Sentry error event from an allow-list of fields only. The error message never goes out: it can
// carry a medication name, a substance, a dose or row values quoted by Postgres. What leaves is the error class name,
// a fixed label, a code, the route pattern (`/leki/[id]`, never the address) and code locations from the stack.
// No `astro:*` or `cloudflare:*` imports here, so `node --test` can load this module
// (scripts/observability/error-report.test.mjs). The runtime part lives in ./report.ts.

export interface SentryFrame {
  filename: string;
  function: string;
  lineno?: number;
  colno?: number;
}

export interface SentryEvent {
  event_id: string;
  timestamp: number;
  platform: "javascript";
  level: "error";
  environment: string;
  // `count` only on the cron.exceeded-cpu event: the number of Worker runs killed for exceeding CPU (Cloudflare 1102).
  tags: { where: string; code: string; route: string; count?: string };
  fingerprint: string[];
  exception: {
    values: [{ type: string; value: "redacted"; stacktrace: { frames: SentryFrame[] } }];
  };
}

export interface SentryDsn {
  host: string;
  projectId: string;
  publicKey: string;
}

export interface SentryEnvelope {
  url: string;
  headers: Record<string, string>;
  body: string;
}

export interface ErrorEventInput {
  where: string;
  code?: string | number;
  error?: unknown;
  route?: string;
  count?: number;
  environment: string;
  now: Date;
  eventId: string;
}

const NON_ERROR_TYPE = "NonError";
const REDACTED = "redacted";
const MAX_FRAMES = 50;
const IDENTIFIER = /^[A-Za-z_$][\w$]*$/;
// V8 function names in a stack: identifiers joined by dots, plus `<anonymous>`, `new `, `async ` and `[as x]`.
const FRAME_FUNCTION = /^[\w$.<> [\]]+$/;

// The class name only when it is a plain identifier. `error.name` is never read: any code can set it to any text.
export function errorType(error: unknown): string {
  if (!(error instanceof Error)) {
    return NON_ERROR_TYPE;
  }
  const name = (error.constructor as { name?: unknown } | undefined)?.name;
  return typeof name === "string" && IDENTIFIER.test(name) ? name : "Error";
}

// The query and the fragment can carry user text (`?q=…`), so only the path part of a location survives.
function stripLocation(filename: string): string {
  const cut = filename.search(/[?#]/);
  return cut === -1 ? filename : filename.slice(0, cut);
}

function toNumber(value: string | undefined): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : undefined;
}

function parseLocation(location: string): { filename: string; lineno?: number; colno?: number } {
  const match = /^(.*?):(\d+):(\d+)$/.exec(location);
  if (!match) {
    return { filename: stripLocation(location) };
  }
  return { filename: stripLocation(match[1]), lineno: toNumber(match[2]), colno: toNumber(match[3]) };
}

// Frames from a V8 stack, oldest last. The first line of a stack repeats the message, and a message with line breaks
// could imitate frame lines, so the message is cut out before any line is read and only `at …` lines are parsed.
function stackFrames(error: unknown): SentryFrame[] {
  if (!(error instanceof Error) || typeof error.stack !== "string") {
    return [];
  }
  let stack = error.stack;
  const message = error.message;
  // The header comes first, so the first occurrence is the one in the header.
  const messageAt = message ? stack.indexOf(message) : -1;
  if (messageAt !== -1) {
    stack = stack.slice(0, messageAt) + stack.slice(messageAt + message.length);
  }
  const frames: SentryFrame[] = [];
  for (const rawLine of stack.split("\n")) {
    const line = rawLine.trim();
    if (!line.startsWith("at ")) {
      continue;
    }
    const body = line.slice(3);
    const withFunction = /^(.*?) \((.*)\)$/.exec(body);
    const functionName = withFunction ? withFunction[1] : "";
    const location = parseLocation(withFunction ? withFunction[2] : body);
    frames.push({
      filename: location.filename,
      function: functionName && FRAME_FUNCTION.test(functionName) ? functionName : "?",
      ...(location.lineno === undefined ? {} : { lineno: location.lineno }),
      ...(location.colno === undefined ? {} : { colno: location.colno }),
    });
    if (frames.length >= MAX_FRAMES) {
      break;
    }
  }
  // Sentry expects the oldest frame first; V8 prints the newest first.
  return frames.reverse();
}

export function buildErrorEvent(input: ErrorEventInput): SentryEvent {
  const type = errorType(input.error);
  const code = input.code === undefined ? "" : String(input.code);
  const route = input.route ?? "";
  return {
    event_id: input.eventId,
    timestamp: input.now.getTime() / 1000,
    platform: "javascript",
    level: "error",
    environment: input.environment,
    tags: { where: input.where, code, route, ...(input.count === undefined ? {} : { count: String(input.count) }) },
    // The route is part of the group, so the same error on another route opens a new issue and sends a mail.
    fingerprint: [input.where, code, type, route],
    exception: {
      values: [{ type, value: REDACTED, stacktrace: { frames: stackFrames(input.error) } }],
    },
  };
}

// DSN shape: https://<publicKey>@<host>/<projectId>. Anything else gives null, never a throw.
export function parseDsn(dsn: string): SentryDsn | null {
  try {
    const url = new URL(dsn.trim());
    const projectId = url.pathname.split("/").filter(Boolean).pop() ?? "";
    if (url.protocol !== "https:" || !url.username || !url.host || !/^\d+$/.test(projectId)) {
      return null;
    }
    return { host: url.host, projectId, publicKey: url.username };
  } catch {
    return null;
  }
}

// Address and auth header shared by every envelope sent to the project (events now, cron check-ins later).
export function envelopeTarget(dsn: SentryDsn): { url: string; headers: Record<string, string> } {
  return {
    url: `https://${dsn.host}/api/${dsn.projectId}/envelope/`,
    headers: {
      "content-type": "application/x-sentry-envelope",
      "X-Sentry-Auth": `Sentry sentry_version=7, sentry_key=${dsn.publicKey}, sentry_client=lekomapa/1.0`,
    },
  };
}

export function buildEnvelope(event: SentryEvent, dsn: SentryDsn): SentryEnvelope {
  const payload = JSON.stringify(event);
  const envelopeHeader = JSON.stringify({
    event_id: event.event_id,
    sent_at: new Date(event.timestamp * 1000).toISOString(),
  });
  const itemHeader = JSON.stringify({ type: "event", content_type: "application/json" });
  return { ...envelopeTarget(dsn), body: `${envelopeHeader}\n${itemHeader}\n${payload}` };
}

// Never rejects: a failed report ends with a warning that names no content, and the response is not affected.
export async function sendEvent(envelope: SentryEnvelope, fetchImpl: typeof fetch): Promise<void> {
  try {
    const response = await fetchImpl(envelope.url, { method: "POST", headers: envelope.headers, body: envelope.body });
    if (!response.ok) {
      console.warn("Sentry report not accepted", { status: response.status });
    }
  } catch (thrown) {
    console.warn("Sentry report failed", { name: errorType(thrown) });
  }
}
