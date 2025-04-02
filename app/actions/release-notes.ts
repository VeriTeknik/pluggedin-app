'use server';

import { and, desc, eq, sql } from 'drizzle-orm';
import { unstable_cache as cache } from 'next/cache'; // Using Next.js caching

import { db } from '@/db';
import { releaseNotes } from '@/db/schema';
import { generateHistoricalReleaseNotes, getProcessedReleaseNotes } from '@/lib/github/release-fetcher';
import type { ReleaseNote, ReleaseNoteContentDb } from '@/types/release';

const REPOSITORIES: ('pluggedin-app' | 'pluggedin-mcp')[] = ['pluggedin-app', 'pluggedin-mcp'];
const CACHE_KEY_PREFIX = 'release_notes_';
const CACHE_TTL_SECONDS = 3600; // Cache for 1 hour

/**
 * Fetches the latest release notes from GitHub for all specified repositories,
 * updates the database, and invalidates the cache.
 * Intended to be called by a webhook or scheduled job.
 */
export async function updateReleaseNotesFromGitHub(): Promise<{ success: boolean; message: string; updatedRepos: string[]; error?: string }> {
  console.log('Starting GitHub release notes update...');
  const updatedRepos: string[] = [];
  let overallSuccess = true;
  let errorMessage = '';

  for (const repo of REPOSITORIES) {
    try {
      console.log(`Fetching processed release notes for ${repo}...`);
      const notesFromGitHub = await getProcessedReleaseNotes(repo);
      console.log(`Fetched ${notesFromGitHub.length} notes for ${repo}.`);

      if (notesFromGitHub.length > 0) {
        // Upsert logic: Insert new notes or update existing ones based on version and repo
        // Drizzle doesn't have a direct upsert based on multiple columns easily without raw SQL or complex logic.
        // Simple approach: Delete existing for the repo and insert all fetched ones.
        // More robust: Fetch existing versions, compare, insert/update selectively.

        // Using the simpler approach for now:
        console.log(`Deleting existing notes for ${repo}...`);
        await db.delete(releaseNotes).where(eq(releaseNotes.repository, repo));

        console.log(`Inserting ${notesFromGitHub.length} new notes for ${repo}...`);
        const dataToInsert = notesFromGitHub.map(note => ({
          repository: note.repository,
          version: note.version,
          releaseDate: new Date(note.releaseDate), // Ensure it's a Date object
          content: note.content as any, // Cast needed for jsonb type
          commitSha: note.commitSha,
        }));

        await db.insert(releaseNotes).values(dataToInsert);
        updatedRepos.push(repo);
        console.log(`Successfully updated notes for ${repo}.`);

        // Invalidate cache for this repository
        // Note: Revalidating tags requires Next.js 13.4+ App Router setup
        // Revalidate specific tags if using them
        // revalidateTag(`${CACHE_KEY_PREFIX}${repo}`);
        // revalidateTag(`${CACHE_KEY_PREFIX}all`);
      }
    } catch (error: any) {
      console.error(`Error updating release notes for ${repo}:`, error);
      overallSuccess = false;
      errorMessage += `Failed to update ${repo}: ${error.message}\n`;
    }
  }

  if (overallSuccess) {
    return { success: true, message: `Release notes updated successfully for: ${updatedRepos.join(', ')}`, updatedRepos };
  } else {
    return { success: false, message: 'Some errors occurred during release note update.', updatedRepos, error: errorMessage.trim() };
  }
}

/**
 * Fetches release notes from the database with caching.
 * @param repositoryFilter - Optional filter ('pluggedin-app', 'pluggedin-mcp', or 'all').
 * @param page - Page number for pagination.
 * @param limit - Number of items per page.
 * @returns A promise resolving to an array of ReleaseNote objects.
 */
