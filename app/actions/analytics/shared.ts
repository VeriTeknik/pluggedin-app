import { TimePeriod } from '../analytics-hof';

/**
 * Get date cutoff based on time period
 */
export function getDateCutoff(period: TimePeriod): Date | null {
  if (period === 'all') return null;

  const date = new Date();
  switch (period) {
    case '7d':
      date.setDate(date.getDate() - 7);
      break;
    case '30d':
      date.setDate(date.getDate() - 30);
      break;
    case '90d':
      date.setDate(date.getDate() - 90);
      break;
  }
  return date;
}

/**
 * Get comparison period for trend calculation
 */
export function getComparisonCutoff(period: TimePeriod): { start: Date; end: Date } {
  const end = getDateCutoff(period) || new Date(0); // Use epoch if 'all'
  const start = new Date(end);

  // Double the period backwards for comparison
  switch (period) {
    case '7d':
      start.setDate(start.getDate() - 7);
      break;
    case '30d':
      start.setDate(start.getDate() - 30);
      break;
    case '90d':
      start.setDate(start.getDate() - 90);
      break;
    case 'all':
      // For 'all', we can't really have a comparison period
      // Return the same date for both
      return { start: end, end };
  }

  return { start, end };
}

/**
 * Calculate percentage change between two values
 */
export function calculateTrend(current: number, previous: number): number {
  if (previous === 0) {
    return current > 0 ? 100 : 0;
  }
  return Math.round(((current - previous) / previous) * 100);
}