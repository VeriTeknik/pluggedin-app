'use client';

import { useExternalLinkTracking } from './link-tracker';

export function AnalyticsProvider({ children }: { children: React.ReactNode }) {
  // Initialize link tracking
  useExternalLinkTracking();

  return <>{children}</>;
}