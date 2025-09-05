/**
 * Authentication security utilities for tracking and preventing brute force attacks
 */

import { eq } from 'drizzle-orm';

import { db } from '@/db';
import { users } from '@/db/schema';

import log from './logger';

// Configuration constants
const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_DURATION_MINUTES = 15;
const LOCKOUT_DURATION_MS = LOCKOUT_DURATION_MINUTES * 60 * 1000;

/**
 * Check if an account is currently locked
 */
export async function isAccountLocked(email: string): Promise<boolean> {
  try {
    const user = await db.query.users.findFirst({
      where: eq(users.email, email),
      columns: {
        account_locked_until: true,
        failed_login_attempts: true,
      },
    });

    if (!user) {
      return false;
    }

    // Check if account is locked
    if (user.account_locked_until && user.account_locked_until > new Date()) {
      log.security('ACCOUNT_LOCKED_CHECK', null, {
        email,
        locked_until: user.account_locked_until,
        attempts: user.failed_login_attempts,
      });
      return true;
    }

    // If lock has expired, we'll clear it on next login attempt
    return false;
  } catch (error) {
    log.error('Failed to check account lock status', error, { email });
    return false; // Fail open to avoid blocking legitimate users
  }
}

/**
 * Record a failed login attempt and lock account if threshold is reached
 */
export async function recordFailedLoginAttempt(
  email: string,
  ipAddress: string,
  userAgent: string
): Promise<{ locked: boolean; remainingAttempts: number }> {
  try {
    const user = await db.query.users.findFirst({
      where: eq(users.email, email),
      columns: {
        id: true,
        failed_login_attempts: true,
        account_locked_until: true,
      },
    });

    if (!user) {
      // Log attempt for non-existent user (potential enumeration attack)
      log.security('FAILED_LOGIN_NONEXISTENT_USER', null, {
        email,
        ip_address: ipAddress,
        user_agent: userAgent,
      });
      return { locked: false, remainingAttempts: 0 };
    }

    // Check if lock has expired
    const lockExpired = user.account_locked_until && user.account_locked_until <= new Date();
    
    // Calculate new attempt count
    const newAttempts = lockExpired ? 1 : (user.failed_login_attempts || 0) + 1;
    
    // Determine if account should be locked
    const shouldLock = newAttempts >= MAX_LOGIN_ATTEMPTS;
    const lockUntil = shouldLock ? new Date(Date.now() + LOCKOUT_DURATION_MS) : null;

    // Update user record
    await db
      .update(users)
      .set({
        failed_login_attempts: newAttempts,
        account_locked_until: lockUntil,
        last_login_ip: ipAddress,
      })
      .where(eq(users.id, user.id));

    // Log the failed attempt
    log.security('FAILED_LOGIN_ATTEMPT', user.id, {
      email,
      attempt_number: newAttempts,
      locked: shouldLock,
      ip_address: ipAddress,
      user_agent: userAgent,
    });

    // Create audit log entry
    await createAuditLog({
      userId: user.id,
      action: 'FAILED_LOGIN',
      resourceType: 'authentication',
      ipAddress,
      userAgent,
      metadata: {
        attempt_number: newAttempts,
        account_locked: shouldLock,
      },
    });

    return {
      locked: shouldLock,
      remainingAttempts: Math.max(0, MAX_LOGIN_ATTEMPTS - newAttempts),
    };
  } catch (error) {
    log.error('Failed to record login attempt', error, { email });
    return { locked: false, remainingAttempts: 1 };
  }
}

/**
 * Clear failed login attempts after successful login
 */
export async function clearFailedLoginAttempts(
  userId: string,
  ipAddress: string,
  userAgent: string
): Promise<void> {
  try {
    await db
      .update(users)
      .set({
        failed_login_attempts: 0,
        account_locked_until: null,
        last_login_at: new Date(),
        last_login_ip: ipAddress,
      })
      .where(eq(users.id, userId));

    log.security('SUCCESSFUL_LOGIN', userId, {
      ip_address: ipAddress,
      user_agent: userAgent,
    });

    // Create audit log entry
    await createAuditLog({
      userId,
      action: 'SUCCESSFUL_LOGIN',
      resourceType: 'authentication',
      ipAddress,
      userAgent,
      metadata: {},
    });
  } catch (error) {
    log.error('Failed to clear login attempts', error, { userId });
  }
}

