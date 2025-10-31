import { NextRequest, NextResponse } from 'next/server';

import { PluggedinRegistryVPClient } from '@/lib/registry/pluggedin-registry-vp-client';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const serverId = searchParams.get('serverId');
    const userId = searchParams.get('userId');

    if (!serverId || !userId) {
      return NextResponse.json(
        { success: false, error: 'Server ID and User ID are required' },
        { status: 400 }
      );
    }

    const client = new PluggedinRegistryVPClient();
    const userRating = await client.getUserRating(serverId, userId);

    return NextResponse.json({
      success: true,
      hasRated: !!userRating,
      rating: userRating
    });
  } catch (error) {
    console.error('Failed to check user rating:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to check rating',
        hasRated: false,
        rating: null
      },
      { status: 500 }
    );
  }
}