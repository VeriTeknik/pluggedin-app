'use client';

import { AlertCircle, CheckCircle2, Copy, Loader2, Play, RefreshCw, Star, StarOff } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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

type ModelProvider = 'openai' | 'anthropic' | 'google' | 'xai' | 'deepseek';

interface APIKeyStatus {
  provider: ModelProvider;
  configured: boolean;
  envVar: string;
  lastFourChars?: string;
}

interface AIModel {
  uuid: string;
  model_id: string;
  display_name: string;
  provider: ModelProvider;
  input_price: number;
  output_price: number;
  context_length: number;
  supports_streaming: boolean;
  supports_vision: boolean;
  supports_function_calling: boolean;
  is_enabled: boolean;
  is_default: boolean;
  is_featured: boolean;
  sort_order: number;
  aliases: string[] | null;
  description: string | null;
  release_date: string | null;
  deprecated_at: string | null;
  last_test_status: 'pass' | 'fail' | null;
  last_tested_at: string | null;
  created_at: string;
  updated_at: string;
}

const PROVIDERS: ModelProvider[] = ['openai', 'anthropic', 'google', 'xai', 'deepseek'];

const PROVIDER_COLORS: Record<ModelProvider, string> = {
  openai: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  anthropic: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
  google: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  xai: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
  deepseek: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200',
};

function formatPrice(price: number): string {
  return `$${price.toFixed(2)}`;
}

function formatContext(length: number): string {
  if (length >= 1000000) return `${(length / 1000000).toFixed(1)}M`;
  return `${(length / 1000).toFixed(0)}K`;
}

