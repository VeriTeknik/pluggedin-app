import { Octokit } from '@octokit/rest'; // Using REST for simplicity first, can switch to GraphQL later if needed

import { ReleaseChange,ReleaseNote } from '@/types/release'; // Import our types

// Supported repository names
export type RepositoryName =
  | 'pluggedin-app'
  | 'pluggedin-mcp'
  | 'registry-proxy'
  | 'pluggedinkit-python'
  | 'pluggedinkit-go'
  | 'pluggedinkit-js'
  | 'pluggedin-docs';

const GITHUB_PAT = process.env.GITHUB_PAT || process.env.GITHUB_TOKEN;

if (!GITHUB_PAT) {
  console.warn('Neither GITHUB_PAT nor GITHUB_TOKEN environment variable is set. GitHub API calls will be limited or fail.');
}

const octokit = new Octokit({ 
  auth: GITHUB_PAT,
  timeZone: 'UTC',
});

const REPO_OWNER = 'VeriTeknik'; // Assuming owner is constant for now

// Map logical repository names to actual GitHub repository names
const REPO_NAME_MAP: Record<RepositoryName, string> = {
  'pluggedin-app': 'pluggedin-app',
  'pluggedin-mcp': 'pluggedin-mcp',
  'registry-proxy': 'registry-proxy',
  'pluggedinkit-python': 'pluggedinkit-python',
  'pluggedinkit-go': 'pluggedinkit-go',
  'pluggedinkit-js': 'pluggedinkit-js',
  'pluggedin-docs': 'pluggedin-docs',
};

/**
 * Gets the actual GitHub repository name from the logical name
 */
function getGitHubRepoName(repoName: RepositoryName): string {
  return REPO_NAME_MAP[repoName];
}

/**
 * Fetches tags and creates release notes from them if no releases exist
 */
async function fetchTagsAsReleases(repoName: RepositoryName): Promise<any[]> {
  const githubRepoName = getGitHubRepoName(repoName);
  try {
    const { data: tags } = await octokit.repos.listTags({
      owner: REPO_OWNER,
      repo: githubRepoName,
      per_page: 100,
    });

    // Convert tags to release-like objects
    const releases = await Promise.all(tags.map(async (tag) => {
      try {
        // Get the commit details for each tag
        const { data: commit } = await octokit.repos.getCommit({
          owner: REPO_OWNER,
          repo: githubRepoName,
          ref: tag.commit.sha,
        });

        return {
          tag_name: tag.name,
          target_commitish: tag.commit.sha,
          created_at: commit.commit.author?.date || commit.commit.committer?.date,
          published_at: commit.commit.author?.date || commit.commit.committer?.date,
          body: commit.commit.message,
        };
      } catch (error) {
        console.error('Error fetching commit details for tag %s:', tag.name, error);
        return null;
      }
    }));

    return releases.filter(Boolean);
  } catch (error) {
    console.error('Error fetching tags for %s:', repoName, error);
    throw new Error(`Failed to fetch tags for ${repoName}`);
  }
}

/**
 * Fetches release information for a specific repository.
 * @param repoName - The name of the repository.
 * @param page - The page number for pagination.
 * @param perPage - The number of results per page.
 * @returns A promise that resolves to an array of release data.
 */
export async function fetchReleases(repoName: RepositoryName, page = 1, perPage = 100): Promise<any[]> {
  const githubRepoName = getGitHubRepoName(repoName);
  try {
    // First try to get releases
    const { data: releases } = await octokit.repos.listReleases({
      owner: REPO_OWNER,
      repo: githubRepoName,
      page,
      per_page: perPage,
    });

    // If no releases found, fall back to tags
    if (releases.length === 0) {
      return await fetchTagsAsReleases(repoName);
    }

    return releases;
  } catch (error) {
    console.error('Error fetching releases for %s:', repoName, error);
    return await fetchTagsAsReleases(repoName);
  }
}

/**
 * Fetches commits between two tags or SHAs for a repository.
 * @param repoName - The name of the repository.
 * @param base - The base tag/SHA (older).
 * @param head - The head tag/SHA (newer).
 * @returns A promise that resolves to an array of commit data.
 */
