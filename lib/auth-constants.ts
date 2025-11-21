import { z } from 'zod';

/**
 * Bcrypt Cost Factor Configuration
 *
 * Cost factor 14 was chosen based on:
 * - Security: Provides ~16,384 iterations (2^14), significantly harder to brute-force than 12 (4,096 iterations)
 * - Performance: Tested to take ~500-800ms on production hardware (acceptable for auth operations)
 * - Industry standards: OWASP recommends minimum cost of 10, we exceed this for additional security
 * - Future-proofing: As hardware improves, this provides longer-term protection
 * - Consistency: Used across all password operations (set, change, registration)
 */
export const BCRYPT_COST_FACTOR = 14;

/**
 * Shared Zod schemas for password operations
 */
export const passwordSchema = z.string().min(8);

export const setPasswordSchema = z.object({
  password: passwordSchema,
  confirmPassword: z.string().min(1),
}).refine((data) => data.password === data.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: passwordSchema,
  confirmPassword: z.string().min(1),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: 'New passwords do not match',
  path: ['confirmPassword'],
});

export const removePasswordSchema = z.object({
  confirmEmail: z.string().email(),
});

export const registerSchema = z.object({
  name: z.string().min(2).max(100),
  email: z.string().email(),
  password: passwordSchema,
});
