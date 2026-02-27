'use client';

import { Activity, AlertTriangle, ArrowLeft, CheckCircle2, Clock, Cpu, Download, FileText, HardDrive, Heart, Key, Pause, Play, RefreshCw, RotateCw, Server, Shield, Terminal, Trash2, XCircle } from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useState } from 'react';
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
import {
  type Agent,
  fetcher,
  formatDate,
  formatUptime,
  getEffectiveHeartbeatConfig,
  getStateBadgeVariant,
  HEARTBEAT_INTERVALS,
  timeAgo,
} from '@/lib/pap-ui-utils';

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

interface PodEvent {
  type: string;
  reason: string;
  message: string;
  count: number;
  firstTimestamp: string;
  lastTimestamp: string;
  source: string;
}

interface PodStatus {
  name: string;
  phase: string;
  ready: boolean;
  restarts: number;
  containerStatuses: Array<{
    name: string;
    ready: boolean;
    state: string;
    stateReason?: string;
    stateMessage?: string;
    restartCount: number;
  }>;
  startTime?: string;
  podIP?: string;
  nodeName?: string;
}

interface LogLine {
  timestamp: string | null;
  message: string;
}

interface EventsResponse {
  events: PodEvent[];
  pods: PodStatus[];
  deploymentStatus: KubernetesStatus | null;
}

interface LogsResponse {
  logs: string;
  lines: LogLine[];
  tailLines: number;
  error?: string;
}

interface AgentDetailResponse {
  agent: Agent;
  recentHeartbeats: Heartbeat[];
  recentMetrics: Metric[];
  lifecycleEvents: LifecycleEvent[];
  kubernetesStatus: KubernetesStatus | null;
}

// Collector heartbeat data (from pap-heartbeat-collector)
interface CollectorAgentData {
  agent_uuid: string;
  agent_name: string;
  mode: string;
  uptime_seconds: number;
  last_seen: string;
  healthy: boolean;
  observation_mode: boolean;
  consecutive_heartbeats: number;
}

interface CollectorResponse {
  cluster_id: string;
  cluster_name: string;
  agent: CollectorAgentData;
}

/**
 * Get the cluster_id for an agent.
 * Since dns_name is now just the subdomain (e.g., "dev1"), and all agents
 * are currently deployed to the "is.plugged.in" cluster, we return that.
 *
 * TODO: When supporting multiple clusters, add a cluster_id field to agents table
 * or determine cluster based on deployment configuration.
 */
function getClusterId(_dnsName: string): string {
  return 'is.plugged.in';
}

