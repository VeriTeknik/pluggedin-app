'use client';

import { formatDistanceToNow } from 'date-fns';
import { enUS, hi, ja, nl, tr, zhCN } from 'date-fns/locale';
import { useTranslation } from 'react-i18next';

import type { NotificationMetadata, CompletedVia } from '@/lib/types/notifications';

interface NotificationMetadataDisplayProps {
  metadata?: NotificationMetadata;
  compact?: boolean;
  className?: string;
}

export function NotificationMetadataDisplay({ 
  metadata, 
  compact = false,
  className = '' 
}: NotificationMetadataDisplayProps) {
  const { t, i18n } = useTranslation('notifications');

  if (!metadata) return null;

  // Get date locale based on current language
  const getDateLocale = () => {
    switch (i18n.language) {
      case 'tr': return tr;
      case 'nl': return nl;
      case 'zh': return zhCN;
      case 'ja': return ja;
      case 'hi': return hi;
      default: return enUS;
    }
  };

  // Format source information
  const formatSource = () => {
    if (!metadata.source) return null;
    
    const { type, mcpServer, apiKeyName } = metadata.source;
    
    switch (type) {
      case 'mcp':
        return mcpServer ? t('notifications.metadata.source.mcp', { server: mcpServer }) : null;
      case 'api':
        return apiKeyName ? t('notifications.metadata.source.api', { key: apiKeyName }) : null;
      case 'system':
        return t('notifications.metadata.source.system');
      case 'user':
        return t('notifications.metadata.source.user');
      default:
        return null;
    }
  };

  // Format action information
  const formatAction = () => {
    if (!metadata.actions) return null;
    
    const { completedAt, completedVia, markedReadAt } = metadata.actions;
    
    if (completedAt && completedVia) {
      const time = formatDistanceToNow(new Date(completedAt), { 
        addSuffix: true, 
        locale: getDateLocale() 
      });
      
      if (compact) {
        return t('notifications.metadata.actions.completed', { time });
      }
      
      // Map completion methods to translation keys
      const methodTranslationKeys: Record<CompletedVia, string> = {
        mcp: 'notifications.metadata.actions.method.mcp',
        web: 'notifications.metadata.actions.method.web',
        api: 'notifications.metadata.actions.method.api',
      };

      const methodKey = methodTranslationKeys[completedVia] || completedVia;

      return t('notifications.metadata.actions.completedVia', { 
        method: t(methodKey),
        time 
      });
    }
    
    if (markedReadAt) {
      const time = formatDistanceToNow(new Date(markedReadAt), { 
        addSuffix: true, 
        locale: getDateLocale() 
      });
      return t('notifications.metadata.actions.markedRead', { time });
    }
    
    return null;
  };

  const source = formatSource();
  const action = formatAction();

  if (!source && !action) return null;

  // Compact format for notification bell
  if (compact) {
    const parts = [];
    if (source) parts.push(t('notifications.metadata.source.via', { source }));
    if (action) parts.push(action);
    
    return (
      <span className={`text-xs text-muted-foreground ${className}`}>
        {parts.join(' • ')}
      </span>
    );
  }

  // Full format for notifications page
  return (
    <div className={`flex items-center justify-between text-xs text-muted-foreground mt-2 ${className}`}>
      <span>
        {source && t('notifications.metadata.source.via', { source })}
      </span>
      <span>
        {action}
      </span>
    </div>
  );
}