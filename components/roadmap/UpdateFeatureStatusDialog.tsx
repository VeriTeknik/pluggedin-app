'use client';

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { updateFeatureStatus } from '@/app/actions/roadmap';
import { FeatureRequestStatus } from '@/db/schema';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';

interface UpdateFeatureStatusDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  featureRequestUuid: string;
  currentStatus: FeatureRequestStatus;
  featureTitle: string;
  onStatusUpdated?: () => void;
}

export function UpdateFeatureStatusDialog({
  open,
  onOpenChange,
  featureRequestUuid,
  currentStatus,
  featureTitle,
  onStatusUpdated,
}: UpdateFeatureStatusDialogProps) {
  const { t } = useTranslation('roadmap');
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    status: currentStatus,
    priority: 3, // Default priority
    declinedReason: '',
  });

  // Reset form when dialog opens with new feature
  useEffect(() => {
    if (open) {
      setFormData({
        status: currentStatus,
        priority: 3,
        declinedReason: '',
      });
    }
  }, [open, currentStatus]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const updateData: {
        featureRequestUuid: string;
        status: FeatureRequestStatus;
        priority?: number;
        declinedReason?: string;
      } = {
        featureRequestUuid,
        status: formData.status,
      };

      // Include priority only if status is ACCEPTED
      if (formData.status === FeatureRequestStatus.ACCEPTED) {
        updateData.priority = formData.priority;
      }

      // Include declined reason only if status is DECLINED
      if (formData.status === FeatureRequestStatus.DECLINED && formData.declinedReason) {
        updateData.declinedReason = formData.declinedReason;
      }

      const result = await updateFeatureStatus(updateData);

      if (result.success) {
        toast({
          title: t('admin.statusUpdated'),
          description: t('admin.statusUpdatedDescription', { title: featureTitle }),
        });
        onOpenChange(false);
        onStatusUpdated?.();
      } else {
        toast({
          title: t('errors.updateFailed'),
          description: result.error,
          variant: 'destructive',
        });
      }
    } catch (error) {
      toast({
        title: t('errors.updateFailed'),
        description: 'An unexpected error occurred',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const statuses = Object.values(FeatureRequestStatus);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{t('admin.updateStatus')}</DialogTitle>
            <DialogDescription>
              {t('admin.updateStatusDescription', { title: featureTitle })}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="status">{t('admin.statusLabel')}</Label>
              <Select
                value={formData.status}
                onValueChange={(value) =>
                  setFormData({
                    ...formData,
                    status: value as FeatureRequestStatus,
                  })
                }
              >
                <SelectTrigger id="status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {statuses.map((status) => (
                    <SelectItem key={status} value={status}>
                      {t(`status.${status}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Show priority selector only for ACCEPTED status */}
            {formData.status === FeatureRequestStatus.ACCEPTED && (
              <div className="grid gap-2">
                <Label htmlFor="priority">{t('admin.priorityLabel')}</Label>
                <Select
                  value={formData.priority.toString()}
                  onValueChange={(value) =>
                    setFormData({
                      ...formData,
                      priority: parseInt(value),
                    })
                  }
                >
                  <SelectTrigger id="priority">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[1, 2, 3, 4, 5].map((priority) => (
                      <SelectItem key={priority} value={priority.toString()}>
                        {t('admin.priorityValue', { priority })}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {t('admin.priorityHelp')}
                </p>
              </div>
            )}

            {/* Show declined reason only for DECLINED status */}
            {formData.status === FeatureRequestStatus.DECLINED && (
              <div className="grid gap-2">
                <Label htmlFor="declinedReason">{t('admin.declinedReasonLabel')}</Label>
                <Textarea
                  id="declinedReason"
                  placeholder={t('admin.declinedReasonPlaceholder')}
                  value={formData.declinedReason}
                  onChange={(e) =>
                    setFormData({ ...formData, declinedReason: e.target.value })
                  }
                  maxLength={500}
                  rows={4}
                />
                <p className="text-xs text-muted-foreground">
                  {formData.declinedReason.length}/500 • {t('admin.declinedReasonHelp')}
                </p>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              {t('form.cancel')}
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? t('form.updating') : t('admin.updateButton')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
