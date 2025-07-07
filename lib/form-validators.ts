import { z } from 'zod';

/**
 * Common validation schemas for reuse across forms
 */

// Email validation
export const emailSchema = z
  .string()
  .min(1, 'Email is required')
  .email('Invalid email address');

// Password validation with strength requirements
export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
  .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
  .regex(/[0-9]/, 'Password must contain at least one number');

// Simple password for less strict requirements
export const simplePasswordSchema = z
  .string()
  .min(6, 'Password must be at least 6 characters');

// Username validation
export const usernameSchema = z
  .string()
  .min(3, 'Username must be at least 3 characters')
  .max(20, 'Username must be at most 20 characters')
  .regex(/^[a-zA-Z0-9_-]+$/, 'Username can only contain letters, numbers, underscores, and hyphens');

// Name validation
export const nameSchema = z
  .string()
  .min(1, 'Name is required')
  .max(100, 'Name is too long');

// URL validation
export const urlSchema = z
  .string()
  .url('Invalid URL')
  .refine((url) => url.startsWith('http://') || url.startsWith('https://'), {
    message: 'URL must start with http:// or https://',
  });

// Optional URL validation
export const optionalUrlSchema = z
  .string()
  .optional()
  .refine(
    (url) => !url || url.startsWith('http://') || url.startsWith('https://'),
    { message: 'URL must start with http:// or https://' }
  );

// UUID validation
export const uuidSchema = z
  .string()
  .uuid('Invalid UUID format');

// Environment variable validation (KEY=VALUE format)
export const envVarSchema = z
  .string()
  .regex(/^[A-Z_][A-Z0-9_]*=.*$/, 'Invalid environment variable format (KEY=VALUE)');

// Command validation (no dangerous characters)
export const commandSchema = z
  .string()
  .min(1, 'Command is required')
  .refine((cmd) => !cmd.includes('&&') && !cmd.includes('||') && !cmd.includes(';'), {
    message: 'Command cannot contain shell operators',
  });

// Port number validation
export const portSchema = z
  .number()
  .int('Port must be an integer')
  .min(1, 'Port must be at least 1')
  .max(65535, 'Port must be at most 65535');

// File path validation
export const filePathSchema = z
  .string()
  .min(1, 'File path is required')
  .refine((path) => !path.includes('..'), {
    message: 'File path cannot contain parent directory references',
  });

// JSON validation
export const jsonSchema = z.string().refine((str) => {
  try {
    JSON.parse(str);
    return true;
  } catch {
    return false;
  }
}, 'Invalid JSON format');

// Create a schema factory for pagination
export const createPaginationSchema = (maxLimit = 100) =>
  z.object({
    page: z.number().int().min(1).default(1),
    limit: z.number().int().min(1).max(maxLimit).default(10),
  });

// Create a schema factory for search with pagination
export const createSearchSchema = (maxLimit = 100) =>
  z.object({
    query: z.string().optional(),
    page: z.number().int().min(1).default(1),
    limit: z.number().int().min(1).max(maxLimit).default(10),
  });

// Common form schemas
export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Password is required'),
});

export const registerSchema = z.object({
  name: nameSchema,
  email: emailSchema,
  password: passwordSchema,
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ['confirmPassword'],
});

export const forgotPasswordSchema = z.object({
  email: emailSchema,
});

export const resetPasswordSchema = z.object({
  password: passwordSchema,
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ['confirmPassword'],
});