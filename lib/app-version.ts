// The one place the running application learns its own version.
//
// Two loggers each carried their own hardcoded fallback — '2.14.0' in
// lib/observability/logger.ts and '1.0.0' in lib/logging.ts — and APP_VERSION
// was never set in the Dockerfile, in compose or in CI. So every production log
// line was stamped 2.14.0 while the app was 4.0.0, which makes release-scoped
// filtering in Sentry or Loki quietly wrong rather than obviously broken.
//
// Reading package.json removes the fallback problem instead of updating it:
// the value cannot drift from the release. Next inlines the import at build
// time, so this works in the Edge runtime too, where `fs` does not exist.
//
// APP_VERSION still wins if set, so a deployment can override it.
import pkg from '@/package.json';

export const APP_VERSION: string = process.env.APP_VERSION || pkg.version;
