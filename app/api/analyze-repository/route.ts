import { NextRequest, NextResponse } from 'next/server';

interface EnvVariable {
  name: string;
  description?: string;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const repoUrl = searchParams.get('url');

    if (!repoUrl) {
      return NextResponse.json(
        { error: 'Repository URL is required' },
        { status: 400 }
      );
    }

    // Extract owner and repo from URL
    const match = repoUrl.match(/github\.com\/([^\/]+)\/([^\/\?]+)/);
    if (!match) {
      return NextResponse.json(
        { error: 'Invalid GitHub URL' },
        { status: 400 }
      );
    }

    const [, owner, repo] = match;
    
    // Use GitHub PAT for better rate limits
    const headers: Record<string, string> = {
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'Pluggedin-Registry',
    };
    
    if (process.env.GITHUB_PAT) {
      headers['Authorization'] = `token ${process.env.GITHUB_PAT}`;
    }

    // Check if repository exists
    const repoApiUrl = `https://api.github.com/repos/${owner}/${repo}`;
    const repoCheck = await fetch(repoApiUrl, { headers });
    
    if (!repoCheck.ok) {
      const errorText = await repoCheck.text();
      return NextResponse.json(
        { error: `GitHub API error: ${repoCheck.status} - ${errorText}` },
        { status: repoCheck.status }
      );
    }

    const envVariables: EnvVariable[] = [];
    
    // Try to fetch MCP configuration files
    const configFiles = [
      { path: 'claude_desktop_config.json', branch: 'main' },
      { path: 'claude_desktop_config.json', branch: 'master' },
      { path: 'mcp.json', branch: 'main' },
      { path: 'mcp.json', branch: 'master' },
    ];

    let mcpConfig = null;
    for (const config of configFiles) {
      try {
        // Use GitHub API to get file contents (avoids CORS issues)
        const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${config.path}?ref=${config.branch}`;
        const response = await fetch(apiUrl, { headers });
        
        if (response.ok) {
          const data = await response.json();
          // GitHub API returns base64 encoded content
          const content = Buffer.from(data.content, 'base64').toString('utf-8');
          mcpConfig = JSON.parse(content);
          break;
        }
      } catch (e) {
        // Continue to next file
      }
    }

    if (mcpConfig?.mcpServers) {
      // Extract environment variables from the first server
      const firstServer = Object.values(mcpConfig.mcpServers)[0] as any;
      if (firstServer?.env) {
        for (const [name] of Object.entries(firstServer.env)) {
          envVariables.push({
            name,
            description: `Environment variable for ${name}`
          });
        }
      }
    }

    // If no config found, try to detect from README
    if (envVariables.length === 0) {
      try {
        const readmeUrl = `https://api.github.com/repos/${owner}/${repo}/readme`;
        const readmeResponse = await fetch(readmeUrl, { headers });
        
        if (readmeResponse.ok) {
          const readmeData = await readmeResponse.json();
          const readmeText = Buffer.from(readmeData.content, 'base64').toString('utf-8');
          
          // Look for environment variable patterns
          const envPatterns = [
            /`([A-Z][A-Z0-9_]+)`/g,  // Backtick wrapped
            /\$\{?([A-Z][A-Z0-9_]+)\}?/g,  // Shell variable syntax
            /process\.env\.([A-Z][A-Z0-9_]+)/g,  // Node.js syntax
          ];

          const foundVars = new Set<string>();
          for (const pattern of envPatterns) {
            let match;
            while ((match = pattern.exec(readmeText)) !== null) {
              const varName = match[1];
              if (varName.length > 2 && 
                  varName !== 'NODE' && 
                  varName !== 'PATH' &&
                  varName !== 'HOME' &&
                  varName !== 'USER') {
                foundVars.add(varName);
              }
            }
          }

          Array.from(foundVars).forEach(name => {
            envVariables.push({
              name,
              description: `Environment variable detected from README`
            });
          });
        }
      } catch (e) {
        console.error('Error fetching README:', e);
      }
    }

    return NextResponse.json({
      success: true,
      envVariables,
      repository: {
        owner,
        name: repo
      }
    });

  } catch (error) {
    console.error('Repository analysis error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to analyze repository' },
      { status: 500 }
    );
  }
}