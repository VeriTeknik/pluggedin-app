'use client';

import { motion } from 'framer-motion';
import { Crown, Flame, Sparkles, TrendingUp } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

interface TrendingServer {
  id: string;
  name: string;
  description: string;
  score: number;
  installations: number;
  views: number;
  rank: number;
  change: number; // Rank change from previous period
}

const getRankIcon = (rank: number) => {
  switch (rank) {
    case 1:
      return <Crown className="h-4 w-4 text-yellow-500" />;
    case 2:
      return <Sparkles className="h-4 w-4 text-gray-400" />;
    case 3:
      return <Flame className="h-4 w-4 text-orange-500" />;
    default:
      return null;
  }
};

export function TrendingServers({ limit = 10 }: { limit?: number }) {
  const [servers, setServers] = useState<TrendingServer[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchTrending = async () => {
      try {
        const response = await fetch(`/api/analytics/trending?limit=${limit}`);
        if (response.ok) {
          const data = await response.json();
          setServers(data.data || []);
        }
      } catch (error) {
        console.error('Failed to fetch trending servers:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchTrending();
    // Refresh every minute
    const interval = setInterval(fetchTrending, 60000);
    return () => clearInterval(interval);
  }, [limit]);

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Trending Servers
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TrendingUp className="h-5 w-5" />
          Trending Servers
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {servers.map((server, index) => (
            <motion.div
              key={server.id}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.3, delay: index * 0.05 }}
            >
              <Link
                href={`/search?server=${server.id}`}
                className="block rounded-lg border p-3 transition-colors hover:bg-accent"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted font-bold">
                      {getRankIcon(server.rank) || server.rank}
                    </div>
                    <div className="flex-1">
                      <h4 className="font-medium">{server.name}</h4>
                      <p className="text-sm text-muted-foreground line-clamp-1">
                        {server.description}
                      </p>
                      <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
                        <span>{server.installations} installs</span>
                        <span>{server.views} views</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <Badge variant="secondary" className="text-xs">
                      Score: {server.score}
                    </Badge>
                    {server.change !== 0 && (
                      <span
                        className={cn(
                          'text-xs font-medium',
                          server.change > 0 ? 'text-green-600' : 'text-red-600'
                        )}
                      >
                        {server.change > 0 ? '↑' : '↓'} {Math.abs(server.change)}
                      </span>
                    )}
                  </div>
                </div>
              </Link>
            </motion.div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}