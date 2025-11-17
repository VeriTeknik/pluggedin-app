import { NextResponse } from 'next/server';

import { getPlatformMetrics } from '@/app/actions/metrics';
import { FALLBACK_METRICS } from '@/lib/constants/metrics';

export const dynamic = 'force-dynamic';
export const revalidate = 900; // Cache for 15 minutes

export async function GET() {
  try {
    const metrics = await getPlatformMetrics();

    return NextResponse.json(metrics, {
      headers: {
        'Cache-Control': 'public, s-maxage=900, stale-while-revalidate=3600',
      },
    });
  } catch (error) {
    console.error('Error fetching platform metrics:', error);

    // Return fallback values from centralized constants
    return NextResponse.json({
      totalUsers: FALLBACK_METRICS.totalUsers,
      totalProjects: FALLBACK_METRICS.totalProjects,
      totalServers: FALLBACK_METRICS.totalServers,
      newProfiles30d: FALLBACK_METRICS.newProfiles30d,
      newUsers30d: FALLBACK_METRICS.newUsers30d,
    });
  }
}
