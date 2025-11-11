/**
 * OAuth Metrics for Prometheus
 *
 * Provides comprehensive metrics for OAuth 2.1 flows including:
 * - Authorization flow tracking
 * - Token refresh operations
 * - PKCE validation
 * - Security events (token reuse, integrity violations)
 * - Discovery operations
 * - Dynamic client registration
 *
 * Compatible with pluggedin-observability Prometheus stack
 */

import { Counter, Gauge,Histogram } from 'prom-client';

import { register } from '@/lib/metrics';

// ========================================
// OAuth Flow Metrics
// ========================================

/**
 * Total number of OAuth authorization flows initiated
 * Labels: provider, server_uuid
 */
export const oauthFlowsTotal = new Counter({
  name: 'oauth_flows_total',
  help: 'Total number of OAuth authorization flows initiated',
  labelNames: ['provider', 'status'],
  registers: [register],
});

/**
 * OAuth authorization flow duration in seconds
 * Tracks time from initiation to callback completion
 * Labels: provider, status (success/failure)
 */
export const oauthFlowDuration = new Histogram({
  name: 'oauth_flow_duration_seconds',
  help: 'OAuth authorization flow duration in seconds',
  labelNames: ['provider', 'status'],
  buckets: [0.5, 1, 2, 5, 10, 30, 60], // seconds
  registers: [register],
});

// ========================================
// Token Operations Metrics
// ========================================

/**
 * Total number of OAuth token refresh attempts
 * Labels: status (success/failure/reuse_detected)
 */
export const tokenRefreshTotal = new Counter({
  name: 'oauth_token_refresh_total',
  help: 'Total number of OAuth token refresh attempts',
  labelNames: ['status', 'reason'],
  registers: [register],
});

/**
 * Token refresh operation duration in seconds
 * Labels: status (success/failure)
 */
export const tokenRefreshDuration = new Histogram({
  name: 'oauth_token_refresh_duration_seconds',
  help: 'Token refresh operation duration in seconds',
  labelNames: ['status'],
  buckets: [0.1, 0.5, 1, 2, 5, 10], // seconds
  registers: [register],
});

/**
 * Total number of token revocations
 * Labels: reason (reuse_detected/manual/expired/security)
 */
export const tokenRevocationsTotal = new Counter({
  name: 'oauth_token_revocations_total',
  help: 'Total number of OAuth token revocations',
  labelNames: ['reason'],
  registers: [register],
});

/**
 * Current number of active OAuth tokens
 * Gauge that tracks the number of valid, unexpired tokens
 */
export const activeTokensGauge = new Gauge({
  name: 'oauth_active_tokens',
  help: 'Current number of active OAuth tokens',
  registers: [register],
});

// ========================================
// PKCE Metrics
// ========================================

/**
 * Total number of PKCE state validations
 * Labels: status (success/failure), reason (expired/invalid_hash/not_found)
 */
export const pkceValidationsTotal = new Counter({
  name: 'oauth_pkce_validations_total',
  help: 'Total number of PKCE state validations',
  labelNames: ['status', 'reason'],
  registers: [register],
});

/**
 * Total number of PKCE states created
 */
export const pkceStatesCreatedTotal = new Counter({
  name: 'oauth_pkce_states_created_total',
  help: 'Total number of PKCE states created',
  registers: [register],
});

/**
 * Total number of PKCE states cleaned up
 * Labels: reason (expired/manual/server_deleted)
 */
export const pkceStatesCleanedTotal = new Counter({
  name: 'oauth_pkce_states_cleaned_total',
  help: 'Total number of PKCE states cleaned up',
  labelNames: ['reason'],
  registers: [register],
});

/**
 * Current number of active PKCE states
 */
export const activePkceStatesGauge = new Gauge({
  name: 'oauth_active_pkce_states',
  help: 'Current number of active PKCE states',
  registers: [register],
});

// ========================================
// Security Metrics
// ========================================

/**
 * Total number of OAuth security events
 * Labels: event_type, severity (low/medium/high/critical)
 */
export const securityEventsTotal = new Counter({
  name: 'oauth_security_events_total',
  help: 'Total number of OAuth security events',
  labelNames: ['event_type', 'severity'],
  registers: [register],
});

/**
 * OAuth integrity violations detected
 * Labels: violation_type (hash_mismatch/state_reuse/user_mismatch)
 */
export const integrityViolationsTotal = new Counter({
  name: 'oauth_integrity_violations_total',
  help: 'Total number of OAuth integrity violations',
  labelNames: ['violation_type'],
  registers: [register],
});

/**
 * OAuth authorization code injection attempts
 * Tracks attempts to use codes across different users
 */
export const codeInjectionAttemptsTotal = new Counter({
  name: 'oauth_code_injection_attempts_total',
  help: 'Total number of authorization code injection attempts detected',
  registers: [register],
});

// ========================================
// Discovery Metrics
// ========================================

