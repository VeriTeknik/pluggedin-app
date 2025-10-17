'use client';

import { useTranslation } from 'react-i18next';
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
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { ApiKey } from '@/types/api-key';
import { Project } from '@/types/project';

interface ApiKeyFormDialogProps {
  open: boolean;
  onClose: () => void;
  onSave: () => void;
  loading: boolean;
  projects: Project[];
  formValues: {
    editing: boolean;
    name: string;
    description: string;
    scope: 'all_projects' | 'specific_projects';
    selectedProjects: string[];
  };
  onChange: (field: string, value: any) => void;
}

export function ApiKeyFormDialog({
  open,
  onClose,
  onSave,
  loading,
  projects,
  formValues,
  onChange,
}: ApiKeyFormDialogProps) {
  const { t } = useTranslation();

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) {
          onClose();
        }
      }}>
      <DialogContent className='max-w-2xl'>
        <DialogHeader>
          <DialogTitle>
            {formValues.editing
              ? t('apiKeys.dialog.edit.title', 'Edit API Key')
              : t('apiKeys.dialog.create.title')}
          </DialogTitle>
          <DialogDescription>
            {formValues.editing
              ? t('apiKeys.dialog.edit.description', 'Update API key settings and permissions')
              : t('apiKeys.dialog.create.description')}
          </DialogDescription>
        </DialogHeader>
        <div className='space-y-4 py-4'>
          <div className='space-y-2'>
            <Label htmlFor='name'>{t('apiKeys.dialog.create.nameLabel')}</Label>
            <Input
              id='name'
              placeholder={t('apiKeys.dialog.create.namePlaceholder')}
              value={formValues.name}
              onChange={(e) => onChange('name', e.target.value)}
            />
          </div>

          <div className='space-y-2'>
            <Label htmlFor='description'>
              {t('apiKeys.dialog.create.descriptionLabel', 'Description (optional)')}
            </Label>
            <Textarea
              id='description'
              placeholder={t('apiKeys.dialog.create.descriptionPlaceholder', 'Describe what this key is used for')}
              value={formValues.description}
              onChange={(e) => onChange('description', e.target.value)}
              rows={3}
            />
          </div>

          <div className='space-y-2'>
            <Label>{t('apiKeys.dialog.create.scopeLabel', 'Access Scope')}</Label>
            <RadioGroup value={formValues.scope} onValueChange={(value: any) => onChange('scope', value)}>
              <div className='flex items-center space-x-2'>
                <RadioGroupItem value='all_projects' id='all_projects' />
                <Label htmlFor='all_projects'>
                  {t('apiKeys.dialog.create.allProjectsLabel', 'All projects')}
                </Label>
              </div>
              <div className='flex items-center space-x-2'>
                <RadioGroupItem value='specific_projects' id='specific_projects' />
                <Label htmlFor='specific_projects'>
                  {t('apiKeys.dialog.create.specificProjectsLabel', 'Specific projects')}
                </Label>
              </div>
            </RadioGroup>
          </div>

          {formValues.scope === 'specific_projects' && projects && projects.length > 0 && (
            <div className='space-y-2'>
              <Label>{t('apiKeys.dialog.create.selectProjectsLabel', 'Select Projects')}</Label>
              <div className='space-y-2 max-h-48 overflow-y-auto border rounded-lg p-4'>
                {projects.map((project) => (
                  <div key={project.uuid} className='flex items-center space-x-2'>
                    <Checkbox
                      id={project.uuid}
                      checked={formValues.selectedProjects.includes(project.uuid)}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          onChange('selectedProjects', [...formValues.selectedProjects, project.uuid]);
                        } else {
                          onChange('selectedProjects',
                            formValues.selectedProjects.filter((id) => id !== project.uuid)
                          );
                        }
                      }}
                    />
                    <Label htmlFor={project.uuid} className='font-normal cursor-pointer'>
                      {project.name}
                    </Label>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button
            variant='outline'
            onClick={onClose}>
            {t('apiKeys.actions.cancel')}
          </Button>
          <Button
            onClick={onSave}
            disabled={loading}>
            {loading
              ? t('apiKeys.actions.saving', 'Saving...')
              : formValues.editing
              ? t('apiKeys.actions.save', 'Save Changes')
              : t('apiKeys.actions.create')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}