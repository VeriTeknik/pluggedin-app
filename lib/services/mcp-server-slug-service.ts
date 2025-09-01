/**
 * MCP Server Slug Service
 * Handles slug generation, uniqueness, and management for MCP servers
 */

import { db } from '@/db';
import { mcpServersTable } from '@/db/schema';
import { eq, and } from 'drizzle-orm';
import { generateSlug, generateUniqueSlug, isValidSlug } from '@/lib/utils/slug-utils';

export class McpServerSlugService {
  /**
   * Generates a unique slug for an MCP server
   * @param serverName - The server name to generate slug from
   * @param profileUuid - The profile UUID to ensure uniqueness within profile scope
   * @param excludeUuid - Optional server UUID to exclude from uniqueness check (for updates)
   * @returns A unique slug
   */
  static async generateUniqueSlug(
    serverName: string,
    profileUuid: string,
    excludeUuid?: string
  ): Promise<string> {
    const baseSlug = generateSlug(serverName);

    // Get existing slugs for this profile (excluding the current server if updating)
    const existingServers = await db
      .select({ slug: mcpServersTable.slug })
      .from(mcpServersTable)
      .where(eq(mcpServersTable.profile_uuid, profileUuid));

    // Filter out null/undefined slugs first
    let existingSlugs = existingServers
      .map(server => server.slug)
      .filter((slug): slug is string => slug !== null && slug !== undefined);

    // If we're updating an existing server, exclude its current slug from uniqueness check
    if (excludeUuid) {
      // Get the current slug of the server being updated to exclude it
      const currentServer = await db
        .select({ slug: mcpServersTable.slug })
        .from(mcpServersTable)
        .where(eq(mcpServersTable.uuid, excludeUuid))
        .limit(1);

      if (currentServer.length > 0 && currentServer[0].slug) {
        existingSlugs = existingSlugs.filter(slug => slug !== currentServer[0].slug);
      }
    }

    return generateUniqueSlug(baseSlug, existingSlugs);
  }

  /**
   * Validates and sanitizes a slug
   * @param slug - The slug to validate
   * @returns The sanitized slug or throws an error
   */
  static validateSlug(slug: string): string {
    if (!slug || typeof slug !== 'string') {
      throw new Error('Slug is required and must be a string');
    }

    const trimmedSlug = slug.trim().toLowerCase();

    if (!isValidSlug(trimmedSlug)) {
      throw new Error('Slug must contain only lowercase letters, numbers, and hyphens, and cannot start or end with a hyphen');
    }

    return trimmedSlug;
  }

  /**
   * Checks if a slug is available for a profile
   * @param slug - The slug to check
   * @param profileUuid - The profile UUID
   * @param excludeUuid - Optional server UUID to exclude from check
   * @returns True if the slug is available
   */
  static async isSlugAvailable(
    slug: string,
    profileUuid: string,
    excludeUuid?: string
  ): Promise<boolean> {
    const validatedSlug = this.validateSlug(slug);

    const existingServer = await db
      .select({ uuid: mcpServersTable.uuid })
      .from(mcpServersTable)
      .where(
        and(
          eq(mcpServersTable.slug, validatedSlug),
          eq(mcpServersTable.profile_uuid, profileUuid),
          excludeUuid ? undefined : undefined // We'll check this in JS
        )
      )
      .limit(1);

    // If no server found, slug is available
    if (existingServer.length === 0) {
      return true;
    }

    // If we have an exclude UUID and it matches the found server, slug is available
    if (excludeUuid && existingServer[0].uuid === excludeUuid) {
      return true;
    }

    return false;
  }

  /**
   * Updates the slug for an MCP server
   * @param serverUuid - The server UUID
   * @param newSlug - The new slug
   * @param profileUuid - The profile UUID (for validation)
   * @returns The updated slug
   */
  static async updateServerSlug(
    serverUuid: string,
    newSlug: string,
    profileUuid: string
  ): Promise<string> {
    const validatedSlug = this.validateSlug(newSlug);

    // Check if slug is available
    const isAvailable = await this.isSlugAvailable(validatedSlug, profileUuid, serverUuid);
    if (!isAvailable) {
      throw new Error(`Slug "${validatedSlug}" is already in use by another server in this profile`);
    }

    // Update the server
    await db
      .update(mcpServersTable)
      .set({ slug: validatedSlug })
      .where(
        and(
          eq(mcpServersTable.uuid, serverUuid),
          eq(mcpServersTable.profile_uuid, profileUuid)
        )
      );

    return validatedSlug;
  }

  /**
   * Generates and sets a slug for a new MCP server
   * @param serverUuid - The server UUID
   * @param serverName - The server name
   * @param profileUuid - The profile UUID
   * @returns The generated slug
   */
  static async generateAndSetSlug(
    serverUuid: string,
    serverName: string,
    profileUuid: string
  ): Promise<string> {
    const slug = await this.generateUniqueSlug(serverName, profileUuid);

    await db
      .update(mcpServersTable)
      .set({ slug })
      .where(
        and(
          eq(mcpServersTable.uuid, serverUuid),
          eq(mcpServersTable.profile_uuid, profileUuid)
        )
      );

    return slug;
  }

  /**
   * Gets the slug for a server by UUID
   * @param serverUuid - The server UUID
   * @param profileUuid - The profile UUID (for security)
   * @returns The slug or null if not found
   */
  static async getServerSlug(serverUuid: string, profileUuid: string): Promise<string | null> {
    const server = await db
      .select({ slug: mcpServersTable.slug })
      .from(mcpServersTable)
      .where(
        and(
          eq(mcpServersTable.uuid, serverUuid),
          eq(mcpServersTable.profile_uuid, profileUuid)
        )
      )
      .limit(1);

    return server.length > 0 ? server[0].slug : null;
  }

  /**
   * Gets server information by slug
   * @param slug - The server slug
   * @param profileUuid - The profile UUID
   * @returns Server information or null if not found
   */
  static async getServerBySlug(slug: string, profileUuid: string) {
    const validatedSlug = this.validateSlug(slug);

    const server = await db
      .select()
      .from(mcpServersTable)
      .where(
        and(
          eq(mcpServersTable.slug, validatedSlug),
          eq(mcpServersTable.profile_uuid, profileUuid)
        )
      )
      .limit(1);

    return server.length > 0 ? server[0] : null;
  }
}