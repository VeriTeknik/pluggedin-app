import { NextRequest, NextResponse } from 'next/server';

// Cache stars for 5 minutes to reduce API calls
const cache = new Map<string, { stars: number; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export async function GET(request: NextRequest) {
  const repo = request.nextUrl.searchParams.get('repo');

  // Validate repo format
  const repoPattern = /^[a-zA-Z0-9][a-zA-Z0-9\-_]{0,99}\/[a-zA-Z0-9][a-zA-Z0-9\-_]{0,99}$/;
  if (!repo || !repoPattern.test(repo)) {
    return NextResponse.json({ error: 'Invalid repository format' }, { status: 400 });
  }

  // Check cache
  const cached = cache.get(repo);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return NextResponse.json({ stars: cached.stars });
  }

  try {
    const headers: HeadersInit = {
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'pluggedin-app',
    };

    // Use GITHUB_TOKEN if available
    const token = process.env.GITHUB_TOKEN || process.env.GITHUB_PAT;
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(`https://api.github.com/repos/${repo}`, { headers });

    if (!response.ok) {
      console.error(`GitHub API error for ${repo}: ${response.status}`);
      return NextResponse.json({ error: 'GitHub API error' }, { status: response.status });
    }

    const data = await response.json();
    const stars = data.stargazers_count;

    if (typeof stars === 'number') {
      // Update cache
      cache.set(repo, { stars, timestamp: Date.now() });
      return NextResponse.json({ stars });
    }

    return NextResponse.json({ error: 'Invalid response from GitHub' }, { status: 500 });
  } catch (error) {
    console.error(`Error fetching GitHub stars for ${repo}:`, error);
    return NextResponse.json({ error: 'Failed to fetch stars' }, { status: 500 });
  }
}
