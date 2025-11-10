/**
 * HTTP Endpoint Metrics for Prometheus
 *
 * This module provides comprehensive HTTP request/response metrics
 * for API endpoints, including request counts, latencies, sizes, and active connections.
 *
 * Metrics are automatically collected by the middleware and exported via /api/metrics
 */

import { Counter, Histogram, Gauge } from 'prom-client';
import { register } from '@/lib/metrics';

// ========================================
// HTTP Request Metrics
// ========================================

/**
 * Total HTTP requests counter
 * Labels: method, path, status_code, user_type
 */
export const httpRequestsTotal = new Counter({
  name: 'pluggedin_http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'path', 'status_code', 'user_type'],
  registers: [register],
});

/**
 * HTTP request duration histogram
 * Labels: method, path, status_code
 * Buckets optimized for web application response times
 */
export const httpRequestDuration = new Histogram({
  name: 'pluggedin_http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'path', 'status_code'],
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10], // 10ms to 10s
  registers: [register],
});

/**
 * HTTP request size histogram (bytes)
 * Labels: method, path
 */
export const httpRequestSize = new Histogram({
  name: 'pluggedin_http_request_size_bytes',
  help: 'HTTP request size in bytes',
  labelNames: ['method', 'path'],
  buckets: [100, 1000, 10000, 100000, 1000000, 10000000], // 100B to 10MB
  registers: [register],
});

/**
 * HTTP response size histogram (bytes)
 * Labels: method, path, status_code
 */
export const httpResponseSize = new Histogram({
  name: 'pluggedin_http_response_size_bytes',
  help: 'HTTP response size in bytes',
  labelNames: ['method', 'path', 'status_code'],
  buckets: [100, 1000, 10000, 100000, 1000000, 10000000], // 100B to 10MB
  registers: [register],
});

/**
 * Active HTTP requests gauge
 * Labels: method, path
 */
export const httpRequestsActive = new Gauge({
  name: 'pluggedin_http_requests_active',
  help: 'Number of HTTP requests currently being processed',
  labelNames: ['method', 'path'],
  registers: [register],
});

// ========================================
// Error Metrics
// ========================================

/**
 * HTTP errors counter by type
 * Labels: method, path, status_code, error_type
 */
export const httpErrorsTotal = new Counter({
  name: 'pluggedin_http_errors_total',
  help: 'Total number of HTTP errors',
  labelNames: ['method', 'path', 'status_code', 'error_type'],
  registers: [register],
});

// ========================================
// Authentication Metrics
// ========================================

/**
 * Authentication events counter
 * Labels: event_type (login_success, login_failure, logout, token_refresh)
 */
export const authEventsTotal = new Counter({
  name: 'pluggedin_auth_events_total',
  help: 'Total number of authentication events',
  labelNames: ['event_type', 'provider'],
  registers: [register],
});

/**
 * Active authenticated sessions gauge
 */
export const authSessionsActive = new Gauge({
  name: 'pluggedin_auth_sessions_active',
  help: 'Number of currently active authenticated sessions',
  registers: [register],
});

// ========================================
// Database Query Metrics
// ========================================

/**
 * Database query duration histogram
 * Labels: operation (select, insert, update, delete), table
 */
export const databaseQueryDuration = new Histogram({
  name: 'pluggedin_database_query_duration_seconds',
  help: 'Database query duration in seconds',
  labelNames: ['operation', 'table', 'success'],
  buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 5], // 1ms to 5s
  registers: [register],
});

/**
 * Database queries total counter
 * Labels: operation, table, success
 */
export const databaseQueriesTotal = new Counter({
  name: 'pluggedin_database_queries_total',
  help: 'Total number of database queries',
  labelNames: ['operation', 'table', 'success'],
  registers: [register],
});

/**
 * Active database connections gauge
 */
export const databaseConnectionsActive = new Gauge({
  name: 'pluggedin_database_connections_active',
  help: 'Number of active database connections',
  registers: [register],
});

// ========================================
// Document Processing Metrics
// ========================================

/**
 * Document operations counter
 * Labels: operation (upload, delete, search, download), status
 */
export const documentOperationsTotal = new Counter({
  name: 'pluggedin_document_operations_total',
  help: 'Total number of document operations',
  labelNames: ['operation', 'status', 'document_type'],
  registers: [register],
});

/**
 * Document processing duration histogram
 * Labels: operation, document_type
 */
export const documentProcessingDuration = new Histogram({
  name: 'pluggedin_document_processing_duration_seconds',
  help: 'Document processing duration in seconds',
  labelNames: ['operation', 'document_type'],
  buckets: [0.1, 0.5, 1, 5, 10, 30, 60], // 100ms to 60s
  registers: [register],
});

// ========================================
// Helper Functions
// ========================================

/**
 * Normalize path for metrics (remove dynamic segments)
 * Converts /api/users/123 to /api/users/:id
 * Prevents high cardinality in metrics
 */
