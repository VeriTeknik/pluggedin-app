'use client';

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
import { Doc } from '@/types/library';

export interface DeleteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  doc: Doc | null;
  onConfirm: () => Promise<void>;
  isDeleting?: boolean;
}

export function DeleteDialog({
  open,
  onOpenChange,
  doc,
  onConfirm,
  isDeleting = false,
}: DeleteDialogProps) {
  const { t } = useTranslation('library');
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{t('deleteDialog.title')}</DialogTitle>
          <DialogDescription>
            {t('deleteDialog.description', { name: doc?.name })}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button 
            variant="outline" 
            onClick={() => onOpenChange(false)}
            disabled={isDeleting}
          >
            {t('deleteDialog.cancel')}
          </Button>
          <Button 
            variant="destructive" 
            onClick={onConfirm}
            disabled={isDeleting}
          >
            {isDeleting ? t('deleteDialog.deleting') : t('deleteDialog.delete')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
} 