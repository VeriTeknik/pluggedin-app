/**
 * Prometheus Metrics Endpoint
 *
 * Exposes application metrics in Prometheus format.
 * Should be scraped by Prometheus every 30-60 seconds.
 *
 * Configuration in Prometheus:
 * ```yaml
 * - job_name: 'pluggedin-app'
 *   metrics_path: '/api/metrics'
 *   static_configs:
 *     - targets: ['app.plugged.in']
 * ```
 */

import { NextResponse } from 'next/server';
import { getMetrics } from '@/lib/metrics';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  try {
    const metrics = await getMetrics();

    return new NextResponse(metrics, {
      headers: {
        'Content-Type': 'text/plain; version=0.0.4; charset=utf-8',
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      },
    });
  } catch (error) {
    console.error('[Metrics] Error generating metrics:', error);
    return NextResponse.json(
      { error: 'Failed to generate metrics' },
      { status: 500 }
    );
  }
}