export default function AdminModelsPage() {
  const [models, setModels] = useState<AIModel[]>([]);
  const [apiKeys, setApiKeys] = useState<APIKeyStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [providerFilter, setProviderFilter] = useState<ModelProvider | 'all'>('all');
  const [editingModel, setEditingModel] = useState<AIModel | null>(null);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  // New model form state
  const [newModel, setNewModel] = useState({
    model_id: '',
    display_name: '',
    provider: 'openai' as ModelProvider,
    input_price: 0,
    output_price: 0,
    context_length: 128000,
    supports_vision: false,
    description: '',
  });

  // Test dialog state
  const [testingModel, setTestingModel] = useState<AIModel | null>(null);
  const [testQuery, setTestQuery] = useState('What is 2 + 2? Reply with just the number.');
  const [testResponse, setTestResponse] = useState('');
  const [testError, setTestError] = useState('');
  const [isTesting, setIsTesting] = useState(false);
  const [testMetrics, setTestMetrics] = useState<{
    responseTime?: number;
    inputTokens?: number;
    outputTokens?: number;
  } | null>(null);

  // Track test results per model (pass/fail status)
  const [testResults, setTestResults] = useState<Record<string, 'pass' | 'fail'>>({});

  // Sync to Model Router state
  const [isSyncing, setIsSyncing] = useState(false);

  const fetchModels = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/models');
      if (!res.ok) throw new Error('Failed to fetch models');
      const data = await res.json();
      setModels(data.models);

      // Load persisted test results from database
      const persistedResults: Record<string, 'pass' | 'fail'> = {};
      for (const model of data.models) {
        if (model.last_test_status) {
          persistedResults[model.uuid] = model.last_test_status;
        }
      }
      setTestResults(persistedResults);
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to load models',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  const fetchAPIKeys = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/api-keys');
      if (!res.ok) throw new Error('Failed to fetch API keys');
      const data = await res.json();
      setApiKeys(data.apiKeys);
    } catch (error) {
      console.error('Failed to load API keys:', error);
    }
  }, []);

  useEffect(() => {
    fetchModels();
    fetchAPIKeys();
  }, [fetchModels, fetchAPIKeys]);

  // Manual sync to Model Routers
  const syncToModelRouters = async () => {
    setIsSyncing(true);
    try {
      const res = await fetch('/api/model-router/sync', { method: 'POST' });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Sync failed');
      }

      if (data.failed_services?.length > 0) {
        toast({
          title: 'Partial Sync',
          description: `Synced ${data.synced_services} services. Failed: ${data.failed_services.map((s: { name: string }) => s.name).join(', ')}`,
          variant: 'default',
        });
      } else {
        toast({
          title: 'Sync Complete',
          description: `Successfully synced ${data.models_count} models to ${data.synced_services} Model Router service(s)`,
        });
      }
    } catch (error) {
      toast({
        title: 'Sync Failed',
        description: error instanceof Error ? error.message : 'Failed to sync models to Model Routers',
        variant: 'destructive',
      });
    } finally {
      setIsSyncing(false);
    }
  };

  const toggleEnabled = async (model: AIModel) => {
    try {
      const res = await fetch(`/api/admin/models/${model.uuid}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_enabled: !model.is_enabled }),
      });
      if (!res.ok) throw new Error('Failed to update model');
      await fetchModels();

      // Sync to Model Router services
      try {
        await fetch('/api/model-router/sync', { method: 'POST' });
      } catch (syncError) {
        console.error('Model Router sync failed:', syncError);
        // Don't block on sync failure - show warning toast
        toast({
          title: 'Warning',
          description: 'Model updated but sync to Model Router failed',
          variant: 'default',
        });
        return; // Skip success toast if sync failed
      }

      toast({
        title: 'Success',
        description: `Model ${model.is_enabled ? 'disabled' : 'enabled'} and synced to Model Router`,
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to update model',
        variant: 'destructive',
      });
    }
  };

  const setDefault = async (model: AIModel) => {
    try {
      const res = await fetch(`/api/admin/models/${model.uuid}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_default: true }),
      });
      if (!res.ok) throw new Error('Failed to update model');
      await fetchModels();

      // Sync to Model Router services
      try {
        await fetch('/api/model-router/sync', { method: 'POST' });
      } catch (syncError) {
        console.error('Model Router sync failed:', syncError);
        toast({
          title: 'Warning',
          description: 'Default set but sync to Model Router failed',
          variant: 'default',
        });
        return; // Skip success toast if sync failed
      }

      toast({
        title: 'Success',
        description: `${model.display_name} set as default and synced to Model Router`,
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to set default model',
        variant: 'destructive',
      });
    }
  };

  const toggleFeatured = async (model: AIModel) => {
    try {
      const res = await fetch(`/api/admin/models/${model.uuid}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_featured: !model.is_featured }),
      });
      if (!res.ok) throw new Error('Failed to update model');
      await fetchModels();

      // Sync to Model Router services
      try {
        await fetch('/api/model-router/sync', { method: 'POST' });
      } catch (syncError) {
        console.error('Model Router sync failed:', syncError);
        toast({
          title: 'Warning',
          description: 'Model updated but sync to Model Router failed',
          variant: 'default',
        });
        return;
      }

      toast({
        title: 'Success',
        description: `${model.display_name} ${model.is_featured ? 'removed from' : 'added to'} featured models`,
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to update model',
        variant: 'destructive',
      });
    }
  };

  const testModel = (model: AIModel) => {
    // Open test dialog
    setTestingModel(model);
    setTestResponse('');
    setTestError('');
    setTestMetrics(null);
  };

  // Helper to persist test status to database
  const saveTestStatus = async (modelUuid: string, status: 'pass' | 'fail') => {
    try {
      await fetch(`/api/admin/models/${modelUuid}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          last_test_status: status,
          last_tested_at: new Date().toISOString(),
        }),
      });
    } catch (error) {
      console.error('Failed to save test status:', error);
    }
  };

  const executeTest = async () => {
    if (!testingModel || !testQuery.trim()) return;

    setIsTesting(true);
    setTestResponse('');
    setTestError('');
    setTestMetrics(null);

    const startTime = Date.now();

    try {
      const res = await fetch('/api/model-router/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: testingModel.model_id,
          messages: [
            { role: 'user', content: testQuery }
          ],
          max_tokens: 500,
          temperature: 0.7,
        }),
      });

      const responseTime = Date.now() - startTime;

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error?.message || errorData.error || `HTTP ${res.status}: ${res.statusText}`);
      }

      const data = await res.json();

      // Extract response content
      const content = data.choices?.[0]?.message?.content || 'No response content';
      setTestResponse(content);

      // Extract metrics if available
      setTestMetrics({
        responseTime,
        inputTokens: data.usage?.prompt_tokens,
        outputTokens: data.usage?.completion_tokens,
      });

      // Mark test as passed (local state + database)
      setTestResults(prev => ({ ...prev, [testingModel.uuid]: 'pass' }));
      saveTestStatus(testingModel.uuid, 'pass');

    } catch (error) {
      setTestError(error instanceof Error ? error.message : 'Failed to test model');
      // Mark test as failed (local state + database)
      setTestResults(prev => ({ ...prev, [testingModel.uuid]: 'fail' }));
      saveTestStatus(testingModel.uuid, 'fail');
    } finally {
      setIsTesting(false);
    }
  };

  const closeTestDialog = () => {
    setTestingModel(null);
    setTestResponse('');
    setTestError('');
    setTestMetrics(null);
  };

  const saveModel = async () => {
    if (!editingModel) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/models/${editingModel.uuid}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model_id: editingModel.model_id,
          display_name: editingModel.display_name,
          input_price: editingModel.input_price,
          output_price: editingModel.output_price,
          context_length: editingModel.context_length,
          supports_vision: editingModel.supports_vision,
          description: editingModel.description,
          sort_order: editingModel.sort_order,
        }),
      });
      if (!res.ok) throw new Error('Failed to update model');
      await fetchModels();
      setEditingModel(null);

      // Sync to Model Router services
      try {
        await fetch('/api/model-router/sync', { method: 'POST' });
      } catch (syncError) {
        console.error('Model Router sync failed:', syncError);
        toast({
          title: 'Warning',
          description: 'Model updated but sync to Model Router failed',
          variant: 'default',
        });
        return; // Skip success toast if sync failed
      }

      toast({
        title: 'Success',
        description: 'Model updated and synced to Model Router',
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to save model',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const addModel = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/admin/models', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newModel),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to create model');
      }
      await fetchModels();
      setIsAddDialogOpen(false);
      setNewModel({
        model_id: '',
        display_name: '',
        provider: 'openai',
        input_price: 0,
        output_price: 0,
        context_length: 128000,
        supports_vision: false,
        description: '',
      });

      // Sync to Model Router services
      try {
        await fetch('/api/model-router/sync', { method: 'POST' });
      } catch (syncError) {
        console.error('Model Router sync failed:', syncError);
        toast({
          title: 'Warning',
          description: 'Model created but sync to Model Router failed',
          variant: 'default',
        });
        return; // Skip success toast if sync failed
      }

      toast({
        title: 'Success',
        description: 'Model created and synced to Model Router',
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to create model',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const deleteModel = async (model: AIModel) => {
    if (!confirm(`Are you sure you want to disable ${model.display_name}?`)) return;
    try {
      const res = await fetch(`/api/admin/models/${model.uuid}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Failed to delete model');
      await fetchModels();

      // Sync to Model Router services (remove deprecated model)
      try {
        await fetch('/api/model-router/sync', { method: 'POST' });
      } catch (syncError) {
        console.error('Model Router sync failed:', syncError);
        toast({
          title: 'Warning',
          description: 'Model deprecated but sync to Model Router failed',
          variant: 'default',
        });
        return; // Skip success toast if sync failed
      }

      toast({
        title: 'Success',
        description: 'Model deprecated and synced to Model Router',
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to delete model',
        variant: 'destructive',
      });
    }
  };

  const filteredModels = providerFilter === 'all'
    ? models
    : models.filter((m) => m.provider === providerFilter);

  if (loading) {
    return (
      <div className="container mx-auto py-8 px-4">
        <div className="text-center py-12">Loading models...</div>
      </div>
    );
  }

  const copyEnvVar = (envVar: string) => {
    navigator.clipboard.writeText(envVar);
    toast({
      title: 'Copied',
      description: `${envVar} copied to clipboard`,
    });
  };

  return (
    <div className="container mx-auto py-8 px-4">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold">Model Management</h1>
          <p className="text-muted-foreground mt-2">
            Configure AI models, pricing, and availability
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={syncToModelRouters}
            disabled={isSyncing}
          >
            {isSyncing ? (
              <>
                <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                Syncing...
              </>
            ) : (
              <>
                <RefreshCw className="mr-2 h-4 w-4" />
                Sync to Routers
              </>
            )}
          </Button>
          <Button onClick={() => setIsAddDialogOpen(true)}>+ Add Model</Button>
        </div>
      </div>

      {/* API Keys Status */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Provider API Keys</CardTitle>
          <CardDescription>
            Configure API keys in your environment variables (.env file). Server restart required after changes.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {apiKeys.map((key) => (
              <div
                key={key.provider}
                className="flex items-center justify-between p-4 border rounded-lg"
              >
                <div className="flex items-center gap-3">
                  {key.configured ? (
                    <CheckCircle2 className="h-5 w-5 text-green-600" />
                  ) : (
                    <AlertCircle className="h-5 w-5 text-orange-500" />
                  )}
                  <div>
                    <div className="font-medium capitalize">{key.provider}</div>
                    <div className="text-xs text-muted-foreground font-mono">
                      {key.configured ? `...${key.lastFourChars}` : 'Not configured'}
                    </div>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => copyEnvVar(key.envVar)}
                  title={`Copy ${key.envVar}`}
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
          <div className="mt-4 p-3 bg-muted rounded-md text-sm">
            <p className="font-medium mb-1">How to configure API keys:</p>
            <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
              <li>Click the copy icon to copy the environment variable name</li>
              <li>Add it to your .env file with your API key value</li>
              <li>Restart the server to apply changes</li>
            </ol>
          </div>
        </CardContent>
      </Card>

      {/* Provider Filter */}
      <div className="flex gap-2 mb-6">
        <Button
          variant={providerFilter === 'all' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setProviderFilter('all')}
        >
          All ({models.length})
        </Button>
        {PROVIDERS.map((provider) => {
          const count = models.filter((m) => m.provider === provider).length;
          return (
            <Button
              key={provider}
              variant={providerFilter === provider ? 'default' : 'outline'}
              size="sm"
              onClick={() => setProviderFilter(provider)}
            >
              {provider.charAt(0).toUpperCase() + provider.slice(1)} ({count})
            </Button>
          );
        })}
      </div>

      {/* Models Table */}
      <div className="border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Model</TableHead>
              <TableHead>Provider</TableHead>
              <TableHead className="text-right">Input/M</TableHead>
              <TableHead className="text-right">Output/M</TableHead>
              <TableHead className="text-right">Context</TableHead>
              <TableHead className="text-center">Vision</TableHead>
              <TableHead className="text-center">Enabled</TableHead>
              <TableHead className="text-center">Featured</TableHead>
              <TableHead className="text-center">Default</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredModels.map((model) => (
              <TableRow key={model.uuid} className={model.deprecated_at ? 'opacity-50' : ''}>
                <TableCell>
                  <div>
                    <div className="font-medium">{model.display_name}</div>
                    <div className="text-xs text-muted-foreground">{model.model_id}</div>
                  </div>
                </TableCell>
                <TableCell>
                  <Badge className={PROVIDER_COLORS[model.provider]}>
                    {model.provider}
                  </Badge>
                </TableCell>
                <TableCell className="text-right font-mono">
                  {formatPrice(model.input_price)}
                </TableCell>
                <TableCell className="text-right font-mono">
                  {formatPrice(model.output_price)}
                </TableCell>
                <TableCell className="text-right">
                  {formatContext(model.context_length)}
                </TableCell>
                <TableCell className="text-center">
                  {model.supports_vision ? '✓' : ''}
                </TableCell>
                <TableCell className="text-center">
                  <Switch
                    checked={model.is_enabled}
                    onCheckedChange={() => toggleEnabled(model)}
                  />
                </TableCell>
                <TableCell className="text-center">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => toggleFeatured(model)}
                    className={model.is_featured ? 'text-yellow-500 hover:text-yellow-600' : 'text-muted-foreground hover:text-yellow-500'}
                    title={model.is_featured ? 'Remove from featured' : 'Add to featured'}
                  >
                    {model.is_featured ? <Star className="h-4 w-4 fill-current" /> : <StarOff className="h-4 w-4" />}
                  </Button>
                </TableCell>
                <TableCell className="text-center">
                  {model.is_default ? (
                    <Badge variant="default">Default</Badge>
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setDefault(model)}
                      disabled={!model.is_enabled}
                    >
                      Set
                    </Button>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-1">
                    {/* Test status indicator */}
                    {testResults[model.uuid] === 'pass' && (
                      <span title="Test passed">
                        <CheckCircle2 className="h-4 w-4 text-green-600" />
                      </span>
                    )}
                    {testResults[model.uuid] === 'fail' && (
                      <span title="Test failed">
                        <AlertCircle className="h-4 w-4 text-red-600" />
                      </span>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => testModel(model)}
                      disabled={!model.is_enabled}
                      title="Test in Playground"
                      className="text-blue-600 hover:text-blue-700"
                    >
                      <Play className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setEditingModel(model)}
                    >
                      Edit
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-red-600"
                      onClick={() => deleteModel(model)}
                    >
                      Delete
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Edit Model Dialog */}
      <Dialog open={!!editingModel} onOpenChange={() => setEditingModel(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Model</DialogTitle>
            <DialogDescription>
              Update model configuration and pricing
            </DialogDescription>
          </DialogHeader>
          {editingModel && (
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label>Model ID</Label>
                <Input
                  value={editingModel.model_id}
                  onChange={(e) =>
                    setEditingModel({ ...editingModel, model_id: e.target.value })
                  }
                  placeholder="e.g., claude-sonnet-4-5-20241022"
                />
                <p className="text-xs text-muted-foreground">
                  The exact model identifier used by the provider&apos;s API
                </p>
              </div>
              <div className="grid gap-2">
                <Label>Display Name</Label>
                <Input
                  value={editingModel.display_name}
                  onChange={(e) =>
                    setEditingModel({ ...editingModel, display_name: e.target.value })
                  }
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label>Input Price ($/M tokens)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={editingModel.input_price}
                    onChange={(e) =>
                      setEditingModel({
                        ...editingModel,
                        input_price: parseFloat(e.target.value) || 0,
                      })
                    }
                  />
                </div>
                <div className="grid gap-2">
                  <Label>Output Price ($/M tokens)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={editingModel.output_price}
                    onChange={(e) =>
                      setEditingModel({
                        ...editingModel,
                        output_price: parseFloat(e.target.value) || 0,
                      })
                    }
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label>Context Length</Label>
                  <Input
                    type="number"
                    value={editingModel.context_length}
                    onChange={(e) =>
                      setEditingModel({
                        ...editingModel,
                        context_length: parseInt(e.target.value) || 0,
                      })
                    }
                  />
                </div>
                <div className="grid gap-2">
                  <Label>Sort Order</Label>
                  <Input
                    type="number"
                    value={editingModel.sort_order}
                    onChange={(e) =>
                      setEditingModel({
                        ...editingModel,
                        sort_order: parseInt(e.target.value) || 0,
                      })
                    }
                  />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={editingModel.supports_vision}
                  onCheckedChange={(checked) =>
                    setEditingModel({ ...editingModel, supports_vision: checked })
                  }
                />
                <Label>Supports Vision</Label>
              </div>
              <div className="grid gap-2">
                <Label>Description</Label>
                <Input
                  value={editingModel.description || ''}
                  onChange={(e) =>
                    setEditingModel({ ...editingModel, description: e.target.value })
                  }
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingModel(null)}>
              Cancel
            </Button>
            <Button onClick={saveModel} disabled={saving}>
              {saving ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Model Dialog */}
      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add New Model</DialogTitle>
            <DialogDescription>
              Add a new AI model to the system
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>Model ID *</Label>
              <Input
                placeholder="e.g., gpt-4o-mini"
                value={newModel.model_id}
                onChange={(e) =>
                  setNewModel({ ...newModel, model_id: e.target.value })
                }
              />
            </div>
            <div className="grid gap-2">
              <Label>Display Name *</Label>
              <Input
                placeholder="e.g., GPT-4o Mini"
                value={newModel.display_name}
                onChange={(e) =>
                  setNewModel({ ...newModel, display_name: e.target.value })
                }
              />
            </div>
            <div className="grid gap-2">
              <Label>Provider *</Label>
              <Select
                value={newModel.provider}
                onValueChange={(value: ModelProvider) =>
                  setNewModel({ ...newModel, provider: value })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PROVIDERS.map((p) => (
                    <SelectItem key={p} value={p}>
                      {p.charAt(0).toUpperCase() + p.slice(1)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Input Price ($/M) *</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={newModel.input_price}
                  onChange={(e) =>
                    setNewModel({
                      ...newModel,
                      input_price: parseFloat(e.target.value) || 0,
                    })
                  }
                />
              </div>
              <div className="grid gap-2">
                <Label>Output Price ($/M) *</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={newModel.output_price}
                  onChange={(e) =>
                    setNewModel({
                      ...newModel,
                      output_price: parseFloat(e.target.value) || 0,
                    })
                  }
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label>Context Length</Label>
              <Input
                type="number"
                value={newModel.context_length}
                onChange={(e) =>
                  setNewModel({
                    ...newModel,
                    context_length: parseInt(e.target.value) || 128000,
                  })
                }
              />
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={newModel.supports_vision}
                onCheckedChange={(checked) =>
                  setNewModel({ ...newModel, supports_vision: checked })
                }
              />
              <Label>Supports Vision</Label>
            </div>
            <div className="grid gap-2">
              <Label>Description</Label>
              <Input
                placeholder="Brief description of the model"
                value={newModel.description}
                onChange={(e) =>
                  setNewModel({ ...newModel, description: e.target.value })
                }
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={addModel}
              disabled={saving || !newModel.model_id || !newModel.display_name}
            >
              {saving ? 'Creating...' : 'Create Model'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Test Model Dialog */}
      <Dialog open={!!testingModel} onOpenChange={closeTestDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Play className="h-5 w-5 text-blue-600" />
              Test Model
            </DialogTitle>
            <DialogDescription asChild>
              <div className="flex items-center gap-2 mt-1">
                {testingModel && (
                  <>
                    <Badge className={PROVIDER_COLORS[testingModel.provider]}>
                      {testingModel.provider}
                    </Badge>
                    <span className="font-medium">{testingModel.display_name}</span>
                    <span className="text-xs text-muted-foreground">({testingModel.model_id})</span>
                  </>
                )}
              </div>
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Query Input */}
            <div className="space-y-2">
              <Label htmlFor="test-query">Test Query</Label>
              <Textarea
                id="test-query"
                value={testQuery}
                onChange={(e) => setTestQuery(e.target.value)}
                placeholder="Enter your test query..."
                rows={3}
                disabled={isTesting}
              />
            </div>

            {/* Test Button */}
            <Button
              onClick={executeTest}
              disabled={isTesting || !testQuery.trim()}
              className="w-full"
            >
              {isTesting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Testing...
                </>
              ) : (
                <>
                  <Play className="mr-2 h-4 w-4" />
                  Send Test Query
                </>
              )}
            </Button>

            {/* Error Display */}
            {testError && (
              <div className="p-4 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg">
                <div className="flex items-start gap-2">
                  <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium text-red-800 dark:text-red-200">Test Failed</p>
                    <p className="text-sm text-red-600 dark:text-red-400 mt-1">{testError}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Response Display */}
            {testResponse && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Response</Label>
                  {testMetrics && (
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      {testMetrics.responseTime && (
                        <span className="flex items-center gap-1">
                          <CheckCircle2 className="h-3 w-3 text-green-500" />
                          {testMetrics.responseTime}ms
                        </span>
                      )}
                      {testMetrics.inputTokens !== undefined && (
                        <span>In: {testMetrics.inputTokens}</span>
                      )}
                      {testMetrics.outputTokens !== undefined && (
                        <span>Out: {testMetrics.outputTokens}</span>
                      )}
                    </div>
                  )}
                </div>
                <div className="p-4 bg-muted rounded-lg">
                  <pre className="whitespace-pre-wrap text-sm font-mono">{testResponse}</pre>
                </div>
              </div>
            )}

            {/* Quick Test Prompts */}
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Quick Test Prompts</Label>
              <div className="flex flex-wrap gap-2">
                {[
                  'What is 2 + 2? Reply with just the number.',
                  'Say "Hello World" in 5 different programming languages.',
                  'Explain quantum computing in one sentence.',
                  'Write a haiku about programming.',
                ].map((prompt, idx) => (
                  <Button
                    key={idx}
                    variant="outline"
                    size="sm"
                    className="text-xs h-auto py-1.5 px-2"
                    onClick={() => setTestQuery(prompt)}
                    disabled={isTesting}
                  >
                    {prompt.slice(0, 30)}...
                  </Button>
                ))}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={closeTestDialog}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
