'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';

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
import { Textarea } from '@/components/ui/textarea';

import { createCluster, updateCluster } from '../actions';

type ClusterStatus = 'ACTIVE' | 'INACTIVE' | 'MAINTENANCE';

type Cluster = {
  uuid: string;
  cluster_id: string;
  name: string;
  description: string | null;
  collector_url: string | null;
  status: ClusterStatus | null;
};

type ClusterFormProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cluster: Cluster | null;
  onSuccess: () => void;
};

export function ClusterForm({ open, onOpenChange, cluster, onSuccess }: ClusterFormProps) {
  const isEditing = !!cluster;
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState<{
    cluster_id: string;
    name: string;
    description: string;
    collector_url: string;
    status: ClusterStatus;
  }>({
    cluster_id: cluster?.cluster_id || '',
    name: cluster?.name || '',
    description: cluster?.description || '',
    collector_url: cluster?.collector_url || '',
    status: cluster?.status || 'ACTIVE',
  });

  // Reset form when cluster changes
  useEffect(() => {
    if (cluster) {
      setFormData({
        cluster_id: cluster.cluster_id,
        name: cluster.name,
        description: cluster.description || '',
        collector_url: cluster.collector_url || '',
        status: cluster.status || 'ACTIVE',
      });
    } else {
      setFormData({
        cluster_id: '',
        name: '',
        description: '',
        collector_url: '',
        status: 'ACTIVE',
      });
    }
  }, [cluster]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    try {
      let result;

      if (isEditing) {
        result = await updateCluster({
          uuid: cluster.uuid,
          ...formData,
        });
      } else {
        result = await createCluster(formData);
      }

      if (result.success) {
        toast.success(isEditing ? 'Cluster updated successfully' : 'Cluster created successfully');
        onSuccess();
        onOpenChange(false);
        // Reset form
        setFormData({
          cluster_id: '',
          name: '',
          description: '',
          collector_url: '',
          status: 'ACTIVE',
        });
      } else {
        toast.error(result.error || 'An error occurred');
      }
    } catch (error) {
      toast.error('An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{isEditing ? 'Edit Cluster' : 'Add New Cluster'}</DialogTitle>
            <DialogDescription>
              {isEditing
                ? 'Update the cluster configuration.'
                : 'Register a new PAP cluster with its heartbeat collector.'}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="cluster_id">Cluster ID</Label>
              <Input
                id="cluster_id"
                placeholder="e.g., is.plugged.in, prod-us-east"
                value={formData.cluster_id}
                onChange={(e) => setFormData({ ...formData, cluster_id: e.target.value })}
                disabled={isEditing}
                required
              />
              <p className="text-xs text-muted-foreground">
                Unique identifier for the cluster. Cannot be changed after creation.
              </p>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                placeholder="e.g., Production Cluster"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                placeholder="Optional description of the cluster"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                rows={2}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="collector_url">Collector URL</Label>
              <Input
                id="collector_url"
                type="url"
                placeholder="e.g., https://collector.is.plugged.in"
                value={formData.collector_url}
                onChange={(e) => setFormData({ ...formData, collector_url: e.target.value })}
              />
              <p className="text-xs text-muted-foreground">
                URL of the PAP heartbeat collector for this cluster.
              </p>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="status">Status</Label>
              <Select
                value={formData.status}
                onValueChange={(value) => setFormData({ ...formData, status: value as ClusterStatus })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ACTIVE">Active</SelectItem>
                  <SelectItem value="INACTIVE">Inactive</SelectItem>
                  <SelectItem value="MAINTENANCE">Maintenance</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Saving...' : isEditing ? 'Update Cluster' : 'Create Cluster'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
