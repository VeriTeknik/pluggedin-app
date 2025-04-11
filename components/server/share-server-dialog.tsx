'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Share2, Check, Eye, AlertCircle } from 'lucide-react';

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
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/use-toast';
import { McpServer } from '@/types/mcp-server';
import { shareMcpServer, isServerShared, unshareServer } from '@/app/actions/social';
import { createShareableTemplate } from '@/app/actions/mcp-servers';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

interface ShareServerDialogProps {
  server: McpServer;
  profileUuid: string;
  variant?: 'default' | 'outline' | 'secondary' | 'ghost';
  size?: 'default' | 'sm' | 'lg' | 'icon';
  children?: React.ReactNode;
}

export function ShareServerDialog({
  server,
  profileUuid,
  variant = 'default',
  size = 'sm',
  children,
}: ShareServerDialogProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(server.name);
  const [description, setDescription] = useState(server.description || '');
  const [isPublic, setIsPublic] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isShared, setIsShared] = useState(false);
  const [isChecking, setIsChecking] = useState(true);
  const [sharedUuid, setSharedUuid] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [previewData, setPreviewData] = useState<any>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [editablePreviewData, setEditablePreviewData] = useState<any>(null);

  // Check if the server is already shared when component mounts
  useEffect(() => {
    async function checkIfShared() {
      try {
        setIsChecking(true);
        const result = await isServerShared(profileUuid, server.uuid);
        setIsShared(result.isShared);
        if (result.isShared && result.server) {
          setTitle(result.server.title);
          setDescription(result.server.description || '');
          setIsPublic(result.server.is_public);
          setSharedUuid(result.server.uuid);
        }
      } catch (error) {
        console.error('Error checking if server is shared:', error);
      } finally {
        setIsChecking(false);
      }
    }
    
    checkIfShared();
  }, [profileUuid, server.uuid, open]);

  // Reset preview when dialog closes
  useEffect(() => {
    if (!open) {
      setShowPreview(false);
      setPreviewData(null);
      setEditablePreviewData(null);
    }
  }, [open]);

  const handleShowPreview = async () => {
    setIsLoadingPreview(true);
    try {
      const sanitizedTemplate = await createShareableTemplate(server);
      setPreviewData(sanitizedTemplate);
      setEditablePreviewData(JSON.parse(JSON.stringify(sanitizedTemplate))); // Create a copy for editing
      setShowPreview(true);
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to generate preview. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsLoadingPreview(false);
    }
  };

  const handleEditValue = (path: string[], value: string) => {
    // Deep clone to avoid mutating state directly
    const updatedData = JSON.parse(JSON.stringify(editablePreviewData));
    
    // Navigate to the correct property using the path array
    let current = updatedData;
    for (let i = 0; i < path.length - 1; i++) {
      current = current[path[i]];
    }
    
    // Update the value
    current[path[path.length - 1]] = value;
    setEditablePreviewData(updatedData);
  };

  const handleRedactValue = (path: string[]) => {
    handleEditValue(path, '<REDACTED>');
  };

  const handleShare = async () => {
    // Use the manually edited data if we're in preview mode
    const dataToShare = showPreview ? editablePreviewData : null;
    
    if (!title.trim()) {
      toast({
        title: 'Error',
        description: 'Please provide a title for the shared server',
        variant: 'destructive',
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await shareMcpServer(
        profileUuid,
        server.uuid,
        title,
        description,
        isPublic,
        dataToShare // Pass the manually edited data
      );

      if (result.success) {
        toast({
          title: 'Success',
          description: 'Server shared successfully',
        });
        setIsShared(true);
        setSharedUuid(result.sharedServer?.uuid || null);
        setOpen(false);
        router.refresh();
      } else {
        throw new Error(result.error || 'Failed to share server');
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

  const handleUnshare = async () => {
    if (!sharedUuid) return;
    
    setIsSubmitting(true);
    try {
      const result = await unshareServer(profileUuid, sharedUuid);
      
      if (result.success) {
        toast({
          title: 'Success',
          description: 'Server unshared successfully',
        });
        setIsShared(false);
        setSharedUuid(null);
        router.refresh();
      } else {
        throw new Error(result.error || 'Failed to unshare server');
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
          <Button 
            variant={isShared ? "outline" : variant} 
            size={size}
            className={isShared ? "text-green-600" : ""}
          >
            {isShared ? (
              <>
                <Check className="h-4 w-4 mr-2" />
                Shared
              </>
            ) : (
              <>
                <Share2 className="h-4 w-4 mr-2" />
                Share
              </>
            )}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isShared ? 'Update Shared Server' : 'Share MCP Server'}</DialogTitle>
          <DialogDescription>
            {isShared 
              ? 'Update or remove this shared server from your profile'
              : 'Share this MCP server on your public profile'}
          </DialogDescription>
        </DialogHeader>
        
        {showPreview ? (
          <div className="grid gap-4 py-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium">Preview of Shared Data</h3>
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={() => setShowPreview(false)}
              >
                Back to Edit
              </Button>
            </div>
            
            <div className="bg-amber-50 dark:bg-amber-950 p-3 rounded-md">
              <div className="flex items-start space-x-2">
                <AlertCircle className="h-5 w-5 text-amber-600 dark:text-amber-400 mt-0.5" />
                <div className="text-xs text-amber-800 dark:text-amber-300">
                  <p className="font-medium">Important:</p>
                  <p>
                    This is what will be shared. You can edit or redact any sensitive 
                    information before sharing. Click on any value to edit it.
                  </p>
                </div>
              </div>
            </div>
            
            <Accordion type="single" collapsible className="w-full">
              {editablePreviewData && (
                <>
                  <AccordionItem value="command">
                    <AccordionTrigger>Command</AccordionTrigger>
                    <AccordionContent>
                      {editablePreviewData.command ? (
                        <div className="flex items-center gap-2">
                          <Input
                            value={editablePreviewData.command}
                            onChange={(e) => handleEditValue(['command'], e.target.value)}
                            className="font-mono text-sm"
                          />
                          <Button 
                            size="sm" 
                            variant="outline" 
                            onClick={() => handleRedactValue(['command'])}
                          >
                            Redact
                          </Button>
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground">No command specified</p>
                      )}
                    </AccordionContent>
                  </AccordionItem>
                  
                  <AccordionItem value="args">
                    <AccordionTrigger>Arguments</AccordionTrigger>
                    <AccordionContent>
                      {editablePreviewData.args && editablePreviewData.args.length > 0 ? (
                        <div className="space-y-2">
                          {editablePreviewData.args.map((arg: string, i: number) => (
                            <div key={i} className="flex items-center gap-2">
                              <Input
                                value={arg}
                                onChange={(e) => handleEditValue(['args', i.toString()], e.target.value)}
                                className="font-mono text-sm"
                              />
                              <Button 
                                size="sm" 
                                variant="outline" 
                                onClick={() => handleRedactValue(['args', i.toString()])}
                              >
                                Redact
                              </Button>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground">No arguments specified</p>
                      )}
                    </AccordionContent>
                  </AccordionItem>
                  
                  <AccordionItem value="env">
                    <AccordionTrigger>Environment Variables</AccordionTrigger>
                    <AccordionContent>
                      {editablePreviewData.env && Object.keys(editablePreviewData.env).length > 0 ? (
                        <div className="space-y-2">
                          {Object.entries(editablePreviewData.env).map(([key, value]: [string, any]) => (
                            <div key={key} className="grid grid-cols-[1fr,2fr,auto] gap-2 items-center">
                              <div className="font-mono text-sm">{key}</div>
                              <Input
                                value={value as string}
                                onChange={(e) => handleEditValue(['env', key], e.target.value)}
                                className="font-mono text-sm"
                              />
                              <Button 
                                size="sm" 
                                variant="outline" 
                                onClick={() => handleRedactValue(['env', key])}
                              >
                                Redact
                              </Button>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground">No environment variables</p>
                      )}
                    </AccordionContent>
                  </AccordionItem>
                  
                  {editablePreviewData.url && (
                    <AccordionItem value="url">
                      <AccordionTrigger>URL</AccordionTrigger>
                      <AccordionContent>
                        <div className="flex items-center gap-2">
                          <Input
                            value={editablePreviewData.url}
                            onChange={(e) => handleEditValue(['url'], e.target.value)}
                            className="font-mono text-sm"
                          />
                          <Button 
                            size="sm" 
                            variant="outline" 
                            onClick={() => handleRedactValue(['url'])}
                          >
                            Redact
                          </Button>
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  )}
                </>
              )}
            </Accordion>
          </div>
        ) : (
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="title">Title</Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Title for the shared server"
                autoFocus
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional description"
                rows={3}
              />
            </div>
            <div className="flex items-center justify-between space-x-2">
              <Label htmlFor="isPublic" className="text-sm font-medium">
                Make public
              </Label>
              <Switch
                id="isPublic"
                checked={isPublic}
                onCheckedChange={setIsPublic}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              {isPublic
                ? 'Anyone who visits your profile will be able to see this server'
                : 'Only you will be able to see this server on your profile'}
            </p>

            <div className="bg-amber-50 dark:bg-amber-950 p-3 rounded-md mt-2 space-y-2">
              <p className="text-xs text-amber-800 dark:text-amber-300 font-medium">
                Security Information
              </p>
              <p className="text-xs text-amber-800 dark:text-amber-300">
                When sharing, we automatically create a sanitized template of your server with:
              </p>
              <ul className="text-xs text-amber-800 dark:text-amber-300 list-disc pl-4 space-y-1">
                <li>Passwords in connection strings replaced with placeholders</li>
                <li>Sensitive environment variables protected</li>
                <li>API keys and tokens removed</li>
              </ul>
              <p className="text-xs text-amber-800 dark:text-amber-300 italic">
                See our <a href="/docs/sharing-mcp-servers" target="_blank" rel="noopener noreferrer" className="underline">security documentation</a> for more details.
              </p>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="w-full mt-2"
                onClick={handleShowPreview}
                disabled={isLoadingPreview}
              >
                <Eye className="h-4 w-4 mr-2" />
                {isLoadingPreview ? 'Loading Preview...' : 'Preview Shared Data'}
              </Button>
            </div>
          </div>
        )}
        
        <DialogFooter className={isShared ? "flex flex-col sm:flex-row gap-2 sm:justify-between" : ""}>
          {isShared && (
            <Button
              type="button"
              variant="destructive"
              onClick={handleUnshare}
              disabled={isSubmitting}
              className="w-full sm:w-auto"
            >
              {isSubmitting ? 'Processing...' : 'Unshare Server'}
            </Button>
          )}
          <div className="flex gap-2 w-full sm:w-auto justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            {!showPreview ? (
              <Button
                type="button"
                onClick={handleShare}
                disabled={isSubmitting}
              >
                {isSubmitting ? 'Processing...' : (isShared ? 'Update' : 'Share Server')}
              </Button>
            ) : (
              <Button
                type="button"
                onClick={handleShare}
                disabled={isSubmitting}
              >
                {isSubmitting ? 'Processing...' : (isShared ? 'Update' : 'Confirm & Share')}
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
} 