export default function AgentDetailPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;

  // Auto-refresh every 10 seconds for real-time updates
  const { data, error, isLoading, mutate } = useSWR(
    `/api/agents/${id}`,
    fetcher,
    { refreshInterval: 10000 }
  ) as {
    data: AgentDetailResponse | undefined;
    error: any;
    isLoading: boolean;
    mutate: any;
  };

  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isRestarting, setIsRestarting] = useState(false);
  const [isSuspending, setIsSuspending] = useState(false);
  const [isResuming, setIsResuming] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');
  const { toast } = useToast();

  // Fetch logs and events only when on the logs tab
  const { data: eventsData, mutate: mutateEvents } = useSWR(
    activeTab === 'logs' ? `/api/agents/${id}/events` : null,
    fetcher,
    { refreshInterval: 5000 }
  ) as {
    data: EventsResponse | undefined;
    mutate: any;
  };

  const { data: logsData, mutate: mutateLogs } = useSWR(
    activeTab === 'logs' ? `/api/agents/${id}/logs?tail=200` : null,
    fetcher,
    { refreshInterval: 5000 }
  ) as {
    data: LogsResponse | undefined;
    mutate: any;
  };

  const agent = data?.agent;

  // Fetch heartbeat status from collector when on telemetry tab
  const clusterId = agent?.dns_name ? getClusterId(agent.dns_name) : null;
  const { data: collectorResponse, error: collectorError } = useSWR(
    activeTab === 'telemetry' && agent?.uuid && clusterId
      ? `/api/clusters/${clusterId}/agents/${agent.uuid}`
      : null,
    fetcher,
    { refreshInterval: 5000 }
  ) as {
    data: CollectorResponse | undefined;
    error: any;
  };
  const collectorData = collectorResponse?.agent;
  const recentHeartbeats = data?.recentHeartbeats || [];
  const recentMetrics = data?.recentMetrics || [];
  const lifecycleEvents = data?.lifecycleEvents || [];
  const kubernetesStatus = data?.kubernetesStatus;

  // Calculate health status - derive mode and interval once (Comment 1)
  const lastHeartbeat = recentHeartbeats[0];
  const { effectiveMode, effectiveIntervalMs } = getEffectiveHeartbeatConfig(lastHeartbeat?.mode);
  const timeSinceHeartbeat = agent?.last_heartbeat_at
    ? Date.now() - new Date(agent.last_heartbeat_at).getTime()
    : Infinity;
  const isHealthy = timeSinceHeartbeat < effectiveIntervalMs * 2;

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await mutate();
    } finally {
      setIsRefreshing(false);
    }
  };

  // Extract common agent action logic (Comment 4)
  const performAgentAction = useCallback(async (opts: {
    endpoint: string;
    setLoading: (v: boolean) => void;
    successTitle: string;
    successDescription: string;
    errorPrefix: string;
    body?: Record<string, unknown>;
  }) => {
    const { endpoint, setLoading, successTitle, successDescription, errorPrefix, body } = opts;
    try {
      setLoading(true);
      const response = await fetch(`/api/agents/${id}/${endpoint}`, {
        method: 'POST',
        ...(body && {
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `${errorPrefix}`);
      }

      await mutate();
      toast({ title: successTitle, description: successDescription });
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : errorPrefix,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [id, mutate, toast]);

  const handleRestart = () => performAgentAction({
    endpoint: 'restart',
    setLoading: setIsRestarting,
    successTitle: 'Agent Restarting',
    successDescription: 'Agent restart initiated. It will become ACTIVE after sending first heartbeat.',
    errorPrefix: 'Failed to restart agent',
  });

  const handleSuspend = () => performAgentAction({
    endpoint: 'suspend',
    setLoading: setIsSuspending,
    successTitle: 'Agent Suspended',
    successDescription: 'Agent has been suspended. Use Resume to bring it back online.',
    errorPrefix: 'Failed to suspend agent',
    body: { reason: 'User requested suspension via UI' },
  });

  const handleResume = () => performAgentAction({
    endpoint: 'resume',
    setLoading: setIsResuming,
    successTitle: 'Agent Resuming',
    successDescription: 'Agent is starting up. It will become ACTIVE after sending first heartbeat.',
    errorPrefix: 'Failed to resume agent',
  });

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
              {(agent.metadata as Record<string, unknown>)?.intentionally_suspended === true && (
                <Badge variant="outline" className="text-yellow-600 border-yellow-600">
                  <Pause className="mr-1 h-3 w-3" />
                  Suspended
                </Badge>
              )}
            </div>
            <p className="text-muted-foreground font-mono text-sm mt-1">{agent.dns_name}.is.plugged.in</p>
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
            {/* Suspend/Resume button - only show for non-terminated agents */}
            {agent.state !== 'TERMINATED' && agent.state !== 'KILLED' && (
              (agent.metadata as Record<string, unknown>)?.intentionally_suspended === true ? (
                <Button
                  variant="outline"
                  onClick={handleResume}
                  disabled={isResuming}
                  className="text-green-600 hover:text-green-700"
                >
                  <Play className={`mr-2 h-4 w-4 ${isResuming ? 'animate-pulse' : ''}`} />
                  {isResuming ? 'Resuming...' : 'Resume'}
                </Button>
              ) : (
                <Button
                  variant="outline"
                  onClick={handleSuspend}
                  disabled={isSuspending}
                  className="text-yellow-600 hover:text-yellow-700"
                >
                  <Pause className={`mr-2 h-4 w-4 ${isSuspending ? 'animate-pulse' : ''}`} />
                  {isSuspending ? 'Suspending...' : 'Suspend'}
                </Button>
              )
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

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="telemetry">Telemetry</TabsTrigger>
          <TabsTrigger value="logs">
            <Terminal className="mr-2 h-4 w-4" />
            Logs & Events
          </TabsTrigger>
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
                  <p className="font-mono text-sm">{agent.dns_name}.is.plugged.in</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">State</p>
                  <Badge variant={getStateBadgeVariant(agent.state)}>{agent.state}</Badge>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Created</p>
                  <p className="text-sm">{formatDate(agent.created_at)}</p>
                </div>
                {agent.provisioned_at && (
                  <div>
                    <p className="text-sm text-muted-foreground">Provisioned</p>
                    <p className="text-sm">{formatDate(agent.provisioned_at)}</p>
                  </div>
                )}
                {agent.activated_at && (
                  <div>
                    <p className="text-sm text-muted-foreground">Activated</p>
                    <p className="text-sm">{formatDate(agent.activated_at)}</p>
                  </div>
                )}
                {agent.last_heartbeat_at && (
                  <div>
                    <p className="text-sm text-muted-foreground">Last Heartbeat</p>
                    <p className="text-sm">{formatDate(agent.last_heartbeat_at)}</p>
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
                  onClick={() => window.open(`https://${agent.dns_name}.is.plugged.in`, '_blank')}
                >
                  <Server className="mr-2 h-4 w-4" />
                  Open Agent
                </Button>
                <Button
                  variant="outline"
                  onClick={() => window.open(`https://${agent.dns_name}.is.plugged.in/tools`, '_blank')}
                >
                  <Activity className="mr-2 h-4 w-4" />
                  View Tools
                </Button>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="telemetry" className="space-y-4">
          {/* Health Status Card - uses collector data when available */}
          {agent.state === 'ACTIVE' && (
            <Card className={(collectorData?.healthy ?? isHealthy) ? 'border-green-500/50' : 'border-red-500/50'}>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-lg">
                  {(collectorData?.healthy ?? isHealthy) ? (
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
                    <Badge variant={(collectorData?.healthy ?? isHealthy) ? 'default' : 'destructive'}>
                      {(collectorData?.healthy ?? isHealthy) ? 'Healthy' : 'Unhealthy'}
                    </Badge>
                    <p className="text-sm text-muted-foreground mt-1">
                      Mode: {collectorData?.mode ?? effectiveMode} (interval: {(HEARTBEAT_INTERVALS[collectorData?.mode ?? effectiveMode] ?? effectiveIntervalMs) / 1000}s)
                    </p>
                  </div>
                  {(collectorData?.last_seen || agent.last_heartbeat_at) && (
                    <div className="text-right">
                      <p className="text-2xl font-bold">{timeAgo(collectorData?.last_seen ?? agent.last_heartbeat_at)}</p>
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

          {/* Recent Heartbeats - from Collector */}
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
              {collectorError ? (
                <p className="text-sm text-muted-foreground">
                  Unable to fetch heartbeats from collector
                </p>
              ) : collectorData ? (
                <div className="space-y-4">
                  {/* Current Status */}
                  <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                    <div className="flex items-center gap-3">
                      {collectorData.healthy ? (
                        <CheckCircle2 className="h-5 w-5 text-green-500" />
                      ) : (
                        <XCircle className="h-5 w-5 text-red-500" />
                      )}
                      <div>
                        <Badge variant={collectorData.healthy ? 'default' : 'destructive'}>
                          {collectorData.healthy ? 'Healthy' : 'Unhealthy'}
                        </Badge>
                        <span className="ml-2 text-sm text-muted-foreground">
                          Mode: {collectorData.mode}
                        </span>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-medium">{timeAgo(collectorData.last_seen)}</p>
                      <p className="text-xs text-muted-foreground">Last seen</p>
                    </div>
                  </div>
                  {/* Details */}
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <p className="text-muted-foreground">Uptime</p>
                      <p className="font-medium">{formatUptime(Math.floor(collectorData.uptime_seconds))}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Consecutive Heartbeats</p>
                      <p className="font-medium">{collectorData.consecutive_heartbeats.toLocaleString()}</p>
                    </div>
                  </div>
                </div>
              ) : recentHeartbeats.length === 0 ? (
                <p className="text-sm text-muted-foreground">No heartbeats received yet</p>
              ) : (
                <div className="space-y-2">
                  {recentHeartbeats.map((hb: Heartbeat) => (
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

        {/* Logs & Events Tab */}
        <TabsContent value="logs" className="space-y-4">
          {/* Pod Status */}
          {eventsData?.pods && eventsData.pods.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Server className="h-5 w-5" />
                  Pod Status
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {eventsData.pods.map((pod) => (
                    <div key={pod.name} className="border rounded-lg p-4">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          {pod.ready ? (
                            <CheckCircle2 className="h-5 w-5 text-green-500" />
                          ) : (
                            <XCircle className="h-5 w-5 text-red-500" />
                          )}
                          <span className="font-mono text-sm">{pod.name}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant={pod.phase === 'Running' ? 'default' : 'secondary'}>
                            {pod.phase}
                          </Badge>
                          {pod.restarts > 0 && (
                            <Badge variant="outline">
                              {pod.restarts} restart{pod.restarts > 1 ? 's' : ''}
                            </Badge>
                          )}
                        </div>
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm text-muted-foreground">
                        {pod.podIP && (
                          <div>
                            <span className="font-medium">IP:</span> {pod.podIP}
                          </div>
                        )}
                        {pod.nodeName && (
                          <div>
                            <span className="font-medium">Node:</span> {pod.nodeName}
                          </div>
                        )}
                        {pod.startTime && (
                          <div>
                            <span className="font-medium">Started:</span> {timeAgo(pod.startTime)}
                          </div>
                        )}
                      </div>
                      {/* Container statuses */}
                      {pod.containerStatuses.map((cs) => (
                        <div key={cs.name} className="mt-2 pl-4 border-l-2 border-muted">
                          <div className="flex items-center gap-2 text-sm">
                            {cs.ready ? (
                              <CheckCircle2 className="h-4 w-4 text-green-500" />
                            ) : (
                              <XCircle className="h-4 w-4 text-red-500" />
                            )}
                            <span className="font-mono">{cs.name}</span>
                            <Badge variant="outline" className="text-xs">{cs.state}</Badge>
                          </div>
                          {cs.stateReason && (
                            <p className="text-xs text-muted-foreground mt-1">
                              {cs.stateReason}: {cs.stateMessage}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Kubernetes Events */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="h-5 w-5" />
                Kubernetes Events
              </CardTitle>
              <CardDescription>
                Deployment and pod events from the cluster
              </CardDescription>
            </CardHeader>
            <CardContent>
              {!eventsData?.events || eventsData.events.length === 0 ? (
                <p className="text-sm text-muted-foreground">No events found</p>
              ) : (
                <div className="space-y-2 max-h-[400px] overflow-y-auto">
                  {eventsData.events.map((event, idx) => (
                    <div
                      key={idx}
                      className={`flex items-start gap-3 p-3 rounded-lg border ${event.type === 'Warning' ? 'border-yellow-500/30 bg-yellow-500/5' : 'border-muted'
                        }`}
                    >
                      {event.type === 'Warning' ? (
                        <AlertTriangle className="h-4 w-4 text-yellow-500 mt-0.5 flex-shrink-0" />
                      ) : (
                        <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <Badge variant={event.type === 'Warning' ? 'outline' : 'secondary'} className="text-xs">
                            {event.reason}
                          </Badge>
                          {event.count > 1 && (
                            <span className="text-xs text-muted-foreground">
                              ×{event.count}
                            </span>
                          )}
                          <span className="text-xs text-muted-foreground ml-auto">
                            {timeAgo(event.lastTimestamp)}
                          </span>
                        </div>
                        <p className="text-sm break-words">{event.message}</p>
                        {event.source && (
                          <p className="text-xs text-muted-foreground mt-1">{event.source}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Container Logs */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Container Logs
              </CardTitle>
              <CardDescription>
                {logsData?.tailLines ? `Last ${logsData.tailLines} lines` : 'Live container output'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {logsData?.error ? (
                <div className="text-sm text-muted-foreground p-4 bg-muted rounded-lg">
                  {logsData.error}
                </div>
              ) : !logsData?.lines || logsData.lines.length === 0 ? (
                <div className="text-sm text-muted-foreground p-4 bg-muted rounded-lg">
                  No logs available. The container may still be starting...
                </div>
              ) : (
                <div className="bg-zinc-950 text-zinc-100 p-4 rounded-lg font-mono text-xs max-h-[500px] overflow-y-auto">
                  {logsData.lines.map((line, idx) => (
                    <div key={idx} className="flex gap-2 hover:bg-zinc-900 py-0.5">
                      {line.timestamp && (
                        <span className="text-zinc-500 flex-shrink-0 select-none">
                          {new Date(line.timestamp).toLocaleTimeString()}
                        </span>
                      )}
                      <span className="break-all whitespace-pre-wrap">{line.message}</span>
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

          {/* Model Router Configuration */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5" />
                Model Router
              </CardTitle>
              <CardDescription>
                LLM access configuration and authentication
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {agent.model_router_service_uuid ? (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-muted-foreground">Status</p>
                      <Badge variant={agent.model_router_token_revoked ? 'destructive' : 'default'}>
                        {agent.model_router_token_revoked ? 'Revoked' : 'Active'}
                      </Badge>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Token Issued</p>
                      <p className="text-sm">
                        {agent.model_router_token_issued_at
                          ? formatDate(agent.model_router_token_issued_at)
                          : 'N/A'}
                      </p>
                    </div>
                  </div>

                  {agent.model_router_token && !agent.model_router_token_revoked && (
                    <div className="flex items-center gap-2 p-3 bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-900 rounded-md">
                      <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-500" />
                      <p className="text-sm text-green-800 dark:text-green-400">
                        Agent has valid authentication token for Model Router
                      </p>
                    </div>
                  )}

                  {agent.model_router_token_revoked && (
                    <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900 rounded-md">
                      <XCircle className="h-4 w-4 text-red-600 dark:text-red-500" />
                      <p className="text-sm text-red-800 dark:text-red-400">
                        Token has been revoked. Agent cannot access LLM services.
                      </p>
                    </div>
                  )}
                </>
              ) : (
                <div className="flex items-center gap-2 p-3 bg-yellow-50 dark:bg-yellow-950/20 border border-yellow-200 dark:border-yellow-900 rounded-md">
                  <AlertTriangle className="h-4 w-4 text-yellow-600 dark:text-yellow-500" />
                  <p className="text-sm text-yellow-800 dark:text-yellow-400">
                    No model router assigned. Agent cannot access LLM services.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
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
