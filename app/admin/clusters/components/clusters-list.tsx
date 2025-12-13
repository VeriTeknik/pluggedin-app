'use client';

import { format } from 'date-fns';
import {
  Activity,
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  MoreHorizontal,
  Pencil,
  Plus,
  Server,
  Trash2,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

import { deleteCluster } from '../actions';
import { ClusterForm } from './cluster-form';

type ClusterStatus = 'ACTIVE' | 'INACTIVE' | 'MAINTENANCE';

type Cluster = {
  uuid: string;
  cluster_id: string;
  name: string;
  description: string | null;
  collector_url: string | null;
  status: ClusterStatus | null;
  agent_count: number | null;
  healthy_agent_count: number | null;
  last_alert_at: Date | null;
  last_seen_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

type Pod = {
  name: string;
  ready: boolean;
};

type ClustersListClientProps = {
  clusters: Cluster[];
  pods: Pod[];
};

export function ClustersListClient({ clusters, pods }: ClustersListClientProps) {
  const router = useRouter();
  const [deleteUuid, setDeleteUuid] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [editCluster, setEditCluster] = useState<Cluster | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);

  async function handleDelete() {
    if (!deleteUuid) return;

    setDeleting(true);
    const result = await deleteCluster(deleteUuid);

    if (result.success) {
      toast.success('Cluster deleted successfully');
      setDeleteUuid(null);
      router.refresh();
    } else {
      toast.error(result.error || 'Failed to delete cluster');
    }
    setDeleting(false);
  }

  function getStatusBadgeVariant(status: ClusterStatus | null): 'default' | 'secondary' | 'outline' | 'destructive' {
    switch (status) {
      case 'ACTIVE':
        return 'default';
      case 'INACTIVE':
        return 'secondary';
      case 'MAINTENANCE':
        return 'outline';
      default:
        return 'secondary';
    }
  }

  const clusterToDelete = clusters.find((c) => c.uuid === deleteUuid);

  // Stats
  const totalClusters = clusters.length;
  const activeClusters = clusters.filter((c) => c.status === 'ACTIVE').length;
  const totalPods = pods.length;
  const readyPods = pods.filter((p) => p.ready).length;

  return (
    <>
      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-4 mb-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Clusters</CardTitle>
            <Server className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalClusters}</div>
            <p className="text-xs text-muted-foreground">
              {activeClusters} active
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Kubernetes Pods</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalPods}</div>
            <p className="text-xs text-muted-foreground">
              {readyPods} ready
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Health</CardTitle>
            {readyPods === totalPods ? (
              <CheckCircle2 className="h-4 w-4 text-green-500" />
            ) : (
              <AlertCircle className="h-4 w-4 text-yellow-500" />
            )}
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {totalPods > 0 ? Math.round((readyPods / totalPods) * 100) : 0}%
            </div>
            <p className="text-xs text-muted-foreground">
              pod readiness
            </p>
          </CardContent>
        </Card>
        <Card className="flex items-center justify-center">
          <Button onClick={() => setShowCreateForm(true)} className="m-4">
            <Plus className="mr-2 h-4 w-4" />
            Add Cluster
          </Button>
        </Card>
      </div>

      {/* Clusters Table */}
      {clusters.length === 0 ? (
        <div className="text-center py-12 border rounded-md">
          <Server className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium mb-2">No clusters registered</h3>
          <p className="text-muted-foreground mb-4">
            Add your first cluster to start managing PAP agents
          </p>
          <Button onClick={() => setShowCreateForm(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Add Cluster
          </Button>
        </div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Cluster ID</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Collector URL</TableHead>
                <TableHead>Agents</TableHead>
                <TableHead>Last Seen</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {clusters.map((cluster) => (
                <TableRow key={cluster.uuid}>
                  <TableCell className="font-medium">
                    {cluster.name}
                    {cluster.description && (
                      <div className="text-xs text-muted-foreground mt-1 max-w-[200px] truncate">
                        {cluster.description}
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    <code className="text-sm bg-muted px-2 py-1 rounded">
                      {cluster.cluster_id}
                    </code>
                  </TableCell>
                  <TableCell>
                    <Badge variant={getStatusBadgeVariant(cluster.status)}>
                      {cluster.status || 'UNKNOWN'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {cluster.collector_url ? (
                      <a
                        href={cluster.collector_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-blue-600 hover:underline flex items-center gap-1"
                      >
                        {new URL(cluster.collector_url).host}
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    ) : (
                      <span className="text-muted-foreground">Not configured</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">
                        {cluster.healthy_agent_count ?? 0}
                      </span>
                      <span className="text-muted-foreground">/</span>
                      <span>{cluster.agent_count ?? 0}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    {cluster.last_seen_at
                      ? format(new Date(cluster.last_seen_at), 'MMM d, HH:mm')
                      : '-'}
                  </TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => setEditCluster(cluster)}>
                          <Pencil className="mr-2 h-4 w-4" />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={() => setDeleteUuid(cluster.uuid)}
                          className="text-destructive"
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Pods Section */}
      {pods.length > 0 && (
        <div className="mt-8">
          <h2 className="text-xl font-semibold mb-4">Kubernetes Pods (agents namespace)</h2>
          <div className="grid gap-2 md:grid-cols-3 lg:grid-cols-4">
            {pods.map((pod) => (
              <Card key={pod.name} className="p-3">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-sm truncate">{pod.name}</span>
                  {pod.ready ? (
                    <CheckCircle2 className="h-4 w-4 text-green-500 flex-shrink-0" />
                  ) : (
                    <AlertCircle className="h-4 w-4 text-yellow-500 flex-shrink-0" />
                  )}
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Create/Edit Form Dialog */}
      <ClusterForm
        open={showCreateForm || !!editCluster}
        onOpenChange={(open) => {
          if (!open) {
            setShowCreateForm(false);
            setEditCluster(null);
          }
        }}
        cluster={editCluster}
        onSuccess={() => {
          setShowCreateForm(false);
          setEditCluster(null);
          router.refresh();
        }}
      />

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteUuid} onOpenChange={() => setDeleteUuid(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Cluster</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete the cluster &quot;{clusterToDelete?.name}&quot;?
              This action cannot be undone and will also delete all associated alerts.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
