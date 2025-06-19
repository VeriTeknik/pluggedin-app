'use client';

import { CheckCircle, FileText, Loader2, X, XCircle } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { useUploadProgress } from '@/contexts/UploadProgressContext';

export function UploadProgressToast() {
  const { uploads, removeUpload } = useUploadProgress();
  const router = useRouter();
  const pathname = usePathname();

  // Don't show toast on library page since it has detailed progress view
  if (pathname === '/library') {
    return null;
  }

  // Only show processing uploads in the toast
  const processingUploads = uploads.filter(upload => upload.status === 'processing');
  const recentCompleted = uploads.filter(upload => 
    upload.status !== 'processing' && 
    Date.now() - upload.created_at.getTime() < 30000 // Show for 30 seconds after completion
  );

  const displayUploads = [...processingUploads, ...recentCompleted];

  if (displayUploads.length === 0) {
    return null;
  }

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const getOverallProgress = (upload: typeof displayUploads[0]) => {
    const stepProgress = (upload.progress.current - 1) / upload.progress.total * 100;
    const currentStepProgress = upload.progress.step_progress?.percentage ? 
      upload.progress.step_progress.percentage / upload.progress.total : 0;
    return Math.min(100, stepProgress + currentStepProgress);
  };

  const getStatusIcon = (upload: typeof displayUploads[0]) => {
    switch (upload.status) {
      case 'processing':
        return <Loader2 className="h-4 w-4 animate-spin text-blue-500" />;
      case 'completed':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'failed':
        return <XCircle className="h-4 w-4 text-red-500" />;
      default:
        return <FileText className="h-4 w-4 text-gray-500" />;
    }
  };

  const handleViewDetails = () => {
    router.push('/library');
  };

  return (
    <div className="fixed bottom-4 right-4 z-50 space-y-2 w-96 max-w-[calc(100vw-2rem)]">
      {displayUploads.map((upload) => (
        <Card key={upload.upload_id} className="shadow-lg border bg-white">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2 min-w-0 flex-1">
                {getStatusIcon(upload)}
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium truncate">
                    {upload.file_name}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {formatFileSize(upload.file_size)}
                  </div>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0 flex-shrink-0"
                onClick={() => removeUpload(upload.upload_id)}
              >
                <X className="h-3 w-3" />
              </Button>
            </div>

            {upload.status === 'processing' && (
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-xs text-muted-foreground">
                    Step {upload.progress.current} of {upload.progress.total}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {getOverallProgress(upload).toFixed(0)}%
                  </span>
                </div>
                <Progress value={getOverallProgress(upload)} className="h-1.5" />
                <div className="text-xs text-muted-foreground truncate">
                  {upload.message}
                </div>
              </div>
            )}

            {upload.status === 'completed' && (
              <div className="text-xs text-green-600">
                ✓ Processing complete
              </div>
            )}

            {upload.status === 'failed' && (
              <div className="text-xs text-red-600">
                ✗ Processing failed
              </div>
            )}

            {displayUploads.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                className="w-full mt-2 h-7 text-xs"
                onClick={handleViewDetails}
              >
                View Details
              </Button>
            )}
          </CardContent>
        </Card>
      ))}

      {/* Summary when multiple uploads */}
      {displayUploads.length > 1 && (
        <Card className="shadow-lg border bg-white">
          <CardContent className="p-3">
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium">
                {processingUploads.length > 0 
                  ? `${processingUploads.length} uploads processing`
                  : `${recentCompleted.length} uploads completed`
                }
              </div>
              <Button
                variant="outline"
                size="sm"
                className="h-6 text-xs px-2"
                onClick={handleViewDetails}
              >
                View All
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
} 