export function normalizePath(path: string): string {
  // Remove query parameters
  const pathWithoutQuery = path.split('?')[0];

  // Define patterns to normalize
  const patterns = [
    // UUID pattern
    {
      regex: /\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
      replacement: '/:uuid',
    },
    // Numeric ID pattern
    { regex: /\/\d+/g, replacement: '/:id' },
    // Username pattern (/to/username)
    { regex: /^\/to\/[^/]+/, replacement: '/to/:username' },
  ];

  let normalizedPath = pathWithoutQuery;

  for (const pattern of patterns) {
    normalizedPath = normalizedPath.replace(pattern.regex, pattern.replacement);
  }

  // Limit path length to prevent explosion
  if (normalizedPath.length > 100) {
    normalizedPath = normalizedPath.substring(0, 100) + '...';
  }

  return normalizedPath;
}

/**
 * Get user type from authentication status
 */
export function getUserType(isAuthenticated: boolean, userId?: string): string {
  if (!isAuthenticated) return 'anonymous';
  if (userId) return 'authenticated';
  return 'unknown';
}

/**
 * Get error type from status code
 */
export function getErrorType(statusCode: number): string {
  if (statusCode >= 500) return 'server_error';
  if (statusCode === 429) return 'rate_limit';
  if (statusCode === 401) return 'unauthorized';
  if (statusCode === 403) return 'forbidden';
  if (statusCode === 404) return 'not_found';
  if (statusCode >= 400) return 'client_error';
  return 'unknown';
}

/**
 * Track HTTP request with all relevant metrics
 * Call this from middleware or API routes
 */
export function trackHttpRequest(params: {
  method: string;
  path: string;
  statusCode: number;
  durationMs: number;
  isAuthenticated: boolean;
  userId?: string;
  requestSize?: number;
  responseSize?: number;
}) {
  const {
    method,
    path,
    statusCode,
    durationMs,
    isAuthenticated,
    userId,
    requestSize,
    responseSize,
  } = params;

  const normalizedPath = normalizePath(path);
  const userType = getUserType(isAuthenticated, userId);
  const statusCodeStr = statusCode.toString();

  // Increment request counter
  httpRequestsTotal.inc({
    method,
    path: normalizedPath,
    status_code: statusCodeStr,
    user_type: userType,
  });

  // Record request duration
  httpRequestDuration.observe(
    {
      method,
      path: normalizedPath,
      status_code: statusCodeStr,
    },
    durationMs / 1000 // Convert to seconds
  );

  // Record request/response sizes if available
  if (requestSize) {
    httpRequestSize.observe(
      {
        method,
        path: normalizedPath,
      },
      requestSize
    );
  }

  if (responseSize) {
    httpResponseSize.observe(
      {
        method,
        path: normalizedPath,
        status_code: statusCodeStr,
      },
      responseSize
    );
  }

  // Track errors
  if (statusCode >= 400) {
    const errorType = getErrorType(statusCode);
    httpErrorsTotal.inc({
      method,
      path: normalizedPath,
      status_code: statusCodeStr,
      error_type: errorType,
    });
  }
}

/**
 * Start tracking active request
 * Returns a function to call when request completes
 */
export function trackActiveRequest(method: string, path: string) {
  const normalizedPath = normalizePath(path);

  // Increment active requests
  httpRequestsActive.inc({ method, path: normalizedPath });

  // Return cleanup function
  return () => {
    httpRequestsActive.dec({ method, path: normalizedPath });
  };
}

/**
 * Track authentication event
 */
export function trackAuthEvent(eventType: string, provider: string = 'credentials') {
  authEventsTotal.inc({ event_type: eventType, provider });
}

/**
 * Update active sessions count
 */
export function updateActiveSessions(count: number) {
  authSessionsActive.set(count);
}

/**
 * Track database query
 */
export function trackDatabaseQuery(params: {
  operation: string;
  table: string;
  durationMs: number;
  success: boolean;
}) {
  const { operation, table, durationMs, success } = params;
  const successStr = success ? 'true' : 'false';

  databaseQueriesTotal.inc({ operation, table, success: successStr });
  databaseQueryDuration.observe(
    { operation, table, success: successStr },
    durationMs / 1000
  );
}

/**
 * Update active database connections
 */
export function updateDatabaseConnections(count: number) {
  databaseConnectionsActive.set(count);
}

/**
 * Track document operation
 */
export function trackDocumentOperation(params: {
  operation: string;
  status: string;
  documentType: string;
  durationMs?: number;
}) {
  const { operation, status, documentType, durationMs } = params;

  documentOperationsTotal.inc({ operation, status, document_type: documentType });

  if (durationMs !== undefined) {
    documentProcessingDuration.observe(
      { operation, document_type: documentType },
      durationMs / 1000
    );
  }
}