export async function getReleaseNotes(
  repositoryFilter: 'pluggedin-app' | 'pluggedin-mcp' | 'all' = 'all',
  page = 1,
  limit = 10
): Promise<ReleaseNote[]> {
  const cacheKey = `${CACHE_KEY_PREFIX}${repositoryFilter}_page${page}_limit${limit}`;

  // Using unstable_cache for simple time-based caching
  const cachedNotes = await cache(
    async () => {
      console.log(`Cache miss for ${cacheKey}. Fetching from DB...`);
      const offset = (page - 1) * limit;
      
      // Build query conditions
      const conditions = repositoryFilter !== 'all' 
        ? [eq(releaseNotes.repository, repositoryFilter)] 
        : [];

      const notes = await db.select()
                            .from(releaseNotes)
                            .where(and(...conditions)) // Apply conditions here
                            .orderBy(desc(releaseNotes.releaseDate))
                            .limit(limit)
                            .offset(offset);

      // Convert Date objects to ISO strings and assert repository type
      return notes.map(note => ({
        ...note,
        repository: note.repository as 'pluggedin-app' | 'pluggedin-mcp', // Type assertion
        releaseDate: note.releaseDate.toISOString(),
        content: note.content as ReleaseNoteContentDb, 
        createdAt: note.createdAt.toISOString(),
        updatedAt: note.updatedAt.toISOString(),
      }));
    },
    [cacheKey], // Key parts for the cache
    { revalidate: CACHE_TTL_SECONDS } // Cache duration
  )(); // Immediately invoke the cached function

  return cachedNotes;
}


/**
 * Populates the database with historical release notes.
 * Placeholder - requires implementation in release-fetcher.ts first.
 */
export async function populateHistoricalReleaseNotes(): Promise<{ success: boolean; message: string; error?: string }> {
  console.warn('Populating historical release notes is not fully implemented.');
  let overallSuccess = true;
  let errorMessage = '';

  for (const repo of REPOSITORIES) {
    try {
      const historicalNotes = await generateHistoricalReleaseNotes(repo);
      if (historicalNotes.length > 0) {
        // Similar upsert/insert logic as in updateReleaseNotesFromGitHub
        // Be careful not to overwrite newer notes if run multiple times.
        // Maybe check if version exists before inserting?
        const existingVersions = await db.select({ version: releaseNotes.version })
                                         .from(releaseNotes)
                                         .where(eq(releaseNotes.repository, repo));
        const existingVersionSet = new Set(existingVersions.map(v => v.version));

        const notesToInsert = historicalNotes
          .filter(note => !existingVersionSet.has(note.version))
          .map(note => ({
            repository: note.repository,
            version: note.version,
            releaseDate: new Date(note.releaseDate),
            content: note.content as any,
            commitSha: note.commitSha,
          }));

        if (notesToInsert.length > 0) {
          await db.insert(releaseNotes).values(notesToInsert);
          console.log(`Inserted ${notesToInsert.length} historical notes for ${repo}.`);
        } else {
          console.log(`No new historical notes to insert for ${repo}.`);
        }
      }
    } catch (error: any) {
      console.error(`Error populating historical notes for ${repo}:`, error);
      overallSuccess = false;
      errorMessage += `Failed for ${repo}: ${error.message}\n`;
    }
  }

  if (overallSuccess) {
    return { success: true, message: 'Historical release notes population attempted.' };
  } else {
    return { success: false, message: 'Errors occurred during historical population.', error: errorMessage.trim() };
  }
}

/**
 * Searches release notes based on a query string.
 * Searches within the 'content' JSONB field.
 * @param query - The search term.
 * @param repositoryFilter - Optional repository filter.
 * @returns A promise resolving to an array of matching ReleaseNote objects.
 */
export async function searchReleaseNotes(
  query: string,
  repositoryFilter: 'pluggedin-app' | 'pluggedin-mcp' | 'all' = 'all'
): Promise<ReleaseNote[]> {
   if (!query) return [];

   // Basic search using ILIKE on string representations of content.
   // For more advanced JSONB search, specific operators are needed (e.g., @>, ?).
   // This is a simplified version.
   const searchTerm = `%${query}%`;
   
   // Build query conditions
   const conditions = [sql`CAST(content AS TEXT) ILIKE ${searchTerm}`];
   if (repositoryFilter !== 'all') {
     conditions.push(eq(releaseNotes.repository, repositoryFilter));
   }

   const notes = await db.select()
                         .from(releaseNotes)
                         .where(and(...conditions)) // Apply conditions here
                         .orderBy(desc(releaseNotes.releaseDate));

   return notes.map(note => ({
     ...note,
     repository: note.repository as 'pluggedin-app' | 'pluggedin-mcp', // Type assertion
     releaseDate: note.releaseDate.toISOString(),
     content: note.content as ReleaseNoteContentDb,
     createdAt: note.createdAt.toISOString(),
     updatedAt: note.updatedAt.toISOString(),
   }));
}
