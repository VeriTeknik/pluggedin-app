import { NextRequest, NextResponse } from 'next/server';

import { PluggedinRegistryVPClient } from '@/lib/registry/pluggedin-registry-vp-client';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const serverId = searchParams.get('serverId');
    const limit = parseInt(searchParams.get('limit') || '20');
    const offset = parseInt(searchParams.get('offset') || '0');
    const sort = searchParams.get('sort') || 'newest';

    if (!serverId) {
      return NextResponse.json(
        { success: false, error: 'Server ID is required' },
        { status: 400 }
      );
    }

    const client = new PluggedinRegistryVPClient();
    const feedback = await client.getFeedback(
      serverId,
      limit,
      offset,
      sort as 'newest' | 'oldest' | 'rating_high' | 'rating_low'
    );

    return NextResponse.json({
      success: true,
      ...feedback
    });
  } catch (error) {
    console.error('Failed to fetch feedback:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch feedback',
        feedback: [],
        total_count: 0,
        has_more: false
      },
      { status: 500 }
    );
  }
}