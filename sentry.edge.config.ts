// This file configures the initialization of Sentry for edge features (middleware, edge routes, and so on).
// The config you add here will be used whenever one of the edge features is loaded.
// Note that this config is unrelated to the Vercel Edge Runtime and is also required when running locally.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from '@sentry/nextjs';

import { tracesSampler } from '@/lib/sentry-sampling';

const isProduction = process.env.NODE_ENV === 'production';

Sentry.init({
  dsn: isProduction
    ? 'https://71d8c70c11135db3ec287d3bf15f426b@o4509004867698688.ingest.de.sentry.io/4509541917786192'
    : '', // Disable Sentry in development

  // Drop high-frequency / low-value transactions entirely and keep the rest at a
  // low base rate to control span ingestion volume. See lib/sentry-sampling.ts.
  ...(isProduction ? { tracesSampler } : { tracesSampleRate: 0 }),

  // Setting this option to true will print useful information to the console while you're setting up Sentry.
  debug: false,
});
