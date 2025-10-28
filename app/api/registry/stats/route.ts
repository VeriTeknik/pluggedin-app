import { NextRequest, NextResponse } from 'next/server';
import { PluggedinRegistryVPClient } from '@/lib/registry/pluggedin-registry-vp-client';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const serverId = searchParams.get('serverId');

    if (!serverId) {
      return NextResponse.json(
        { success: false, error: 'Server ID is required' },
        { status: 400 }
      );
    }

    const client = new PluggedinRegistryVPClient();
    const stats = await client.getServerStats(serverId);

    return NextResponse.json({
      success: true,
      stats
    });
  } catch (error) {
    console.error('Failed to fetch stats:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch stats',
        stats: {
          rating: 0,
          rating_count: 0,
          install_count: 0
        }
      },
      { status: 500 }
    );
  }
}