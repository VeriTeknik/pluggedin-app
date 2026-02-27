import { Suspense } from 'react';

import { ClustersListServer } from './components/clusters-list-server';

// Force dynamic rendering because this page requires authentication
export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Cluster Management | Admin',
  description: 'Manage PAP clusters and heartbeat collectors',
};

export default function AdminClustersPage() {
  return (
    <div className="container mx-auto py-8 px-4">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Cluster Management</h1>
        <p className="text-muted-foreground mt-2">
          Manage PAP clusters, heartbeat collectors, and view Kubernetes pods
        </p>
      </div>

      <Suspense fallback={<div className="text-center py-12">Loading clusters...</div>}>
        <ClustersListServer />
      </Suspense>
    </div>
  );
}
