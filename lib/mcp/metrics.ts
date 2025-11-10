/**
 * MCP Prometheus Metrics
 *
 * Comprehensive instrumentation for MCP operations including:
 * - OAuth authentication flows
 * - Session management
 * - Discovery operations
 * - Transport connections
 * - Performance tracking
 * - Error monitoring
 *
 * All metrics follow Prometheus naming conventions and include
 * privacy-preserving labels (no PII, tokens, or user IDs).
 *
 * Dashboard: monitoring.plugged.in (MCP Operations)
 * Alerts: prometheus/rules/mcp-alerts.yml
 */

import { Counter, Histogram, Gauge } from 'prom-client';
import { register } from '@/lib/metrics';

// ============================================================================
// OAuth Metrics (5 metrics)
// ============================================================================

export const mcpOAuthFlows = new Counter({
  name: 'mcp_oauth_flows_total',
  help: 'Total OAuth flows initiated and their outcomes',
  labelNames: ['provider', 'server_type', 'status'], // status: initiated|success|error
  registers: [register],
});

export const mcpOAuthDuration = new Histogram({
  name: 'mcp_oauth_flow_duration_seconds',
  help: 'OAuth flow duration from initiation to completion',
  labelNames: ['provider', 'server_type', 'status'], // status: success|error
  buckets: [1, 2, 5, 10, 30, 60, 120, 300], // 1s to 5min
  registers: [register],
});

export const mcpOAuthCallbacks = new Counter({
  name: 'mcp_oauth_callbacks_total',
  help: 'OAuth callback processing outcomes',
  labelNames: ['provider', 'status'], // status: success|invalid_state|expired|error
  registers: [register],
});

export const mcpOAuthSessionsActive = new Gauge({
  name: 'mcp_oauth_sessions_active',
  help: 'Currently active OAuth sessions (not expired)',
  labelNames: ['provider'],
  registers: [register],
});

export const mcpOAuthSessionsExpired = new Counter({
  name: 'mcp_oauth_sessions_expired_total',
  help: 'OAuth sessions that expired or were cleared',
  labelNames: ['provider', 'reason'], // reason: timeout|manual_clear|cleanup
  registers: [register],
});

// ============================================================================
// Discovery Metrics (4 metrics)
// ============================================================================

export const mcpDiscoveryDuration = new Histogram({
  name: 'mcp_discovery_duration_seconds',
  help: 'Time to discover capabilities from MCP servers',
  labelNames: ['operation', 'transport', 'status'], // operation: tools|resources|prompts|all
  buckets: [0.1, 0.5, 1, 2, 5, 10, 30],
  registers: [register],
});

export const mcpCapabilitiesDiscovered = new Counter({
  name: 'mcp_capabilities_discovered_total',
  help: 'Total capabilities discovered from servers',
  labelNames: ['type', 'server_type', 'transport'], // type: tool|resource|prompt
  registers: [register],
});

export const mcpDiscoveryFailures = new Counter({
  name: 'mcp_discovery_failures_total',
  help: 'Failed discovery attempts categorized by error',
  labelNames: ['operation', 'transport', 'error_type'], // error_type: timeout|connection|json_rpc|auth
  registers: [register],
});

export const mcpCapabilitiesCurrent = new Gauge({
  name: 'mcp_capabilities_current',
  help: 'Number of currently available capabilities per server',
  labelNames: ['type', 'server_uuid'],
  registers: [register],
});

// ============================================================================
// Session Management Metrics (5 metrics)
// ============================================================================

export const mcpSessionsCreated = new Counter({
  name: 'mcp_sessions_created_total',
  help: 'Total MCP sessions created',
  labelNames: ['transport', 'server_type'], // transport: stdio|sse|http
  registers: [register],
});

export const mcpSessionsReused = new Counter({
  name: 'mcp_sessions_reused_total',
  help: 'Existing sessions reused instead of creating new',
  labelNames: ['transport', 'server_type'],
  registers: [register],
});

export const mcpSessionsActive = new Gauge({
  name: 'mcp_sessions_active',
  help: 'Currently active MCP sessions (not expired)',
  labelNames: ['transport', 'server_type'],
  registers: [register],
});

