import { getAgents } from '../agent-actions';
import { getClusters, getClusterPods } from '../actions';
import { ClustersListClient } from './clusters-list';

export async function ClustersListServer() {
  const [clustersResult, podsResult, agentsResult] = await Promise.all([
    getClusters(),
    getClusterPods('agents'),
    getAgents(), // Fetch all agents
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
      agents={agentsResult.success ? agentsResult.data || [] : []}
    />
  );
}
