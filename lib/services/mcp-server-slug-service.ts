/**
 * MCP Server Slug Service
 * Handles slug generation, uniqueness, and management for MCP servers
 */

import type { PgTransaction } from 'drizzle-orm/pg-core';
import { and, eq, not } from 'drizzle-orm';

import { db } from '@/db';
import { mcpServersTable } from '@/db/schema';
import { generateSlug, generateUniqueSlug, isValidSlug } from '@/lib/utils/slug-utils';
import { generateSlugSchema } from '@/lib/validation/mcp-server-schemas';

export class McpServerSlugService {
  /**
   * Build an AND() predicate for a profile, plus optional slug/uuid/excludeUuid.
   */
  private static buildPredicates(opts: {
    profileUuid: string;
    slug?: string;
    uuid?: string;
    excludeUuid?: string;
  }) {
    const predicates = [eq(mcpServersTable.profile_uuid, opts.profileUuid)];
    if (opts.slug) predicates.push(eq(mcpServersTable.slug, opts.slug));
    if (opts.uuid) predicates.push(eq(mcpServersTable.uuid, opts.uuid));
    if (opts.excludeUuid) predicates.push(not(eq(mcpServersTable.uuid, opts.excludeUuid)));
    return and(...predicates);
  }

  /**
   * Run a select … limit(1) and return the single row or null.
   */
  private static async findOne(
    fields: any,
    where: any,
    tx?: PgTransaction<any, any, any>
  ): Promise<any> {
    const dbInstance = tx || db;
    const rows = await dbInstance
      .select(fields)
      .from(mcpServersTable)
      .where(where)
      .limit(1);
    return rows[0] ?? null;
  }

  /**
   * Validates input for slug generation
   */
  private static validateInput(input: {
    name: string;
    profileUuid: string;
    excludeUuid?: string;
  }) {
    const result = generateSlugSchema.safeParse(input);
    if (!result.success) {
      throw new Error('Invalid input for slug generation');
    }
  }

  /**
   * Validates a slug format
   * @param slug - The slug to validate
   * @returns The validated slug
   * @throws Error if slug is invalid
   */
  private static validateSlug(slug: string): string {
    if (!isValidSlug(slug)) {
      throw new Error(`Invalid slug format: ${slug}`);
    }
    return slug;
  }

  /**
   * Generates a unique slug for an MCP server
   * @param serverName - The server name to generate slug from
   * @param profileUuid - The profile UUID to ensure uniqueness within profile scope
   * @param excludeUuid - Optional server UUID to exclude from uniqueness check (for updates)
   * @param tx - Optional transaction to use
   * @returns A unique slug
   */
  static async generateUniqueSlug(
    serverName: string,
    profileUuid: string,
    excludeUuid?: string,
    tx?: PgTransaction<any, any, any>
  ): Promise<string> {
    const dbInstance = tx || db;
    const baseSlug = generateSlug(serverName);

    // Get existing slugs for this profile (using proper SQL exclusion)
    const existingServers = await dbInstance
      .select({ slug: mcpServersTable.slug })
      .from(mcpServersTable)
      .where(
        this.buildPredicates({ profileUuid, excludeUuid })
      );

    // Filter out null/undefined slugs
    const existingSlugs = existingServers
      .map(server => server.slug)
      .filter((slug): slug is string => slug !== null && slug !== undefined);

    return generateUniqueSlug(baseSlug, existingSlugs);
  }

  /**
   * Checks if a slug is available in the given profile
   * @param slug - The slug to check
   * @param profileUuid - The profile UUID
   * @param excludeUuid - Optional server UUID to exclude from the check
   * @param tx - Optional transaction to use
   * @returns True if available, false otherwise
   */
  static async isSlugAvailable(
    slug: string,
    profileUuid: string,
    excludeUuid?: string,
    tx?: PgTransaction<any, any, any>
  ): Promise<boolean> {
    const validatedSlug = this.validateSlug(slug);

    const server = await this.findOne(
      { uuid: mcpServersTable.uuid },
      this.buildPredicates({ profileUuid, slug: validatedSlug, excludeUuid }),
      tx
    );

    return server === null;
  }

  /**
   * Updates the slug for an MCP server
   * @param serverUuid - The server UUID
   * @param newSlug - The new slug
   * @param profileUuid - The profile UUID (for validation)
   * @param tx - Optional transaction to use
   * @returns The updated slug
   */
  static async updateServerSlug(
    serverUuid: string,
    newSlug: string,
    profileUuid: string,
    tx?: PgTransaction<any, any, any>
  ): Promise<string> {
    const validatedSlug = this.validateSlug(newSlug);
    const dbInstance = tx || db;

    if (!await this.isSlugAvailable(validatedSlug, profileUuid, serverUuid, tx)) {
      throw new Error(`Slug "${validatedSlug}" is already in use`);
    }

    await dbInstance
      .update(mcpServersTable)
      .set({ slug: validatedSlug })
      .where(this.buildPredicates({ profileUuid, uuid: serverUuid }));

    return validatedSlug;
  }

  /**
   * Centralized method for generating and setting slugs with validation
   * @param serverUuid - The server UUID
   * @param serverName - The server name
   * @param profileUuid - The profile UUID
   * @param excludeUuid - Optional UUID to exclude (for updates)
   * @param tx - Optional transaction to use
   * @returns The generated slug
   */
  static async generateAndSetSlug(
    serverUuid: string,
    serverName: string,
    profileUuid: string,
    excludeUuid?: string,
    tx?: PgTransaction<any, any, any>
  ): Promise<string> {
    // Validate input
    this.validateInput({ name: serverName, profileUuid, excludeUuid });
    
    const dbInstance = tx || db;
    const uniqueSlug = await this.generateUniqueSlug(serverName, profileUuid, excludeUuid, tx);
    
    // Update the server with the new slug
    await dbInstance
      .update(mcpServersTable)
      .set({ slug: uniqueSlug })
      .where(this.buildPredicates({ profileUuid, uuid: serverUuid }));
    
    return uniqueSlug;
  }

  /**
   * Gets the slug for a server by UUID
   * @param serverUuid - The server UUID
   * @param profileUuid - The profile UUID (for security)
   * @param tx - Optional transaction to use
   * @returns The slug or null if not found
   */
  static async getServerSlug(
    serverUuid: string,
    profileUuid: string,
    tx?: PgTransaction<any, any, any>
  ): Promise<string | null> {
    const row = await this.findOne(
      { slug: mcpServersTable.slug },
      this.buildPredicates({ profileUuid, uuid: serverUuid }),
      tx
    );
    return row?.slug ?? null;
  }

  /**
   * Gets server information by slug
   * @param slug - The server slug
   * @param profileUuid - The profile UUID
   * @param tx - Optional transaction to use
   * @returns Server information or null if not found
   */
  static async getServerBySlug(
    slug: string,
    profileUuid: string,
    tx?: PgTransaction<any, any, any>
  ): Promise<{ uuid: string; name: string } | null> {
    const validatedSlug = this.validateSlug(slug);

    return await this.findOne(
      {
        uuid: mcpServersTable.uuid,
        name: mcpServersTable.name
      },
      this.buildPredicates({ profileUuid, slug: validatedSlug }),
      tx
    );
  }
}