export const mcpSessionLifetime = new Histogram({
  name: 'mcp_session_lifetime_seconds',
  help: 'How long sessions lived before termination',
  labelNames: ['transport', 'termination_reason'], // reason: expired|deleted|error
  buckets: [60, 300, 600, 1800, 3600, 7200], // 1min to 2hr
  registers: [register],
});

export const mcpSessionCleanup = new Counter({
  name: 'mcp_session_cleanup_total',
  help: 'Automatic cleanup job executions',
  labelNames: ['result'], // result: success|error
  registers: [register],
});

// ============================================================================
// Transport Metrics (3 metrics)
// ============================================================================

export const mcpTransportConnectionsActive = new Gauge({
  name: 'mcp_transport_connections_active',
  help: 'Active connections per transport type',
  labelNames: ['transport'],
  registers: [register],
});

export const mcpTransportConnectionFailures = new Counter({
  name: 'mcp_transport_connection_failures_total',
  help: 'Failed connection attempts',
  labelNames: ['transport', 'error_type'], // error_type: spawn_failed|connection_refused|timeout|auth_failed
  registers: [register],
});

export const mcpTransportConnectionDuration = new Histogram({
  name: 'mcp_transport_connection_duration_seconds',
  help: 'Time to establish connection',
  labelNames: ['transport', 'status'], // status: success|error
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5],
  registers: [register],
});

// ============================================================================
// Registry Import Metrics (2 metrics)
// ============================================================================

export const mcpRegistryImports = new Counter({
  name: 'mcp_registry_imports_total',
  help: 'Servers imported from various sources',
  labelNames: ['source', 'status'], // source: registry|manual|api, status: success|error
  registers: [register],
});

export const mcpRegistryImportDuration = new Histogram({
  name: 'mcp_registry_import_duration_seconds',
  help: 'Time to import and configure registry servers',
  labelNames: ['source', 'data_preserved'], // data_preserved: true|false
  buckets: [0.1, 0.5, 1, 2, 5, 10],
  registers: [register],
});

// ============================================================================
// JSON-RPC Error Metrics (1 metric)
// ============================================================================

export const mcpJsonRpcErrors = new Counter({
  name: 'mcp_jsonrpc_errors_total',
  help: 'JSON-RPC errors categorized by spec codes',
  labelNames: ['error_code', 'error_type', 'transport', 'operation'],
  /**
   * Standard JSON-RPC Error Codes:
   * -32700: Parse error
   * -32600: Invalid Request
   * -32601: Method not found
   * -32602: Invalid params
   * -32603: Internal error
   * -32000 to -32099: Server errors
   */
  registers: [register],
});

// ============================================================================
// Performance Metrics (2 metrics)
// ============================================================================

export const mcpOperationLatency = new Histogram({
  name: 'mcp_operation_latency_seconds',
  help: 'End-to-end latency for MCP operations',
  labelNames: ['operation', 'transport', 'status'], // operation: list_tools|call_tool|list_resources|read_resource|list_prompts
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5, 10, 30],
  registers: [register],
});

export const mcpToolInvocationDuration = new Histogram({
  name: 'mcp_tool_invocation_duration_seconds',
  help: 'How long tool calls take',
  labelNames: ['tool_name', 'server_type', 'status'], // status: success|error
  buckets: [0.1, 0.5, 1, 2, 5, 10, 30, 60, 120], // 100ms to 2min
  registers: [register],
});

// ============================================================================
// Overall Error Tracking (1 metric)
// ============================================================================

export const mcpErrors = new Counter({
  name: 'mcp_errors_total',
  help: 'All MCP-related errors categorized',
  labelNames: ['category', 'severity', 'transport'],
  /**
   * Categories: oauth|discovery|session|transport|jsonrpc|tool_invocation
   * Severity: warning|error|critical
   */
  registers: [register],
});

// ============================================================================
// Server CRUD Operations (1 metric)
// ============================================================================

export const mcpServerOperations = new Counter({
  name: 'mcp_server_operations_total',
  help: 'MCP server CRUD operations',
  labelNames: ['operation', 'server_type', 'status'], // operation: create|update|delete|status_change
  registers: [register],
});

