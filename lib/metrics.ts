/**
 * Global Prometheus Metrics Registry
 *
 * Central registry for all application metrics.
 * All metrics should be registered here to ensure they're
 * exported via the /api/metrics endpoint.
 */

import { Registry, collectDefaultMetrics } from 'prom-client';

// Create global registry
export const register = new Registry();

// Collect default Node.js metrics (CPU, memory, event loop, etc.)
collectDefaultMetrics({
  register,
  prefix: 'pluggedin_',
  gcDurationBuckets: [0.001, 0.01, 0.1, 1, 2, 5],
});

/**
 * Get metrics in Prometheus format
 * Used by /api/metrics endpoint
 */
export async function getMetrics(): Promise<string> {
  return await register.metrics();
}

/**
 * Get metrics as JSON (optional, for debugging)
 */
export async function getMetricsJSON() {
  return await register.getMetricsAsJSON();
}

/**
 * Reset all metrics (for testing)
 */
export function resetMetrics() {
  register.resetMetrics();
}