/**
 * Check if a password meets complexity requirements
 */
export function isPasswordComplex(password: string): {
  isValid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (password.length < 8) {
    errors.push('Password must be at least 8 characters long');
  }

  if (!/[a-z]/.test(password)) {
    errors.push('Password must contain at least one lowercase letter');
  }

  if (!/[A-Z]/.test(password)) {
    errors.push('Password must contain at least one uppercase letter');
  }

  if (!/[0-9]/.test(password)) {
    errors.push('Password must contain at least one number');
  }

  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
    errors.push('Password must contain at least one special character');
  }

  // Check for common weak patterns
  const weakPatterns = [
    /^password/i,
    /^123456/,
    /^qwerty/i,
    /^admin/i,
    /^letmein/i,
    /^welcome/i,
  ];

  if (weakPatterns.some(pattern => pattern.test(password))) {
    errors.push('Password is too common or follows a weak pattern');
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Track password change for security
 */
export async function recordPasswordChange(
  userId: string,
  ipAddress: string,
  userAgent: string
): Promise<void> {
  try {
    await db
      .update(users)
      .set({
        password_changed_at: new Date(),
      })
      .where(eq(users.id, userId));

    log.security('PASSWORD_CHANGED', userId, {
      ip_address: ipAddress,
      user_agent: userAgent,
    });

    // Create audit log entry
    await createAuditLog({
      userId,
      action: 'PASSWORD_CHANGE',
      resourceType: 'authentication',
      ipAddress,
      userAgent,
      metadata: {},
    });

    // TODO: Invalidate all existing sessions for this user
    // This requires session management implementation
  } catch (error) {
    log.error('Failed to record password change', error, { userId });
  }
}

/**
 * Create an audit log entry
 */
async function createAuditLog({
  userId,
  action,
  resourceType,
  resourceId,
  ipAddress,
  userAgent,
  metadata,
}: {
  userId: string | null;
  action: string;
  resourceType?: string;
  resourceId?: string;
  ipAddress: string;
  userAgent: string;
  metadata: Record<string, any>;
}): Promise<void> {
  try {
    // Note: This requires the audit_logs table to be created via migration
    // For now, we'll just log to the application logger
    log.info('Audit log entry', {
      type: 'AUDIT_LOG',
      user_id: userId,
      action,
      resource_type: resourceType,
      resource_id: resourceId,
      ip_address: ipAddress,
      user_agent: userAgent,
      metadata,
    });

    // TODO: When audit_logs table is ready, uncomment this:
    /*
    await db.insert(auditLogs).values({
      user_id: userId,
      action,
      resource_type: resourceType,
      resource_id: resourceId,
      ip_address: ipAddress,
      user_agent: userAgent,
      metadata,
    });
    */
  } catch (error) {
    log.error('Failed to create audit log', error, {
      action,
      userId,
    });
  }
}

/**
 * Get login attempt information for display
 */
export async function getLoginAttemptInfo(email: string): Promise<{
  attempts: number;
  lockedUntil: Date | null;
  isLocked: boolean;
}> {
  try {
    const user = await db.query.users.findFirst({
      where: eq(users.email, email),
      columns: {
        failed_login_attempts: true,
        account_locked_until: true,
      },
    });

    if (!user) {
      return {
        attempts: 0,
        lockedUntil: null,
        isLocked: false,
      };
    }

    const isLocked = !!(user.account_locked_until && user.account_locked_until > new Date());

    return {
      attempts: user.failed_login_attempts || 0,
      lockedUntil: user.account_locked_until,
      isLocked,
    };
  } catch (error) {
    log.error('Failed to get login attempt info', error, { email });
    return {
      attempts: 0,
      lockedUntil: null,
      isLocked: false,
    };
  }
}

// Export constants for use in other modules
export const AUTH_CONSTANTS = {
  MAX_LOGIN_ATTEMPTS,
  LOCKOUT_DURATION_MINUTES,
  LOCKOUT_DURATION_MS,
};

export default {
  isAccountLocked,
  recordFailedLoginAttempt,
  clearFailedLoginAttempts,
  isPasswordComplex,
  recordPasswordChange,
  getLoginAttemptInfo,
  AUTH_CONSTANTS,
};