export async function fetchCommitsBetween(repoName: RepositoryName, base: string, head: string): Promise<any[]> {
  const githubRepoName = getGitHubRepoName(repoName);
  try {
    const { data } = await octokit.repos.compareCommits({
      owner: REPO_OWNER,
      repo: githubRepoName,
      base,
      head,
    });
    return data.commits;
  } catch (error) {
    console.error('Error fetching commits between %s and %s for %s:', base, head, repoName, error);
    // If comparison fails, try to get commits directly
    try {
      const { data: commits } = await octokit.repos.listCommits({
        owner: REPO_OWNER,
        repo: githubRepoName,
        sha: head,
        per_page: 100,
      });
      return commits;
    } catch (fallbackError) {
      console.error('Fallback commit fetch also failed:', fallbackError);
      return [];
    }
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

  commits.forEach(commit => {
    const fullMessage = commit.commit.message;
    const firstLine = fullMessage.split('\n')[0].trim();
    const lowerMessage = firstLine.toLowerCase();

    const change: ReleaseChange = {
      type: 'Other',
      message: firstLine,
      commitUrl: commit.html_url,
      contributors: [commit.author?.login || commit.commit.author?.name || 'Unknown'],
    };

    // Enhanced categorization logic
    if (lowerMessage.match(/^feat(\([^)]+\))?:|^feature:|^add:/i) || lowerMessage.includes('new')) {
      change.type = 'Feature';
      content.features?.push(change);
    } else if (lowerMessage.match(/^fix(\([^)]+\))?:|^bugfix:|^bug:/i)) {
      change.type = 'Bug Fix';
      content.bugFixes?.push(change);
    } else if (lowerMessage.match(/^perf(\([^)]+\))?:|^performance:|^optimize:/i)) {
      change.type = 'Performance Improvement';
      content.performanceImprovements?.push(change);
    } else if (lowerMessage.includes('breaking change') || lowerMessage.includes('breaking:') || lowerMessage.match(/^break(\([^)]+\))?:/i)) {
      change.type = 'Breaking Change';
      content.breakingChanges?.push(change);
    } else {
      content.otherChanges?.push(change);
    }
  });

  // Remove empty categories
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
export async function getProcessedReleaseNotes(repoName: RepositoryName): Promise<ReleaseNote[]> {
  const githubRepoName = getGitHubRepoName(repoName);
  const releases = await fetchReleases(repoName);
  const processedNotes: ReleaseNote[] = [];

  // Sort releases by date descending
  releases.sort((a, b) =>
    new Date(b.published_at || b.created_at).getTime() -
    new Date(a.published_at || a.created_at).getTime()
  );

  for (let i = 0; i < releases.length; i++) {
    const currentRelease = releases[i];
    const nextRelease = releases[i + 1];

    let commits: any[] = [];
    if (nextRelease) {
      commits = await fetchCommitsBetween(repoName, nextRelease.tag_name, currentRelease.tag_name);
    } else {
      // For the first release, try to get recent commits
      try {
        const { data: recentCommits } = await octokit.repos.listCommits({
          owner: REPO_OWNER,
          repo: githubRepoName,
          sha: currentRelease.tag_name,
          per_page: 50,
        });
        commits = recentCommits;
      } catch (error) {
        console.warn('Could not fetch commits for first release %s:', currentRelease.tag_name, error);
      }
    }

    const categorizedContent = categorizeCommits(commits);

    // Add the release body to the content if available
    if (currentRelease.body) {
      categorizedContent.body = currentRelease.body;
    }

    const note: ReleaseNote = {
      repository: repoName,
      version: currentRelease.tag_name,
      releaseDate: currentRelease.published_at || currentRelease.created_at,
      commitSha: currentRelease.target_commitish,
      content: categorizedContent,
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
export async function generateHistoricalReleaseNotes(repoName: RepositoryName): Promise<ReleaseNote[]> {
  console.warn('generateHistoricalReleaseNotes for %s is not fully implemented.', repoName);
  // 1. Fetch all tags (octokit.git.listMatchingRefs or octokit.repos.listTags)
  // 2. Fetch all commits (potentially paginated octokit.repos.listCommits)
  // 3. Implement logic to group commits between tags based on dates/messages.
  // 4. Categorize commits for each "historical release".
  // 5. Return structured ReleaseNote array.
  return []; // Return empty array for now
}
