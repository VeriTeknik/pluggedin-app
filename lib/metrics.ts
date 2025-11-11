/**
 * Global Prometheus Metrics Registry
 *
 * Central registry for all application metrics.
 * All metrics should be registered here to ensure they're
 * exported via the /api/metrics endpoint.
 *
 * Default Metrics Collected:
 * - pluggedin_process_cpu_user_seconds_total
 * - pluggedin_process_cpu_system_seconds_total
 * - pluggedin_process_cpu_seconds_total
 * - pluggedin_process_start_time_seconds
 * - pluggedin_process_resident_memory_bytes
 * - pluggedin_nodejs_heap_size_total_bytes
 * - pluggedin_nodejs_heap_size_used_bytes
 * - pluggedin_nodejs_external_memory_bytes
 * - pluggedin_nodejs_heap_space_size_total_bytes
 * - pluggedin_nodejs_heap_space_size_used_bytes
 * - pluggedin_nodejs_heap_space_size_available_bytes
 * - pluggedin_nodejs_version_info
 * - pluggedin_nodejs_eventloop_lag_seconds
 * - pluggedin_nodejs_eventloop_lag_min_seconds
 * - pluggedin_nodejs_eventloop_lag_max_seconds
 * - pluggedin_nodejs_eventloop_lag_mean_seconds
 * - pluggedin_nodejs_eventloop_lag_stddev_seconds
 * - pluggedin_nodejs_eventloop_lag_p50_seconds
 * - pluggedin_nodejs_eventloop_lag_p90_seconds
 * - pluggedin_nodejs_eventloop_lag_p99_seconds
 * - pluggedin_nodejs_active_handles
 * - pluggedin_nodejs_active_handles_total
 * - pluggedin_nodejs_active_requests
 * - pluggedin_nodejs_active_requests_total
 * - pluggedin_nodejs_gc_duration_seconds
 */

import { collectDefaultMetrics,Registry } from 'prom-client';

// Create global registry
export const register = new Registry();

// Collect default Node.js metrics (CPU, memory, event loop, etc.)
// This includes process start time, heap usage, event loop lag, and more
collectDefaultMetrics({
  register,
  prefix: 'pluggedin_',
  gcDurationBuckets: [0.001, 0.01, 0.1, 1, 2, 5],
  eventLoopMonitoringPrecision: 10, // Sample event loop lag every 10ms
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
