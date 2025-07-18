'use server';

import { and, desc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';

import { db } from '@/db';
import {
  McpServerSource,
  profilesTable,
  projectsTable,
  sharedMcpServersTable,
  users,
} from '@/db/schema';
// Removed unused McpIndex import
import { SearchIndex } from '@/types/search';

const usernameSchema = z.string().min(1).max(30);
const limitSchema = z.number().int().min(1).max(100).default(6);


/**
 * Fetches MCP servers shared by a specific user and formats them
 * for display in CardGrid.
 * @param username The username of the user whose shared servers to fetch.
 * @returns A promise resolving to a SearchIndex object.
 */
export async function getFormattedSharedServersForUser(
  username: string
): Promise<SearchIndex> {
  try {
    // Validate input
    const validatedUsername = usernameSchema.parse(username);
    
    
    // 1. Find the user by username
    const user = await db.query.users.findFirst({
      where: eq(users.username, validatedUsername),
      columns: { id: true }, // Only need the ID
    });

    if (!user) {
      console.warn(`User not found for username: ${validatedUsername}`);
      return {}; // Return empty if user not found
    }
    

    // 2. First get all projects for the user
    const projects = await db.query.projectsTable.findMany({
      where: eq(projectsTable.user_id, user.id),
      columns: { uuid: true }
    });

    if (!projects.length) {
      console.warn(`No projects found for user: ${validatedUsername}`);
      return {};
    }

    const projectUuids = projects.map(p => p.uuid);

    // 3. Then get all profiles for these projects
    const profiles = await db.query.profilesTable.findMany({
      where: sql`${profilesTable.project_uuid} IN ${projectUuids}`,
      columns: { uuid: true }
    });

    if (!profiles.length) {
      console.warn(`No profiles found for user: ${validatedUsername}`);
      return {}; // Return empty if no profiles found
    }
    

    // Get profile UUIDs for the IN clause
    const profileUuids = profiles.map(p => p.uuid);

    // 4. Fetch shared servers linked to any of the user's profiles
    const sharedServers = await db
      .select({
        uuid: sharedMcpServersTable.uuid,
        title: sharedMcpServersTable.title,
        description: sharedMcpServersTable.description,
        template: sharedMcpServersTable.template,
      })
      .from(sharedMcpServersTable)
      .where(
        and(
          sql`${sharedMcpServersTable.profile_uuid} IN ${profileUuids}`,
          eq(sharedMcpServersTable.is_public, true)
        )
      )
      .orderBy(desc(sharedMcpServersTable.created_at));


    // 4. Transform into SearchIndex format
    const formattedResults: SearchIndex = {};
    for (const sharedServer of sharedServers) {
      // Analytics API deprecated - using default values until new analytics service is ready
      const avgRating = 0;
      const ratingCount = 0;

      // Parse the template JSON
      const template = sharedServer.template as any;

      formattedResults[sharedServer.uuid] = {
        name: sharedServer.title,
        description: sharedServer.description || '',
        source: McpServerSource.COMMUNITY,
        external_id: sharedServer.uuid,
        command: template.command || '',
        args: template.args || [],
        envs: template.env ? Object.keys(template.env) : [],
        url: template.url ?? undefined,
        rating: avgRating,
        ratingCount: ratingCount,
        shared_by: validatedUsername,
        shared_by_profile_url: `/to/${validatedUsername}`,
        // Required fields from McpIndex
        githubUrl: null,
        package_name: null,
        github_stars: null,
        package_registry: null,
        package_download_count: null,
      };
    }

    return formattedResults;
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error('Validation error:', error.errors);
      return {};
    }
    console.error(`Error fetching shared servers:`, error);
    return {}; // Return empty on error
  }
}

/**
 * Fetches the top N public community MCP servers for unauthenticated discovery (e.g., /to/ page).
 * @param limit Number of servers to fetch (default: 6)
 * @returns A promise resolving to a SearchIndex object.
 */
export async function getTopCommunitySharedServers(limit: number = 6): Promise<SearchIndex> {
  try {
    // Validate input
    const validatedLimit = limitSchema.parse(limit);
    // Join shared servers with profiles, projects, and users for attribution
    const sharedServers = await db
      .select({
        sharedServer: sharedMcpServersTable,
        profile: profilesTable,
        user: users,
      })
      .from(sharedMcpServersTable)
      .innerJoin(profilesTable, eq(sharedMcpServersTable.profile_uuid, profilesTable.uuid))
      .innerJoin(projectsTable, eq(profilesTable.project_uuid, projectsTable.uuid))
      .innerJoin(users, eq(projectsTable.user_id, users.id))
      .where(eq(sharedMcpServersTable.is_public, true))
      .orderBy(desc(sharedMcpServersTable.created_at))
      .limit(validatedLimit);

    const formattedResults: SearchIndex = {};
    for (const { sharedServer, user } of sharedServers) {
      const template = sharedServer.template as any;
      formattedResults[sharedServer.uuid] = {
        name: sharedServer.title,
        description: sharedServer.description || '',
        source: McpServerSource.COMMUNITY,
        external_id: sharedServer.uuid,
        command: template.command || '',
        args: template.args || [],
        envs: template.env ? Object.keys(template.env) : [],
        url: template.url ?? undefined,
        rating: undefined, // Not fetched here for performance
        ratingCount: undefined,
        shared_by: user?.username || 'Unknown User',
        shared_by_profile_url: user?.username ? `/to/${user.username}` : null,
        githubUrl: null,
        package_name: null,
        github_stars: null,
        package_registry: null,
        package_download_count: null,
      };
    }
    return formattedResults;
  } catch (error) {
    console.error('Error fetching top community shared servers:', error);
    return {};
  }
}
