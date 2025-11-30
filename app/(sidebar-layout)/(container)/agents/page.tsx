'use client';

import { Activity, Archive, Plus, Server, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';

// Reserved agent names that cannot be used (must match backend)
const RESERVED_AGENT_NAMES = new Set([
  'api', 'app', 'www', 'web', 'mail', 'smtp', 'imap', 'pop', 'ftp', 'ssh', 'dns',
  'ns', 'ns1', 'ns2', 'ns3', 'mx', 'mx1', 'mx2', 'vpn', 'proxy', 'gateway', 'gw',
  'admin', 'administrator', 'root', 'system', 'sysadmin', 'webmaster', 'postmaster',
  'hostmaster', 'support', 'help', 'info', 'contact', 'sales', 'billing',
  'kubernetes', 'k8s', 'kube', 'cluster', 'node', 'pod', 'service', 'ingress',
  'traefik', 'nginx', 'envoy', 'istio', 'linkerd',
  'pap', 'station', 'satellite', 'control', 'control-plane', 'registry',
  'hub', 'gateway', 'proxy', 'mcp', 'hooks', 'telemetry', 'metrics', 'heartbeat',
  'pluggedin', 'plugged', 'is', 'a', 'focus', 'memory', 'demo', 'test', 'staging',
  'production', 'prod', 'dev', 'development', 'sandbox', 'preview',
  'localhost', 'local', 'internal', 'private', 'public', 'static', 'assets', 'cdn',
  'status', 'health', 'healthz', 'ready', 'readyz', 'live', 'livez',
  'auth', 'login', 'logout', 'signup', 'register', 'oauth', 'sso', 'callback',
  'default', 'null', 'undefined', 'void', 'none', 'empty', 'blank',
]);

// Validate agent name and return error message if invalid
function validateAgentName(name: string): string | null {
  const normalized = name.toLowerCase().trim();

  if (!normalized) {
    return null; // Empty is okay, will be caught by disabled button
  }

  if (normalized.length < 2) {
    return 'Name must be at least 2 characters';
  }

  if (normalized.length > 63) {
    return 'Name must be 63 characters or less';
  }

  const dnsNameRegex = /^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/;
  if (!dnsNameRegex.test(normalized)) {
    if (/[A-Z]/.test(name)) {
      return 'Name will be converted to lowercase';
    }
    if (/^-/.test(normalized) || /-$/.test(normalized)) {
      return 'Name cannot start or end with a hyphen';
    }
    if (/[^a-z0-9-]/.test(normalized)) {
      return 'Only lowercase letters, numbers, and hyphens allowed';
    }
    return 'Invalid name format';
  }

  if (normalized.includes('--')) {
    return 'Name cannot contain consecutive hyphens';
  }

  if (RESERVED_AGENT_NAMES.has(normalized)) {
    return `'${normalized}' is a reserved name`;
  }

  return null;
}

interface Agent {
  uuid: string;
  name: string;
  dns_name: string;
  state: string;
  created_at: string;
  last_heartbeat_at?: string;
  metadata?: any;
}

const fetcher = async (url: string) => {
  const response = await fetch(url);
  if (!response.ok) throw new Error('Failed to fetch agents');
  return response.json();
};

export default function AgentsPage() {
  const { data: agents, error, isLoading, mutate } = useSWR<Agent[]>('/api/agents', fetcher);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);

  // Filter out terminated and killed agents
  const activeAgents = useMemo(() => {
    if (!agents) return [];
    return agents.filter(agent => !['TERMINATED', 'KILLED'].includes(agent.state));
  }, [agents]);

  const archivedCount = useMemo(() => {
    if (!agents) return 0;
    return agents.filter(agent => ['TERMINATED', 'KILLED'].includes(agent.state)).length;
  }, [agents]);
  const [newAgentName, setNewAgentName] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [deleteAgentId, setDeleteAgentId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const { toast } = useToast();

  const handleCreateAgent = async () => {
    try {
      setIsCreating(true);
      const response = await fetch('/api/agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newAgentName }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to create agent');
      }

      await mutate();
      setIsCreateDialogOpen(false);
      setNewAgentName('');
      toast({
        title: 'Agent Created',
        description: `Agent "${newAgentName}" has been created and is being deployed.`,
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to create agent',
        variant: 'destructive',
      });
    } finally {
      setIsCreating(false);
    }
  };

  const handleDeleteAgent = async (agentId: string) => {
    try {
      setIsDeleting(true);
      const response = await fetch(`/api/agents/${agentId}`, {
        method: 'DELETE',
      });

      if (!response.ok) throw new Error('Failed to delete agent');

      await mutate();
      setDeleteAgentId(null);
      toast({
        title: 'Agent Deleted',
        description: 'Agent has been successfully deleted.',
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to delete agent',
        variant: 'destructive',
      });
    } finally {
      setIsDeleting(false);
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

  const getStateIcon = (state: string) => {
    if (state === 'ACTIVE') return <Activity className="h-4 w-4 text-green-500" />;
    if (state === 'PROVISIONED') return <Server className="h-4 w-4 text-blue-500" />;
    return <Server className="h-4 w-4 text-gray-400" />;
  };

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center">Loading agents...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center text-red-500">Failed to load agents</div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold">PAP Agents</h1>
          <p className="text-muted-foreground mt-1">
            Manage your autonomous agents with lifecycle control
          </p>
        </div>
        <div className="flex gap-2">
          {archivedCount > 0 && (
            <Button variant="outline" asChild>
              <Link href="/agents/archive">
                <Archive className="mr-2 h-4 w-4" />
                Archive ({archivedCount})
              </Link>
            </Button>
          )}
          <Button onClick={() => setIsCreateDialogOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Create Agent
          </Button>
        </div>
      </div>

      {activeAgents.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>No Active Agents</CardTitle>
            <CardDescription>
              {archivedCount > 0
                ? `You have ${archivedCount} archived agent(s). Create a new agent to get started.`
                : 'Create your first PAP agent to get started with autonomous operations.'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => setIsCreateDialogOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Create Your First Agent
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {activeAgents.map((agent) => (
            <Card key={agent.uuid} className="hover:shadow-lg transition-shadow">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    {getStateIcon(agent.state)}
                    <CardTitle className="text-lg">{agent.name}</CardTitle>
                  </div>
                  <Badge variant={getStateBadgeVariant(agent.state)}>
                    {agent.state}
                  </Badge>
                </div>
                <CardDescription className="font-mono text-xs">
                  {agent.dns_name}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Created:</span>
                    <span>{new Date(agent.created_at).toLocaleDateString()}</span>
                  </div>
                  {agent.last_heartbeat_at && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Last Heartbeat:</span>
                      <span>{new Date(agent.last_heartbeat_at).toLocaleTimeString()}</span>
                    </div>
                  )}
                </div>
                <div className="flex gap-2 mt-4">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    asChild
                  >
                    <Link href={`/agents/${agent.uuid}`}>
                      View Details
                    </Link>
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setDeleteAgentId(agent.uuid)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create Agent Dialog */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Agent</DialogTitle>
            <DialogDescription>
              Create a new PAP agent. The agent will be deployed to the Kubernetes cluster.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="name">Agent Name</Label>
              <Input
                id="name"
                placeholder="my-agent"
                value={newAgentName}
                onChange={(e) => setNewAgentName(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                maxLength={63}
                className={validateAgentName(newAgentName) ? 'border-destructive' : ''}
              />
              {validateAgentName(newAgentName) ? (
                <p className="text-xs text-destructive">
                  {validateAgentName(newAgentName)}
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Lowercase letters, numbers, and hyphens only (2-63 chars)
                </p>
              )}
              {newAgentName && !validateAgentName(newAgentName) && (
                <div className="text-xs bg-muted p-2 rounded font-mono">
                  DNS: {newAgentName.toLowerCase().trim()}.is.plugged.in
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsCreateDialogOpen(false)}
              disabled={isCreating}
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreateAgent}
              disabled={!newAgentName || !!validateAgentName(newAgentName) || isCreating}
            >
              {isCreating ? 'Creating...' : 'Create Agent'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteAgentId} onOpenChange={() => setDeleteAgentId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Agent</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this agent? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteAgentId(null)}
              disabled={isDeleting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteAgentId && handleDeleteAgent(deleteAgentId)}
              disabled={isDeleting}
            >
              {isDeleting ? 'Deleting...' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
