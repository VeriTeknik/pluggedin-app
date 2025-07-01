/**
 * Utility functions for registry operations
 * These are pure functions that don't require server-side execution
 */

/**
 * Parse GitHub URL and extract owner/repo
 */
export function parseGitHubUrl(url: string): { owner: string; repo: string } | null {
  const patterns = [
    /^https?:\/\/github\.com\/([^\/]+)\/([^\/\?]+)(\.git)?$/,
    /^git@github\.com:([^\/]+)\/([^\/\?]+)(\.git)?$/,
    /^([^\/]+)\/([^\/]+)$/  // Simple owner/repo format
  ];

  for (const pattern of patterns) {
    const match = url.trim().match(pattern);
    if (match) {
      return {
        owner: match[1],
        repo: match[2].replace(/\.git$/, '')
      };
    }
  }

  return null;
}

/**
 * Suggest next version based on current version
 */
export function suggestNextVersion(currentVersion: string, type: 'patch' | 'minor' | 'major' = 'patch'): string {
  const versionParts = currentVersion.split('.');
  if (versionParts.length !== 3) {
    return '0.1.0';
  }

  let [major, minor, patch] = versionParts.map(v => parseInt(v) || 0);

  switch (type) {
    case 'major':
      major++;
      minor = 0;
      patch = 0;
      break;
    case 'minor':
      minor++;
      patch = 0;
      break;
    case 'patch':
    default:
      patch++;
      break;
  }

  return `${major}.${minor}.${patch}`;
}