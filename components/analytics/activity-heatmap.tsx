'use client';

import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

interface HeatmapData {
  date: string;
  count: number;
}

interface ActivityHeatmapProps {
  title: string;
  description?: string;
  data: HeatmapData[];
  days?: number; // Number of days to show (default: 30)
}

export function ActivityHeatmap({
  title,
  description,
  data,
  days = 90,
}: ActivityHeatmapProps) {
  const { t } = useTranslation('analytics');

  // Generate last N days
  const dateRange = useMemo(() => {
    const dates: string[] = [];
    for (let i = days - 1; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      dates.push(date.toISOString().split('T')[0]);
    }
    return dates;
  }, [days]);

  // Create a map of dates to counts
  const countMap = useMemo(() => {
    const map = new Map<string, number>();
    data.forEach((d) => map.set(d.date, d.count));
    return map;
  }, [data]);

  // Calculate max count for color scaling
  const maxCount = useMemo(() => {
    return Math.max(...data.map((d) => d.count), 1);
  }, [data]);

  // Get color intensity based on count
  const getColorIntensity = (count: number) => {
    if (count === 0) return 'bg-muted';
    const intensity = Math.ceil((count / maxCount) * 4);
    return [
      'bg-green-200 dark:bg-green-900',
      'bg-green-400 dark:bg-green-700',
      'bg-green-600 dark:bg-green-500',
      'bg-green-800 dark:bg-green-300',
    ][intensity - 1] || 'bg-green-200 dark:bg-green-900';
  };

  // Transpose dates into rows by day of week (for horizontal display)
  const dayRows = useMemo(() => {
    const firstDate = new Date(dateRange[0]);
    const dayOfWeek = firstDate.getDay(); // 0 = Sunday, 1 = Monday, etc.

    // Adjust to start from Monday (0 = Monday, 6 = Sunday)
    const startOffset = dayOfWeek === 0 ? 6 : dayOfWeek - 1;

    // Fill in empty days at the beginning
    const paddedDates = Array(startOffset).fill(null).concat(dateRange);

    // Group into weeks
    const weeks: (string | null)[][] = [];
    for (let i = 0; i < paddedDates.length; i += 7) {
      weeks.push(paddedDates.slice(i, i + 7));
    }

    // Transpose: convert from weeks[week][day] to rows[day][week]
    const rows: (string | null)[][] = [];
    for (let dayIndex = 0; dayIndex < 7; dayIndex++) {
      const row: (string | null)[] = [];
      for (let weekIndex = 0; weekIndex < weeks.length; weekIndex++) {
        row.push(weeks[weekIndex][dayIndex] || null);
      }
      rows.push(row);
    }

    return rows;
  }, [dateRange]);

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  };

  // Day labels for the left side - localized based on user's locale
  const dayLabels = Array.from({ length: 7 }, (_, i) => {
    // 2024-06-03 is a Monday; add i days to get each weekday
    const date = new Date(2024, 5, 3 + i);
    return date.toLocaleDateString(undefined, { weekday: 'short' });
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent>
        <div className="space-y-2 overflow-x-auto">
          <TooltipProvider>
            <div className="flex gap-2 min-w-fit">
              {/* Day labels */}
              <div className="flex flex-col gap-1 pr-2 text-xs text-muted-foreground">
                {dayLabels.map((label, index) => (
                  <div key={label} className="h-3 flex items-center justify-end">
                    <span className={index % 2 === 1 ? '' : 'hidden sm:inline'}>{label}</span>
                  </div>
                ))}
              </div>

              {/* Heatmap grid */}
              <div className="flex flex-col gap-1">
                {dayRows.map((row, rowIndex) => (
                  <div key={rowIndex} className="flex gap-1">
                    {row.map((date, colIndex) => {
                      if (!date) {
                        // Empty placeholder for days before the start
                        return <div key={`empty-${rowIndex}-${colIndex}`} className="w-3 h-3" />;
                      }
                      const count = countMap.get(date) || 0;
                      return (
                        <Tooltip key={date}>
                          <TooltipTrigger asChild>
                            <div
                              className={cn(
                                'w-3 h-3 rounded-sm cursor-pointer transition-transform hover:scale-125',
                                getColorIntensity(count)
                              )}
                            />
                          </TooltipTrigger>
                          <TooltipContent>
                            <div className="text-xs">
                              <p className="font-medium">{formatDate(date)}</p>
                              <p className="text-muted-foreground">
                                {t('tools.activity', { count })}
                              </p>
                            </div>
                          </TooltipContent>
                        </Tooltip>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          </TooltipProvider>

          {/* Legend */}
          <div className="flex items-center gap-2 text-xs text-muted-foreground pt-2">
            <span>Less</span>
            <div className="flex gap-1">
              <div className="w-3 h-3 rounded-sm bg-muted" />
              <div className="w-3 h-3 rounded-sm bg-green-200 dark:bg-green-900" />
              <div className="w-3 h-3 rounded-sm bg-green-400 dark:bg-green-700" />
              <div className="w-3 h-3 rounded-sm bg-green-600 dark:bg-green-500" />
              <div className="w-3 h-3 rounded-sm bg-green-800 dark:bg-green-300" />
            </div>
            <span>More</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}