'use server';

import { desc, eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { getServerSession } from 'next-auth';
import { z } from 'zod';

import { db } from '@/db';
import { ClusterStatus, clustersTable, users } from '@/db/schema';
import { authOptions } from '@/lib/auth';
import { kubernetesService } from '@/lib/services/kubernetes-service';

// Validation schema for cluster creation/update
const clusterSchema = z.object({
  cluster_id: z
    .string()
    .min(1, 'Cluster ID is required')
    .max(100, 'Cluster ID must be less than 100 characters')
    .regex(
      /^[a-z0-9.-]+$/,
      'Cluster ID can only contain lowercase letters, numbers, dots, and hyphens'
    ),
  name: z
    .string()
    .min(1, 'Name is required')
    .max(200, 'Name must be less than 200 characters'),
  description: z.string().max(1000, 'Description must be less than 1000 characters').optional(),
  collector_url: z
    .string()
    .url('Must be a valid URL')
    .optional()
    .or(z.literal('')),
  status: z.enum(['ACTIVE', 'INACTIVE', 'MAINTENANCE']).default('ACTIVE'),
});

const createClusterSchema = clusterSchema;
const updateClusterSchema = clusterSchema.partial().extend({
  uuid: z.string().uuid(),
});

// Helper function to check admin access
async function checkAdminAccess() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.email) {
    throw new Error('Unauthorized');
  }

  const user = await db.query.users.findFirst({
    where: eq(users.email, session.user.email),
  });

  if (!user?.is_admin) {
    throw new Error('Admin access required');
  }

  return user;
}

/**
 * Get all clusters
 */
export async function getClusters() {
  try {
    await checkAdminAccess();

    const clusters = await db.query.clustersTable.findMany({
      orderBy: [desc(clustersTable.created_at)],
    });

    return {
      success: true,
      data: clusters,
    };
  } catch (error) {
    console.error('Error fetching clusters:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch clusters',
    };
  }
}

/**
 * Get single cluster by UUID
 */
export async function getClusterById(uuid: string) {
  try {
    await checkAdminAccess();

    const cluster = await db.query.clustersTable.findFirst({
      where: eq(clustersTable.uuid, uuid),
    });

    if (!cluster) {
      return {
        success: false,
        error: 'Cluster not found',
      };
    }

    return {
      success: true,
      data: cluster,
    };
  } catch (error) {
    console.error('Error fetching cluster:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch cluster',
    };
  }
}

/**
 * Create a new cluster
 */
export async function createCluster(data: z.infer<typeof createClusterSchema>) {
  try {
    await checkAdminAccess();
    const validated = createClusterSchema.parse(data);

    // Check if cluster_id already exists
    const existingCluster = await db.query.clustersTable.findFirst({
      where: eq(clustersTable.cluster_id, validated.cluster_id),
    });

    if (existingCluster) {
      return {
        success: false,
        error: 'A cluster with this ID already exists',
      };
    }

    const [cluster] = await db
      .insert(clustersTable)
      .values({
        cluster_id: validated.cluster_id,
        name: validated.name,
        description: validated.description || null,
        collector_url: validated.collector_url || null,
        status: validated.status as ClusterStatus,
      })
      .returning();

    revalidatePath('/admin/clusters');

    return {
      success: true,
      data: cluster,
    };
  } catch (error) {
    console.error('Error creating cluster:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create cluster',
    };
  }
}

/**
 * Update an existing cluster
 */
export async function updateCluster(data: z.infer<typeof updateClusterSchema>) {
  try {
    await checkAdminAccess();
    const validated = updateClusterSchema.parse(data);

    // Check if cluster exists
    const existingCluster = await db.query.clustersTable.findFirst({
      where: eq(clustersTable.uuid, validated.uuid),
    });

    if (!existingCluster) {
      return {
        success: false,
        error: 'Cluster not found',
      };
    }

    // Check cluster_id uniqueness if changed
    if (validated.cluster_id && validated.cluster_id !== existingCluster.cluster_id) {
      const duplicateCluster = await db.query.clustersTable.findFirst({
        where: eq(clustersTable.cluster_id, validated.cluster_id),
      });

      if (duplicateCluster) {
        return {
          success: false,
          error: 'A cluster with this ID already exists',
        };
      }
    }

    const updateData: Partial<typeof clustersTable.$inferInsert> = {
      updated_at: new Date(),
    };

    if (validated.cluster_id !== undefined) updateData.cluster_id = validated.cluster_id;
    if (validated.name !== undefined) updateData.name = validated.name;
    if (validated.description !== undefined) updateData.description = validated.description || null;
    if (validated.collector_url !== undefined) updateData.collector_url = validated.collector_url || null;
    if (validated.status !== undefined) updateData.status = validated.status as ClusterStatus;

    const [cluster] = await db
      .update(clustersTable)
      .set(updateData)
      .where(eq(clustersTable.uuid, validated.uuid))
      .returning();

    revalidatePath('/admin/clusters');

    return {
      success: true,
      data: cluster,
    };
  } catch (error) {
    console.error('Error updating cluster:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update cluster',
    };
  }
}

/**
 * Delete a cluster
 */
export async function deleteCluster(uuid: string) {
  try {
    await checkAdminAccess();

    const cluster = await db.query.clustersTable.findFirst({
      where: eq(clustersTable.uuid, uuid),
    });

    if (!cluster) {
      return {
        success: false,
        error: 'Cluster not found',
      };
    }

    await db.delete(clustersTable).where(eq(clustersTable.uuid, uuid));

    revalidatePath('/admin/clusters');

    return {
      success: true,
    };
  } catch (error) {
    console.error('Error deleting cluster:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to delete cluster',
    };
  }
}

/**
 * Get Kubernetes pods for a namespace
 */
export async function getClusterPods(namespace: string = 'agents') {
  try {
    await checkAdminAccess();

    const agents = await kubernetesService.listAgents(namespace);

    return {
      success: true,
      data: agents,
    };
  } catch (error) {
    console.error('Error fetching cluster pods:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch cluster pods',
    };
  }
}

/**
 * Get detailed pod status for an agent
 */
export async function getAgentPodStatus(agentName: string, namespace: string = 'agents') {
  try {
    await checkAdminAccess();

    const podStatus = await kubernetesService.getAgentPodStatus(agentName, namespace);

    return {
      success: true,
      data: podStatus,
    };
  } catch (error) {
    console.error('Error fetching pod status:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch pod status',
    };
  }
}
