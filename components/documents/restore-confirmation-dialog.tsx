'use client';

import { AlertTriangle, FileText } from 'lucide-react';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface RestoreConfirmationDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  documentName: string;
  versionNumber: number;
  currentVersion: number;
}

export function RestoreConfirmationDialog({
  isOpen,
  onClose,
  onConfirm,
  documentName,
  versionNumber,
  currentVersion,
}: RestoreConfirmationDialogProps) {
  return (
    <AlertDialog open={isOpen} onOpenChange={onClose}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-yellow-500" />
            Restore Previous Version?
          </AlertDialogTitle>
          <AlertDialogDescription className="space-y-3">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              <span className="font-medium">{documentName}</span>
            </div>

            <p>
              You are about to restore version {versionNumber} and make it the current version.
            </p>

            <div className="bg-muted p-3 rounded-md space-y-1">
              <p className="text-sm">This action will:</p>
              <ul className="text-sm list-disc list-inside space-y-1">
                <li>Create a new version ({currentVersion + 1}) with the content from version {versionNumber}</li>
                <li>Preserve the current version ({currentVersion}) in the version history</li>
                <li>Update the main document to use the restored content</li>
              </ul>
            </div>

            <p className="text-sm text-muted-foreground">
              This action cannot be undone directly, but all versions remain in the history.
            </p>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>
            Restore Version {versionNumber}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}