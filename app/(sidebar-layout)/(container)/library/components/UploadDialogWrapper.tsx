'use client';

import dynamic from 'next/dynamic';
import { Loader2 } from 'lucide-react';
import type { UploadDialogProps } from './UploadDialog';

// Dynamically import the UploadDialog to prevent hanging
const UploadDialog = dynamic<UploadDialogProps>(
  () => import('./UploadDialog').then(mod => ({ default: mod.UploadDialog })),
  {
    loading: () => (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
        <div className="bg-background rounded-lg p-6 shadow-lg">
          <div className="flex items-center gap-2">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span>Loading upload dialog...</span>
          </div>
        </div>
      </div>
    ),
    ssr: false
  }
);

// Export a wrapper component that passes through all props
export function UploadDialogWrapper(props: UploadDialogProps) {
  return <UploadDialog {...props} />;
}