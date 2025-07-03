'use client';

import { motion } from 'framer-motion';
import { LucideIcon } from 'lucide-react';

import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface MetricsCardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  trend?: {
    value: number;
    isPositive: boolean;
  };
  color?: 'blue' | 'green' | 'purple' | 'orange';
  loading?: boolean;
}

const colorClasses = {
  blue: 'bg-blue-50 text-blue-600 dark:bg-blue-950 dark:text-blue-400',
  green: 'bg-green-50 text-green-600 dark:bg-green-950 dark:text-green-400',
  purple: 'bg-purple-50 text-purple-600 dark:bg-purple-950 dark:text-purple-400',
  orange: 'bg-orange-50 text-orange-600 dark:bg-orange-950 dark:text-orange-400',
};

export function MetricsCard({
  title,
  value,
  icon: Icon,
  trend,
  color = 'blue',
  loading = false,
}: MetricsCardProps) {
  return (
    <Card className="relative overflow-hidden">
      <CardContent className="p-6">
        <div className="flex items-center justify-between space-x-4">
          <div className="flex-1 space-y-2">
            <p className="text-sm font-medium text-muted-foreground">
              {title}
            </p>
            <div className="flex items-baseline space-x-2">
              {loading ? (
                <div className="h-8 w-24 animate-pulse rounded bg-muted" />
              ) : (
                <motion.p
                  className="text-2xl font-bold"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3 }}
                >
                  {value}
                </motion.p>
              )}
              {trend && !loading && (
                <motion.span
                  className={cn(
                    'text-xs font-medium',
                    trend.isPositive ? 'text-green-600' : 'text-red-600'
                  )}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.3, delay: 0.1 }}
                >
                  {trend.isPositive ? '+' : ''}{trend.value}%
                </motion.span>
              )}
            </div>
          </div>
          <div
            className={cn(
              'rounded-full p-3',
              colorClasses[color]
            )}
          >
            <Icon className="h-5 w-5" />
          </div>
        </div>
      </CardContent>
      
      {/* Animated background gradient */}
      <motion.div
        className="absolute inset-0 opacity-5"
        style={{
          background: `radial-gradient(circle at var(--x) var(--y), ${
            color === 'blue' ? '#3b82f6' :
            color === 'green' ? '#10b981' :
            color === 'purple' ? '#8b5cf6' :
            '#f97316'
          } 0%, transparent 50%)`,
        }}
        animate={{
          '--x': ['0%', '100%', '0%'],
          '--y': ['0%', '100%', '0%'],
        }}
        transition={{
          duration: 10,
          repeat: Infinity,
          ease: 'linear',
        }}
      />
    </Card>
  );
}