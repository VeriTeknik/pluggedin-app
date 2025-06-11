'use client';

import { AlertTriangle, Upload } from 'lucide-react';
import { useCallback, useMemo } from 'react';
import { useDropzone } from 'react-dropzone';

import { Alert, AlertDescription } from '@/components/ui/alert';
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
import { Progress } from '@/components/ui/progress';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

// 100 MB workspace storage limit
const STORAGE_LIMIT = 100 * 1024 * 1024;

export interface UploadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  form: { 
    name: string; 
    description: string; 
    tags: string; 
    file: File | null;
  };
  setForm: React.Dispatch<React.SetStateAction<{
    name: string; 
    description: string; 
    tags: string; 
    file: File | null;
  }>>;
  isUploading: boolean;
  onUpload: () => Promise<void>;
  formatFileSize: (bytes: number) => string;
  storageUsage?: number;
}

export function UploadDialog({
  open,
  onOpenChange,
  form,
  setForm,
  isUploading,
  onUpload,
  formatFileSize,
  storageUsage = 0,
}: UploadDialogProps) {
  // Calculate storage warnings
  const storageInfo = useMemo(() => {
    const currentUsage = storageUsage;
    const fileSize = form.file?.size || 0;
    const projectedUsage = currentUsage + fileSize;
    const usagePercentage = (currentUsage / STORAGE_LIMIT) * 100;
    const projectedPercentage = (projectedUsage / STORAGE_LIMIT) * 100;
    
    const wouldExceedLimit = projectedUsage > STORAGE_LIMIT;
    const isNearLimit = usagePercentage >= 80;
    
    return {
      currentUsage,
      fileSize,
      projectedUsage,
      usagePercentage,
      projectedPercentage,
      wouldExceedLimit,
      isNearLimit,
    };
  }, [storageUsage, form.file?.size]);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (file) {
      setForm(prev => ({
        ...prev,
        file,
        name: prev.name || file.name.split('.')[0],
      }));
    }
  }, [setForm]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    multiple: false,
    maxSize: 10 * 1024 * 1024, // 10MB limit per file
    accept: {
      'application/pdf': ['.pdf'],
      'text/plain': ['.txt'],
      'text/markdown': ['.md'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
      'image/*': ['.jpg', '.jpeg', '.png', '.gif'],
    }
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button>
          <Upload className="mr-2 h-4 w-4" />
          Upload Document
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Upload Document</DialogTitle>
          <DialogDescription>
            Upload a new document to your collection (Workspace limit: {formatFileSize(STORAGE_LIMIT)})
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {/* Storage Usage Info */}
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>Current Usage:</span>
              <span>{formatFileSize(storageInfo.currentUsage)} / {formatFileSize(STORAGE_LIMIT)}</span>
            </div>
            <Progress 
              value={storageInfo.usagePercentage} 
              className="h-2"
            />
            <div className="text-xs text-muted-foreground">
              {storageInfo.usagePercentage.toFixed(1)}% of workspace storage used
            </div>
          </div>

          {/* Storage Warnings */}
          {storageInfo.wouldExceedLimit && form.file && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                This file ({formatFileSize(storageInfo.fileSize)}) would exceed your workspace storage limit. 
                Current usage: {formatFileSize(storageInfo.currentUsage)}.
                Please delete some documents or choose a smaller file.
              </AlertDescription>
            </Alert>
          )}

          {storageInfo.isNearLimit && !storageInfo.wouldExceedLimit && form.file && (
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                Warning: You&apos;re approaching your storage limit. 
                After uploading this file, you&apos;ll have used {storageInfo.projectedPercentage.toFixed(1)}% of your workspace storage.
              </AlertDescription>
            </Alert>
          )}

          {/* File Drop Zone */}
          <div
            {...getRootProps()}
            className={cn(
              "border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors",
              isDragActive 
                ? 'border-primary bg-primary/5' 
                : 'border-muted-foreground/25 hover:border-primary/50',
              storageInfo.wouldExceedLimit && 'border-destructive bg-destructive/5'
            )}
          >
            <input {...getInputProps()} />
            <Upload className="mx-auto h-8 w-8 text-muted-foreground mb-2" />
            {form.file ? (
              <div>
                <p className="font-medium">{form.file.name}</p>
                <p className="text-sm text-muted-foreground">
                  {formatFileSize(form.file.size)}
                </p>
                {storageInfo.wouldExceedLimit && (
                  <p className="text-sm text-destructive mt-1">
                    File too large for remaining storage
                  </p>
                )}
              </div>
            ) : (
              <div>
                <p className="text-sm font-medium">
                  {isDragActive ? 'Drop the file here' : 'Click to select or drag and drop'}
                </p>
                <p className="text-xs text-muted-foreground">
                  PDF, TXT, MD, DOCX, Images (max 10MB per file)
                </p>
              </div>
            )}
          </div>

          {/* Form Fields */}
          <div className="space-y-3">
            <div>
              <Label htmlFor="name">Document Name</Label>
              <Input
                id="name"
                value={form.name}
                onChange={(e) => setForm(prev => ({ ...prev, name: e.target.value }))}
                placeholder="Enter document name"
              />
            </div>
            <div>
              <Label htmlFor="description">Description (optional)</Label>
              <Textarea
                id="description"
                value={form.description}
                onChange={(e) => setForm(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Enter document description"
                rows={2}
              />
            </div>
            <div>
              <Label htmlFor="tags">Tags (optional)</Label>
              <Input
                id="tags"
                value={form.tags}
                onChange={(e) => setForm(prev => ({ ...prev, tags: e.target.value }))}
                placeholder="Enter tags separated by commas"
              />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button 
            variant="outline" 
            onClick={() => onOpenChange(false)}
            disabled={isUploading}
          >
            Cancel
          </Button>
          <Button 
            onClick={onUpload} 
            disabled={!form.file || !form.name || isUploading || storageInfo.wouldExceedLimit}
          >
            {isUploading ? 'Uploading...' : 'Upload Document'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
} 