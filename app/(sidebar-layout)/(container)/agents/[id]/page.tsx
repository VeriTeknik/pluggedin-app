'use client';

import { Activity, AlertTriangle, ArrowLeft, Clock, Cpu, Download, HardDrive, Heart, Play, RefreshCw, RotateCw, Server, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import useSWR from 'swr';

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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';

interface Agent {
  uuid: string;
  name: string;
  dns_name: string;
  state: string;
  created_at: string;
  provisioned_at?: string;
  activated_at?: string;
  terminated_at?: string;
  last_heartbeat_at?: string;
  metadata?: any;
  kubernetes_namespace?: string;
  kubernetes_deployment?: string;
}

interface Heartbeat {
  id: number;
  mode: string;
  uptime_seconds: number;
  timestamp: string;
}

interface Metric {
  id: number;
  cpu_percent: number;
  memory_mb: number;
  requests_handled: number;
  custom_metrics?: Record<string, number>;
  timestamp: string;
}

interface LifecycleEvent {
  id: number;
  event_type: string;
  from_state?: string;
  to_state?: string;
  metadata?: any;
  timestamp: string;
}

interface KubernetesStatus {
  ready: boolean;
  replicas: number;
  readyReplicas: number;
  availableReplicas: number;
  updatedReplicas: number;
  conditions: any[];
}

interface AgentDetailResponse {
  agent: Agent;
  recentHeartbeats: Heartbeat[];
  recentMetrics: Metric[];
  lifecycleEvents: LifecycleEvent[];
  kubernetesStatus: KubernetesStatus | null;
}

// Heartbeat intervals per mode (PAP-RFC-001 §8.1)
const HEARTBEAT_INTERVALS: Record<string, number> = {
  EMERGENCY: 5 * 1000,
  IDLE: 30 * 1000,
  SLEEP: 15 * 60 * 1000,
};

const fetcher = async (url: string) => {
  const response = await fetch(url);
  if (!response.ok) throw new Error('Failed to fetch');
  return response.json();
};

// Format uptime in human readable format
function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  parts.push(`${secs}s`);
  return parts.join(' ');
}

