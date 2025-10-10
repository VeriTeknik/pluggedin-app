'use client';

import { Plus } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { createFeatureRequest } from '@/app/actions/roadmap';
import { FeatureRequestCategory } from '@/db/schema';
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
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';

interface CreateFeatureDialogProps {
  onFeatureCreated?: () => void;
}

export function CreateFeatureDialog({ onFeatureCreated }: CreateFeatureDialogProps) {
  const { t } = useTranslation('roadmap');
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    category: FeatureRequestCategory.OTHER,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validate title is not empty or whitespace
    const trimmedTitle = formData.title.trim();
    if (!trimmedTitle) {
      toast({
        title: t('errors.titleRequired'),
        description: t('errors.titleCannotBeEmpty'),
        variant: 'destructive',
      });
      return;
    }

    setIsSubmitting(true);

    try {
      const result = await createFeatureRequest({
        ...formData,
        title: trimmedTitle,
        description: formData.description.trim(),
      });

      if (result.success) {
        toast({
          title: t('notifications.featureCreated'),
          description: t('form.submit'),
        });
        setOpen(false);
        setFormData({
          title: '',
          description: '',
          category: FeatureRequestCategory.OTHER,
        });
        onFeatureCreated?.();
      } else {
        toast({
          title: t('errors.createFailed'),
          description: result.error,
          variant: 'destructive',
        });
      }
    } catch (error) {
      toast({
        title: t('errors.createFailed'),
        description: 'An unexpected error occurred',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const categories = Object.values(FeatureRequestCategory);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-2">
          <Plus className="h-4 w-4" />
          {t('createFeatureButton')}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[600px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{t('createFeature')}</DialogTitle>
            <DialogDescription>
              {t('description')}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="title">{t('form.title')}</Label>
              <Input
                id="title"
                placeholder={t('form.titlePlaceholder')}
                value={formData.title}
                onChange={(e) =>
                  setFormData({ ...formData, title: e.target.value })
                }
                maxLength={100}
                required
              />
              <p className="text-xs text-muted-foreground">
                {formData.title.length}/100
              </p>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="category">{t('form.category')}</Label>
              <Select
                value={formData.category}
                onValueChange={(value) =>
                  setFormData({
                    ...formData,
                    category: value as FeatureRequestCategory,
                  })
                }
              >
                <SelectTrigger id="category">
                  <SelectValue placeholder={t('form.selectCategory')} />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((category) => (
                    <SelectItem key={category} value={category}>
                      {t(`categories.${category}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="description">{t('form.description')}</Label>
              <Textarea
                id="description"
                placeholder={t('form.descriptionPlaceholder')}
                value={formData.description}
                onChange={(e) =>
                  setFormData({ ...formData, description: e.target.value })
                }
                maxLength={2000}
                rows={6}
              />
              <p className="text-xs text-muted-foreground">
                {formData.description.length}/2000
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
            >
              {t('form.cancel')}
            </Button>
            <Button type="submit" disabled={isSubmitting || !formData.title}>
              {isSubmitting ? t('form.updating') : t('form.submit')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