// ============================================================================
// Helper Functions for Common Tracking Patterns
// ============================================================================

/**
 * Track OAuth flow from start to finish
 */
export function trackOAuthFlow(
  provider: string,
  serverType: string,
  durationMs: number,
  success: boolean
) {
  const status = success ? 'success' : 'error';
  mcpOAuthFlows.inc({ provider, server_type: serverType, status });
  mcpOAuthDuration.observe(
    { provider, server_type: serverType, status },
    durationMs / 1000
  );
}

/**
 * Track discovery operation
 */
export function trackDiscovery(
  operation: string,
  transport: string,
  durationMs: number,
  success: boolean,
  errorType?: string
) {
  const status = success ? 'success' : 'error';
  mcpDiscoveryDuration.observe({ operation, transport, status }, durationMs / 1000);

  if (!success && errorType) {
    mcpDiscoveryFailures.inc({ operation, transport, error_type: errorType });
  }
}

/**
 * Track session creation
 */
export function trackSessionCreated(transport: string, serverType: string) {
  mcpSessionsCreated.inc({ transport, server_type: serverType });
  mcpSessionsActive.inc({ transport, server_type: serverType });
  mcpTransportConnectionsActive.inc({ transport });
}

/**
 * Track session reuse
 */
export function trackSessionReused(transport: string, serverType: string) {
  mcpSessionsReused.inc({ transport, server_type: serverType });
}

/**
 * Track session termination
 */
export function trackSessionTerminated(
  transport: string,
  serverType: string,
  lifetimeMs: number,
  reason: string
) {
  mcpSessionLifetime.observe({ transport, termination_reason: reason }, lifetimeMs / 1000);
  mcpSessionsActive.dec({ transport, server_type: serverType });
  mcpTransportConnectionsActive.dec({ transport });
}

/**
 * Track connection establishment
 */
export function trackConnection(
  transport: string,
  durationMs: number,
  success: boolean,
  errorType?: string
) {
  const status = success ? 'success' : 'error';
  mcpTransportConnectionDuration.observe({ transport, status }, durationMs / 1000);

  if (!success && errorType) {
    mcpTransportConnectionFailures.inc({ transport, error_type: errorType });
  }
}

/**
 * Categorize error from exception
 * Sanitizes error messages to prevent leaking sensitive data
 */
export function categorizeError(error: any): string {
  const message = error?.message?.toLowerCase() || '';

  if (message.includes('timeout') || message.includes('timed out')) return 'timeout';
  if (message.includes('connection') || message.includes('connect')) return 'connection';
  if (message.includes('json') || message.includes('parse')) return 'json_rpc';
  if (message.includes('auth') || message.includes('unauthorized')) return 'auth';
  if (message.includes('not found')) return 'not_found';
  if (message.includes('spawn') || message.includes('enoent')) return 'spawn_failed';

  return 'unknown';
}

/**
 * Track JSON-RPC error with proper categorization
 */
export function trackJsonRpcError(
  code: number,
  transport: string,
  operation: string
) {
  let errorType = 'custom';

  switch (code) {
    case -32700:
      errorType = 'parse';
      break;
    case -32600:
      errorType = 'invalid_request';
      break;
    case -32601:
      errorType = 'method_not_found';
      break;
    case -32602:
      errorType = 'invalid_params';
      break;
    case -32603:
      errorType = 'internal';
      break;
    default:
      if (code >= -32099 && code <= -32000) {
        errorType = 'server_error';
      }
  }

  mcpJsonRpcErrors.inc({
    error_code: code.toString(),
    error_type: errorType,
    transport,
    operation,
  });
}

/**
 * Track registry import
 */
export function trackRegistryImport(
  source: string,
  durationMs: number,
  success: boolean,
  dataPreserved: boolean = true
) {
  const status = success ? 'success' : 'error';
  mcpRegistryImports.inc({ source, status });

  if (success) {
    mcpRegistryImportDuration.observe(
      { source, data_preserved: dataPreserved ? 'true' : 'false' },
      durationMs / 1000
    );
  }
}
