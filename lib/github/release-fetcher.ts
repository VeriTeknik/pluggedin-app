import { Octokit } from '@octokit/rest'; // Using REST for simplicity first, can switch to GraphQL later if needed

import { ReleaseChange,ReleaseNote } from '@/types/release'; // Import our types

const GITHUB_PAT = process.env.GITHUB_PAT;

if (!GITHUB_PAT) {
  console.warn('GITHUB_PAT environment variable not set. GitHub API calls will be limited or fail.');
}

const octokit = new Octokit({ auth: GITHUB_PAT });

const REPO_OWNER = 'VeriTeknik'; // Assuming owner is constant for now

/**
 * Fetches release information for a specific repository.
 * @param repoName - The name of the repository ('pluggedin-app' or 'pluggedin-mcp').
 * @param page - The page number for pagination.
 * @param perPage - The number of results per page.
 * @returns A promise that resolves to an array of release data.
 */
export async function fetchReleases(repoName: 'pluggedin-app' | 'pluggedin-mcp', page = 1, perPage = 10): Promise<any[]> { // Return type needs refinement
  try {
    const response = await octokit.repos.listReleases({
      owner: REPO_OWNER,
      repo: repoName,
      page,
      per_page: perPage,
    });
    // TODO: Map response.data to our ReleaseNote structure
    // This will involve fetching commits between releases if needed
    console.log(`Fetched ${response.data.length} releases for ${repoName}`);
    return response.data; // Return raw data for now
  } catch (error) {
    console.error(`Error fetching releases for ${repoName}:`, error);
    throw new Error(`Failed to fetch releases for ${repoName}`);
  }
}

/**
 * Fetches commits between two tags or SHAs for a repository.
 * @param repoName - The name of the repository.
 * @param base - The base tag/SHA (older).
 * @param head - The head tag/SHA (newer).
 * @returns A promise that resolves to an array of commit data.
 */
export async function fetchCommitsBetween(repoName: 'pluggedin-app' | 'pluggedin-mcp', base: string, head: string): Promise<any[]> {
  try {
    const response = await octokit.repos.compareCommits({
      owner: REPO_OWNER,
      repo: repoName,
      base,
      head,
    });
    // TODO: Process response.data.commits
    console.log(`Fetched ${response.data.commits.length} commits between ${base} and ${head} for ${repoName}`);
    return response.data.commits; // Return raw commit data for now
  } catch (error) {
    console.error(`Error fetching commits between ${base} and ${head} for ${repoName}:`, error);
    throw new Error(`Failed to fetch commits for ${repoName}`);
  }
}

/**
 * Parses commit messages to categorize changes.
 * Placeholder function - needs implementation based on commit message conventions.
 * @param commits - An array of commit objects from the GitHub API.
 * @returns An object containing categorized ReleaseChange arrays.
 */
export function categorizeCommits(commits: any[]): ReleaseNote['content'] {
  const content: ReleaseNote['content'] = {
    features: [],
    bugFixes: [],
    performanceImprovements: [],
    breakingChanges: [],
    otherChanges: [],
  };

  // Example categorization logic (needs refinement based on actual commit message format)
  commits.forEach(commit => {
    const message = commit.commit.message.toLowerCase();
    const change: ReleaseChange = {
      type: 'Other', // Default type
      message: commit.commit.message.split('\n')[0], // Use first line as message
      commitUrl: commit.html_url,
      contributors: [commit.author?.login || 'Unknown'],
    };

    if (message.startsWith('feat') || message.includes('feature:')) {
      change.type = 'Feature';
      content.features?.push(change);
    } else if (message.startsWith('fix') || message.includes('bugfix:') || message.includes('bug fix:')) {
      change.type = 'Bug Fix';
      content.bugFixes?.push(change);
    } else if (message.startsWith('perf') || message.includes('performance:')) {
      change.type = 'Performance Improvement';
      content.performanceImprovements?.push(change);
    } else if (message.includes('breaking change')) {
      change.type = 'Breaking Change';
      content.breakingChanges?.push(change);
    } else {
      content.otherChanges?.push(change);
    }
  });

  // Remove empty arrays
  Object.keys(content).forEach(key => {
    if (content[key as keyof typeof content]?.length === 0) {
      delete content[key as keyof typeof content];
    }
  });


  return content;
}

/**
 * Fetches and processes release notes for a repository, including commit categorization.
 * This function orchestrates fetching releases and commits.
 * @param repoName - The name of the repository.
 * @returns A promise that resolves to an array of structured ReleaseNote objects.
 */
export async function getProcessedReleaseNotes(repoName: 'pluggedin-app' | 'pluggedin-mcp'): Promise<ReleaseNote[]> {
  const releases = await fetchReleases(repoName, 1, 100); // Fetch more releases initially
  const processedNotes: ReleaseNote[] = [];

  // Sort releases by date descending (newest first)
  releases.sort((a, b) => new Date(b.published_at || b.created_at).getTime() - new Date(a.published_at || a.created_at).getTime());

  for (let i = 0; i < releases.length; i++) {
    const currentRelease = releases[i];
    // Determine the base tag/SHA for comparison (previous release tag or initial commit)
    const baseTag = i + 1 < releases.length ? releases[i + 1].tag_name : null; // Or find the repo's initial commit SHA if needed

    let commits: any[] = [];
    if (baseTag) {
      try {
        commits = await fetchCommitsBetween(repoName, baseTag, currentRelease.tag_name);
      } catch (compareError) {
         console.warn(`Could not compare commits between ${baseTag} and ${currentRelease.tag_name} for ${repoName}. Release notes might be incomplete. Error: ${compareError}`);
         // Fallback: Maybe fetch commits since the last release date? More complex.
      }
    } else {
       // Handle the very first release (compare from the beginning of the repo if possible, or just use release body)
       console.warn(`No previous release tag found to compare for ${currentRelease.tag_name} in ${repoName}. Commit categorization might be based only on release body.`);
       // Potentially fetch commits up to this release date/tag if needed
    }


    const categorizedContent = categorizeCommits(commits);

    // TODO: Enhance content by parsing the release body (currentRelease.body) if commit categorization is insufficient.
    // Markdown parsing might be needed here.

    const note: ReleaseNote = {
      repository: repoName,
      version: currentRelease.tag_name,
      releaseDate: currentRelease.published_at || currentRelease.created_at,
      commitSha: currentRelease.target_commitish, // Usually the SHA the tag points to
      content: categorizedContent, // Use categorized commits
      // Add parsed body content here if needed
    };
    processedNotes.push(note);
  }

  return processedNotes;
}

/**
 * Generates historical release notes by analyzing commit history.
 * Placeholder function - requires significant implementation.
 * @param repoName - The name of the repository.
 * @returns A promise that resolves to an array of historical ReleaseNote objects.
 */
export async function generateHistoricalReleaseNotes(repoName: 'pluggedin-app' | 'pluggedin-mcp'): Promise<ReleaseNote[]> {
  console.warn(`generateHistoricalReleaseNotes for ${repoName} is not fully implemented.`);
  // 1. Fetch all tags (octokit.git.listMatchingRefs or octokit.repos.listTags)
  // 2. Fetch all commits (potentially paginated octokit.repos.listCommits)
  // 3. Implement logic to group commits between tags based on dates/messages.
  // 4. Categorize commits for each "historical release".
  // 5. Return structured ReleaseNote array.
  return []; // Return empty array for now
}
