/**
 * PAP Protocol Constants
 *
 * Centralized configuration constants for PAP (Plugged.in Agent Protocol).
 * These values align with PAP-RFC-001 specifications and can be overridden
 * via environment variables where noted.
 */

// ============================================================================
// Heartbeat Intervals (PAP-RFC-001 §8.1)
// ============================================================================

/**
 * Heartbeat modes and their expected intervals in milliseconds.
 * Agents select mode based on activity level:
 * - EMERGENCY: High activity, frequent heartbeats for fast zombie detection
 * - IDLE: Normal operation, standard interval
 * - SLEEP: Low activity/hibernation, extended interval
 */
export const HEARTBEAT_INTERVALS = {
  EMERGENCY: 5 * 1000,      // 5 seconds
  IDLE: 30 * 1000,          // 30 seconds (default)
  SLEEP: 15 * 60 * 1000,    // 15 minutes
} as const;

/**
 * Default heartbeat interval when mode is unknown.
 */
export const DEFAULT_HEARTBEAT_INTERVAL = HEARTBEAT_INTERVALS.IDLE;

/**
 * Grace period multiplier: zombie detected after N missed intervals.
 * Value of 2 means agent is marked unhealthy after missing 2 consecutive intervals.
 */
export const ZOMBIE_GRACE_MULTIPLIER = 2;

/**
 * After how many missed intervals to auto-drain (0 = disabled).
 * When an agent misses this many intervals, it's automatically transitioned to DRAINING.
 */
export const ZOMBIE_AUTO_DRAIN_MULTIPLIER = 5;

// ============================================================================
// Resource Limits (Security)
// ============================================================================

/**
 * Maximum memory limit in GiB.
 * Can be overridden via PAP_MAX_MEMORY_GI environment variable.
 */
export const MAX_MEMORY_GI = parseInt(process.env.PAP_MAX_MEMORY_GI || '16', 10);

/**
 * Maximum CPU cores limit.
 * Can be overridden via PAP_MAX_CPU_CORES environment variable.
 */
export const MAX_CPU_CORES = parseInt(process.env.PAP_MAX_CPU_CORES || '8', 10);

// ============================================================================
// Replay Attack Prevention
// ============================================================================

/**
 * Clock skew tolerance for timestamp validation (milliseconds).
 * Heartbeats with timestamps this far in the future are still accepted.
 */
export const CLOCK_SKEW_TOLERANCE_MS = 5000;

/**
 * Multiplier for max heartbeat age calculation.
 * maxAge = REPLAY_ATTACK_MULTIPLIER * expected_interval
 */
export const REPLAY_ATTACK_MULTIPLIER = 2;

// ============================================================================
// Export Limits
// ============================================================================

/**
 * Maximum number of lifecycle events to include in export.
 */
export const EXPORT_LIFECYCLE_EVENTS_LIMIT = 1000;

/**
 * Default telemetry limit for exports (heartbeats/metrics).
 */
export const EXPORT_TELEMETRY_DEFAULT_LIMIT = 100;

/**
 * Maximum telemetry limit for exports.
 */
export const EXPORT_TELEMETRY_MAX_LIMIT = 10000;
