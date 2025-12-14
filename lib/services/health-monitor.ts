/**
 * Health Monitor Service
 *
 * Background service that periodically checks health of registered
 * model router services and updates their status in the database.
 *
 * Features:
 * - Configurable check interval
 * - Rolling latency averages
 * - Load percentage tracking from /metrics or /health
 * - Automatic status transitions (healthy/degraded/unhealthy)
 */

import { eq } from 'drizzle-orm';

import { db } from '@/db';
import { modelRouterServicesTable } from '@/db/schema';

// Configuration
const DEFAULT_CHECK_INTERVAL_MS = 30000; // 30 seconds
const LATENCY_WINDOW_SIZE = 10; // Rolling average window
const HEALTH_CHECK_TIMEOUT_MS = 5000; // 5 second timeout

interface HealthResponse {
  status: 'ok' | 'degraded' | 'error';
  version?: string;
  uptime_seconds?: number;
  load_percent?: number;
  active_requests?: number;
  error_rate_1m?: number;
}

interface ServiceHealthHistory {
  serviceUuid: string;
  latencies: number[];
  consecutiveFailures: number;
}

// In-memory health history (per-process)
const healthHistory = new Map<string, ServiceHealthHistory>();

// Monitor state
let monitorInterval: NodeJS.Timeout | null = null;
let isRunning = false;

/**
 * Check health of a single service
 */
async function checkServiceHealth(service: {
  uuid: string;
  url: string;
  health_endpoint: string | null;
}): Promise<{
  status: 'healthy' | 'degraded' | 'unhealthy';
  latencyMs: number;
  loadPercent: number | null;
  error: string | null;
}> {
  const startTime = Date.now();
  const healthEndpoint = service.health_endpoint || '/health';

  try {
    const response = await fetch(`${service.url}${healthEndpoint}`, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(HEALTH_CHECK_TIMEOUT_MS),
    });

    const latencyMs = Date.now() - startTime;

    if (!response.ok) {
      return {
        status: 'unhealthy',
        latencyMs,
        loadPercent: null,
        error: `HTTP ${response.status}`,
      };
    }

    const health: HealthResponse = await response.json();

    // Determine status based on response
    let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
    if (health.status === 'degraded') {
      status = 'degraded';
    } else if (health.status === 'error') {
      status = 'unhealthy';
    }

    // Check error rate for degraded status
    if (health.error_rate_1m && health.error_rate_1m > 0.1) {
      status = 'degraded';
    }

    return {
      status,
      latencyMs,
      loadPercent: health.load_percent ?? null,
      error: null,
    };
  } catch (error) {
    const latencyMs = Date.now() - startTime;

    return {
      status: 'unhealthy',
      latencyMs,
      loadPercent: null,
      error: error instanceof Error ? error.message : 'Health check failed',
    };
  }
}

/**
 * Update rolling latency average
 */
function updateLatencyHistory(
  serviceUuid: string,
  latencyMs: number,
  success: boolean
): { avgLatencyMs: number; consecutiveFailures: number } {
  let history = healthHistory.get(serviceUuid);

  if (!history) {
    history = {
      serviceUuid,
      latencies: [],
      consecutiveFailures: 0,
    };
    healthHistory.set(serviceUuid, history);
  }

  // Update consecutive failures
  if (success) {
    history.consecutiveFailures = 0;
  } else {
    history.consecutiveFailures++;
  }

  // Only track latency for successful checks
  if (success) {
    history.latencies.push(latencyMs);
    if (history.latencies.length > LATENCY_WINDOW_SIZE) {
      history.latencies.shift();
    }
  }

  // Calculate average
  const avgLatencyMs =
    history.latencies.length > 0
      ? Math.round(
          history.latencies.reduce((a, b) => a + b, 0) / history.latencies.length
        )
      : latencyMs;

  return {
    avgLatencyMs,
    consecutiveFailures: history.consecutiveFailures,
  };
}

/**
 * Run health checks on all enabled services
 */
export async function runHealthChecks(): Promise<{
  checked: number;
  healthy: number;
  degraded: number;
  unhealthy: number;
}> {
  const services = await db
    .select({
      uuid: modelRouterServicesTable.uuid,
      url: modelRouterServicesTable.url,
      health_endpoint: modelRouterServicesTable.health_endpoint,
      name: modelRouterServicesTable.name,
    })
    .from(modelRouterServicesTable)
    .where(eq(modelRouterServicesTable.is_enabled, true));

  const results = {
    checked: services.length,
    healthy: 0,
    degraded: 0,
    unhealthy: 0,
  };

  // Check all services in parallel
  await Promise.all(
    services.map(async (service) => {
      const result = await checkServiceHealth(service);

      // Update latency history
      const { avgLatencyMs } = updateLatencyHistory(
        service.uuid,
        result.latencyMs,
        result.status !== 'unhealthy'
      );

      // Count results
      switch (result.status) {
        case 'healthy':
          results.healthy++;
          break;
        case 'degraded':
          results.degraded++;
          break;
        case 'unhealthy':
          results.unhealthy++;
          break;
      }

      // Update database
      try {
        await db
          .update(modelRouterServicesTable)
          .set({
            health_status: result.status,
            last_health_check: new Date(),
            last_health_error: result.error,
            avg_latency_ms: avgLatencyMs,
            current_load_percent: result.loadPercent,
            updated_at: new Date(),
          })
          .where(eq(modelRouterServicesTable.uuid, service.uuid));
      } catch (dbError) {
        console.error(
          `[Health Monitor] Failed to update health for ${service.name}:`,
          dbError
        );
      }
    })
  );

  return results;
}

/**
 * Start the background health monitor
 *
 * Note: In a serverless environment (like Vercel), this should be called
 * from a cron job or scheduled function instead of running continuously.
 */
export function startHealthMonitor(
  intervalMs: number = DEFAULT_CHECK_INTERVAL_MS
): void {
  if (isRunning) {
    console.log('[Health Monitor] Already running');
    return;
  }

  isRunning = true;
  console.log(`[Health Monitor] Starting with ${intervalMs}ms interval`);

  // Run immediately on start
  runHealthChecks()
    .then((results) => {
      console.log(
        `[Health Monitor] Initial check: ${results.healthy}/${results.checked} healthy`
      );
    })
    .catch((error) => {
      console.error('[Health Monitor] Initial check failed:', error);
    });

  // Schedule periodic checks
  monitorInterval = setInterval(() => {
    runHealthChecks().catch((error) => {
      console.error('[Health Monitor] Check failed:', error);
    });
  }, intervalMs);
}

/**
 * Stop the background health monitor
 */
export function stopHealthMonitor(): void {
  if (monitorInterval) {
    clearInterval(monitorInterval);
    monitorInterval = null;
  }
  isRunning = false;
  console.log('[Health Monitor] Stopped');
}

/**
 * Check if the health monitor is running
 */
export function isHealthMonitorRunning(): boolean {
  return isRunning;
}

/**
 * Get health history for a service (for debugging)
 */
export function getServiceHealthHistory(
  serviceUuid: string
): ServiceHealthHistory | undefined {
  return healthHistory.get(serviceUuid);
}

/**
 * Clear health history (for testing)
 */
export function clearHealthHistory(): void {
  healthHistory.clear();
}
