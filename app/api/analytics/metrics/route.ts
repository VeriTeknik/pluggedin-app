import { NextResponse } from 'next/server';

import { analytics } from '@/lib/analytics/analytics-service';

export async function GET() {
  try {
    // Check if analytics is enabled
    const analyticsEnabled = process.env.ANALYTICS_ENABLED === 'true';
    
    if (analyticsEnabled) {
      // Try to fetch real metrics from analytics service
      const metrics = await analytics.getGlobalMetrics();
      
      // Transform the response to match frontend expectations
      // The analytics API returns: { total_installs, active_users, events_today, total_servers }
      const transformedMetrics = {
        totalInstalls: metrics.totalInstalls || metrics.total_installs || 0,
        totalViews: metrics.totalViews || metrics.events_today || 0, // Use events_today as a proxy for views
        activeUsers: metrics.activeUsers || metrics.active_users || 0,
        avgUsageTime: metrics.avgUsageTime || 0, // Not provided by analytics API yet
        trends: metrics.trends || {
          installs: {
            value: 0,
            isPositive: true,
          },
          views: {
            value: 0,
            isPositive: true,
          },
          users: {
            value: 0,
            isPositive: true,
          },
          usage: {
            value: 0,
            isPositive: true,
          },
        },
      };
      
      return NextResponse.json(transformedMetrics);
    }
    
    // Use mock data if analytics is disabled
    throw new Error('Analytics disabled, using mock data');
  } catch (error) {
    console.error('[Analytics Metrics API] Error:', error);
    
    // Fallback to mock data on error
    const mockMetrics = {
      totalInstalls: 15234 + Math.floor(Math.random() * 100),
      totalViews: 48921 + Math.floor(Math.random() * 500),
      activeUsers: 2156 + Math.floor(Math.random() * 50),
      avgUsageTime: 4523 + Math.floor(Math.random() * 200),
      trends: {
        installs: {
          value: parseFloat((Math.random() * 10 + 5).toFixed(1)),
          isPositive: true,
        },
        views: {
          value: parseFloat((Math.random() * 15 + 8).toFixed(1)),
          isPositive: true,
        },
        users: {
          value: parseFloat((Math.random() * 5 + 2).toFixed(1)),
          isPositive: Math.random() > 0.3,
        },
        usage: {
          value: parseFloat((Math.random() * 8 + 3).toFixed(1)),
          isPositive: true,
        },
      },
    };
    
    return NextResponse.json(mockMetrics);
  }
}