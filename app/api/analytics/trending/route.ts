import { NextResponse } from 'next/server';
import { analytics } from '@/lib/analytics/analytics-service';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '10');
    
    // Fetch trending servers from analytics service
    const trending = await analytics.getTrendingServers(limit);
    
    // Ensure trending is an array
    const trendingArray = Array.isArray(trending) ? trending : [];
    
    // Transform the data to match the expected format
    const servers = trendingArray.map((server, index) => ({
      id: server.serverId,
      name: `Server ${server.serverId}`, // This will be replaced with actual names
      description: 'Trending server', // This will be replaced with actual descriptions
      score: server.score,
      installations: server.installations,
      views: server.views,
      rank: index + 1,
      change: 0, // TODO: Calculate rank change from previous period
    }));
    
    return NextResponse.json({ data: servers });
  } catch (error) {
    console.error('[Analytics Trending API] Error:', error);
    
    // Return empty array on error
    return NextResponse.json({ data: [] });
  }
}