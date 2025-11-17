'use server';

import { revalidateTag } from 'next/cache';

/**
 * Manually revalidate metrics cache
 * Call this after significant data changes (e.g., user registration, project creation)
 *
 * Usage from server components:
 * import { revalidateMetrics } from '@/app/actions/revalidate-metrics';
 * await revalidateMetrics();
 */
export async function revalidateMetrics() {
  revalidateTag('metrics');
}
