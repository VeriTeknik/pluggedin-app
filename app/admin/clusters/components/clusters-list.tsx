'use client';

import { format } from 'date-fns';
import {
  Activity,
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  MoreHorizontal,
  Pause,
  Pencil,
  Plus,
  Power,
  Server,
  Skull,
  Trash2,
  Zap,
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

import {
  deleteAgent,
  killAgent,
  suspendAgent,
  terminateAgent,
} from '../agent-actions';
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

type AgentState = 'NEW' | 'PROVISIONED' | 'ACTIVE' | 'DRAINING' | 'TERMINATED' | 'KILLED';
type DeploymentStatus = 'PENDING' | 'DEPLOYED' | 'FAILED' | 'UNDEPLOYED';

type Agent = {
  uuid: string;
  name: string;
  dns_name: string;
  state: AgentState;
  deployment_status: DeploymentStatus;
  kubernetes_namespace: string | null;
  kubernetes_deployment: string | null;
  profile_uuid: string;
  created_at: Date;
  provisioned_at: Date | null;
  activated_at: Date | null;
  terminated_at: Date | null;
  last_heartbeat_at: Date | null;
  metadata: unknown;
};

type ClustersListClientProps = {
  clusters: Cluster[];
  pods: Pod[];
  agents: Agent[];
};

export function ClustersListClient({ clusters, pods, agents }: ClustersListClientProps) {
  const router = useRouter();
  const [deleteUuid, setDeleteUuid] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [editCluster, setEditCluster] = useState<Cluster | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);

  // Agent management state
  const [agentAction, setAgentAction] = useState<{
    type: 'suspend' | 'terminate' | 'kill' | 'delete';
    agentId: string;
    sendNotification: boolean;
    reason: string;
  } | null>(null);
  const [processingAgent, setProcessingAgent] = useState(false);

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

  async function handleAgentAction() {
    if (!agentAction) return;

    setProcessingAgent(true);

    let result;
    const options = {
      sendNotification: agentAction.sendNotification,
      reason: agentAction.reason || undefined,
    };

    switch (agentAction.type) {
      case 'suspend':
        result = await suspendAgent(agentAction.agentId, options);
        break;
      case 'terminate':
        result = await terminateAgent(agentAction.agentId, options);
        break;
      case 'kill':
        result = await killAgent(agentAction.agentId, options);
        break;
      case 'delete':
        result = await deleteAgent(agentAction.agentId, options);
        break;
    }

    if (result.success) {
      toast.success(
        `Agent ${agentAction.type}${agentAction.type === 'delete' ? 'd' : agentAction.type === 'kill' ? 'ed' : agentAction.type === 'suspend' ? 'ed' : 'd'} successfully`
      );
      setAgentAction(null);
      router.refresh();
    } else {
      toast.error(result.error || `Failed to ${agentAction.type} agent`);
    }

    setProcessingAgent(false);
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

  function getAgentStateBadge(state: AgentState): { variant: 'default' | 'secondary' | 'outline' | 'destructive'; className?: string } {
    switch (state) {
      case 'ACTIVE':
        return { variant: 'default', className: 'bg-green-600' };
      case 'PROVISIONED':
        return { variant: 'default', className: 'bg-blue-600' };
      case 'NEW':
        return { variant: 'secondary' };
      case 'DRAINING':
        return { variant: 'default', className: 'bg-yellow-600' };
      case 'TERMINATED':
        return { variant: 'outline' };
      case 'KILLED':
        return { variant: 'destructive' };
      default:
        return { variant: 'secondary' };
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

      {/* Agents Section */}
      {agents.length > 0 && (
        <div className="mt-8">
          <Card>
            <CardHeader>
              <CardTitle>Agents</CardTitle>
              <CardDescription>
                Manage PAP agents across all clusters
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>DNS</TableHead>
                    <TableHead>State</TableHead>
                    <TableHead>Deployment</TableHead>
                    <TableHead>Namespace</TableHead>
                    <TableHead>Last Heartbeat</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {agents.map((agent) => {
                    const stateBadge = getAgentStateBadge(agent.state);
                    return (
                      <TableRow key={agent.uuid}>
                        <TableCell className="font-medium">
                          {agent.name}
                        </TableCell>
                        <TableCell>
                          <code className="text-sm bg-muted px-2 py-1 rounded">
                            {agent.dns_name}
                          </code>
                        </TableCell>
                        <TableCell>
                          <Badge variant={stateBadge.variant} className={stateBadge.className}>
                            {agent.state}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">
                            {agent.deployment_status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {agent.kubernetes_namespace || '-'}
                        </TableCell>
                        <TableCell>
                          {agent.last_heartbeat_at
                            ? format(new Date(agent.last_heartbeat_at), 'MMM d, HH:mm')
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
                              {agent.state === 'ACTIVE' && (
                                <>
                                  <DropdownMenuItem
                                    onClick={() =>
                                      setAgentAction({
                                        type: 'suspend',
                                        agentId: agent.uuid,
                                        sendNotification: false,
                                        reason: '',
                                      })
                                    }
                                  >
                                    <Pause className="mr-2 h-4 w-4" />
                                    Suspend (Drain)
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                </>
                              )}
                              {agent.state !== 'TERMINATED' && agent.state !== 'KILLED' && (
                                <>
                                  <DropdownMenuItem
                                    onClick={() =>
                                      setAgentAction({
                                        type: 'terminate',
                                        agentId: agent.uuid,
                                        sendNotification: false,
                                        reason: '',
                                      })
                                    }
                                  >
                                    <Power className="mr-2 h-4 w-4" />
                                    Terminate
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    onClick={() =>
                                      setAgentAction({
                                        type: 'kill',
                                        agentId: agent.uuid,
                                        sendNotification: false,
                                        reason: '',
                                      })
                                    }
                                    className="text-destructive"
                                  >
                                    <Skull className="mr-2 h-4 w-4" />
                                    Kill (Force)
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                </>
                              )}
                              {(agent.state === 'TERMINATED' || agent.state === 'KILLED') && (
                                <DropdownMenuItem
                                  onClick={() =>
                                    setAgentAction({
                                      type: 'delete',
                                      agentId: agent.uuid,
                                      sendNotification: false,
                                      reason: '',
                                    })
                                  }
                                  className="text-destructive"
                                >
                                  <Trash2 className="mr-2 h-4 w-4" />
                                  Delete Permanently
                                </DropdownMenuItem>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
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

      {/* Agent Action Confirmation Dialog */}
      {agentAction && (
        <AlertDialog open={!!agentAction} onOpenChange={() => setAgentAction(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {agentAction.type === 'suspend' && 'Suspend Agent (Drain)'}
                {agentAction.type === 'terminate' && 'Terminate Agent'}
                {agentAction.type === 'kill' && 'Kill Agent (Force)'}
                {agentAction.type === 'delete' && 'Delete Agent Permanently'}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {agentAction.type === 'suspend' &&
                  'This will transition the agent to DRAINING state. It will gracefully stop accepting new requests.'}
                {agentAction.type === 'terminate' &&
                  'This will cleanly shut down the agent and delete Kubernetes resources. The agent will be moved to TERMINATED state.'}
                {agentAction.type === 'kill' &&
                  'This will forcefully terminate the agent immediately. The agent will be moved to KILLED state.'}
                {agentAction.type === 'delete' &&
                  'This will permanently delete the agent from the database. This action cannot be undone.'}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="space-y-4 py-4">
              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="send-notification"
                  checked={agentAction.sendNotification}
                  onChange={(e) =>
                    setAgentAction({ ...agentAction, sendNotification: e.target.checked })
                  }
                  className="h-4 w-4 rounded border-gray-300"
                />
                <label
                  htmlFor="send-notification"
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                >
                  Send notification to agent owner
                </label>
              </div>
              <div className="space-y-2">
                <label htmlFor="reason" className="text-sm font-medium">
                  Reason (optional)
                </label>
                <textarea
                  id="reason"
                  value={agentAction.reason}
                  onChange={(e) => setAgentAction({ ...agentAction, reason: e.target.value })}
                  placeholder="Explain why this action is being taken..."
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 min-h-[80px]"
                  disabled={processingAgent}
                />
              </div>
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={processingAgent}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleAgentAction}
                disabled={processingAgent}
                className={
                  agentAction.type === 'kill' || agentAction.type === 'delete'
                    ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90'
                    : ''
                }
              >
                {processingAgent
                  ? 'Processing...'
                  : agentAction.type === 'suspend'
                    ? 'Suspend'
                    : agentAction.type === 'terminate'
                      ? 'Terminate'
                      : agentAction.type === 'kill'
                        ? 'Kill'
                        : 'Delete'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </>
  );
}
