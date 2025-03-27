'use client';

import { Zap } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

interface ServerHeroProps {
  onAddServer: () => void;
}

export function ServerHero({ onAddServer }: ServerHeroProps) {
  const { t } = useTranslation();
  return (
    <div className="bg-gradient-to-r from-indigo-500/5 via-indigo-500/10 to-purple-500/10 dark:from-indigo-950/20 dark:via-indigo-900/20 dark:to-purple-900/20 p-6 rounded-lg border dark:border-slate-800">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-2">
          <Badge className="bg-indigo-500/10 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800 mb-2">
            {t('mcpServers.title')}
          </Badge>
          <h1 className="text-3xl font-bold tracking-tight">{t('mcpServers.subtitle')}</h1>
          <p className="text-muted-foreground max-w-md">
            {t('mcpServers.description')}
          </p>
        </div>
        <div className="flex gap-3 mt-4 md:mt-0">
          <Button 
            onClick={onAddServer}
            className="bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700"
          >
            <Zap className="mr-2 h-4 w-4" />
            {t('mcpServers.actions.addServer')}
          </Button>
        </div>
      </div>
    </div>
  );
}
