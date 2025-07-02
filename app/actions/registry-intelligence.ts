'use server';

import { parseGitHubUrl } from '@/lib/registry/registry-utils';

export interface GitHubRepoData {
  owner: string;
  name: string;
  fullName: string;
  description: string | null;
  stars: number;
  language: string | null;
  lastUpdate: string;
  topics: string[];
  homepage: string | null;
  license: string | null;
  defaultBranch: string;
  isPrivate: boolean;
}

export interface PackageInfo {
  type: 'npm' | 'docker' | 'pypi' | null;
  name: string | null;
  version: string | null;
  description: string | null;
  dependencies: Record<string, string>;
}

export interface EnvVariable {
  name: string;
  description: string;
  required: boolean;
  defaultValue?: string;
}

// GitHub API headers
const getGitHubHeaders = () => ({
  'Accept': 'application/vnd.github.v3+json',
  'User-Agent': 'Pluggedin-MCP-Registry',
  ...(process.env.GITHUB_TOKEN ? { 'Authorization': `token ${process.env.GITHUB_TOKEN}` } : {})
});


/**
 * Fetch repository data from GitHub API
 */
export async function fetchRepositoryData(repoUrl: string): Promise<{
  success: boolean;
  data?: GitHubRepoData;
  error?: string;
}> {
  try {
    const parsed = parseGitHubUrl(repoUrl);
    if (!parsed) {
      return { success: false, error: 'Invalid GitHub URL format' };
    }

    const { owner, repo } = parsed;
    const apiUrl = `https://api.github.com/repos/${owner}/${repo}`;
    
    const response = await fetch(apiUrl, {
      headers: getGitHubHeaders(),
      next: { revalidate: 300 } // Cache for 5 minutes
    });

    if (!response.ok) {
      if (response.status === 404) {
        return { success: false, error: 'Repository not found' };
      }
      return { success: false, error: `GitHub API error: ${response.status}` };
    }

    const data = await response.json();

    return {
      success: true,
      data: {
        owner: data.owner.login,
        name: data.name,
        fullName: data.full_name,
        description: data.description,
        stars: data.stargazers_count,
        language: data.language,
        lastUpdate: data.updated_at,
        topics: data.topics || [],
        homepage: data.homepage,
        license: data.license?.spdx_id || null,
        defaultBranch: data.default_branch,
        isPrivate: data.private
      }
    };
  } catch (error) {
    console.error('Error fetching repository data:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to fetch repository data' 
    };
  }
}

/**
 * Detect package information from repository
 */
export async function detectPackageInfo(repoUrl: string): Promise<{
  success: boolean;
  data?: PackageInfo;
  error?: string;
}> {
  try {
    const parsed = parseGitHubUrl(repoUrl);
    if (!parsed) {
      return { success: false, error: 'Invalid GitHub URL format' };
    }

    const { owner, repo } = parsed;
    
    // Try to fetch package.json first (NPM)
    const packageJsonUrl = `https://raw.githubusercontent.com/${owner}/${repo}/main/package.json`;
    const packageJsonResponse = await fetch(packageJsonUrl, {
      headers: getGitHubHeaders()
    });

    if (packageJsonResponse.ok) {
      const packageJson = await packageJsonResponse.json();
      return {
        success: true,
        data: {
          type: 'npm',
          name: packageJson.name || `@${owner}/${repo}`,
          version: packageJson.version || '0.1.0',
          description: packageJson.description || null,
          dependencies: {
            ...packageJson.dependencies,
            ...packageJson.devDependencies
          }
        }
      };
    }

    // Try pyproject.toml (Python/PyPI)
    const pyprojectUrl = `https://raw.githubusercontent.com/${owner}/${repo}/main/pyproject.toml`;
    const pyprojectResponse = await fetch(pyprojectUrl, {
      headers: getGitHubHeaders()
    });

    if (pyprojectResponse.ok) {
      const pyprojectText = await pyprojectResponse.text();
      // Basic TOML parsing for version
      const versionMatch = pyprojectText.match(/version\s*=\s*"([^"]+)"/);
      const nameMatch = pyprojectText.match(/name\s*=\s*"([^"]+)"/);
      
      return {
        success: true,
        data: {
          type: 'pypi',
          name: nameMatch?.[1] || repo,
          version: versionMatch?.[1] || '0.1.0',
          description: null,
          dependencies: {}
        }
      };
    }

    // Check for Dockerfile (Docker)
    const dockerfileUrl = `https://raw.githubusercontent.com/${owner}/${repo}/main/Dockerfile`;
    const dockerfileResponse = await fetch(dockerfileUrl, {
      headers: getGitHubHeaders()
    });

    if (dockerfileResponse.ok) {
      return {
        success: true,
        data: {
          type: 'docker',
          name: `${owner}/${repo}`.toLowerCase(),
          version: 'latest',
          description: null,
          dependencies: {}
        }
      };
    }

    // No package type detected
    return {
      success: true,
      data: {
        type: null,
        name: null,
        version: null,
        description: null,
        dependencies: {}
      }
    };
  } catch (error) {
    console.error('Error detecting package info:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to detect package information' 
    };
  }
}

