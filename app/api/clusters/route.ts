/**
 * Clusters API - List and manage PAP Heartbeat Collector clusters
 *
 * GET /api/clusters
 *   - List all registered clusters
 *
 * POST /api/clusters
 *   - Register a new cluster
 */

import { desc } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { db } from '@/db';
import { clustersTable } from '@/db/schema';

// Validation schema for new cluster registration
const createClusterSchema = z.object({
  cluster_id: z.string().min(1).max(255),
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  collector_url: z.string().url().optional(),
});

/**
 * GET /api/clusters
 *
 * List all registered clusters.
 */
export async function GET() {
  try {
    const clusters = await db
      .select()
      .from(clustersTable)
      .orderBy(desc(clustersTable.created_at));

    return NextResponse.json({
      clusters,
      total: clusters.length,
    });
  } catch (error) {
    console.error('[Clusters] Error fetching clusters:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/clusters
 *
 * Register a new cluster.
 */
export async function POST(request: Request) {
  // TODO: Add proper admin authentication

  try {
    const body = await request.json();
    const validated = createClusterSchema.parse(body);

    // Check if cluster already exists
    const existing = await db.query.clustersTable.findFirst({
      where: (clusters, { eq }) => eq(clusters.cluster_id, validated.cluster_id),
    });

    if (existing) {
      return NextResponse.json(
        { error: 'Cluster already exists' },
        { status: 409 }
      );
    }

    // Create cluster
    const [cluster] = await db
      .insert(clustersTable)
      .values({
        cluster_id: validated.cluster_id,
        name: validated.name,
        description: validated.description,
        collector_url: validated.collector_url,
      })
      .returning();

    return NextResponse.json({
      cluster,
    }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid cluster data', details: error.errors },
        { status: 400 }
      );
    }

    console.error('[Clusters] Error creating cluster:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
