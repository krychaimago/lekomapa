// The one place the rest of the code calls for an unexpected server error. It logs as before and, when SENTRY_DSN is
// set, sends a report in the background. `where` is a fixed label such as "medications.create", never error text.
// This module imports `cloudflare:workers` and `astro:env`, which `node --test` cannot load: call it only from routes,
// middleware and services not imported by scripts/**. The pure part is ./error-report.ts.

import { SENTRY_DSN, SENTRY_ENVIRONMENT } from "astro:env/server";
import { waitUntil } from "cloudflare:workers";

import { buildEnvelope, buildErrorEvent, errorType, parseDsn, sendEvent } from "./error-report";

export interface ReportDetails {
  code?: string | number;
  status?: number;
  error?: unknown;
  route?: string;
}

export function reportError(where: string, details: ReportDetails = {}): void {
  // A failure while reporting must never turn a working response into a 500.
  try {
    const { code, status, error, route } = details;
    console.error(where, { code, status, name: error === undefined ? undefined : errorType(error) });

    if (!SENTRY_DSN) {
      return;
    }
    const dsn = parseDsn(SENTRY_DSN);
    if (!dsn) {
      console.warn("SENTRY_DSN is not a valid DSN");
      return;
    }
    const event = buildErrorEvent({
      where,
      code: code ?? status,
      error,
      route,
      // Not import.meta.env.DEV: `npm run preview` runs the built app, where DEV is false.
      environment: SENTRY_ENVIRONMENT,
      now: new Date(),
      eventId: crypto.randomUUID().replaceAll("-", ""),
    });
    waitUntil(sendEvent(buildEnvelope(event, dsn), fetch));
  } catch (thrown) {
    console.warn("Error reporting failed", { name: errorType(thrown) });
  }
}
