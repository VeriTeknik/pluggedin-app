import { Download } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

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
import { useToast } from '@/hooks/use-toast';
import { SharedCollection } from '@/types/social';

interface ImportCollectionsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedCollections: SharedCollection[];
  onSuccess?: () => void;
}

export function ImportCollectionsDialog({
  open,
  onOpenChange,
  selectedCollections,
  onSuccess,
}: ImportCollectionsDialogProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [workspaceName, setWorkspaceName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleImport = async () => {
    if (!workspaceName.trim()) {
      toast({
        title: t('common.error'),
        description: t('collections.import.error.workspaceNameRequired'),
        variant: 'destructive',
      });
      return;
    }

    setIsSubmitting(true);
    try {
      // TODO: Implement the import functionality
      // This should:
      // 1. Create a new workspace if it doesn't exist
      // 2. Import all selected collections into the workspace
      // 3. Configure the servers from the collections

      toast({
        title: t('common.success'),
        description: t('collections.import.success'),
      });
      onSuccess?.();
      onOpenChange(false);
    } catch (error) {
      toast({
        title: t('common.error'),
        description: error instanceof Error ? error.message : t('collections.import.error.importFailed'),
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('collections.import.title')}</DialogTitle>
          <DialogDescription>
            {t('collections.import.description', { count: selectedCollections.length })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="workspace-name">{t('collections.import.form.workspaceName')}</Label>
            <Input
              id="workspace-name"
              value={workspaceName}
              onChange={(e) => setWorkspaceName(e.target.value)}
              placeholder={t('collections.import.form.workspaceNamePlaceholder')}
            />
          </div>

          <div className="space-y-2">
            <Label>{t('collections.import.form.selectedCollections')}</Label>
            <div className="space-y-2">
              {selectedCollections.map((collection) => (
                <div key={collection.uuid} className="text-sm">
                  {collection.title}
                </div>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
          >
            {t('common.cancel')}
          </Button>
          <Button
            onClick={handleImport}
            disabled={isSubmitting || selectedCollections.length === 0}
          >
            <Download className="mr-2 h-4 w-4" />
            {isSubmitting
              ? t('collections.import.importing')
              : t('collections.import.import')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
} 