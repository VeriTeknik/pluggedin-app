// Shared Sentry trace sampling logic.
//
// Span volume (not transaction count) is what Sentry bills against, and a handful
// of high-frequency, low-value endpoints (health checks, session polling, SWR
// refetches) dominate that volume. Instead of sampling every transaction at a
// flat rate, `tracesSampler` lets us drop the noisiest transactions entirely and
// keep meaningful ones at a modest base rate.
//
// Errors and replays are unaffected by this — they are sampled separately.

import type { init } from '@sentry/nextjs';

// `@sentry/nextjs` does not re-export the sampling context type, so derive it
// from the `tracesSampler` parameter of the init options instead.
type SentryInitOptions = NonNullable<Parameters<typeof init>[0]>;
type TracesSamplerSamplingContext = Parameters<
  NonNullable<SentryInitOptions['tracesSampler']>
>[0];

// Base sample rate for "normal" transactions in production (page loads, regular
// API requests, server actions).
export const BASE_SAMPLE_RATE = 0.05;

// Very low rate for known high-frequency polling endpoints. Keeps a thin signal
// for outright outages without ingesting a span on every poll.
const POLLING_SAMPLE_RATE = 0.005;

// Transactions matching these are dropped entirely (rate 0). These are
// effectively pure noise for tracing purposes.
const DROP_PATTERNS: RegExp[] = [
  /\/api\/health(\b|\/|$)/i,        // app / mcp-servers / registry health checks
  /\/api\/auth\/session/i,          // NextAuth session is polled constantly
  /\/api\/auth\/_log/i,
  /\/_next\//i,                     // Next.js internals & static assets
  /\/favicon/i,
  /\/manifest\.webmanifest/i,
  /\.(?:js|css|map|png|jpg|jpeg|svg|gif|webp|ico|woff2?)(?:\?|$)/i,
];

// Transactions matching these are heavily down-sampled. These back SWR hooks
// that refetch every few seconds (see e.g. the agent detail page polling 4
// endpoints every 5-10s, memory stats every 30s).
const POLLING_PATTERNS: RegExp[] = [
  /\/api\/agents\//i,
  /\/api\/memory\//i,
  /\/api\/metrics/i,
  /\/api\/platform-metrics/i,
  /\/api\/analytics/i,
  /\/api\/notifications/i,
];

// Builds the string we match patterns against from whatever the SDK gives us:
// the span name plus the most likely URL-bearing attributes/fields, across both
// browser and node sampling contexts.
function resolveTarget(ctx: TracesSamplerSamplingContext): string {
  const attrs = ctx.attributes ?? {};
  const candidates = [
    ctx.name,
    attrs['http.route'],
    attrs['http.target'],
    attrs['url.path'],
    attrs['url.full'],
    attrs['http.url'],
    ctx.normalizedRequest?.url,
    ctx.location?.pathname,
  ];
  return candidates.filter(Boolean).join(' ');
}

/**
 * Production `tracesSampler`. Returns the per-transaction sample rate.
 */
export function tracesSampler(ctx: TracesSamplerSamplingContext): number {
  const target = resolveTarget(ctx);

  if (DROP_PATTERNS.some((re) => re.test(target))) {
    return 0;
  }
  if (POLLING_PATTERNS.some((re) => re.test(target))) {
    return POLLING_SAMPLE_RATE;
  }
  return BASE_SAMPLE_RATE;
}
