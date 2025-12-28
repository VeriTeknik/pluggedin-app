'use client';

import {
  Activity,
  Archive,
  BadgeCheck,
  Box,
  Download,
  Filter,
  Globe,
  Lock,
  Plus,
  Search,
  Server,
  ShoppingBag,
  Star,
  Tag,
  Trash2,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMemo, useState } from 'react';
import useSWR from 'swr';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import {
  type Agent,
  type AgentTemplate,
  fetcher,
  getStateBadgeVariant,
  isArchivedState,
  validateAgentName,
} from '@/lib/pap-ui-utils';

interface TemplatesResponse {
  templates: AgentTemplate[];
  total: number;
  limit: number;
  offset: number;
}

const CATEGORIES = [
  { value: 'all', label: 'All Categories' },
  { value: 'research', label: 'Research' },
  { value: 'productivity', label: 'Productivity' },
  { value: 'development', label: 'Development' },
  { value: 'communication', label: 'Communication' },
  { value: 'automation', label: 'Automation' },
];

export default function AgentsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialTab = searchParams.get('tab') || 'agents';

  const [activeTab, setActiveTab] = useState(initialTab);
  const { toast } = useToast();

  // Agents data
  const { data: agents, error: agentsError, isLoading: agentsLoading, mutate: mutateAgents } = useSWR('/api/agents', fetcher) as {
    data: Agent[] | undefined;
    error: any;
    isLoading: boolean;
    mutate: any;
  };

  // Marketplace data
  const [searchQuery, setSearchQuery] = useState(searchParams.get('search') || '');
  const [category, setCategory] = useState(searchParams.get('category') || 'all');
  const [showFeatured, setShowFeatured] = useState(searchParams.get('featured') === 'true');

  const queryUrl = useMemo(() => {
    const params = new URLSearchParams();
    if (searchQuery) params.set('search', searchQuery);
    if (category && category !== 'all') params.set('category', category);
    if (showFeatured) params.set('featured', 'true');
    params.set('limit', '50');
    return `/api/agents/templates?${params.toString()}`;
  }, [searchQuery, category, showFeatured]);

  const { data: templatesData, error: templatesError, isLoading: templatesLoading } = useSWR(
    activeTab === 'marketplace' ? queryUrl : null,
    fetcher
  ) as {
    data: TemplatesResponse | undefined;
    error: any;
    isLoading: boolean;
  };

  // Filter out terminated and killed agents using centralized helper
  const activeAgents = useMemo(() => {
    if (!agents) return [];
    return agents.filter(agent => !isArchivedState(agent.state));
  }, [agents]);

  const archivedCount = useMemo(() => {
    if (!agents) return 0;
    return agents.filter(agent => isArchivedState(agent.state)).length;
  }, [agents]);

  // Create agent dialog state
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [newAgentName, setNewAgentName] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [deleteAgentId, setDeleteAgentId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Cache validation result to avoid repeated calls (Comment 3 & 5)
  const nameValidationError = useMemo(() => validateAgentName(newAgentName), [newAgentName]);
  const isNameValid = !!newAgentName && !nameValidationError;

  const handleTabChange = (value: string) => {
    setActiveTab(value);
    const params = new URLSearchParams(searchParams.toString());
    params.set('tab', value);
    router.replace(`/agents?${params.toString()}`, { scroll: false });
  };

  const handleCreateAgent = async () => {
    try {
      setIsCreating(true);
      const response = await fetch('/api/agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newAgentName,
          image: 'ghcr.io/veriteknik/compass-agent:latest', // Default image for custom agents
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to create agent');
      }

      await mutateAgents();
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

      await mutateAgents();
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

  const handleMarketplaceSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const params = new URLSearchParams();
    params.set('tab', 'marketplace');
    if (searchQuery) params.set('search', searchQuery);
    if (category && category !== 'all') params.set('category', category);
    if (showFeatured) params.set('featured', 'true');
    router.push(`/agents?${params.toString()}`);
  };

  const getStateIcon = (state: string) => {
    if (state === 'ACTIVE') return <Activity className="h-4 w-4 text-green-500" />;
    if (state === 'PROVISIONED') return <Server className="h-4 w-4 text-blue-500" />;
    return <Server className="h-4 w-4 text-gray-400" />;
  };

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Header */}
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

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
        <TabsList className="mb-6">
          <TabsTrigger value="agents" className="flex items-center gap-2">
            <Server className="h-4 w-4" />
            My Agents
            {activeAgents.length > 0 && (
              <Badge variant="secondary" className="ml-1">{activeAgents.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="marketplace" className="flex items-center gap-2">
            <ShoppingBag className="h-4 w-4" />
            Marketplace
          </TabsTrigger>
        </TabsList>

        {/* My Agents Tab */}
        <TabsContent value="agents">
          {agentsLoading ? (
            <div className="text-center py-12">Loading agents...</div>
          ) : agentsError ? (
            <div className="text-center py-12 text-red-500">Failed to load agents</div>
          ) : activeAgents.length === 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>No Active Agents</CardTitle>
                <CardDescription>
                  {archivedCount > 0
                    ? `You have ${archivedCount} archived agent(s). Deploy from the marketplace or create a custom agent.`
                    : 'Deploy an agent from the marketplace or create a custom agent to get started.'}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex gap-2">
                <Button onClick={() => handleTabChange('marketplace')}>
                  <ShoppingBag className="mr-2 h-4 w-4" />
                  Browse Marketplace
                </Button>
                <Button variant="outline" onClick={() => setIsCreateDialogOpen(true)}>
                  <Plus className="mr-2 h-4 w-4" />
                  Create Custom Agent
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
                      <a
                        href={`https://${agent.dns_name}.is.plugged.in`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:underline text-blue-600 dark:text-blue-400"
                      >
                        {agent.dns_name}.is.plugged.in
                      </a>
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2 text-sm">
                      {(agent.metadata?.template_name as string | undefined) && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Template:</span>
                          <span className="text-xs font-mono">{agent.metadata?.template_name as string}</span>
                        </div>
                      )}
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Access:</span>
                        <span className="flex items-center gap-1">
                          {agent.access_level === 'PUBLIC' ? (
                            <>
                              <Globe className="h-3 w-3 text-green-500" />
                              <span className="text-green-600">Public</span>
                            </>
                          ) : (
                            <>
                              <Lock className="h-3 w-3 text-gray-500" />
                              <span>Private</span>
                            </>
                          )}
                        </span>
                      </div>
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
        </TabsContent>

        {/* Marketplace Tab */}
        <TabsContent value="marketplace">
          {/* Search and Filters */}
          <form onSubmit={handleMarketplaceSearch} className="flex gap-4 flex-wrap mb-6">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search agents..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="w-[180px]">
                <Filter className="mr-2 h-4 w-4" />
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((cat) => (
                  <SelectItem key={cat.value} value={cat.value}>
                    {cat.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              type="button"
              variant={showFeatured ? 'default' : 'outline'}
              onClick={() => setShowFeatured(!showFeatured)}
            >
              <Star className="mr-2 h-4 w-4" />
              Featured
            </Button>
            <Button type="submit">Search</Button>
          </form>

          {/* Results */}
          {templatesLoading ? (
            <div className="text-center py-12">
              <div className="animate-pulse">Loading templates...</div>
            </div>
          ) : templatesError ? (
            <div className="text-center py-12 text-red-500">
              Failed to load templates. Please try again.
            </div>
          ) : templatesData?.templates.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <Box className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">No Templates Found</h3>
                <p className="text-muted-foreground">
                  {searchQuery
                    ? `No results for "${searchQuery}". Try different search terms.`
                    : 'No templates available yet. Check back later!'}
                </p>
              </CardContent>
            </Card>
          ) : (
            <>
              <div className="text-sm text-muted-foreground mb-4">
                Showing {templatesData?.templates.length} of {templatesData?.total} templates
              </div>
              <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {templatesData?.templates.map((template) => (
                  <TemplateCard key={template.uuid} template={template} />
                ))}
              </div>
            </>
          )}
        </TabsContent>
      </Tabs>

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
                className={nameValidationError ? 'border-destructive' : ''}
              />
              {nameValidationError ? (
                <p className="text-xs text-destructive">
                  {nameValidationError}
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Lowercase letters, numbers, and hyphens only (2-63 chars)
                </p>
              )}
              {isNameValid && (
                <div className="text-xs bg-muted p-2 rounded font-mono">
                  DNS: {newAgentName}.is.plugged.in
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
              disabled={!isNameValid || isCreating}
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

function TemplateCard({ template }: { template: AgentTemplate }) {
  return (
    <Card className="hover:shadow-lg transition-shadow flex flex-col">
      <CardHeader>
        <div className="flex items-start gap-3">
          {template.icon_url ? (
            <img
              src={template.icon_url}
              alt={template.display_name}
              className="w-12 h-12 rounded-lg object-cover"
            />
          ) : (
            <div className="w-12 h-12 rounded-lg bg-muted flex items-center justify-center">
              <Box className="h-6 w-6 text-muted-foreground" />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <CardTitle className="text-lg truncate">
                {template.display_name}
              </CardTitle>
              {template.is_verified && (
                <BadgeCheck className="h-4 w-4 text-blue-500 flex-shrink-0" />
              )}
            </div>
            <CardDescription className="text-xs font-mono">
              {template.namespace}/{template.name}
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex-1">
        <p className="text-sm text-muted-foreground line-clamp-3 mb-3">
          {template.description}
        </p>
        <div className="flex flex-wrap gap-1">
          {template.is_featured && (
            <Badge variant="default" className="text-xs">
              <Star className="mr-1 h-3 w-3" />
              Featured
            </Badge>
          )}
          {template.category && (
            <Badge variant="outline" className="text-xs">
              {template.category}
            </Badge>
          )}
          {template.tags?.slice(0, 2).map((tag) => (
            <Badge key={tag} variant="secondary" className="text-xs">
              <Tag className="mr-1 h-3 w-3" />
              {tag}
            </Badge>
          ))}
        </div>
      </CardContent>
      <CardFooter className="flex justify-between items-center border-t pt-4">
        <div className="flex items-center text-sm text-muted-foreground">
          <Download className="mr-1 h-4 w-4" />
          {template.install_count} installs
        </div>
        <Button asChild>
          <Link href={`/agents/marketplace/${template.namespace}/${template.name}`}>
            View Details
          </Link>
        </Button>
      </CardFooter>
    </Card>
  );
}
