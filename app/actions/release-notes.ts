'use server';

import { and, desc, eq, sql } from 'drizzle-orm';

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
  const updatedRepos: string[] = [];
  let overallSuccess = true;
  let errorMessage = '';

  for (const repo of REPOSITORIES) {
    try {
      const notesFromGitHub = await getProcessedReleaseNotes(repo);

      if (notesFromGitHub.length > 0) {
        // Get existing versions for this repo
        const existingVersions = await db.select({ 
          version: releaseNotes.version,
          repository: releaseNotes.repository 
        })
        .from(releaseNotes)
        .where(eq(releaseNotes.repository, repo));

        const existingVersionMap = new Map(
          existingVersions.map(v => [`${v.repository}-${v.version}`, true])
        );

        // Filter out duplicates and prepare data for insert
        const dataToInsert = notesFromGitHub
          .filter(note => !existingVersionMap.has(`${note.repository}-${note.version}`))
          .map(note => ({
            repository: note.repository,
            version: note.version,
            releaseDate: new Date(note.releaseDate),
            content: note.content as any,
            commitSha: note.commitSha,
          }));

        if (dataToInsert.length > 0) {
          await db.insert(releaseNotes).values(dataToInsert);
          updatedRepos.push(repo);
        } else {
        }
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
  try {
    const offset = (page - 1) * limit;
    
    // Build query conditions
    const conditions = repositoryFilter !== 'all' 
      ? [eq(releaseNotes.repository, repositoryFilter)] 
      : [];

    const notes = await db.select()
                          .from(releaseNotes)
                          .where(and(...conditions))
                          .orderBy(desc(releaseNotes.releaseDate))
                          .limit(limit)
                          .offset(offset);


    // Convert Date objects to ISO strings and assert repository type
    return notes.map(note => ({
      ...note,
      repository: note.repository as 'pluggedin-app' | 'pluggedin-mcp',
      releaseDate: note.releaseDate.toISOString(),
      content: note.content as ReleaseNoteContentDb,
      createdAt: note.createdAt.toISOString(),
      updatedAt: note.updatedAt.toISOString(),
    }));
  } catch (error) {
    console.error('Error fetching release notes:', error);
    throw error;
  }
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
        } else {
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