// Calculate time ago
function timeAgo(timestamp: string): string {
  const diff = Date.now() - new Date(timestamp).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function AgentDetailPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;

  // Auto-refresh every 10 seconds for real-time updates
  const { data, error, isLoading, mutate } = useSWR<AgentDetailResponse>(
    `/api/agents/${id}`,
    fetcher,
    { refreshInterval: 10000 }
  );

  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isRestarting, setIsRestarting] = useState(false);
  const { toast } = useToast();

  const agent = data?.agent;
  const recentHeartbeats = data?.recentHeartbeats || [];
  const recentMetrics = data?.recentMetrics || [];
  const lifecycleEvents = data?.lifecycleEvents || [];
  const kubernetesStatus = data?.kubernetesStatus;

  // Calculate health status
  const lastHeartbeat = recentHeartbeats[0];
  const lastHeartbeatMode = lastHeartbeat?.mode || 'IDLE';
  const expectedInterval = HEARTBEAT_INTERVALS[lastHeartbeatMode] || HEARTBEAT_INTERVALS.IDLE;
  const timeSinceHeartbeat = agent?.last_heartbeat_at
    ? Date.now() - new Date(agent.last_heartbeat_at).getTime()
    : Infinity;
  const isHealthy = timeSinceHeartbeat < expectedInterval * 2;

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await mutate();
    setIsRefreshing(false);
  };

  const handleRestart = async () => {
    try {
      setIsRestarting(true);
      const response = await fetch(`/api/agents/${id}/restart`, {
        method: 'POST',
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to restart agent');
      }

      await mutate();
      toast({
        title: 'Agent Restarting',
        description: 'Agent restart initiated. It will become ACTIVE after sending first heartbeat.',
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to restart agent',
        variant: 'destructive',
      });
    } finally {
      setIsRestarting(false);
    }
  };

  const handleDelete = async () => {
    try {
      setIsDeleting(true);
      const response = await fetch(`/api/agents/${id}`, {
        method: 'DELETE',
      });

      if (!response.ok) throw new Error('Failed to delete agent');

      toast({
        title: 'Agent Deleted',
        description: 'Agent has been successfully deleted.',
      });
      router.push('/agents');
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to delete agent',
        variant: 'destructive',
      });
      setIsDeleting(false);
    }
  };

  const handleExport = async () => {
    try {
      setIsExporting(true);
      const response = await fetch(`/api/agents/${id}/export`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ include_telemetry: true, telemetry_limit: 100 }),
      });

      if (!response.ok) throw new Error('Failed to export agent');

      const data = await response.json();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `agent-${agent?.name}-export.json`;
      a.click();
      URL.revokeObjectURL(url);

      toast({
        title: 'Export Complete',
        description: 'Agent data has been exported successfully.',
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to export agent',
        variant: 'destructive',
      });
    } finally {
      setIsExporting(false);
    }
  };

  const getStateBadgeVariant = (state: string) => {
    switch (state) {
      case 'ACTIVE':
        return 'default';
      case 'PROVISIONED':
        return 'secondary';
      case 'DRAINING':
        return 'outline';
      case 'TERMINATED':
      case 'KILLED':
        return 'destructive';
      default:
        return 'secondary';
    }
  };

  if (isLoading) {
    return <div className="container mx-auto px-4 py-8">Loading agent details...</div>;
  }

  if (error || !agent) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center text-red-500">Failed to load agent details</div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6">
        <Button variant="ghost" asChild className="mb-4">
          <Link href="/agents">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Agents
          </Link>
        </Button>

        <div className="flex justify-between items-start">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold">{agent.name}</h1>
              <Badge variant={getStateBadgeVariant(agent.state)}>{agent.state}</Badge>
            </div>
            <p className="text-muted-foreground font-mono text-sm mt-1">{agent.dns_name}</p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="icon"
              onClick={handleRefresh}
              disabled={isRefreshing}
              title="Refresh data"
            >
              <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            </Button>
            {(agent.state === 'ACTIVE' || agent.state === 'PROVISIONED' || agent.state === 'DRAINING') && (
              <Button
                variant="outline"
                onClick={handleRestart}
                disabled={isRestarting}
              >
                <RotateCw className={`mr-2 h-4 w-4 ${isRestarting ? 'animate-spin' : ''}`} />
                {isRestarting ? 'Restarting...' : 'Restart'}
              </Button>
            )}
            <Button
              variant="outline"
              onClick={handleExport}
              disabled={isExporting}
            >
              <Download className="mr-2 h-4 w-4" />
              {isExporting ? 'Exporting...' : 'Export'}
            </Button>
            <Button
              variant="destructive"
              onClick={() => setShowDeleteDialog(true)}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </Button>
          </div>
        </div>
      </div>

      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="telemetry">Telemetry</TabsTrigger>
          <TabsTrigger value="deployment">Deployment</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Agent Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">UUID</p>
                  <p className="font-mono text-sm">{agent.uuid}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">DNS Name</p>
                  <p className="font-mono text-sm">{agent.dns_name}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">State</p>
                  <Badge variant={getStateBadgeVariant(agent.state)}>{agent.state}</Badge>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Created</p>
                  <p className="text-sm">{new Date(agent.created_at).toLocaleString()}</p>
                </div>
                {agent.provisioned_at && (
                  <div>
                    <p className="text-sm text-muted-foreground">Provisioned</p>
                    <p className="text-sm">{new Date(agent.provisioned_at).toLocaleString()}</p>
                  </div>
                )}
                {agent.activated_at && (
                  <div>
                    <p className="text-sm text-muted-foreground">Activated</p>
                    <p className="text-sm">{new Date(agent.activated_at).toLocaleString()}</p>
                  </div>
                )}
                {agent.last_heartbeat_at && (
                  <div>
                    <p className="text-sm text-muted-foreground">Last Heartbeat</p>
                    <p className="text-sm">{new Date(agent.last_heartbeat_at).toLocaleString()}</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {agent.state === 'ACTIVE' && (
            <Card>
              <CardHeader>
                <CardTitle>Quick Actions</CardTitle>
              </CardHeader>
              <CardContent className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => window.open(`https://${agent.dns_name}`, '_blank')}
                >
                  <Server className="mr-2 h-4 w-4" />
                  Open Agent
                </Button>
                <Button
                  variant="outline"
                  onClick={() => window.open(`https://${agent.dns_name}/tools`, '_blank')}
                >
                  <Activity className="mr-2 h-4 w-4" />
                  View Tools
                </Button>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="telemetry" className="space-y-4">
          {/* Health Status Card */}
          {agent.state === 'ACTIVE' && (
            <Card className={isHealthy ? 'border-green-500/50' : 'border-red-500/50'}>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-lg">
                  {isHealthy ? (
                    <Heart className="h-5 w-5 text-green-500" />
                  ) : (
                    <AlertTriangle className="h-5 w-5 text-red-500" />
                  )}
                  Agent Health
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <div>
                    <Badge variant={isHealthy ? 'default' : 'destructive'}>
                      {isHealthy ? 'Healthy' : 'Unhealthy'}
                    </Badge>
                    <p className="text-sm text-muted-foreground mt-1">
                      Mode: {lastHeartbeatMode} (interval: {expectedInterval / 1000}s)
                    </p>
                  </div>
                  {agent.last_heartbeat_at && (
                    <div className="text-right">
                      <p className="text-2xl font-bold">{timeAgo(agent.last_heartbeat_at)}</p>
                      <p className="text-sm text-muted-foreground">Last heartbeat</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Latest Metrics */}
          {recentMetrics.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Activity className="h-5 w-5" />
                  Latest Metrics
                </CardTitle>
                <CardDescription>
                  Last updated: {timeAgo(recentMetrics[0].timestamp)}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <Cpu className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">CPU</span>
                    </div>
                    <p className="text-2xl font-bold">{recentMetrics[0].cpu_percent}%</p>
                    <Progress value={Math.min(recentMetrics[0].cpu_percent, 100)} className="mt-1" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <HardDrive className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">Memory</span>
                    </div>
                    <p className="text-2xl font-bold">{recentMetrics[0].memory_mb} MB</p>
                  </div>
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <Activity className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">Requests</span>
                    </div>
                    <p className="text-2xl font-bold">{recentMetrics[0].requests_handled.toLocaleString()}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Recent Heartbeats */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Heart className="h-5 w-5" />
                Recent Heartbeats
              </CardTitle>
              <CardDescription>
                Liveness signals from the agent (PAP-RFC-001 §8.1)
              </CardDescription>
            </CardHeader>
            <CardContent>
              {recentHeartbeats.length === 0 ? (
                <p className="text-sm text-muted-foreground">No heartbeats received yet</p>
              ) : (
                <div className="space-y-2">
                  {recentHeartbeats.map((hb) => (
                    <div key={hb.id} className="flex items-center justify-between py-2 border-b last:border-0">
                      <div className="flex items-center gap-3">
                        <Badge variant="outline">{hb.mode}</Badge>
                        <span className="text-sm">
                          Uptime: {formatUptime(hb.uptime_seconds)}
                        </span>
                      </div>
                      <span className="text-sm text-muted-foreground">
                        {timeAgo(hb.timestamp)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Recent Metrics History */}
          {recentMetrics.length > 1 && (
            <Card>
              <CardHeader>
                <CardTitle>Metrics History</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {recentMetrics.slice(1).map((m) => (
                    <div key={m.id} className="flex items-center justify-between py-2 border-b last:border-0">
                      <div className="flex items-center gap-4 text-sm">
                        <span>CPU: {m.cpu_percent}%</span>
                        <span>Mem: {m.memory_mb}MB</span>
                        <span>Req: {m.requests_handled}</span>
                      </div>
                      <span className="text-sm text-muted-foreground">
                        {timeAgo(m.timestamp)}
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Lifecycle Events */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5" />
                Lifecycle Events
              </CardTitle>
            </CardHeader>
            <CardContent>
              {lifecycleEvents.length === 0 ? (
                <p className="text-sm text-muted-foreground">No lifecycle events recorded</p>
              ) : (
                <div className="space-y-2">
                  {lifecycleEvents.map((event) => (
                    <div key={event.id} className="flex items-center justify-between py-2 border-b last:border-0">
                      <div className="flex items-center gap-3">
                        <Badge variant="secondary">{event.event_type}</Badge>
                        {event.from_state && event.to_state && (
                          <span className="text-sm text-muted-foreground">
                            {event.from_state} → {event.to_state}
                          </span>
                        )}
                      </div>
                      <span className="text-sm text-muted-foreground">
                        {timeAgo(event.timestamp)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="deployment" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Kubernetes Deployment</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Namespace</p>
                  <p className="font-mono text-sm">{agent.kubernetes_namespace || 'agents'}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Deployment Name</p>
                  <p className="font-mono text-sm">{agent.kubernetes_deployment || agent.name}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {kubernetesStatus && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Server className="h-5 w-5" />
                  Deployment Status
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Ready</p>
                    <Badge variant={kubernetesStatus.ready ? 'default' : 'destructive'}>
                      {kubernetesStatus.ready ? 'Yes' : 'No'}
                    </Badge>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Replicas</p>
                    <p className="text-lg font-bold">{kubernetesStatus.readyReplicas}/{kubernetesStatus.replicas}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Available</p>
                    <p className="text-lg font-bold">{kubernetesStatus.availableReplicas}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Updated</p>
                    <p className="text-lg font-bold">{kubernetesStatus.updatedReplicas}</p>
                  </div>
                </div>

                {kubernetesStatus.conditions && kubernetesStatus.conditions.length > 0 && (
                  <div className="mt-4">
                    <p className="text-sm text-muted-foreground mb-2">Conditions</p>
                    <div className="space-y-1">
                      {kubernetesStatus.conditions.map((condition: any, idx: number) => (
                        <div key={idx} className="flex items-center gap-2 text-sm">
                          <Badge variant={condition.status === 'True' ? 'default' : 'secondary'}>
                            {condition.type}
                          </Badge>
                          <span className="text-muted-foreground">{condition.message}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {/* Delete Confirmation Dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Agent</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete "{agent.name}"? This will terminate the Kubernetes deployment and remove all data. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowDeleteDialog(false)}
              disabled={isDeleting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={isDeleting}
            >
              {isDeleting ? 'Deleting...' : 'Delete Agent'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
