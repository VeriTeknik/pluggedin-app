// This file configures the initialization of Sentry on the client.
// The added config here will be used whenever a users loads a page in their browser.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from '@sentry/nextjs';

import { tracesSampler } from '@/lib/sentry-sampling';

const isProduction = process.env.NODE_ENV === 'production';

Sentry.init({
  dsn: isProduction
    ? 'https://71d8c70c11135db3ec287d3bf15f426b@o4509004867698688.ingest.de.sentry.io/4509541917786192'
    : '', // Disable Sentry in development

  // Add optional integrations for additional features
  integrations: isProduction ? [Sentry.replayIntegration()] : [],

  // Drop high-frequency / low-value transactions entirely and keep the rest at a
  // low base rate to control span ingestion volume. See lib/sentry-sampling.ts.
  ...(isProduction ? { tracesSampler } : { tracesSampleRate: 0 }),

  // Define how likely Replay events are sampled.
  // Disabled for normal sessions to reduce Sentry replay quota usage;
  // replays are only captured when an error occurs (see replaysOnErrorSampleRate).
  replaysSessionSampleRate: 0,

  // Define how likely Replay events are sampled when an error occurs.
  replaysOnErrorSampleRate: process.env.NODE_ENV === 'production' ? 1.0 : 0,

  // Setting this option to true will print useful information to the console while you're setting up Sentry.
  debug: false,
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