/**
 * Total number of OAuth metadata discovery attempts
 * Labels: method (rfc9728/www-authenticate/manual), status (success/failure)
 */
export const discoveryAttemptsTotal = new Counter({
  name: 'oauth_discovery_attempts_total',
  help: 'Total number of OAuth metadata discovery attempts',
  labelNames: ['method', 'status'],
  registers: [register],
});

/**
 * OAuth discovery operation duration in seconds
 * Labels: method, status
 */
export const discoveryDuration = new Histogram({
  name: 'oauth_discovery_duration_seconds',
  help: 'OAuth discovery operation duration in seconds',
  labelNames: ['method', 'status'],
  buckets: [0.5, 1, 2, 5, 10], // seconds
  registers: [register],
});

// ========================================
// Dynamic Client Registration Metrics
// ========================================

/**
 * Total number of dynamic client registrations
 * Labels: status (success/failure)
 */
export const clientRegistrationsTotal = new Counter({
  name: 'oauth_client_registrations_total',
  help: 'Total number of dynamic client registrations',
  labelNames: ['status'],
  registers: [register],
});

/**
 * Client registration operation duration in seconds
 */
export const clientRegistrationDuration = new Histogram({
  name: 'oauth_client_registration_duration_seconds',
  help: 'Client registration operation duration in seconds',
  labelNames: ['status'],
  buckets: [0.5, 1, 2, 5, 10], // seconds
  registers: [register],
});

// ========================================
// Helper Functions
// ========================================

/**
 * Record OAuth flow initiation
 */
export function recordOAuthFlowStart(provider: string) {
  oauthFlowsTotal.inc({ provider, status: 'initiated' });
}

/**
 * Record OAuth flow completion
 */
export function recordOAuthFlowComplete(provider: string, durationSeconds: number, success: boolean) {
  const status = success ? 'success' : 'failure';
  oauthFlowsTotal.inc({ provider, status });
  oauthFlowDuration.observe({ provider, status }, durationSeconds);
}

/**
 * Record token refresh attempt
 */
export function recordTokenRefresh(success: boolean, durationSeconds: number, reason?: string) {
  const status = success ? 'success' : 'failure';
  tokenRefreshTotal.inc({ status, reason: reason || 'normal' });
  tokenRefreshDuration.observe({ status }, durationSeconds);
}

/**
 * Record token reuse detection
 */
export function recordTokenReuseDetected() {
  tokenRefreshTotal.inc({ status: 'reuse_detected', reason: 'security' });
  securityEventsTotal.inc({ event_type: 'token_reuse', severity: 'critical' });
}

/**
 * Record token revocation
 */
export function recordTokenRevocation(reason: 'reuse_detected' | 'manual' | 'expired' | 'security') {
  tokenRevocationsTotal.inc({ reason });
}

/**
 * Record PKCE state creation
 */
export function recordPkceStateCreated() {
  pkceStatesCreatedTotal.inc();
  activePkceStatesGauge.inc();
}

/**
 * Record PKCE validation
 */
export function recordPkceValidation(success: boolean, reason?: string) {
  const status = success ? 'success' : 'failure';
  pkceValidationsTotal.inc({ status, reason: reason || 'valid' });
}

/**
 * Record PKCE cleanup
 */
export function recordPkceCleanup(count: number, reason: 'expired' | 'manual' | 'server_deleted') {
  pkceStatesCleanedTotal.inc({ reason }, count);
  activePkceStatesGauge.dec(count);
}

/**
 * Record integrity violation
 */
export function recordIntegrityViolation(violationType: 'hash_mismatch' | 'state_reuse' | 'user_mismatch') {
  integrityViolationsTotal.inc({ violation_type: violationType });
  securityEventsTotal.inc({ event_type: 'integrity_violation', severity: 'high' });
}

/**
 * Record code injection attempt
 */
export function recordCodeInjectionAttempt() {
  codeInjectionAttemptsTotal.inc();
  securityEventsTotal.inc({ event_type: 'code_injection', severity: 'critical' });
}

/**
 * Record OAuth discovery
 */
export function recordDiscovery(
  method: 'rfc9728' | 'www-authenticate' | 'manual',
  success: boolean,
  durationSeconds: number
) {
  const status = success ? 'success' : 'failure';
  discoveryAttemptsTotal.inc({ method, status });
  discoveryDuration.observe({ method, status }, durationSeconds);
}

/**
 * Record client registration
 */
export function recordClientRegistration(success: boolean, durationSeconds: number) {
  const status = success ? 'success' : 'failure';
  clientRegistrationsTotal.inc({ status });
  clientRegistrationDuration.observe({ status }, durationSeconds);
}

/**
 * Update active tokens gauge
 * Should be called periodically or on token changes
 */
export function updateActiveTokensGauge(count: number) {
  activeTokensGauge.set(count);
}

/**
 * Update active PKCE states gauge
 * Should be called periodically or on PKCE state changes
 */
export function updateActivePkceStatesGauge(count: number) {
  activePkceStatesGauge.set(count);
}
