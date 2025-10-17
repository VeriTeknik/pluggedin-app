'use client';

import { Copy, Eye, EyeOff, Key, Settings, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { formatDistanceToNow } from 'date-fns';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ApiKey } from '@/types/api-key';

interface ApiKeyCardProps {
  apiKey: ApiKey;
  revealed: boolean;
  onReveal: () => void;
  onCopy: () => void;
  onEdit: () => void;
  onDelete: () => void;
  maskApiKey: (key: string) => string;
}

export function ApiKeyCard({
  apiKey,
  revealed,
  onReveal,
  onCopy,
  onEdit,
  onDelete,
  maskApiKey,
}: ApiKeyCardProps) {
  const { t } = useTranslation();

  return (
    <Card>
      <CardHeader>
        <div className='flex items-start justify-between'>
          <div className='space-y-1'>
            <CardTitle className='text-lg flex items-center gap-2'>
              <Key className='h-4 w-4' />
              {apiKey.name}
            </CardTitle>
            {apiKey.description && (
              <CardDescription>{apiKey.description}</CardDescription>
            )}
          </div>
          <div className='flex items-center gap-2'>
            {!apiKey.is_active && (
              <Badge variant='secondary'>{t('apiKeys.status.inactive', 'Inactive')}</Badge>
            )}
            {apiKey.expires_at && new Date(apiKey.expires_at) < new Date() && (
              <Badge variant='destructive'>{t('apiKeys.status.expired', 'Expired')}</Badge>
            )}
            {apiKey.project_uuid && !apiKey.project && (
              <Badge variant='outline'>
                {t('apiKeys.status.projectDeleted', 'Project deleted')}
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className='space-y-4'>
        <div className='flex items-center gap-2 bg-muted p-3 rounded-lg'>
          <code className='flex-1 font-mono text-sm'>
            {revealed ? apiKey.api_key : maskApiKey(apiKey.api_key)}
          </code>
          <Button
            variant='ghost'
            size='icon'
            onClick={onReveal}
            title={
              revealed
                ? t('apiKeys.actions.hide')
                : t('apiKeys.actions.show')
            }>
            {revealed ? (
              <EyeOff className='h-4 w-4' />
            ) : (
              <Eye className='h-4 w-4' />
            )}
          </Button>
          <Button
            variant='ghost'
            size='icon'
            onClick={onCopy}
            title={t('apiKeys.actions.copy')}>
            <Copy className='h-4 w-4' />
          </Button>
          <Button
            variant='ghost'
            size='icon'
            onClick={onEdit}
            title={t('apiKeys.actions.edit', 'Edit')}>
            <Settings className='h-4 w-4' />
          </Button>
          <Button
            variant='ghost'
            size='icon'
            onClick={onDelete}
            title={t('apiKeys.actions.delete')}>
            <Trash2 className='h-4 w-4 text-destructive' />
          </Button>
        </div>

        <div className='grid grid-cols-2 gap-4 text-sm'>
          <div>
            <span className='text-muted-foreground'>{t('apiKeys.scope', 'Scope')}:</span>{' '}
            {apiKey.all_projects_access ? (
              <Badge>{t('apiKeys.scope.allProjects', 'All Projects')}</Badge>
            ) : apiKey.project_permissions?.length ? (
              <Badge variant='secondary'>
                {t('apiKeys.scope.specificProjects', '{{count}} Projects', {
                  count: apiKey.project_permissions.length,
                })}
              </Badge>
            ) : (
              <Badge variant='outline'>{t('apiKeys.scope.noProjects', 'No Projects')}</Badge>
            )}
          </div>
          <div>
            <span className='text-muted-foreground'>{t('apiKeys.usage', 'Usage')}:</span>{' '}
            {apiKey.usage_count || 0} {t('apiKeys.requests', 'requests')}
          </div>
          <div>
            <span className='text-muted-foreground'>{t('apiKeys.created', 'Created')}:</span>{' '}
            {formatDistanceToNow(new Date(apiKey.created_at), { addSuffix: true })}
          </div>
          <div>
            <span className='text-muted-foreground'>{t('apiKeys.lastUsed', 'Last used')}:</span>{' '}
            {apiKey.last_used_at
              ? formatDistanceToNow(new Date(apiKey.last_used_at), { addSuffix: true })
              : t('apiKeys.neverUsed', 'Never')}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}