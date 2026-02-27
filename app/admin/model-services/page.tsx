'use client';

import { useCallback, useEffect, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
import { Switch } from '@/components/ui/switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';

type HealthStatus = 'healthy' | 'unhealthy' | 'degraded' | 'unknown';
type SyncStatus = 'synced' | 'pending' | 'partial' | 'failed';

interface ModelRouterService {
  uuid: string;
  name: string;
  url: string;
  region: string | null;
  health_endpoint: string;
  models_endpoint: string;
  sync_endpoint: string;
  metrics_endpoint: string;
  capabilities: string[] | null;
  auth_type: string;
  is_enabled: boolean;
  health_status: HealthStatus;
  last_health_check: string | null;
  last_health_error: string | null;
  avg_latency_ms: number | null;
  current_load_percent: number | null;
  priority: number;
  weight: number;
  last_model_sync: string | null;
  model_sync_status: SyncStatus;
  description: string | null;
  model_count?: number;
  enabled_model_count?: number;
  created_at: string;
  updated_at: string;
}

const HEALTH_STATUS_COLORS: Record<HealthStatus, string> = {
  healthy: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  unhealthy: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  degraded: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  unknown: 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200',
};

const HEALTH_STATUS_ICONS: Record<HealthStatus, string> = {
  healthy: '🟢',
  unhealthy: '🔴',
  degraded: '🟡',
  unknown: '⚪',
};

const SYNC_STATUS_COLORS: Record<SyncStatus, string> = {
  synced: 'bg-green-100 text-green-800',
  pending: 'bg-gray-100 text-gray-800',
  partial: 'bg-yellow-100 text-yellow-800',
  failed: 'bg-red-100 text-red-800',
};

const REGIONS = [
  { value: 'us-east', label: 'US East' },
  { value: 'us-west', label: 'US West' },
  { value: 'eu-west', label: 'EU West' },
  { value: 'eu-central', label: 'EU Central' },
  { value: 'asia-pacific', label: 'Asia Pacific' },
];

const CAPABILITIES = ['streaming', 'vision', 'function-calling'];

export default function AdminModelServicesPage() {
  const [services, setServices] = useState<ModelRouterService[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [editingService, setEditingService] = useState<ModelRouterService | null>(null);
  const [saving, setSaving] = useState(false);
  const [testingConnection, setTestingConnection] = useState<string | null>(null);
  const [syncing, setSyncing] = useState<string | null>(null);
  const { toast } = useToast();

  // New service form state
  const [newService, setNewService] = useState({
    name: '',
    url: '',
    region: '',
    capabilities: [] as string[],
    priority: 100,
    weight: 100,
    description: '',
    test_connection: true,
    auto_discover_models: true,
  });

  // Connection test result
  const [connectionTest, setConnectionTest] = useState<{
    success: boolean;
    latency_ms: number;
    models: string[] | null;
    error?: string;
  } | null>(null);

  const fetchServices = useCallback(async () => {
    try {
      const response = await fetch('/api/admin/model-services');
      if (!response.ok) throw new Error('Failed to fetch services');
      const data = await response.json();
      setServices(data.services);
    } catch (error) {
      console.error('Error fetching services:', error);
      toast({
        title: 'Error',
        description: 'Failed to load services',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchServices();
  }, [fetchServices]);

  const handleTestConnection = async (serviceId?: string) => {
    if (serviceId) {
      // Test existing service
      setTestingConnection(serviceId);
      try {
        const response = await fetch(`/api/admin/model-services/${serviceId}/test`, {
          method: 'POST',
        });
        const result = await response.json();

        if (result.success) {
          toast({
            title: 'Connection Successful',
            description: `Latency: ${result.latency_ms}ms`,
          });
        } else {
          toast({
            title: 'Connection Failed',
            description: result.error || 'Unknown error',
            variant: 'destructive',
          });
        }

        // Refresh services list
        fetchServices();
      } catch {
        toast({
          title: 'Error',
          description: 'Failed to test connection',
          variant: 'destructive',
        });
      } finally {
        setTestingConnection(null);
      }
    } else {
      // Test new service URL
      if (!newService.url) {
        toast({
          title: 'Error',
          description: 'Please enter a URL first',
          variant: 'destructive',
        });
        return;
      }

      setTestingConnection('new');
      setConnectionTest(null);

      try {
        // Create temporary service to test
        const response = await fetch('/api/admin/model-services', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...newService,
            name: newService.name || 'Test Service',
            test_connection: true,
          }),
        });

        const result = await response.json();

        if (response.ok) {
          setConnectionTest({
            success: true,
            latency_ms: result.connection_test?.latency_ms || 0,
            models: result.discovered_models || [],
          });

          // Service was created, close dialog and refresh
          toast({
            title: 'Service Created',
            description: `Connection successful (${result.connection_test?.latency_ms}ms)`,
          });
          setIsAddDialogOpen(false);
          resetNewService();
          fetchServices();
        } else {
          setConnectionTest({
            success: false,
            latency_ms: result.latency_ms || 0,
            models: null,
            error: result.details || result.error,
          });
        }
      } catch (error) {
        setConnectionTest({
          success: false,
          latency_ms: 0,
          models: null,
          error: error instanceof Error ? error.message : 'Connection failed',
        });
      } finally {
        setTestingConnection(null);
      }
    }
  };

  const handleSyncModels = async (serviceId: string) => {
    setSyncing(serviceId);
    try {
      const response = await fetch(`/api/admin/model-services/${serviceId}/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      const result = await response.json();

      if (response.ok) {
        toast({
          title: 'Models Synced',
          description: `${result.accepted.length} models synced${
            result.rejected.length > 0 ? `, ${result.rejected.length} rejected` : ''
          }`,
        });
        fetchServices();
      } else {
        toast({
          title: 'Sync Failed',
          description: result.error || 'Failed to sync models',
          variant: 'destructive',
        });
      }
    } catch {
      toast({
        title: 'Error',
        description: 'Failed to sync models',
        variant: 'destructive',
      });
    } finally {
      setSyncing(null);
    }
  };

  const handleToggleEnabled = async (service: ModelRouterService) => {
    try {
      const response = await fetch(`/api/admin/model-services/${service.uuid}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_enabled: !service.is_enabled }),
      });

      if (response.ok) {
        fetchServices();
        toast({
          title: service.is_enabled ? 'Service Disabled' : 'Service Enabled',
          description: service.name,
        });
      }
    } catch {
      toast({
        title: 'Error',
        description: 'Failed to update service',
        variant: 'destructive',
      });
    }
  };

  const handleDeleteService = async (service: ModelRouterService) => {
    if (!confirm(`Are you sure you want to delete "${service.name}"?`)) return;

    try {
      const response = await fetch(`/api/admin/model-services/${service.uuid}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        fetchServices();
        toast({
          title: 'Service Deleted',
          description: service.name,
        });
      }
    } catch {
      toast({
        title: 'Error',
        description: 'Failed to delete service',
        variant: 'destructive',
      });
    }
  };

  const handleSaveService = async () => {
    if (!editingService) return;

    setSaving(true);
    try {
      const response = await fetch(`/api/admin/model-services/${editingService.uuid}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editingService.name,
          url: editingService.url,
          region: editingService.region,
          capabilities: editingService.capabilities,
          priority: editingService.priority,
          weight: editingService.weight,
          description: editingService.description,
        }),
      });

      if (response.ok) {
        fetchServices();
        setEditingService(null);
        toast({
          title: 'Service Updated',
          description: editingService.name,
        });
      }
    } catch {
      toast({
        title: 'Error',
        description: 'Failed to update service',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const resetNewService = () => {
    setNewService({
      name: '',
      url: '',
      region: '',
      capabilities: [],
      priority: 100,
      weight: 100,
      description: '',
      test_connection: true,
      auto_discover_models: true,
    });
    setConnectionTest(null);
  };

  const formatTimestamp = (timestamp: string | null) => {
    if (!timestamp) return 'Never';
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h ago`;
    return `${Math.floor(diffMins / 1440)}d ago`;
  };

  if (loading) {
    return (
      <div className="container mx-auto py-8 px-4">
        <div className="text-center py-12">Loading services...</div>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8 px-4">
      <div className="mb-8 flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Model Router Services</h1>
          <p className="text-muted-foreground mt-2">
            Manage model router microservices for distributed LLM routing
          </p>
        </div>
        <Button onClick={() => setIsAddDialogOpen(true)}>+ Add Service</Button>
      </div>

      {services.length === 0 ? (
        <div className="text-center py-12 border rounded-lg bg-muted/20">
          <p className="text-muted-foreground mb-4">No services registered yet</p>
          <Button onClick={() => setIsAddDialogOpen(true)}>Add Your First Service</Button>
        </div>
      ) : (
        <div className="space-y-4">
          {services.map((service) => (
            <div
              key={service.uuid}
              className="border rounded-lg p-4 hover:bg-muted/5 transition-colors"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{HEALTH_STATUS_ICONS[service.health_status]}</span>
                  <div>
                    <h3 className="font-semibold text-lg">{service.name}</h3>
                    <p className="text-sm text-muted-foreground font-mono">{service.url}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={service.is_enabled}
                    onCheckedChange={() => handleToggleEnabled(service)}
                  />
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-2 text-sm">
                {service.region && (
                  <Badge variant="outline">
                    {REGIONS.find((r) => r.value === service.region)?.label || service.region}
                  </Badge>
                )}
                <Badge className={HEALTH_STATUS_COLORS[service.health_status]}>
                  {service.health_status}
                </Badge>
                <Badge className={SYNC_STATUS_COLORS[service.model_sync_status]}>
                  Sync: {service.model_sync_status}
                </Badge>
                {service.avg_latency_ms && (
                  <Badge variant="secondary">{service.avg_latency_ms}ms</Badge>
                )}
                {service.current_load_percent !== null && (
                  <Badge variant="secondary">Load: {service.current_load_percent}%</Badge>
                )}
                <Badge variant="secondary">
                  {service.enabled_model_count || 0}/{service.model_count || 0} models
                </Badge>
                {service.capabilities?.map((cap) => (
                  <Badge key={cap} variant="outline">
                    {cap}
                  </Badge>
                ))}
              </div>

              <div className="mt-4 flex justify-between items-center text-sm text-muted-foreground">
                <div className="flex gap-4">
                  <span>Last check: {formatTimestamp(service.last_health_check)}</span>
                  <span>Last sync: {formatTimestamp(service.last_model_sync)}</span>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleTestConnection(service.uuid)}
                    disabled={testingConnection === service.uuid}
                  >
                    {testingConnection === service.uuid ? 'Testing...' : 'Test'}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleSyncModels(service.uuid)}
                    disabled={syncing === service.uuid}
                  >
                    {syncing === service.uuid ? 'Syncing...' : 'Sync Models'}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setEditingService(service)}
                  >
                    Edit
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDeleteService(service)}
                  >
                    Delete
                  </Button>
                </div>
              </div>

              {service.last_health_error && (
                <div className="mt-2 text-sm text-red-600 bg-red-50 dark:bg-red-900/20 p-2 rounded">
                  Error: {service.last_health_error}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Add Service Dialog */}
      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Add Model Router Service</DialogTitle>
            <DialogDescription>
              Register a new model router microservice for LLM request routing.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                value={newService.name}
                onChange={(e) => setNewService({ ...newService, name: e.target.value })}
                placeholder="US East Router"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="url">URL</Label>
              <div className="flex gap-2">
                <Input
                  id="url"
                  value={newService.url}
                  onChange={(e) => setNewService({ ...newService, url: e.target.value })}
                  placeholder="https://models.example.com"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="region">Region</Label>
              <Select
                value={newService.region}
                onValueChange={(value) => setNewService({ ...newService, region: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select region" />
                </SelectTrigger>
                <SelectContent>
                  {REGIONS.map((region) => (
                    <SelectItem key={region.value} value={region.value}>
                      {region.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Capabilities</Label>
              <div className="flex flex-wrap gap-2">
                {CAPABILITIES.map((cap) => (
                  <Badge
                    key={cap}
                    variant={newService.capabilities.includes(cap) ? 'default' : 'outline'}
                    className="cursor-pointer"
                    onClick={() =>
                      setNewService({
                        ...newService,
                        capabilities: newService.capabilities.includes(cap)
                          ? newService.capabilities.filter((c) => c !== cap)
                          : [...newService.capabilities, cap],
                      })
                    }
                  >
                    {cap}
                  </Badge>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="priority">Priority</Label>
                <Input
                  id="priority"
                  type="number"
                  value={newService.priority}
                  onChange={(e) =>
                    setNewService({ ...newService, priority: parseInt(e.target.value) || 100 })
                  }
                />
                <p className="text-xs text-muted-foreground">Lower = higher priority</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="weight">Weight</Label>
                <Input
                  id="weight"
                  type="number"
                  value={newService.weight}
                  onChange={(e) =>
                    setNewService({ ...newService, weight: parseInt(e.target.value) || 100 })
                  }
                />
                <p className="text-xs text-muted-foreground">For load balancing</p>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={newService.description}
                onChange={(e) => setNewService({ ...newService, description: e.target.value })}
                placeholder="Optional description..."
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Switch
                  checked={newService.auto_discover_models}
                  onCheckedChange={(checked) =>
                    setNewService({ ...newService, auto_discover_models: checked })
                  }
                />
                <Label>Auto-discover models</Label>
              </div>
            </div>

            {connectionTest && (
              <div
                className={`p-3 rounded ${
                  connectionTest.success ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'
                }`}
              >
                {connectionTest.success ? (
                  <>
                    <p className="font-medium">Connection Successful ({connectionTest.latency_ms}ms)</p>
                    {connectionTest.models && connectionTest.models.length > 0 && (
                      <p className="text-sm mt-1">
                        Discovered {connectionTest.models.length} models
                      </p>
                    )}
                  </>
                ) : (
                  <p className="font-medium">Connection Failed: {connectionTest.error}</p>
                )}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => handleTestConnection()}
              disabled={testingConnection === 'new' || !newService.name || !newService.url}
            >
              {testingConnection === 'new' ? 'Testing & Creating...' : 'Add & Test Connection'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Service Dialog */}
      <Dialog open={!!editingService} onOpenChange={() => setEditingService(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Service</DialogTitle>
          </DialogHeader>

          {editingService && (
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="edit-name">Name</Label>
                <Input
                  id="edit-name"
                  value={editingService.name}
                  onChange={(e) =>
                    setEditingService({ ...editingService, name: e.target.value })
                  }
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="edit-url">URL</Label>
                <Input
                  id="edit-url"
                  value={editingService.url}
                  onChange={(e) =>
                    setEditingService({ ...editingService, url: e.target.value })
                  }
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="edit-region">Region</Label>
                <Select
                  value={editingService.region || ''}
                  onValueChange={(value) =>
                    setEditingService({ ...editingService, region: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select region" />
                  </SelectTrigger>
                  <SelectContent>
                    {REGIONS.map((region) => (
                      <SelectItem key={region.value} value={region.value}>
                        {region.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Capabilities</Label>
                <div className="flex flex-wrap gap-2">
                  {CAPABILITIES.map((cap) => (
                    <Badge
                      key={cap}
                      variant={
                        editingService.capabilities?.includes(cap) ? 'default' : 'outline'
                      }
                      className="cursor-pointer"
                      onClick={() =>
                        setEditingService({
                          ...editingService,
                          capabilities: editingService.capabilities?.includes(cap)
                            ? editingService.capabilities.filter((c) => c !== cap)
                            : [...(editingService.capabilities || []), cap],
                        })
                      }
                    >
                      {cap}
                    </Badge>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-priority">Priority</Label>
                  <Input
                    id="edit-priority"
                    type="number"
                    value={editingService.priority}
                    onChange={(e) =>
                      setEditingService({
                        ...editingService,
                        priority: parseInt(e.target.value) || 100,
                      })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-weight">Weight</Label>
                  <Input
                    id="edit-weight"
                    type="number"
                    value={editingService.weight}
                    onChange={(e) =>
                      setEditingService({
                        ...editingService,
                        weight: parseInt(e.target.value) || 100,
                      })
                    }
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="edit-description">Description</Label>
                <Textarea
                  id="edit-description"
                  value={editingService.description || ''}
                  onChange={(e) =>
                    setEditingService({ ...editingService, description: e.target.value })
                  }
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingService(null)}>
              Cancel
            </Button>
            <Button onClick={handleSaveService} disabled={saving}>
              {saving ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
