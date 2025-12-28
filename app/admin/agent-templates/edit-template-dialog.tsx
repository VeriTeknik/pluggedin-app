'use client';

import { useState } from 'react';
import { Download, Loader2, Pencil } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
import { useToast } from '@/hooks/use-toast';

import { fetchDockerImageVersions, updateAgentTemplate } from './actions';

interface EditTemplateDialogProps {
  templateId: string;
  currentVersion: string;
  currentDockerImage: string;
  templateName: string;
}

interface DockerTag {
  name: string;
  updated_at: string;
}

export function EditTemplateDialog({
  templateId,
  currentVersion,
  currentDockerImage,
  templateName,
}: EditTemplateDialogProps) {
  const [open, setOpen] = useState(false);
  const [version, setVersion] = useState(currentVersion);
  const [dockerImage, setDockerImage] = useState(currentDockerImage);
  const [loading, setLoading] = useState(false);
  const [fetchingVersions, setFetchingVersions] = useState(false);
  const [availableTags, setAvailableTags] = useState<DockerTag[]>([]);
  const { toast } = useToast();

  const handleFetchVersions = async () => {
    setFetchingVersions(true);
    try {
      const result = await fetchDockerImageVersions(currentDockerImage);
      if (result.success && result.data) {
        setAvailableTags(result.data);
        toast({
          title: 'Versions fetched',
          description: `Found ${result.data.length} available tags`,
        });
      } else {
        toast({
          title: 'Failed to fetch versions',
          description: result.error || 'Could not fetch versions from registry',
          variant: 'destructive',
        });
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'An unexpected error occurred',
        variant: 'destructive',
      });
    } finally {
      setFetchingVersions(false);
    }
  };

  const handleTagSelect = (tag: string) => {
    // Update docker image with the selected tag
    const baseImage = currentDockerImage.split(':')[0];
    setDockerImage(`${baseImage}:${tag}`);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const result = await updateAgentTemplate(templateId, {
        version: version !== currentVersion ? version : undefined,
        dockerImage: dockerImage !== currentDockerImage ? dockerImage : undefined,
      });

      if (result.success) {
        toast({
          title: 'Template updated',
          description: `Successfully updated ${templateName}`,
        });
        setOpen(false);
      } else {
        toast({
          title: 'Update failed',
          description: result.error || 'Failed to update template',
          variant: 'destructive',
        });
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'An unexpected error occurred',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8">
          <Pencil className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[525px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Edit Template Version</DialogTitle>
            <DialogDescription>
              Update the version and docker image for {templateName}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="version">Version</Label>
              <Input
                id="version"
                value={version}
                onChange={(e) => setVersion(e.target.value)}
                placeholder="1.0.0"
                required
              />
              <p className="text-sm text-muted-foreground">
                Semantic version (e.g., 1.0.0, 1.1.0)
              </p>
            </div>
            <div className="grid gap-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="dockerImage">Docker Image</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleFetchVersions}
                  disabled={fetchingVersions || !currentDockerImage.includes('ghcr.io')}
                >
                  {fetchingVersions ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Fetching...
                    </>
                  ) : (
                    <>
                      <Download className="mr-2 h-4 w-4" />
                      Fetch Versions
                    </>
                  )}
                </Button>
              </div>
              {availableTags.length > 0 && (
                <div className="grid gap-2">
                  <Label htmlFor="tagSelect">Available Tags from Registry</Label>
                  <Select onValueChange={handleTagSelect}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a tag" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableTags.map((tag) => (
                        <SelectItem key={tag.name} value={tag.name}>
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-mono">{tag.name}</span>
                            <span className="text-xs text-muted-foreground">
                              {new Date(tag.updated_at).toLocaleDateString()}
                            </span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <Input
                id="dockerImage"
                value={dockerImage}
                onChange={(e) => setDockerImage(e.target.value)}
                placeholder="ghcr.io/veriteknik/compass-agent:latest"
                required
              />
              <p className="text-sm text-muted-foreground">
                Full docker image path with tag (e.g., :latest, :v1.0.0)
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Updating...' : 'Update Template'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
