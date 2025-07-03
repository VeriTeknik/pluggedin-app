'use client';

import { Activity, Eye, TrendingUp, Users } from 'lucide-react';
import { useEffect, useState } from 'react';

import { MetricsCard } from './metrics-card';

interface LiveMetricsData {
  totalInstalls: number;
  totalViews: number;
  activeUsers: number;
  avgUsageTime: number;
  trends: {
    installs: { value: number; isPositive: boolean };
    views: { value: number; isPositive: boolean };
    users: { value: number; isPositive: boolean };
    usage: { value: number; isPositive: boolean };
  };
}

export function LiveMetrics() {
  const [metrics, setMetrics] = useState<LiveMetricsData>({
    totalInstalls: 0,
    totalViews: 0,
    activeUsers: 0,
    avgUsageTime: 0,
    trends: {
      installs: { value: 0, isPositive: true },
      views: { value: 0, isPositive: true },
      users: { value: 0, isPositive: true },
      usage: { value: 0, isPositive: true },
    },
  });
  const [loading, setLoading] = useState(true);

  // Fetch metrics data
  const fetchMetrics = async () => {
    try {
      const response = await fetch('/api/analytics/metrics');
      if (response.ok) {
        const data = await response.json();
        setMetrics(data);
      }
    } catch (error) {
      console.error('Failed to fetch metrics:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Initial fetch
    fetchMetrics();

    // Refresh every 30 seconds
    const interval = setInterval(fetchMetrics, 30000);
    return () => clearInterval(interval);
  }, []);

  // Format usage time
  const formatUsageTime = (ms: number) => {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${(ms / 60000).toFixed(1)}m`;
  };

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <MetricsCard
        title="Total Installations"
        value={metrics.totalInstalls.toLocaleString()}
        icon={TrendingUp}
        trend={metrics.trends.installs}
        color="blue"
        loading={loading}
      />
      <MetricsCard
        title="Total Views"
        value={metrics.totalViews.toLocaleString()}
        icon={Eye}
        trend={metrics.trends.views}
        color="green"
        loading={loading}
      />
      <MetricsCard
        title="Active Users"
        value={metrics.activeUsers.toLocaleString()}
        icon={Users}
        trend={metrics.trends.users}
        color="purple"
        loading={loading}
      />
      <MetricsCard
        title="Avg Usage Time"
        value={formatUsageTime(metrics.avgUsageTime)}
        icon={Activity}
        trend={metrics.trends.usage}
        color="orange"
        loading={loading}
      />
    </div>
  );
}