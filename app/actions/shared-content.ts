'use server';

import { and, desc, eq, sql } from 'drizzle-orm';

import { db } from '@/db';
import {
  McpServerSource,
  profilesTable,
  projectsTable,
  serverRatingsTable,
  sharedMcpServersTable,
  users,
} from '@/db/schema';
// Removed unused McpIndex import
import { SearchIndex } from '@/types/search';


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
    console.log(`Fetching shared servers for username: ${username}`);
    
    // 1. Find the user by username
    const user = await db.query.users.findFirst({
      where: eq(users.username, username),
      columns: { id: true }, // Only need the ID
    });

    if (!user) {
      console.warn(`User not found for username: ${username}`);
      return {}; // Return empty if user not found
    }
    
    console.log(`Found user with ID: ${user.id}`);

    // 2. First get all projects for the user
    const projects = await db.query.projectsTable.findMany({
      where: eq(projectsTable.user_id, user.id),
      columns: { uuid: true }
    });

    if (!projects.length) {
      console.warn(`No projects found for user: ${username}`);
      return {};
    }

    const projectUuids = projects.map(p => p.uuid);
    console.log(`Found ${projects.length} projects for user`);

    // 3. Then get all profiles for these projects
    const profiles = await db.query.profilesTable.findMany({
      where: sql`${profilesTable.project_uuid} IN ${projectUuids}`,
      columns: { uuid: true }
    });

    if (!profiles.length) {
      console.warn(`No profiles found for user: ${username}`);
      return {}; // Return empty if no profiles found
    }
    
    console.log(`Found ${profiles.length} profiles for user`);

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

    console.log(`Found ${sharedServers.length} shared servers across all profiles`);

    // 4. Transform into SearchIndex format
    const formattedResults: SearchIndex = {};
    for (const sharedServer of sharedServers) {
      // Get rating data
      const ratingData = await db
        .select({
          avgRating: sql<number>`avg(${serverRatingsTable.rating})`.mapWith(Number),
          ratingCount: sql<number>`count(${serverRatingsTable.rating})`.mapWith(Number),
        })
        .from(serverRatingsTable)
        .where(
          and(
            eq(serverRatingsTable.source, McpServerSource.COMMUNITY),
            eq(serverRatingsTable.external_id, sharedServer.uuid)
          )
        )
        .groupBy(serverRatingsTable.source, serverRatingsTable.external_id)
        .limit(1);

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
        rating: ratingData[0]?.avgRating ?? undefined,
        ratingCount: ratingData[0]?.ratingCount ?? undefined,
        shared_by: username,
        shared_by_profile_url: `/to/${username}`,
        // Required fields from McpIndex
        githubUrl: null,
        package_name: null,
        github_stars: null,
        package_registry: null,
        package_download_count: null,
      };
    }

    console.log(`Successfully formatted ${Object.keys(formattedResults).length} shared servers`);
    return formattedResults;
  } catch (error) {
    console.error(`Error fetching shared servers for user ${username}:`, error);
    return {}; // Return empty on error
  }
}
