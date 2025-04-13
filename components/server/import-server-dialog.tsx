'use client';

import { Download } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

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
import { useToast } from '@/components/ui/use-toast';
import { McpServer } from '@/types/mcp-server';
import { SharedMcpServer } from '@/types/social';

interface ImportServerDialogProps {
  sharedServer: SharedMcpServer;
  onImport: (server: McpServer, name: string) => Promise<{ success: boolean; error?: string }>;
  variant?: 'default' | 'outline' | 'secondary' | 'ghost';
  size?: 'default' | 'sm' | 'lg' | 'icon';
  children?: React.ReactNode;
}

export function ImportServerDialog({
  sharedServer,
  onImport,
  variant = 'default',
  size = 'sm',
  children,
}: ImportServerDialogProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [serverName, setServerName] = useState(sharedServer.title);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleImport = async () => {
    if (!serverName.trim()) {
      toast({
        title: 'Error',
        description: 'Please provide a name for the server',
        variant: 'destructive',
      });
      return;
    }

    // Prefer using the template if available
    const serverData = sharedServer.template && Object.keys(sharedServer.template).length > 0
      ? sharedServer.template
      : sharedServer.server;

    if (!serverData) {
      toast({
        title: 'Error',
        description: 'Server data is missing',
        variant: 'destructive',
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await onImport(serverData, serverName);

      if (result.success) {
        toast({
          title: 'Success',
          description: 'Server imported successfully',
        });
        setOpen(false);
        router.refresh();
      } else {
        throw new Error(result.error || 'Failed to import server');
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'An error occurred',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {children || (
          <Button variant={variant} size={size}>
            <Download className="h-4 w-4 mr-2" />
            Import
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Import MCP Server</DialogTitle>
          <DialogDescription>
            Import this MCP server to your workspace
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="serverName">Server Name</Label>
            <Input
              id="serverName"
              value={serverName}
              onChange={(e) => setServerName(e.target.value)}
              placeholder="Enter a name for this server"
              autoFocus
            />
          </div>
          
          <div className="space-y-2">
            <h4 className="text-sm font-medium">Server Information</h4>
            <div className="rounded-md bg-muted p-3">
              <p className="text-sm font-medium">{sharedServer.title}</p>
              <p className="text-xs text-muted-foreground mt-1">{sharedServer.description || 'No description provided'}</p>
              <div className="flex gap-2 mt-2">
                <p className="text-xs px-2 py-1 bg-primary/10 rounded-sm inline-block">
                  {sharedServer.server?.type}
                </p>
                <p className="text-xs px-2 py-1 bg-primary/10 rounded-sm inline-block">
                  Shared by {sharedServer.profile?.name || 'Unknown'}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-amber-50 dark:bg-amber-950 p-2 rounded-md mt-2">
            <p className="text-xs text-amber-800 dark:text-amber-300">
              Note: You may need to update environment variables or settings after importing this server.
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleImport}
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Importing...' : 'Import Server'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
} 