import { z } from 'zod';

import { McpServerSource, McpServerStatus, McpServerType } from '@/db/schema';

/**
 * Slug validation schema
 * Ensures slug follows the correct format: lowercase letters, numbers, and hyphens
 */
export const slugSchema = z.string()
  .min(1, 'Slug cannot be empty')
  .max(50, 'Slug must be less than 50 characters')
  .regex(
    /^[a-z0-9]+(-[a-z0-9]+)*$/,
    'Slug must contain only lowercase letters, numbers, and hyphens (cannot start or end with hyphen)'
  )
  .optional();

/**
 * Base server configuration schema
 */
const baseServerSchema = z.object({
  name: z.string().min(1, 'Name is required').max(255, 'Name must be less than 255 characters'),
  description: z.string().max(1000, 'Description must be less than 1000 characters').optional(),
  notes: z.string().optional(),
  status: z.nativeEnum(McpServerStatus).optional(),
  source: z.nativeEnum(McpServerSource).optional(),
  external_id: z.string().max(255, 'External ID must be less than 255 characters').optional(),
  slug: slugSchema,
});

/**
 * STDIO server configuration schema
 */
export const stdioServerSchema = baseServerSchema.extend({
  type: z.literal(McpServerType.STDIO),
  command: z.string().min(1, 'Command is required'),
  args: z.array(z.string()).optional(),
  env_vars: z.record(z.string()).optional(),
});

/**
 * SSE server configuration schema
 */
export const sseServerSchema = baseServerSchema.extend({
  type: z.literal(McpServerType.SSE),
  server_url: z.string().url('Invalid server URL'),
  headers: z.record(z.string()).optional(),
  sessionId: z.string().optional(),
});

/**
 * Streamable HTTP server configuration schema
 */
export const streamableHttpServerSchema = baseServerSchema.extend({
  type: z.literal(McpServerType.STREAMABLE_HTTP),
  server_url: z.string().url('Invalid server URL'),
  headers: z.record(z.string()).optional(),
  sessionId: z.string().optional(),
});

/**
 * Combined server creation schema
 */
export const createMcpServerSchema = z.discriminatedUnion('type', [
  stdioServerSchema,
  sseServerSchema,
  streamableHttpServerSchema,
]);

/**
 * Server update schema (all fields optional except type)
 */
export const updateMcpServerSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(1000).optional(),
  notes: z.string().optional(),
  status: z.nativeEnum(McpServerStatus).optional(),
  type: z.nativeEnum(McpServerType).optional(),
  command: z.string().optional(),
  args: z.array(z.string()).optional(),
  env_vars: z.record(z.string()).optional(),
  server_url: z.string().url().optional(),
  headers: z.record(z.string()).optional(),
  sessionId: z.string().optional(),
  slug: slugSchema,
});

// Note: Type-dependent validation (e.g., command required for STDIO, server_url required for SSE/STREAMABLE_HTTP)
// is now handled in the business logic layer to support PATCH operations properly.

/**
 * Slug generation request schema
 */
export const generateSlugSchema = z.object({
  name: z.string().min(1, 'Name is required for slug generation').max(255),
  profileUuid: z.string().uuid('Invalid profile UUID'),
  excludeUuid: z.string().uuid('Invalid server UUID').optional(),
});

/**
 * Slug availability check schema
 */
export const checkSlugAvailabilitySchema = z.object({
  slug: slugSchema.refine(val => val !== undefined, 'Slug is required'),
  profileUuid: z.string().uuid('Invalid profile UUID'),
  excludeUuid: z.string().uuid('Invalid server UUID').optional(),
});