/**
 * Detect environment variables from repository
 */
export async function detectEnvironmentVariables(repoUrl: string): Promise<{
  success: boolean;
  data?: EnvVariable[];
  error?: string;
}> {
  try {
    const parsed = parseGitHubUrl(repoUrl);
    if (!parsed) {
      return { success: false, error: 'Invalid GitHub URL format' };
    }

    const { owner, repo } = parsed;
    const envVars: EnvVariable[] = [];
    const foundVars = new Set<string>();

    // Check README.md for environment variables
    const readmeUrl = `https://raw.githubusercontent.com/${owner}/${repo}/main/README.md`;
    const readmeResponse = await fetch(readmeUrl, {
      headers: getGitHubHeaders()
    });

    if (readmeResponse.ok) {
      const readmeText = await readmeResponse.text();
      
      // Look for environment variable patterns
      const envPatterns = [
        /`([A-Z][A-Z0-9_]+)`/g,  // Backtick wrapped
        /\$\{?([A-Z][A-Z0-9_]+)\}?/g,  // Shell variable syntax
        /process\.env\.([A-Z][A-Z0-9_]+)/g,  // Node.js syntax
        /os\.environ\[["']([A-Z][A-Z0-9_]+)["']\]/g,  // Python syntax
      ];

      for (const pattern of envPatterns) {
        let match;
        while ((match = pattern.exec(readmeText)) !== null) {
          const varName = match[1];
          if (!foundVars.has(varName) && varName.length > 2) {
            foundVars.add(varName);
            
            // Try to extract description from surrounding text
            const startIndex = Math.max(0, match.index - 100);
            const endIndex = Math.min(readmeText.length, match.index + 100);
            const context = readmeText.substring(startIndex, endIndex);
            
            // Simple heuristic for required vars
            const isRequired = context.toLowerCase().includes('required') || 
                             context.toLowerCase().includes('must');
            
            envVars.push({
              name: varName,
              description: `Environment variable ${varName}`,
              required: isRequired
            });
          }
        }
      }
    }

    // Check .env.example
    const envExampleUrl = `https://raw.githubusercontent.com/${owner}/${repo}/main/.env.example`;
    const envExampleResponse = await fetch(envExampleUrl, {
      headers: getGitHubHeaders()
    });

    if (envExampleResponse.ok) {
      const envExampleText = await envExampleResponse.text();
      const lines = envExampleText.split('\n');
      
      for (const line of lines) {
        if (line.includes('=') && !line.startsWith('#')) {
          const [name, value] = line.split('=');
          const trimmedName = name.trim();
          
          if (!foundVars.has(trimmedName) && /^[A-Z][A-Z0-9_]+$/.test(trimmedName)) {
            foundVars.add(trimmedName);
            
            // Check if previous line is a comment
            const lineIndex = lines.indexOf(line);
            const prevLine = lineIndex > 0 ? lines[lineIndex - 1] : '';
            const description = prevLine.startsWith('#') 
              ? prevLine.substring(1).trim() 
              : `Environment variable ${trimmedName}`;
            
            envVars.push({
              name: trimmedName,
              description,
              required: !value.trim() || value.includes('required'),
              defaultValue: value.trim() || undefined
            });
          }
        }
      }
    }

    return {
      success: true,
      data: envVars
    };
  } catch (error) {
    console.error('Error detecting environment variables:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to detect environment variables' 
    };
  }
}

/**
 * Check if a package name is available on a registry
 */
export async function checkPackageAvailability(
  registry: 'npm' | 'docker' | 'pypi',
  packageName: string
): Promise<{
  available: boolean;
  currentVersion?: string;
  error?: string;
}> {
  try {
    switch (registry) {
      case 'npm': {
        const response = await fetch(`https://registry.npmjs.org/${packageName}`, {
          method: 'HEAD'
        });
        
        if (response.status === 404) {
          return { available: true };
        } else if (response.ok) {
          // Fetch full data to get version
          const dataResponse = await fetch(`https://registry.npmjs.org/${packageName}/latest`);
          const data = await dataResponse.json();
          return { 
            available: false, 
            currentVersion: data.version 
          };
        }
        break;
      }
      
      case 'pypi': {
        const response = await fetch(`https://pypi.org/pypi/${packageName}/json`, {
          method: 'HEAD'
        });
        
        if (response.status === 404) {
          return { available: true };
        } else if (response.ok) {
          // Fetch full data to get version
          const dataResponse = await fetch(`https://pypi.org/pypi/${packageName}/json`);
          const data = await dataResponse.json();
          return { 
            available: false, 
            currentVersion: data.info.version 
          };
        }
        break;
      }
      
      case 'docker': {
        // Docker Hub API is more complex, simplified check
        const [namespace, image] = packageName.split('/');
        const response = await fetch(
          `https://hub.docker.com/v2/repositories/${namespace}/${image}/`,
          { method: 'HEAD' }
        );
        
        return { available: response.status === 404 };
      }
    }

    return { available: true };
  } catch (error) {
    console.error('Error checking package availability:', error);
    return { 
      available: true, 
      error: 'Could not verify package availability' 
    };
  }
}

