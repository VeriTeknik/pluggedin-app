import { NextResponse } from 'next/server';
import { analytics } from '@/lib/analytics/analytics-service';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '10');
    
    // Check if analytics is enabled
    const analyticsEnabled = process.env.ANALYTICS_ENABLED === 'true';
    
    if (analyticsEnabled) {
      // Try to fetch trending servers from analytics service
      const trending = await analytics.getTrendingServers(limit);
      
      // The analytics API returns { servers: [...] } with each server having:
      // server_id, server_name, description, trending_score, install_growth, usage_growth, recent_installs
      const trendingData = trending && (trending as any).servers ? (trending as any).servers : trending;
      const trendingArray = Array.isArray(trendingData) ? trendingData : [];
      
      // Transform the data to match the expected format
      const servers = trendingArray.map((server: any, index: number) => {
        // Extract readable name from qualified name (e.g., "io.github.user/server-name" -> "Server Name")
        const nameParts = (server.server_name || server.serverId || '').split('/');
        const rawName = nameParts[nameParts.length - 1] || server.server_name || `Server ${index + 1}`;
        const displayName = rawName
          .replace(/-/g, ' ')
          .replace(/_/g, ' ')
          .split(' ')
          .map((word: string) => word.charAt(0).toUpperCase() + word.slice(1))
          .join(' ');
        
        return {
          id: server.server_id || server.serverId,
          name: displayName,
          description: server.description || 'Trending MCP server',
          score: server.trending_score || server.score || 0,
          installations: server.recent_installs || server.installations || 0,
          views: server.views || 0, // Not provided by current API
          rank: index + 1,
          change: server.install_growth || 0, // Use install_growth as rank change indicator
        };
      });
      
      return NextResponse.json({ data: servers });
    }
    
    // Use mock data if analytics is disabled
    throw new Error('Analytics disabled, using mock data');
  } catch (error) {
    console.error('[Analytics Trending API] Error:', error);
    
    // Return mock trending servers
    const mockServers = [
      {
        id: 'mcp-youtube-seo',
        name: 'YouTube SEO Assistant',
        description: 'AI-powered YouTube video optimization and analytics',
        score: 98,
        installations: 3421,
        views: 12543,
        rank: 1,
        change: 0,
      },
      {
        id: 'sqlite-explorer',
        name: 'SQLite Explorer', 
        description: 'Interactive SQLite database management and query tool',
        score: 95,
        installations: 2856,
        views: 9823,
        rank: 2,
        change: 2,
      },
      {
        id: 'filesystem',
        name: 'FileSystem Manager',
        description: 'Advanced filesystem operations with MCP',
        score: 92,
        installations: 2234,
        views: 8765,
        rank: 3,
        change: -1,
      },
      {
        id: 'slack-integration',
        name: 'Slack Integration',
        description: 'Connect and manage Slack workspaces through MCP',
        score: 89,
        installations: 1987,
        views: 7234,
        rank: 4,
        change: 1,
      },
      {
        id: 'git-tools',
        name: 'Git Tools',
        description: 'Enhanced Git operations and repository management',
        score: 87,
        installations: 1654,
        views: 6543,
        rank: 5,
        change: -2,
      },
    ].slice(0, limit);
    
    return NextResponse.json({ data: mockServers });
  }
}