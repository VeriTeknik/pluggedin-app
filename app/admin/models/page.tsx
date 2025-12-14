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
import { useToast } from '@/hooks/use-toast';

type ModelProvider = 'openai' | 'anthropic' | 'google' | 'xai' | 'deepseek';

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
  sort_order: number;
  aliases: string[] | null;
  description: string | null;
  release_date: string | null;
  deprecated_at: string | null;
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

  const fetchModels = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/models');
      if (!res.ok) throw new Error('Failed to fetch models');
      const data = await res.json();
      setModels(data.models);
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

  useEffect(() => {
    fetchModels();
  }, [fetchModels]);

  const toggleEnabled = async (model: AIModel) => {
    try {
      const res = await fetch(`/api/admin/models/${model.uuid}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_enabled: !model.is_enabled }),
      });
      if (!res.ok) throw new Error('Failed to update model');
      await fetchModels();
      toast({
        title: 'Success',
        description: `Model ${model.is_enabled ? 'disabled' : 'enabled'}`,
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
      toast({
        title: 'Success',
        description: `${model.display_name} set as default`,
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to set default model',
        variant: 'destructive',
      });
    }
  };

  const saveModel = async () => {
    if (!editingModel) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/models/${editingModel.uuid}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
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
      toast({
        title: 'Success',
        description: 'Model updated successfully',
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
      toast({
        title: 'Success',
        description: 'Model created successfully',
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
      toast({
        title: 'Success',
        description: 'Model deprecated',
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

  return (
    <div className="container mx-auto py-8 px-4">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold">Model Management</h1>
          <p className="text-muted-foreground mt-2">
            Configure AI models, pricing, and availability
          </p>
        </div>
        <Button onClick={() => setIsAddDialogOpen(true)}>+ Add Model</Button>
      </div>

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
    </div>
  );
}
