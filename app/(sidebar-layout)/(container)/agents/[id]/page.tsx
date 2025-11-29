'use client';

import { Activity, ArrowLeft, Download, Server, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
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
  mode: string;
  uptime_seconds: number;
  timestamp: string;
}

interface Metric {
  cpu_percent: number;
  memory_mb: number;
  requests_handled: number;
  timestamp: string;
}

const fetcher = async (url: string) => {
  const response = await fetch(url);
  if (!response.ok) throw new Error('Failed to fetch');
  return response.json();
};

export default function AgentDetailPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const { data: agent, error, isLoading } = useSWR<Agent>(`/api/agents/${params.id}`, fetcher);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const { toast } = useToast();

  const handleDelete = async () => {
    try {
      setIsDeleting(true);
      const response = await fetch(`/api/agents/${params.id}`, {
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
      const response = await fetch(`/api/agents/${params.id}/export`, {
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

        <TabsContent value="telemetry">
          <Card>
            <CardHeader>
              <CardTitle>Telemetry Data</CardTitle>
              <CardDescription>
                Heartbeats and metrics from the agent
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Telemetry data display coming soon. Use the Export feature to download full telemetry history.
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="deployment">
          <Card>
            <CardHeader>
              <CardTitle>Kubernetes Deployment</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <p className="text-sm text-muted-foreground">Namespace</p>
                <p className="font-mono text-sm">{agent.kubernetes_namespace || 'agents'}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Deployment Name</p>
                <p className="font-mono text-sm">{agent.kubernetes_deployment || agent.name}</p>
              </div>
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
