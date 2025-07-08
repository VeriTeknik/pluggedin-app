import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({ 
    error: 'Analytics service has been deprecated. Please use the new analytics service when it becomes available.',
    totalInstalls: 0,
    totalViews: 0,
    activeUsers: 0,
    avgUsageTime: 0,
    trends: {
      installs: { value: 0, isPositive: true },
      views: { value: 0, isPositive: true },
      users: { value: 0, isPositive: true },
      usage: { value: 0, isPositive: true },
    }
  }, { status: 503 });
}