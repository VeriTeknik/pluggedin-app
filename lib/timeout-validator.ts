/**
 * Timeout validation utilities to prevent resource exhaustion attacks
 */

export interface TimeoutLimits {
  min: number;
  max: number;
  default: number;
}

export const TIMEOUT_PRESETS = {
  perServer: {
    min: 1000,      // 1 second minimum
    max: 60000,     // 60 seconds maximum
    default: 20000  // 20 seconds default
  } as TimeoutLimits,
  
  total: {
    min: 5000,       // 5 seconds minimum
    max: 300000,     // 5 minutes maximum
    default: 60000   // 60 seconds default
  } as TimeoutLimits
} as const;

/**
 * Validates and clamps a timeout value within safe bounds
 * to prevent DoS attacks via user-controlled timeout values
 * 
 * @param userValue - The user-provided timeout value
 * @param limits - The timeout limits to apply
 * @returns The validated and clamped timeout value
 */
export function validateTimeout(
  userValue: number | undefined,
  limits: TimeoutLimits
): number {
  // Handle NaN, undefined, or invalid values by using default
  const value = (userValue === undefined || isNaN(userValue)) ? limits.default : userValue;
  
  // Clamp the value between min and max
  return Math.min(
    Math.max(limits.min, value),
    limits.max
  );
}

/**
 * Validates multiple timeout values at once
 * 
 * @param timeouts - Object containing timeout values to validate
 * @returns Object with validated timeout values
 */
export function validateTimeouts(timeouts: {
  perServer?: number;
  total?: number;
}): {
  perServerTimeout: number;
  totalTimeout: number;
} {
  return {
    perServerTimeout: validateTimeout(timeouts.perServer, TIMEOUT_PRESETS.perServer),
    totalTimeout: validateTimeout(timeouts.total, TIMEOUT_PRESETS.total)
  };
}