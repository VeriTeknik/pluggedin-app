import { getClusters, getClusterPods } from '../actions';
import { ClustersListClient } from './clusters-list';

export async function ClustersListServer() {
  const [clustersResult, podsResult] = await Promise.all([
    getClusters(),
    getClusterPods('agents'),
  ]);

  if (!clustersResult.success || !clustersResult.data) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">
          {clustersResult.error || 'Failed to load clusters'}
        </p>
      </div>
    );
  }

  return (
    <ClustersListClient
      clusters={clustersResult.data}
      pods={podsResult.success ? podsResult.data || [] : []}
    />
  );
}
