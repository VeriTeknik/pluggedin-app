/**
 * Seed script to add the is.plugged.in cluster configuration
 *
 * Run with: npx tsx scripts/seed-cluster.ts
 */

import { db } from '../db';
import { clustersTable } from '../db/schema';

async function seedCluster() {
  console.log('Seeding cluster configuration...');

  try {
    // Check if cluster already exists
    const existing = await db.query.clustersTable.findFirst({
      where: (clusters, { eq }) => eq(clusters.cluster_id, 'is.plugged.in'),
    });

    if (existing) {
      console.log('Cluster "is.plugged.in" already exists, updating collector_url...');
      await db
        .update(clustersTable)
        .set({
          collector_url: 'https://collector.is.plugged.in',
        })
        .where((clusters, { eq }) => eq(clusters.cluster_id, 'is.plugged.in'));
      console.log('Updated cluster collector_url');
    } else {
      // Create the cluster
      const [cluster] = await db
        .insert(clustersTable)
        .values({
          cluster_id: 'is.plugged.in',
          name: 'Production Cluster (is.plugged.in)',
          description: 'Main production cluster for PAP agents',
          collector_url: 'https://collector.is.plugged.in',
        })
        .returning();

      console.log('Created cluster:', cluster);
    }

    console.log('Done!');
  } catch (error) {
    console.error('Error seeding cluster:', error);
    process.exit(1);
  }

  process.exit(0);
}

seedCluster();
